#!/usr/bin/env node
/**
 * scripts/compute-ingest-delta.js — CS41-7 per-deploy AI ingest delta.
 *
 * Runs at the END of a deploy workflow (after smoke + AI verify + traffic
 * shift). Computes how much telemetry App Insights has ingested in
 * `gwn-ai-${ENV}` since the PREVIOUS successful run of THIS workflow in
 * THIS environment, and emits a structured JSON result on stdout suitable
 * for both:
 *   - rendering into `$GITHUB_STEP_SUMMARY` (via render-ingest-section.js)
 *   - uploading as a 90-day workflow artifact (consumed at CS60 measurement
 *     windows by operators via `gh run download`).
 *
 * This step is **observational only** — it never blocks a deploy. The
 * workflow wraps it in `continue-on-error: true` and `if: success() ||
 * failure()` so even FAILED deploys produce an artifact (they still
 * generated some traffic before failing, and that traffic is part of the
 * ingest budget the operator cares about).
 *
 * Window discovery:
 *   - Calls `gh run list --workflow=$WORKFLOW --status=success --limit=2`
 *     and reads the SECOND entry's `createdAt` (the previous successful
 *     run; the FIRST entry is the in-flight run itself once GitHub records
 *     it as success — at compute-time it usually isn't there yet, in which
 *     case `--limit=2` simply returns the one previous successful run).
 *   - If no prior successful run exists (first deploy of this env):
 *     fallback to 24h ago and emit `::notice::` so the operator knows.
 *
 * KQL scope:
 *   - We `union requests, dependencies, traces, customEvents, exceptions`
 *     — the five tables the app + autoinstrumentation actively write to.
 *     Avoids `union *` which would scan archived/system tables and inflate
 *     cost (rubber-duck finding).
 *   - `_BilledSize` is the per-row billed bytes; AI invoices on the sum of
 *     this column. CS54-8's KQL uses the same field.
 *
 * Required env:
 *   ENV          One of `staging` | `production`. Drives the AI resource
 *                name (`gwn-ai-${ENV}`).
 *   WORKFLOW     Workflow file or display name to scope `gh run list`.
 *                Typically `${{ github.workflow }}` (display name) but the
 *                file path (e.g. `prod-deploy.yml`) also works.
 *   GH_TOKEN     gh CLI auth — set to `${{ secrets.GITHUB_TOKEN }}` in CI.
 *
 * Optional env:
 *   RESOURCE_GROUP            default `gwn-rg`.
 *   AI_RESOURCE               override the computed `gwn-ai-${ENV}` name.
 *   INGEST_FALLBACK_HOURS     default 24 — how far back to look on first
 *                             deploy of an environment.
 *
 * Exit codes:
 *   0 — JSON written to stdout (even on AI query failure: the result will
 *       carry an `error` field and zeroed totals so renderers degrade
 *       gracefully). Never blocks the deploy.
 *
 * The script always writes a JSON object to stdout. All progress / warning
 * logs go to stderr so a `> ingest-delta.json` redirect produces a clean
 * file.
 */

'use strict';

const { spawn } = require('node:child_process');

const DEFAULTS = {
  RESOURCE_GROUP: 'gwn-rg',
  FALLBACK_HOURS: 24,
  // KQL scopes to the five tables the app + autoinstrumentation actively
  // populate. Keeping this list explicit avoids `union *` cost.
  TABLES: ['requests', 'dependencies', 'traces', 'customEvents', 'exceptions'],
  // Per-table query timeout. AI queries for a few-hours window typically
  // return in seconds; 60s gives generous slack without wedging the deploy
  // workflow.
  QUERY_TIMEOUT_MS: 60_000,
  GH_TIMEOUT_MS: 30_000,
};

function info(msg) { console.error(`[compute-ingest-delta] ${msg}`); }
function annotate(level, msg) { console.error(`::${level}::${msg}`); }

/**
 * Default child-process runner used for both `gh` and `az`. Returns a
 * promise that resolves with `{ code, stdout, stderr }` and never rejects.
 * Tests inject fakes instead.
 *
 * Mirrors the Windows-vs-POSIX handling in scripts/verify-ai.js so the
 * script remains usable from a developer's local Windows shell.
 */
