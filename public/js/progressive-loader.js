/**
 * Progressive Loader — wraps async operations with timed message escalation and auto-retry.
 * Shows friendly escalating messages while DB cold starts resolve, then auto-retries on failure.
 */

const DEFAULTS = {
  maxRetries: 3,
  backoff: [1000, 3000, 9000],
  timeout: 30000,
};

/**
 * Run an async fetch with timed message escalation and auto-retry.
 *
 * @param {Function} fetchFn - async function that returns data
 * @param {HTMLElement} containerEl - element to show messages in
 * @param {Array<{after: number, msg: string}>} messageSet - escalating messages
 * @param {Object} [options] - {maxRetries, backoff, timeout}
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

  while (attempt <= maxRetries) {
    const timers = [];

    try {
      // Start escalating messages
      startMessageEscalation(containerEl, messageSet, timers);

      // Run fetchFn with timeout via AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      timers.push(timeoutId);

      const result = await fetchFn(controller.signal);

      // Success — clean up and return
      clearTimers(timers);
      clearMessage(containerEl);
      return result;
    } catch {
      clearTimers(timers);

      attempt++;
      if (attempt > maxRetries) {
        // All retries exhausted — show retry button
        // If caller provided onRetry, use it to re-run the entire screen flow
        const retryHandler = onRetry || (() => progressiveLoad(fetchFn, containerEl, messageSet, options));
        showRetryButton(containerEl, retryHandler);
        return null;
      }

      // Wait with backoff before next attempt
      const delay = backoff[Math.min(attempt - 1, backoff.length - 1)];
      setMessage(containerEl, `Retrying... (attempt ${attempt + 1})`);
      await sleep(delay);
    }
  }

  return null;
}

/** Message sets for each screen. */
export const MESSAGE_SETS = {
  leaderboard: [
    { after: 0, msg: 'Fetching the rankings...' },
    { after: 5000, msg: 'Tallying up everyone\'s scores...' },
    { after: 12000, msg: 'The leaderboard keeper is on a coffee break ☕' },
    { after: 20000, msg: 'Almost there — the database was napping 😴' },
  ],
  profile: [
    { after: 0, msg: 'Loading your profile...' },
    { after: 5000, msg: 'Gathering your stats...' },
    { after: 12000, msg: 'Your profile data is warming up ☕' },
  ],
  achievements: [
    { after: 0, msg: 'Checking your trophy case...' },
    { after: 5000, msg: 'Polishing your badges... ✨' },
  ],
  community: [
    { after: 0, msg: 'Loading community puzzles...' },
    { after: 5000, msg: 'Gathering submissions...' },
  ],
};

/**
 * Score sync queue — saves scores to localStorage and syncs in the background.
 */
const SYNC_QUEUE_KEY = 'gwn_score_sync_queue';

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
      await sleep(DEFAULTS.backoff[Math.min(attempt, DEFAULTS.backoff.length - 1)]);
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
  el.innerHTML = `<div class="progressive-message" role="status" aria-live="polite">${msg}</div>`;
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
  if (!el || !messageSet || messageSet.length === 0) return () => {};

  for (const { after, msg } of messageSet) {
    if (after === 0) continue; // first message already shown
    const id = setTimeout(() => setMessage(el, msg), after);
    timers.push(id);
  }

  return () => clearTimers(timers);
}

function clearTimers(timers) {
  for (const id of timers) clearTimeout(id);
  timers.length = 0;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
