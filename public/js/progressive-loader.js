/**
 * Progressive Loader — wraps async operations with timed message escalation.
 * Shows friendly escalating messages while DB cold starts resolve,
 * then shows a Retry button on failure for user-initiated retry.
 */

const DEFAULTS = {
  maxRetries: 0,
  backoff: [1000],
  timeout: 15000,
};

/**
 * Adaptive warmup budget (CS53-6). The wall-clock deadline starts at
 * INITIAL_WARMUP_BUDGET_MS and is *extended* on each 503 received, up to
 * MAX_WARMUP_BUDGET_MS. This lets a typical Azure SQL serverless cold
 * start (60–120s) complete inside one client cycle without surfacing
 * the Retry button, while still bounding the total wait so a truly
 * down DB does eventually fall through to the retry-button path.
 */
const INITIAL_WARMUP_BUDGET_MS = 30000;   // unchanged for warm-DB UX
const MAX_WARMUP_BUDGET_MS     = 120000;  // hard ceiling (Azure cold-start p99)
const EXTENSION_PER_503_MS     = 15000;   // headroom added per server 503
const MIN_EXTENSION_MS         =  5000;   // floor — always make progress
const MAX_SLEEP_MS             =  8000;   // existing ceiling per attempt
const JITTER_FRAC              = 0.20;    // ±20% on sleep to desync parallel callers
const WARMUP_TELEMETRY_EVENT = 'progressiveLoader.warmupExhausted';
const WARMUP_TELEMETRY_ENDPOINT = '/api/telemetry/ux-events';

/**
 * Typed error for retryable 503 responses.
 * Thrown by fetchFn call sites when the server returns 503 with a retry signal.
 */
