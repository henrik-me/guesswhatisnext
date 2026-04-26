#!/usr/bin/env node
/**
 * scripts/verify-ai.js — CS41-3 post-deploy AI telemetry verification.
 *
 * Runs AFTER scripts/smoke.js succeeds. Confirms that App Insights ingested
 * the smoke probes' `requests` rows under the new Container App revision's
 * `cloud_RoleInstance`. The check is **warning-only**: ingest delay does
 * NOT roll back a deploy. Only a broken AI access path (CLI/auth/network
 * error) is treated as a deploy failure — and even then this step runs with
 * `continue-on-error: true` in the workflow so it can never block.
 *
 * Failure-mode taxonomy (rubber-duck reviewed):
 *
 *   ┌───────────────────────────────┬──────────────┬──────────────┐
 *   │ Outcome                       │ JSON.warning │ exit code    │
 *   ├───────────────────────────────┼──────────────┼──────────────┤
 *   │ rows_total ≥ expected         │ false        │ 0            │
 *   │ rows_total < expected after   │ true         │ 0            │
 *   │ full retry budget             │              │              │
 *   │ az CLI exits non-zero / no    │ false        │ 2            │
 *   │ parseable JSON  (broken)      │              │              │
 *   └───────────────────────────────┴──────────────┴──────────────┘
 *
 * Distinguishing "ingest not yet" from "broken" requires that the QUERY
 * MECHANISM succeeded. We treat any az invocation that exits 0 + emits
 * parseable JSON as "mechanism OK" — even when the result is `[]`.
 *
 * Required env:
 *   NEW_REVISION_NAME    Revision name (e.g. `gwn-production--abc123-xy`).
 *   AI_RESOURCE          App Insights component name (e.g. `gwn-ai-production`).
 *
 * Optional env:
 *   RESOURCE_GROUP       default `gwn-rg`.
 *   EXPECTED_ROW_COUNT   default 6 (matches the 6 smoke probes; one is
 *                        intentionally counted even when /api/health is
 *                        skipped — overshoot is fine, the check is `>=`).
 *   AI_VERIFY_BUDGET_MS  default 600000 (10 min total).
 *   AI_VERIFY_OUTPUT_PATH default `ai-verification.json`.
 *   AI_VERIFY_TIME_WINDOW KQL `ago()` window. Default `15m` (slightly
 *                        wider than the 10-min retry budget so the LAST
 *                        attempt's window still includes the FIRST smoke
 *                        probe even after ingest backpressure).
 *
 * Usage (CLI):
 *
 *   NEW_REVISION_NAME=gwn-production--rev42-xy \
 *   AI_RESOURCE=gwn-ai-production \
 *     node scripts/verify-ai.js
 *
 * Output: writes `ai-verification.json` (path overridable) for CS41-8's
 * render-deploy-summary.js to consume. Always writes the file — even on
 * failure paths — so the deploy summary can surface what went wrong.
 */

'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');

const DEFAULTS = {
  RESOURCE_GROUP: 'gwn-rg',
  EXPECTED_ROW_COUNT: 6,
  // 10 min total budget. The verifier makes 7 attempts: one immediately,
  // then one after each entry of RETRY_WAITS_MS.
  BUDGET_MS: 10 * 60 * 1000,
  OUTPUT_PATH: 'ai-verification.json',
  TIME_WINDOW: '15m',
};

// Wait schedule between attempts, in ms. Sums to 600_000ms (10 min).
// Cadence matches the orchestrator brief: 1m, 2m, 2m, 2m, 2m, 1m.
// Backloaded 60s gives one last shot under the wire if ingest just barely
// missed the previous window.
const RETRY_WAITS_MS = [60_000, 120_000, 120_000, 120_000, 120_000, 60_000];

function nowMs() { return Date.now(); }

