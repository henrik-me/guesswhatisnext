#!/usr/bin/env node
/**
 * scripts/render-deploy-summary.js — CS41-8 deploy-summary annotator.
 *
 * Reads the JSON results emitted by scripts/smoke.js and renders a markdown
 * table suitable for `>> "$GITHUB_STEP_SUMMARY"`. Static deploy metadata
 * (image SHA, revision name, migration status) comes from environment
 * variables the workflow already exports for its other steps:
 *
 *   IMAGE_SHA          — short Docker image SHA (workflow input)
 *   REVISION_NAME      — Container Apps revision name from `az containerapp ...`
 *   MIGRATION_STATUS   — 'applied' | 'no-op' | 'skipped' | 'failed' | ''
 *   ENVIRONMENT        — e.g. 'staging' or 'production' (optional, cosmetic)
 *
 * Usage:
 *
 *   node scripts/render-deploy-summary.js smoke-results.json
 *
 * The CS41-3 "AI verification" placeholder is intentional — that section is
 * populated by the follow-up CS41-3 PR. Keeping the heading here means the
 * follow-up only has to fill the body, not restructure the summary.
 */

'use strict';

const fs = require('node:fs');

function fmtElapsed(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function statusIcon(status) {
  switch (status) {
    case 'pass': return '✅';
    case 'fail': return '❌';
    case 'skip': return '⚠️ skipped';
    default: return status || '—';
  }
}

const STEP_LABELS = {
  healthz: '/healthz',
  features: '/api/features',
  login: 'POST /api/auth/login',
  'submit-score': 'POST /api/scores',
  'me-scores': 'GET /api/scores/me',
  health: 'GET /api/health (DB)',
};

function stepDetail(step) {
  switch (step.step) {
    case 'healthz':
    case 'features':
      if (step.status === 'pass') return `200 (${step.attempts || 1} attempt${step.attempts === 1 ? '' : 's'})`;
      return `last status=${step.lastStatus ?? '—'}`;
    case 'login':
      return step.status === 'pass' ? 'token issued' : (step.error || `status=${step.lastStatus}`);
    case 'submit-score':
      return step.status === 'pass' ? `id=${step.id}, score=${step.score}` : (step.error || `status=${step.lastStatus}`);
    case 'me-scores':
      return step.status === 'pass' ? `sentinel present (${step.scoreCount} scores)` : (step.error || `status=${step.lastStatus}`);
    case 'health':
      if (step.status === 'skip') return step.reason || 'skipped';
      return step.status === 'pass' ? `db=${step.dbStatus}` : (step.error || `status=${step.lastStatus}`);
    default:
      return '';
  }
}

function migrationIcon(status) {
  switch ((status || '').toLowerCase()) {
    case 'applied': return '✅ applied';
    case 'no-op': return '✅ no-op';
    case 'skipped': return '⚠️ skipped';
    case 'failed': return '❌ failed';
    case '':
    case undefined:
    case null: return 'N/A';
    default: return status;
  }
}

function render(results, env = process.env) {
  const lines = [];
  lines.push('## Deploy Summary');
  lines.push('');
  if (env.ENVIRONMENT) lines.push(`- **Environment:** \`${env.ENVIRONMENT}\``);
  lines.push(`- **Image SHA:** \`${env.IMAGE_SHA || '—'}\``);
  lines.push(`- **Revision:** \`${env.REVISION_NAME || '—'}\``);
  lines.push(`- **Migration:** ${migrationIcon(env.MIGRATION_STATUS)}`);
  if (results?.target) lines.push(`- **Target FQDN:** \`${results.target}\``);
  if (results?.startedAt) lines.push(`- **Smoke started:** \`${results.startedAt}\``);
  lines.push(`- **Smoke verdict:** ${results?.passed ? '✅ pass' : '❌ fail'}`);
  lines.push('');

  lines.push('### Smoke results');
  lines.push('');
  lines.push('| Step | Status | Elapsed | Detail |');
  lines.push('|---|---|---|---|');
  const steps = Array.isArray(results?.steps) ? results.steps : [];
  if (steps.length === 0) {
    lines.push('| _no steps recorded_ | — | — | — |');
  } else {
    for (const s of steps) {
      const label = STEP_LABELS[s.step] || s.step;
      const elapsed = s.status === 'skip' ? '—' : fmtElapsed(s.elapsedMs);
      lines.push(`| ${label} | ${statusIcon(s.status)} | ${elapsed} | ${stepDetail(s)} |`);
    }
  }
  lines.push('');

  if (Array.isArray(results?.perfWarnings) && results.perfWarnings.length > 0) {
    lines.push('### Perf warnings');
    lines.push('');
    lines.push('| Step | Elapsed | Threshold |');
    lines.push('|---|---|---|');
    for (const w of results.perfWarnings) {
      lines.push(`| ${STEP_LABELS[w.step] || w.step} | ${fmtElapsed(w.elapsedMs)} | ${fmtElapsed(w.threshold)} |`);
    }
    lines.push('');
  }

  lines.push('### AI verification');
  lines.push('');
  lines.push(renderAiVerification(env));
  lines.push('');

  // CS41-7: if the ingest-delta artifact is already on disk by the time
  // render-deploy-summary runs, fold it into the summary so operators see
  // smoke + AI verify + ingest delta in one block. The dedicated CS41-7
  // workflow step still appends its own section unconditionally — these
  // two paths are independent.
  const ingestSection = renderIngestDeltaIfPresent(env);
  if (ingestSection) {
    lines.push(ingestSection);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Reads `ai-verification.json` (path overridable via env) and renders the
 * CS41-3 AI ingest section. Falls back to a "not run / not found"
 * placeholder when the file is missing — that's the expected state when
 * the smoke step failed and the verifier was skipped.
 */
function renderAiVerification(env = process.env) {
  const path = env.AI_VERIFICATION_PATH || 'ai-verification.json';
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch {
    return '_AI verification not run (smoke failed or skipped — see above)._';
  }
  const out = [];
  out.push(`- **AI resource:** \`${data.ai_resource || '—'}\``);
  out.push(`- **Revision:** \`${data.revision_name || '—'}\``);
  out.push(`- **Time window:** \`ago(${data.time_window || '?'})\``);
  out.push(`- **Query attempts:** ${data.query_attempts ?? '—'}  (cumulative az time: ${fmtElapsed(data.query_duration_ms)})`);
  out.push(`- **Rows captured:** ${data.rows_total ?? 0} (expected ≥ ${data.expected_rows ?? '?'})`);
  if (data.error) {
    out.push(`- **Status:** ❌ AI access broken — \`${String(data.error).slice(0, 240)}\``);
    return out.join('\n');
  }
  if (data.warning) {
    out.push(`- **Status:** ⚠️ ingest delayed beyond budget — deploy NOT rolled back. Verify \`${data.ai_resource}\` manually.`);
  } else {
    out.push('- **Status:** ✅ All smoke probes ingested within budget.');
  }
  if (Array.isArray(data.rows_by_route) && data.rows_by_route.length > 0) {
    out.push('- **By route:**');
    for (const row of data.rows_by_route) {
      out.push(`  - \`${row.name}\`: ${row.count} (${row.resultCode})`);
    }
  }
  return out.join('\n');
}

/**
 * CS41-7 hook: if `ingest-delta.json` exists at the conventional path
 * (overridable via env), render its markdown section via the same renderer
 * the dedicated workflow step uses. Returns null when the file is missing
 * or unreadable so callers can omit the section silently.
 */
function renderIngestDeltaIfPresent(env = process.env) {
  const path = env.INGEST_DELTA_PATH || 'ingest-delta.json';
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
  // Lazy-require to avoid a hard dep when the file doesn't exist (and to
  // keep render-deploy-summary.js loadable in test environments that don't
  // have render-ingest-section.js on disk).
  const { render: renderIngest } = require('./render-ingest-section.js');
  return renderIngest(data);
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: render-deploy-summary.js <smoke-results.json>');
    process.exit(2);
  }
  let results;
  try {
    results = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  } catch (err) {
    // Render a degraded summary so the workflow step can still annotate
    // even when the smoke script crashed before writing results.
    console.error(`could not read ${inputPath}: ${err.message}`);
    results = { passed: false, steps: [] };
  }
  process.stdout.write(render(results));
}

if (require.main === module) {
  main();
}

module.exports = { render, renderAiVerification, renderIngestDeltaIfPresent, fmtElapsed, statusIcon, migrationIcon, stepDetail };