export class RetryableError extends Error {
  /**
   * @param {string} message
   * @param {number} retryAfterMs - raw retry delay in ms (clamped at the loader, not here)
   */
  constructor(message, retryAfterMs) {
    super(message);
    this.name = 'RetryableError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Typed error for *permanent* 503 responses where retrying is futile
 * (e.g., Azure SQL Free Tier monthly capacity exhausted; CS53 Bug B).
 * Server signals this with a 503 body containing `unavailable: true`
 * and NO Retry-After header.
 *
 * The loader catches this and renders an informational banner instead
 * of cycling the warmup messages forever.
 */
export class UnavailableError extends Error {
  /**
   * @param {string} message - human-readable explanation to display
   * @param {string} [reason] - stable machine-readable reason code
   */
  constructor(message, reason) {
    super(message);
    this.name = 'UnavailableError';
    this.reason = reason || 'unavailable';
  }
}

/**
 * Run an async fetch with timed message escalation and user-initiated retry.
 *
 * @param {Function} fetchFn - async function that receives an AbortSignal and returns data
 * @param {HTMLElement} containerEl - element to show messages in
 * @param {Array<{after: number, msg: string}>} messageSet - escalating messages
 * @param {Object} [options] - {maxRetries, backoff, timeout, onRetry}
 * @param {Function} [options.onRetry] - callback for retry button; if omitted, retries progressiveLoad directly
 * @param {'leaderboard'|'profile'|'achievements'|'community'} [options.screen] - telemetry screen key
 * @returns {Promise<any>} the fetch result, or null on final failure
 */
export async function progressiveLoad(fetchFn, containerEl, messageSet, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const { maxRetries, backoff, timeout, onRetry } = opts;
  let attempt = 0;

  // Show the first message immediately
  if (containerEl && messageSet.length > 0) {
    setMessage(containerEl, messageSet[0].msg);
  }

  // Track wall-clock start from first attempt for the warmup cap
  const warmupStart = Date.now();

  while (attempt <= maxRetries) {
    const escalationTimers = [];
    const requestTimers = [];

    try {
      // Start escalating messages (persist across retries — started once per attempt loop)
      startMessageEscalation(containerEl, messageSet, escalationTimers);

      // Run fetchFn with timeout via AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      requestTimers.push(timeoutId);

      const result = await fetchFn(controller.signal);

      // Success — clean up and return
      clearTimers(escalationTimers);
      clearTimers(requestTimers);
      clearMessage(containerEl);
      return result;
    } catch (err) {
      clearTimers(requestTimers);

      // RetryableError — enter the warmup auto-retry loop
      if (err instanceof RetryableError) {
        // Preserve escalation timers — they persist across retries
        const result = await retryLoop(fetchFn, containerEl, escalationTimers, err, timeout, onRetry, messageSet, options, warmupStart);
        return result;
      }

      // UnavailableError — server signalled permanent unavailability;
      // do not retry, render a banner instead (CS53 Bug B).
      if (err instanceof UnavailableError) {
        clearTimers(escalationTimers);
        showUnavailableBanner(containerEl, err.message);
        return null;
      }

      // AbortError terminates immediately (existing behavior)
      if (err && err.name === 'AbortError') {
        clearTimers(escalationTimers);
        const retryHandler = onRetry || (() => progressiveLoad(fetchFn, containerEl, messageSet, options));
        showRetryButton(containerEl, retryHandler);
        return null;
      }

      clearTimers(escalationTimers);

      attempt++;
      if (attempt > maxRetries) {
        // All retries exhausted — show retry button
        const retryHandler = onRetry || (() => progressiveLoad(fetchFn, containerEl, messageSet, options));
        showRetryButton(containerEl, retryHandler);
        return null;
      }

      // Wait with backoff before next attempt
      const delay = backoff[Math.min(attempt - 1, backoff.length - 1)];
      if (containerEl && messageSet.length > 0) {
        setMessage(containerEl, messageSet[0].msg);
      }
      await sleep(delay);
    }
  }

  return null;
}

/**
 * Auto-retry loop for RetryableError (503 with retry signal).
 * Message-escalation timers persist across retries. Each attempt gets a
 * fresh request-timeout timer bounded by the remaining warmup budget.
 *
 * Adaptive warmup budget (CS53-6): the wall-clock deadline starts at
 * INITIAL_WARMUP_BUDGET_MS and is extended per 503 by
 * clamp(retryAfterMs * 2, MIN_EXTENSION_MS, EXTENSION_PER_503_MS), capped
 * at MAX_WARMUP_BUDGET_MS. Sleeps follow a bounded backoff schedule
 * (2s, 4s, 6s, 8s, 8s, …) overridden by the server's Retry-After when
 * larger, then clamped to MAX_SLEEP_MS and ±JITTER_FRAC jitter.
 */
async function retryLoop(fetchFn, containerEl, escalationTimers, initialErr, timeout, onRetry, messageSet, options, warmupStart) {
  let lastErr = initialErr;
  // Initial 503 already received — extend budget once before the first sleep.
  let currentBudget = INITIAL_WARMUP_BUDGET_MS;
  currentBudget = extendBudget(currentBudget, lastErr.retryAfterMs);
  let deadline = warmupStart + currentBudget;
  // Sleep-schedule index for the next sleep: 1=2s, 2=4s, 3=6s, 4+=8s.
  let retryIdx = 1;
  let attempts = 0;
  const screen = options.screen || screenForMessageSet(messageSet);
  const emitExitTelemetry = (outcome) => {
    emitWarmupTelemetry({
      screen,
      attempts,
      totalWaitMs: Math.max(0, Math.round(Date.now() - warmupStart)),
      outcome,
    });
  };

  const bailOutToRetryButton = (outcome = 'cap-exhausted') => {
    clearTimers(escalationTimers);
    emitExitTelemetry(outcome);
    const retryHandler = onRetry || (() => progressiveLoad(fetchFn, containerEl, messageSet, options));
    showRetryButton(containerEl, retryHandler);
    return null;
  };

  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return bailOutToRetryButton('cap-exhausted');

    const baseSleep = baseSleepFor(retryIdx);
    const sleepMs = computeSleepMs(baseSleep, lastErr.retryAfterMs, remaining);
    await sleep(sleepMs);
    retryIdx++;

    // Re-check remaining after sleep
    const remainingAfterSleep = deadline - Date.now();
    if (remainingAfterSleep <= 0) return bailOutToRetryButton('cap-exhausted');

    const requestTimers = [];
    try {
      const controller = new AbortController();
      const effectiveTimeout = Math.min(timeout, remainingAfterSleep);
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
      requestTimers.push(timeoutId);

      attempts++;
      const result = await fetchFn(controller.signal);

      // Success
      clearTimers(requestTimers);
      clearTimers(escalationTimers);
      clearMessage(containerEl);
      emitExitTelemetry('success');
      return result;
    } catch (retryErr) {
      clearTimers(requestTimers);

      if (retryErr instanceof RetryableError) {
        lastErr = retryErr;
        // Extend the budget per 503 (capped), then loop.
        currentBudget = extendBudget(currentBudget, lastErr.retryAfterMs);
        deadline = warmupStart + currentBudget;
        continue;
      }

      // UnavailableError mid-retry-loop — bail out of warmup and show banner.
      if (retryErr instanceof UnavailableError) {
        clearTimers(escalationTimers);
        emitExitTelemetry('aborted');
        showUnavailableBanner(containerEl, retryErr.message);
        return null;
      }

      // AbortError or other non-retryable error — terminate
      return bailOutToRetryButton(Date.now() >= deadline ? 'cap-exhausted' : 'aborted');
    }
  }
}

/** Backoff schedule (ms) before the Nth retry attempt, capped at MAX_SLEEP_MS. */
function baseSleepFor(retryIdx) {
  const schedule = [2000, 4000, 6000, MAX_SLEEP_MS];
  return schedule[Math.min(retryIdx - 1, schedule.length - 1)];
}

/**
 * Compute the actual sleep for this attempt:
 *   - take max(baseSleep, retryAfterMs) so the server's hint wins when larger;
 *   - cap at MAX_SLEEP_MS;
 *   - apply ±JITTER_FRAC jitter to desync parallel callers;
 *   - re-clamp to MAX_SLEEP_MS so the documented ceiling holds even when
 *     jitter scales above 1.0;
 *   - clamp to the remaining budget so we never sleep past the deadline.
 */
function computeSleepMs(baseSleep, retryAfterMs, remaining) {
  const safeRetryAfter = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 0;
  let effective = Math.max(baseSleep, safeRetryAfter);
  effective = Math.min(MAX_SLEEP_MS, effective);
  // ±JITTER_FRAC jitter
  const jitter = 1 + ((Math.random() * 2 - 1) * JITTER_FRAC);
  effective = Math.round(effective * jitter);
  // Re-clamp after jitter so the per-attempt ceiling (MAX_SLEEP_MS) is
  // strictly honored even when jitter would otherwise push above it.
  effective = Math.min(MAX_SLEEP_MS, effective);
  // Clamp to remaining (always ≥0 here because caller checked)
  return Math.max(0, Math.min(effective, remaining));
}

/**
 * Extend the warmup budget by the per-503 increment.
 * extension = clamp(retryAfterMs * 2, MIN_EXTENSION_MS, EXTENSION_PER_503_MS).
 * Result is capped at MAX_WARMUP_BUDGET_MS.
 */
function extendBudget(currentBudget, retryAfterMs) {
  const safeRetryAfter = Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 0;
  const raw = safeRetryAfter * 2;
  const extension = Math.min(EXTENSION_PER_503_MS, Math.max(MIN_EXTENSION_MS, raw));
  return Math.min(MAX_WARMUP_BUDGET_MS, currentBudget + extension);
}

/** Message sets for each screen — escalate over 15s before timeout. */
export const MESSAGE_SETS = {
  leaderboard: [
    { after: 0, msg: 'Fetching the rankings...' },
    { after: 3000, msg: 'Tallying up everyone\'s scores...' },
    { after: 6000, msg: 'The leaderboard keeper is on a coffee break ☕' },
    { after: 10000, msg: 'Waking up the database — hang tight 😴' },
    { after: 20000, msg: 'Almost there — servers stretching their legs 🦵' },
    { after: 60000, msg: 'This is taking unusually long. The service may be experiencing issues.' },
  ],
  profile: [
    { after: 0, msg: 'Loading your profile...' },
    { after: 3000, msg: 'Gathering your stats...' },
    { after: 6000, msg: 'Polishing your achievements ✨' },
    { after: 10000, msg: 'Waking up the database — hang tight 😴' },
    { after: 20000, msg: 'Almost there — dusting off your trophy shelf 🏆' },
    { after: 60000, msg: 'This is taking unusually long. The service may be experiencing issues.' },
  ],
  achievements: [
    { after: 0, msg: 'Checking your trophy case...' },
    { after: 3000, msg: 'Polishing your badges... ✨' },
    { after: 6000, msg: 'Counting your wins 🏅' },
    { after: 10000, msg: 'Waking up the database — hang tight 😴' },
    { after: 20000, msg: 'Almost there — assembling the trophy wall 🎖️' },
    { after: 60000, msg: 'This is taking unusually long. The service may be experiencing issues.' },
  ],
  community: [
    { after: 0, msg: 'Loading community puzzles...' },
    { after: 3000, msg: 'Gathering submissions...' },
    { after: 6000, msg: 'Checking for fresh puzzles 🧩' },
    { after: 10000, msg: 'Waking up the database — hang tight 😴' },
    { after: 20000, msg: 'Almost there — unpacking the puzzle box 📦' },
    { after: 60000, msg: 'This is taking unusually long. The service may be experiencing issues.' },
  ],
};

/**
 * Score sync queue — saves scores to localStorage and syncs in the background.
 */
const SYNC_QUEUE_KEY = 'gwn_score_sync_queue';
const SYNC_BACKOFF = [1000, 3000, 9000];

/**
 * Queue a score for background sync to the server.
 * @param {Object} scoreData - the score payload
 * @returns {boolean} true if queued successfully, false if storage unavailable
 */
export function queueScoreForSync(scoreData) {
  try {
    const queue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
    queue.push({ ...scoreData, queuedAt: Date.now() });
    // Cap at 20 entries to prevent unbounded growth
    while (queue.length > 20) queue.shift();
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch {
    // Storage unavailable — score will only be submitted via direct POST
    return false;
  }
}

/**
 * Get all queued scores pending sync.
 * @returns {Array<Object>}
 */
export function getQueuedScores() {
  try {
    const queue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
}

/**
 * Remove the first N scores from the sync queue.
 * @param {number} count
 */
export function dequeueScores(count) {
  try {
    const queue = JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]');
    const remaining = Array.isArray(queue) ? queue.slice(count) : [];
    if (remaining.length > 0) {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remaining));
    } else {
      localStorage.removeItem(SYNC_QUEUE_KEY);
    }
  } catch {
    try { localStorage.removeItem(SYNC_QUEUE_KEY); } catch { /* ignore */ }
  }
}

