#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');

const LOCAL_REVIEW = 'Local Review';
const CONTAINER_VALIDATION = 'Container Validation';
const TELEMETRY_VALIDATION = 'Telemetry Validation';

function normalizePath(file) {
  if (typeof file === 'string') return file.replace(/\\/g, '/');
  return String(file.path || file.filename || file.name || '').replace(/\\/g, '/');
}

function changedFileNames(files) {
  return (files || []).map(normalizePath).filter(Boolean);
}

function isDocsFile(file) {
  return /\.md$/i.test(file) || file.startsWith('docs/') || file.startsWith('project/clickstops/');
}
function isCiConfigFile(file) {
  return /^\.github\/workflows\/.*\.ya?ml$/i.test(file) ||
    file === 'Dockerfile' ||
    /^docker-compose(?:\..*)?\.ya?ml$/i.test(file);
}

function isToolingOnlyFile(file) {
  return isDocsFile(file) ||
    isCiConfigFile(file) ||
    file.startsWith('scripts/') ||
    file.startsWith('tests/') ||
    file === 'package.json' ||
    file === 'package-lock.json';
}

function classifyPr(files) {
  if (files.length > 0 && files.every(isDocsFile)) return 'docs-only';
  if (files.length > 0 && files.every(isCiConfigFile)) return 'CI-config-only';
  return 'code/config';
}

function findSection(body, title, options = {}) {
  const { exact = false } = options;
  const lines = String(body || '').split(/\r?\n/);
  const exactHeader = `## ${title}`;
  const flexibleHeader = new RegExp(`^##\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?::.*)?\\s*$`);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if ((exact && line === exactHeader) || (!exact && flexibleHeader.test(line))) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return {
    header: lines[start],
    content: lines.slice(start + 1, end).join('\n'),
    fullText: lines.slice(start, end).join('\n'),
  };
}

function splitMarkdownRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
}

function parseFirstMarkdownTable(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\s*\|.*\|\s*$/.test(lines[i])) continue;
    if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue;
    const headers = splitMarkdownRow(lines[i]);
    const rows = [];
    for (let j = i + 2; j < lines.length; j++) {
      if (!/^\s*\|/.test(lines[j])) break;
      rows.push({ cells: splitMarkdownRow(lines[j]), raw: lines[j] });
    }
    return { headers, rows };
  }
  return null;
}

function columnIndex(headers, pattern) {
  return headers.findIndex(header => pattern.test(header));
}

function hasCleanReviewText(text) {
  return /clean\s+[—-]\s+no issues found/i.test(String(text || ''));
}

function commitShaMatchesBranch(sha, commitOids) {
  if (commitOids.size === 0) return true;
  const lower = sha.toLowerCase();
  for (const oid of commitOids) {
    if (oid.toLowerCase().startsWith(lower)) return true;
  }
  return false;
}

function fixReferencesCommit(fix, commitOids) {
  const matches = String(fix || '').match(/[0-9a-f]{7,40}/ig) || [];
  return matches.some(sha => commitShaMatchesBranch(sha, commitOids));
}

function validateLocalReview(body, prType, commitOids, findings) {
  let section = findSection(body, LOCAL_REVIEW, { exact: true });
  if (!section && prType === 'docs-only') {
    const flexibleSection = findSection(body, LOCAL_REVIEW);
    if (flexibleSection && /not applicable \(docs-only\)/i.test(flexibleSection.fullText)) return;
    section = flexibleSection;
  }
  if (!section) {
    findings.push(`PR body missing exact '## ${LOCAL_REVIEW}' section`);
    return;
  }

  if (prType === 'docs-only' && /not applicable \(docs-only\)/i.test(section.fullText)) return;

  const table = parseFirstMarkdownTable(section.content);
  if (!table) {
    findings.push(`'## ${LOCAL_REVIEW}' must contain a markdown table`);
    return;
  }

  const roundIdx = columnIndex(table.headers, /^round$/i);
  const findingIdx = columnIndex(table.headers, /^finding$/i);
  const fixIdx = columnIndex(table.headers, /^fix$/i);
  if (roundIdx === -1 || fixIdx === -1) {
    findings.push(`'## ${LOCAL_REVIEW}' table must include Round and Fix columns`);
    return;
  }

  const hasValidRow = table.rows.some(row => {
    const roundText = String(row.cells[roundIdx] || '').trim();
    if (!/^\d+$/.test(roundText)) return false;
    const round = Number.parseInt(roundText, 10);
    if (round < 1) return false;
    const finding = findingIdx === -1 ? '' : row.cells[findingIdx];
    const fix = row.cells[fixIdx] || '';
    return hasCleanReviewText(fix) || hasCleanReviewText(finding) || fixReferencesCommit(fix, commitOids);
  });

  if (!hasValidRow) {
    findings.push(`'## ${LOCAL_REVIEW}' table needs a Round >= 1 row whose Fix references a PR commit SHA (or a clean-review row)`);
  }
}

