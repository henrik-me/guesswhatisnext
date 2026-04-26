/**
 * Tests for BaseAdapter.getMigrationState() — the route-facing API
 * that exposes migration tracker state without routes importing
 * `_tracker.js` directly. Added in CS61-0 as a precondition for the
 * `/api/admin/migrations` endpoint (CS61-2).
 *
 * Coverage runs against BOTH backends:
 *   - SQLite: real in-memory adapter against the real migration registry.
 *   - MSSQL: adapter constructed with a mocked `mssql` module so we can
 *     drive the recordsets returned by `db.all(...)`.
 *
 * Three paths per backend:
 *   1. Happy: after migrate() runs all migrations, applied === migrations.length,
 *      all names listed in version order, lastError === null.
 *   2. Empty / not-initialized: tracker table missing → applied=0, names=[],
 *      lastError is the underlying "no such table" / "Invalid object name" message.
 *   3. Error: tracker query fails (e.g. connection closed) → applied=0,
 *      names=[], lastError populated; getMigrationState does NOT throw.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const SqliteAdapter = require('../server/db/sqlite-adapter');
const MssqlAdapter = require('../server/db/mssql-adapter');
const migrations = require('../server/db/migrations');

/* ── SQLite ──────────────────────────────────────────────────────────── */

describe('SqliteAdapter.getMigrationState()', () => {
  let adapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
  });

  afterEach(async () => {
    if (adapter) {
      try { await adapter.close(); } catch { /* already closed */ }
    }
  });

  it('happy path: returns applied count + names after migrate() runs all migrations', async () => {
    const newlyApplied = await adapter.migrate(migrations);
    expect(newlyApplied).toBe(migrations.length);

    const state = await adapter.getMigrationState();
    expect(state.lastError).toBeNull();
    expect(state.applied).toBe(migrations.length);
    expect(state.appliedNames).toEqual(
      [...migrations].sort((a, b) => a.version - b.version).map((m) => m.name)
    );
  });

  it('not-initialized path: returns lastError when tracker table is missing (no migrate yet)', async () => {
    const state = await adapter.getMigrationState();
    expect(state.applied).toBe(0);
    expect(state.appliedNames).toEqual([]);
    expect(state.lastError).toMatch(/no such table.*_migrations/i);
  });

  it('error path: returns lastError after the connection is closed (no throw)', async () => {
    await adapter.migrate(migrations);
    await adapter.close();

    const state = await adapter.getMigrationState();
    expect(state.applied).toBe(0);
    expect(state.appliedNames).toEqual([]);
    expect(typeof state.lastError).toBe('string');
    expect(state.lastError.length).toBeGreaterThan(0);
    adapter = null; // already closed; skip afterEach close
  });

  it('returns names in version order even when migrations were inserted out of order', async () => {
    // Build the tracker table directly so we can insert rows out of order
    // and verify getMigrationState() sorts by version (not insertion order).
    await adapter.exec(`
      CREATE TABLE _migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await adapter.run('INSERT INTO _migrations (version, name) VALUES (?, ?)', [3, 'c-third']);
    await adapter.run('INSERT INTO _migrations (version, name) VALUES (?, ?)', [1, 'a-first']);
    await adapter.run('INSERT INTO _migrations (version, name) VALUES (?, ?)', [2, 'b-second']);

    const state = await adapter.getMigrationState();
    expect(state.lastError).toBeNull();
    expect(state.applied).toBe(3);
    expect(state.appliedNames).toEqual(['a-first', 'b-second', 'c-third']);
  });
});

/* ── MSSQL (mocked) ──────────────────────────────────────────────────── */

/**
 * Build a minimal mocked `mssql` module for MssqlAdapter.
 * `queryImpl(sql)` lets each test control the recordset / error returned
 * for the tracker SELECT.
 */
function makeMockSqlForState(queryImpl) {
  const request = {
    input: vi.fn(),
    query: vi.fn().mockImplementation((sql) => queryImpl(sql)),
    batch: vi.fn().mockResolvedValue(undefined),
  };
  const pool = {
    request: vi.fn(() => request),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    _request: request,
    _pool: pool,
    connect: vi.fn().mockResolvedValue(pool),
    Request: vi.fn(),
    Transaction: vi.fn(),
    ConnectionPool: {
      parseConnectionString: vi.fn(() => ({
        server: 'test',
        database: 'testdb',
        options: {},
      })),
    },
  };
}

describe('MssqlAdapter.getMigrationState()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: returns applied count + names from the tracker recordset', async () => {
    const rows = [
      { version: 1, name: '001-initial' },
      { version: 2, name: '002-add-role' },
      { version: 3, name: '003-add-max-players' },
    ];
    const mockSql = makeMockSqlForState(() =>
      Promise.resolve({ recordset: rows, rowsAffected: [rows.length] })
    );
    const adapter = new MssqlAdapter('Server=x;Database=y;', { mssql: mockSql });
    await adapter._connect();

    const state = await adapter.getMigrationState();
    expect(state.lastError).toBeNull();
    expect(state.applied).toBe(3);
    expect(state.appliedNames).toEqual(['001-initial', '002-add-role', '003-add-max-players']);
    // Confirm the tracker query was issued via the adapter (not bypassed)
    const issued = mockSql._request.query.mock.calls[0][0];
    expect(issued).toMatch(/FROM\s+_migrations/i);
    expect(issued).toMatch(/ORDER\s+BY\s+version/i);
  });

  it('empty path: returns applied=0 + no error when the tracker table is empty', async () => {
    const mockSql = makeMockSqlForState(() =>
      Promise.resolve({ recordset: [], rowsAffected: [0] })
    );
    const adapter = new MssqlAdapter('Server=x;Database=y;', { mssql: mockSql });
    await adapter._connect();

    const state = await adapter.getMigrationState();
    expect(state.lastError).toBeNull();
    expect(state.applied).toBe(0);
    expect(state.appliedNames).toEqual([]);
  });

  it('not-initialized path: surfaces "Invalid object name" via lastError, no throw', async () => {
    const err = new Error("Invalid object name '_migrations'.");
    err.number = 208; // SQL Server's "Invalid object name" error code
    const mockSql = makeMockSqlForState(() => Promise.reject(err));
    const adapter = new MssqlAdapter('Server=x;Database=y;', { mssql: mockSql });
    await adapter._connect();

    const state = await adapter.getMigrationState();
    expect(state.applied).toBe(0);
    expect(state.appliedNames).toEqual([]);
    expect(state.lastError).toMatch(/Invalid object name.*_migrations/i);
  });

  it('error path: tracker query failure returns lastError, no throw', async () => {
    const mockSql = makeMockSqlForState(() =>
      Promise.reject(new Error('Connection is closed.'))
    );
    const adapter = new MssqlAdapter('Server=x;Database=y;', { mssql: mockSql });
    await adapter._connect();

    const state = await adapter.getMigrationState();
    expect(state.applied).toBe(0);
    expect(state.appliedNames).toEqual([]);
    expect(state.lastError).toBe('Connection is closed.');
  });
});
