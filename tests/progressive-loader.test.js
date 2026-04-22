/**
 * Unit tests for the progressive-loader module.
 * Tests message escalation timing, retry behavior, and score sync queue.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock browser globals for the module
globalThis.document = undefined;
globalThis.localStorage = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

/** Lazily import the module (avoid top-level await for ESLint compat). */
async function loadModule() {
  return import('../public/js/progressive-loader.js');
}

describe('progressiveLoad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns data on successful fetch', async () => {
    const { progressiveLoad, MESSAGE_SETS } = await loadModule();
    const fetchFn = vi.fn().mockResolvedValue({ scores: [1, 2, 3] });
    const container = { innerHTML: '', querySelector: () => null };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 5000,
    });

    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toEqual({ scores: [1, 2, 3] });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns null and shows retry button with default maxRetries: 0', async () => {
    const { progressiveLoad } = await loadModule();
    const fetchFn = vi.fn().mockRejectedValue(new Error('fail'));
    const retryBtn = { addEventListener: vi.fn() };
    const container = {
      innerHTML: '',
      querySelector: vi.fn().mockReturnValue(retryBtn),
    };

    const promise = progressiveLoad(fetchFn, container, [], {
      timeout: 5000,
    });

    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1); // only initial attempt, no retries
    expect(container.innerHTML).toContain('progressive-retry-btn');
  });

  it('retries on failure with backoff when maxRetries > 0', async () => {
    const { progressiveLoad, MESSAGE_SETS } = await loadModule();
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) return Promise.reject(new Error('fail'));
      return Promise.resolve({ ok: true });
    });
    const container = { innerHTML: '', querySelector: () => null };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      maxRetries: 3,
      backoff: [100, 200, 400],
      timeout: 5000,
    });

    // First attempt fails
    await vi.advanceTimersByTimeAsync(200);
    // Second attempt (after 100ms backoff) also fails
    await vi.advanceTimersByTimeAsync(300);
    // Third attempt (after 200ms backoff) succeeds
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('returns null after all retries exhausted', async () => {
    const { progressiveLoad } = await loadModule();
    const fetchFn = vi.fn().mockRejectedValue(new Error('always fail'));
    const container = {
      innerHTML: '',
      querySelector: vi.fn().mockReturnValue(null),
    };

    const promise = progressiveLoad(fetchFn, container, [], {
      maxRetries: 2,
      backoff: [50, 100],
      timeout: 5000,
    });

    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(500);
    }

    const result = await promise;
    expect(result).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('shows first message immediately', async () => {
    const { progressiveLoad, MESSAGE_SETS } = await loadModule();
    const fetchFn = vi.fn().mockResolvedValue('data');
    const container = { innerHTML: '', querySelector: () => null };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 5000,
    });

    expect(container.innerHTML).toContain('Fetching the rankings...');

    await vi.advanceTimersByTimeAsync(100);
    await promise;
  });

  it('passes AbortSignal to fetchFn', async () => {
    const { progressiveLoad } = await loadModule();
    let receivedSignal;
    const fetchFn = vi.fn().mockImplementation((signal) => {
      receivedSignal = signal;
      return Promise.resolve('data');
    });
    const container = { innerHTML: '', querySelector: () => null };

    const promise = progressiveLoad(fetchFn, container, [], { timeout: 5000 });
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});