function hasPassingValidationRow(section) {
  const table = parseFirstMarkdownTable(section.content);
  if (!table || table.rows.length === 0) return false;
  return table.rows.some(row => {
    const rowText = row.cells.join(' ');
    if (/(?:❌|:x:|\bfail(?:ed|ure)?\b|\bnot\s+pass(?:ed)?\b)/i.test(rowText)) return false;
    return row.cells.some(cell => /(?:✅|:white_check_mark:|\bpass(?:ed|ing)?\b)/i.test(cell));
  });
}

function hasCheckedValidationItem(section) {
  return /^\s*-\s+\[[xX]\]\s+\S+/m.test(section.content);
}

function validateOperationalSection(body, title, prType, files, findings) {
  const section = findSection(body, title);
  if (!section) {
    findings.push(`PR body missing '## ${title}' section`);
    return;
  }

  const text = section.fullText;
  if (prType === 'docs-only' && /not applicable \((?:docs-only|docs\/CI-only)\)/i.test(text)) return;
  if (prType === 'CI-config-only' && /not applicable \((?:CI-config-only|docs\/CI-only)\)/i.test(text)) return;
  if (files.length > 0 && files.every(isToolingOnlyFile) && /not applicable \(tooling-only\)/i.test(text)) return;

  if (!hasPassingValidationRow(section) && !(title === TELEMETRY_VALIDATION && hasCheckedValidationItem(section))) {
    findings.push(`'## ${title}' must contain a markdown table with at least one passing row, a checked telemetry checklist item, or an allowed not-applicable marker`);
  }
}

function extractCommitOids(commitsPayload, detailsPayload) {
  const oids = new Set();
  const commits = commitsPayload && Array.isArray(commitsPayload.commits) ? commitsPayload.commits : [];
  for (const commit of commits) {
    const oid = commit && (commit.oid || commit.sha || commit.id);
    if (oid) oids.add(String(oid).toLowerCase());
  }
  if (detailsPayload && detailsPayload.headRefOid) oids.add(String(detailsPayload.headRefOid).toLowerCase());
  return oids;
}

function checkPrBody({ body, files, commitOids }) {
  const findings = [];
  const prType = classifyPr(files);
  validateLocalReview(body, prType, commitOids, findings);
  validateOperationalSection(body, CONTAINER_VALIDATION, prType, files, findings);
  validateOperationalSection(body, TELEMETRY_VALIDATION, prType, files, findings);
  return findings;
}

function fetchPrFiles(prNumber) {
  const result = spawnSync('gh', [
    'api',
    `repos/{owner}/{repo}/pulls/${prNumber}/files`,
    '--paginate',
    '--jq',
    '.[].filename',
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`gh api PR files failed for PR #${prNumber}: ${result.stderr || result.stdout}`.trim());
  }
  return {
    files: result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
  };
}

function fetchPrJson(prNumber, command) {
  if (command === 'files') return fetchPrFiles(prNumber);

  const fields = command === 'commits' ? 'commits' : 'body,files,headRefName,headRefOid';
  const result = spawnSync('gh', ['pr', 'view', String(prNumber), '--json', fields], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`gh pr view failed for PR #${prNumber}: ${result.stderr || result.stdout}`.trim());
  }
  return JSON.parse(result.stdout || '{}');
}

function run(options) {
  const fetcher = options.fetchPrJson || fetchPrJson;
  const details = fetcher(options.pr, 'details');
  const commits = fetcher(options.pr, 'commits');
  const filesPayload = fetcher(options.pr, 'files') || details;
  const files = changedFileNames(filesPayload.files || details.files);
  const commitOids = extractCommitOids(commits, details);
  return checkPrBody({ body: details.body || '', files, commitOids });
}

function formatWarnings(findings) {
  if (findings.length === 0) return 'check-pr-body: no findings';
  return findings.map(finding => `WARNING: ${finding}`).join('\n');
}

function parseArgs(argv) {
  const opts = { pr: null, strict: true };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--strict') opts.strict = true;
    else if (arg === '--warn-only') opts.strict = false;
    else if (arg === '--pr') opts.pr = argv[++i];
    else if (arg.startsWith('--pr=')) opts.pr = arg.slice('--pr='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: check-pr-body.js --pr <N> [--strict|--warn-only]');
      process.exit(0);
    } else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  if (!opts.pr) {
    console.error('missing required --pr <N>');
    process.exit(2);
  }
  return opts;
}

if (require.main === module) {
  try {
    const opts = parseArgs(process.argv);
    const findings = run(opts);
    const output = formatWarnings(findings);
    if (findings.length > 0) process.stderr.write(output + '\n');
    else process.stdout.write(output + '\n');
    process.exit(opts.strict && findings.length > 0 ? 1 : 0);
  } catch (err) {
    console.error(err.message || err);
    process.exit(2);
  }
}

module.exports = {
  checkPrBody,
  classifyPr,
  fetchPrJson,
  findSection,
  formatWarnings,
  parseFirstMarkdownTable,
  run,
};
