import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { wakeDb, main } = require('../scripts/wake-db.js');

/**
 * Tests for scripts/wake-db.js (CS73-3). Mocks the `mssql` module via the
 * `sql` DI seam — no live DB needed. Mirrors the structure of
 * tests/migrate-script.test.js.
 */
function makeFakeSql({ connectImpls = [], queryImpls = [] } = {}) {
  const close = vi.fn().mockResolvedValue(undefined);
  const queryCalls = [];
  const connectCalls = [];
  const parseConnectionString = vi.fn((conn) => ({
    server: 'fake-server',
    database: 'fake-db',
    user: 'sa',
    password: 'pw',
    options: { encrypt: true },
    __raw: conn,
  }));

  const constructed = [];

  class FakeConnectionPool {
    constructor(config) {
      this.config = config;
      constructed.push(this);
      this.close = close;
      this.connect = vi.fn(async () => {
        const idx = connectCalls.length;
        connectCalls.push(config);
        const impl = connectImpls[idx];
        if (typeof impl === 'function') return impl();
        return undefined;
      });
      this.request = vi.fn(() => ({
        query: vi.fn(async (sqlStr) => {
          const idx = queryCalls.length;
          queryCalls.push(sqlStr);
          const impl = queryImpls[idx];
          if (typeof impl === 'function') return impl();
          return { recordset: [{ ok: 1 }] };
        }),
      }));
    }
  }
  FakeConnectionPool.parseConnectionString = parseConnectionString;

  return {
    sql: { ConnectionPool: FakeConnectionPool, parseConnectionString },
    close,
    queryCalls,
    connectCalls,
    constructed,
    parseConnectionString,
  };
}

function makeLog() {
  return { info: vi.fn(), error: vi.fn() };
}

