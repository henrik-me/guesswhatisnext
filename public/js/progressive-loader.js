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

/** Wall-clock cap for the 503 auto-retry warmup loop (ms). */
const WARMUP_CAP_MS = 30000;

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
 * Run an async fetch with timed message escalation and user-initiated retry.
 *
 * @param {Function} fetchFn - async function that receives an AbortSignal and returns data
 * @param {HTMLElement} containerEl - element to show messages in
 * @param {Array<{after: number, msg: string}>} messageSet - escalating messages
 * @param {Object} [options] - {maxRetries, backoff, timeout, onRetry}
 * @param {Function} [options.onRetry] - callback for retry button; if omitted, retries progressiveLoad directly
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
 * fresh request-timeout timer bounded by the remaining warmup cap.
 */
async function retryLoop(fetchFn, containerEl, escalationTimers, initialErr, timeout, onRetry, messageSet, options, warmupStart) {
  let lastErr = initialErr;

  while (true) {
    const elapsed = Date.now() - warmupStart;
    const remaining = WARMUP_CAP_MS - elapsed;

    if (remaining <= 0) {
      // Wall-clock cap exhausted — fall through to retry-button path
      clearTimers(escalationTimers);
      const retryHandler = onRetry || (() => progressiveLoad(fetchFn, containerEl, messageSet, options));
      showRetryButton(containerEl, retryHandler);
      return null;
    }

    // Sleep for the retry delay (clamped 2000–8000ms), but never past the warmup cap
    const retryDelay = Math.min(Math.max(2000, Math.min(8000, lastErr.retryAfterMs)), remaining);
    await sleep(retryDelay);

    // Re-check remaining after sleep
    const elapsedAfterSleep = Date.now() - warmupStart;
    const remainingAfterSleep = WARMUP_CAP_MS - elapsedAfterSleep;
    if (remainingAfterSleep <= 0) {
      clearTimers(escalationTimers);
      const retryHandler = onRetry || (() => progressiveLoad(fetchFn, containerEl, messageSet, options));
      showRetryButton(containerEl, retryHandler);
      return null;
    }

    const requestTimers = [];
    try {
      const controller = new AbortController();
      const effectiveTimeout = Math.min(timeout, remainingAfterSleep);
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
      requestTimers.push(timeoutId);

      const result = await fetchFn(controller.signal);

      // Success
      clearTimers(requestTimers);
      clearTimers(escalationTimers);
      clearMessage(containerEl);
      return result;
    } catch (retryErr) {
      clearTimers(requestTimers);

      if (retryErr instanceof RetryableError) {
        lastErr = retryErr;
        continue;
      }

      // AbortError or other non-retryable error — terminate
      clearTimers(escalationTimers);
      const retryHandler = onRetry || (() => progressiveLoad(fetchFn, containerEl, messageSet, options));
      showRetryButton(containerEl, retryHandler);
      return null;
    }
  }
}

/** Message sets for each screen — escalate over 15s before timeout. */
export const MESSAGE_SETS = {
  leaderboard: [
    { after: 0, msg: 'Fetching the rankings...' },
    { after: 3000, msg: 'Tallying up everyone\'s scores...' },
    { after: 6000, msg: 'The leaderboard keeper is on a coffee break ☕' },
    { after: 10000, msg: 'Waking up the database — hang tight 😴' },
    { after: 20000, msg: 'Almost there — servers stretching their legs 🦵' },
  ],
  profile: [
    { after: 0, msg: 'Loading your profile...' },
    { after: 3000, msg: 'Gathering your stats...' },
    { after: 6000, msg: 'Polishing your achievements ✨' },
    { after: 10000, msg: 'Waking up the database — hang tight 😴' },
    { after: 20000, msg: 'Almost there — dusting off your trophy shelf 🏆' },
  ],
  achievements: [
    { after: 0, msg: 'Checking your trophy case...' },
    { after: 3000, msg: 'Polishing your badges... ✨' },
    { after: 6000, msg: 'Counting your wins 🏅' },
    { after: 10000, msg: 'Waking up the database — hang tight 😴' },
    { after: 20000, msg: 'Almost there — assembling the trophy wall 🎖️' },
  ],
  community: [
    { after: 0, msg: 'Loading community puzzles...' },
    { after: 3000, msg: 'Gathering submissions...' },
    { after: 6000, msg: 'Checking for fresh puzzles 🧩' },
    { after: 10000, msg: 'Waking up the database — hang tight 😴' },
    { after: 20000, msg: 'Almost there — unpacking the puzzle box 📦' },
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
