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
  let randomSpy;
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin jitter to factor 1.0 so legacy tests in this suite stay
    // deterministic against the adaptive backoff schedule (CS53-6).
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    if (randomSpy) randomSpy.mockRestore();
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

  it('Down-DB case: eventually shows retry button at MAX_WARMUP_BUDGET_MS', async () => {
    // Server keeps returning RetryableError forever — the adaptive budget
    // tops out at MAX_WARMUP_BUDGET_MS (120s) and then the loader falls
    // through to the retry-button path.
    const { progressiveLoad, RetryableError, MESSAGE_SETS } = await loadModule();
    const fetchFn = vi.fn().mockRejectedValue(new RetryableError('warming up', 8000));
    const retryBtn = { addEventListener: vi.fn() };
    const container = {
      innerHTML: '',
      querySelector: vi.fn().mockReturnValue(retryBtn),
    };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 15000,
    });

    // Advance well past the 120s ceiling.
    for (let i = 0; i < 30; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }

    const result = await promise;
    expect(result).toBeNull();
    expect(container.innerHTML).toContain('progressive-retry-btn');
    // Should have been called multiple times before the cap exhausted.
    expect(fetchFn.mock.calls.length).toBeGreaterThan(3);
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
    // Advance past the 3s escalation mark — escalation timer fires showing second message.
    // Sleep #1 (retry idx 1, baseSleep=2000, retryAfter=3000) → 3000ms with pinned jitter.
    await vi.advanceTimersByTimeAsync(3100);
    expect(container.innerHTML).toContain('Tallying up everyone');

    // Sleep #2 (retry idx 2, baseSleep=4000, retryAfter=3000) → 4000ms.
    // Advance enough to complete sleep #2 and fire the third (success) fetch.
    await vi.advanceTimersByTimeAsync(4500);

    const result = await promise;
    expect(result).toEqual({ data: 'ok' });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('UnavailableError shows banner and bails out (no retry, no Retry button)', async () => {
    const { progressiveLoad, UnavailableError, MESSAGE_SETS } = await loadModule();
    const fetchFn = vi.fn().mockRejectedValue(
      new UnavailableError('The database has reached its monthly free capacity allowance.', 'capacity-exhausted')
    );
    const container = { innerHTML: '', querySelector: vi.fn().mockReturnValue(null) };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 15000,
    });

    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1); // no retry
    expect(container.innerHTML).toContain('progressive-unavailable');
    expect(container.innerHTML).toContain('monthly free capacity');
    expect(container.innerHTML).not.toContain('progressive-retry-btn');
  });

  it('UnavailableError mid-warmup-loop bails out and shows banner', async () => {
    const { progressiveLoad, RetryableError, UnavailableError, MESSAGE_SETS } = await loadModule();
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new RetryableError('warming up', 2000));
      return Promise.reject(new UnavailableError('Capacity exhausted.', 'capacity-exhausted'));
    });
    const container = { innerHTML: '', querySelector: vi.fn().mockReturnValue(null) };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 15000,
    });

    // First attempt fails Retryable; advance the 2s retry delay so the loop re-fetches
    await vi.advanceTimersByTimeAsync(2100);

    const result = await promise;
    expect(result).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(container.innerHTML).toContain('progressive-unavailable');
    expect(container.innerHTML).not.toContain('progressive-retry-btn');
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
    const container = { innerHTML: '', querySelector: vi.fn().mockReturnValue({ addEventListener: vi.fn() }) };

    // Start a load with abort-aware fetchFn
    const fetchFn = vi.fn().mockImplementation((signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        reject(abortErr);
      }, { once: true });
    }));
    const loadingPromise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, { timeout: 60000 });

    // Loading state should have ellipsis dots
    expect(container.innerHTML).toContain('progressive-ellipsis');
    expect(container.innerHTML).toContain('aria-hidden="true"');
    expect(container.innerHTML).toMatch(/<span class="progressive-ellipsis"[^>]*>.*<span><\/span>.*<span><\/span>.*<span><\/span>/s);

    // Advance past timeout to let the loader clean up
    await vi.advanceTimersByTimeAsync(60000);
    await loadingPromise;

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
    const container = { innerHTML: '', querySelector: vi.fn().mockReturnValue({ addEventListener: vi.fn() }) };
    // Abort-aware fetch to allow clean teardown
    const fetchFn = vi.fn().mockImplementation((signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        const err = new Error('aborted'); err.name = 'AbortError'; reject(err);
      }, { once: true });
    }));

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.achievements, { timeout: 60000 });

    // At 0ms — first message
    expect(container.innerHTML).toContain('Checking your trophy case...');

    await vi.advanceTimersByTimeAsync(3100);
    expect(container.innerHTML).toContain('Polishing your badges');

    await vi.advanceTimersByTimeAsync(3000);
    expect(container.innerHTML).toContain('Counting your wins 🏅');

    // Clean up
    await vi.advanceTimersByTimeAsync(60000);
    await promise;
  });

  it('community 6s message fires at 6000ms', async () => {
    const { progressiveLoad, MESSAGE_SETS } = await loadModule();
    const container = { innerHTML: '', querySelector: vi.fn().mockReturnValue({ addEventListener: vi.fn() }) };
    const fetchFn = vi.fn().mockImplementation((signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        const err = new Error('aborted'); err.name = 'AbortError'; reject(err);
      }, { once: true });
    }));

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.community, { timeout: 60000 });

    expect(container.innerHTML).toContain('Loading community puzzles...');

    await vi.advanceTimersByTimeAsync(3100);
    expect(container.innerHTML).toContain('Gathering submissions');

    await vi.advanceTimersByTimeAsync(3000);
    expect(container.innerHTML).toContain('Checking for fresh puzzles 🧩');

    // Clean up
    await vi.advanceTimersByTimeAsync(60000);
    await promise;
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
      const container = { innerHTML: '', querySelector: vi.fn().mockReturnValue({ addEventListener: vi.fn() }) };
      const fetchFn = vi.fn().mockImplementation((signal) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          const err = new Error('aborted'); err.name = 'AbortError'; reject(err);
        }, { once: true });
      }));

      const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS[screen], { timeout: 60000 });
      await vi.advanceTimersByTimeAsync(20100);

      expect(container.innerHTML).toContain(expectedMsg);

      // Clean up
      await vi.advanceTimersByTimeAsync(60000);
      await promise;
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