describe('scripts/wake-db.js', () => {
  describe('wakeDb(deps)', () => {
    it('succeeds on the first attempt: connects, runs SELECT 1, closes pool', async () => {
      const fake = makeFakeSql();
      const log = makeLog();
      const sleep = vi.fn();

      const result = await wakeDb({
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
        sleep,
        log,
      });

      expect(result.attempts).toBe(1);
      expect(typeof result.elapsedMs).toBe('number');
      expect(fake.connectCalls).toHaveLength(1);
      expect(fake.queryCalls).toEqual(['SELECT 1']);
      expect(fake.close).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(log.info).toHaveBeenCalledWith(
        expect.stringMatching(/\[CS73 wake-db\] success on attempt 1/)
      );
    });

    it('connection config carries connectionTimeout=30_000 + requestTimeout=30_000 (defaults)', async () => {
      const fake = makeFakeSql();
      await wakeDb({
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
        sleep: vi.fn(),
        log: makeLog(),
      });
      const cfg = fake.constructed[0].config;
      // Default attempt timeout = min(perAttemptTimeoutMs=30_000, remainingBudget=150_000) = 30_000.
      expect(cfg.connectionTimeout).toBe(30_000);
      expect(cfg.requestTimeout).toBe(30_000);
      expect(cfg.options.connectTimeout).toBe(30_000);
      expect(cfg.options.requestTimeout).toBe(30_000);
      // Existing options preserved.
      expect(cfg.options.encrypt).toBe(true);
    });

    it('clamps the per-attempt timeout to the remaining budget so wall-clock cannot overshoot totalBudgetMs', async () => {
      const fake = makeFakeSql();
      await wakeDb({
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
        // perAttemptTimeoutMs > totalBudgetMs → first attempt's timeout
        // must be clamped to the (smaller) remaining budget.
        perAttemptTimeoutMs: 60_000,
        totalBudgetMs: 10_000,
        sleep: vi.fn(),
        log: makeLog(),
      });
      const cfg = fake.constructed[0].config;
      expect(cfg.connectionTimeout).toBe(10_000);
      expect(cfg.requestTimeout).toBe(10_000);
      expect(cfg.options.connectTimeout).toBe(10_000);
      expect(cfg.options.requestTimeout).toBe(10_000);
    });

    it('respects an injected perAttemptTimeoutMs override (applied to both connect + request timeouts)', async () => {
      const fake = makeFakeSql();
      await wakeDb({
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
        perAttemptTimeoutMs: 7_000,
        sleep: vi.fn(),
        log: makeLog(),
      });
      const cfg = fake.constructed[0].config;
      expect(cfg.connectionTimeout).toBe(7_000);
      expect(cfg.requestTimeout).toBe(7_000);
      expect(cfg.options.connectTimeout).toBe(7_000);
      expect(cfg.options.requestTimeout).toBe(7_000);
    });

    it('rejects non-positive perAttemptTimeoutMs and totalBudgetMs (?? semantics let 0 surface as a real value)', async () => {
      const fake = makeFakeSql();
      await expect(
        wakeDb({
          sql: fake.sql,
          connectionString: 'Server=foo;Database=bar;',
          perAttemptTimeoutMs: 0,
          sleep: vi.fn(),
          log: makeLog(),
        })
      ).rejects.toThrow(/perAttemptTimeoutMs must be a positive number/);
      await expect(
        wakeDb({
          sql: fake.sql,
          connectionString: 'Server=foo;Database=bar;',
          totalBudgetMs: 0,
          sleep: vi.fn(),
          log: makeLog(),
        })
      ).rejects.toThrow(/totalBudgetMs must be a positive number/);
    });

    it('closes the failed pool BEFORE sleeping for backoff (resource pressure cases)', async () => {
      const transient = Object.assign(new Error('busy'), {
        number: 49918,
        name: 'ConnectionError',
      });
      const events = [];
      const close = vi.fn().mockImplementation(async () => {
        events.push('close');
      });
      let connectCallCount = 0;
      class FakeConnectionPool {
        constructor(config) {
          this.config = config;
          this.close = close;
          this.connect = vi.fn(async () => {
            connectCallCount += 1;
            if (connectCallCount === 1) throw transient;
            return undefined;
          });
          this.request = vi.fn(() => ({
            query: vi.fn().mockResolvedValue({ recordset: [{ ok: 1 }] }),
          }));
        }
      }
      FakeConnectionPool.parseConnectionString = vi.fn(() => ({ options: {} }));
      const sleep = vi.fn().mockImplementation(async () => {
        events.push('sleep');
      });

      await wakeDb({
        sql: { ConnectionPool: FakeConnectionPool },
        connectionString: 'Server=foo;Database=bar;',
        sleep,
        log: makeLog(),
      });

      // First close (failed attempt's pool) must precede the backoff sleep.
      const firstClose = events.indexOf('close');
      const firstSleep = events.indexOf('sleep');
      expect(firstClose).toBeGreaterThanOrEqual(0);
      expect(firstSleep).toBeGreaterThan(firstClose);
    });

    it('retries on transient Azure SQL error 40613, then succeeds', async () => {
      const transient = Object.assign(new Error('Database not currently available'), {
        number: 40613,
        name: 'ConnectionError',
      });
      const fake = makeFakeSql({
        connectImpls: [
          () => { throw transient; },
          () => undefined,
        ],
      });
      const log = makeLog();
      const sleep = vi.fn().mockResolvedValue(undefined);

      const result = await wakeDb({
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
        sleep,
        log,
      });

      expect(result.attempts).toBe(2);
      expect(fake.connectCalls).toHaveLength(2);
      // Pool is closed both on the failed attempt and on the successful one.
      expect(fake.close).toHaveBeenCalledTimes(2);
      // First backoff is 5s.
      expect(sleep).toHaveBeenCalledWith(5_000);
      expect(log.info).toHaveBeenCalledWith(
        expect.stringMatching(/attempt 1 failed.*40613.*retrying in 5s/)
      );
    });

    it('throws (and exits 1 via main) when total budget is exhausted', async () => {
      const transient = Object.assign(new Error('cold pause'), {
        number: 40613,
        name: 'ConnectionError',
      });
      const fake = makeFakeSql({
        connectImpls: [
          () => { throw transient; },
          () => { throw transient; },
          () => { throw transient; },
          () => { throw transient; },
        ],
      });
      const log = makeLog();
      const sleep = vi.fn().mockResolvedValue(undefined);

      await expect(
        wakeDb({
          sql: fake.sql,
          connectionString: 'Server=foo;Database=bar;',
          // Tight budget: first attempt fails immediately, 5s backoff would
          // exceed remaining budget, so we bail after attempt 1.
          totalBudgetMs: 100,
          sleep,
          log,
        })
      ).rejects.toThrow(/budget 100ms exhausted/);

      // Pool was closed on the failed attempt.
      expect(fake.close).toHaveBeenCalled();
    });

    it('pool is closed in the failure path even when SELECT 1 throws', async () => {
      const requestErr = Object.assign(new Error('select boom'), {
        name: 'RequestError',
      });
      const fake = makeFakeSql({
        queryImpls: [
          () => { throw requestErr; },
          () => ({ recordset: [{ ok: 1 }] }),
        ],
      });
      const log = makeLog();
      const sleep = vi.fn().mockResolvedValue(undefined);

      const result = await wakeDb({
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
        sleep,
        log,
      });

      expect(result.attempts).toBe(2);
      expect(fake.close).toHaveBeenCalledTimes(2);
    });

    it('non-retryable errors are surfaced immediately without retry', async () => {
      const fatal = Object.assign(new Error('login failed'), {
        number: 18456,
        name: 'LoginError',
      });
      const fake = makeFakeSql({
        connectImpls: [() => { throw fatal; }],
      });
      const log = makeLog();
      const sleep = vi.fn();

      await expect(
        wakeDb({
          sql: fake.sql,
          connectionString: 'Server=foo;Database=bar;',
          sleep,
          log,
        })
      ).rejects.toThrow(/login failed/);

      expect(fake.connectCalls).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
      expect(fake.close).toHaveBeenCalledTimes(1);
    });

    it('fails fast on ELOGIN even when wrapped as ConnectionError (auth misconfig != cold-pause)', async () => {
      const elogin = Object.assign(new Error('Login failed for user.'), {
        code: 'ELOGIN',
        name: 'ConnectionError',
      });
      const fake = makeFakeSql({
        connectImpls: [() => { throw elogin; }],
      });
      const sleep = vi.fn();
      await expect(
        wakeDb({
          sql: fake.sql,
          connectionString: 'Server=foo;Database=bar;',
          sleep,
          log: makeLog(),
        })
      ).rejects.toThrow(/Login failed/);
      expect(fake.connectCalls).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('fails fast on ENOTFOUND (DNS) even when wrapped as ConnectionError', async () => {
      const dns = Object.assign(new Error('getaddrinfo ENOTFOUND no-such-host'), {
        code: 'ENOTFOUND',
        name: 'ConnectionError',
      });
      const fake = makeFakeSql({
        connectImpls: [() => { throw dns; }],
      });
      const sleep = vi.fn();
      await expect(
        wakeDb({
          sql: fake.sql,
          connectionString: 'Server=foo;Database=bar;',
          sleep,
          log: makeLog(),
        })
      ).rejects.toThrow(/ENOTFOUND/);
      expect(fake.connectCalls).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('fails fast on "login failed" message even without a code (some mssql versions strip the code)', async () => {
      const noCode = Object.assign(new Error("Login failed for user 'sa'."), {
        name: 'ConnectionError',
      });
      const fake = makeFakeSql({
        connectImpls: [() => { throw noCode; }],
      });
      const sleep = vi.fn();
      await expect(
        wakeDb({
          sql: fake.sql,
          connectionString: 'Server=foo;Database=bar;',
          sleep,
          log: makeLog(),
        })
      ).rejects.toThrow(/Login failed/);
      expect(fake.connectCalls).toHaveLength(1);
      expect(sleep).not.toHaveBeenCalled();
    });

    it('falls back to process.env.DATABASE_URL when connectionString is unset', async () => {
      const prev = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'Server=fromenv;Database=x;';
      try {
        const fake = makeFakeSql();
        await wakeDb({ sql: fake.sql, sleep: vi.fn(), log: makeLog() });
        expect(fake.parseConnectionString).toHaveBeenCalledWith('Server=fromenv;Database=x;');
      } finally {
        if (prev === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = prev;
      }
    });

    it('throws a clear error when DATABASE_URL is unset', async () => {
      const prev = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      try {
        const fake = makeFakeSql();
        await expect(
          wakeDb({ sql: fake.sql, sleep: vi.fn(), log: makeLog() })
        ).rejects.toThrow(/DATABASE_URL is unset/);
      } finally {
        if (prev !== undefined) process.env.DATABASE_URL = prev;
      }
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
      const fake = makeFakeSql();
      let exitCode;
      try {
        await main({
          sql: fake.sql,
          connectionString: 'Server=foo;Database=bar;',
          sleep: vi.fn(),
          log: makeLog(),
        });
      } catch (err) {
        exitCode = err.message;
      }
      expect(exitCode).toBe('__exit_0__');
    });

    it('failure: exits 1 and logs the wrapped summary', async () => {
      const transient = Object.assign(new Error('cold'), { number: 40613 });
      const fake = makeFakeSql({
        connectImpls: [() => { throw transient; }],
      });
      const log = makeLog();
      let exitCode;
      try {
        await main({
          sql: fake.sql,
          connectionString: 'Server=foo;Database=bar;',
          totalBudgetMs: 50,
          sleep: vi.fn(),
          log,
        });
      } catch (err) {
        exitCode = err.message;
      }
      expect(exitCode).toBe('__exit_1__');
      expect(log.error).toHaveBeenCalledWith(
        expect.stringMatching(/\[CS73 wake-db\] FAILED: .*budget 50ms exhausted/)
      );
    });
  });
});
