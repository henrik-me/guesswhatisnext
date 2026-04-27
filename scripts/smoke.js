#!/usr/bin/env node
/**
 * scripts/smoke.js — CS41-1 + CS41-2 deployed-revision smoke flow.
 *
 * Exercises the just-deployed Container App revision via its DIRECT FQDN
 * (NOT the public ingress hostname) so the new revision is validated in
 * isolation BEFORE the deploy workflow shifts traffic to it. The flow
 * mirrors a real user session against a brand-new container:
 *
 *   (a) /healthz               — gate-bypassed liveness ping (warms the
 *                                 process without touching the DB).
 *   (b) /api/features           — DB-touching, cold-start tolerant; accepts
 *                                 503 + Retry-After up to
 *                                 WARMUP_CAP_MS + 30s + COLD_START_MS
 *                                 per server/app.js:254-283 +
 *                                 scripts/container-validate.js:85-87.
 *   (c) POST /api/auth/login   — login as the operator-provisioned
 *                                 `gwn-smoke-bot` user (created by
 *                                 scripts/setup-smoke-user.js, prefix
 *                                 reserved by server/reserved-usernames.js).
 *   (d) POST /api/scores       — submit a sentinel score; server returns
 *                                 `{ id }` which the next step asserts on.
 *   (e) GET  /api/scores/me    — assert the submitted id is in the user's
 *                                 own scores list (deterministic; avoids
 *                                 flaky leaderboard ordering).
 *   (f) GET  /api/health       — assert checks.database.status === 'ok'.
 *                                 Requires SYSTEM_API_KEY; if absent the
 *                                 step is logged as skipped with a warning
 *                                 (deploy continues — /api/scores/me
 *                                 succeeding already proved DB writeability).
 *
 * CS41-2 perf baselines: every per-request elapsed time is captured. A
 * single request > PERF_WARN_MS (default 2000) emits a workflow warning;
 * a single request > the cold-start budget is a hard failure. All step
 * timings are written to SMOKE_RESULTS_PATH (default smoke-results.json)
 * for CS41-8's render-deploy-summary.js to consume.
 *
 * Usage (CLI):
 *
 *   SMOKE_USER_PASSWORD=<pw> node scripts/smoke.js <target-fqdn>
 *
 * Optional env:
 *   SYSTEM_API_KEY        — enables step (f) /api/health DB check.
 *   WARMUP_CAP_MS         — default 30000 (mirrors container-validate.js).
 *   COLD_START_MS         — default 30000.
 *   PERF_WARN_MS          — default 2000.
 *   SMOKE_RESULTS_PATH    — default ./smoke-results.json
 *   SMOKE_PROBE_INTERVAL_MS — default 2000 (poll interval for steps a/b).
 *   SMOKE_REQUEST_TIMEOUT_MS — default 35000 (per-request fetch timeout).
 *   SMOKE_INSECURE        — '1' to skip TLS cert validation (dev only).
 *
 * Exit codes:
 *   0 — all steps passed (per-request perf may have warnings)
 *   1 — at least one step failed
 *   2 — bad invocation (missing args/env)
 */

'use strict';

const fs = require('node:fs');
const https = require('node:https');
const http = require('node:http');
const crypto = require('node:crypto');

const DEFAULTS = {
  WARMUP_CAP_MS: 30000,
  COLD_START_MS: 30000,
  PERF_WARN_MS: 2000,
  PROBE_INTERVAL_MS: 2000,
  REQUEST_TIMEOUT_MS: 35000,
  RESULTS_PATH: 'smoke-results.json',
  HEALTHZ_TIMEOUT_MS: 180000,
};

function nowMs() { return Date.now(); }

function parseIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a non-negative integer, got: ${raw}`);
  }
  return Number(raw);
}

/**
 * Performs a single HTTPS request and returns
 * `{ status, headers, body, elapsedMs, error? }`. Never throws.
 *
 * Exposed for unit tests so the poll-loop can be exercised against a
 * deterministic fake. Tests pass `{ fetcher }` into runSmoke().
 */
function defaultFetcher(method, url, { headers = {}, body = null, timeoutMs, insecure } = {}) {
  return new Promise((resolve) => {
    const start = nowMs();
    let parsed;
    try { parsed = new URL(url); } catch (err) {
      return resolve({ error: `bad URL: ${err.message}`, elapsedMs: 0 });
    }
    const lib = parsed.protocol === 'http:' ? http : https;
    const reqOpts = {
      method,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
      path: parsed.pathname + parsed.search,
      headers: { ...headers },
      timeout: timeoutMs,
    };
    if (parsed.protocol === 'https:') reqOpts.rejectUnauthorized = !insecure;
    if (body != null) {
      reqOpts.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = lib.request(reqOpts, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: buf,
          elapsedMs: nowMs() - start,
        });
      });
    });
    req.on('error', (err) => resolve({ error: err.message, elapsedMs: nowMs() - start }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'timeout', elapsedMs: nowMs() - start });
    });
    if (body != null) req.write(body);
    req.end();
  });
}

/**
 * Polls `url` with GET until either a 200 is received or `budgetMs` elapses.
 *
 * For CS41-1 step (b): a 503 response carrying a Retry-After header is
 * treated as cold-start and retried (matches server/app.js:283 behavior).
 * A 503 WITHOUT Retry-After is intentional unavailability — that's NOT a
 * smoke failure for /healthz/features but the caller decides what to do
 * with it via the returned final response.
 *
 * @returns {Promise<{ ok: boolean, attempts: number, elapsedMs: number,
 *                     finalStatus: number|null, lastResponse: object,
 *                     timeline: Array }>}
 */
async function pollUntil200({
  url,
  budgetMs,
  intervalMs,
  fetcher,
  requestTimeoutMs,
  insecure,
  acceptStatus = (s) => s === 200,
}) {
  const start = nowMs();
  const timeline = [];
  let attempts = 0;
  let last = null;
  while (nowMs() - start < budgetMs) {
    attempts++;
    const res = await fetcher('GET', url, { timeoutMs: requestTimeoutMs, insecure });
    last = res;
    timeline.push({
      attempt: attempts,
      sinceStartMs: nowMs() - start,
      status: res.status ?? null,
      retryAfter: res.headers ? res.headers['retry-after'] ?? null : null,
      error: res.error ?? null,
      elapsedMs: res.elapsedMs,
    });
    if (res.status != null && acceptStatus(res.status)) {
      return { ok: true, attempts, elapsedMs: nowMs() - start, finalStatus: res.status, lastResponse: res, timeline };
    }
    // Stop early on non-retryable status (4xx that isn't 503).
    if (res.status != null && res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      return { ok: false, attempts, elapsedMs: nowMs() - start, finalStatus: res.status, lastResponse: res, timeline };
    }
    // Wait then retry. For 503+Retry-After honor a small ceiling (cap at 5s).
    let wait = intervalMs;
    if (res.status === 503 && res.headers && res.headers['retry-after']) {
      const ra = Number(res.headers['retry-after']);
      if (Number.isFinite(ra) && ra > 0) wait = Math.min(ra * 1000, 5000);
    }
    await new Promise((r) => setTimeout(r, wait));
  }
  return { ok: false, attempts, elapsedMs: nowMs() - start, finalStatus: last?.status ?? null, lastResponse: last, timeline };
}

function jsonParse(body) {
  try { return JSON.parse(body); } catch { return null; }
}

function annotate(level, msg) {
  // GitHub Actions workflow command. Falls through to plain log when run
  // outside CI (Actions only renders ::warning/::error from CI runners).
  console.log(`::${level}::${msg}`);
}

function info(msg) { console.log(`[smoke] ${msg}`); }
function fail(step, msg) { annotate('error', `smoke step ${step}: ${msg}`); }

/**
 * Generates a sentinel score that won't collide across concurrent / repeat
 * smoke runs. `$RANDOM` (0–32767) was rejected by rubber-duck review; we
 * use crypto.randomInt over a much wider range. The server identifies the
 * submission by the returned `id`, so uniqueness here is defensive only.
 */
function sentinelScore() {
  // Range chosen so it stays a small integer the API trivially accepts.
  return crypto.randomInt(1, 1_000_000_000);
}

/**
 * Executes the full smoke flow against `targetFqdn`. Returns a structured
 * result object suitable for JSON serialization (consumed by
 * render-deploy-summary.js). Never throws — failures show up as
 * `result.passed === false` plus per-step `status: 'fail'`.
 */
async function runSmoke({ targetFqdn, password, systemApiKey, opts = {}, fetcher = defaultFetcher } = {}) {
  const cfg = {
    warmupCapMs: opts.warmupCapMs ?? parseIntEnv('WARMUP_CAP_MS', DEFAULTS.WARMUP_CAP_MS),
    coldStartMs: opts.coldStartMs ?? parseIntEnv('COLD_START_MS', DEFAULTS.COLD_START_MS),
    perfWarnMs: opts.perfWarnMs ?? parseIntEnv('PERF_WARN_MS', DEFAULTS.PERF_WARN_MS),
    probeIntervalMs: opts.probeIntervalMs ?? parseIntEnv('SMOKE_PROBE_INTERVAL_MS', DEFAULTS.PROBE_INTERVAL_MS),
    requestTimeoutMs: opts.requestTimeoutMs ?? parseIntEnv('SMOKE_REQUEST_TIMEOUT_MS', DEFAULTS.REQUEST_TIMEOUT_MS),
    healthzTimeoutMs: opts.healthzTimeoutMs ?? DEFAULTS.HEALTHZ_TIMEOUT_MS,
    insecure: opts.insecure ?? (process.env.SMOKE_INSECURE === '1'),
  };
  const coldStartBudgetMs = cfg.warmupCapMs + 30000 + cfg.coldStartMs;
  const perfFailMs = coldStartBudgetMs;

  // Normalize FQDN: strip protocol, trailing slash.
  const fqdn = String(targetFqdn).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const base = `https://${fqdn}`;
  info(`target=${base}`);
  info(`budgets: warmupCapMs=${cfg.warmupCapMs} coldStartMs=${cfg.coldStartMs} coldStartBudgetMs=${coldStartBudgetMs} perfWarnMs=${cfg.perfWarnMs}`);

  const results = {
    target: fqdn,
    startedAt: new Date().toISOString(),
    config: { ...cfg, coldStartBudgetMs },
    steps: [],
    perfWarnings: [],
    passed: false,
  };

  // Captures a step result + applies CS41-2 per-request perf gates.
  // `extra` is spread FIRST so the step's outcome (status) and metadata
  // (step, elapsedMs) cannot be accidentally clobbered by an HTTP-level
  // field like `status: 200` in the extras.
  function recordStep(step, status, elapsedMs, extra = {}) {
    const entry = { ...extra, step, status, elapsedMs };
    results.steps.push(entry);
    if (status === 'pass' && elapsedMs > cfg.perfWarnMs) {
      const warning = `${step} took ${elapsedMs}ms (> ${cfg.perfWarnMs}ms warn threshold)`;
      results.perfWarnings.push({ step, elapsedMs, threshold: cfg.perfWarnMs });
      annotate('warning', `smoke perf: ${warning}`);
    }
    if (status === 'pass' && elapsedMs > perfFailMs) {
      // Soft per-step gate: outside the cold-start budget any single
      // request that took longer than the budget is treated as a failure
      // even if the response was 200.
      entry.status = 'fail';
      entry.error = `elapsed ${elapsedMs}ms exceeded perfFailMs ${perfFailMs}`;
      fail(step, entry.error);
    }
    return entry;
  }

  // --- Step (a): /healthz ---------------------------------------------------
  {
    const url = `${base}/healthz`;
    const started = nowMs();
    const r = await pollUntil200({
      url, budgetMs: cfg.healthzTimeoutMs, intervalMs: cfg.probeIntervalMs,
      fetcher, requestTimeoutMs: cfg.requestTimeoutMs, insecure: cfg.insecure,
    });
    const totalMs = nowMs() - started;
    if (r.ok) {
      info(`/healthz ok in ${totalMs}ms (attempts=${r.attempts})`);
      recordStep('healthz', 'pass', totalMs, { attempts: r.attempts, httpStatus: r.finalStatus });
    } else {
      fail('healthz', `did not reach 200 within ${cfg.healthzTimeoutMs}ms (last status=${r.finalStatus}, attempts=${r.attempts})`);
      results.steps.push({ step: 'healthz', status: 'fail', elapsedMs: totalMs, attempts: r.attempts, lastStatus: r.finalStatus });
      results.finishedAt = new Date().toISOString();
      return results;
    }
  }

  // --- Step (b): cold-start tolerant /api/features --------------------------
  {
    const url = `${base}/api/features`;
    const started = nowMs();
    const r = await pollUntil200({
      url, budgetMs: coldStartBudgetMs, intervalMs: cfg.probeIntervalMs,
      fetcher, requestTimeoutMs: cfg.requestTimeoutMs, insecure: cfg.insecure,
    });
    const totalMs = nowMs() - started;
    if (r.ok) {
      // Validate body shape: a NEW failure mode the rubber-duck flagged is
      // "200 but malformed". Defend against it.
      const parsed = jsonParse(r.lastResponse?.body);
      if (!parsed || typeof parsed !== 'object' || !parsed.features || typeof parsed.features !== 'object') {
        fail('features', `200 but body missing { features: object } — got: ${String(r.lastResponse?.body).slice(0, 200)}`);
        results.steps.push({ step: 'features', status: 'fail', elapsedMs: totalMs, error: 'malformed body', attempts: r.attempts });
        results.finishedAt = new Date().toISOString();
        return results;
      }
      info(`/api/features ok in ${totalMs}ms (attempts=${r.attempts}, ${Object.keys(parsed.features).length} flags)`);
      recordStep('features', 'pass', totalMs, { attempts: r.attempts, httpStatus: r.finalStatus, featureCount: Object.keys(parsed.features).length });
    } else {
      fail('features', `did not reach 200 within ${coldStartBudgetMs}ms (last status=${r.finalStatus}, attempts=${r.attempts})`);
      results.steps.push({ step: 'features', status: 'fail', elapsedMs: totalMs, attempts: r.attempts, lastStatus: r.finalStatus });
      results.finishedAt = new Date().toISOString();
      return results;
    }
  }

  // --- Step (c): login ------------------------------------------------------
  let token = null;
  {
    const url = `${base}/api/auth/login`;
    const body = JSON.stringify({ username: 'gwn-smoke-bot', password });
    const started = nowMs();
    const res = await fetcher('POST', url, {
      headers: { 'Content-Type': 'application/json' },
      body, timeoutMs: cfg.requestTimeoutMs, insecure: cfg.insecure,
    });
    const elapsed = nowMs() - started;
    const parsed = jsonParse(res.body);
    if (res.status === 200 && parsed && typeof parsed.token === 'string' && parsed.token) {
      token = parsed.token;
      info(`login ok in ${elapsed}ms`);
      recordStep('login', 'pass', elapsed, { httpStatus: 200 });
    } else {
      fail('login', `expected 200+token; got status=${res.status} error=${res.error || ''} body=${String(res.body).slice(0, 200)}`);
      results.steps.push({ step: 'login', status: 'fail', elapsedMs: elapsed, lastStatus: res.status, error: res.error || 'no token' });
      results.finishedAt = new Date().toISOString();
      return results;
    }
  }

  // --- Step (d): POST /api/scores ------------------------------------------
  let submittedId = null;
  let sentinel = null;
  {
    const url = `${base}/api/scores`;
    sentinel = sentinelScore();
    const body = JSON.stringify({ score: sentinel, mode: 'freeplay' });
    const started = nowMs();
    const res = await fetcher('POST', url, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body, timeoutMs: cfg.requestTimeoutMs, insecure: cfg.insecure,
    });
    const elapsed = nowMs() - started;
    const parsed = jsonParse(res.body);
    if (res.status === 201 && parsed && parsed.id != null) {
      submittedId = parsed.id;
      info(`POST /api/scores ok in ${elapsed}ms id=${submittedId} score=${sentinel}`);
      recordStep('submit-score', 'pass', elapsed, { httpStatus: 201, id: submittedId, score: sentinel });
    } else {
      fail('submit-score', `expected 201+id; got status=${res.status} body=${String(res.body).slice(0, 200)}`);
      results.steps.push({ step: 'submit-score', status: 'fail', elapsedMs: elapsed, lastStatus: res.status, error: res.error || 'no id' });
      results.finishedAt = new Date().toISOString();
      return results;
    }
  }

  // --- Step (e): GET /api/scores/me + assertion ----------------------------
  // Sends X-User-Activity: 1 because CS53-19's boot-quiet contract returns an
  // empty payload to header-less non-system traffic on enrolled endpoints
  // (server/routes/scores.js:316-326). The smoke is simulated user activity
  // so the header is correct.
  {
    const url = `${base}/api/scores/me`;
    const started = nowMs();
    const res = await fetcher('GET', url, {
      headers: { Authorization: `Bearer ${token}`, 'X-User-Activity': '1' },
      timeoutMs: cfg.requestTimeoutMs, insecure: cfg.insecure,
    });
    const elapsed = nowMs() - started;
    const parsed = jsonParse(res.body);
    // /api/scores/me returns { scores, stats } per server/routes/scores.js:232
    const scores = Array.isArray(parsed?.scores) ? parsed.scores : null;
    if (res.status === 200 && scores && scores.some((s) => String(s.id) === String(submittedId))) {
      info(`/api/scores/me contains id=${submittedId} (in ${elapsed}ms)`);
      recordStep('me-scores', 'pass', elapsed, { httpStatus: 200, scoreCount: scores.length });
    } else {
      const idsPresent = scores ? scores.map((s) => s.id).slice(0, 10) : null;
      fail('me-scores', `submitted id=${submittedId} not in /api/scores/me; status=${res.status} sample-ids=${JSON.stringify(idsPresent)}`);
      results.steps.push({ step: 'me-scores', status: 'fail', elapsedMs: elapsed, lastStatus: res.status, error: 'sentinel not present' });
      results.finishedAt = new Date().toISOString();
      return results;
    }
  }

  // --- Step (f): /api/health DB status (requires SYSTEM_API_KEY) -----------
  {
    if (!systemApiKey) {
      info('/api/health step skipped (no SYSTEM_API_KEY) — /api/scores/me already proved DB writeability');
      annotate('warning', 'smoke step health: skipped (SYSTEM_API_KEY not provided)');
      results.steps.push({ step: 'health', status: 'skip', reason: 'no SYSTEM_API_KEY' });
    } else {
      const url = `${base}/api/health`;
      const started = nowMs();
      const res = await fetcher('GET', url, {
        headers: { 'X-API-Key': systemApiKey },
        timeoutMs: cfg.requestTimeoutMs, insecure: cfg.insecure,
      });
      const elapsed = nowMs() - started;
      const parsed = jsonParse(res.body);
      const dbStatus = parsed?.checks?.database?.status ?? null;
      if (res.status === 200 && dbStatus === 'ok') {
        info(`/api/health DB ok in ${elapsed}ms`);
        recordStep('health', 'pass', elapsed, { httpStatus: 200, dbStatus });
      } else {
        fail('health', `expected 200 + checks.database.status='ok'; got status=${res.status} dbStatus=${dbStatus}`);
        results.steps.push({ step: 'health', status: 'fail', elapsedMs: elapsed, lastStatus: res.status, error: `dbStatus=${dbStatus}` });
        results.finishedAt = new Date().toISOString();
        return results;
      }
    }
  }

  results.finishedAt = new Date().toISOString();
  results.passed = results.steps.every((s) => s.status === 'pass' || s.status === 'skip');
  if (results.passed) info(`✅ smoke passed against ${fqdn}`);
  return results;
}

