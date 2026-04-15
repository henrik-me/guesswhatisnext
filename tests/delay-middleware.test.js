/**
 * Unit tests for the delay simulation middleware.
 */

const path = require('path');

const DELAY_MODULE = path.resolve(__dirname, '..', 'server', 'middleware', 'delay.js');

function freshRequire() {
  delete require.cache[DELAY_MODULE];
  const serverDir = path.resolve(__dirname, '..', 'server');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverDir)) delete require.cache[key];
  }
  return require(DELAY_MODULE);
}

function mockReqRes(reqPath) {
  const req = { path: reqPath };
  const listeners = {};
  const res = {
    on(event, fn) { listeners[event] = fn; },
  };
  return { req, res, listeners };
}

describe('Delay middleware', () => {
  const originalDbDelayMs = process.env.GWN_DB_DELAY_MS;
  const originalDbDelayPattern = process.env.GWN_DB_DELAY_PATTERN;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.useRealTimers();

    if (originalDbDelayMs === undefined) {
      delete process.env.GWN_DB_DELAY_MS;
    } else {
      process.env.GWN_DB_DELAY_MS = originalDbDelayMs;
    }

    if (originalDbDelayPattern === undefined) {
      delete process.env.GWN_DB_DELAY_PATTERN;
    } else {
      process.env.GWN_DB_DELAY_PATTERN = originalDbDelayPattern;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test('returns null when GWN_DB_DELAY_MS is not set', () => {
    delete process.env.GWN_DB_DELAY_MS;
    delete process.env.GWN_DB_DELAY_PATTERN;
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    expect(createDelayMiddleware()).toBeNull();
  });

  test('returns null when NODE_ENV is production', () => {
    process.env.GWN_DB_DELAY_MS = '5000';
    delete process.env.GWN_DB_DELAY_PATTERN;
    process.env.NODE_ENV = 'production';
    const { createDelayMiddleware } = freshRequire();
    expect(createDelayMiddleware()).toBeNull();
  });

  test('returns null when NODE_ENV is staging', () => {
    process.env.GWN_DB_DELAY_MS = '5000';
    delete process.env.GWN_DB_DELAY_PATTERN;
    process.env.NODE_ENV = 'staging';
    const { createDelayMiddleware } = freshRequire();
    expect(createDelayMiddleware()).toBeNull();
  });

  test('delays /api/ routes by configured amount', () => {
    vi.useFakeTimers();
    process.env.GWN_DB_DELAY_MS = '5000';
    delete process.env.GWN_DB_DELAY_PATTERN;
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();
    expect(mw).not.toBeNull();

    const { req, res } = mockReqRes('/api/scores');
    const next = vi.fn();
    mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('does NOT delay /api/health', () => {
    process.env.GWN_DB_DELAY_MS = '500';
    delete process.env.GWN_DB_DELAY_PATTERN;
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();

    const { req, res } = mockReqRes('/api/health');
    const next = vi.fn();
    const spy = vi.spyOn(global, 'setTimeout');
    try {
      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test('does NOT delay /api/admin/* routes', () => {
    process.env.GWN_DB_DELAY_MS = '500';
    delete process.env.GWN_DB_DELAY_PATTERN;
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();

    const { req, res } = mockReqRes('/api/admin/drain');
    const next = vi.fn();
    const spy = vi.spyOn(global, 'setTimeout');
    try {
      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test('does NOT delay non-api routes', () => {
    process.env.GWN_DB_DELAY_MS = '500';
    delete process.env.GWN_DB_DELAY_PATTERN;
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();

    const { req, res } = mockReqRes('/');
    const next = vi.fn();
    const spy = vi.spyOn(global, 'setTimeout');
    try {
      mw(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test('delay is capped at 45000ms', () => {
    vi.useFakeTimers();
    process.env.GWN_DB_DELAY_MS = '99999';
    delete process.env.GWN_DB_DELAY_PATTERN;
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();
    expect(mw).not.toBeNull();

    const spy = vi.spyOn(global, 'setTimeout');
    try {
      const { req, res } = mockReqRes('/api/scores');
      mw(req, res, () => {});
      expect(spy).toHaveBeenCalledWith(expect.any(Function), 45000);
    } finally {
      spy.mockRestore();
    }
  });

  test('cancels delay when client disconnects', () => {
    vi.useFakeTimers();
    process.env.GWN_DB_DELAY_MS = '5000';
    delete process.env.GWN_DB_DELAY_PATTERN;
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();

    const { req, res, listeners } = mockReqRes('/api/scores');
    const next = vi.fn();
    mw(req, res, next);

    // Simulate client disconnect before timer fires
    expect(listeners.close).toBeDefined();
    listeners.close();

    vi.advanceTimersByTime(5000);
    expect(next).not.toHaveBeenCalled();
  });

  // --- Pattern mode tests ---

  test('pattern advances after 2s+ gap between requests (new navigation)', () => {
    vi.useFakeTimers();
    delete process.env.GWN_DB_DELAY_MS;
    process.env.GWN_DB_DELAY_PATTERN = '5000,2000';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();
    expect(mw).not.toBeNull();

    // Request 1 at T=0: step 0 → 5000ms delay
    const next1 = vi.fn();
    const r1 = mockReqRes('/api/scores');
    mw(r1.req, r1.res, next1);
    expect(next1).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(next1).toHaveBeenCalledTimes(1);

    // Request 2 at T=5000 (5s gap > 2s): advances to step 1 → 2000ms delay
    const next2 = vi.fn();
    const r2 = mockReqRes('/api/scores');
    mw(r2.req, r2.res, next2);
    expect(next2).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(next2).toHaveBeenCalledTimes(1);
  });

  test('pattern wraps around after completing a cycle', () => {
    vi.useFakeTimers();
    delete process.env.GWN_DB_DELAY_MS;
    process.env.GWN_DB_DELAY_PATTERN = '3000,1000';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();

    // Request 1 at T=0: step 0 → 3000ms
    const next1 = vi.fn();
    const r1 = mockReqRes('/api/scores');
    mw(r1.req, r1.res, next1);
    vi.advanceTimersByTime(3000);
    expect(next1).toHaveBeenCalledTimes(1);

    // Request 2 at T=3000 (3s gap > 2s): advance to step 1 → 1000ms
    const next2 = vi.fn();
    const r2 = mockReqRes('/api/scores');
    mw(r2.req, r2.res, next2);
    vi.advanceTimersByTime(1000);
    expect(next2).toHaveBeenCalledTimes(1);

    // Wait 3s to simulate new navigation (T=4000 + 3000 = T=7000)
    vi.advanceTimersByTime(3000);

    // Request 3 at T=7000 (3s gap > 2s): wraps to step 0 → 3000ms
    const next3 = vi.fn();
    const r3 = mockReqRes('/api/scores');
    mw(r3.req, r3.res, next3);
    expect(next3).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(next3).toHaveBeenCalledTimes(1);
  });

  test('GWN_DB_DELAY_PATTERN takes precedence over GWN_DB_DELAY_MS', () => {
    vi.useFakeTimers();
    process.env.GWN_DB_DELAY_MS = '9000';
    process.env.GWN_DB_DELAY_PATTERN = '2000';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();

    const spy = vi.spyOn(global, 'setTimeout');
    try {
      const { req, res } = mockReqRes('/api/scores');
      mw(req, res, () => {});
      // Pattern value (2000) should be used, not GWN_DB_DELAY_MS (9000)
      expect(spy).toHaveBeenCalledWith(expect.any(Function), 2000);
    } finally {
      spy.mockRestore();
    }
  });

  test('single-value pattern works like fixed delay', () => {
    vi.useFakeTimers();
    delete process.env.GWN_DB_DELAY_MS;
    process.env.GWN_DB_DELAY_PATTERN = '4000';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();
    expect(mw).not.toBeNull();

    // Multiple requests all get 4000ms
    for (let i = 0; i < 3; i++) {
      const next = vi.fn();
      const { req, res } = mockReqRes('/api/scores');
      mw(req, res, next);
      expect(next).not.toHaveBeenCalled();
      vi.advanceTimersByTime(4000);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  test('pattern values of 0 skip delay (instant next())', () => {
    vi.useFakeTimers();
    delete process.env.GWN_DB_DELAY_MS;
    process.env.GWN_DB_DELAY_PATTERN = '3000,0';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();

    // Request 1 at T=0: step 0 → 3000ms delay
    const next1 = vi.fn();
    const r1 = mockReqRes('/api/scores');
    mw(r1.req, r1.res, next1);
    expect(next1).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(next1).toHaveBeenCalledTimes(1);

    // Request 2 at T=3000 (3s gap > 2s): advances to step 1 → 0ms, next() immediate
    const next2 = vi.fn();
    const r2 = mockReqRes('/api/scores');
    mw(r2.req, r2.res, next2);
    expect(next2).toHaveBeenCalledTimes(1);
  });

  test('parallel requests within 2s burst all get the same delay step', () => {
    vi.useFakeTimers();
    delete process.env.GWN_DB_DELAY_MS;
    process.env.GWN_DB_DELAY_PATTERN = '5000,1000';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();

    // Simulate 3 parallel API calls within same page load (all within 2s)
    const nexts = [];
    for (let i = 0; i < 3; i++) {
      const next = vi.fn();
      const { req, res } = mockReqRes('/api/scores');
      mw(req, res, next);
      nexts.push(next);
      // Small gap between parallel requests (100ms)
      vi.advanceTimersByTime(100);
    }

    // All 3 should be waiting on the same 5000ms delay (step 0)
    nexts.forEach((n) => expect(n).not.toHaveBeenCalled());

    // After 5000ms from first request, all should have fired
    vi.advanceTimersByTime(5000);
    nexts.forEach((n) => expect(n).toHaveBeenCalledTimes(1));
  });

  test('requests after 2s+ gap advance to next pattern step', () => {
    vi.useFakeTimers();
    delete process.env.GWN_DB_DELAY_MS;
    process.env.GWN_DB_DELAY_PATTERN = '5000,2000,500';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();

    // Navigation 1: step 0 → 5000ms
    const next1 = vi.fn();
    mw(mockReqRes('/api/scores').req, mockReqRes('/api/scores').res, next1);
    vi.advanceTimersByTime(5000);
    expect(next1).toHaveBeenCalledTimes(1);

    // Navigation 2 (5s gap > 2s): step 1 → 2000ms
    const spy = vi.spyOn(global, 'setTimeout');
    try {
      const next2 = vi.fn();
      const { req, res } = mockReqRes('/api/puzzles');
      mw(req, res, next2);
      expect(spy).toHaveBeenLastCalledWith(expect.any(Function), 2000);
      vi.advanceTimersByTime(2000);
      expect(next2).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }

    // Navigation 3 (2s gap > 2s): step 2 → 500ms
    vi.advanceTimersByTime(1000); // extra gap to ensure > 2s total
    const spy2 = vi.spyOn(global, 'setTimeout');
    try {
      const next3 = vi.fn();
      const { req, res } = mockReqRes('/api/scores');
      mw(req, res, next3);
      expect(spy2).toHaveBeenLastCalledWith(expect.any(Function), 500);
    } finally {
      spy2.mockRestore();
    }
  });

  test('returns null for empty or invalid pattern', () => {
    delete process.env.GWN_DB_DELAY_MS;
    process.env.GWN_DB_DELAY_PATTERN = ',,,';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    expect(createDelayMiddleware()).toBeNull();
  });

  test('pattern values are capped at 45000ms', () => {
    vi.useFakeTimers();
    delete process.env.GWN_DB_DELAY_MS;
    process.env.GWN_DB_DELAY_PATTERN = '99999';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();
    expect(mw).not.toBeNull();

    const spy = vi.spyOn(global, 'setTimeout');
    try {
      const { req, res } = mockReqRes('/api/scores');
      mw(req, res, () => {});
      expect(spy).toHaveBeenCalledWith(expect.any(Function), 45000);
    } finally {
      spy.mockRestore();
    }
  });

  test('returns null when pattern is set but env is production', () => {
    process.env.GWN_DB_DELAY_PATTERN = '5000,2000';
    process.env.NODE_ENV = 'production';
    const { createDelayMiddleware } = freshRequire();
    expect(createDelayMiddleware()).toBeNull();
  });
});
