#!/usr/bin/env node
/**
 * container-validate.js — CS53 Policy 2 cold-start container validation.
 *
 * Restarts the local MSSQL Docker stack with GWN_SIMULATE_COLD_START_MS=30000
 * so the FIRST mssql-adapter connect after process start sleeps 30s before
 * contacting the database. This makes the local container behave like Azure
 * SQL serverless after auto-pause: the first several inbound /api/* requests
 * exercise the warmup/retry path before succeeding (the exact count depends
 * on the probe interval and Retry-After value).
 *
 * What this script asserts:
 *   1. Container starts and /healthz becomes reachable.
 *   2. Hitting a DB-touching endpoint (/api/scores/leaderboard) during
 *      cold-start yields at least one 503 + Retry-After response (proves
 *      the warmup retry path was exercised, i.e. the lazy init guard fired
 *      and the simulated cold-start sleep was actually applied).
 *   3. Within WARMUP_CAP_MS + 30s + COLD_START_MS the same endpoint responds
 *      200 (proves the recovery path completes and the lazy request-driven
 *      init pattern actually heals without operator intervention). The
 *      COLD_START_MS term accounts for the simulated server-side delay on
 *      top of the SPA-side warmup budget.
 *
 * Exits non-zero on any assertion failure.
 *
 * Usage:
 *   npm run container:validate
 *
 * Override (env vars):
 *   COLD_START_MS=20000               # default 30000
 *   HTTPS_PORT=9443 HTTP_PORT=3002    # only if default 8443/3001 are taken
 *   COMPOSE_PROJECT=gwn-validate-wt1  # default derived from cwd basename + path hash
 *   KEEP_RUNNING=1                    # skip teardown for debugging
 */

'use strict';

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const https = require('https');
const path = require('path');

function parseNonNegativeIntEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a non-negative integer, got: ${raw}`);
  }
  return Number(raw);
}

function validateComposeProjectName(name) {
  // Docker Compose project-name regex: lowercase letters, digits, dashes,
  // underscores; must start with a letter or digit.
  return /^[a-z0-9][a-z0-9_-]*$/.test(name);
}

const ROOT = path.resolve(__dirname, '..');
const COMPOSE_FILE = 'docker-compose.mssql.yml';
const COLD_START_MS = parseNonNegativeIntEnv('COLD_START_MS', 30000);
const HTTPS_PORT = process.env.HTTPS_PORT || '8443';
const HTTP_PORT = process.env.HTTP_PORT || '3001';
// Project name must be unique across worktrees/clones on this host so a
// concurrent `down -v` from one worktree never tears down another's stack.
// Default = "gwn-validate-<sanitized-basename>-<8-char hash of full
// absolute path>". Sanitize basename to satisfy Docker Compose's project
// name rules (lowercase letters, digits, dashes, underscores).
function sanitizeProjectFragment(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9]+$/, '') || 'wt';
}
const ROOT_HASH = crypto.createHash('sha1').update(ROOT.toLowerCase()).digest('hex').slice(0, 8);
const DEFAULT_PROJECT_NAME = `gwn-validate-${sanitizeProjectFragment(path.basename(ROOT))}-${ROOT_HASH}`;
const PROJECT_NAME = process.env.COMPOSE_PROJECT || DEFAULT_PROJECT_NAME;
if (!validateComposeProjectName(PROJECT_NAME)) {
  throw new Error(
    `Invalid COMPOSE_PROJECT '${PROJECT_NAME}': must match /^[a-z0-9][a-z0-9_-]*$/. ` +
    `If you set COMPOSE_PROJECT explicitly, sanitize it; otherwise this is a bug in the default-name generator.`,
  );
}
const BASE_URL = HTTPS_PORT === '443' ? 'https://localhost' : `https://localhost:${HTTPS_PORT}`;
// Mirrors public/js/progressive-loader.js WARMUP_CAP_MS.
const WARMUP_CAP_MS = 30000;
const RECOVERY_BUDGET_MS = WARMUP_CAP_MS + 30000 + COLD_START_MS;

function ts() { return new Date().toISOString(); }
function log(msg) { console.log(`[${ts()}] ${msg}`); }
function logErr(msg) { console.error(`[${ts()}] ✗ ${msg}`); }

