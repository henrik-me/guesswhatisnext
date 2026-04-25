/**
 * CS53-12: regression guard for the ServerResponse `'finish'` listener leak
 * warning that surfaced in production logs ("MaxListenersExceededWarning:
 * Possible EventEmitter memory leak detected. 11 finish listeners added to
 * [ServerResponse]").
 *
 * Root cause: @opentelemetry/instrumentation-express attaches
 * `res.once('finish', ...)` per Express layer. With our middleware stack the
 * count briefly exceeds Node's default cap of 10 — those listeners are `.once`
 * and self-remove, so the warning is a false positive but still log spam and
 * masks real leaks.
 *
 * Fix: bump per-response max listeners in the request-tracking middleware
 * (server/app.js).
 *
 * This test verifies BOTH halves of the contract:
 *   (a) the cap is actually raised — checked directly via the test-only
 *       `X-Test-Max-Listeners` header that the middleware echoes when
 *       NODE_ENV=test;
 *   (b) under heavy concurrent load no MaxListenersExceededWarning fires
 *       (catches regressions from middleware that adds non-`.once` listeners).
 */

const { getAgent, setup, teardown } = require('./helper');

beforeAll(setup);
afterAll(teardown);

describe('CS53-12: ServerResponse finish-listener cap', () => {
  test('per-response max listeners is raised to 32', async () => {
    const agent = getAgent();
    const res = await agent.get('/api/scores/me').set('Authorization', 'Bearer invalid');
    expect([200, 401, 503]).toContain(res.status);
    expect(res.headers['x-test-max-listeners']).toBe('32');
  });

  test('no MaxListenersExceededWarning under concurrent load', async () => {
    const agent = getAgent();
    const warnings = [];
    const onWarning = (w) => {
      if (w && w.name === 'MaxListenersExceededWarning') warnings.push(w);
    };
    process.on('warning', onWarning);

    try {
      const results = await Promise.all(
        Array.from({ length: 50 }, () =>
          agent.get('/api/scores/me').set('Authorization', 'Bearer invalid')
        )
      );
      // All should reach the auth layer — confirms middleware chain ran.
      for (const r of results) expect([200, 401, 503]).toContain(r.status);
    } finally {
      process.removeListener('warning', onWarning);
    }

    expect(warnings).toEqual([]);
  });
});
