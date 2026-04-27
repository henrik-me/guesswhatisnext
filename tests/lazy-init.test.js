/**
 * CS53-9 / Policy 1: lazy request-driven DB init.
 *
 * In Azure mode (NODE_ENV=production|staging) the server must NOT contact
 * the DB at boot via any timer or scheduler — it must wait for the first
 * inbound /api/* request and then trigger init via the init guard.
 *
 * Asserts:
 *   1. Boot in Azure mode does NOT call initializeDatabase() (no timer
 *      fired the schema migration or the seed) until a request arrives.
 *   2. The first /api/* request returns 503 + Retry-After AND triggers a
 *      single in-flight init.
 *   3. Once init has completed, follow-up /api/* requests return 200.
 *
 * The "concurrent requests share a single in-flight init" invariant is
 * proven separately in tests/db-init-guard.test.js — the gate middleware
 * delegates to that guard via `initGuard.isInFlight()` and `runOnce()`.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const path = require('path');
const fs = require('fs');
const os = require('os');
const supertest = require('supertest');

let server = null;
let agent = null;
let tmpDir = null;
let initSpy = null;
let originalNodeEnv;
let originalTrustProxy;
let originalCanonicalHost;
let originalGwnDbPath;

beforeAll(async () => {
  originalNodeEnv = process.env.NODE_ENV;
  originalTrustProxy = process.env.TRUST_PROXY;
  originalCanonicalHost = process.env.CANONICAL_HOST;
  originalGwnDbPath = process.env.GWN_DB_PATH;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwn-lazy-init-'));
  process.env.GWN_DB_PATH = path.join(tmpDir, 'test.db');
  // Force Azure-mode lazy-init path. SQLite under the hood for the test.
  process.env.NODE_ENV = 'production';
  process.env.TRUST_PROXY = '1';
  process.env.CANONICAL_HOST = 'localhost';

  const serverDir = path.resolve(__dirname, '..', 'server');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverDir)) delete require.cache[key];
  }

  // Spy on initializeDatabase via the db singleton — count getDbAdapter()
  // calls as a proxy for "init was actually attempted".
  const dbModule = require('../server/db');
  initSpy = vi.spyOn(dbModule, 'getDbAdapter');

  const { createServer } = require('../server/app');
  const result = createServer();
  server = result.server;
  await new Promise((resolve) => server.listen(0, resolve));
  agent = supertest(server);
});

afterAll(async () => {
  if (initSpy) initSpy.mockRestore();
  if (server) {
    try {
      const { closeDbAdapter } = require('../server/db');
      await closeDbAdapter();
    } catch { /* ignore */ }
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  if (originalGwnDbPath === undefined) delete process.env.GWN_DB_PATH; else process.env.GWN_DB_PATH = originalGwnDbPath;
  process.env.NODE_ENV = originalNodeEnv;
  if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = originalTrustProxy;
  if (originalCanonicalHost === undefined) delete process.env.CANONICAL_HOST; else process.env.CANONICAL_HOST = originalCanonicalHost;
});

describe('lazy request-driven init (CS53-9 / Policy 1)', () => {
  it('does not contact the DB at boot — getDbAdapter() not called yet', async () => {
    // Allow any scheduled microtasks to run.
    await new Promise((r) => setTimeout(r, 50));
    expect(initSpy).not.toHaveBeenCalled();
  });

  it('CS53-8b: /api/db-status during cold start returns 200 with dbInitialized=false and does NOT trigger init', async () => {
    // The whole point of /api/db-status is to be probeable during cold
    // start — operators + uptime monitors must be able to ask "is the DB
    // ready yet?" WITHOUT being gated by the request gate (which would
    // 503 them) AND without triggering lazy init themselves (which would
    // defeat the in-memory-only contract). This must hold true BEFORE
    // any DB-touching request has fired runInit().
    const callsBefore = initSpy.mock.calls.length;
    const res = await agent
      .get('/api/db-status')
      .set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(200);
    expect(res.body.dbInitialized).toBe(false);
    expect(res.body.isInFlight).toBe(false);
    expect(res.body.unavailability).toBeNull();
    expect(res.headers['retry-after']).toBeUndefined();
    // Allow microtasks to drain so any spurious runInit() would surface.
    await new Promise((r) => setTimeout(r, 50));
    expect(initSpy.mock.calls.length).toBe(callsBefore);
  });

  it('header-less request during cold start gets 503 but does NOT trigger init (CS53-19.D)', async () => {
    // CS53-19.D contract: a header-less /api/* request during cold start
    // must return 503+Retry-After WITHOUT calling runInit(). This test runs
    // BEFORE the activity-driven init test below so the DB module state is
    // still uninitialized — once that next test fires runInit(), the DB
    // becomes initialized and this assertion is no longer testable in
    // isolation. (Copilot R1 finding: skipped → enabled by reordering.)
    const callsBefore = initSpy.mock.calls.length;
    const res = await agent
      .get('/api/features')
      .set('X-Forwarded-Proto', 'https');
      // intentionally NO X-User-Activity, NO X-API-Key
    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('5');
    expect(res.body.error).toBe('Database not yet initialized');
    expect(res.body.phase).toBe('cold-start');
    // Allow microtasks to drain so any spurious runInit() would surface.
    await new Promise((r) => setTimeout(r, 50));
    expect(initSpy.mock.calls.length).toBe(callsBefore);
  });

  it('first /api/* request with user-activity header returns 503+Retry-After AND triggers init', async () => {
    // CS53-19.D — the global cold-start init gate is now boot-quiet aware:
    // header-less requests still get 503+Retry-After but DO NOT drive
    // `runInit()`. Only `X-User-Activity: 1` (or system-key) requests do.
    // This protects the boot-quiet contract for header-less boot/focus
    // traffic that lands during a cold start.
    const callsBefore = initSpy.mock.calls.length;
    const res = await agent
      .get('/api/features')
      .set('X-Forwarded-Proto', 'https')
      .set('X-User-Activity', '1');
    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('5');
    expect(res.body.error).toBe('Database not yet initialized');
    expect(res.body.phase).toBe('cold-start');
    // Allow the fire-and-forget runInit() to start.
    await new Promise((r) => setTimeout(r, 20));
    expect(initSpy.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it.skip('header-less request during cold start gets 503 but does NOT trigger init (CS53-19.D)', async () => {
    // ENABLED — see the duplicate above earlier in the describe block
    // ordering. This stub stays as a placeholder marker for the original
    // CS53-19.D requirement; the active assertion lives at the start of
    // this describe block (must run BEFORE the activity-driven init test
    // because that one initializes the DB).
  });

  it('subsequent /api/* request after init succeeds returns 200', async () => {
    // Wait for any in-flight init from the previous test to settle, then
    // probe again. With SQLite the init is fast so by now dbInitialized
    // is true and /api/features should be 200.
    await new Promise((r) => setTimeout(r, 500));
    const ok = await agent
      .get('/api/features')
      .set('X-Forwarded-Proto', 'https')
      .set('X-User-Activity', '1');
    expect(ok.status).toBe(200);
  });
});
