/**
 * CS53-13.A — POST /api/telemetry/auth-deadline-exhausted
 *
 * Validates the beacon route fired by the auth retry loop in public/js/app.js
 * when AUTH_WARMUP_DEADLINE_MS (120s) is exhausted without a 200.
 */

const { getAgent, setup, teardown } = require('./helper');

beforeAll(setup);
afterAll(teardown);

let ipCounter = 0;
function postBeacon() {
  ipCounter += 1;
  return getAgent()
    .post('/api/telemetry/auth-deadline-exhausted')
    .set('X-Forwarded-For', `198.51.100.${100 + (ipCounter % 50)}`);
}

// helper.setup() clears the require cache for server/* — the live logger the
// route uses isn't loaded until then. Resolve fresh on each call so we always
// spy on the same singleton instance the express handler will invoke.
function liveLogger() {
  return require('../server/logger');
}

async function captureWarn(fn) {
  const spy = vi.spyOn(liveLogger(), 'warn').mockImplementation(() => {});
  try {
    await fn();
    return spy.mock.calls.map((c) => c.slice());
  } finally {
    spy.mockRestore();
  }
}

describe('POST /api/telemetry/auth-deadline-exhausted', () => {
  test('accepts valid payload, emits structured Pino warn, returns 204', async () => {
    let response;
    const calls = await captureWarn(async () => {
      response = await postBeacon().send({
        attempts: 7,
        elapsedMs: 119500,
        lastStatus: 503,
        action: 'login',
      });
    });


    expect(response.status).toBe(204);
    expect(response.body).toEqual({});

    const matching = calls.filter(([ctx]) => ctx && ctx.event === 'auth-warmup-deadline-exhausted');
    expect(matching).toHaveLength(1);
    const [ctx, msg] = matching[0];
    expect(ctx).toMatchObject({
      event: 'auth-warmup-deadline-exhausted',
      attempts: 7,
      elapsedMs: 119500,
      lastStatus: 503,
      action: 'login',
    });
    expect(typeof ctx.ip).toBe('string');
    expect(ctx.ip.length).toBeGreaterThan(0);
    expect(typeof msg).toBe('string');
  });

  test('accepts null lastStatus (no response ever received)', async () => {
    const res = await postBeacon().send({
      attempts: 3,
      elapsedMs: 60000,
      lastStatus: null,
      action: 'register',
    });
    expect(res.status).toBe(204);
  });

  test('rejects invalid action and does NOT log the event', async () => {
    let response;
    const calls = await captureWarn(async () => {
      response = await postBeacon().send({
        attempts: 5, elapsedMs: 120000, lastStatus: 503, action: 'logout',
      });
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/action/);
    expect(calls.filter(([c]) => c && c.event === 'auth-warmup-deadline-exhausted')).toHaveLength(0);
  });

  test('rejects missing attempts and does NOT log the event', async () => {
    let response;
    const calls = await captureWarn(async () => {
      response = await postBeacon().send({
        elapsedMs: 120000, lastStatus: 503, action: 'login',
      });
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/attempts/);
    expect(calls.filter(([c]) => c && c.event === 'auth-warmup-deadline-exhausted')).toHaveLength(0);
  });

  test('rejects negative attempts', async () => {
    const res = await postBeacon().send({
      attempts: -1, elapsedMs: 1, lastStatus: null, action: 'login',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/attempts/);
  });

  test('rejects non-numeric elapsedMs', async () => {
    const res = await postBeacon().send({
      attempts: 1, elapsedMs: 'soon', lastStatus: null, action: 'login',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/elapsedMs/);
  });

  test('rejects out-of-range lastStatus', async () => {
    const res = await postBeacon().send({
      attempts: 1, elapsedMs: 1, lastStatus: 42, action: 'login',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lastStatus/);
  });

  test('rejects malformed JSON body', async () => {
    const res = await getAgent()
      .post('/api/telemetry/auth-deadline-exhausted')
      .set('Content-Type', 'application/json')
      .set('X-Forwarded-For', '198.51.100.250')
      .send('{"action":');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Malformed JSON body');
  });

  test('does not require authentication', async () => {
    const res = await postBeacon().send({
      attempts: 1, elapsedMs: 120000, lastStatus: null, action: 'login',
    });
    expect(res.status).toBe(204);
  });
});