describe('Adaptive warmup cap (CS53-6)', () => {
  let randomSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    // Pin Math.random to 0.5 → jitter factor = 1.0 (no scaling) so timing
    // assertions are deterministic. Individual jitter-bounds tests restore
    // the spy and use real Math.random.
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    randomSpy.mockRestore();
    vi.useRealTimers();
  });

  it('extends the budget per 503 — single fast 503 succeeds within initial budget', async () => {
    const { progressiveLoad, RetryableError, MESSAGE_SETS } = await loadModule();
    let calls = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.reject(new RetryableError('warming up', 2000));
      return Promise.resolve({ ok: true });
    });
    const container = { innerHTML: '', querySelector: () => null };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 15000,
    });

    // First attempt fails immediately, baseSleep for retry #1 = 2000ms.
    // computeSleepMs(2000, 2000, …) = max(2000, 2000) = 2000ms (jitter=1).
    await vi.advanceTimersByTimeAsync(2100);

    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('backoff schedule honored: attempts 1=2s, 2=4s, 3=6s, 4+=8s (no jitter, retryAfter=0)', async () => {
    const { progressiveLoad, RetryableError, MESSAGE_SETS } = await loadModule();
    const sleepDurations = [];
    let lastTick = 0;
    let calls = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      calls++;
      const now = Date.now();
      if (calls > 1) sleepDurations.push(now - lastTick);
      lastTick = now;
      if (calls <= 5) return Promise.reject(new RetryableError('warming up', 0));
      return Promise.resolve({ ok: true });
    });
    const container = { innerHTML: '', querySelector: () => null };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 15000,
    });

    // Advance plenty for 5 sleeps of up to 8s each, plus headroom.
    for (let i = 0; i < 50; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }
    await promise;

    // Sleep gaps between successive fetch calls follow the schedule.
    // Math.random=0.5 → jitter factor = 1.0 → sleep == base (no skew).
    expect(sleepDurations[0]).toBe(2000);
    expect(sleepDurations[1]).toBe(4000);
    expect(sleepDurations[2]).toBe(6000);
    expect(sleepDurations[3]).toBe(8000);
    expect(sleepDurations[4]).toBe(8000);
  });

  it('Retry-After larger than base sleep wins (clamped to MAX_SLEEP_MS=8s)', async () => {
    const { progressiveLoad, RetryableError, MESSAGE_SETS } = await loadModule();
    let calls = 0;
    let firstCallTime = 0;
    let secondCallTime = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) {
        firstCallTime = Date.now();
        // Retry-After = 7000 > base sleep (2000) for retry #1 → use 7000.
        return Promise.reject(new RetryableError('warming up', 7000));
      }
      secondCallTime = Date.now();
      return Promise.resolve({ ok: true });
    });
    const container = { innerHTML: '', querySelector: () => null };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 15000,
    });
    for (let i = 0; i < 12; i++) await vi.advanceTimersByTimeAsync(1000);
    await promise;

    const sleepGap = secondCallTime - firstCallTime;
    expect(sleepGap).toBe(7000);
  });

  it('Retry-After greater than MAX_SLEEP_MS is clamped down to 8000', async () => {
    const { progressiveLoad, RetryableError, MESSAGE_SETS } = await loadModule();
    let calls = 0;
    let firstCallTime = 0;
    let secondCallTime = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) {
        firstCallTime = Date.now();
        return Promise.reject(new RetryableError('warming up', 30000));
      }
      secondCallTime = Date.now();
      return Promise.resolve({ ok: true });
    });
    const container = { innerHTML: '', querySelector: () => null };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 15000,
    });
    for (let i = 0; i < 15; i++) await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(secondCallTime - firstCallTime).toBe(8000);
  });

  it('budget extends past initial 30s — succeeds at ~50s with persistent 503s', async () => {
    // With initial budget=30s and 6s base sleeps + 15s extension per 503,
    // a fixed 30s cap would have surfaced the Retry button. The adaptive
    // cap should let this complete around t≈50s without ever bailing out.
    const { progressiveLoad, RetryableError, MESSAGE_SETS } = await loadModule();
    let calls = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      calls++;
      // First 6 calls 503; 7th succeeds. Schedule:
      //   t=0  first attempt → 503
      //   sleep 2s → t=2  503
      //   sleep 4s → t=6  503
      //   sleep 6s → t=12 503
      //   sleep 8s → t=20 503
      //   sleep 8s → t=28 503
      //   sleep 8s → t=36 OK
      // Old fixed 30s cap would have surfaced the Retry button before t=36.
      if (calls <= 6) return Promise.reject(new RetryableError('warming up', 0));
      return Promise.resolve({ ok: true });
    });
    const container = { innerHTML: '', querySelector: () => null };

    const promise = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, {
      timeout: 15000,
    });
    for (let i = 0; i < 60; i++) await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(7);
    // Should NOT have shown the Retry button — adaptive cap let it complete.
    expect(container.innerHTML).not.toContain('progressive-retry-btn');
  });

  it('jitter stays within ±20% of the chosen base (statistical bound)', async () => {
    // Restore real Math.random for this test so jitter actually varies.
    randomSpy.mockRestore();

    const { progressiveLoad, RetryableError, MESSAGE_SETS } = await loadModule();
    const samples = [];
    // We collect the gap between attempt 1 and attempt 2 across many runs.
    for (let run = 0; run < 30; run++) {
      let calls = 0;
      let t1 = 0, t2 = 0;
      const fetchFn = vi.fn().mockImplementation(() => {
        calls++;
        if (calls === 1) {
          t1 = Date.now();
          return Promise.reject(new RetryableError('warming up', 0));
        }
        t2 = Date.now();
        return Promise.resolve({ ok: true });
      });
      const container = { innerHTML: '', querySelector: () => null };
      const p = progressiveLoad(fetchFn, container, MESSAGE_SETS.leaderboard, { timeout: 15000 });
      for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(500);
      await p;
      samples.push(t2 - t1);
    }

    // Base sleep for retry #1 = 2000ms; jitter factor in [0.8, 1.2].
    // So every observed sample must be in [1600, 2400] (Math.round may
    // shift by 1ms). Re-pin spy after this test via beforeEach for the
    // next test in the describe block.
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(1599);
      expect(s).toBeLessThanOrEqual(2401);
    }
  });

  it('60s escalation message is present in all MESSAGE_SETS', async () => {
    const { MESSAGE_SETS } = await loadModule();
    for (const key of ['leaderboard', 'profile', 'achievements', 'community']) {
      const set = MESSAGE_SETS[key];
      const longMsg = set.find((m) => m.after === 60000);
      expect(longMsg, `${key} should have a 60s escalation message`).toBeDefined();
      expect(longMsg.msg).toMatch(/unusually long|service may be experiencing/i);
    }
  });
});