describe('RetryableError and 503 auto-retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries on 503 with Retry-After header (RetryableError)', async () => {
    const { progressiveLoad, RetryableError, MESSAGE_SETS } = await loadModule();
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new RetryableError('warming up', 5000));
      return Promise.resolve({ scores: [1, 2] });
    });
    const container = { innerHTML: '', querySelector: () => null };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 15000,
    });

    // First attempt fails with RetryableError
    await vi.advanceTimersByTimeAsync(100);
    // Wait for retry delay (clamped to 2000-8000, so 5000ms)
    await vi.advanceTimersByTimeAsync(5100);

    const result = await promise;
    expect(result).toEqual({ scores: [1, 2] });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not retry 503 without header or body retry signal (terminal failure)', async () => {
    const { progressiveLoad, MESSAGE_SETS } = await loadModule();
    // A plain Error (not RetryableError) for a 503 without signal
    const fetchFn = vi.fn().mockRejectedValue(new Error('HTTP 503'));
    const retryBtn = { addEventListener: vi.fn() };
    const container = {
      innerHTML: '',
      querySelector: vi.fn().mockReturnValue(retryBtn),
    };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 15000,
    });

    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toContain('progressive-retry-btn');
  });

  it('honors 30s wall-clock cap — falls through to retry-button path', async () => {
    const { progressiveLoad, RetryableError, MESSAGE_SETS } = await loadModule();
    // Always returns RetryableError with 8s delay
    const fetchFn = vi.fn().mockRejectedValue(new RetryableError('warming up', 8000));
    const retryBtn = { addEventListener: vi.fn() };
    const container = {
      innerHTML: '',
      querySelector: vi.fn().mockReturnValue(retryBtn),
    };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 15000,
    });

    // Advance well past 30s to exhaust the wall-clock cap
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }

    const result = await promise;
    expect(result).toBeNull();
    expect(container.innerHTML).toContain('progressive-retry-btn');
    // Should have been called multiple times (initial + retries) but eventually stopped
    expect(fetchFn.mock.calls.length).toBeGreaterThan(1);
  });

  it('message-escalation timers persist across retries', async () => {
    const { progressiveLoad, RetryableError, MESSAGE_SETS } = await loadModule();
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) return Promise.reject(new RetryableError('warming up', 3000));
      return Promise.resolve({ data: 'ok' });
    });
    const container = { innerHTML: '', querySelector: () => null };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 15000,
    });

    // First attempt fails immediately
    await vi.advanceTimersByTimeAsync(100);
    // Advance past the 3s mark — escalation timer should fire showing second message
    await vi.advanceTimersByTimeAsync(3100);
    expect(container.innerHTML).toContain('Tallying up everyone');

    // Still retrying — advance to get past retry delay and succeed
    await vi.advanceTimersByTimeAsync(3000);

    const result = await promise;
    expect(result).toEqual({ data: 'ok' });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('AbortError still terminates the loader immediately', async () => {
    const { progressiveLoad, MESSAGE_SETS } = await loadModule();
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    const fetchFn = vi.fn().mockRejectedValue(abortErr);
    const retryBtn = { addEventListener: vi.fn() };
    const container = {
      innerHTML: '',
      querySelector: vi.fn().mockReturnValue(retryBtn),
    };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 15000,
    });

    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toContain('progressive-retry-btn');
  });

  it('ellipsis dots are present in loading-state DOM and absent in Retry-state', async () => {
    const { progressiveLoad, MESSAGE_SETS } = await loadModule();
    const container = { innerHTML: '', querySelector: () => null };

    // Start a load — check loading state
    const fetchFn = vi.fn().mockImplementation(() => new Promise(() => {})); // never resolves
    progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, { timeout: 60000 });

    // Loading state should have ellipsis dots
    expect(container.innerHTML).toContain('progressive-ellipsis');
    expect(container.innerHTML).toContain('aria-hidden="true"');
    expect(container.innerHTML).toMatch(/<span class="progressive-ellipsis"[^>]*>.*<span><\/span>.*<span><\/span>.*<span><\/span>/s);

    // Now test retry state — trigger failure
    const failFn = vi.fn().mockRejectedValue(new Error('fail'));
    const retryBtn = { addEventListener: vi.fn() };
    const retryContainer = {
      innerHTML: '',
      querySelector: vi.fn().mockReturnValue(retryBtn),
    };

    const promise2 = progressiveLoad(failFn, retryContainer, [], { timeout: 5000 });
    await vi.advanceTimersByTimeAsync(100);
    await promise2;

    // Retry state should NOT have ellipsis dots
    expect(retryContainer.innerHTML).toContain('progressive-retry-btn');
    expect(retryContainer.innerHTML).not.toContain('progressive-ellipsis');
  });
});

