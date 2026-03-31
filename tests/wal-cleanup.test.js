/**
 * Tests for database connection behavior in getDb().
 *
 * Verifies that getDb() opens normally across environments, uses the correct
 * journal mode (DELETE in Azure, WAL locally), and resets properly via closeDb().
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

describe('database connection behavior', () => {
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

  test('uses NORMAL locking mode in staging environment', () => {
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