function annotate(level, msg) { console.log(`::${level}::${msg}`); }
function info(msg) { console.log(`[verify-ai] ${msg}`); }

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a non-negative integer, got: ${raw}`);
  }
  return Number(raw);
}

/**
 * Default `az` runner — spawns the real CLI and resolves with
 * `{ code, stdout, stderr }`. Tests inject a fake instead.
 */
function defaultAzRunner(args, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let proc;
    // On Linux runners (ubuntu-latest in our deploy workflows) `az` is a
    // shell script on PATH and spawn() can invoke it directly. On Windows
    // `az` is a `.cmd` shim which Node refuses to spawn without a shell
    // (CVE-2024-27980 hardening). For the Windows path we route through
    // cmd.exe and quote the args ourselves — the KQL analytics query is
    // full of pipes/parens/single-quotes which would otherwise be eaten
    // by cmd.exe's parser.
    try {
      if (process.platform === 'win32') {
        const cmdLine = ['az'].concat(args.map(quoteForCmd)).join(' ');
        proc = spawn('cmd.exe', ['/d', '/s', '/c', cmdLine], { windowsVerbatimArguments: true });
      } else {
        proc = spawn('az', args, { shell: false });
      }
    } catch (err) {
      return resolve({ code: -1, stdout: '', stderr: `spawn failed: ${err.message}` });
    }
    const timer = setTimeout(() => {
      if (settled) return;
      try { proc.kill('SIGKILL'); } catch { /* noop */ }
      settled = true;
      resolve({ code: -1, stdout, stderr: stderr + `\n[verify-ai] az timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    proc.stdout.on('data', (c) => { stdout += c; });
    proc.stderr.on('data', (c) => { stderr += c; });
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + `\n[verify-ai] spawn error: ${err.message}` });
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * Quote a single argument for cmd.exe consumption. cmd.exe has two layers
 * of escaping: shell metacharacters (|&<>^()) need `^` escaping, and the
 * inner argument double-quoting follows MSVCRT rules. Wrapping in double
 * quotes neutralizes shell metacharacters, then we double any existing
 * double quotes inside the value. This is sufficient for the controlled
 * inputs we pass (arg flags + revision-name-derived KQL).
 */
function quoteForCmd(arg) {
  const s = String(arg);
  if (s === '') return '""';
  // Always wrap in double quotes; double any internal double quotes; the
  // backslash escaping rules don't apply to args without trailing
  // backslashes, which our inputs never produce.
  return '"' + s.replace(/"/g, '""') + '"';
}

/**
 * Builds the KQL query. `cloud_RoleInstance has '<rev>'` matches the
 * revision-prefixed instance ids that Container Apps emits (e.g.
 * `gwn-production--rev42-xy-abc123-deadbeef`); `has` is token-aware so a
 * later revision that happens to share a substring won't false-match.
 */
function buildKql(revision, timeWindow) {
  // Single quotes inside KQL strings are doubled, per Kusto literal rules.
  // Revision names are alphanumeric+dashes today, but defending here costs
  // nothing and prevents an injection footgun if the upstream input ever
  // changes.
  const safeRev = String(revision).replace(/'/g, "''");
  // Time window must look like `<digits><unit>` where unit is one of
  // s/m/h/d (KQL timespan literals). Anything else gets clamped to the
  // default. This both validates the input and prevents KQL injection
  // through the window string.
  const winMatch = /^\s*(\d+[smhd])\s*$/.exec(String(timeWindow));
  const safeWin = winMatch ? winMatch[1] : DEFAULTS.TIME_WINDOW;
  return `requests | where cloud_RoleInstance has '${safeRev}' and timestamp > ago(${safeWin}) | summarize count_ = count() by name, resultCode | order by count_ desc`;
}

/**
 * App Insights `query` returns a "tables" envelope. We normalize to a list
 * of `{ name, resultCode, count }` rows so callers (and the renderer)
 * don't have to know the envelope shape.
 *
 * Accepted shapes (both observed in `az monitor app-insights query` over
 * different az versions):
 *   - `{ tables: [{ columns: [{name},...], rows: [[...], ...] }] }`
 *   - `[{ name: 'GET /healthz', resultCode: '200', count_: 1 }, ...]`
 *     (older `--output json` emitted a flat array of objects)
 */
function parseQueryResult(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    return { ok: false, error: `unparseable JSON from az: ${err.message}; first 200 chars: ${stdout.slice(0, 200)}` };
  }
  // Flat-array shape.
  if (Array.isArray(parsed)) {
    return { ok: true, rows: parsed.map((r) => normalizeRow(r)) };
  }
  // Tables-envelope shape.
  if (parsed && Array.isArray(parsed.tables) && parsed.tables[0]) {
    const t = parsed.tables[0];
    const cols = (t.columns || []).map((c) => c.name);
    const rows = (t.rows || []).map((row) => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      return normalizeRow(obj);
    });
    return { ok: true, rows };
  }
  // Empty `[]` after a successful query is legal. Anything else with no
  // recognizable shape is a contract violation we should surface.
  return { ok: false, error: `unrecognized az JSON shape: ${stdout.slice(0, 200)}` };
}

