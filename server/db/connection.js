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

/** Get the database instance (lazy init). */
function getDb() {
  if (!db) {
    // Ensure data/ directory exists
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(DB_PATH);
    // WAL mode requires shared memory which Azure Files (SMB) doesn't support.
    // Use DELETE journal mode in production/staging, WAL locally for performance.
    const isAzure = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    db.pragma(isAzure ? 'journal_mode = DELETE' : 'journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/** Initialize database with schema. */
function initDb() {
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
