import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { cleanupTestData, main, SMOKE_USER } = require('../scripts/cleanup-test-data.js');

/**
 * Tests for scripts/cleanup-test-data.js (CS81-1). Mocks the `mssql` module
 * via the `sql` DI seam — no live DB needed. Mirrors the structure of
 * tests/wake-db-script.test.js.
 */
function makeFakeSql({ queryHandler } = {}) {
  const close = vi.fn().mockResolvedValue(undefined);
  const queries = [];
  const inputsByCall = [];

  const parseConnectionString = vi.fn((conn) => ({
    server: 'fake-server',
    database: 'fake-db',
    options: { encrypt: true },
    __raw: conn,
  }));

  class FakeRequest {
    constructor() {
      this.inputs = {};
    }
    input(name, _type, value) {
      this.inputs[name] = value;
      return this;
    }
    async query(sqlStr) {
      queries.push(sqlStr);
      inputsByCall.push({ ...this.inputs });
      if (queryHandler) {
        return queryHandler(sqlStr, { ...this.inputs });
      }
      return { recordset: [] };
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
  FakeConnectionPool.parseConnectionString = parseConnectionString;

  return {
    sql: {
      ConnectionPool: FakeConnectionPool,
      parseConnectionString,
      // Type sentinels — only object identity matters for the seam.
      NVarChar: 'NVarChar',
      Int: 'Int',
    },
    close,
    queries,
    inputsByCall,
    parseConnectionString,
  };
}

function makeLog() {
  return { info: vi.fn(), error: vi.fn() };
}

// Helpers that build a queryHandler simulating a populated / empty DB.
function handlerForBotWithRows(userId, beforeCount) {
  let deletedRan = false;
  return (sqlStr, inputs) => {
    if (/SELECT id FROM users/i.test(sqlStr)) {
      expect(inputs.username).toBe(SMOKE_USER);
      return { recordset: [{ id: userId }] };
    }
    if (/COUNT\(\*\)/i.test(sqlStr)) {
      expect(inputs.userId).toBe(userId);
      return { recordset: [{ n: deletedRan ? 0 : beforeCount }] };
    }
    if (/DELETE FROM scores/i.test(sqlStr)) {
      expect(inputs.userId).toBe(userId);
      deletedRan = true;
      return { rowsAffected: [beforeCount] };
    }
    throw new Error(`unexpected query: ${sqlStr}`);
  };
}

describe('scripts/cleanup-test-data.js', () => {
  describe('cleanupTestData(deps)', () => {
    it('deletes accumulated rows and asserts post-count is 0', async () => {
      const fake = makeFakeSql({ queryHandler: handlerForBotWithRows(42, 17) });
      const log = makeLog();
      const result = await cleanupTestData({
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
        log,
      });
      expect(result).toEqual({ userId: 42, beforeCount: 17, afterCount: 0, deleted: true });
      expect(fake.queries.some((q) => /DELETE FROM scores/i.test(q))).toBe(true);
      expect(fake.close).toHaveBeenCalled();
    });

    it('is idempotent: when bot user is missing, exits cleanly with no DELETE', async () => {
      const fake = makeFakeSql({
        queryHandler: (sqlStr) => {
          if (/SELECT id FROM users/i.test(sqlStr)) return { recordset: [] };
          throw new Error(`unexpected query when bot is missing: ${sqlStr}`);
        },
      });
      const log = makeLog();
      const result = await cleanupTestData({
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
        log,
      });
      expect(result).toEqual({ userId: null, beforeCount: 0, afterCount: 0, deleted: false });
      expect(fake.queries.some((q) => /DELETE/i.test(q))).toBe(false);
      expect(log.info).toHaveBeenCalledWith(expect.stringMatching(/no '.*gwn-smoke-bot.*' user found/));
    });

    it('DRY_RUN counts but does NOT delete', async () => {
      const fake = makeFakeSql({
        queryHandler: (sqlStr, inputs) => {
          if (/SELECT id FROM users/i.test(sqlStr)) return { recordset: [{ id: 7 }] };
          if (/COUNT\(\*\)/i.test(sqlStr)) {
            expect(inputs.userId).toBe(7);
            return { recordset: [{ n: 5 }] };
          }
          throw new Error(`DRY_RUN must not delete: ${sqlStr}`);
        },
      });
      const log = makeLog();
      const result = await cleanupTestData({
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
        dryRun: true,
        log,
      });
      expect(result).toEqual({ userId: 7, beforeCount: 5, afterCount: 5, deleted: false });
      expect(fake.queries.some((q) => /DELETE/i.test(q))).toBe(false);
      expect(log.info).toHaveBeenCalledWith(expect.stringMatching(/DRY_RUN — would delete 5 rows/));
    });

    it('all queries are parameterized — never a wildcard or string-interpolated user_id', async () => {
      const fake = makeFakeSql({ queryHandler: handlerForBotWithRows(99, 3) });
      await cleanupTestData({
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
        log: makeLog(),
      });
      // Every SQL string must reference @username or @userId — never a literal value.
      for (const q of fake.queries) {
        expect(q).not.toMatch(/= ?\d+/);
        expect(q).not.toMatch(/'gwn-smoke-bot'/);
      }
      // user_id binding was set to the resolved id on every parameterized call.
      const idBindings = fake.inputsByCall.map((c) => c.userId).filter((v) => v !== undefined);
      expect(idBindings.every((v) => v === 99)).toBe(true);
    });

    it('throws when DATABASE_URL is unset', async () => {
      const prev = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      try {
        const fake = makeFakeSql();
        await expect(
          cleanupTestData({ sql: fake.sql, log: makeLog() })
        ).rejects.toThrow(/DATABASE_URL is unset/);
      } finally {
        if (prev !== undefined) process.env.DATABASE_URL = prev;
      }
    });

    it('treats explicit empty-string connectionString as misconfiguration (no env fallback)', async () => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'Server=fromenv;Database=x;';
      try {
        const fake = makeFakeSql();
        await expect(
          cleanupTestData({ sql: fake.sql, connectionString: '', log: makeLog() })
        ).rejects.toThrow(/DATABASE_URL is unset/);
      } finally {
        if (prev === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = prev;
      }
    });

    it('post-delete count > 0 surfaces as a hard failure', async () => {
      // Simulate a DELETE that didn't actually clear all rows (e.g. concurrent insert).
      const fake = makeFakeSql({
        queryHandler: (sqlStr) => {
          if (/SELECT id FROM users/i.test(sqlStr)) return { recordset: [{ id: 1 }] };
          if (/COUNT\(\*\)/i.test(sqlStr)) return { recordset: [{ n: 3 }] };
          if (/DELETE FROM scores/i.test(sqlStr)) return { rowsAffected: [3] };
          throw new Error(`unexpected: ${sqlStr}`);
        },
      });
      await expect(
        cleanupTestData({
          sql: fake.sql,
          connectionString: 'Server=foo;Database=bar;',
          log: makeLog(),
        })
      ).rejects.toThrow(/post-delete count assertion failed/);
    });

    it('closes the pool even when a query throws', async () => {
      const fake = makeFakeSql({
        queryHandler: () => { throw new Error('boom'); },
      });
      await expect(
        cleanupTestData({
          sql: fake.sql,
          connectionString: 'Server=foo;Database=bar;',
          log: makeLog(),
        })
      ).rejects.toThrow(/boom/);
      expect(fake.close).toHaveBeenCalled();
    });
  });

  describe('main(deps) — CLI exit handling', () => {
    let exitSpy;
    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`__exit_${code}__`);
      });
    });
    afterEach(() => {
      exitSpy.mockRestore();
    });

    it('success: exits 0', async () => {
      const fake = makeFakeSql({ queryHandler: handlerForBotWithRows(1, 0) });
      let exitCode;
      try {
        await main({
          sql: fake.sql,
          connectionString: 'Server=foo;Database=bar;',
          log: makeLog(),
        });
      } catch (err) {
        exitCode = err.message;
      }
      expect(exitCode).toBe('__exit_0__');
    });

    it('failure: exits 1 and logs the wrapped summary', async () => {
      const fake = makeFakeSql({
        queryHandler: () => { throw new Error('cold'); },
      });
      const log = makeLog();
      let exitCode;
      try {
        await main({
          sql: fake.sql,
          connectionString: 'Server=foo;Database=bar;',
          log,
        });
      } catch (err) {
        exitCode = err.message;
      }
      expect(exitCode).toBe('__exit_1__');
      expect(log.error).toHaveBeenCalledWith(
        expect.stringMatching(/\[CS81 cleanup-test-data\] FAILED:.*cold/)
      );
    });
  });
});