async function main() {
  const targetFqdn = process.argv[2];
  if (!targetFqdn) {
    console.error('Usage: smoke.js <target-fqdn>  (env: SMOKE_USER_PASSWORD required)');
    process.exit(2);
  }
  const password = process.env.SMOKE_USER_PASSWORD;
  if (!password) {
    console.error('SMOKE_USER_PASSWORD env var is required');
    process.exit(2);
  }
  // Mask the bearer token + password from any accidental log echoes.
  console.log(`::add-mask::${password}`);
  const systemApiKey = process.env.SYSTEM_API_KEY || '';
  if (systemApiKey) console.log(`::add-mask::${systemApiKey}`);

  let results;
  try {
    results = await runSmoke({ targetFqdn, password, systemApiKey });
  } catch (err) {
    console.error('smoke runner crashed:', err && err.stack ? err.stack : err);
    process.exit(1);
  }

  const outPath = process.env.SMOKE_RESULTS_PATH || DEFAULTS.RESULTS_PATH;
  try {
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    info(`results written to ${outPath}`);
  } catch (err) {
    console.error(`failed to write ${outPath}:`, err.message);
  }

  process.exit(results.passed ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  runSmoke,
  pollUntil200,
  defaultFetcher,
  sentinelScore,
  parseIntEnv,
  DEFAULTS,
};
