/**
 * Database connection and initialization.
 * Uses better-sqlite3 for synchronous SQLite access.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'game.db');
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
    db.pragma('journal_mode = WAL');
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

  // Seed system account if it doesn't exist
  const SYSTEM_API_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';
  const existing = database.prepare('SELECT id FROM users WHERE username = ?').get('system');
  if (!existing) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync(SYSTEM_API_KEY, 10);
    database.prepare("INSERT INTO users (username, password_hash, role) VALUES ('system', ?, 'system')").run(hash);
    console.log('🔑 System account seeded');
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
