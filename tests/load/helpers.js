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
  const pool = [];
  console.log(`[setup] Pre-registering ${count} users at ${baseUrl}...`);

  while (pool.length < count) {
    const batchEnd = Math.min(pool.length + batchSize, count);
    const targetCount = batchEnd;

    while (pool.length < targetCount) {
      userCounter++;
      const username = `load_${Date.now()}_${userCounter}`;
      const password = 'LoadTest123!';

      try {
        const res = await httpRequest(baseUrl, 'POST', '/api/auth/register', {
          username,
          password,
        });

        if (res.statusCode === 201 && res.body.token) {
          pool.push({ username, password, token: res.body.token });
        } else if (res.statusCode === 429) {
          console.log(`[setup] Rate limited at ${pool.length} users, waiting for window reset...`);
          await new Promise((r) => setTimeout(r, windowMs));
        } else {
          console.error(`[setup] Registration failed (${res.statusCode}):`, res.body);
        }
      } catch (err) {
        console.error(`[setup] Error registering user:`, err.message);
      }
    }

    if (pool.length < count) {
      console.log(`[setup] Registered ${pool.length}/${count}, waiting for rate limit window...`);
      await new Promise((r) => setTimeout(r, windowMs));
    }
  }

  // Persist to file so scenario workers can load it
  fs.writeFileSync(USER_POOL_FILE, JSON.stringify(pool, null, 2));
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
    console.error('[assignUser] No users in pool — run setupUsers first or check LOAD_TEST_TARGET');
    return done();
  }
  const user = cachedPool[poolIndex % cachedPool.length];
  poolIndex++;
  context.vars.username = user.username;
  context.vars.password = user.password;
  context.vars.token = user.token;
  return done();
}

/**
 * Generate a unique username for auth-specific testing scenarios.
 */
function generateUniqueUser(context, _events, done) {
  userCounter++;
  const id = `${Date.now()}-${userCounter}-${Math.random().toString(36).slice(2, 8)}`;
  context.vars.username = `load_${id}`;
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
