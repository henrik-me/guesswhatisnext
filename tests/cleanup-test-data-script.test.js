import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  cleanupTestData,
  main,
  SMOKE_USER,
  CS_PREFIX_PATTERN,
  parseExtraUsernames,
} = require('../scripts/cleanup-test-data.js');

/**
 * Tests for scripts/cleanup-test-data.js (CS81-1 + CS82-1). Mocks the `mssql`
 * module via the `sql` DI seam — no live DB needed. Mirrors the structure of
 * tests/wake-db-script.test.js.
 */

function makeFakeSql({ users = [], scoresByUserId = {} } = {}) {
  const close = vi.fn().mockResolvedValue(undefined);
  const queries = [];
  const inputsByCall = [];
  const counts = { ...scoresByUserId };

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
      if (/SELECT id, username FROM users WHERE username LIKE 'cs%'/i.test(sqlStr)) {
        const matched = users.filter((u) => typeof u.username === 'string' && u.username.startsWith('cs'));
        return { recordset: matched.map((u) => ({ id: u.id, username: u.username })) };
      }
      if (/SELECT id, username FROM users WHERE username = @username/i.test(sqlStr)) {
        const u = users.find((x) => x.username === this.inputs.username);
        return { recordset: u ? [{ id: u.id, username: u.username }] : [] };
      }
      if (/SELECT COUNT\(\*\) AS n FROM scores WHERE user_id = @userId/i.test(sqlStr)) {
        const n = counts[this.inputs.userId] ?? 0;
        return { recordset: [{ n }] };
      }
      if (/DELETE FROM scores WHERE user_id = @userId/i.test(sqlStr)) {
        const removed = counts[this.inputs.userId] ?? 0;
        counts[this.inputs.userId] = 0;
        return { rowsAffected: [removed] };
      }
      throw new Error(`unexpected query: ${sqlStr}`);
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
      NVarChar: 'NVarChar',
      Int: 'Int',
    },
    close,
    queries,
    inputsByCall,
    counts,
    parseConnectionString,
  };
}

function makeLog() {
  return { info: vi.fn(), error: vi.fn() };
}

describe('CS_PREFIX_PATTERN — regex hygiene (CS82-1)', () => {
  it('matches real CS52-10 machine-generated usernames (mixed-alphanumeric suffix)', () => {
    expect(CS_PREFIX_PATTERN.test('cs5210umop3dc23a')).toBe(true);
    expect(CS_PREFIX_PATTERN.test('cs5210umop4jes6b')).toBe(true);
    expect(CS_PREFIX_PATTERN.test('cs5210umop3dc23b')).toBe(true);
    expect(CS_PREFIX_PATTERN.test('cs5210umop4jes6a')).toBe(true);
  });

  it('matches any cs<digits><mixed-alphanumeric-suffix> shape', () => {
    expect(CS_PREFIX_PATTERN.test('cs1a2')).toBe(true);
    expect(CS_PREFIX_PATTERN.test('cs100abc1')).toBe(true);
  });

  it('does NOT match the gwn-smoke-bot user (handled by exact-match path)', () => {
    expect(CS_PREFIX_PATTERN.test(SMOKE_USER)).toBe(false);
  });

  it('does NOT match plausible human-chosen usernames (CS82 PR #334 review)', () => {
    // Suffix is all letters — would have matched the plan's looser regex.
    // The mixed-alphanumeric tightening rejects these to prevent false
    // positives on real public registrations.
    expect(CS_PREFIX_PATTERN.test('cs50student')).toBe(false);
    expect(CS_PREFIX_PATTERN.test('cs100abc')).toBe(false);
    expect(CS_PREFIX_PATTERN.test('cs2024alice')).toBe(false);
    // Other real-looking shapes.
    expect(CS_PREFIX_PATTERN.test('realuser')).toBe(false);
    expect(CS_PREFIX_PATTERN.test('alice')).toBe(false);
    expect(CS_PREFIX_PATTERN.test('cs-rocks')).toBe(false);
    expect(CS_PREFIX_PATTERN.test('CS5210FOO')).toBe(false); // uppercase suffix
  });

  it('does NOT match boundary cases (no suffix, no digits, suffix without letter)', () => {
    expect(CS_PREFIX_PATTERN.test('cs1')).toBe(false);
    expect(CS_PREFIX_PATTERN.test('csabc')).toBe(false);
    expect(CS_PREFIX_PATTERN.test('cs')).toBe(false);
    expect(CS_PREFIX_PATTERN.test('')).toBe(false);
    // Suffix is all digits (no letter) — also rejected.
    expect(CS_PREFIX_PATTERN.test('cs1000')).toBe(false);
    expect(CS_PREFIX_PATTERN.test('cs5210123')).toBe(false);
  });
});

