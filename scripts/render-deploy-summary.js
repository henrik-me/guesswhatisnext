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
  lines.push('_(populated by CS41-3 in a follow-up PR — placeholder for now)_');
  lines.push('');

  return lines.join('\n');
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

module.exports = { render, fmtElapsed, statusIcon, migrationIcon, stepDetail };
