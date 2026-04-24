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

  it('first /api/* request returns 503+Retry-After AND triggers init', async () => {
    const callsBefore = initSpy.mock.calls.length;
    const res = await agent.get('/api/features').set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('5');
    expect(res.body.error).toBe('Database not yet initialized');
    // Allow the fire-and-forget runInit() to start.
    await new Promise((r) => setTimeout(r, 20));
    expect(initSpy.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('subsequent /api/* request after init succeeds returns 200', async () => {
    // Wait for any in-flight init from the previous test to settle, then
    // probe again. With SQLite the init is fast so by now dbInitialized
    // is true and /api/features should be 200.
    await new Promise((r) => setTimeout(r, 500));
    const ok = await agent.get('/api/features').set('X-Forwarded-Proto', 'https');
    expect(ok.status).toBe(200);
  });
});
