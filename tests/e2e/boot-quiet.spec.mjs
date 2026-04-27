// @ts-check
/**
 * CS53-19 boot-quiet contract regression test.
 *
 * Verifies that every enrolled endpoint emits a Pino `gate: 'boot-quiet'` log
 * line on each request, and that `dbTouched` is `false` for header-less
 * non-system traffic (i.e. cold-anonymous / warm-no-gesture / refocus) and
 * `true` only when `X-User-Activity: 1` is present or the caller is the
 * system service.
 *
 * Implementation notes:
 *   - Driven by the Playwright `request` fixture (pure HTTP). Boot-quiet is
 *     fundamentally an HTTP contract so we don't need a browser harness here.
 *   - Server stdout is captured to `.playwright/server.log` by
 *     `scripts/dev-server.js --output …` (configured in playwright.config.mjs).
 *   - The 7 enrolled endpoints (per CS53-19): /api/auth/me, /api/features,
 *     /api/notifications, /api/notifications/count, /api/scores/me,
 *     /api/achievements, /api/matches/history.
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ENDPOINTS = [
  { route: '/api/auth/me', requiresAuth: true },
  { route: '/api/features', requiresAuth: false },
  { route: '/api/notifications', requiresAuth: true },
  { route: '/api/notifications/count', requiresAuth: true },
  { route: '/api/scores/me', requiresAuth: true },
  { route: '/api/achievements', requiresAuth: true },
  { route: '/api/matches/history', requiresAuth: true },
];

const SERVER_LOG = path.resolve('.playwright', 'server.log');
const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'test-system-api-key';

function readServerLog() {
  if (!fs.existsSync(SERVER_LOG)) return [];
  const raw = fs.readFileSync(SERVER_LOG, 'utf8');
  const lines = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj.gate === 'boot-quiet') lines.push(obj);
    } catch { /* not JSON, skip */ }
  }
  return lines;
}

/**
 * Find the most recent boot-quiet log entry for `route` after the marker
 * timestamp. Returns null if none match. Currently unused (kept for future
 * scenario-specific lookups) — see the inline matcher in the main test.
 */
