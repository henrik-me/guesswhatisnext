import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { cleanupSmokeRow } = require('../scripts/smoke.js');

/**
 * Tests for scripts/smoke.js#cleanupSmokeRow (CS81-2). Mocks the `mssql`
 * module via the `sql` DI seam — no live DB needed. Asserts the
 * scope-guarded DELETE, the parameter bindings, the fail-soft skip when
 * DATABASE_URL is unset, and that the pool is closed even on error.
 */
function makeFakeSql({ deleteHandler } = {}) {
  const close = vi.fn().mockResolvedValue(undefined);
  const queries = [];
  const inputsByCall = [];

  class FakeRequest {
    constructor() { this.inputs = {}; }
    input(name, _type, value) { this.inputs[name] = value; return this; }
    async query(sqlStr) {
      queries.push(sqlStr);
      inputsByCall.push({ ...this.inputs });
      if (deleteHandler) return deleteHandler(sqlStr, { ...this.inputs });
      return { rowsAffected: [1] };
    }
  }
  class FakeConnectionPool {
    constructor(config) {
      this.config = config;
      this.close = close;
      this.connect = vi.fn().mockResolvedValue(undefined);
      this.request = vi.fn(() => new FakeRequest());
    }
  }
  FakeConnectionPool.parseConnectionString = vi.fn(() => ({ options: { encrypt: true } }));
  return {
    sql: { ConnectionPool: FakeConnectionPool, Int: 'Int', NVarChar: 'NVarChar' },
    close, queries, inputsByCall,
  };
}

describe('scripts/smoke.js#cleanupSmokeRow (CS81-2)', () => {
  it('skips with a one-line note when DATABASE_URL is unset (no sql require, no throw)', async () => {
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      // No sql passed, no DATABASE_URL — must NOT throw, must return cleanly.
      const result = await cleanupSmokeRow(42);
      expect(result).toBeUndefined();
    } finally {
      if (prev !== undefined) process.env.DATABASE_URL = prev;
    }
  });

  it('issues a parameterized DELETE scope-guarded by gwn-smoke-bot username', async () => {
    const fake = makeFakeSql({ deleteHandler: () => ({ rowsAffected: [1] }) });
    await cleanupSmokeRow(123, {
      sql: fake.sql,
      connectionString: 'Server=foo;Database=bar;',
    });
    expect(fake.queries).toHaveLength(1);
    const q = fake.queries[0];
    // Scope guard: id AND user_id subquery on username.
    expect(q).toMatch(/DELETE FROM scores/i);
    expect(q).toMatch(/WHERE id = @id/i);
    expect(q).toMatch(/AND user_id = \(SELECT id FROM users WHERE username = @username\)/i);
    // No string-interpolated literals.
    expect(q).not.toMatch(/= ?\d+/);
    expect(q).not.toMatch(/'gwn-smoke-bot'/);
    // Bindings.
    expect(fake.inputsByCall[0]).toEqual({ id: 123, username: 'gwn-smoke-bot' });
    // Pool closed in finally.
    expect(fake.close).toHaveBeenCalled();
  });

  it('logs a warning when rowsAffected is 0 (already gone or not owned by smoke bot)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const fake = makeFakeSql({ deleteHandler: () => ({ rowsAffected: [0] }) });
      await cleanupSmokeRow(99, {
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
      });
      const warned = logSpy.mock.calls.some(([msg]) => /WARN:.*deleted 0 rows.*id=99/i.test(String(msg)));
      expect(warned).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('fail-soft: a query error logs a warning and closes the pool but does NOT throw', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const fake = makeFakeSql({ deleteHandler: () => { throw new Error('connect timeout'); } });
      // Must NOT throw — the smoke step is fail-soft.
      await cleanupSmokeRow(7, {
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
      });
      const warned = logSpy.mock.calls.some(([msg]) => /WARN: cleanup failed.*id=7.*connect timeout/i.test(String(msg)));
      expect(warned).toBe(true);
      expect(fake.close).toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });
});
