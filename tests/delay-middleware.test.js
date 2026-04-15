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
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.useRealTimers();

    if (originalDbDelayMs === undefined) {
      delete process.env.GWN_DB_DELAY_MS;
    } else {
      process.env.GWN_DB_DELAY_MS = originalDbDelayMs;
    }

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  test('returns null when GWN_DB_DELAY_MS is not set', () => {
    delete process.env.GWN_DB_DELAY_MS;
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    expect(createDelayMiddleware()).toBeNull();
  });

  test('returns null when NODE_ENV is production', () => {
    process.env.GWN_DB_DELAY_MS = '5000';
    process.env.NODE_ENV = 'production';
    const { createDelayMiddleware } = freshRequire();
    expect(createDelayMiddleware()).toBeNull();
  });

  test('returns null when NODE_ENV is staging', () => {
    process.env.GWN_DB_DELAY_MS = '5000';
    process.env.NODE_ENV = 'staging';
    const { createDelayMiddleware } = freshRequire();
    expect(createDelayMiddleware()).toBeNull();
  });

  test('delays /api/ routes by configured amount', () => {
    vi.useFakeTimers();
    process.env.GWN_DB_DELAY_MS = '5000';
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
});
