/**
 * Tests for SqliteAdapter — the better-sqlite3 wrapper implementing BaseAdapter.
 */

const SqliteAdapter = require('../server/db/sqlite-adapter');
const migrations = require('../server/db/migrations');

let adapter;

beforeEach(async () => {
  adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
});

afterEach(async () => {
  if (adapter) await adapter.close();
});

/* ── Connection & pragmas ──────────────────────────────────────────── */

describe('connection', () => {
  test('sets dialect to sqlite', () => {
    expect(adapter.dialect).toBe('sqlite');
  });

  test('sets WAL journal mode in non-production', async () => {
    const row = await adapter.get('PRAGMA journal_mode');
    // :memory: databases may report 'memory' for journal_mode
    expect(['wal', 'memory']).toContain(row.journal_mode);
  });

  test('enables foreign keys', async () => {
    const row = await adapter.get('PRAGMA foreign_keys');
    expect(row.foreign_keys).toBe(1);
  });

  test('respects custom busyTimeout', async () => {
    const custom = new SqliteAdapter(':memory:', { busyTimeout: 5000 });
    await custom.connect();
    const row = await custom.get('PRAGMA busy_timeout');
    expect(row.timeout).toBe(5000);
    await custom.close();
  });

  test('handles non-numeric busyTimeout gracefully', async () => {
    const custom = new SqliteAdapter(':memory:', { busyTimeout: 'not-a-number' });
    await custom.connect();
    const row = await custom.get('PRAGMA busy_timeout');
    expect(row.timeout).toBe(30000);
    await custom.close();
  });
});

/* ── CRUD operations ───────────────────────────────────────────────── */

