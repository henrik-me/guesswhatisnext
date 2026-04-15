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

    const spy = vi.spyOn(global, 'setTimeout');

    try {
      // Simulate 3 parallel API calls within same page load (all within 2s)
      const nexts = [];
      for (let i = 0; i < 3; i++) {
        const next = vi.fn();
        const { req, res } = mockReqRes('/api/scores');
        mw(req, res, next);
        expect(spy).toHaveBeenLastCalledWith(expect.any(Function), 5000);
        nexts.push(next);
        // Small gap between parallel requests (100ms)
        vi.advanceTimersByTime(100);
      }

      // All 3 should still be pending after the shorter 1000ms step would have fired
      nexts.forEach((n) => expect(n).not.toHaveBeenCalled());
      vi.advanceTimersByTime(700);
      nexts.forEach((n) => expect(n).not.toHaveBeenCalled());

      // The loop advanced 300ms and the check above advanced another 700ms,
      // so advance the remaining time for all 5000ms timers to fire
      // (last timer started at T=200, fires at T=5200).
      vi.advanceTimersByTime(4300);
      nexts.forEach((n) => expect(n).toHaveBeenCalledTimes(1));
    } finally {
      spy.mockRestore();
    }
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
    const { req: req1, res: res1 } = mockReqRes('/api/scores');
    mw(req1, res1, next1);
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

    // Navigation 3 (3s gap >= 2s): step 2 → 500ms
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

  test('exact 2000ms gap advances to next step (boundary)', () => {
    vi.useFakeTimers();
    delete process.env.GWN_DB_DELAY_MS;
    // Use 0ms first step so request 1 is instant — gap measured from T=0
    process.env.GWN_DB_DELAY_PATTERN = '0,1000';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();

    // Request 1 at T=0: step 0 → 0ms (instant)
    const next1 = vi.fn();
    const r1 = mockReqRes('/api/scores');
    mw(r1.req, r1.res, next1);
    expect(next1).toHaveBeenCalledTimes(1);

    // Advance exactly 2000ms — gap from T=0 to T=2000 is exactly 2000ms
    vi.advanceTimersByTime(2000);

    // Request 2 at T=2000: gap = 2000ms >= 2000 → advances to step 1 → 1000ms
    const spy = vi.spyOn(global, 'setTimeout');
    try {
      const next2 = vi.fn();
      const r2 = mockReqRes('/api/scores');
      mw(r2.req, r2.res, next2);
      expect(spy).toHaveBeenLastCalledWith(expect.any(Function), 1000);
    } finally {
      spy.mockRestore();
    }
  });

  test('1999ms gap does NOT advance step (just below boundary)', () => {
    vi.useFakeTimers();
    delete process.env.GWN_DB_DELAY_MS;
    process.env.GWN_DB_DELAY_PATTERN = '0,1000';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();

    // Request 1 at T=0: step 0 → 0ms (instant)
    const next1 = vi.fn();
    const r1 = mockReqRes('/api/scores');
    mw(r1.req, r1.res, next1);
    expect(next1).toHaveBeenCalledTimes(1);

    // Advance only 1999ms — just below the 2000ms threshold
    vi.advanceTimersByTime(1999);

    // Request 2 at T=1999: gap = 1999ms < 2000 → stays at step 0 → 0ms (instant)
    const next2 = vi.fn();
    const r2 = mockReqRes('/api/scores');
    mw(r2.req, r2.res, next2);
    expect(next2).toHaveBeenCalledTimes(1);
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