/**
 * Submit queued scores with retry and backoff.
 * @param {Function} apiFetchFn - the apiFetch function to use
 * @param {Object} [callbacks] - { onSyncing, onSynced, onFailed }
 * @returns {Promise<void>}
 */
export async function syncQueuedScores(apiFetchFn, callbacks = {}) {
  const queue = getQueuedScores();
  if (queue.length === 0) return;

  if (callbacks.onSyncing) callbacks.onSyncing();

  let synced = 0;
  for (const entry of queue) {
    const scoreData = { ...entry };
    delete scoreData.queuedAt;
    let success = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await apiFetchFn('/api/scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scoreData),
        });
        if (res.ok || res.status === 409) {
          // 409 = duplicate, treat as synced
          success = true;
          break;
        }
        if (res.status === 401) {
          // Not logged in — stop trying
          if (callbacks.onFailed) callbacks.onFailed();
          return;
        }
      } catch {
        // Network error — backoff and retry
      }
      await sleep(SYNC_BACKOFF[Math.min(attempt, SYNC_BACKOFF.length - 1)]);
    }

    if (success) {
      synced++;
      dequeueScores(1);
    } else {
      // Failed after all retries — stop processing
      if (callbacks.onFailed) callbacks.onFailed();
      return;
    }
  }

  if (synced > 0 && callbacks.onSynced) callbacks.onSynced(synced);
}