function compose(args, opts = {}) {
  const cmd = `docker compose -f ${COMPOSE_FILE} -p ${PROJECT_NAME} ${args}`;
  log(`> ${cmd}`);
  return spawnSync(cmd, {
    cwd: ROOT,
    stdio: opts.silent ? 'pipe' : 'inherit',
    shell: true,
    env: { ...process.env, ...(opts.env || {}) },
  });
}

function teardown() {
  if (process.env.KEEP_RUNNING) {
    log('KEEP_RUNNING=1 — leaving stack up for inspection.');
    return;
  }
  log('Tearing down validation stack…');
  compose('down -v', { silent: true });
}

let tornDown = false;
function safeTeardown(signal) {
  if (tornDown) return;
  tornDown = true;
  log(`Received ${signal} — cleaning up…`);
  teardown();
  process.exit(1);
}
process.on('SIGINT', () => safeTeardown('SIGINT'));
process.on('SIGTERM', () => safeTeardown('SIGTERM'));

function httpsGet(url, { timeoutMs = 5000, headers = {} } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.get(url, { rejectUnauthorized: false, timeout: timeoutMs, headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          elapsedMs: Date.now() - start,
        });
      });
    });
    req.on('error', (err) => resolve({ error: err.message, elapsedMs: Date.now() - start }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout', elapsedMs: Date.now() - start }); });
  });
}

function httpsPostJson(url, body, { timeoutMs = 5000, headers = {} } = {}) {
  const payload = JSON.stringify(body);
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.request(url, {
      method: 'POST',
      rejectUnauthorized: false,
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      },
    }, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: responseBody,
          elapsedMs: Date.now() - start,
        });
      });
    });
    req.on('error', (err) => resolve({ error: err.message, elapsedMs: Date.now() - start }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout', elapsedMs: Date.now() - start }); });
    req.write(payload);
    req.end();
  });
}

