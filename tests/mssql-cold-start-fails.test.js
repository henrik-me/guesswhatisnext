/**
 * GWN_SIMULATE_COLD_START_FAILS=N — env-var-controlled "first N connects
 * throw transient ETIMEOUT" simulator in the mssql adapter (CS53-10).
 *
 * Validates the slow-retry init loop + isTransientDbError classifier at
 * the integration boundary by reproducing the failure mode that Azure
 * SQL serverless exhibits during a real cold-start (multiple connect
 * attempts time out before resume).
 *
 * Asserts:
 *   1. When unset (or "0"), _connect() never throws from the simulator.
 *   2. When set to "3", attempts 1–3 throw ETIMEOUT, attempt 4 succeeds.
 *   3. The thrown error's shape (name/code) is what isTransientDbError
 *      classifies as transient — so the central error handler emits
 *      503 + Retry-After and the SPA's warmup loop can retry.
 *   4. Strict numeric parsing — non-digit values fail closed (no throw).
 *   5. The connect-attempt counter is process-lifetime (resets only via
 *      MssqlAdapter._resetSimulators(), not per-adapter-instance) — so
 *      "first N" semantics survive multiple adapter instances during a
 *      single process lifetime.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const MssqlAdapter = require('../server/db/mssql-adapter');
const { isTransientDbError } = require('../server/lib/transient-db-error');

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

describe('GWN_SIMULATE_COLD_START_FAILS (CS53-10)', () => {
  beforeEach(() => {
    delete process.env.GWN_SIMULATE_COLD_START_FAILS;
    delete process.env.GWN_SIMULATE_COLD_START_MS;
    delete process.env.GWN_SIMULATE_DB_UNAVAILABLE;
    MssqlAdapter._resetSimulators();
  });

  it('does not throw when env var is unset', async () => {
    const sql = makeMockSql();
    const adapter = new MssqlAdapter('Server=test', { mssql: sql });
    await expect(adapter._connect()).resolves.toBeUndefined();
    expect(sql.connect).toHaveBeenCalledTimes(1);
  });

  it('does not throw when env var is "0"', async () => {
    process.env.GWN_SIMULATE_COLD_START_FAILS = '0';
    const sql = makeMockSql();
    const adapter = new MssqlAdapter('Server=test', { mssql: sql });
    await expect(adapter._connect()).resolves.toBeUndefined();
    expect(sql.connect).toHaveBeenCalledTimes(1);
  });

  it('throws on attempts 1..N then succeeds on attempt N+1', async () => {
    process.env.GWN_SIMULATE_COLD_START_FAILS = '3';
    const sql = makeMockSql();
    const adapter = new MssqlAdapter('Server=test', { mssql: sql });

    await expect(adapter._connect()).rejects.toMatchObject({ name: 'ConnectionError', code: 'ETIMEOUT' });
    await expect(adapter._connect()).rejects.toMatchObject({ name: 'ConnectionError', code: 'ETIMEOUT' });
    await expect(adapter._connect()).rejects.toMatchObject({ name: 'ConnectionError', code: 'ETIMEOUT' });
    // 4th attempt — limit exceeded, real connect proceeds.
    await expect(adapter._connect()).resolves.toBeUndefined();
    expect(sql.connect).toHaveBeenCalledTimes(1);
  });

  it('thrown error is classified as transient (retry path lights up)', async () => {
    process.env.GWN_SIMULATE_COLD_START_FAILS = '1';
    const adapter = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
    let err = null;
    try { await adapter._connect(); } catch (e) { err = e; }
    expect(isTransientDbError(err, 'mssql')).toBe(true);
  });

  it('strict numeric parsing — non-digit values fail closed', async () => {
    process.env.GWN_SIMULATE_COLD_START_FAILS = '3x';
    const sql = makeMockSql();
    const adapter = new MssqlAdapter('Server=test', { mssql: sql });
    await expect(adapter._connect()).resolves.toBeUndefined();
    expect(sql.connect).toHaveBeenCalledTimes(1);
  });

  it('counter is process-lifetime — survives multiple adapter instances', async () => {
    process.env.GWN_SIMULATE_COLD_START_FAILS = '2';
    const a1 = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
    const a2 = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
    const a3 = new MssqlAdapter('Server=test', { mssql: makeMockSql() });

    await expect(a1._connect()).rejects.toThrow(); // attempt 1
    await expect(a2._connect()).rejects.toThrow(); // attempt 2
    await expect(a3._connect()).resolves.toBeUndefined(); // attempt 3 → success
  });
});
