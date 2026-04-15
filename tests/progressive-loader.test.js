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

  it('retries on failure with backoff', async () => {
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
