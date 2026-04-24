/**
 * Route-level integration test for the central error handler's
 * "permanent DB unavailability" branch (CS53 Bug B).
 *
 * The unit tests in tests/transient-db-error.test.js cover the
 * getDbUnavailability() helper in isolation. This test exercises the
 * end-to-end flow: a real DB-touching API request fails with an
 * Azure-SQL-Free-Tier capacity-exhausted error and must be transformed
 * by server/app.js's central error handler into a 503 response with
 * the structured body { unavailable: true, reason, message } and NO
 * Retry-After header — so the SPA's progressive loader bails out
 * (renders a banner) instead of cycling the warmup loop forever.
 *
 * We force a real failure by:
 *   1. Booting the app with the sqlite test harness (same pattern as
 *      tests/admin-init-failure.test.js).
 *   2. Monkey-patching the live adapter's `all` method to throw an
 *      Error whose message matches the documented Azure SQL Free Tier
 *      "free amount allowance / paused for the remainder of the month"
 *      pattern (the matcher in getDbUnavailability is dialect-agnostic
 *      because the message is unmistakably Azure SQL — see CS53-2).
 *   3. Hitting GET /api/scores/leaderboard, which calls db.all() and
 *      propagates failures to next(err) — the central handler.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const supertest = require('supertest');

let server = null;
let agent = null;
let tmpDir = null;
let liveAdapter = null;
let originalAll = null;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwn-unavail-'));
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

  const { getDbAdapter } = require('../server/db');
  liveAdapter = await getDbAdapter();
  originalAll = liveAdapter.all.bind(liveAdapter);
});

afterAll(async () => {
  if (liveAdapter && originalAll) {
    liveAdapter.all = originalAll;
  }
  if (server) {
    // Close the live adapter directly via its captured handle, since the
    // require.cache for `../server/db` is purged by the second describe's
    // beforeAll (so re-requiring it here would resolve a different module
    // with no _instance, leaking the open sqlite file handle and causing
    // EBUSY on Windows tmpDir cleanup).
    if (liveAdapter && typeof liveAdapter.close === 'function') {
      try { await liveAdapter.close(); } catch { /* ignore */ }
    }
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    server = null;
    agent = null;
    liveAdapter = null;
  }
  if (tmpDir && fs.existsSync(tmpDir)) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    tmpDir = null;
  }
  delete process.env.GWN_DB_PATH;
});

describe('Central error handler — permanent DB unavailability (CS53 Bug B)', () => {
  test('GET /api/scores/leaderboard returns 503 + { unavailable: true, reason: "capacity-exhausted" } with NO Retry-After when the DB throws a free-tier exhaustion error', async () => {
    // Synthesize the exact Azure SQL Free Tier capacity-exhausted error
    // shape: ELOGIN with a message including "free amount allowance"
    // and "paused for the remainder of the month".
    liveAdapter.all = async () => {
      const err = new Error(
        "Database 'gwn-prod' on server 'gwn-prod-sql' has reached its free amount allowance and is paused for the remainder of the month."
      );
      err.code = 'ELOGIN';
      throw err;
    };

    const res = await agent.get('/api/scores/leaderboard');

    expect(res.status).toBe(503);
    expect(res.body.unavailable).toBe(true);
    expect(res.body.reason).toBe('capacity-exhausted');
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);

    // CRITICAL: no Retry-After header. Its absence is the SPA's signal
    // (progressive-loader.js → UnavailableError) to stop retrying and
    // render the unavailable banner instead of cycling the warmup loop.
    expect(res.headers['retry-after']).toBeUndefined();

    // Must NOT have been classified as a transient error — the body
    // shape would differ (no `unavailable` field, generic message).
    expect(res.body.error).toBe('Database temporarily unavailable');
    expect(res.body.retryAfter).toBeUndefined();
  });

  test('a transient DB error on the same route still returns 503 WITH Retry-After (regression guard for the unavailability branch not over-matching)', async () => {
    // SQLITE_BUSY is the sqlite-dialect transient signal; isTransientDbError
    // recognises it and the central handler converts it to 503 + Retry-After.
    // It must NOT match getDbUnavailability — that's the regression we're
    // guarding (the unavailability branch over-matching transient errors).
    liveAdapter.all = async () => {
      const err = new Error('database is locked');
      err.code = 'SQLITE_BUSY';
      throw err;
    };

    const res = await agent.get('/api/scores/leaderboard');

    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('5');
    expect(res.body.unavailable).toBeUndefined();
    expect(res.body.reason).toBeUndefined();
    expect(res.body.retryAfter).toBe(5);
  });
});