// --- Internal helpers ---

function setMessage(el, msg) {
  if (!el) return;
  el.innerHTML = `<div class="progressive-message" role="status" aria-live="polite">${msg}<span class="progressive-ellipsis" aria-hidden="true"><span></span><span></span><span></span></span></div>`;
}

function clearMessage(el) {
  if (!el) return;
  const msgEl = el.querySelector('.progressive-message');
  if (msgEl) msgEl.remove();
}

function showRetryButton(el, onRetry) {
  if (!el) return;
  el.innerHTML = `<div class="progressive-message progressive-failed" role="status">
    <p>Taking longer than expected — please try again.</p>
    <button class="progressive-retry-btn" type="button">Retry</button>
  </div>`;
  const btn = el.querySelector('.progressive-retry-btn');
  if (btn) btn.addEventListener('click', onRetry);
}

/**
 * Render a non-retryable banner for permanent unavailability (CS53 Bug B).
 * No Retry button — retrying will not help until the underlying
 * condition clears (e.g., free-tier monthly renewal).
 */
function showUnavailableBanner(el, message) {
  if (!el) return;
  const text = message || 'This data is temporarily unavailable.';
  el.innerHTML = `<div class="progressive-message progressive-unavailable" role="alert" aria-live="assertive">
    <p>${escapeHtml(text)}</p>
    <p class="progressive-unavailable-hint">Please check back later.</p>
  </div>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function startMessageEscalation(el, messageSet, timers) {
  if (!el || !messageSet || messageSet.length === 0) return;

  for (const { after, msg } of messageSet) {
    if (after === 0) continue; // first message already shown
    const id = setTimeout(() => setMessage(el, msg), after);
    timers.push(id);
  }
}

function clearTimers(timers) {
  for (const id of timers) clearTimeout(id);
  timers.length = 0;
}

function screenForMessageSet(messageSet) {
  for (const [screen, set] of Object.entries(MESSAGE_SETS)) {
    if (set === messageSet) return screen;
  }
  return undefined;
}

export function emitWarmupTelemetry({ screen, attempts, totalWaitMs, outcome }) {
  if (!screen) return;

  const payload = {
    event: WARMUP_TELEMETRY_EVENT,
    screen,
    attempts,
    totalWaitMs,
    outcome,
  };
  const body = JSON.stringify(payload);

  try {
    if (
      typeof navigator !== 'undefined'
      && typeof navigator.sendBeacon === 'function'
      && typeof Blob === 'function'
    ) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(WARMUP_TELEMETRY_ENDPOINT, blob)) return;
    }
  } catch {
    // Fall back to keepalive fetch below.
  }

  try {
    if (typeof fetch === 'function') {
      void fetch(WARMUP_TELEMETRY_ENDPOINT, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body,
      }).catch(() => {});
    }
  } catch {
    // Telemetry is fire-and-forget; never throw into UI code.
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
