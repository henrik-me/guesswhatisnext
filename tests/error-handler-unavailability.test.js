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
 *   2. Flipping config.DB_BACKEND to 'mssql' for the duration of the
 *      test so the central handler invokes getDbUnavailability()
 *      (which only matches mssql-shaped errors).
 *   3. Monkey-patching the live adapter's `all` method to throw an
 *      Error whose message matches the documented Azure SQL Free Tier
 *      "free amount allowance / paused for the remainder of the month"
 *      pattern.
 *   4. Hitting GET /api/scores/leaderboard, which calls db.all() and
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
let originalDbBackend = null;
let configRef = null;

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

  // The central error handler reads config.DB_BACKEND dynamically, so we
  // can flip it for this test without re-creating the app or the
  // underlying sqlite adapter.
  ({ config: configRef } = require('../server/config'));
  originalDbBackend = configRef.DB_BACKEND;
  configRef.DB_BACKEND = 'mssql';
});

afterAll(async () => {
  if (liveAdapter && originalAll) {
    liveAdapter.all = originalAll;
  }
  if (configRef) {
    configRef.DB_BACKEND = originalDbBackend;
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
    // Pattern that isTransientDbError matches but getDbUnavailability does not.
    liveAdapter.all = async () => {
      const err = new Error('Connection timeout: failed to connect to database');
      err.name = 'ConnectionError';
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