function normalizeRow(r) {
  const count = Number(r.count_ ?? r.count ?? 0);
  return {
    name: String(r.name ?? ''),
    resultCode: String(r.resultCode ?? ''),
    count: Number.isFinite(count) ? count : 0,
  };
}

/**
 * Single attempt: invoke az, parse, return either `{ ok: true, rows }` or
 * `{ ok: false, error, mechanismFailure }`. `mechanismFailure: true` means
 * the az invocation itself failed (exit code != 0 OR unparseable output);
 * THAT is a deploy failure. `mechanismFailure: false` is reserved for
 * future "query ran but returned something odd" cases.
 */
async function queryOnce({ azRunner, aiResource, resourceGroup, kql }) {
  const args = [
    'monitor', 'app-insights', 'query',
    '--app', aiResource,
    '-g', resourceGroup,
    '--analytics-query', kql,
    '-o', 'json',
  ];
  const startedAt = nowMs();
  const r = await azRunner(args);
  const elapsedMs = nowMs() - startedAt;
  if (r.code !== 0) {
    return {
      ok: false, mechanismFailure: true, elapsedMs,
      error: `az exited ${r.code}: ${(r.stderr || r.stdout || '').slice(0, 500)}`,
    };
  }
  const parsed = parseQueryResult(r.stdout || '');
  if (!parsed.ok) {
    return { ok: false, mechanismFailure: true, elapsedMs, error: parsed.error };
  }
  return { ok: true, rows: parsed.rows, elapsedMs };
}

/**
 * Top-level verifier. Returns the result object that gets serialized to
 * `ai-verification.json`. Never throws. The caller decides exit code from
 * the result's `error` field.
 */
