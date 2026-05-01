#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');

const COPILOT_TRAILER = 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>';
const AGENT_TRAILER_RE = /^Agent:\s+\S+\/\S+\s*$/m;
const TRAILER_DOC_LINK = 'CONVENTIONS.md#5-git-workflow';
const TRAILER_FORMAT_REMINDER = `Required trailers:\nAgent: <orchestrator>/<context>\n${COPILOT_TRAILER}`;

function trailerFinding(hash, message) {
  return `${hash}: ${message}\n${TRAILER_FORMAT_REMINDER}\nSee: ${TRAILER_DOC_LINK}`;
}

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`.trim());
  }
  return result.stdout;
}

function fetchCommitLog(base, head) {
  return runGit(['log', `${base}..${head}`, '--no-merges', '--format=%x1e%H%x1f%B']);
}

function parseCommitLog(logText) {
  const text = String(logText || '');
  if (text.includes('\x1f')) {
    return text.split('\x1e').map(record => {
      const fieldIndex = record.indexOf('\x1f');
      if (fieldIndex === -1) return null;
      const hash = record.slice(0, fieldIndex).trim();
      if (!hash) return null;
      return { hash, message: record.slice(fieldIndex + 1).trimEnd() };
    }).filter(Boolean);
  }

  const commits = [];
  const records = text.split(/^---\s*$/m);
  for (const record of records) {
    const trimmed = record.replace(/^\s+|\s+$/g, '');
    if (!trimmed) continue;
    const lines = trimmed.split(/\r?\n/);
    const hash = (lines.shift() || '').trim();
    if (!hash) continue;
    commits.push({ hash, message: lines.join('\n').trimEnd() });
  }
  return commits;
}

function fetchChangedPaths(hash) {
  return runGit(['diff-tree', '--no-commit-id', '--name-only', '-r', hash])
    .split(/\r?\n/)
    .map(line => line.trim().replace(/\\/g, '/'))
    .filter(Boolean);
}

function isAllowlistedPath(file) {
  return file === 'WORKBOARD.md' || file.startsWith('project/clickstops/');
}

function isAllowlistedCommit(paths) {
  return paths.length > 0 && paths.every(isAllowlistedPath);
}

function hasCopilotTrailer(message) {
  return String(message || '').split(/\r?\n/).some(line => line.trim() === COPILOT_TRAILER);
}

function checkCommits(commits, getChangedPaths = fetchChangedPaths) {
  const findings = [];
  for (const commit of commits) {
    const paths = getChangedPaths(commit.hash);
    if (isAllowlistedCommit(paths)) continue;

    if (!hasCopilotTrailer(commit.message)) {
      findings.push(trailerFinding(commit.hash, `missing '${COPILOT_TRAILER}' trailer`));
    }
    if (!AGENT_TRAILER_RE.test(commit.message)) {
      findings.push(trailerFinding(commit.hash, `missing 'Agent: <token>/<token>' trailer`));
    }
  }
  return findings;
}

function run(options = {}) {
  const base = options.base || 'origin/main';
  const head = options.head || 'HEAD';
  const logText = options.gitLog != null ? options.gitLog : fetchCommitLog(base, head);
  const commits = parseCommitLog(logText);
  return checkCommits(commits, options.getChangedPaths || fetchChangedPaths);
}

function formatWarnings(findings) {
  if (findings.length === 0) return 'check-commit-trailers: no findings';
  return findings.map(finding => `WARNING: ${finding}`).join('\n');
}

function parseArgs(argv) {
  const opts = { base: 'origin/main', head: 'HEAD', strict: true };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--base') opts.base = argv[++i];
    else if (arg.startsWith('--base=')) opts.base = arg.slice('--base='.length);
    else if (arg === '--head') opts.head = argv[++i];
    else if (arg.startsWith('--head=')) opts.head = arg.slice('--head='.length);
    else if (arg === '--strict') opts.strict = true;
    else if (arg === '--warn-only') opts.strict = false;
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: check-commit-trailers.js [--base origin/main] [--head HEAD] [--strict|--warn-only]');
      process.exit(0);
    } else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
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
  AGENT_TRAILER_RE,
  COPILOT_TRAILER,
  checkCommits,
  formatWarnings,
  isAllowlistedCommit,
  parseCommitLog,
  run,
};
