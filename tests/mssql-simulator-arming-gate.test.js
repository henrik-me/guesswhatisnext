/**
 * GWN_ENABLE_DB_CONNECT_SIMULATORS arming gate (CS53-10 / PR #301 GPT-5.4 review).
 *
 * The two CS53-10 simulator env vars (GWN_SIMULATE_DB_UNAVAILABLE,
 * GWN_SIMULATE_COLD_START_FAILS) MUST be inert unless this arming gate
 * is also set to "1". Rationale: docker-compose.mssql.yml runs the
 * container with NODE_ENV=production by design, so we cannot use NODE_ENV
 * as the safety gate. A separate explicit arming env var is the
 * belt-and-suspenders that prevents an accidentally-leaked SIMULATE_*
 * var in a real Container Apps deployment from converting the live DB
 * into a fake-failure surface.
 *
 * Asserts:
 *   1. Without the gate, GWN_SIMULATE_DB_UNAVAILABLE=capacity_exhausted
 *      does NOT throw — _connect proceeds normally.
 *   2. Without the gate, GWN_SIMULATE_DB_UNAVAILABLE=transient does NOT throw.
 *   3. Without the gate, GWN_SIMULATE_COLD_START_FAILS=N does NOT throw.
 *   4. In all 3 unarmed cases, an audit-trail Pino warn fires with
 *      `gate=simulated-unavailable` and `mode=unarmed:*` so the leak is
 *      surfaced via KQL § B.16.
 *   5. With the gate, the corresponding sims fire as expected (regression
 *      cover for the audit-trail payload shape — gate/mode/attempt fields
 *      present, per the suggestion in GPT-5.4's review).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const MssqlAdapter = require('../server/db/mssql-adapter');
const logger = require('../server/logger');

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

describe('GWN_ENABLE_DB_CONNECT_SIMULATORS arming gate (CS53-10)', () => {
  let warnSpy;
  beforeEach(() => {
    delete process.env.GWN_ENABLE_DB_CONNECT_SIMULATORS;
    delete process.env.GWN_SIMULATE_DB_UNAVAILABLE;
    delete process.env.GWN_SIMULATE_COLD_START_FAILS;
    delete process.env.GWN_SIMULATE_COLD_START_MS;
    MssqlAdapter._resetSimulators();
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  function unarmedFires() {
    return warnSpy.mock.calls.filter(c => c[0] && c[0].gate === 'simulated-unavailable' && /^unarmed:/.test(c[0].mode));
  }
  function armedFires() {
    return warnSpy.mock.calls.filter(c => c[0] && c[0].gate === 'simulated-unavailable' && !/^unarmed:/.test(c[0].mode));
  }

  describe('without arming gate — sims are inert but audit-logged', () => {
    it('GWN_SIMULATE_DB_UNAVAILABLE=capacity_exhausted does NOT throw', async () => {
      process.env.GWN_SIMULATE_DB_UNAVAILABLE = 'capacity_exhausted';
      const sql = makeMockSql();
      const adapter = new MssqlAdapter('Server=test', { mssql: sql });
      await expect(adapter._connect()).resolves.toBeUndefined();
      expect(sql.connect).toHaveBeenCalledTimes(1);
      const fires = unarmedFires();
      expect(fires).toHaveLength(1);
      expect(fires[0][0]).toMatchObject({
        gate: 'simulated-unavailable',
        mode: 'unarmed:capacity_exhausted',
      });
      expect(typeof fires[0][0].attempt).toBe('number');
    });

    it('GWN_SIMULATE_DB_UNAVAILABLE=transient does NOT throw', async () => {
      process.env.GWN_SIMULATE_DB_UNAVAILABLE = 'transient';
      const sql = makeMockSql();
      const adapter = new MssqlAdapter('Server=test', { mssql: sql });
      await expect(adapter._connect()).resolves.toBeUndefined();
      expect(sql.connect).toHaveBeenCalledTimes(1);
      const fires = unarmedFires();
      expect(fires).toHaveLength(1);
      expect(fires[0][0]).toMatchObject({
        gate: 'simulated-unavailable',
        mode: 'unarmed:transient',
      });
    });

    it('GWN_SIMULATE_COLD_START_FAILS=3 does NOT throw', async () => {
      process.env.GWN_SIMULATE_COLD_START_FAILS = '3';
      const sql = makeMockSql();
      const adapter = new MssqlAdapter('Server=test', { mssql: sql });
      await expect(adapter._connect()).resolves.toBeUndefined();
      expect(sql.connect).toHaveBeenCalledTimes(1);
      const fires = unarmedFires();
      expect(fires).toHaveLength(1);
      expect(fires[0][0]).toMatchObject({
        gate: 'simulated-unavailable',
        mode: 'unarmed:cold-start-fails',
        limit: 3,
      });
    });

    it('an empty arming gate value (not "1") is also treated as unarmed', async () => {
      process.env.GWN_ENABLE_DB_CONNECT_SIMULATORS = 'true';
      process.env.GWN_SIMULATE_DB_UNAVAILABLE = 'capacity_exhausted';
      const sql = makeMockSql();
      const adapter = new MssqlAdapter('Server=test', { mssql: sql });
      await expect(adapter._connect()).resolves.toBeUndefined();
      expect(unarmedFires()).toHaveLength(1);
    });
  });

  describe('with arming gate — sims fire and emit the documented audit payload', () => {
    beforeEach(() => {
      process.env.GWN_ENABLE_DB_CONNECT_SIMULATORS = '1';
    });

    it('capacity_exhausted: payload contains gate, mode, attempt', async () => {
      process.env.GWN_SIMULATE_DB_UNAVAILABLE = 'capacity_exhausted';
      const adapter = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
      await expect(adapter._connect()).rejects.toThrow();
      const fires = armedFires();
      expect(fires).toHaveLength(1);
      expect(fires[0][0]).toMatchObject({
        gate: 'simulated-unavailable',
        mode: 'capacity_exhausted',
      });
      expect(fires[0][0].attempt).toBe(1);
    });

    it('transient: payload contains gate, mode, attempt', async () => {
      process.env.GWN_SIMULATE_DB_UNAVAILABLE = 'transient';
      const adapter = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
      await expect(adapter._connect()).rejects.toThrow();
      const fires = armedFires();
      expect(fires).toHaveLength(1);
      expect(fires[0][0]).toMatchObject({
        gate: 'simulated-unavailable',
        mode: 'transient',
      });
      expect(fires[0][0].attempt).toBe(1);
    });

    it('cold-start-fails: payload contains gate, mode, attempt, limit', async () => {
      process.env.GWN_SIMULATE_COLD_START_FAILS = '2';
      const adapter = new MssqlAdapter('Server=test', { mssql: makeMockSql() });
      await expect(adapter._connect()).rejects.toThrow();
      const fires = armedFires();
      expect(fires).toHaveLength(1);
      expect(fires[0][0]).toMatchObject({
        gate: 'simulated-unavailable',
        mode: 'cold-start-fails',
        limit: 2,
      });
      expect(fires[0][0].attempt).toBe(1);
    });
  });
});