// eslint-disable-next-line no-unused-vars
function findMatching(logs, route, sinceMs) {
  for (let i = logs.length - 1; i >= 0; i--) {
    const e = logs[i];
    if (e.route !== route) continue;
    if (typeof e.time === 'number' && e.time < sinceMs) continue;
    return e;
  }
  return null;
}

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

    // Decode the user id from the JWT to discriminate logs (Copilot R1):
    // anon and jwt scenarios with no activity header otherwise share the
    // same (userActivity=false, isSystem=false) shape and could match each
    // other's log lines on shared endpoints. JWT payload is the middle
    // base64url segment.
    const jwtPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const jwtUserId = jwtPayload.id;
    expect(typeof jwtUserId).toBe('number');

    // Marker timestamp — only consider log lines emitted after this point.
    const sinceMs = Date.now();

    /** @type {{ name: string, headers: Record<string,string>, expectDbTouched: boolean, expectUserId: number, isAuthenticated: boolean }[]} */
    const scenarios = [
      // 1. cold/warm boot, anonymous, no gesture → must NOT touch DB.
      //    For requireAuth endpoints, anon → 401 (no boot-quiet log emitted; matcher must skip).
      { name: 'anon-no-activity', headers: {}, expectDbTouched: false, expectUserId: 0, isAuthenticated: false },
      // 2. anon with explicit gesture → may touch DB (auth/me etc still 401, but feature flags can read).
      { name: 'anon-with-activity', headers: { 'X-User-Activity': '1' }, expectDbTouched: true, expectUserId: 0, isAuthenticated: false },
      // 3. JWT present, no gesture → must NOT touch DB (boot/refocus pattern).
      { name: 'jwt-no-activity', headers: { Authorization: `Bearer ${token}` }, expectDbTouched: false, expectUserId: jwtUserId, isAuthenticated: true },
      // 4. JWT + gesture → must touch DB.
      { name: 'jwt-with-activity', headers: { Authorization: `Bearer ${token}`, 'X-User-Activity': '1' }, expectDbTouched: true, expectUserId: jwtUserId, isAuthenticated: true },
      // 5. system-key bypass → must touch DB without needing the activity header.
      //    The system pseudo-user has id=0 (set by requireAuth on the API-key path).
      { name: 'system-key', headers: { 'X-API-Key': SYSTEM_KEY }, expectDbTouched: true, expectUserId: 0, isAuthenticated: true },
    ];

    /** @type {{ scenario: string, route: string, status: number, dbTouched: any }[]} */
    const matrix = [];

    for (const scenario of scenarios) {
      for (const ep of ENDPOINTS) {
        // /api/features has no DB query in any scenario — expect dbTouched=false always.
        const expectDbTouched = ep.route === '/api/features' ? false : scenario.expectDbTouched;
        const res = await request.get(ep.route, { headers: scenario.headers });
        matrix.push({
          scenario: scenario.name,
          route: ep.route,
          status: res.status(),
          dbTouched: expectDbTouched,
        });
      }
    }

    // Give Pino a moment to flush to stdout → server.log.
    await new Promise(r => setTimeout(r, 750));

    const logs = readServerLog();
    expect(logs.length, 'expected at least one boot-quiet log line in .playwright/server.log').toBeGreaterThan(0);

    // For each (scenario, endpoint) pair, locate the most recent matching log
    // line and assert the dbTouched + userActivity + isSystem fields.
    // Discriminates by userId so anon and jwt scenarios with the same
    // (userActivity=false, isSystem=false) shape don't match each other's
    // logs (Copilot R1).
    const failures = [];
    for (const scenario of scenarios) {
      for (const ep of ENDPOINTS) {
        // requireAuth endpoints with no auth → 401 → no boot-quiet log
        // (the request never reaches the handler). Skip those (scenario,
        // endpoint) pairs in the matcher.
        if (ep.requiresAuth && !scenario.isAuthenticated) continue;

        const expectDbTouched = ep.route === '/api/features' ? false : scenario.expectDbTouched;
        const expectUserActivity = scenario.headers['X-User-Activity'] === '1';
        const expectIsSystem = scenario.headers['X-API-Key'] === SYSTEM_KEY;
        const expectUserId = scenario.expectUserId;
        // Look from the end and find the entry whose route, userActivity,
        // isSystem AND userId all match the scenario.
        let entry = null;
        for (let i = logs.length - 1; i >= 0; i--) {
          const e = logs[i];
          if (e.route !== ep.route) continue;
          if (typeof e.time === 'number' && e.time < sinceMs) continue;
          if (Boolean(e.userActivity) !== expectUserActivity) continue;
          if (Boolean(e.isSystem) !== expectIsSystem) continue;
          if (Number(e.userId) !== Number(expectUserId)) continue;
          entry = e;
          break;
        }
        if (!entry) {
          failures.push(`no boot-quiet log for ${scenario.name} ${ep.route} (userActivity=${expectUserActivity}, isSystem=${expectIsSystem}, userId=${expectUserId})`);
          continue;
        }
        if (typeof entry.dbTouched !== 'boolean') {
          failures.push(`${scenario.name} ${ep.route}: dbTouched is not boolean (${typeof entry.dbTouched})`);
          continue;
        }
        if (entry.dbTouched !== expectDbTouched) {
          // /api/notifications/count has a per-user cache: even with
          // X-User-Activity:1 a HIT returns dbTouched=false. Accept either
          // value for that route when we expected true; the boot-quiet
          // contract (false when header-less + non-system) is still
          // enforced by the no-activity scenarios.
          if (ep.route === '/api/notifications/count' && expectDbTouched && entry.dbTouched === false) {
            // Cache hit — acceptable.
            continue;
          }
          failures.push(`${scenario.name} ${ep.route}: dbTouched=${entry.dbTouched} expected ${expectDbTouched}`);
        }
      }
    }

    if (failures.length) {
      // Surface all failures at once for easy debugging.
      throw new Error(`Boot-quiet matrix failures:\n  - ${failures.join('\n  - ')}`);
    }
  });
});
