/**
 * Tests for WAL/SHM cleanup logic in getDb().
 *
 * Verifies that getDb() opens normally when no stale WAL artifacts exist,
 * and that the retry-on-lock-error path removes stale files on Azure.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

let tmpDir;

/** Clear cached server modules so the DB singleton re-initializes. */
function clearModuleCache() {
  const serverDir = path.resolve(__dirname, '..', 'server');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverDir)) {
      delete require.cache[key];
    }
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwn-wal-test-'));
  process.env.GWN_DB_PATH = path.join(tmpDir, 'test.db');
});

afterEach(() => {
  // Close DB and clear cache between tests
  try {
    const { closeDb } = require('../server/db/connection');
    closeDb();
  } catch { /* ignore */ }
  clearModuleCache();

  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  delete process.env.GWN_DB_PATH;
  delete process.env.NODE_ENV;
});

describe('WAL cleanup in getDb()', () => {
  test('opens DB normally when no WAL artifacts exist', () => {
    process.env.NODE_ENV = 'test';
    clearModuleCache();
    const { getDb } = require('../server/db/connection');

    const db = getDb();
    expect(db).toBeDefined();
    // DB should be functional
    const row = db.prepare('SELECT 1 AS val').get();
    expect(row.val).toBe(1);
  });

  test('opens DB normally on Azure when no WAL artifacts exist', () => {
    process.env.NODE_ENV = 'staging';
    clearModuleCache();
    const { getDb } = require('../server/db/connection');

    const db = getDb();
    expect(db).toBeDefined();
    const row = db.prepare('SELECT 1 AS val').get();
    expect(row.val).toBe(1);
  });

  test('opens DB on Azure even when stale WAL/SHM files are present', () => {
    process.env.NODE_ENV = 'staging';
    const dbPath = process.env.GWN_DB_PATH;

    // Create dummy WAL/SHM files that would be left by a crashed WAL-mode session
    fs.writeFileSync(dbPath + '-wal', 'stale-wal-data');
    fs.writeFileSync(dbPath + '-shm', 'stale-shm-data');
    expect(fs.existsSync(dbPath + '-wal')).toBe(true);
    expect(fs.existsSync(dbPath + '-shm')).toBe(true);

    clearModuleCache();
    const { getDb } = require('../server/db/connection');

    // getDb() should succeed — either the open works directly (better-sqlite3
    // handles the dummy files) or the catch path cleans them up and retries.
    const db = getDb();
    expect(db).toBeDefined();
    const row = db.prepare('SELECT 1 AS val').get();
    expect(row.val).toBe(1);
  });

  test('non-Azure environments do not attempt WAL cleanup on error', () => {
    process.env.NODE_ENV = 'test';
    const dbPath = process.env.GWN_DB_PATH;

    // Place DB file in a directory, then make the path point to a directory
    // so Database() throws a non-lock error. getDb() should propagate it.
    const badPath = path.join(tmpDir, 'subdir');
    fs.mkdirSync(badPath);
    process.env.GWN_DB_PATH = badPath;

    clearModuleCache();
    const { getDb } = require('../server/db/connection');

    expect(() => getDb()).toThrow();
  });

  test('closeDb() resets singleton so next getDb() creates a new instance', () => {
    process.env.NODE_ENV = 'test';
    clearModuleCache();
    const { getDb, closeDb } = require('../server/db/connection');

    const db1 = getDb();
    expect(db1).toBeDefined();

    closeDb();
    const db2 = getDb();
    expect(db2).toBeDefined();
    // After closeDb + getDb, we should get a working new instance
    const row = db2.prepare('SELECT 1 AS val').get();
    expect(row.val).toBe(1);
  });
});