async function waitForHealthz(timeoutMs = 180000) {
  const url = new URL('/healthz', BASE_URL).href;
  log(`Waiting for ${url} to respond 200 (up to ${Math.round(timeoutMs / 1000)}s)…`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await httpsGet(url, { timeoutMs: 3000 });
    if (res.status === 200) {
      log(`/healthz OK (${res.elapsedMs}ms)`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function probeColdStart() {
  // Choose an unauthenticated, DB-touching endpoint so we observe the real
  // 503-then-200 transition without auth noise. /api/scores/leaderboard
  // uses optionalAuth and reads from the puzzles/scores tables, so it
  // exercises the pool just like a real user request.
  // CS52-6: `variant` is now a required query param.
  const url = new URL('/api/scores/leaderboard?variant=freeplay', BASE_URL).href;
  log(`Probing ${url} — expecting at least one 503+Retry-After then a 200 within ${Math.round(RECOVERY_BUDGET_MS / 1000)}s.`);

  const start = Date.now();
  let saw503 = false;
  let firstRetryAfter = null;
  let first200ElapsedMs = null;
  let attempts = 0;

  while (Date.now() - start < RECOVERY_BUDGET_MS) {
    attempts++;
    // CS53-19.D: send `X-User-Activity: 1` so the global cold-start init
    // gate (now boot-quiet-aware) actually fires `runInit()` on this probe.
    // Without the header, the gate would return 503+Retry-After forever
    // because nothing user-activity-tagged is hitting the server.
    const res = await httpsGet(url, { timeoutMs: 10000, headers: { 'X-User-Activity': '1' } });
    const elapsed = Date.now() - start;
    if (res.error) {
      log(`  attempt ${attempts} (+${elapsed}ms): network error — ${res.error}`);
    } else {
      const ra = res.headers['retry-after'];
      log(`  attempt ${attempts} (+${elapsed}ms): HTTP ${res.status}${ra ? ` Retry-After=${ra}` : ''}`);
      if (res.status === 503) {
        saw503 = true;
        if (firstRetryAfter === null && ra) firstRetryAfter = ra;
      } else if (res.status === 200) {
        first200ElapsedMs = elapsed;
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  return { saw503, firstRetryAfter, first200ElapsedMs, attempts };
}

// CS53-19.A.2 — boot-quiet mode helpers ------------------------------------
//
// The boot-quiet harness exercises every endpoint enrolled in the boot-quiet
// contract and reports a per-request matrix `{ scenario, route, dbTouched,
// userActivity }`. Source-of-truth for `dbTouched` is the structured Pino
// log line emitted by each handler (see server/services/boot-quiet.js).
//
// Why this is HTTP-driven, not full-Playwright. The boot-quiet contract is
// fundamentally an HTTP contract: "no header → no DB". The six SPA-side
// scenarios in the CS53-19 plan (cold-anonymous-boot, warm-boot-with-jwt,
// refresh, refocus, bfcache, sw-update) all reduce to "the SPA fires these
// API requests under these header conditions". Driving the matrix at the
// HTTP layer reproduces the exact request shape with deterministic timing,
// no flakey browser teardown, and zero browser dependency in
// `npm run container:validate`. The full SPA-driven scenarios live in
// `tests/e2e/boot-quiet.spec.mjs` (Playwright) where the real browser
// behavior under document.visibilitychange / page.goBack() / SW updates
// is exercised end-to-end against the running container.

const fs = require('fs');

function readSystemKey() {
  // Mirror docker-compose.mssql.yml — defaults to 'test-system-api-key' for
  // the local validation stack; override via env if a different stack value
  // is configured.
  return process.env.SYSTEM_API_KEY || 'test-system-api-key';
}

const BOOT_QUIET_ENDPOINTS = [
  // path, requiresAuth (i.e. omits 401 with no token)
  { route: '/api/auth/me', requiresAuth: true },
  { route: '/api/features', requiresAuth: false },
  { route: '/api/notifications', requiresAuth: true },
  { route: '/api/notifications/count', requiresAuth: true },
  { route: '/api/scores/me', requiresAuth: true },
  { route: '/api/achievements', requiresAuth: true },
  { route: '/api/matches/history', requiresAuth: true },
];

// The header-presence/auth-shape matrix the harness sweeps. Each row maps
// onto one or more of the six SPA boot scenarios — boot/refresh/refocus
// without a user gesture all look like "JWT present, no X-User-Activity"
// from the server's perspective. The system-key row exercises the
// operator/system bypass (CS53-23 R4) that the contract explicitly preserves.
const BOOT_QUIET_SCENARIOS = [
  { scenario: 'cold-anonymous-boot', auth: 'none', userActivity: false },
  { scenario: 'warm-boot-with-jwt', auth: 'jwt', userActivity: false },
  { scenario: 'user-gesture', auth: 'jwt', userActivity: true },
  { scenario: 'system-key-bypass', auth: 'system', userActivity: false },
];

async function bootQuietRegisterAndLogin() {
  // Hit /api/auth/register with X-User-Activity: 1 to ensure runInit fires.
  const username = `bq_${Math.random().toString(36).slice(2, 10)}`;
  const password = 'BootQuietPw1!';
  const body = JSON.stringify({ username, password });
  const opts = {
    method: 'POST',
    rejectUnauthorized: false,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'X-User-Activity': '1',
    },
    timeout: 30000,
  };
  return new Promise((resolve) => {
    const req = https.request(new URL('/api/auth/register', BASE_URL).href, opts, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          resolve({ status: res.statusCode, token: parsed.token });
        } catch {
          resolve({ status: res.statusCode, token: null });
        }
      });
    });
    req.on('error', () => resolve({ status: 0, token: null }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, token: null }); });
    req.write(body);
    req.end();
  });
}

async function bootQuietProbe(scenario, route, jwt) {
  const headers = {};
  if (scenario.auth === 'jwt' && jwt) headers['Authorization'] = `Bearer ${jwt}`;
  if (scenario.auth === 'system') headers['X-API-Key'] = readSystemKey();
  if (scenario.userActivity) headers['X-User-Activity'] = '1';
  const url = new URL(route, BASE_URL).href;
  const res = await httpsGet(url, { timeoutMs: 10000, headers });
  return res;
}

