/**
 * Database connection and initialization.
 * Uses better-sqlite3 for synchronous SQLite access.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { config } = require('../config');

const DB_PATH = config.GWN_DB_PATH;
const isAzure = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
let db = null;

// In Azure environments, DB access is blocked until /api/admin/init-db runs.
// This prevents WebSocket handlers (which bypass the API middleware gate)
// from opening the DB before the orchestrated deploy flow is ready.
let _draining = isAzure;

/** Set the draining flag to block new connections via getDb(). */
function setDraining(value) {
  _draining = !!value;
}

/** Check if an error is a SQLite lock/busy error. */
function isSqliteLockError(err) {
  return err.code === 'SQLITE_BUSY' ||
    err.code === 'SQLITE_LOCKED' ||
    err.code === 'SQLITE_BUSY_SNAPSHOT';
}

/**
 * Get the singleton database instance (lazy init).
 *
 * @param {Object} [options] - Optional configuration for the connection.
 * @param {number|string} [options.busyTimeout=30000] - SQLite busy timeout in milliseconds.
 *   Only honored when the singleton database connection is first created.
 *   Configures the `busy_timeout` pragma used to wait for locked database
 *   operations before failing with SQLITE_BUSY/SQLITE_LOCKED. Parsed with
 *   parseInt — leading numeric portions of strings are accepted (e.g. '2000ms'
 *   becomes 2000). Completely non-numeric values fall back to the default (30000),
 *   and negative values are clamped to zero. Passing a different busyTimeout
 *   after the connection already exists does not reconfigure the pragma.
 * @returns {import('better-sqlite3').Database} The initialized Database instance.
 * @throws {Error} Throws `"Database is not available — waiting for initialization"`
 *   when `_draining` is true and no connection has been opened yet. In Azure
 *   (staging/production) environments, `_draining` starts as true and is typically
 *   cleared either by the `/api/admin/init-db` endpoint calling
 *   {@link setDraining|setDraining(false)} or by the background self-initialization logic in
 *   `createServer()` before it begins attempting database initialization. That
 *   background path keeps `_draining` cleared across retryable initialization
 *   failures; only if initialization encounters a fatal condition and gives up
 *   may other code choose to re-enable draining, causing subsequent `getDb()`
 *   calls to throw again until initialization is retried or completed. Callers
 *   such as WebSocket handlers that run outside the API middleware gate should
 *   be prepared to catch this error and surface a "service unavailable" response
 *   while initialization is pending or has failed.
 */
function getDb({ busyTimeout = 30000 } = {}) {
  if (_draining && !db) {
    throw new Error('Database is not available — waiting for initialization');
  }
  if (!db) {
    // Ensure parent directory exists
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Use DELETE journal mode in production/staging for safety,
    // WAL locally for performance.
    db = new Database(DB_PATH);
    const bt = parseInt(busyTimeout, 10);
    db.pragma(`busy_timeout = ${Number.isNaN(bt) ? 30000 : Math.max(0, bt)}`);
    db.pragma(isAzure ? 'journal_mode = DELETE' : 'journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/** Initialize database with schema. Retries on lock errors. */
function initDb(maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return _initDbOnce();
    } catch (err) {
      if (!isSqliteLockError(err) || attempt === maxRetries) throw err;
      const delay = 1000 * attempt;
      console.warn(
        `⏳ Database init attempt ${attempt}/${maxRetries} failed (${err.code}): ${err.message}. ` +
        `Retrying in ${delay}ms...`
      );
      closeDb();
      // Synchronous sleep: initDb runs once at startup before the server
      // listens, and better-sqlite3 is synchronous. Making this async would
      // require refactoring createServer/index.js and all test call-sites.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
    }
  }
}

function _initDbOnce() {
  const database = getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  database.exec(schema);

  // Migration: add role column if missing
  try {
    database.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'system', 'admin'))");
  } catch { /* column already exists */ }

  // Migration: add max_players and host_user_id columns if missing
  try {
    database.prepare("SELECT max_players FROM matches LIMIT 0").get();
  } catch {
    database.exec("ALTER TABLE matches ADD COLUMN max_players INTEGER NOT NULL DEFAULT 2");
    database.exec("ALTER TABLE matches ADD COLUMN host_user_id INTEGER REFERENCES users(id)");
    database.exec("UPDATE matches SET host_user_id = created_by WHERE host_user_id IS NULL");
  }

  // Seed system account if it doesn't exist
  const SYSTEM_API_KEY = config.SYSTEM_API_KEY;
  const existing = database.prepare('SELECT id FROM users WHERE username = ?').get('system');
  if (!existing) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync(SYSTEM_API_KEY, 10);
    database.prepare("INSERT INTO users (username, password_hash, role) VALUES ('system', ?, 'system')").run(hash);
    console.log('🔑 System account seeded');
  }

  // Seed achievement definitions
  const { seedAchievements } = require('../achievements');
  seedAchievements();

  // Seed puzzles if table is empty
  const puzzleCount = database.prepare('SELECT COUNT(*) AS cnt FROM puzzles').get();
  if (puzzleCount.cnt === 0) {
    const { seedPuzzles } = require('./seed-puzzles');
    seedPuzzles();
  }

  console.log('📦 Database initialized');
}

/** Close the database connection. */
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/** Check whether the database connection has been opened. */
function isDbInitialized() {
  return db !== null;
}

module.exports = { getDb, initDb, closeDb, isDbInitialized, setDraining, isSqliteLockError };