describe('New message timer steps (6s and 20s)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('achievements 6s message fires at 6000ms', async () => {
    const { progressiveLoad, MESSAGE_SETS } = await loadModule();
    const container = { innerHTML: '', querySelector: () => null };
    // Never-resolving fetch to keep timers running
    const fetchFn = vi.fn().mockImplementation(() => new Promise(() => {}));

    progressiveLoad(fetchFn, container, MESSAGE_SETS.achievements, { timeout: 60000 });

    // At 0ms — first message
    expect(container.innerHTML).toContain('Checking your trophy case...');

    await vi.advanceTimersByTimeAsync(3100);
    expect(container.innerHTML).toContain('Polishing your badges');

    await vi.advanceTimersByTimeAsync(3000);
    expect(container.innerHTML).toContain('Counting your wins 🏅');
  });

  it('community 6s message fires at 6000ms', async () => {
    const { progressiveLoad, MESSAGE_SETS } = await loadModule();
    const container = { innerHTML: '', querySelector: () => null };
    const fetchFn = vi.fn().mockImplementation(() => new Promise(() => {}));

    progressiveLoad(fetchFn, container, MESSAGE_SETS.community, { timeout: 60000 });

    expect(container.innerHTML).toContain('Loading community puzzles...');

    await vi.advanceTimersByTimeAsync(3100);
    expect(container.innerHTML).toContain('Gathering submissions');

    await vi.advanceTimersByTimeAsync(3000);
    expect(container.innerHTML).toContain('Checking for fresh puzzles 🧩');
  });

  it('20s messages fire for all screens', async () => {
    const { progressiveLoad, MESSAGE_SETS } = await loadModule();

    const expectedMessages = {
      leaderboard: 'Almost there — servers stretching their legs 🦵',
      profile: 'Almost there — dusting off your trophy shelf 🏆',
      achievements: 'Almost there — assembling the trophy wall 🎖️',
      community: 'Almost there — unpacking the puzzle box 📦',
    };

    for (const [screen, expectedMsg] of Object.entries(expectedMessages)) {
      const container = { innerHTML: '', querySelector: () => null };
      const fetchFn = vi.fn().mockImplementation(() => new Promise(() => {}));

      progressiveLoad(fetchFn, container, MESSAGE_SETS[screen], { timeout: 60000 });
      await vi.advanceTimersByTimeAsync(20100);

      expect(container.innerHTML).toContain(expectedMsg);
    }
  });
});

describe('MESSAGE_SETS', () => {
  it('has message sets for all screens', async () => {
    const { MESSAGE_SETS } = await loadModule();
    expect(MESSAGE_SETS.leaderboard).toBeDefined();
    expect(MESSAGE_SETS.leaderboard.length).toBeGreaterThan(0);
    expect(MESSAGE_SETS.profile).toBeDefined();
    expect(MESSAGE_SETS.achievements).toBeDefined();
    expect(MESSAGE_SETS.community).toBeDefined();
  });

  it('each message set starts at after: 0', async () => {
    const { MESSAGE_SETS } = await loadModule();
    for (const [, set] of Object.entries(MESSAGE_SETS)) {
      expect(set[0].after).toBe(0);
      expect(typeof set[0].msg).toBe('string');
    }
  });

  it('message sets have ascending after values', async () => {
    const { MESSAGE_SETS } = await loadModule();
    for (const [, set] of Object.entries(MESSAGE_SETS)) {
      for (let i = 1; i < set.length; i++) {
        expect(set[i].after).toBeGreaterThan(set[i - 1].after);
      }
    }
  });
});

describe('Score sync queue', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('queues a score for sync', async () => {
    const { queueScoreForSync, getQueuedScores } = await loadModule();
    queueScoreForSync({ score: 100, mode: 'freeplay' });
    const queued = getQueuedScores();
    expect(queued).toHaveLength(1);
    expect(queued[0].score).toBe(100);
    expect(queued[0].queuedAt).toBeDefined();
  });

  it('queues multiple scores', async () => {
    const { queueScoreForSync, getQueuedScores } = await loadModule();
    queueScoreForSync({ score: 100 });
    queueScoreForSync({ score: 200 });
    queueScoreForSync({ score: 300 });
    expect(getQueuedScores()).toHaveLength(3);
  });

  it('caps at 20 entries', async () => {
    const { queueScoreForSync, getQueuedScores } = await loadModule();
    for (let i = 0; i < 25; i++) {
      queueScoreForSync({ score: i });
    }
    expect(getQueuedScores()).toHaveLength(20);
    expect(getQueuedScores()[0].score).toBe(5);
  });

  it('dequeues scores from the front', async () => {
    const { queueScoreForSync, getQueuedScores, dequeueScores } = await loadModule();
    queueScoreForSync({ score: 100 });
    queueScoreForSync({ score: 200 });
    queueScoreForSync({ score: 300 });

    dequeueScores(1);
    const remaining = getQueuedScores();
    expect(remaining).toHaveLength(2);
    expect(remaining[0].score).toBe(200);
  });

  it('clears queue when all dequeued', async () => {
    const { queueScoreForSync, getQueuedScores, dequeueScores } = await loadModule();
    queueScoreForSync({ score: 100 });
    dequeueScores(1);
    expect(getQueuedScores()).toHaveLength(0);
    expect(localStorage.getItem('gwn_score_sync_queue')).toBeNull();
  });

  it('handles empty queue gracefully', async () => {
    const { getQueuedScores, dequeueScores } = await loadModule();
    expect(getQueuedScores()).toHaveLength(0);
    dequeueScores(5);
    expect(getQueuedScores()).toHaveLength(0);
  });
});

