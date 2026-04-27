/**
 * GWN_SIMULATE_DB_UNAVAILABLE — env-var-controlled connect-time error
 * simulator in the mssql adapter (CS53-10).
 *
 * Asserts:
 *   1. When unset, _connect() proceeds normally (no throw).
 *   2. When set to "capacity_exhausted", _connect() throws an error whose
 *      shape (name/code/message) matches what isTransientDbError() AND
 *      getDbUnavailability() expect for the Azure SQL Free Tier
 *      capacity-exhausted state — i.e. classifier returns
 *      { reason: 'capacity-exhausted', ... } and isTransientDbError = false.
 *   3. When set to "transient", _connect() throws an ETIMEOUT-shaped error
 *      that isTransientDbError() classifies as true and getDbUnavailability()
 *      classifies as null.
 *   4. Unknown mode is fail-closed (no throw — treated as no-op).
 *   5. The simulator throws on EVERY connect (not one-shot like
 *      GWN_SIMULATE_COLD_START_MS).
 *
 * Together these prove the simulator faithfully reproduces the prod
 * error shapes that drive the central error handler's 503 paths.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const MssqlAdapter = require('../server/db/mssql-adapter');
const { isTransientDbError, getDbUnavailability } = require('../server/lib/transient-db-error');

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

describe('GWN_SIMULATE_DB_UNAVAILABLE (CS53-10)', () => {
  beforeEach(() => {
    delete process.env.GWN_SIMULATE_DB_UNAVAILABLE;
    delete process.env.GWN_SIMULATE_COLD_START_MS;
    delete process.env.GWN_SIMULATE_COLD_START_FAILS;
    MssqlAdapter._resetSimulators();
  });

  it('proceeds normally when env var is unset', async () => {
    const sql = makeMockSql();
    const adapter = new MssqlAdapter('Server=test', { mssql: sql });
    await expect(adapter._connect()).resolves.toBeUndefined();
    expect(sql.connect).toHaveBeenCalledTimes(1);
  });

  describe('mode=capacity_exhausted', () => {
    it('throws an error whose shape matches Azure SQL Free Tier capacity-exhausted', async () => {
      process.env.GWN_SIMULATE_DB_UNAVAILABLE = 'capacity_exhausted';
      const sql = makeMockSql();
      const adapter = new MssqlAdapter('Server=test', { mssql: sql });

      await expect(adapter._connect()).rejects.toMatchObject({
        name: 'ConnectionError',
        code: 'ELOGIN',
      });
      // Real connect was never reached.
      expect(sql.connect).not.toHaveBeenCalled();
    });

    it('produces a message that getDbUnavailability classifies as capacity-exhausted', async () => {
      process.env.GWN_SIMULATE_DB_UNAVAILABLE = 'capacity_exhausted';
      const adapter = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
      let err = null;
      try { await adapter._connect(); } catch (e) { err = e; }
      expect(err).not.toBeNull();
      const u = getDbUnavailability(err, 'mssql');
      expect(u).toMatchObject({ reason: 'capacity-exhausted' });
      expect(u.message).toMatch(/free capacity allowance|paused/i);
    });

    it('is classified as NOT transient (the request gate must NOT retry it)', async () => {
      process.env.GWN_SIMULATE_DB_UNAVAILABLE = 'capacity_exhausted';
      const adapter = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
      let err = null;
      try { await adapter._connect(); } catch (e) { err = e; }
      expect(isTransientDbError(err, 'mssql')).toBe(false);
    });

    it('throws on EVERY connect, not just the first', async () => {
      process.env.GWN_SIMULATE_DB_UNAVAILABLE = 'capacity_exhausted';
      const adapter = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
      await expect(adapter._connect()).rejects.toThrow();
      await expect(adapter._connect()).rejects.toThrow();
      await expect(adapter._connect()).rejects.toThrow();
    });
  });

  describe('mode=transient', () => {
    it('throws an ETIMEOUT-shaped error', async () => {
      process.env.GWN_SIMULATE_DB_UNAVAILABLE = 'transient';
      const adapter = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
      await expect(adapter._connect()).rejects.toMatchObject({
        name: 'ConnectionError',
        code: 'ETIMEOUT',
      });
    });

    it('is classified as transient (request gate WILL retry it) and not as unavailable', async () => {
      process.env.GWN_SIMULATE_DB_UNAVAILABLE = 'transient';
      const adapter = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
      let err = null;
      try { await adapter._connect(); } catch (e) { err = e; }
      expect(isTransientDbError(err, 'mssql')).toBe(true);
      expect(getDbUnavailability(err, 'mssql')).toBeNull();
    });
  });

  it('unknown mode is fail-closed (no throw, real connect proceeds)', async () => {
    process.env.GWN_SIMULATE_DB_UNAVAILABLE = 'definitely-not-a-mode';
    const sql = makeMockSql();
    const adapter = new MssqlAdapter('Server=test', { mssql: sql });
    await expect(adapter._connect()).resolves.toBeUndefined();
    expect(sql.connect).toHaveBeenCalledTimes(1);
  });
});