/**
 * Companion test for the *startup* init-failure path: when self-init or
 * the admin init endpoint fails with a permanent free-tier exhaustion
 * error, dbInitialized stays false, so every /api/* request is rejected
 * by the request gate BEFORE any route handler runs. The gate must
 * surface the same { unavailable: true, reason, message } 503 (no
 * Retry-After) — otherwise the SPA would keep warmup-retrying forever
 * because the gate's generic "Database not yet initialized" + Retry-After
 * shape is what triggers retries, not the unavailable banner.
 *
 * Approach: spin up a *second* server instance with the sqlite adapter
 * pre-swapped to one whose connect() throws a free-tier-shaped error.
 * The Azure self-init path is not exercised in tests (NODE_ENV=test, not
 * production/staging), so we drive the failure through POST
 * /api/admin/init-db, which calls the same runInit() helper that the
 * self-init timer uses. That populates the `dbUnavailability` state the
 * gate consults.
 */
describe('Request gate — permanent DB unavailability before init succeeds (CS53 Bug B startup path)', () => {
  const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';

  let server2 = null;
  let agent2 = null;
  let tmpDir2 = null;
  let sqliteAdapterPath2 = null;
  let originalSqliteCacheEntry2 = null;

  beforeAll(async () => {
    tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'gwn-unavail-startup-'));
    process.env.GWN_DB_PATH = path.join(tmpDir2, 'test.db');
    process.env.NODE_ENV = 'test';

    const serverDir = path.resolve(__dirname, '..', 'server');
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(serverDir)) delete require.cache[key];
    }

    const { createServer } = require('../server/app');
    const result = createServer();
    server2 = result.server;
    if (result.dbReady) await result.dbReady;
    await new Promise((resolve) => server2.listen(0, resolve));
    agent2 = supertest(server2);

    sqliteAdapterPath2 = require.resolve('../server/db/sqlite-adapter');
    originalSqliteCacheEntry2 = require.cache[sqliteAdapterPath2];
  });

  afterAll(async () => {
    if (originalSqliteCacheEntry2 && sqliteAdapterPath2) {
      require.cache[sqliteAdapterPath2] = originalSqliteCacheEntry2;
    }
    if (server2) {
      try {
        const { closeDbAdapter } = require('../server/db');
        await closeDbAdapter();
      } catch { /* ignore */ }
      await new Promise((resolve, reject) =>
        server2.close((err) => (err ? reject(err) : resolve()))
      );
      server2 = null;
      agent2 = null;
    }
    if (tmpDir2 && fs.existsSync(tmpDir2)) {
      fs.rmSync(tmpDir2, { recursive: true, force: true });
      tmpDir2 = null;
    }
    delete process.env.GWN_DB_PATH;
  });

  test('a free-tier-exhaustion failure during init makes the gate return { unavailable: true } with NO Retry-After', async () => {
    // Force the next initializeDatabase() to fail with a capacity-exhausted
    // shape by closing the live adapter and swapping the cached
    // sqlite-adapter module for one whose connect() throws.
    const dbModule = require('../server/db');
    await dbModule.closeDbAdapter();

    class CapacityExhaustedAdapter {
      constructor() { this.dialect = 'sqlite'; }
      async connect() {
        const err = new Error(
          "Database 'gwn-prod' has reached its free amount allowance and is paused for the remainder of the month."
        );
        err.code = 'ELOGIN';
        throw err;
      }
      async close() { /* no-op */ }
    }
    require.cache[sqliteAdapterPath2] = {
      ...originalSqliteCacheEntry2,
      exports: CapacityExhaustedAdapter,
    };

    // Drive runInit() via the admin endpoint — same code path the Azure
    // self-init timer uses, but synchronously observable in a test.
    const initRes = await agent2
      .post('/api/admin/init-db')
      .set('X-API-Key', SYSTEM_KEY);
    expect(initRes.status).toBe(500);

    // The gate at server/app.js's request-tracking middleware should now
    // return the unavailable shape, not the generic "not yet initialized"
    // + Retry-After response.
    const gated = await agent2.get('/api/scores/leaderboard');
    expect(gated.status).toBe(503);
    expect(gated.body.unavailable).toBe(true);
    expect(gated.body.reason).toBe('capacity-exhausted');
    expect(typeof gated.body.message).toBe('string');
    expect(gated.headers['retry-after']).toBeUndefined();
    // Must NOT be the generic "not yet initialized" shape — that would
    // keep the SPA warmup-retrying forever instead of showing the banner.
    expect(gated.body.error).not.toBe('Database not yet initialized');
    expect(gated.body.retryAfter).toBeUndefined();

    // Restore the real sqlite-adapter and verify a successful init clears
    // the unavailability state — the gate must stop returning 503 for
    // ordinary requests once the DB is healthy again.
    require.cache[sqliteAdapterPath2] = originalSqliteCacheEntry2;

    const recoverRes = await agent2
      .post('/api/admin/init-db')
      .set('X-API-Key', SYSTEM_KEY);
    expect(recoverRes.status).toBe(200);

    const recovered = await agent2.get('/api/scores/leaderboard');
    expect(recovered.status).toBe(200);
    expect(recovered.body.unavailable).toBeUndefined();
  });
});
