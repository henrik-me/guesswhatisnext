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

/** Returns the supertest agent bound to the test server. */
function getAgent() {
  if (!agent) throw new Error('Call setup() in beforeAll first');
  return agent;
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
  await waitForDbInit();

  // Listen on port 0 = OS-assigned random port (no conflicts)
  await new Promise((resolve) => {
    server.listen(0, () => resolve());
  });

  agent = supertest(server);
}

/** Wait for the database adapter to be initialized (async init in createServer). */
async function waitForDbInit(timeoutMs = 10000) {
  const { isAdapterInitialized } = require('../server/db');
  const start = Date.now();
  while (!isAdapterInitialized()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Database initialization timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
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

module.exports = { getAgent, getServer, setup, teardown, registerUser };
