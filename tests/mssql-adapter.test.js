/**
 * MSSQL adapter unit tests.
 *
 * No real SQL Server is available in CI, so we inject a mock `mssql`
 * module via the adapter's constructor and verify that the adapter
 * calls the right methods with the right arguments.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const MssqlAdapter = require('../server/db/mssql-adapter');
const rewriteParams = MssqlAdapter._rewriteParams;
const rewriteSql = MssqlAdapter._rewriteSql;

/* ── mock factories ──────────────────────────────────────────────────── */

function makeMockRequest(queryResult) {
  return {
    input: vi.fn(),
    query: vi.fn().mockResolvedValue(queryResult || {
      recordset: [],
      rowsAffected: [0],
    }),
    batch: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockPool(requestOverride) {
  const defaultRequest = makeMockRequest();
  return {
    request: vi.fn(() => requestOverride || defaultRequest),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockTransaction() {
  return {
    begin: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Build a fake mssql module whose Request/Transaction constructors
 * return the supplied mocks.
 */
function makeMockSql({ pool, transaction, txRequest } = {}) {
  const mockTx = transaction || makeMockTransaction();
  const mockTxReq = txRequest || makeMockRequest();
  const mockPool = pool || makeMockPool();

  // Use function() (not arrow) so `new` works as a constructor
  const RequestCtor = vi.fn().mockImplementation(function () {
    Object.assign(this, mockTxReq);
  });
  const TransactionCtor = vi.fn().mockImplementation(function () {
    Object.assign(this, mockTx);
  });

  return {
    connect: vi.fn().mockResolvedValue(mockPool),
    Request: RequestCtor,
    Transaction: TransactionCtor,
    _pool: mockPool,
    _tx: mockTx,
    _txReq: mockTxReq,
  };
}

/* ── tests ───────────────────────────────────────────────────────────── */

describe('rewriteParams', () => {
  it('replaces ? with @p1, @p2, …', () => {
    const result = rewriteParams('SELECT * FROM t WHERE a = ? AND b = ?', [1, 'x']);
    expect(result.sql).toBe('SELECT * FROM t WHERE a = @p1 AND b = @p2');
    expect(result.inputs).toEqual([
      { name: 'p1', value: 1 },
      { name: 'p2', value: 'x' },
    ]);
  });

  it('does not replace ? inside single-quoted string literals', () => {
    const result = rewriteParams("SELECT * FROM t WHERE a = '?' AND b = ?", [42]);
    expect(result.sql).toBe("SELECT * FROM t WHERE a = '?' AND b = @p1");
    expect(result.inputs).toEqual([{ name: 'p1', value: 42 }]);
  });

  it('handles escaped quotes (double single-quotes)', () => {
    const result = rewriteParams("SELECT * FROM t WHERE a = 'it''s' AND b = ?", [7]);
    expect(result.sql).toBe("SELECT * FROM t WHERE a = 'it''s' AND b = @p1");
    expect(result.inputs).toEqual([{ name: 'p1', value: 7 }]);
  });

  it('returns empty inputs when no params', () => {
    const result = rewriteParams('SELECT 1 AS ok');
    expect(result.sql).toBe('SELECT 1 AS ok');
    expect(result.inputs).toEqual([]);
  });

  it('handles multiple ? in a row', () => {
    const result = rewriteParams('INSERT INTO t VALUES (?, ?, ?)', ['a', 'b', 'c']);
    expect(result.sql).toBe('INSERT INTO t VALUES (@p1, @p2, @p3)');
    expect(result.inputs).toHaveLength(3);
  });

  it('handles ? after a string literal containing ?', () => {
    const result = rewriteParams("SELECT '?' AS q, ? AS v", [99]);
    expect(result.sql).toBe("SELECT '?' AS q, @p1 AS v");
    expect(result.inputs).toEqual([{ name: 'p1', value: 99 }]);
  });

  it('throws when more placeholders than params', () => {
    expect(() => rewriteParams('SELECT ? AND ?', [1]))
      .toThrow('Parameter count mismatch: query has 2 placeholder(s) but 1 value(s) were supplied');
  });

  it('throws when more params than placeholders', () => {
    expect(() => rewriteParams('SELECT ?', [1, 2]))
      .toThrow('Parameter count mismatch: query has 1 placeholder(s) but 2 value(s) were supplied');
  });
});

describe('MssqlAdapter', () => {
  let adapter;
  let mockSql;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSql = makeMockSql();
    adapter = new MssqlAdapter(
      'Server=tcp:test.database.windows.net;Database=testdb;',
      { mssql: mockSql }
    );
  });

  describe('constructor', () => {
    it('sets dialect to mssql', () => {
      expect(adapter.dialect).toBe('mssql');
    });

    it('stores connection string', () => {
      expect(adapter._connectionString).toBe(
        'Server=tcp:test.database.windows.net;Database=testdb;'
      );
    });
  });

  describe('_connect', () => {
    it('creates a connection pool via sql.connect', async () => {
      await adapter._connect();
      expect(mockSql.connect).toHaveBeenCalledWith(adapter._connectionString);
      expect(adapter._pool).toBe(mockSql._pool);
    });
  });

  describe('_get', () => {
    it('returns first row from recordset', async () => {
      const row = { id: 1, name: 'Alice' };
      const mockReq = makeMockRequest({ recordset: [row], rowsAffected: [1] });
      adapter._pool = makeMockPool(mockReq);

      const result = await adapter._get('SELECT * FROM users WHERE id = ?', [1]);
      expect(result).toEqual(row);
      expect(mockReq.input).toHaveBeenCalledWith('p1', 1);
      expect(mockReq.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = @p1');
    });

    it('returns null when recordset is empty', async () => {
      const mockReq = makeMockRequest({ recordset: [], rowsAffected: [0] });
      adapter._pool = makeMockPool(mockReq);

      const result = await adapter._get('SELECT * FROM users WHERE id = ?', [999]);
      expect(result).toBeNull();
    });
  });

  describe('_all', () => {
    it('returns full recordset', async () => {
      const rows = [{ id: 1 }, { id: 2 }];
      const mockReq = makeMockRequest({ recordset: rows, rowsAffected: [2] });
      adapter._pool = makeMockPool(mockReq);

      const result = await adapter._all('SELECT * FROM users');
      expect(result).toEqual(rows);
    });

    it('returns empty array when no rows', async () => {
      const mockReq = makeMockRequest({ recordset: [], rowsAffected: [0] });
      adapter._pool = makeMockPool(mockReq);

      const result = await adapter._all('SELECT * FROM users WHERE id = ?', [999]);
      expect(result).toEqual([]);
    });
  });

  describe('_run', () => {
    it('returns changes count from rowsAffected', async () => {
      const mockReq = makeMockRequest({ recordset: [], rowsAffected: [3] });
      adapter._pool = makeMockPool(mockReq);

      const result = await adapter._run('UPDATE users SET name = ? WHERE active = ?', ['Bob', 1]);
      expect(result.changes).toBe(3);
      expect(result.lastId).toBe(0);
    });

    it('extracts lastId from recordset if present', async () => {
      const mockReq = makeMockRequest({
        recordset: [{ lastId: 42 }],
        rowsAffected: [1],
      });
      adapter._pool = makeMockPool(mockReq);

      const result = await adapter._run(
        'INSERT INTO users (name) VALUES (?); SELECT SCOPE_IDENTITY() AS lastId',
        ['Eve']
      );
      expect(result.changes).toBe(1);
      expect(result.lastId).toBe(42);
    });

    it('returns 0 changes when rowsAffected is empty', async () => {
      const mockReq = makeMockRequest({ recordset: [], rowsAffected: [0] });
      adapter._pool = makeMockPool(mockReq);

      const result = await adapter._run('DELETE FROM users WHERE id = ?', [999]);
      expect(result.changes).toBe(0);
    });
  });

  describe('_exec', () => {
    it('calls request.batch() for DDL/multi-statement SQL', async () => {
      const mockReq = makeMockRequest();
      adapter._pool = makeMockPool(mockReq);

      await adapter._exec('CREATE TABLE foo (id INT PRIMARY KEY)');
      expect(mockReq.batch).toHaveBeenCalledWith('CREATE TABLE foo (id INT PRIMARY KEY)');
    });
  });

  describe('_transaction', () => {
    it('calls begin, fn, commit on success', async () => {
      adapter._pool = mockSql._pool;

      const fn = vi.fn().mockResolvedValue('ok');
      const result = await adapter._transaction(fn);

      expect(mockSql._tx.begin).toHaveBeenCalled();
      expect(fn).toHaveBeenCalledWith(expect.objectContaining({ dialect: 'mssql' }));
      expect(mockSql._tx.commit).toHaveBeenCalled();
      expect(mockSql._tx.rollback).not.toHaveBeenCalled();
      expect(result).toBe('ok');
    });

    it('rolls back on error and re-throws', async () => {
      adapter._pool = mockSql._pool;

      const error = new Error('boom');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(adapter._transaction(fn)).rejects.toThrow('boom');
      expect(mockSql._tx.begin).toHaveBeenCalled();
      expect(mockSql._tx.rollback).toHaveBeenCalled();
      expect(mockSql._tx.commit).not.toHaveBeenCalled();
    });

    it('preserves original error when rollback also fails', async () => {
      const failingTx = makeMockTransaction();
      failingTx.rollback.mockRejectedValue(new Error('rollback failed'));
      const failingSql = makeMockSql({ transaction: failingTx });
      adapter = new MssqlAdapter('Server=test;', { mssql: failingSql });
      adapter._pool = failingSql._pool;

      const original = new Error('original');
      const fn = vi.fn().mockRejectedValue(original);

      await expect(adapter._transaction(fn)).rejects.toThrow('original');
      // The rollback error is attached for diagnostics
      try {
        await adapter._transaction(fn);
      } catch (err) {
        expect(err.rollbackError).toBeDefined();
        expect(err.rollbackError.message).toBe('rollback failed');
      }
    });
  });

  describe('_close', () => {
    it('closes the pool and sets it to null', async () => {
      const pool = makeMockPool();
      adapter._pool = pool;
      await adapter._close();
      expect(pool.close).toHaveBeenCalled();
      expect(adapter._pool).toBeNull();
    });

    it('is safe to call when pool is already null', async () => {
      adapter._pool = null;
      await adapter._close(); // should not throw
      expect(adapter._pool).toBeNull();
    });
  });

  describe('isHealthy', () => {
    it('returns true when SELECT 1 succeeds', async () => {
      const mockReq = makeMockRequest({ recordset: [{ ok: 1 }], rowsAffected: [1] });
      adapter._pool = makeMockPool(mockReq);

      const healthy = await adapter.isHealthy();
      expect(healthy).toBe(true);
    });

    it('returns false when query throws', async () => {
      const mockReq = makeMockRequest();
      mockReq.query.mockRejectedValue(new Error('connection lost'));
      adapter._pool = makeMockPool(mockReq);

      const healthy = await adapter.isHealthy();
      expect(healthy).toBe(false);
    });
  });

  describe('error propagation', () => {
    it('propagates query errors from _get', async () => {
      const mockReq = makeMockRequest();
      mockReq.query.mockRejectedValue(new Error('query failed'));
      adapter._pool = makeMockPool(mockReq);

      await expect(adapter._get('SELECT 1')).rejects.toThrow('query failed');
    });

    it('propagates query errors from _all', async () => {
      const mockReq = makeMockRequest();
      mockReq.query.mockRejectedValue(new Error('timeout'));
      adapter._pool = makeMockPool(mockReq);

      await expect(adapter._all('SELECT * FROM t')).rejects.toThrow('timeout');
    });

    it('propagates batch errors from _exec', async () => {
      const mockReq = makeMockRequest();
      mockReq.batch.mockRejectedValue(new Error('syntax error'));
      adapter._pool = makeMockPool(mockReq);

      await expect(adapter._exec('BAD SQL')).rejects.toThrow('syntax error');
    });
  });
});

describe('MssqlTxAdapter (transaction-scoped)', () => {
  let adapter;
  let mockSql;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeAdapterWithTxReq(txReqOverride) {
    mockSql = makeMockSql({ txRequest: txReqOverride });
    adapter = new MssqlAdapter(
      'Server=test;',
      { mssql: mockSql }
    );
    adapter._pool = mockSql._pool;
    return adapter;
  }

  it('throws on nested transactions', async () => {
    const txReq = makeMockRequest({ recordset: [], rowsAffected: [0] });
    const a = makeAdapterWithTxReq(txReq);

    await a._transaction(async (tx) => {
      await expect(tx._transaction(() => {})).rejects.toThrow(
        'Nested transactions are not supported'
      );
    });
  });

  it('uses transaction-scoped requests for _get', async () => {
    const txReq = makeMockRequest({ recordset: [{ id: 5 }], rowsAffected: [1] });
    const a = makeAdapterWithTxReq(txReq);

    await a._transaction(async (tx) => {
      const row = await tx._get('SELECT * FROM t WHERE id = ?', [5]);
      expect(row).toEqual({ id: 5 });
      expect(mockSql.Request).toHaveBeenCalled();
      expect(txReq.input).toHaveBeenCalledWith('p1', 5);
    });
  });

  it('uses transaction-scoped requests for _all', async () => {
    const txReq = makeMockRequest({ recordset: [{ a: 1 }, { a: 2 }], rowsAffected: [2] });
    const a = makeAdapterWithTxReq(txReq);

    await a._transaction(async (tx) => {
      const rows = await tx._all('SELECT * FROM t');
      expect(rows).toEqual([{ a: 1 }, { a: 2 }]);
    });
  });

  it('uses transaction-scoped requests for _run', async () => {
    const txReq = makeMockRequest({ recordset: [], rowsAffected: [1] });
    const a = makeAdapterWithTxReq(txReq);

    await a._transaction(async (tx) => {
      const result = await tx._run('INSERT INTO t (a) VALUES (?)', [10]);
      expect(result.changes).toBe(1);
    });
  });

  it('uses transaction-scoped requests for _exec', async () => {
    const txReq = makeMockRequest();
    const a = makeAdapterWithTxReq(txReq);

    await a._transaction(async (tx) => {
      await tx._exec('CREATE TABLE foo (id INT)');
      expect(txReq.batch).toHaveBeenCalledWith('CREATE TABLE foo (id INT)');
    });
  });
});

/* ── rewriteSql tests ────────────────────────────────────────────────── */

describe('rewriteSql', () => {
  describe('LIMIT → OFFSET/FETCH', () => {
    it('rewrites ORDER BY … LIMIT ?', () => {
      const { sql, params } = rewriteSql(
        'SELECT * FROM t ORDER BY x LIMIT ?',
        [10]
      );
      expect(sql).toBe('SELECT * FROM t ORDER BY x OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY');
      expect(params).toEqual([10]);
    });

    it('rewrites LIMIT ? OFFSET ? and swaps params', () => {
      const { sql, params } = rewriteSql(
        'SELECT * FROM puzzles WHERE active = 1 ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
        [20, 40]
      );
      expect(sql).toBe(
        'SELECT * FROM puzzles WHERE active = 1 ORDER BY created_at DESC, id DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY'
      );
      // params swapped: offset (40) comes first, limit (20) second
      expect(params).toEqual([40, 20]);
    });

    it('swaps only the LIMIT/OFFSET params when query has earlier params', () => {
      const { sql, params } = rewriteSql(
        'SELECT * FROM puzzles WHERE active = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [1, 20, 40]
      );
      expect(sql).toBe(
        'SELECT * FROM puzzles WHERE active = ? ORDER BY created_at DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY'
      );
      expect(params).toEqual([1, 40, 20]);
    });

    it('rewrites numeric LIMIT (no placeholder)', () => {
      const { sql, params } = rewriteSql(
        'SELECT * FROM scores WHERE user_id = ? ORDER BY played_at DESC LIMIT 50',
        [1]
      );
      expect(sql).toBe(
        'SELECT * FROM scores WHERE user_id = ? ORDER BY played_at DESC OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY'
      );
      expect(params).toEqual([1]);
    });

    it('rewrites numeric LIMIT with numeric OFFSET', () => {
      const { sql, params } = rewriteSql(
        'SELECT * FROM t ORDER BY id LIMIT 10 OFFSET 20',
        []
      );
      expect(sql).toBe(
        'SELECT * FROM t ORDER BY id OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY'
      );
      expect(params).toEqual([]);
    });
  });

  describe('RANDOM() → NEWID()', () => {
    it('replaces RANDOM() case-insensitively', () => {
      const { sql } = rewriteSql('SELECT * FROM t ORDER BY RANDOM() LIMIT ?', [5]);
      expect(sql).toContain('ORDER BY NEWID()');
      expect(sql).not.toContain('RANDOM');
    });

    it('replaces lowercase random()', () => {
      const { sql } = rewriteSql('ORDER BY random()', []);
      expect(sql).toBe('ORDER BY NEWID()');
    });
  });

  describe('date functions', () => {
    it("rewrites date('now')", () => {
      const { sql } = rewriteSql("WHERE date(s.played_at) = date('now')", []);
      expect(sql).toBe('WHERE CAST(s.played_at AS DATE) = CAST(GETUTCDATE() AS DATE)');
    });

    it("rewrites DATE('now') (uppercase)", () => {
      const { sql } = rewriteSql("WHERE DATE('now') = x", []);
      expect(sql).toBe('WHERE CAST(GETUTCDATE() AS DATE) = x');
    });

    it("rewrites datetime('now', '-7 days')", () => {
      const { sql } = rewriteSql("WHERE t >= datetime('now', '-7 days')", []);
      expect(sql).toBe('WHERE t >= DATEADD(day, -7, GETUTCDATE())');
    });

    it("rewrites datetime('now', '-24 hours')", () => {
      const { sql } = rewriteSql("WHERE t >= datetime('now', '-24 hours')", []);
      expect(sql).toBe('WHERE t >= DATEADD(hour, -24, GETUTCDATE())');
    });

    it('rewrites date(column_expr) to CAST(… AS DATE)', () => {
      const { sql } = rewriteSql('WHERE date(m.finished_at) = date(s.played_at)', []);
      expect(sql).toBe('WHERE CAST(m.finished_at AS DATE) = CAST(s.played_at AS DATE)');
    });
  });

  describe('combined rewrites', () => {
    it('handles leaderboard query with date filter + LIMIT', () => {
      const input = `
      SELECT s.id, s.score, u.username
      FROM scores s JOIN users u ON s.user_id = u.id
      WHERE s.mode = ? AND date(s.played_at) = date('now')
      ORDER BY s.score DESC
      LIMIT ?`;
      const { sql, params } = rewriteSql(input, ['freeplay', 20]);
      expect(sql).toContain('CAST(s.played_at AS DATE) = CAST(GETUTCDATE() AS DATE)');
      expect(sql).toContain('OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY');
      expect(sql).not.toContain('LIMIT');
      expect(params).toEqual(['freeplay', 20]);
    });

    it('handles RANDOM() + LIMIT together', () => {
      const { sql } = rewriteSql(
        'SELECT * FROM puzzles WHERE active = 1 ORDER BY RANDOM() LIMIT ?',
        [5]
      );
      expect(sql).toBe(
        'SELECT * FROM puzzles WHERE active = 1 ORDER BY NEWID() OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY'
      );
    });
  });

  describe('pass-through', () => {
    it('does not modify SQL without SQLite idioms', () => {
      const input = 'SELECT * FROM t WHERE id = ?';
      const { sql, params } = rewriteSql(input, [42]);
      expect(sql).toBe(input);
      expect(params).toEqual([42]);
    });

    it('does not modify INSERT statements', () => {
      const input = 'INSERT INTO t (a, b) VALUES (?, ?)';
      const { sql, params } = rewriteSql(input, [1, 2]);
      expect(sql).toBe(input);
      expect(params).toEqual([1, 2]);
    });
  });
});

/* ── INSERT OR IGNORE handling ───────────────────────────────────────── */

describe('INSERT OR IGNORE handling', () => {
  let adapter;
  let mockSql;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSql = makeMockSql();
    adapter = new MssqlAdapter(
      'Server=test;',
      { mssql: mockSql }
    );
  });

  it('strips OR IGNORE and executes normally on success', async () => {
    const mockReq = makeMockRequest({ recordset: [], rowsAffected: [1] });
    adapter._pool = makeMockPool(mockReq);

    const result = await adapter._run(
      'INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)',
      [1, 'first-win']
    );
    expect(result.changes).toBe(1);
    // SQL should have OR IGNORE stripped
    const calledSql = mockReq.query.mock.calls[0][0];
    expect(calledSql).not.toContain('OR IGNORE');
    expect(calledSql).toContain('INSERT INTO');
  });

  it('returns { changes: 0, lastId: 0 } on duplicate key error 2627', async () => {
    const mockReq = makeMockRequest();
    const dupError = new Error('Violation of UNIQUE KEY constraint');
    dupError.number = 2627;
    mockReq.query.mockRejectedValue(dupError);
    adapter._pool = makeMockPool(mockReq);

    const result = await adapter._run(
      'INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)',
      [1, 'first-win']
    );
    expect(result).toEqual({ changes: 0, lastId: 0 });
  });

  it('returns { changes: 0, lastId: 0 } on unique index error 2601', async () => {
    const mockReq = makeMockRequest();
    const dupError = new Error('Cannot insert duplicate key');
    dupError.number = 2601;
    mockReq.query.mockRejectedValue(dupError);
    adapter._pool = makeMockPool(mockReq);

    const result = await adapter._run(
      'INSERT OR IGNORE INTO match_rounds (match_id, round_num, puzzle_id) VALUES (?, ?, ?)',
      ['m1', 1, 5]
    );
    expect(result).toEqual({ changes: 0, lastId: 0 });
  });

  it('re-throws non-duplicate errors', async () => {
    const mockReq = makeMockRequest();
    const otherError = new Error('Connection lost');
    otherError.number = 4060;
    mockReq.query.mockRejectedValue(otherError);
    adapter._pool = makeMockPool(mockReq);

    await expect(adapter._run(
      'INSERT OR IGNORE INTO t (a) VALUES (?)',
      [1]
    )).rejects.toThrow('Connection lost');
  });
});

/* ── lastId via SCOPE_IDENTITY() ─────────────────────────────────────── */

describe('lastId via SCOPE_IDENTITY()', () => {
  let adapter;
  let mockSql;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSql = makeMockSql();
    adapter = new MssqlAdapter('Server=test;', { mssql: mockSql });
  });

  it('appends SCOPE_IDENTITY() for plain INSERT', async () => {
    const mockReq = makeMockRequest({
      recordset: [{ lastId: 99 }],
      rowsAffected: [1],
    });
    adapter._pool = makeMockPool(mockReq);

    const result = await adapter._run(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      ['alice', 'hash123']
    );
    expect(result.lastId).toBe(99);
    expect(result.changes).toBe(1);
    const calledSql = mockReq.query.mock.calls[0][0];
    expect(calledSql).toContain('SELECT SCOPE_IDENTITY() AS lastId');
  });

  it('does NOT append SCOPE_IDENTITY() for INSERT … SELECT', async () => {
    const mockReq = makeMockRequest({ recordset: [], rowsAffected: [3] });
    adapter._pool = makeMockPool(mockReq);

    await adapter._run(
      'INSERT INTO t (a) SELECT b FROM other WHERE c = ?',
      [1]
    );
    const calledSql = mockReq.query.mock.calls[0][0];
    expect(calledSql).not.toContain('SCOPE_IDENTITY');
  });

  it('does NOT append SCOPE_IDENTITY() for UPDATE', async () => {
    const mockReq = makeMockRequest({ recordset: [], rowsAffected: [2] });
    adapter._pool = makeMockPool(mockReq);

    await adapter._run('UPDATE t SET a = ? WHERE b = ?', [1, 2]);
    const calledSql = mockReq.query.mock.calls[0][0];
    expect(calledSql).not.toContain('SCOPE_IDENTITY');
  });

  it('does NOT append SCOPE_IDENTITY() for DELETE', async () => {
    const mockReq = makeMockRequest({ recordset: [], rowsAffected: [1] });
    adapter._pool = makeMockPool(mockReq);

    await adapter._run('DELETE FROM t WHERE id = ?', [5]);
    const calledSql = mockReq.query.mock.calls[0][0];
    expect(calledSql).not.toContain('SCOPE_IDENTITY');
  });
});

/* ── SQL rewriting integration through adapter methods ───────────────── */

describe('SQL rewriting through _get/_all', () => {
  let adapter;
  let mockSql;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSql = makeMockSql();
    adapter = new MssqlAdapter('Server=test;', { mssql: mockSql });
  });

  it('_all rewrites LIMIT in the sent query', async () => {
    const mockReq = makeMockRequest({ recordset: [{ id: 1 }], rowsAffected: [1] });
    adapter._pool = makeMockPool(mockReq);

    await adapter._all(
      'SELECT * FROM puzzles WHERE active = 1 ORDER BY RANDOM() LIMIT ?',
      [5]
    );
    const calledSql = mockReq.query.mock.calls[0][0];
    expect(calledSql).toContain('NEWID()');
    expect(calledSql).toContain('OFFSET 0 ROWS FETCH NEXT');
    expect(calledSql).not.toContain('LIMIT');
    expect(calledSql).not.toContain('RANDOM');
  });

  it('_get rewrites date functions in the sent query', async () => {
    const mockReq = makeMockRequest({ recordset: [{ cnt: 5 }], rowsAffected: [1] });
    adapter._pool = makeMockPool(mockReq);

    await adapter._get(
      "SELECT COUNT(*) as cnt FROM scores WHERE played_at >= datetime('now', '-7 days')",
      []
    );
    const calledSql = mockReq.query.mock.calls[0][0];
    expect(calledSql).toContain('DATEADD(day, -7, GETUTCDATE())');
    expect(calledSql).not.toContain('datetime');
  });
});
