/**
 * Test helper — creates an isolated server instance with its own temp DB.
 *
 * Usage in a test file:
 *   const { getAgent, setup, teardown } = require('./helper');
 *   beforeAll(setup);
 *   afterAll(teardown);
 *   test('example', async () => {
 *     const agent = getAgent();
 *     const res = await agent.get('/api/puzzles').set('X-API-Key', 'gwn-dev-system-key');
 *     expect(res.status).toBe(200);
 *   });
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const supertest = require('supertest');

let server = null;
let agent = null;
let tmpDir = null;

/**
 * Returns the supertest agent bound to the test server.
 *
 * CS53-19: every Test returned by this agent has `X-User-Activity: 1` set
 * by default, mirroring the production reality that almost every test
 * scenario represents a user-initiated request. Boot-quiet specific tests
 * that need to assert header-less behavior should use `getAgentNoActivity()`
 * (returns the unwrapped agent — the caller controls headers explicitly).
 */
function getAgent() {
  if (!agent) throw new Error('Call setup() in beforeAll first');
  return wrappedAgent;
}

/**
 * Returns the unwrapped supertest agent — caller is responsible for setting
 * `X-User-Activity: 1` on requests that are meant to represent user activity.
 * Use this in boot-quiet contract tests that assert header-less behavior.
 */
function getAgentNoActivity() {
  if (!agent) throw new Error('Call setup() in beforeAll first');
  return agent;
}

/**
 * Wrap a supertest agent so every request method (.get, .post, .put, .delete,
 * .patch) returns a Test that pre-sets `X-User-Activity: 1`. Tests can still
 * override per-call (e.g. `.set('X-User-Activity', '0')` is a no-op in the
 * server's check, which only treats the literal string '1' as truthy).
 */
let wrappedAgent = null;
function buildWrappedAgent(rawAgent) {
  const verbs = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
  const wrap = {};
  for (const v of verbs) {
    wrap[v] = (...args) => rawAgent[v](...args).set('X-User-Activity', '1');
  }
  return wrap;
}

/** Returns the raw http.Server instance (for WS connections etc). */
function getServer() {
  if (!server) throw new Error('Call setup() in beforeAll first');
  return server;
}

/** Boot an isolated server with a fresh temp DB. */
async function setup() {
  // Create unique temp directory for this test suite's database
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwn-test-'));
  const dbPath = path.join(tmpDir, 'test.db');

  // Point the DB module at our temp database
  process.env.GWN_DB_PATH = dbPath;
  process.env.NODE_ENV = 'test';

  // Clear any cached modules so the DB singleton re-initializes
  clearModuleCache();

  const { createServer } = require('../server/app');
  const result = createServer();
  server = result.server;

  // Wait for async DB initialization to complete
  if (result.dbReady) {
    await result.dbReady;
  }

  // Listen on port 0 = OS-assigned random port (no conflicts)
  await new Promise((resolve) => {
    server.listen(0, () => resolve());
  });

  agent = supertest(server);
  wrappedAgent = buildWrappedAgent(agent);
}

/** Shut down server and clean up temp DB. */
async function teardown() {
  if (server) {
    // Close DB first
    try {
      const { closeDbAdapter } = require('../server/db');
      await closeDbAdapter();
    } catch { /* ignore */ }

    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    server = null;
    agent = null;
  }

  // Clean up temp files
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }

  // Clean env
  delete process.env.GWN_DB_PATH;
}

/** Clear require cache for server modules so each suite gets fresh state. */
function clearModuleCache() {
  const serverDir = path.resolve(__dirname, '..', 'server');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverDir)) {
      delete require.cache[key];
    }
  }
}

/** Register a test user and return { user, token }. */
async function registerUser(username = 'testuser', password = 'testpass123') {
  const res = await getAgent()
    .post('/api/auth/register')
    .send({ username, password });
  return { user: res.body.user, token: res.body.token };
}

/**
 * CS52-7b — seed/override a `game_configs` row for tests that need a
 * non-default game shape (e.g. small `rounds` to keep multiplayer e2e tests
 * fast). Writes the row directly + busts the loader cache, mirroring what
 * the admin route does at runtime.
 */
async function setGameConfig(mode, { rounds, round_timer_ms, inter_round_delay_ms }) {
  const { getDbAdapter } = require('../server/db');
  const { bustCache } = require('../server/services/gameConfigLoader');
  const db = await getDbAdapter();
  await db.run(
    `INSERT INTO game_configs (mode, rounds, round_timer_ms, inter_round_delay_ms, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(mode) DO UPDATE SET
       rounds = excluded.rounds,
       round_timer_ms = excluded.round_timer_ms,
       inter_round_delay_ms = excluded.inter_round_delay_ms,
       updated_at = CURRENT_TIMESTAMP`,
    [mode, rounds, round_timer_ms, inter_round_delay_ms]
  );
  bustCache(mode);
}

module.exports = { getAgent, getAgentNoActivity, getServer, setup, teardown, registerUser, setGameConfig };
