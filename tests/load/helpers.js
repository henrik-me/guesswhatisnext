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
const crypto = require('crypto');

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
 * Requires env var: JWT_SECRET (must match the running server's secret).
 * Optional env var: GWN_DB_PATH (overrides the default SQLite DB path,
 * which defaults to `data/game.db`).
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
      const secretFingerprint = process.env.JWT_SECRET
        ? crypto.createHash('sha256').update(process.env.JWT_SECRET).digest('hex').slice(0, 8)
        : null;
      // Reuse pool if baseUrl matches AND either JWT_SECRET is unset (trust
      // cached tokens) or its fingerprint matches what was used to sign them.
      const secretOk = secretFingerprint === null || existing.secretHash === secretFingerprint;
      if (existing.baseUrl === currentBase && secretOk) {
        console.log('[setup] User pool already exists for this target, skipping setup');
        if (typeof done === 'function') return done();
        return;
      }
      const reason = existing.baseUrl !== currentBase
        ? `target changed (${existing.baseUrl} → ${currentBase})`
        : 'JWT_SECRET changed';
      console.log(`[setup] Pool stale: ${reason}, recreating...`);
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

    // Direct DB seeding — bypasses HTTP rate limits entirely.
    // Guard: refuse to seed if the target looks like a remote server, since
    // the tokens would be signed with the local secret and fail against it.
    const { hostname } = new URL(baseUrl);
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    if (!isLocal && process.env.LOAD_TEST_ALLOW_REMOTE_SEED !== '1') {
      const err = new Error(
        `[setup] LOAD_TEST_TARGET (${baseUrl}) does not point to localhost. ` +
        'Direct DB seeding only works when the test runner shares the server\'s ' +
        'DB and JWT_SECRET. Set LOAD_TEST_ALLOW_REMOTE_SEED=1 to override, or ' +
        'run the load tests inside the same environment as the server.',
      );
      console.error(err.message);
      if (typeof done === 'function') return done(err);
      throw err;
    }

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

      // Seed users inside a transaction, collect metadata for JWT signing
      const users = [];
      const seedAll = db.transaction(() => {
        for (let i = 0; i < count; i++) {
          const username = `loadtest${String(i + 1).padStart(3, '0')}`;
          insertStmt.run(username, hash);
          const user = selectStmt.get(username);
          if (!user) {
            throw new Error(
              `[setup] User ${username} not found after INSERT — schema mismatch or DB error`,
            );
          }
          if (user.role !== 'user') {
            throw new Error(
              `[setup] User ${username} exists with role '${user.role}' (expected 'user'). ` +
              'Aborting to avoid minting tokens for a non-load-test account.',
            );
          }
          users.push({ id: user.id, username: user.username });
        }
      });

      seedAll();

      // Sign JWTs outside the transaction to minimize DB lock duration
      const pool = users.map((user) => ({
        username: user.username,
        token: jwt.sign(
          { id: user.id, username: user.username, role: 'user' },
          jwtSecret,
          { expiresIn: '7d' },
        ),
      }));

      const elapsed = Date.now() - startTime;
      console.log(`[setup] Seeded ${pool.length} users in ${elapsed}ms`);

      // Persist tokens only (not passwords) with restrictive permissions
      // Write to temp file first, then rename for atomic visibility
      const secretHash = crypto.createHash('sha256').update(jwtSecret).digest('hex').slice(0, 8);
      const poolData = { baseUrl, secretHash, users: pool };
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
 * Auth register flow that gracefully handles rate limiting (429).
 *
 * Instead of capturing $.token via YAML (which fails on 429 responses),
 * this function:
 * 1. Attempts registration
 * 2. If 201: captures token, marks success
 * 3. If 429: reads Retry-After, waits, retries once
 * 4. Emits custom metrics: auth.rate_limited counter, auth.retry_after_seconds histogram
 * 5. Never fails the VU for expected rate-limit responses
 */
async function registerWithRetry(context, events, done) {
  const baseUrl = getBaseUrl(context);
  const username = context.vars.username;
  const password = context.vars.password;

  function emitCounter(name) {
    if (events && typeof events.emit === 'function') {
      events.emit('counter', name, 1);
    }
  }

  function emitHistogram(name, value) {
    if (events && typeof events.emit === 'function') {
      events.emit('histogram', name, value);
    }
  }

  try {
    const result = await httpRequestWithHeaders(
      baseUrl, 'POST', '/api/auth/register',
      { username, password },
    );

    if (result.statusCode === 201 && result.body.token) {
      context.vars.token = result.body.token;
      emitCounter('auth.register_success');
      return done();
    }

    if (result.statusCode === 429) {
      emitCounter('auth.rate_limited');

      const retryAfter = parseInt(result.headers['retry-after'], 10);
      const waitSeconds = (Number.isFinite(retryAfter) && retryAfter > 0) ? retryAfter : 1;
      emitHistogram('auth.retry_after_seconds', waitSeconds);

      // Cap the wait to avoid excessively long VU durations
      const cappedWait = Math.min(waitSeconds, 10);
      await new Promise((r) => setTimeout(r, cappedWait * 1000));

      // Retry with a new unique username to avoid duplicate conflicts
      const retryUsername = makeUsername('r');
      const retry = await httpRequestWithHeaders(
        baseUrl, 'POST', '/api/auth/register',
        { username: retryUsername, password },
      );

      if (retry.statusCode === 201 && retry.body.token) {
        context.vars.token = retry.body.token;
        context.vars.username = retryUsername;
        emitCounter('auth.retry_success');
        return done();
      }

      if (retry.statusCode === 429) {
        // Rate limiter is working correctly — mark as expected
        emitCounter('auth.retry_rate_limited');
        return done();
      }

      // Unexpected status on retry
      emitCounter('auth.retry_unexpected_error');
      return done(new Error(`Unexpected retry status: ${retry.statusCode}`));
    }

    if (result.statusCode === 409) {
      // Duplicate username — not a failure, generate a new one and retry
      emitCounter('auth.duplicate_username');
      return done();
    }

    // Unexpected status
    emitCounter('auth.unexpected_error');
    return done(new Error(`Unexpected register status: ${result.statusCode}`));
  } catch (err) {
    emitCounter('auth.network_error');
    return done(err);
  }
}

/**
 * HTTP request that also returns response headers (needed for Retry-After).
 */
function httpRequestWithHeaders(baseUrl, method, urlPath, body, headers = {}) {
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
          resolve({ statusCode: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ statusCode: res.statusCode, body: data, headers: res.headers });
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
  registerWithRetry,
  cleanupUserPool,
  httpRequest,
  httpRequestWithHeaders,
  getBaseUrl,
  loadUserPool,
  makeUsername,
};
