// @ts-check
/**
 * CS53-19 boot-quiet contract regression test.
 *
 * Verifies that every enrolled endpoint honors the contract: header-less
 * non-system requests (cold-anonymous / warm-no-gesture / refocus) MUST NOT
 * touch the DB, while `X-User-Activity: 1` or system-key callers MAY.
 *
 * Implementation:
 *   - Driven by Playwright's `request` fixture (pure HTTP). Boot-quiet is
 *     fundamentally an HTTP contract — no browser harness needed.
 *   - Assertions read the `X-Boot-Quiet-DB-Touched: true|false` response
 *     header, which the server sets via `logBootQuiet()` in
 *     `server/services/boot-quiet.js` AND inline in the
 *     `/api/notifications/count` handler. This works in any environment:
 *     local Playwright webServer, Docker container in CI, or a deployed
 *     Azure Container App. (Earlier revision scraped server stdout from
 *     `.playwright/server.log` — that file only exists when Playwright's
 *     local `webServer` runs `scripts/dev-server.js --output …`, not in
 *     CI's Ephemeral Smoke Test which runs the app as a Docker service.)
 *   - The 7 enrolled endpoints (per CS53-19): /api/auth/me, /api/features,
 *     /api/notifications, /api/notifications/count, /api/scores/me,
 *     /api/achievements, /api/matches/history.
 */

import { test, expect } from '@playwright/test';

const ENDPOINTS = [
  { route: '/api/auth/me', requiresAuth: true },
  { route: '/api/features', requiresAuth: false },
  { route: '/api/notifications', requiresAuth: true },
  { route: '/api/notifications/count', requiresAuth: true },
  { route: '/api/scores/me', requiresAuth: true },
  { route: '/api/achievements', requiresAuth: true },
  { route: '/api/matches/history', requiresAuth: true },
];

const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'test-system-api-key';

test.describe('CS53-19 boot-quiet contract — enrolled endpoints', () => {
  test('matrix: dbTouched honors X-User-Activity / system-key across all 7 endpoints', async ({ request }) => {
    // Register a fresh user to obtain a JWT for authenticated probes.
    const username = `bq${Date.now().toString(36)}`;
    const reg = await request.post('/api/auth/register', {
      data: { username, password: 'TestPassword123!' },
    });
    expect(reg.ok()).toBeTruthy();
    const { token } = await reg.json();
    expect(typeof token).toBe('string');

    /** @type {{ name: string, headers: Record<string,string>, expectDbTouched: boolean, isAuthenticated: boolean, isSystem: boolean }[]} */
    const scenarios = [
      // 1. cold/warm boot, anonymous, no gesture → must NOT touch DB.
      //    For requireAuth endpoints, anon → 401 (no boot-quiet header set; matcher must skip).
      { name: 'anon-no-activity', headers: {}, expectDbTouched: false, isAuthenticated: false, isSystem: false },
      // 2. anon with explicit gesture → may touch DB (auth/me etc still 401, but feature flags can read).
      { name: 'anon-with-activity', headers: { 'X-User-Activity': '1' }, expectDbTouched: true, isAuthenticated: false, isSystem: false },
      // 3. JWT present, no gesture → must NOT touch DB (boot/refocus pattern).
      { name: 'jwt-no-activity', headers: { Authorization: `Bearer ${token}` }, expectDbTouched: false, isAuthenticated: true, isSystem: false },
      // 4. JWT + gesture → must touch DB.
      { name: 'jwt-with-activity', headers: { Authorization: `Bearer ${token}`, 'X-User-Activity': '1' }, expectDbTouched: true, isAuthenticated: true, isSystem: false },
      // 5. system-key bypass → must touch DB without needing the activity header.
      { name: 'system-key', headers: { 'X-API-Key': SYSTEM_KEY }, expectDbTouched: true, isAuthenticated: true, isSystem: true },
    ];

    /** @type {string[]} */
    const failures = [];

    for (const scenario of scenarios) {
      for (const ep of ENDPOINTS) {
        const res = await request.get(ep.route, { headers: scenario.headers });

        // requireAuth endpoints with no auth → 401 → no boot-quiet header set
        // (the request never reaches the handler). Skip those (scenario,
        // endpoint) pairs.
        if (ep.requiresAuth && !scenario.isAuthenticated) {
          if (res.status() !== 401) {
            failures.push(`${scenario.name} ${ep.route}: expected 401 (anon on requireAuth) but got ${res.status()}`);
          }
          continue;
        }

        const headers = res.headers();
        const dbTouchedHeader = headers['x-boot-quiet-db-touched'];
        if (dbTouchedHeader !== 'true' && dbTouchedHeader !== 'false') {
          failures.push(`${scenario.name} ${ep.route}: missing/invalid X-Boot-Quiet-DB-Touched header (got ${JSON.stringify(dbTouchedHeader)}, status=${res.status()})`);
          continue;
        }
        const dbTouched = dbTouchedHeader === 'true';

        // /api/features has no DB query in any scenario — always false.
        const expectDbTouched = ep.route === '/api/features' ? false : scenario.expectDbTouched;

        if (dbTouched !== expectDbTouched) {
          // /api/notifications/count has a per-user cache: even with
          // X-User-Activity:1 a HIT returns dbTouched=false. Accept either
          // value for that route when we expected true; the boot-quiet
          // contract (false when header-less + non-system) is still
          // enforced by the no-activity scenarios.
          if (ep.route === '/api/notifications/count' && expectDbTouched && dbTouched === false) {
            // Cache hit — acceptable.
            continue;
          }
          failures.push(`${scenario.name} ${ep.route}: X-Boot-Quiet-DB-Touched=${dbTouched} expected ${expectDbTouched} (status=${res.status()})`);
        }

        // Cross-check the discriminator headers match the scenario shape.
        const userActivityHeader = headers['x-boot-quiet-user-activity'];
        const isSystemHeader = headers['x-boot-quiet-is-system'];
        const expectUserActivity = scenario.headers['X-User-Activity'] === '1';
        if (userActivityHeader !== (expectUserActivity ? 'true' : 'false')) {
          failures.push(`${scenario.name} ${ep.route}: X-Boot-Quiet-User-Activity=${userActivityHeader} expected ${expectUserActivity}`);
        }
        if (isSystemHeader !== (scenario.isSystem ? 'true' : 'false')) {
          failures.push(`${scenario.name} ${ep.route}: X-Boot-Quiet-Is-System=${isSystemHeader} expected ${scenario.isSystem}`);
        }
      }
    }

    if (failures.length) {
      throw new Error(`Boot-quiet matrix failures (${failures.length}):\n  - ${failures.join('\n  - ')}`);
    }
  });
});
