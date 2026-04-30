/**
 * CS47 — POST /api/telemetry/ux-events
 */

const { trace } = require('@opentelemetry/api');
const { getAgent, setup, teardown } = require('./helper');

beforeAll(setup);
afterAll(teardown);

afterEach(() => {
  delete process.env.GWN_ENV;
  vi.restoreAllMocks();
});

let ipCounter = 0;
function postUxEvent(payload) {
  ipCounter += 1;
  return getAgent()
    .post('/api/telemetry/ux-events')
    .set('X-Forwarded-For', `198.51.101.${100 + (ipCounter % 50)}`)
    .send(payload);
}

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

const validPayload = Object.freeze({
  event: 'progressiveLoader.warmupExhausted',
  screen: 'leaderboard',
  outcome: 'success',
  attempts: 3,
  totalWaitMs: 12000,
});

function withoutField(payload, field) {
  const copy = { ...payload };
  delete copy[field];
  return copy;
}

describe('POST /api/telemetry/ux-events', () => {
  test('accepts valid payload, attaches environment, emits Pino and OTel, returns 204', async () => {
    process.env.GWN_ENV = 'local-container';
    const addEvent = vi.fn();
    vi.spyOn(trace, 'getActiveSpan').mockReturnValue({ addEvent });

    let response;
    const calls = await captureWarn(async () => {
      response = await postUxEvent(validPayload);
    });

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});

    const matching = calls.filter(([ctx]) => ctx && ctx.event === 'progressiveLoader.warmupExhausted');
    expect(matching).toHaveLength(1);
    const [ctx, msg] = matching[0];
    expect(ctx).toEqual({ ...validPayload, environment: 'local-container' });
    expect(msg).toBe('ProgressiveLoader warmup retry loop exited');

    expect(addEvent).toHaveBeenCalledWith('progressiveLoader.warmupExhausted', {
      ...validPayload,
      environment: 'local-container',
    });
  });

  test('maps NODE_ENV=test to local-container when GWN_ENV is unset', async () => {
    const calls = await captureWarn(async () => {
      const res = await postUxEvent({ ...validPayload, screen: 'profile', outcome: 'cap-exhausted' });
      expect(res.status).toBe(204);
    });
    const [ctx] = calls.find(([c]) => c && c.event === 'progressiveLoader.warmupExhausted');
    expect(ctx.environment).toBe('local-container');
  });

  test.each([
    ['event', { ...validPayload, event: 'wrong.event' }, /event/],
    ['screen', { ...validPayload, screen: 'settings' }, /screen/],
    ['outcome', { ...validPayload, outcome: 'failed' }, /outcome/],
    ['attempts missing', withoutField(validPayload, 'attempts'), /attempts/],
    ['attempts negative', { ...validPayload, attempts: -1 }, /attempts/],
    ['attempts too high', { ...validPayload, attempts: 51 }, /attempts/],
    ['attempts non-integer', { ...validPayload, attempts: 1.5 }, /attempts/],
    ['totalWaitMs missing', withoutField(validPayload, 'totalWaitMs'), /totalWaitMs/],
    ['totalWaitMs negative', { ...validPayload, totalWaitMs: -1 }, /totalWaitMs/],
    ['totalWaitMs too high', { ...validPayload, totalWaitMs: 600001 }, /totalWaitMs/],
    ['totalWaitMs non-integer', { ...validPayload, totalWaitMs: 1.5 }, /totalWaitMs/],
    ['client environment field', { ...validPayload, environment: 'production' }, /unexpected field/],
  ])('rejects invalid %s payload without logging', async (_name, payload, errorPattern) => {
    let response;
    const calls = await captureWarn(async () => {
      response = await postUxEvent(payload);
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(errorPattern);
    expect(calls.filter(([c]) => c && c.event === 'progressiveLoader.warmupExhausted')).toHaveLength(0);
  });

  test('rejects malformed JSON body', async () => {
    const res = await getAgent()
      .post('/api/telemetry/ux-events')
      .set('Content-Type', 'application/json')
      .set('X-Forwarded-For', '198.51.101.250')
      .send('{"event":');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Malformed JSON body');
  });

  test('does not require authentication', async () => {
    const res = await postUxEvent({ ...validPayload, screen: 'community', outcome: 'aborted', attempts: 0 });
    expect(res.status).toBe(204);
  });

  test('propagates invalid GWN_ENV as a server configuration error', async () => {
    process.env.GWN_ENV = 'dev';
    const res = await postUxEvent(validPayload);
    expect(res.status).toBe(500);
  });
});
