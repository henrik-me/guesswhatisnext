/**
 * Tests for WAL/SHM cleanup logic in getDb().
 *
 * Verifies that getDb() opens normally when no stale WAL artifacts exist,
 * and that it can open the DB when Azure-style stale WAL/SHM files are present.
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
  delete process.env.GWN_EXCLUSIVE_LOCKING;
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
    const { getDb, setDraining } = require('../server/db/connection');

    // In Azure envs, _draining starts true; clear it like init-db would
    setDraining(false);
    const db = getDb();
    expect(db).toBeDefined();
    const row = db.prepare('SELECT 1 AS val').get();
    expect(row.val).toBe(1);
  });

  test('opens DB on Azure even when stale WAL/SHM files are present', () => {
    process.env.NODE_ENV = 'staging';

    // Create dummy WAL/SHM files that would be left by a crashed WAL-mode session
    fs.writeFileSync(process.env.GWN_DB_PATH + '-wal', 'stale-wal-data');
    fs.writeFileSync(process.env.GWN_DB_PATH + '-shm', 'stale-shm-data');
    expect(fs.existsSync(process.env.GWN_DB_PATH + '-wal')).toBe(true);
    expect(fs.existsSync(process.env.GWN_DB_PATH + '-shm')).toBe(true);

    clearModuleCache();
    const { getDb, setDraining } = require('../server/db/connection');

    // In Azure envs, _draining starts true; clear it like init-db would
    setDraining(false);
    // getDb() should succeed — either the open works directly (better-sqlite3
    // handles the dummy files) or the catch path cleans them up and retries.
    const db = getDb();
    expect(db).toBeDefined();
    const row = db.prepare('SELECT 1 AS val').get();
    expect(row.val).toBe(1);
  });

  test('non-Azure environments do not clean up WAL files on error', () => {
    process.env.NODE_ENV = 'test';
    const dbPath = process.env.GWN_DB_PATH;

    // Create WAL/SHM files alongside the DB path
    fs.writeFileSync(dbPath + '-wal', 'wal-data');
    fs.writeFileSync(dbPath + '-shm', 'shm-data');

    // Make the DB path itself a directory so Database() throws a non-lock error
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    fs.mkdirSync(dbPath);

    clearModuleCache();
    const { getDb } = require('../server/db/connection');

    expect(() => getDb()).toThrow();

    // WAL/SHM files should still exist — non-Azure path doesn't attempt cleanup
    expect(fs.existsSync(dbPath + '-wal')).toBe(true);
    expect(fs.existsSync(dbPath + '-shm')).toBe(true);
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

  test('uses NORMAL locking mode in staging environment (EXCLUSIVE is disabled for SMB)', () => {
    process.env.NODE_ENV = 'staging';
    clearModuleCache();
    const { getDb, setDraining } = require('../server/db/connection');

    setDraining(false);
    const db = getDb();
    const lockingMode = db.pragma('locking_mode', { simple: true });
    expect(lockingMode).toBe('normal');
  });

  test('uses DELETE journal mode in staging environment', () => {
    process.env.NODE_ENV = 'staging';
    clearModuleCache();
    const { getDb, setDraining } = require('../server/db/connection');

    setDraining(false);
    const db = getDb();
    const journalMode = db.pragma('journal_mode', { simple: true });
    expect(journalMode).toBe('delete');
  });
});
