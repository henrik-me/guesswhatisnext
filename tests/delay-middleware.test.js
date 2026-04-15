/**
 * Unit tests for the delay simulation middleware.
 */

const path = require('path');

const DELAY_MODULE = path.resolve(__dirname, '..', 'server', 'middleware', 'delay.js');

function freshRequire() {
  delete require.cache[DELAY_MODULE];
  // Also clear logger cache so require('../logger') doesn't fail with stale state
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
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
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

  test('delays /api/ routes by configured amount', async () => {
    process.env.GWN_DB_DELAY_MS = '100';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();
    expect(mw).not.toBeNull();

    const { req, res } = mockReqRes('/api/scores');
    const start = Date.now();
    await new Promise((resolve) => mw(req, res, resolve));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(80);
  });

  test('does NOT delay /api/health', async () => {
    process.env.GWN_DB_DELAY_MS = '500';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();

    const { req, res } = mockReqRes('/api/health');
    const start = Date.now();
    await new Promise((resolve) => mw(req, res, resolve));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  test('does NOT delay /api/admin/* routes', async () => {
    process.env.GWN_DB_DELAY_MS = '500';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();

    const { req, res } = mockReqRes('/api/admin/drain');
    const start = Date.now();
    await new Promise((resolve) => mw(req, res, resolve));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  test('does NOT delay non-api routes', async () => {
    process.env.GWN_DB_DELAY_MS = '500';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();

    const { req, res } = mockReqRes('/');
    const start = Date.now();
    await new Promise((resolve) => mw(req, res, resolve));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  test('delay is capped at 45000ms', () => {
    process.env.GWN_DB_DELAY_MS = '99999';
    process.env.NODE_ENV = 'test';
    const { createDelayMiddleware } = freshRequire();
    const mw = createDelayMiddleware();
    expect(mw).not.toBeNull();

    // Verify the cap by checking that the middleware was created (not null)
    // and that a short request completes in bounded time — we verify the actual
    // cap value by inspecting the setTimeout argument via a spy.
    const origSetTimeout = global.setTimeout;
    let capturedDelay;
    global.setTimeout = (fn, ms) => {
      capturedDelay = ms;
      return origSetTimeout(fn, 0); // resolve immediately for test speed
    };
    try {
      const { req, res } = mockReqRes('/api/scores');
      mw(req, res, () => {});
      expect(capturedDelay).toBe(45000);
    } finally {
      global.setTimeout = origSetTimeout;
    }
  });
});
