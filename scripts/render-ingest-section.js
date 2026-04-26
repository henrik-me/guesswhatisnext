#!/usr/bin/env node
/**
 * scripts/render-ingest-section.js — CS41-7 ingest-delta markdown renderer.
 *
 * Reads the JSON document produced by scripts/compute-ingest-delta.js and
 * emits a markdown section suitable for `>> "$GITHUB_STEP_SUMMARY"`. Pure
 * function — no env vars, no side effects beyond stdout.
 *
 * Usage:
 *
 *   node scripts/render-ingest-section.js ingest-delta.json
 *
 * On read/parse failure, emits a degraded "section not produced" placeholder
 * so the workflow step can still annotate without crashing.
 */

'use strict';

const fs = require('node:fs');

function fmtGb(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  // Six significant digits is enough resolution for a per-deploy delta
  // (typically O(MB) — i.e. 0.00X GB) without scientific notation.
  return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function fmtDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h === 0 && m === 0) return `${totalSec}s`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function render(data) {
  const lines = [];
  const aiResource = (data && data.ai_resource) || (data && data.env ? `gwn-ai-${data.env}` : '—');
  lines.push(`## AI ingest since previous deploy (${aiResource})`);
  lines.push('');

  if (!data || typeof data !== 'object') {
    lines.push('_Ingest delta not produced._');
    lines.push('');
    return lines.join('\n');
  }

  if (data.error) {
    lines.push(`- **Status:** ⚠️ query failed — \`${String(data.error).slice(0, 240)}\``);
  }
  if (data.used_fallback) {
    const hrs = data.fallback_hours != null ? `${data.fallback_hours}h` : 'fallback';
    lines.push(`- **Window source:** ⚠️ no prior successful deploy found — using ${hrs} fallback window`);
  }

  const start = data.window_start;
  const end = data.window_end;
  let windowLine = `- **Window:** ${start || '—'} → ${end || '—'}`;
  if (start && end) {
    const durMs = Date.parse(end) - Date.parse(start);
    if (Number.isFinite(durMs)) windowLine += ` (~${fmtDurationMs(durMs)})`;
  }
  lines.push(windowLine);

  lines.push(`- **Total ingest:** ${fmtGb(data.total_gb)} GB`);
  lines.push(`- **Total rows:** ${data.total_rows ?? 0}`);
  lines.push('');

  const rows = Array.isArray(data.by_itemType) ? data.by_itemType : [];
  lines.push('| itemType | rows | GB |');
  lines.push('|---|---|---|');
  if (rows.length === 0) {
    lines.push('| _no telemetry rows in window_ | 0 | 0 |');
  } else {
    for (const r of rows) {
      lines.push(`| ${r.itemType || '—'} | ${r.rows ?? 0} | ${fmtGb(r.gb_ingested)} |`);
    }
  }
  lines.push('');

  if (data.workflow) lines.push(`<sub>Workflow: \`${data.workflow}\` · env: \`${data.env || '?'}\`</sub>`);
  lines.push('');
  return lines.join('\n');
}

function readJsonOrNull(path) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: render-ingest-section.js <ingest-delta.json>');
    process.exit(2);
  }
  const data = readJsonOrNull(inputPath);
  process.stdout.write(render(data));
}

if (require.main === module) {
  main();
}

module.exports = { render, fmtGb, fmtDurationMs };