describe('syncQueuedScores', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when queue is empty', async () => {
    const { syncQueuedScores } = await loadModule();
    const apiFetchFn = vi.fn();
    const onSyncing = vi.fn();

    const promise = syncQueuedScores(apiFetchFn, { onSyncing });
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(apiFetchFn).not.toHaveBeenCalled();
    expect(onSyncing).not.toHaveBeenCalled();
  });

  it('syncs queued scores and dequeues on success', async () => {
    const { queueScoreForSync, getQueuedScores, syncQueuedScores } = await loadModule();
    queueScoreForSync({ score: 100, mode: 'freeplay' });
    queueScoreForSync({ score: 200, mode: 'freeplay' });

    const apiFetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const onSynced = vi.fn();

    const promise = syncQueuedScores(apiFetchFn, { onSynced });
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(apiFetchFn).toHaveBeenCalledTimes(2);
    expect(onSynced).toHaveBeenCalledWith(2);
    expect(getQueuedScores()).toHaveLength(0);
  });

  it('stops on 401 without dequeuing', async () => {
    const { queueScoreForSync, getQueuedScores, syncQueuedScores } = await loadModule();
    queueScoreForSync({ score: 100, mode: 'freeplay' });
    queueScoreForSync({ score: 200, mode: 'freeplay' });

    const apiFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const onFailed = vi.fn();

    const promise = syncQueuedScores(apiFetchFn, { onFailed });
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(apiFetchFn).toHaveBeenCalledTimes(1);
    expect(onFailed).toHaveBeenCalled();
    expect(getQueuedScores()).toHaveLength(2);
  });

  it('retries on network failure then leaves queue intact', async () => {
    const { queueScoreForSync, getQueuedScores, syncQueuedScores } = await loadModule();
    queueScoreForSync({ score: 100, mode: 'freeplay' });

    // All 3 attempts fail with network error
    const apiFetchFn = vi.fn().mockRejectedValue(new Error('network error'));
    const onFailed = vi.fn();

    const promise = syncQueuedScores(apiFetchFn, { onFailed });
    // Advance through all 3 retry backoff periods
    for (let i = 0; i < 15; i++) {
      await vi.advanceTimersByTimeAsync(10000);
    }
    await promise;

    expect(apiFetchFn).toHaveBeenCalledTimes(3);
    expect(onFailed).toHaveBeenCalled();
    expect(getQueuedScores()).toHaveLength(1);
  });

  it('treats 409 as successful sync', async () => {
    const { queueScoreForSync, getQueuedScores, syncQueuedScores } = await loadModule();
    queueScoreForSync({ score: 100, mode: 'freeplay' });

    const apiFetchFn = vi.fn().mockResolvedValue({ ok: false, status: 409 });
    const onSynced = vi.fn();

    const promise = syncQueuedScores(apiFetchFn, { onSynced });
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(onSynced).toHaveBeenCalledWith(1);
    expect(getQueuedScores()).toHaveLength(0);
  });

  it('strips queuedAt from payload before submitting', async () => {
    const { queueScoreForSync, syncQueuedScores } = await loadModule();
    queueScoreForSync({ score: 100, mode: 'freeplay' });

    const apiFetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const promise = syncQueuedScores(apiFetchFn, {});
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    const body = JSON.parse(apiFetchFn.mock.calls[0][1].body);
    expect(body.queuedAt).toBeUndefined();
    expect(body.score).toBe(100);
  });
});
