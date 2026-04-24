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
    // Use a small but non-trivial delay to keep the test fast and tolerant
    // of CI clock jitter; the assertion is "first connect waits at least
    // ~most-of the configured ms; second connect does not wait".
    process.env.GWN_SIMULATE_COLD_START_MS = '50';

    const a1 = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
    const t1 = Date.now();
    await a1._connect();
    const elapsed1 = Date.now() - t1;
    expect(elapsed1).toBeGreaterThanOrEqual(40);

    // Second connect on a fresh adapter — same process, flag is consumed.
    const a2 = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
    const t2 = Date.now();
    await a2._connect();
    const elapsed2 = Date.now() - t2;
    // Allow a generous ceiling well under 50ms to keep this deterministic
    // across loaded CI runners while still proving "no ~50ms wait happened".
    expect(elapsed2).toBeLessThan(40);
  });
});