async function verify({
  revisionName,
  aiResource,
  resourceGroup = DEFAULTS.RESOURCE_GROUP,
  expectedRows = DEFAULTS.EXPECTED_ROW_COUNT,
  budgetMs = DEFAULTS.BUDGET_MS,
  timeWindow = DEFAULTS.TIME_WINDOW,
  azRunner = defaultAzRunner,
  sleeper = (ms) => new Promise((r) => setTimeout(r, ms)),
  retryWaitsMs = RETRY_WAITS_MS,
} = {}) {
  const startedAt = nowMs();
  const startedIso = new Date(startedAt).toISOString();
  const kql = buildKql(revisionName, timeWindow);

  const result = {
    ai_resource: aiResource,
    resource_group: resourceGroup,
    revision_name: revisionName,
    expected_rows: expectedRows,
    time_window: timeWindow,
    kql,
    started_at: startedIso,
    finished_at: null,
    query_attempts: 0,
    query_duration_ms: 0,
    rows_total: 0,
    rows_by_route: [],
    threshold_met: false,
    warning: false,
    error: null,
  };

  let attemptIdx = 0;
  let lastRows = [];
  while (true) {
    attemptIdx++;
    result.query_attempts = attemptIdx;
    const r = await queryOnce({ azRunner, aiResource, resourceGroup, kql });
    result.query_duration_ms += r.elapsedMs;
    if (!r.ok) {
      // Mechanism failure — stop immediately, this is the "broken" case.
      result.error = r.error;
      result.finished_at = new Date().toISOString();
      info(`attempt ${attemptIdx} mechanism failure (${r.elapsedMs}ms): ${r.error}`);
      return result;
    }
    lastRows = r.rows;
    const total = lastRows.reduce((s, x) => s + (x.count || 0), 0);
    info(`attempt ${attemptIdx} ok (${r.elapsedMs}ms): ${lastRows.length} route(s), ${total} request row(s)`);
    if (total >= expectedRows) {
      result.rows_total = total;
      result.rows_by_route = lastRows;
      result.threshold_met = true;
      result.finished_at = new Date().toISOString();
      return result;
    }
    // Out of attempts? Persist what we saw and warn.
    if (attemptIdx > retryWaitsMs.length) break;
    // Honor the budget: never wait past it.
    const elapsed = nowMs() - startedAt;
    const remaining = Math.max(0, budgetMs - elapsed);
    const wait = Math.min(retryWaitsMs[attemptIdx - 1] ?? 0, remaining);
    if (wait > 0) {
      info(`waiting ${wait}ms before next attempt (elapsed=${elapsed}ms / budget=${budgetMs}ms)`);
      await sleeper(wait);
    }
    if (nowMs() - startedAt >= budgetMs) break;
  }

  result.rows_total = lastRows.reduce((s, x) => s + (x.count || 0), 0);
  result.rows_by_route = lastRows;
  result.threshold_met = false;
  result.warning = true;
  result.finished_at = new Date().toISOString();
  return result;
}

function writeJson(path, obj) {
  try {
    fs.writeFileSync(path, JSON.stringify(obj, null, 2));
  } catch (err) {
    // Don't crash the caller; just surface to stderr. The deploy summary
    // will fall back to its placeholder when the file is missing.
    console.error(`[verify-ai] failed to write ${path}: ${err.message}`);
  }
}

async function main() {
  const revisionName = process.env.NEW_REVISION_NAME;
  const aiResource = process.env.AI_RESOURCE;
  if (!revisionName) {
    console.error('NEW_REVISION_NAME env var is required');
    process.exit(2);
  }
  if (!aiResource) {
    console.error('AI_RESOURCE env var is required (e.g. gwn-ai-production)');
    process.exit(2);
  }
  const resourceGroup = process.env.RESOURCE_GROUP || DEFAULTS.RESOURCE_GROUP;
  const expectedRows = envInt('EXPECTED_ROW_COUNT', DEFAULTS.EXPECTED_ROW_COUNT);
  const budgetMs = envInt('AI_VERIFY_BUDGET_MS', DEFAULTS.BUDGET_MS);
  const outPath = process.env.AI_VERIFY_OUTPUT_PATH || DEFAULTS.OUTPUT_PATH;
  const timeWindow = process.env.AI_VERIFY_TIME_WINDOW || DEFAULTS.TIME_WINDOW;

  info(`verifying revision=${revisionName} ai=${aiResource} expected>=${expectedRows} budget=${budgetMs}ms window=${timeWindow}`);

  const result = await verify({
    revisionName, aiResource, resourceGroup, expectedRows, budgetMs, timeWindow,
  });
  writeJson(outPath, result);

  if (result.error) {
    annotate('error', `AI access broken — separate from telemetry export. ${result.error}`);
    process.exit(2);
  }
  if (result.warning) {
    annotate('warning', `AI ingest delayed beyond budget for revision ${revisionName}: only ${result.rows_total}/${expectedRows} request row(s) visible after ${result.query_attempts} attempts. Verify ${aiResource} manually; deploy NOT rolled back.`);
    process.exit(0);
  }
  info(`✅ ${result.rows_total} ingested row(s) >= ${expectedRows} expected — telemetry export healthy.`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[verify-ai] fatal:', err && err.stack ? err.stack : err);
    process.exit(2);
  });
}

module.exports = {
  verify,
  buildKql,
  parseQueryResult,
  normalizeRow,
  queryOnce,
  defaultAzRunner,
  DEFAULTS,
  RETRY_WAITS_MS,
};