describe('parseExtraUsernames — env var parsing (CS82-1)', () => {
  it('parses comma-separated list, trims, drops empties', () => {
    expect(parseExtraUsernames('alice,bob, charlie ,,'))
      .toEqual(['alice', 'bob', 'charlie']);
  });
  it('returns [] for null/empty', () => {
    expect(parseExtraUsernames(null)).toEqual([]);
    expect(parseExtraUsernames('')).toEqual([]);
  });
});

describe('scripts/cleanup-test-data.js — cleanupTestData', () => {
  it('deletes accumulated rows for smoke-bot AND CS-prefix users', async () => {
    const fake = makeFakeSql({
      users: [
        { id: 1, username: SMOKE_USER },
        { id: 2, username: 'cs5210umop3dc23a' },
        { id: 3, username: 'cs5210umop4jes6b' },
        { id: 4, username: 'cs1' },
        { id: 5, username: 'cs-rocks' },
      ],
      scoresByUserId: { 1: 17, 2: 5, 3: 8, 4: 99, 5: 99 },
    });
    const log = makeLog();
    const result = await cleanupTestData({
      sql: fake.sql,
      connectionString: 'Server=foo;Database=bar;',
      wake: false,
      log,
    });
    expect(result.targets).toHaveLength(3);
    expect(result.totalDeleted).toBe(17 + 5 + 8);
    expect(result.dryRun).toBe(false);
    expect(fake.counts[4]).toBe(99);
    expect(fake.counts[5]).toBe(99);
    expect(fake.counts[1]).toBe(0);
    expect(fake.counts[2]).toBe(0);
    expect(fake.counts[3]).toBe(0);
    expect(fake.close).toHaveBeenCalled();
    const logged = log.info.mock.calls.map((c) => c[0]).join('\n');
    expect(logged).toMatch(/before count: 17 \(gwn-smoke-bot/);
    expect(logged).toMatch(/before count: 5 \(cs5210umop3dc23a/);
    expect(logged).toMatch(/before count: 8 \(cs5210umop4jes6b/);
  });

  it('EXTRA_USERNAMES allowlist adds names that do not match the regex', async () => {
    const fake = makeFakeSql({
      users: [
        { id: 1, username: SMOKE_USER },
        { id: 7, username: 'manual-test-account' },
        { id: 8, username: 'another-test' },
      ],
      scoresByUserId: { 1: 0, 7: 4, 8: 6 },
    });
    const result = await cleanupTestData({
      sql: fake.sql,
      connectionString: 'Server=foo;Database=bar;',
      wake: false,
      extraUsernames: 'manual-test-account, another-test',
      log: makeLog(),
    });
    expect(result.targets).toHaveLength(3);
    expect(result.totalDeleted).toBe(0 + 4 + 6);
    const sources = result.targets.map((t) => t.source).sort();
    expect(sources).toEqual(['extra', 'extra', 'smoke']);
  });

  it('EXTRA_USERNAMES skips unknown usernames without failing', async () => {
    const fake = makeFakeSql({
      users: [{ id: 1, username: SMOKE_USER }],
      scoresByUserId: { 1: 1 },
    });
    const log = makeLog();
    const result = await cleanupTestData({
      sql: fake.sql,
      connectionString: 'Server=foo;Database=bar;',
      wake: false,
      extraUsernames: ['nope-not-here'],
      log,
    });
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].username).toBe(SMOKE_USER);
    expect(log.info.mock.calls.some((c) => /'nope-not-here' not found/.test(c[0]))).toBe(true);
  });

  it('EXTRA_USERNAMES does not double-count users already matched via cs-prefix', async () => {
    const fake = makeFakeSql({
      users: [{ id: 2, username: 'cs5210umop3dc23a' }],
      scoresByUserId: { 2: 3 },
    });
    const log = makeLog();
    const result = await cleanupTestData({
      sql: fake.sql,
      connectionString: 'Server=foo;Database=bar;',
      wake: false,
      extraUsernames: 'cs5210umop3dc23a',
      log,
    });
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0].source).toBe('cs-prefix');
    expect(log.info.mock.calls.some((c) => /already matched/.test(c[0]))).toBe(true);
  });

  it('cumulative count across multiple matched users is sum of per-user before-counts', async () => {
    const fake = makeFakeSql({
      users: [
        { id: 1, username: SMOKE_USER },
        { id: 2, username: 'cs100abc1' },
        { id: 3, username: 'cs5210umop3dc23a' },
      ],
      scoresByUserId: { 1: 10, 2: 20, 3: 30 },
    });
    const result = await cleanupTestData({
      sql: fake.sql,
      connectionString: 'Server=foo;Database=bar;',
      wake: false,
      log: makeLog(),
    });
    expect(result.totalDeleted).toBe(60);
  });

  it('idempotent: when no users match, exits cleanly with no DELETE', async () => {
    const fake = makeFakeSql({ users: [], scoresByUserId: {} });
    const log = makeLog();
    const result = await cleanupTestData({
      sql: fake.sql,
      connectionString: 'Server=foo;Database=bar;',
      wake: false,
      log,
    });
    expect(result).toEqual({ targets: [], totalDeleted: 0, dryRun: false });
    expect(fake.queries.some((q) => /DELETE/i.test(q))).toBe(false);
    expect(log.info.mock.calls.some((c) => /no matching users/.test(c[0]))).toBe(true);
  });

  it('DRY_RUN counts but does NOT delete', async () => {
    const fake = makeFakeSql({
      users: [
        { id: 1, username: SMOKE_USER },
        { id: 2, username: 'cs100abc1' },
      ],
      scoresByUserId: { 1: 5, 2: 7 },
    });
    const log = makeLog();
    const result = await cleanupTestData({
      sql: fake.sql,
      connectionString: 'Server=foo;Database=bar;',
      dryRun: true,
      wake: false,
      log,
    });
    expect(result.dryRun).toBe(true);
    expect(result.targets.every((t) => t.deleted === false)).toBe(true);
    expect(result.targets.find((t) => t.username === SMOKE_USER).beforeCount).toBe(5);
    expect(result.targets.find((t) => t.username === 'cs100abc1').beforeCount).toBe(7);
    expect(fake.queries.some((q) => /DELETE/i.test(q))).toBe(false);
    expect(log.info.mock.calls.some((c) => /DRY_RUN — would delete 5 row\(s\) for gwn-smoke-bot/.test(c[0]))).toBe(true);
  });

  it('all DELETEs are parameterized — never wildcard or string-interpolated', async () => {
    const fake = makeFakeSql({
      users: [
        { id: 99, username: SMOKE_USER },
        { id: 7, username: 'cs5210abc1' },
      ],
      scoresByUserId: { 99: 3, 7: 4 },
    });
    await cleanupTestData({
      sql: fake.sql,
      connectionString: 'Server=foo;Database=bar;',
      wake: false,
      log: makeLog(),
    });
    for (const q of fake.queries) {
      expect(q).not.toMatch(/user_id\s*=\s*\d/);
      if (/DELETE/i.test(q)) {
        expect(q).not.toMatch(/'gwn-smoke-bot'/);
        expect(q).not.toMatch(/'cs[%a-z0-9]/);
      }
    }
  });

  it('only SELECTs touch users — DELETEs only target the scores table (minimum-blast-radius)', async () => {
    const fake = makeFakeSql({
      users: [{ id: 1, username: SMOKE_USER }],
      scoresByUserId: { 1: 2 },
    });
    await cleanupTestData({
      sql: fake.sql,
      connectionString: 'Server=foo;Database=bar;',
      wake: false,
      log: makeLog(),
    });
    for (const q of fake.queries) {
      if (/DELETE/i.test(q)) {
        expect(q).toMatch(/DELETE FROM scores/i);
        expect(q).not.toMatch(/DELETE FROM users/i);
      }
    }
  });

  it('invokes wake-db before opening the cleanup connection', async () => {
    const fake = makeFakeSql({ users: [], scoresByUserId: {} });
    const wakeFn = vi.fn().mockResolvedValue(undefined);
    await cleanupTestData({
      sql: fake.sql,
      connectionString: 'Server=foo;Database=bar;',
      wake: wakeFn,
      log: makeLog(),
    });
    expect(wakeFn).toHaveBeenCalledTimes(1);
    const wakeArgs = wakeFn.mock.calls[0][0];
    expect(wakeArgs.connectionString).toBe('Server=foo;Database=bar;');
    expect(wakeArgs.sql).toBe(fake.sql);
  });

  it('forwards connectTimeoutMs to wake-db as perAttemptTimeoutMs', async () => {
    const fake = makeFakeSql({ users: [], scoresByUserId: {} });
    const wakeFn = vi.fn().mockResolvedValue(undefined);
    await cleanupTestData({
      sql: fake.sql,
      connectionString: 'Server=foo;Database=bar;',
      connectTimeoutMs: 7_500,
      wake: wakeFn,
      log: makeLog(),
    });
    expect(wakeFn.mock.calls[0][0].perAttemptTimeoutMs).toBe(7_500);
  });

  it('surfaces wake-db failure as a wrapped error', async () => {
    const fake = makeFakeSql({ users: [], scoresByUserId: {} });
    const wakeFn = vi.fn().mockRejectedValue(new Error('budget exhausted'));
    await expect(
      cleanupTestData({
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
        wake: wakeFn,
        log: makeLog(),
      })
    ).rejects.toThrow(/wake-db step failed.*budget exhausted/);
    expect(fake.queries).toHaveLength(0);
  });

  it('throws when DATABASE_URL is unset (env source named in error)', async () => {
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const fake = makeFakeSql();
      await expect(
        cleanupTestData({ sql: fake.sql, wake: false, log: makeLog() })
      ).rejects.toThrow(/connection string is empty.*DATABASE_URL env var/);
    } finally {
      if (prev !== undefined) process.env.DATABASE_URL = prev;
    }
  });

  it('treats explicit empty-string connectionString as misconfiguration', async () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'Server=fromenv;Database=x;';
    try {
      const fake = makeFakeSql();
      await expect(
        cleanupTestData({ sql: fake.sql, connectionString: '', wake: false, log: makeLog() })
      ).rejects.toThrow(/connection string is empty.*connectionString argument/);
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });

  it('reads EXTRA_USERNAMES from env when not passed in deps', async () => {
    const prev = process.env.EXTRA_USERNAMES;
    process.env.EXTRA_USERNAMES = 'env-test-user';
    try {
      const fake = makeFakeSql({
        users: [{ id: 5, username: 'env-test-user' }],
        scoresByUserId: { 5: 2 },
      });
      const result = await cleanupTestData({
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
        wake: false,
        log: makeLog(),
      });
      expect(result.targets).toHaveLength(1);
      expect(result.targets[0].username).toBe('env-test-user');
      expect(result.targets[0].source).toBe('extra');
    } finally {
      if (prev === undefined) delete process.env.EXTRA_USERNAMES;
      else process.env.EXTRA_USERNAMES = prev;
    }
  });

  it('post-delete count > 0 surfaces as a hard failure', async () => {
    const counts = { 1: 3 };
    class FakeRequestStubborn {
      constructor() { this.inputs = {}; }
      input(name, _t, value) { this.inputs[name] = value; return this; }
      async query(sqlStr) {
        if (/SELECT id, username FROM users WHERE username = @username/i.test(sqlStr)) {
          return this.inputs.username === SMOKE_USER
            ? { recordset: [{ id: 1, username: SMOKE_USER }] }
            : { recordset: [] };
        }
        if (/SELECT id, username FROM users WHERE username LIKE 'cs%'/i.test(sqlStr)) {
          return { recordset: [] };
        }
        if (/COUNT\(\*\)/i.test(sqlStr)) return { recordset: [{ n: counts[this.inputs.userId] ?? 0 }] };
        if (/DELETE/i.test(sqlStr)) return { rowsAffected: [0] };
        throw new Error(`unexpected: ${sqlStr}`);
      }
    }
    class FakePoolStubborn {
      constructor() {
        this.close = vi.fn().mockResolvedValue(undefined);
        this.connect = vi.fn().mockResolvedValue(undefined);
        this.request = () => new FakeRequestStubborn();
      }
    }
    FakePoolStubborn.parseConnectionString = () => ({ options: {} });
    const stubbornSql = { ConnectionPool: FakePoolStubborn, NVarChar: 'NVarChar', Int: 'Int' };
    await expect(
      cleanupTestData({
        sql: stubbornSql,
        connectionString: 'Server=foo;Database=bar;',
        wake: false,
        log: makeLog(),
      })
    ).rejects.toThrow(/post-delete count assertion failed for gwn-smoke-bot/);
  });

  it('closes the pool even when a query throws', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    class BoomPool {
      constructor() {
        this.close = close;
        this.connect = vi.fn().mockResolvedValue(undefined);
        this.request = () => ({
          input: () => ({
            input: () => ({}),
            query: () => { throw new Error('boom'); },
          }),
        });
      }
    }
    BoomPool.parseConnectionString = () => ({ options: {} });
    const sql = { ConnectionPool: BoomPool, NVarChar: 'NVarChar', Int: 'Int' };
    await expect(
      cleanupTestData({
        sql,
        connectionString: 'Server=foo;Database=bar;',
        wake: false,
        log: makeLog(),
      })
    ).rejects.toThrow(/boom/);
    expect(close).toHaveBeenCalled();
  });
});

