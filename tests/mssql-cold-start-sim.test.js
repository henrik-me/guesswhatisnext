/**
 * GWN_SIMULATE_COLD_START_MS — env-var-controlled first-connect delay in
 * the mssql adapter. CS53 / Policy 2.
 *
 * Asserts:
 *   1. When unset, _connect() does not delay.
 *   2. When set to a positive integer, the FIRST _connect() after
 *      MssqlAdapter._resetColdStart() sleeps ~ that many ms.
 *   3. The SECOND _connect() is not delayed (process-lifetime one-shot).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const MssqlAdapter = require('../server/db/mssql-adapter');

function makeMockSql() {
  return {
    connect: vi.fn().mockResolvedValue({ request: vi.fn(), close: vi.fn() }),
    Request: function () {},
    Transaction: function () {},
    ConnectionPool: {
      parseConnectionString: vi.fn(() => ({ server: 'test', options: {} })),
    },
  };
}

describe('GWN_SIMULATE_COLD_START_MS', () => {
  beforeEach(() => {
    delete process.env.GWN_SIMULATE_COLD_START_MS;
    MssqlAdapter._resetColdStart();
  });

  it('does not delay when env var is unset', async () => {
    const adapter = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
    const start = Date.now();
    await adapter._connect();
    expect(Date.now() - start).toBeLessThan(200);
  });

  it('does not delay when env var is non-positive', async () => {
    process.env.GWN_SIMULATE_COLD_START_MS = '0';
    const adapter = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
    const start = Date.now();
    await adapter._connect();
    expect(Date.now() - start).toBeLessThan(200);
  });

  it('delays the FIRST _connect() by ~configured ms then does not delay subsequent connects', async () => {
    // Use fake timers so we can deterministically advance through the
    // simulated sleep (avoids real wall-clock waits in the unit suite).
    vi.useFakeTimers();
    try {
      process.env.GWN_SIMULATE_COLD_START_MS = '50';

      const a1 = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
      let firstResolved = false;
      const firstConnect = a1._connect().then(() => { firstResolved = true; });

      // Yield once so the await inside _connect schedules its setTimeout.
      await Promise.resolve();
      expect(firstResolved).toBe(false);

      // Advance just under the threshold; first connect must still be pending.
      await vi.advanceTimersByTimeAsync(49);
      expect(firstResolved).toBe(false);

      // Cross the threshold; first connect resolves.
      await vi.advanceTimersByTimeAsync(1);
      await firstConnect;
      expect(firstResolved).toBe(true);

      // Second connect on a fresh adapter — same process, flag is consumed.
      const a2 = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
      let secondResolved = false;
      const secondConnect = a2._connect().then(() => { secondResolved = true; });

      // Yield microtasks; without a sleep being scheduled the promise resolves.
      await vi.advanceTimersByTimeAsync(0);
      await secondConnect;
      expect(secondResolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
