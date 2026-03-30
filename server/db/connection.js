/**
 * Database connection and initialization.
 * Uses better-sqlite3 for synchronous SQLite access.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { config } = require('../config');

const DB_PATH = config.GWN_DB_PATH;
let db = null;

/** Check if an error is a SQLite lock/busy error. */
function isSqliteLockError(err) {
  return err.code === 'SQLITE_BUSY' ||
    err.code === 'SQLITE_LOCKED' ||
    err.code === 'SQLITE_BUSY_SNAPSHOT';
}

/** Get the database instance (lazy init). */
function getDb() {
  if (!db) {
    // Ensure data/ directory exists
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // WAL mode requires shared memory which Azure Files (SMB) doesn't support.
    // Use DELETE journal mode in production/staging, WAL locally for performance.
    const isAzure = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

    try {
      db = new Database(DB_PATH);
    } catch (openErr) {
      if (isAzure && isSqliteLockError(openErr)) {
        // Previous revision may have left WAL/SHM artifacts on Azure Files (SMB).
        // SQLite's WAL recovery requires shared memory which doesn't work on SMB.
        for (const ext of ['-wal', '-shm']) {
          const staleFile = DB_PATH + ext;
          if (fs.existsSync(staleFile)) {
            console.warn(`🧹 Removing stale WAL artifact after open failure (${openErr.code}): ${staleFile}`);
            try {
              fs.unlinkSync(staleFile);
            } catch (unlinkErr) {
              console.warn(`⚠️ Failed to remove ${staleFile}: ${unlinkErr.message}`);
            }
          }
        }
        db = new Database(DB_PATH);
      } else {
        throw openErr;
      }
    }
    db.pragma(isAzure ? 'journal_mode = DELETE' : 'journal_mode = WAL');
    db.pragma('busy_timeout = 30000');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/** Initialize database with schema. Retries on lock errors (Azure Files/SMB). */
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

module.exports = { getDb, initDb, closeDb };
