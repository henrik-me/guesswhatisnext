/**
 * Regression test for CS53-1b: a failed POST /api/admin/init-db must NOT
 * set `draining = true`. Otherwise the slow-retry self-init loop (which
 * early-returns when `draining || dbInitialized`) is permanently disabled
 * until a future successful admin call clears it — defeating the whole
 * "self-heal at free-tier renewal" property added in CS53-1.
 *
 * We force a real failure by swapping the cached `sqlite-adapter` module's
 * exports for a class whose `connect()` throws. Then we hit /api/admin/init-db
 * and assert:
 *   1. The endpoint returns 500.
 *   2. A subsequent normal API request is NOT blocked with the "Server is
 *      draining" error (proving `draining` remained false).
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const supertest = require('supertest');

const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';

let server = null;
let agent = null;
let tmpDir = null;
let sqliteAdapterPath = null;
let originalSqliteCacheEntry = null;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwn-init-fail-'));
  process.env.GWN_DB_PATH = path.join(tmpDir, 'test.db');
  process.env.NODE_ENV = 'test';

  // Fresh module cache so app + db singletons rebuild against this temp DB.
  const serverDir = path.resolve(__dirname, '..', 'server');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverDir)) delete require.cache[key];
  }

  const { createServer } = require('../server/app');
  const result = createServer();
  server = result.server;
  if (result.dbReady) await result.dbReady;
  await new Promise((resolve) => server.listen(0, resolve));
  agent = supertest(server);

  sqliteAdapterPath = require.resolve('../server/db/sqlite-adapter');
  originalSqliteCacheEntry = require.cache[sqliteAdapterPath];
});

afterAll(async () => {
  if (originalSqliteCacheEntry && sqliteAdapterPath) {
    require.cache[sqliteAdapterPath] = originalSqliteCacheEntry;
  }
  if (server) {
    try {
      const { closeDbAdapter } = require('../server/db');
      await closeDbAdapter();
    } catch { /* ignore */ }
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    server = null;
    agent = null;
  }
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
  delete process.env.GWN_DB_PATH;
});

describe('POST /api/admin/init-db (failure path)', () => {
  test('does not set draining=true on failure (CS53-1b regression)', async () => {
    // Sanity check: server is up and serving (dbInitialized=true, draining=false).
    const ok = await agent.get('/api/features');
    expect(ok.status).toBe(200);

    // Force the next initializeDatabase() to fail by:
    //  (a) closing the live adapter so getDbAdapter() must call createDb again,
    //  (b) replacing the cached sqlite-adapter module with one whose
    //      connect() throws.
    const dbModule = require('../server/db');
    await dbModule.closeDbAdapter();

    class FailingAdapter {
      constructor() { this.dialect = 'sqlite'; }
      async connect() { throw new Error('forced connect failure for test'); }
      async close() { /* no-op */ }
    }
    require.cache[sqliteAdapterPath] = {
      ...originalSqliteCacheEntry,
      exports: FailingAdapter,
    };

    const failRes = await agent
      .post('/api/admin/init-db')
      .set('X-API-Key', SYSTEM_KEY);
    expect(failRes.status).toBe(500);
    expect(failRes.body.error).toBe('Database initialization failed');

    // CS53-1b assertion: the failure must not have flipped the server into
    // draining. If it had, /api/puzzles would respond with the "Server is
    // draining" message rather than the "Database not yet initialized" one.
    const probe = await agent.get('/api/features');
    expect(probe.status).toBe(503);
    expect(probe.body.error).not.toBe('Server is draining');
    expect(probe.body.error).toBe('Database not yet initialized');

    // Restore the real sqlite-adapter so a follow-up init-db succeeds and
    // proves the "draining is not stuck" half of the contract end-to-end.
    require.cache[sqliteAdapterPath] = originalSqliteCacheEntry;

    const recoverRes = await agent
      .post('/api/admin/init-db')
      .set('X-API-Key', SYSTEM_KEY);
    expect(recoverRes.status).toBe(200);
    expect(recoverRes.body.status).toBe('initialized');

    const recovered = await agent.get('/api/features');
    expect(recovered.status).toBe(200);
  });
});
