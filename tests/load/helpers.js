'use strict';

/**
 * Artillery helper functions for load test scenarios.
 *
 * The server applies per-IP rate limiting on auth endpoints (5 reg/min,
 * 10 login/min). To work around this during load testing, we pre-register
 * a pool of users in `setupUsers` (before hook), persist them to a JSON file,
 * and VUs load them via `assignUser`.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const USER_POOL_FILE = path.join(__dirname, '.user-pool.json');

let poolIndex = 0;
let userCounter = 0;

/**
 * Generate a short unique username that fits the server's 3-20 character limit.
 * Uses base36 timestamp + counter for uniqueness.
 */
function makeUsername(prefix) {
  userCounter++;
  const id = Date.now().toString(36) + userCounter.toString(36);
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
      return JSON.parse(fs.readFileSync(USER_POOL_FILE, 'utf8'));
    }
  } catch {
    // Ignore read errors
  }
  return [];
}

/**
 * Called once before the test run via top-level `before`.
 * Registers users in batches of 4 (staying under the 5/min rate limit),
 * waiting for the rate limit window between batches. Persists to a JSON file
 * so scenario workers can access the pool.
 */
async function setupUsers(context, _events, done) {
  const baseUrl = getBaseUrl(context);
  const count = parseInt(process.env.LOAD_TEST_USER_COUNT, 10) || 20;
  const batchSize = 4; // stay under 5/min rate limit
  const windowMs = 61000; // slightly over 60s rate limit window
  const maxDurationMs =
    parseInt(process.env.LOAD_TEST_SETUP_TIMEOUT_MS, 10) || 5 * 60 * 1000;
  const maxAttempts = count * 10;
  const non429BackoffMs = 500;
  const startTime = Date.now();
  let attempts = 0;
  let shouldAbort = false;
  const pool = [];
  console.log(`[setup] Pre-registering ${count} users at ${baseUrl}...`);

  while (pool.length < count && !shouldAbort) {
    const batchEnd = Math.min(pool.length + batchSize, count);
    const targetCount = batchEnd;

    while (pool.length < targetCount && !shouldAbort) {
      const username = makeUsername('l');
      const password = 'LoadTest123!';
      attempts++;

      try {
        const res = await httpRequest(baseUrl, 'POST', '/api/auth/register', {
          username,
          password,
        });

        if (res.statusCode === 201 && res.body.token) {
          pool.push({ username, token: res.body.token });
        } else if (res.statusCode === 429) {
          console.log(`[setup] Rate limited at ${pool.length} users, waiting for window reset...`);
          await new Promise((r) => setTimeout(r, windowMs));
        } else {
          console.error(`[setup] Registration failed (${res.statusCode}):`, res.body);
          await new Promise((r) => setTimeout(r, non429BackoffMs));
        }
      } catch (err) {
        console.error(`[setup] Error registering user:`, err.message);
        await new Promise((r) => setTimeout(r, non429BackoffMs));
      }

      const elapsed = Date.now() - startTime;
      if (elapsed > maxDurationMs) {
        console.error(
          `[setup] Aborting: exceeded max duration (${maxDurationMs}ms) with ${pool.length}/${count} users`,
        );
        shouldAbort = true;
      } else if (attempts >= maxAttempts && pool.length < count) {
        console.error(
          `[setup] Aborting: exceeded max attempts (${maxAttempts}) with ${pool.length}/${count} users`,
        );
        shouldAbort = true;
      }
    }

    if (!shouldAbort && pool.length < count) {
      console.log(`[setup] Registered ${pool.length}/${count}, waiting for rate limit window...`);
      await new Promise((r) => setTimeout(r, windowMs));
    }
  }

  if (pool.length < count) {
    const err = new Error(
      `[setup] Failed to prepare user pool: created ${pool.length}/${count} users before hitting limits`,
    );
    console.error(err.message);
    if (typeof done === 'function') return done(err);
    throw err;
  }

  // Persist tokens only (not passwords) with restrictive permissions
  fs.writeFileSync(USER_POOL_FILE, JSON.stringify(pool, null, 2), { mode: 0o600 });
  console.log(`[setup] Registered ${pool.length} users, saved to ${USER_POOL_FILE}`);
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
 * Clean up the user pool file (called via `after` hook).
 */
function cleanupUserPool(context, _events, done) {
  try {
    if (fs.existsSync(USER_POOL_FILE)) {
      fs.unlinkSync(USER_POOL_FILE);
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
};