describe('CRUD', () => {
  beforeEach(async () => {
    await adapter.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value INTEGER DEFAULT 0
      )
    `);
  });

  test('run() returns changes and lastId', async () => {
    const result = await adapter.run(
      'INSERT INTO items (name, value) VALUES (?, ?)',
      ['alpha', 10]
    );
    expect(result.changes).toBe(1);
    expect(result.lastId).toBe(1);
  });

  test('get() returns single row or null', async () => {
    await adapter.run('INSERT INTO items (name, value) VALUES (?, ?)', ['beta', 20]);

    const row = await adapter.get('SELECT * FROM items WHERE name = ?', ['beta']);
    expect(row).toEqual({ id: 1, name: 'beta', value: 20 });

    const missing = await adapter.get('SELECT * FROM items WHERE name = ?', ['nope']);
    expect(missing).toBeNull();
  });

  test('all() returns array of rows', async () => {
    await adapter.run('INSERT INTO items (name) VALUES (?)', ['a']);
    await adapter.run('INSERT INTO items (name) VALUES (?)', ['b']);

    const rows = await adapter.all('SELECT name FROM items ORDER BY name');
    expect(rows).toEqual([{ name: 'a' }, { name: 'b' }]);
  });

  test('all() returns empty array when no matches', async () => {
    const rows = await adapter.all('SELECT * FROM items');
    expect(rows).toEqual([]);
  });

  test('exec() runs raw DDL', async () => {
    await adapter.exec('CREATE TABLE extra (id INTEGER PRIMARY KEY)');
    const row = await adapter.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='extra'"
    );
    expect(row).not.toBeNull();
  });
});

/* ── Named parameters ──────────────────────────────────────────────── */

describe('named parameters', () => {
  beforeEach(async () => {
    await adapter.exec(`
      CREATE TABLE things (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        value INTEGER DEFAULT 0
      )
    `);
  });

  test('run() accepts named object params', async () => {
    const result = await adapter.run(
      'INSERT INTO things (id, category, value) VALUES (@id, @category, @value)',
      { id: 'abc', category: 'test', value: 42 }
    );
    expect(result.changes).toBe(1);

    const row = await adapter.get('SELECT * FROM things WHERE id = ?', ['abc']);
    expect(row).toEqual({ id: 'abc', category: 'test', value: 42 });
  });

  test('get() accepts named object params', async () => {
    await adapter.run(
      'INSERT INTO things (id, category) VALUES (?, ?)',
      ['xyz', 'demo']
    );
    const row = await adapter.get(
      'SELECT * FROM things WHERE id = @id',
      { id: 'xyz' }
    );
    expect(row).toEqual({ id: 'xyz', category: 'demo', value: 0 });
  });

  test('all() accepts named object params', async () => {
    await adapter.run('INSERT INTO things (id, category) VALUES (?, ?)', ['a', 'cat1']);
    await adapter.run('INSERT INTO things (id, category) VALUES (?, ?)', ['b', 'cat1']);
    await adapter.run('INSERT INTO things (id, category) VALUES (?, ?)', ['c', 'cat2']);

    const rows = await adapter.all(
      'SELECT id FROM things WHERE category = @cat ORDER BY id',
      { cat: 'cat1' }
    );
    expect(rows).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
});

/* ── Transactions ──────────────────────────────────────────────────── */

describe('transactions', () => {
  beforeEach(async () => {
    await adapter.exec('CREATE TABLE txtest (id INTEGER PRIMARY KEY, val TEXT)');
  });

  test('commits on success', async () => {
    await adapter.transaction(async (tx) => {
      await tx.run('INSERT INTO txtest (val) VALUES (?)', ['committed']);
    });

    const row = await adapter.get('SELECT val FROM txtest WHERE id = 1');
    expect(row.val).toBe('committed');
  });

  test('rolls back on error', async () => {
    await expect(
      adapter.transaction(async (tx) => {
        await tx.run('INSERT INTO txtest (val) VALUES (?)', ['should-rollback']);
        throw new Error('deliberate failure');
      })
    ).rejects.toThrow('deliberate failure');

    const rows = await adapter.all('SELECT * FROM txtest');
    expect(rows).toEqual([]);
  });

  test('returns callback result', async () => {
    const result = await adapter.transaction(async (tx) => {
      await tx.run('INSERT INTO txtest (val) VALUES (?)', ['data']);
      return 'done';
    });
    expect(result).toBe('done');
  });
});

/* ── Migrations ────────────────────────────────────────────────────── */

describe('migrations', () => {
  test('runs all migrations on empty database', async () => {
    const count = await adapter.migrate(migrations);
    expect(count).toBe(migrations.length);

    // Verify tables were created
    const users = await adapter.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    );
    expect(users).not.toBeNull();

    const puzzles = await adapter.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='puzzles'"
    );
    expect(puzzles).not.toBeNull();
  });

  test('is idempotent — second run applies zero migrations', async () => {
    await adapter.migrate(migrations);
    const count = await adapter.migrate(migrations);
    expect(count).toBe(0);
  });

  test('records applied versions in _migrations table', async () => {
    await adapter.migrate(migrations);
    const rows = await adapter.all('SELECT version, name FROM _migrations ORDER BY version');
    expect(rows.length).toBe(migrations.length);
    expect(rows[0].version).toBe(1);
    expect(rows[0].name).toBe('initial-schema');
  });

  test('schema includes all expected columns after migrations', async () => {
    await adapter.migrate(migrations);

    // role column on users
    const roleRow = await adapter.get(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
    );
    expect(roleRow.sql).toContain('role');

    // max_players and host_user_id on matches
    const matchRow = await adapter.get(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='matches'"
    );
    expect(matchRow.sql).toContain('max_players');
    expect(matchRow.sql).toContain('host_user_id');

    // submitted_by on puzzles
    const puzzleRow = await adapter.get(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='puzzles'"
    );
    expect(puzzleRow.sql).toContain('submitted_by');
  });
});

/* ── Health check ──────────────────────────────────────────────────── */

describe('isHealthy', () => {
  test('returns true when connected', async () => {
    expect(await adapter.isHealthy()).toBe(true);
  });

  test('returns false after close', async () => {
    await adapter.close();
    expect(await adapter.isHealthy()).toBe(false);
    adapter = null; // prevent afterEach double-close
  });
});

/* ── Close ─────────────────────────────────────────────────────────── */

describe('close', () => {
  test('can be called multiple times safely', async () => {
    await adapter.close();
    await adapter.close(); // should not throw
    adapter = null;
  });
});
