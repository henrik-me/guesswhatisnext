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
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      // No sql passed, no DATABASE_URL — must NOT throw, must return a
      // self-describing skip result, and must emit the documented one-line
      // skip note.
      const result = await cleanupSmokeRow(42);
      expect(result).toEqual({ status: 'skip', reason: 'no DATABASE_URL', id: 42 });
      const skipped = logSpy.mock.calls.some(([msg]) =>
        /cleanup: DATABASE_URL unset — skipping self-cleanup for id=42/i.test(String(msg))
      );
      expect(skipped).toBe(true);
    } finally {
      logSpy.mockRestore();
      if (prev !== undefined) process.env.DATABASE_URL = prev;
    }
  });

  it('issues a parameterized DELETE scope-guarded by gwn-smoke-bot username', async () => {
    const fake = makeFakeSql({ deleteHandler: () => ({ rowsAffected: [1] }) });
    const result = await cleanupSmokeRow(123, {
      sql: fake.sql,
      connectionString: 'Server=foo;Database=bar;',
    });
    expect(result.status).toBe('pass');
    expect(result.id).toBe(123);
    expect(result.rowsAffected).toBe(1);
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

  it('logs a warning AND returns warn status when rowsAffected is 0', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const fake = makeFakeSql({ deleteHandler: () => ({ rowsAffected: [0] }) });
      const result = await cleanupSmokeRow(99, {
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
      });
      expect(result.status).toBe('warn');
      expect(result.reason).toBe('rowsAffected=0');
      expect(result.id).toBe(99);
      const warned = logSpy.mock.calls.some(([msg]) => /WARN:.*deleted 0 rows.*id=99/i.test(String(msg)));
      expect(warned).toBe(true);
      // No duplicated [smoke] prefix in the WARN message.
      const dupPrefix = logSpy.mock.calls.some(([msg]) => /\[smoke\] \[smoke\]/i.test(String(msg)));
      expect(dupPrefix).toBe(false);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('fail-soft: a query error returns warn status, logs warning, closes pool, does NOT throw', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const fake = makeFakeSql({ deleteHandler: () => { throw new Error('connect timeout'); } });
      const result = await cleanupSmokeRow(7, {
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
      });
      expect(result.status).toBe('warn');
      expect(result.reason).toBe('query error');
      expect(result.error).toBe('connect timeout');
      const warned = logSpy.mock.calls.some(([msg]) => /WARN: cleanup failed.*id=7.*connect timeout/i.test(String(msg)));
      expect(warned).toBe(true);
      expect(fake.close).toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });
});