describe('scripts/cleanup-test-data.js — main(deps) CLI exit handling', () => {
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
    const fake = makeFakeSql({ users: [], scoresByUserId: {} });
    let exitCode;
    try {
      await main({
        sql: fake.sql,
        connectionString: 'Server=foo;Database=bar;',
        wake: false,
        log: makeLog(),
      });
    } catch (err) {
      exitCode = err.message;
    }
    expect(exitCode).toBe('__exit_0__');
  });

  it('failure: exits 1 and logs the wrapped summary', async () => {
    class BoomPool {
      constructor() {
        this.close = vi.fn().mockResolvedValue(undefined);
        this.connect = vi.fn().mockResolvedValue(undefined);
        this.request = () => ({
          input: () => ({
            input: () => ({}),
            query: () => { throw new Error('cold'); },
          }),
        });
      }
    }
    BoomPool.parseConnectionString = () => ({ options: {} });
    const sql = { ConnectionPool: BoomPool, NVarChar: 'NVarChar', Int: 'Int' };
    const log = makeLog();
    let exitCode;
    try {
      await main({
        sql,
        connectionString: 'Server=foo;Database=bar;',
        wake: false,
        log,
      });
    } catch (err) {
      exitCode = err.message;
    }
    expect(exitCode).toBe('__exit_1__');
    expect(log.error).toHaveBeenCalledWith(
      expect.stringMatching(/\[CS82 cleanup-test-data\] FAILED:.*cold/)
    );
  });
});