function defaultProcRunner(cmd, args, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let proc;
    try {
      if (process.platform === 'win32') {
        const cmdLine = [cmd].concat(args.map(quoteForCmd)).join(' ');
        proc = spawn('cmd.exe', ['/d', '/s', '/c', cmdLine], { windowsVerbatimArguments: true });
      } else {
        proc = spawn(cmd, args, { shell: false });
      }
    } catch (err) {
      return resolve({ code: -1, stdout: '', stderr: `spawn failed: ${err.message}` });
    }
    const timer = setTimeout(() => {
      if (settled) return;
      try { proc.kill('SIGKILL'); } catch { /* noop */ }
      settled = true;
      resolve({ code: -1, stdout, stderr: stderr + `\n[compute-ingest-delta] ${cmd} timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    proc.stdout.on('data', (c) => { stdout += c; });
    proc.stderr.on('data', (c) => { stderr += c; });
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + `\n[compute-ingest-delta] spawn error: ${err.message}` });
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function quoteForCmd(arg) {
  const s = String(arg);
  if (s === '') return '""';
  return '"' + s.replace(/"/g, '""') + '"';
}

/**
 * Resolves the ISO8601 timestamp of the previous successful run of this
 * workflow. Returns `{ iso, fallback }`:
 *   - On success:   `{ iso: '2026-04-26T...Z', fallback: false }`
 *   - On no-prior:  `{ iso: <now - fallbackHours>, fallback: true }`
 *   - On gh error:  `{ iso: <now - fallbackHours>, fallback: true, error }`
 *
 * `gh run list` JSON output is an array ordered by `createdAt` desc. The
 * CURRENT in-flight run typically isn't yet present in the `--status=success`
 * filter at compute-time (it's still `in_progress`), so the FIRST entry is
 * usually already the previous success. We defensively handle BOTH cases:
 *   - 1 entry  → that entry is the previous success.
 *   - 2 entries → take the second (the first being the in-flight run that
 *                  flipped to success between resolve-time and now).
 */
async function resolvePreviousSuccessIso({ workflow, ghRunner, now, fallbackHours }) {
  const fallbackIso = new Date(now() - fallbackHours * 3600 * 1000).toISOString();

  if (!workflow) {
    annotate('notice', 'WORKFLOW env not set — using fallback window');
    return { iso: fallbackIso, fallback: true, error: 'WORKFLOW env not set' };
  }

  const args = [
    'run', 'list',
    '--workflow', workflow,
    '--status', 'success',
    '--limit', '2',
    '--json', 'createdAt',
  ];
  const r = await ghRunner('gh', args, { timeoutMs: DEFAULTS.GH_TIMEOUT_MS });
  if (r.code !== 0) {
    const err = `gh run list exited ${r.code}: ${(r.stderr || r.stdout || '').slice(0, 300)}`;
    annotate('warning', `${err} — falling back to ${fallbackHours}h window`);
    return { iso: fallbackIso, fallback: true, error: err };
  }

  let parsed;
  try {
    parsed = JSON.parse(r.stdout || '[]');
  } catch (err) {
    const e = `unparseable gh JSON: ${err.message}`;
    annotate('warning', `${e} — falling back to ${fallbackHours}h window`);
    return { iso: fallbackIso, fallback: true, error: e };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    annotate('notice', `No prior successful run of '${workflow}' — using ${fallbackHours}h fallback window`);
    return { iso: fallbackIso, fallback: true };
  }

  // Heuristic: the in-flight run hasn't completed yet, so the FIRST entry
  // is the previous success. If for some reason the in-flight run already
  // flipped to success (shouldn't happen mid-step, but be defensive), take
  // the second.
  const candidate = parsed.length >= 2 ? parsed[1].createdAt : parsed[0].createdAt;
  if (typeof candidate !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(candidate)) {
    annotate('warning', `gh returned non-ISO createdAt: ${JSON.stringify(candidate)} — falling back`);
    return { iso: fallbackIso, fallback: true, error: 'invalid createdAt from gh' };
  }
  return { iso: candidate, fallback: false };
}

/**
 * Builds the KQL query. Window is `between (datetime('${PREV}') .. now())`.
 * `_BilledSize` is summed and converted from bytes → GB.
 */
function buildKql(prevIso, tables = DEFAULTS.TABLES) {
  // KQL string literal escaping: double any embedded single quotes. Our
  // input is from gh / a Date.toISOString() so this is paranoid, not
  // load-bearing — but it costs nothing.
  const safePrev = String(prevIso).replace(/'/g, "''");
  // Defensive: only allow alphanumeric+underscore table names. Prevents a
  // KQL injection through a hypothetical future env-controlled table list.
  const safeTables = tables
    .filter((t) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(t))
    .join(', ');
  return `union ${safeTables} | where timestamp between (datetime('${safePrev}') .. now()) | summarize gb_ingested = sum(_BilledSize) / (1024.0 * 1024.0 * 1024.0), rows = count() by itemType | order by gb_ingested desc`;
}

/**
 * Parses `az monitor app-insights query` output. Accepts both the
 * tables-envelope shape and the older flat-array shape, mirroring
 * scripts/verify-ai.js. Returns an array of `{ itemType, gb_ingested, rows }`.
 */
function parseQueryResult(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    return { ok: false, error: `unparseable JSON from az: ${err.message}; first 200 chars: ${String(stdout).slice(0, 200)}` };
  }
  if (Array.isArray(parsed)) {
    return { ok: true, rows: parsed.map(normalizeRow) };
  }
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
  return { ok: false, error: `unrecognized az JSON shape: ${String(stdout).slice(0, 200)}` };
}

function normalizeRow(r) {
  const gb = Number(r.gb_ingested ?? r.gb ?? 0);
  const rows = Number(r.rows ?? r.count ?? r.count_ ?? 0);
  return {
    itemType: String(r.itemType ?? ''),
    gb_ingested: Number.isFinite(gb) ? gb : 0,
    rows: Number.isFinite(rows) ? rows : 0,
  };
}

/**
 * Top-level computation. Returns a serializable result object. Never
 * throws; on any error the result includes an `error` field and zeroed
 * totals so downstream renderers degrade gracefully.
 */
async function computeIngestDelta({
  env,
  workflow,
  resourceGroup = DEFAULTS.RESOURCE_GROUP,
  aiResource,
  fallbackHours = DEFAULTS.FALLBACK_HOURS,
  azRunner = (args, opts) => defaultProcRunner('az', args, opts),
  ghRunner = (cmd, args, opts) => defaultProcRunner(cmd, args, opts),
  now = () => Date.now(),
} = {}) {
  if (!env) {
    return errorResult({ env, error: 'ENV is required (staging|production)', now });
  }
  const resolvedAi = aiResource || `gwn-ai-${env}`;
  const prev = await resolvePreviousSuccessIso({ workflow, ghRunner, now, fallbackHours });
  const windowStart = prev.iso;
  const windowEnd = new Date(now()).toISOString();
  const kql = buildKql(windowStart);

  info(`querying ${resolvedAi} for ingest between ${windowStart} and ${windowEnd}`);
  const azArgs = [
    'monitor', 'app-insights', 'query',
    '--app', resolvedAi,
    '-g', resourceGroup,
    '--analytics-query', kql,
    '-o', 'json',
  ];
  const r = await azRunner(azArgs, { timeoutMs: DEFAULTS.QUERY_TIMEOUT_MS });

  const base = {
    env,
    ai_resource: resolvedAi,
    resource_group: resourceGroup,
    workflow: workflow || null,
    window_start: windowStart,
    window_end: windowEnd,
    used_fallback: !!prev.fallback,
    fallback_hours: prev.fallback ? fallbackHours : null,
    kql,
    by_itemType: [],
    total_gb: 0,
    total_rows: 0,
    error: null,
  };

  if (prev.fallback && prev.error) {
    base.gh_error = prev.error;
  }

  if (r.code !== 0) {
    const err = `az exited ${r.code}: ${(r.stderr || r.stdout || '').slice(0, 400)}`;
    annotate('warning', `AI ingest query failed — emitting empty delta. ${err}`);
    base.error = err;
    return base;
  }
  const parsed = parseQueryResult(r.stdout || '');
  if (!parsed.ok) {
    annotate('warning', `AI ingest result unparseable — emitting empty delta. ${parsed.error}`);
    base.error = parsed.error;
    return base;
  }
  base.by_itemType = parsed.rows;
  base.total_gb = parsed.rows.reduce((s, x) => s + (x.gb_ingested || 0), 0);
  base.total_rows = parsed.rows.reduce((s, x) => s + (x.rows || 0), 0);
  info(`captured ${parsed.rows.length} itemType row(s); total ${base.total_rows} rows / ${base.total_gb.toFixed(6)} GB`);
  return base;
}

function errorResult({ env, error, now }) {
  const t = new Date(now()).toISOString();
  return {
    env: env || null,
    ai_resource: null,
    resource_group: null,
    workflow: null,
    window_start: t,
    window_end: t,
    used_fallback: false,
    fallback_hours: null,
    kql: null,
    by_itemType: [],
    total_gb: 0,
    total_rows: 0,
    error,
  };
}

async function main() {
  const env = process.env.ENV;
  if (!env) {
    process.stdout.write(JSON.stringify(errorResult({ env: null, error: 'ENV env var is required (staging|production)', now: Date.now }), null, 2));
    annotate('error', 'ENV env var is required (staging|production)');
    process.exit(0);
    return;
  }
  const workflow = process.env.WORKFLOW || process.env.GITHUB_WORKFLOW;
  const resourceGroup = process.env.RESOURCE_GROUP || DEFAULTS.RESOURCE_GROUP;
  const aiResource = process.env.AI_RESOURCE; // optional override
  const fallbackHours = process.env.INGEST_FALLBACK_HOURS
    ? Number(process.env.INGEST_FALLBACK_HOURS)
    : DEFAULTS.FALLBACK_HOURS;

  const result = await computeIngestDelta({
    env, workflow, resourceGroup, aiResource, fallbackHours,
  });
  process.stdout.write(JSON.stringify(result, null, 2));
  // Always exit 0 — this step never blocks a deploy.
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    // Even fatal errors are written as JSON so the artifact is still useful.
    const payload = errorResult({ env: process.env.ENV, error: `fatal: ${err && err.stack ? err.stack : err}`, now: Date.now });
    process.stdout.write(JSON.stringify(payload, null, 2));
    annotate('error', `compute-ingest-delta fatal: ${err && err.message ? err.message : err}`);
    process.exit(0);
  });
}

module.exports = {
  computeIngestDelta,
  resolvePreviousSuccessIso,
  buildKql,
  parseQueryResult,
  normalizeRow,
  DEFAULTS,
};