function captureContainerLogsSince(sinceISO) {
  const r = spawnSync(
    `docker compose -f ${COMPOSE_FILE} -p ${PROJECT_NAME} logs --since ${sinceISO} --no-color app`,
    { cwd: ROOT, shell: true, env: process.env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  return (r.stdout || '') + (r.stderr || '');
}

function parseBootQuietLogs(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // Pino emits one JSON object per line; pull out the JSON substring.
    const start = line.indexOf('{');
    if (start === -1) continue;
    let parsed;
    try { parsed = JSON.parse(line.slice(start)); } catch { continue; }
    if (parsed && parsed.gate === 'boot-quiet') out.push(parsed);
  }
  return out;
}

async function runBootQuietMode() {
  log('Boot-quiet harness starting (--mode=boot-quiet).');
  log('Tearing down any existing stack…');
  compose('down -v', { silent: true });
  // Boot-quiet harness wants fast iteration — no 30s simulated cold start.
  const env = {
    GWN_SIMULATE_COLD_START_MS: '0',
    HTTPS_PORT,
    HTTP_PORT,
    SYSTEM_API_KEY: readSystemKey(),
  };
  const up = compose('up -d --build', { env });
  if (up.status !== 0) {
    logErr('docker compose up failed.');
    teardown();
    process.exit(1);
  }

  const healthy = await waitForHealthz();
  if (!healthy) {
    logErr('/healthz did not become reachable within timeout.');
    compose('logs --tail=200 app');
    teardown();
    process.exit(1);
  }

  // Need an auth token for the JWT-shaped scenarios. Register a fresh user;
  // this also drives `runInit()` so the rest of the harness gets 200s
  // instead of 503s.
  log('Registering a fresh user for JWT-shaped scenarios…');
  const reg = await bootQuietRegisterAndLogin();
  if (!reg.token) {
    logErr(`Failed to register harness user (status=${reg.status}). Cannot continue.`);
    compose('logs --tail=200 app');
    teardown();
    process.exit(1);
  }
  log('  ok — token acquired.');

  const sinceISO = new Date().toISOString();
  const matrix = [];

  for (const scenario of BOOT_QUIET_SCENARIOS) {
    for (const ep of BOOT_QUIET_ENDPOINTS) {
      // Skip auth=none rows for endpoints that gate on requireAuth — those
      // 401 before reaching the boot-quiet log line, so the matrix row is
      // not a contract violation regardless of dbTouched.
      if (ep.requiresAuth && scenario.auth === 'none') {
        matrix.push({ scenario: scenario.scenario, route: ep.route, status: 401, dbTouched: null, userActivity: scenario.userActivity, skipped: 'requires-auth' });
        continue;
      }
      const probe = await bootQuietProbe(scenario, ep.route, reg.token);
      matrix.push({
        scenario: scenario.scenario,
        route: ep.route,
        status: probe.status,
        userActivity: scenario.userActivity,
        // dbTouched comes from the log line — fill in below after capture.
        dbTouched: null,
      });
    }
  }

  // Allow the server a beat to flush the last log lines.
  await new Promise((r) => setTimeout(r, 1500));
  const logs = captureContainerLogsSince(sinceISO);
  const records = parseBootQuietLogs(logs);
  // Match each matrix row to a record by route + scenario context. We use
  // a per-route FIFO so ordering of duplicates is preserved.
  const queues = new Map();
  for (const rec of records) {
    if (!queues.has(rec.route)) queues.set(rec.route, []);
    queues.get(rec.route).push(rec);
  }
  for (const row of matrix) {
    if (row.skipped) continue;
    const q = queues.get(row.route);
    if (!q || q.length === 0) {
      row.dbTouched = 'MISSING';
      continue;
    }
    const rec = q.shift();
    row.dbTouched = !!rec.dbTouched;
  }

  // Emit the matrix to stdout as a markdown table + a JSON sidecar file.
  const tablePath = path.join(ROOT, 'boot-quiet-matrix.json');
  fs.writeFileSync(tablePath, JSON.stringify(matrix, null, 2), 'utf8');
  log(`Matrix written to ${tablePath}`);

  console.log('\n## Boot-quiet matrix\n');
  console.log('| scenario | route | userActivity | status | dbTouched |');
  console.log('|---|---|---|---|---|');
  for (const r of matrix) {
    const dt = r.skipped ? `_skipped: ${r.skipped}_` : String(r.dbTouched);
    console.log(`| ${r.scenario} | ${r.route} | ${r.userActivity} | ${r.status} | ${dt} |`);
  }
  console.log('');

  // Acceptance: every header-less request (userActivity=false) on a non-system
  // scenario must show dbTouched=false. system-key scenarios (operator
  // bypass) are EXEMPT — they should set dbTouched=true on cache miss.
  const violations = matrix.filter((r) => {
    if (r.skipped) return false;
    if (r.dbTouched === 'MISSING') return true;
    if (r.scenario === 'system-key-bypass') return false;
    if (r.userActivity) return false;
    return r.dbTouched === true;
  });

  teardown();
  if (violations.length === 0) {
    log('✅ Boot-quiet harness PASSED — all header-less requests show dbTouched=false.');
    process.exit(0);
  } else {
    logErr(`Boot-quiet harness FAILED — ${violations.length} violation(s):`);
    for (const v of violations) {
      logErr(`  ${v.scenario} ${v.route}: dbTouched=${v.dbTouched}`);
    }
    process.exit(1);
  }
}

// CS53-10 — DB-unavailable + cold-start-fails simulator harness ------------
//
// Each CS53-10 mode brings up the stack with a different combination of
// GWN_SIMULATE_* env vars then probes a DB-touching endpoint and asserts
// the corresponding 503 path:
//
//   cold-start-fails   GWN_SIMULATE_COLD_START_FAILS=N  → ≥N×503+Retry-After
//                                                         then 200 (transient
//                                                         classifier path).
//   capacity-exhausted GWN_SIMULATE_DB_UNAVAILABLE=     → 503 + body
//                      capacity_exhausted                {unavailable:true,
//                                                        reason:'capacity-
//                                                        exhausted'} AND no
//                                                        Retry-After header.
//                                                        Repeated; never 200.
//   transient          GWN_SIMULATE_DB_UNAVAILABLE=     → every probe gets
//                      transient                         503+Retry-After;
//                                                         never 200.
//
// All probes send `X-User-Activity: 1` so the boot-quiet-aware /api/* gate
// (server/app.js:258-280) actually fires `runInit()`. Without the header
// the gate returns 503+Retry-After regardless of DB state, masking what
// we're trying to assert.
const CS53_10_PROBE_PATH = '/api/scores/leaderboard?variant=freeplay';
const CS53_10_PROBE_BUDGET_MS = 90000; // enough to see ≥3 retries + recovery
const CS53_10_NEVER_RECOVER_PROBES = 6; // mode=*-no-recover sample size
const CS53_10_PROBE_INTERVAL_MS = 2000;

async function probeUntilStatus({ url, statusPredicate, budgetMs, label }) {
  const start = Date.now();
  let attempts = 0;
  let saw503 = false;
  let firstRetryAfter = null;
  let firstSuccessElapsedMs = null;
  let lastBody = null;
  let lastHeaders = null;
  while (Date.now() - start < budgetMs) {
    attempts++;
    const res = await httpsGet(url, { timeoutMs: 10000, headers: { 'X-User-Activity': '1' } });
    const elapsed = Date.now() - start;
    if (res.error) {
      log(`  ${label} attempt ${attempts} (+${elapsed}ms): network error — ${res.error}`);
    } else {
      const ra = res.headers['retry-after'];
      log(`  ${label} attempt ${attempts} (+${elapsed}ms): HTTP ${res.status}${ra ? ` Retry-After=${ra}` : ''}`);
      if (res.status === 503) {
        saw503 = true;
        if (firstRetryAfter === null && ra) firstRetryAfter = ra;
      }
      lastBody = res.body;
      lastHeaders = res.headers;
      if (statusPredicate(res)) {
        firstSuccessElapsedMs = elapsed;
        break;
      }
    }
    await new Promise((r) => setTimeout(r, CS53_10_PROBE_INTERVAL_MS));
  }
  return { attempts, saw503, firstRetryAfter, firstSuccessElapsedMs, lastBody, lastHeaders };
}

async function validateCs47TelemetryLog() {
  const payload = {
    event: 'progressiveLoader.warmupExhausted',
    screen: 'leaderboard',
    outcome: 'cap-exhausted',
    attempts: CS53_10_NEVER_RECOVER_PROBES,
    totalWaitMs: CS53_10_NEVER_RECOVER_PROBES * CS53_10_PROBE_INTERVAL_MS,
  };
  const url = new URL('/api/telemetry/ux-events', BASE_URL).href;
  log(`Posting CS47 telemetry probe to ${url} — expect 204 and a Pino warn with environment=local-container.`);
  const res = await httpsPostJson(url, payload, { timeoutMs: 10000 });
  if (res.error || res.status !== 204) {
    logErr(`FAIL: CS47 telemetry probe expected 204, got ${res.error || res.status}.`);
    return false;
  }

  const logs = compose('logs --tail=200 app', { silent: true });
  const text = `${logs.stdout || ''}${logs.stderr || ''}`;
  const line = text.split(/\r?\n/).find((entry) => (
    entry.includes('progressiveLoader.warmupExhausted')
      && entry.includes('environment')
      && entry.includes('local-container')
  ));
  if (!line) {
    logErr('FAIL: CS47 telemetry Pino warn was not found in app container logs.');
    return false;
  }

  log(`CS47 telemetry log excerpt: ${line.slice(0, 500)}`);
  return true;
}

async function probeNeverRecover({ url, label, count }) {
  const responses = [];
  for (let i = 0; i < count; i++) {
    const res = await httpsGet(url, { timeoutMs: 10000, headers: { 'X-User-Activity': '1' } });
    if (res.error) {
      log(`  ${label} probe ${i + 1}/${count}: network error — ${res.error}`);
      responses.push({ status: null, headers: {}, body: '', error: res.error });
    } else {
      const ra = res.headers['retry-after'];
      log(`  ${label} probe ${i + 1}/${count}: HTTP ${res.status}${ra ? ` Retry-After=${ra}` : ''}`);
      responses.push({ status: res.status, headers: res.headers, body: res.body });
    }
    await new Promise((r) => setTimeout(r, CS53_10_PROBE_INTERVAL_MS));
  }
  return responses;
}

async function runCs53_10Mode(mode) {
  log(`CS53-10 simulator validation — mode=${mode} project=${PROJECT_NAME}`);

  // Step 1: tear down any existing stack.
  log('Stopping any existing validation stack…');
  compose('down -v', { silent: true });

  // Step 2: bring up the stack with the right env-var combination.
  // No cold-start delay (the CS53-10 sims own the connect-time behavior).
  // The arming gate `GWN_ENABLE_DB_CONNECT_SIMULATORS=1` is REQUIRED here
  // — without it the SIMULATE_* vars are inert (audit-only). This is the
  // belt-and-suspenders that prevents an accidentally-leaked SIMULATE_*
  // env in a real deploy from converting the live DB into a fake-failure
  // surface (GPT-5.4 PR #301 review).
  const env = {
    GWN_ENABLE_DB_CONNECT_SIMULATORS: '1',
    GWN_SIMULATE_COLD_START_MS: '',
    GWN_SIMULATE_COLD_START_FAILS: '',
    GWN_SIMULATE_DB_UNAVAILABLE: '',
    HTTPS_PORT,
    HTTP_PORT,
    GWN_ENV: 'local-container',
  };
  if (mode === 'cold-start-fails') {
    env.GWN_SIMULATE_COLD_START_FAILS = '3';
  } else if (mode === 'capacity-exhausted') {
    env.GWN_SIMULATE_DB_UNAVAILABLE = 'capacity_exhausted';
  } else if (mode === 'transient') {
    env.GWN_SIMULATE_DB_UNAVAILABLE = 'transient';
  }
  const up = compose('up -d --build', { env });
  if (up.status !== 0) {
    logErr('docker compose up failed.');
    teardown();
    process.exit(1);
  }

  // Step 3: wait for /healthz (no DB touch — should be reachable regardless).
  const healthy = await waitForHealthz();
  if (!healthy) {
    logErr('/healthz did not become reachable within timeout.');
    compose('logs --tail=200 app');
    teardown();
    process.exit(1);
  }

  const url = new URL(CS53_10_PROBE_PATH, BASE_URL).href;
  let ok = true;

  if (mode === 'cold-start-fails') {
    log(`Probing ${url} — expect ≥3× 503+Retry-After then 200 within ${Math.round(CS53_10_PROBE_BUDGET_MS / 1000)}s.`);
    const result = await probeUntilStatus({
      url,
      statusPredicate: (r) => r.status === 200,
      budgetMs: CS53_10_PROBE_BUDGET_MS,
      label: 'cold-start-fails',
    });
    log(`Result: attempts=${result.attempts} saw503=${result.saw503} firstRetryAfter=${result.firstRetryAfter} first200ElapsedMs=${result.firstSuccessElapsedMs}`);
    if (!result.saw503) { logErr('FAIL: never observed a 503 — sim did not fire.'); ok = false; }
    if (result.firstRetryAfter == null && result.saw503) {
      logErr('FAIL: 503 response did not include Retry-After header (transient classifier broken?).');
      ok = false;
    }
    if (result.firstSuccessElapsedMs == null) {
      logErr('FAIL: never recovered to 200 — sim did not stop at limit (or warmup loop is broken).');
      ok = false;
    }
  } else if (mode === 'capacity-exhausted') {
    log(`Probing ${url} — first wait for the capacity-exhausted 503 shape (init must run + classify), then assert ${CS53_10_NEVER_RECOVER_PROBES} consecutive probes all return that shape with no Retry-After.`);
    // Phase A: wait until the gate flips to the capacity-exhausted body
    // (runInit must complete its first attempt and set dbUnavailability).
    const phaseA = await probeUntilStatus({
      url,
      statusPredicate: (r) => {
        if (r.status !== 503) return false;
        try {
          const b = JSON.parse(r.body);
          return b && b.unavailable === true && b.reason === 'capacity-exhausted';
        } catch { return false; }
      },
      budgetMs: CS53_10_PROBE_BUDGET_MS,
      label: 'capacity-exhausted/phase-A',
    });
    if (phaseA.firstSuccessElapsedMs == null) {
      logErr('FAIL: never observed the capacity-exhausted response shape — sim did not classify correctly.');
      ok = false;
    } else if (phaseA.lastHeaders && phaseA.lastHeaders['retry-after']) {
      logErr(`FAIL: capacity-exhausted 503 must NOT include Retry-After (got '${phaseA.lastHeaders['retry-after']}').`);
      ok = false;
    }
    // Phase B: now that the gate is in capacity-exhausted state, every
    // probe must match the same shape (until the 30s backoff window
    // expires and a real request can re-trigger init — we deliberately
    // run fewer than 6×2s=12s probes so we stay inside that window).
    if (ok) {
      const phaseB = await probeNeverRecover({ url, label: 'capacity-exhausted/phase-B', count: CS53_10_NEVER_RECOVER_PROBES });
      for (const r of phaseB) {
        if (r.status !== 503) {
          logErr(`FAIL: phase-B expected 503, got ${r.status}.`);
          ok = false;
          continue;
        }
        if (r.headers['retry-after']) {
          logErr(`FAIL: phase-B 503 must NOT include Retry-After (got '${r.headers['retry-after']}').`);
          ok = false;
        }
        let body = null;
        try { body = JSON.parse(r.body); } catch { /* fall through */ }
        if (!body || body.unavailable !== true || body.reason !== 'capacity-exhausted') {
          logErr(`FAIL: phase-B body shape mismatch — got: ${r.body && r.body.slice(0, 200)}`);
          ok = false;
        }
      }
    }
  } else if (mode === 'transient') {
    log(`Probing ${url} ${CS53_10_NEVER_RECOVER_PROBES}× — expect 503+Retry-After on every probe (transient classifier; never recovers because sim throws on every connect).`);
    const responses = await probeNeverRecover({ url, label: 'transient', count: CS53_10_NEVER_RECOVER_PROBES });
    for (const r of responses) {
      if (r.status !== 503) {
        logErr(`FAIL: expected 503 on every probe, got ${r.status}.`);
        ok = false;
      } else if (!r.headers['retry-after']) {
        logErr('FAIL: transient 503 must include Retry-After header.');
        ok = false;
      }
    }
    if (ok) {
      ok = await validateCs47TelemetryLog();
    }
  }

  if (!ok) {
    log('Dumping last 200 lines of app logs for diagnosis:');
    compose('logs --tail=200 app');
  }

  teardown();
  if (ok) {
    log(`✅ CS53-10 mode=${mode} validation PASSED.`);
    process.exit(0);
  } else {
    logErr(`CS53-10 mode=${mode} validation FAILED.`);
    process.exit(1);
  }
}

async function main() {
  // CS53-19.A.2 — `--mode=boot-quiet` runs the per-endpoint contract matrix
  // instead of the cold-start probe. The two modes are independent: the
  // existing `--mode=default` cold-start cycle stays the gate for CS53
  // policy 2; the new mode is the gate for CS53-19 boot-quiet enrollment.
  // CS53-10 — `--mode={cold-start-fails,capacity-exhausted,transient}` use
  // the GWN_SIMULATE_* env vars to exercise the slow-retry init loop and
  // the central error handler's two 503 paths against a real container.
  const SUPPORTED_MODES = new Set([
    'default', 'boot-quiet', 'cold-start-fails', 'capacity-exhausted', 'transient',
  ]);
  const modeArg = process.argv.find((a) => a.startsWith('--mode='));
  const mode = modeArg
    ? modeArg.slice('--mode='.length)
    : (process.env.npm_config_mode || 'default');
  if (!SUPPORTED_MODES.has(mode)) {
    logErr(`Unknown --mode=${mode} (supported: ${Array.from(SUPPORTED_MODES).join(', ')}).`);
    process.exit(2);
  }
  if (mode === 'boot-quiet') {
    await runBootQuietMode();
    return;
  }
  if (mode === 'cold-start-fails' || mode === 'capacity-exhausted' || mode === 'transient') {
    await runCs53_10Mode(mode);
    return;
  }

  log(`CS53 cold-start container validation — project=${PROJECT_NAME}`);
  log(`COLD_START_MS=${COLD_START_MS} HTTPS_PORT=${HTTPS_PORT} HTTP_PORT=${HTTP_PORT}`);

  // Step 1: tear down any existing instance with the same project name.
  log('Stopping any existing validation stack…');
  compose('down -v', { silent: true });
  // Best-effort: also tear down any stack from the legacy default project
  // name (pre-hash) when the caller did not set COMPOSE_PROJECT explicitly.
  // This prevents an old stack on the same fixed ports from blocking the
  // fresh `up` after upgrading to the hashed default name.
  if (!process.env.COMPOSE_PROJECT) {
    const legacyProject = sanitizeProjectFragment(`gwn-validate-${path.basename(ROOT)}`);
    if (legacyProject !== PROJECT_NAME) {
      log(`Also tearing down legacy project name ${legacyProject} (best-effort)…`);
      spawnSync(`docker compose -f ${COMPOSE_FILE} -p ${legacyProject} down -v`, {
        cwd: ROOT, stdio: 'pipe', shell: true, env: process.env,
      });
    }
  }

  // Step 2: bring up fresh stack with cold-start sim enabled.
  const env = {
    GWN_SIMULATE_COLD_START_MS: String(COLD_START_MS),
    HTTPS_PORT,
    HTTP_PORT,
    GWN_ENV: 'local-container',
  };
  const up = compose('up -d --build', { env });
  if (up.status !== 0) {
    logErr('docker compose up failed.');
    teardown();
    process.exit(1);
  }

  // Step 3: wait for /healthz (which does NOT touch the DB).
  const healthy = await waitForHealthz();
  if (!healthy) {
    logErr('/healthz did not become reachable within timeout.');
    compose('logs --tail=200 app');
    teardown();
    process.exit(1);
  }

  // Step 4: probe a DB-touching endpoint and assert cold-start path was
  // exercised AND recovery happened.
  const result = await probeColdStart();
  log(`Result: attempts=${result.attempts} saw503=${result.saw503} firstRetryAfter=${result.firstRetryAfter} first200ElapsedMs=${result.first200ElapsedMs}`);

  let ok = true;
  if (!result.saw503) {
    logErr('FAIL: never observed a 503 — cold-start warmup path was NOT exercised.');
    ok = false;
  }
  if (result.first200ElapsedMs == null) {
    logErr(`FAIL: never observed a 200 within ${Math.round(RECOVERY_BUDGET_MS / 1000)}s — recovery did not complete.`);
    ok = false;
  }
  if (ok && result.firstRetryAfter == null) {
    logErr('FAIL: 503 response did not include a Retry-After header.');
    ok = false;
  }

  if (!ok) {
    log('Dumping last 200 lines of app logs for diagnosis:');
    compose('logs --tail=200 app');
  }

  teardown();
  if (ok) {
    log('✅ Container validation PASSED.');
    process.exit(0);
  } else {
    logErr('Container validation FAILED.');
    process.exit(1);
  }
}

main().catch((err) => {
  logErr(`Unhandled error: ${err.stack || err.message}`);
  teardown();
  process.exit(1);
});
