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

function httpsGet(url, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.get(url, { rejectUnauthorized: false, timeout: timeoutMs }, (res) => {
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
    const res = await httpsGet(url, { timeoutMs: 10000 });
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

async function main() {
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
