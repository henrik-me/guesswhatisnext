'use strict';

/**
 * Artillery helper functions for load test scenarios.
 *
 * The `setupUsers` before-hook seeds a pool of users directly into the SQLite
 * database (using better-sqlite3, bcryptjs, and jsonwebtoken) and writes
 * signed JWTs to `.user-pool.json`. This avoids the HTTP rate limiter
 * entirely, cutting setup from ~4 minutes to under 1 second.
 *
 * VUs load pre-seeded users via `assignUser` (round-robin).
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const USER_POOL_FILE = path.join(__dirname, '.user-pool.json');
const LOCK_FILE = path.join(__dirname, '.user-pool.lock');

let poolIndex = 0;
let userCounter = 0;

/**
 * Generate a short unique username that fits the server's 3-20 character limit.
 * Uses base36 timestamp + PID + counter for cross-process uniqueness.
 */
function makeUsername(prefix) {
  userCounter++;
  const id = Date.now().toString(36) + process.pid.toString(36) + userCounter.toString(36);
  return `${prefix}${id}`.slice(0, 20);
}

/**
 * Make an HTTP request and return parsed JSON.
 */
function httpRequest(baseUrl, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      timeout: 10000,
    };

    if (url.port) {
      options.port = url.port;
    }

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout: ${method} ${urlPath}`));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function getBaseUrl(context) {
  return (
    process.env.LOAD_TEST_TARGET ||
    context.vars?.$processEnvironment?.LOAD_TEST_TARGET ||
    context.vars?.target ||
    'http://localhost:3000'
  );
}

/**
 * Load user pool from the persisted JSON file.
 * Returns the array of user objects, or [] if the file doesn't exist.
 */
function loadUserPool() {
  try {
    if (fs.existsSync(USER_POOL_FILE)) {
      const data = JSON.parse(fs.readFileSync(USER_POOL_FILE, 'utf8'));
      // Support new format { baseUrl, users } and legacy array format
      return Array.isArray(data) ? data : (data.users || []);
    }
  } catch (err) {
    console.error('[loadUserPool] Failed to read pool file:', err.message);
  }
  return [];
}

/**
 * Called once before the test run via top-level `before`.
 * Seeds users directly into the SQLite database and signs JWTs locally,
 * bypassing the HTTP rate limiter entirely. Persists tokens to a JSON file
 * so scenario workers can access the pool.
 *
 * Requires env vars: GWN_DB_PATH (path to the server's SQLite DB) and
 * JWT_SECRET (must match the running server's secret).
 */
async function setupUsers(context, _events, done) {
  const setupTimeoutMs =
    parseInt(process.env.LOAD_TEST_SETUP_TIMEOUT_MS, 10) || 5 * 60 * 1000;

  // Acquire exclusive lock to prevent concurrent setup across processes
  // Write PID+timestamp so stale locks can be detected
  let lockFd;
  try {
    lockFd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, ts: Date.now() }));
  } catch {
    // Lock file exists — check if it's stale (owner process died)
    try {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      const lockAge = Date.now() - lockData.ts;
      if (lockAge > setupTimeoutMs + 60000) {
        console.log(`[setup] Stale lock detected (age: ${lockAge}ms), removing...`);
        fs.unlinkSync(LOCK_FILE);
        // Retry lock acquisition
        lockFd = fs.openSync(LOCK_FILE, 'wx');
        fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, ts: Date.now() }));
      }
    } catch {
      // Couldn't read/remove stale lock — fall through to wait path
    }

    if (lockFd === undefined) {
      console.log('[setup] Another process is running setup, waiting for pool file...');
      const waitStart = Date.now();
      while (!fs.existsSync(USER_POOL_FILE) && Date.now() - waitStart < setupTimeoutMs) {
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!fs.existsSync(USER_POOL_FILE)) {
        const err = new Error('[setup] Timed out waiting for pool file from another process');
        console.error(err.message);
        if (typeof done === 'function') return done(err);
        throw err;
      }
      if (typeof done === 'function') return done();
      return;
    }
  }

  try {
    // Double-check pool file after acquiring lock
    if (fs.existsSync(USER_POOL_FILE)) {
      const existing = JSON.parse(fs.readFileSync(USER_POOL_FILE, 'utf8'));
      const currentBase = getBaseUrl(context);
      if (existing.baseUrl === currentBase) {
        console.log('[setup] User pool already exists for this target, skipping setup');
        if (typeof done === 'function') return done();
        return;
      }
      console.log(`[setup] Pool exists for ${existing.baseUrl} but target is ${currentBase}, recreating...`);
    }

    const baseUrl = getBaseUrl(context);
    const parsed = parseInt(process.env.LOAD_TEST_USER_COUNT, 10);
    const count = Number.isNaN(parsed) ? 20 : parsed;

    if (count < 1) {
      const err = new Error(`[setup] LOAD_TEST_USER_COUNT must be >= 1, got ${count}`);
      console.error(err.message);
      if (typeof done === 'function') return done(err);
      throw err;
    }

    // Direct DB seeding — bypasses HTTP rate limits entirely
    const Database = require('better-sqlite3');
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');

    const dbPath = process.env.GWN_DB_PATH
      || path.join(__dirname, '..', '..', 'data', 'game.db');
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      const err = new Error(
        '[setup] JWT_SECRET env var is required for direct DB seeding',
      );
      console.error(err.message);
      if (typeof done === 'function') return done(err);
      throw err;
    }

    if (!fs.existsSync(dbPath)) {
      const err = new Error(
        `[setup] Database file not found at ${dbPath} — start the server first to create it`,
      );
      console.error(err.message);
      if (typeof done === 'function') return done(err);
      throw err;
    }

    console.log(`[setup] Seeding ${count} users directly into DB at ${dbPath}...`);
    const startTime = Date.now();

    const db = new Database(dbPath);
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');

    try {
      // Hash once, reuse for all users (same cost factor as the server)
      const hash = bcrypt.hashSync('LoadTest123!', 10);

      const insertStmt = db.prepare(
        "INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, 'user')",
      );
      const selectStmt = db.prepare(
        'SELECT id, username, role FROM users WHERE username = ?',
      );

      const pool = [];
      const seedAll = db.transaction(() => {
        for (let i = 0; i < count; i++) {
          const username = `loadtest${String(i + 1).padStart(3, '0')}`;
          insertStmt.run(username, hash);
          const user = selectStmt.get(username);
          const token = jwt.sign(
            { id: user.id, username: user.username, role: 'user' },
            jwtSecret,
            { expiresIn: '7d' },
          );
          pool.push({ username, token });
        }
      });

      seedAll();

      const elapsed = Date.now() - startTime;
      console.log(`[setup] Seeded ${pool.length} users in ${elapsed}ms`);

      // Persist tokens only (not passwords) with restrictive permissions
      // Write to temp file first, then rename for atomic visibility
      const poolData = { baseUrl, users: pool };
      const tmpFile = USER_POOL_FILE + '.tmp';
      fs.writeFileSync(tmpFile, JSON.stringify(poolData, null, 2), { mode: 0o600 });
      fs.renameSync(tmpFile, USER_POOL_FILE);
      console.log(`[setup] Saved user pool to ${USER_POOL_FILE}`);
    } finally {
      db.close();
    }
  } finally {
    // Release lock
    if (lockFd !== undefined) {
      fs.closeSync(lockFd);
      try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
    }
  }
  if (typeof done === 'function') return done();
}

/**
 * Assign a pre-registered user to the current VU (round-robin).
 * Loads the user pool from the JSON file on first call.
 */
let cachedPool = null;
function assignUser(context, _events, done) {
  if (!cachedPool) {
    cachedPool = loadUserPool();
  }
  if (cachedPool.length === 0) {
    const err = new Error('[assignUser] No users in pool — run setupUsers first or check LOAD_TEST_TARGET');
    console.error(err.message);
    return done(err);
  }
  const user = cachedPool[poolIndex % cachedPool.length];
  poolIndex++;
  context.vars.username = user.username;
  context.vars.token = user.token;
  return done();
}

/**
 * Generate a unique username for auth-specific testing scenarios.
 */
function generateUniqueUser(context, _events, done) {
  context.vars.username = makeUsername('t');
  context.vars.password = 'LoadTest123!';
  return done();
}

/**
 * Clean up the user pool and lock files (called via top-level `after` hook).
 * The `after` hook runs once after all Artillery workers have completed,
 * so there is no risk of deleting files while workers are still running.
 */
function cleanupUserPool(_context, _events, done) {
  const tmpFile = USER_POOL_FILE + '.tmp';
  try {
    for (const f of [USER_POOL_FILE, LOCK_FILE, tmpFile]) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  } catch {
    // Ignore cleanup errors
  }
  if (typeof done === 'function') return done();
}

module.exports = {
  setupUsers,
  assignUser,
  generateUniqueUser,
  cleanupUserPool,
  httpRequest,
  getBaseUrl,
  loadUserPool,
  makeUsername,
};
