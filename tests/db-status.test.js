/**
 * CS53-8b — GET /api/db-status
 *
 * Public ops endpoint exposing in-memory DB-init state WITHOUT any DB
 * query. Validates:
 *   1. 200 + JSON shape { dbInitialized, isInFlight, unavailability }.
 *   2. Bypasses the request gate (works even when DB not initialized).
 *   3. No DB query is issued (asserted by spying on the live adapter
 *      after init).
 *   4. Pino info `event=db-status-probe` fires on each request with the
 *      documented field set so KQL § B.17 can count probes.
 *   5. Reflects the live `unavailability` state after
 *      setDbUnavailabilityState() flips it.
 */

const { getAgent, setup, teardown } = require('./helper');

beforeAll(setup);
afterAll(teardown);

function liveLogger() {
  return require('../server/logger');
}
function liveDbUnavailabilityState() {
  // Must be re-required after setup() — helper clears the require cache
  // for server/* so a top-level require would point at a stale module.
  return require('../server/lib/db-unavailability-state');
}

async function captureInfo(fn) {
  const spy = vi.spyOn(liveLogger(), 'info').mockImplementation(() => {});
  try {
    await fn();
    return spy.mock.calls.map((c) => c.slice());
  } finally {
    spy.mockRestore();
  }
}

function probeCalls(calls) {
  return calls.filter((c) => c[0] && c[0].event === 'db-status-probe');
}

describe('GET /api/db-status (CS53-8b)', () => {
  beforeEach(() => {
    liveDbUnavailabilityState().__resetForTests();
  });

  test('returns 200 with documented shape', async () => {
    const res = await getAgent().get('/api/db-status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      dbInitialized: expect.any(Boolean),
      isInFlight: expect.any(Boolean),
    });
    expect(Object.prototype.hasOwnProperty.call(res.body, 'unavailability')).toBe(true);
  });

  test('emits structured Pino info per request with full field set', async () => {
    const calls = await captureInfo(async () => {
      await getAgent().get('/api/db-status').expect(200);
    });
    const probes = probeCalls(calls);
    expect(probes).toHaveLength(1);
    expect(probes[0][0]).toMatchObject({
      event: 'db-status-probe',
      dbInitialized: expect.any(Boolean),
      isInFlight: expect.any(Boolean),
      unavailable: expect.any(Boolean),
    });
  });

  test('reflects setDbUnavailabilityState updates without a DB round-trip', async () => {
    liveDbUnavailabilityState().setDbUnavailabilityState({
      reason: 'capacity-exhausted',
      message: 'paused (test)',
    });
    const res = await getAgent().get('/api/db-status');
    expect(res.status).toBe(200);
    expect(res.body.unavailability).toMatchObject({
      reason: 'capacity-exhausted',
      message: 'paused (test)',
    });
    // And the probe log carries the reason field.
    const calls = await captureInfo(async () => {
      await getAgent().get('/api/db-status').expect(200);
    });
    expect(probeCalls(calls)[0][0]).toMatchObject({
      unavailable: true,
      unavailabilityReason: 'capacity-exhausted',
    });
  });

  test('clears back to null when state is reset', async () => {
    const s = liveDbUnavailabilityState();
    s.setDbUnavailabilityState({ reason: 'capacity-exhausted', message: 'x' });
    s.setDbUnavailabilityState(null);
    const res = await getAgent().get('/api/db-status').expect(200);
    expect(res.body.unavailability).toBeNull();
  });

  test('does NOT touch the DB (no adapter calls) — confirms no-DB-wake contract', async () => {
    // Spy on the live adapter's primary read methods. Any of them being
    // called during the request would mean the handler accidentally
    // touched the DB — violation of the CS53-8b "in-memory only" rule.
    const { getDbAdapter } = require('../server/db');
    const adapter = await getDbAdapter();
    const getSpy = vi.spyOn(adapter, 'get');
    const allSpy = vi.spyOn(adapter, 'all');
    const runSpy = vi.spyOn(adapter, 'run');
    try {
      await getAgent().get('/api/db-status').expect(200);
      expect(getSpy).not.toHaveBeenCalled();
      expect(allSpy).not.toHaveBeenCalled();
      expect(runSpy).not.toHaveBeenCalled();
    } finally {
      getSpy.mockRestore();
      allSpy.mockRestore();
      runSpy.mockRestore();
    }
  });

  test('rate-limits at 30/min per IP (31st request returns 429)', async () => {
    // Send 31 requests from the same fixed IP. The first 30 must succeed;
    // the 31st must be 429. Use a fixed forwarded IP so the limiter
    // sees them as one client.
    const ip = '198.51.100.250';
    let firstFailureStatus = null;
    let successCount = 0;
    for (let i = 0; i < 31; i++) {
      const res = await getAgent().get('/api/db-status').set('X-Forwarded-For', ip);
      if (res.status === 200) successCount++;
      else { firstFailureStatus = res.status; break; }
    }
    expect(successCount).toBe(30);
    expect(firstFailureStatus).toBe(429);
  });
});
