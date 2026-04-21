#!/usr/bin/env node
/**
 * scripts/check-docs-consistency.js — CS43-2
 *
 * Pure Node (no deps) docs consistency checker. See INSTRUCTIONS.md
 * § Documentation Conventions and project/clickstops/active/active_cs43_*.md
 * (or project/clickstops/done/done_cs43_*.md once archived) for the why.
 *
 * Checks:
 *   1. link-resolves           — every relative link [text](path[#anchor]) in
 *                                 any *.md resolves to an existing file (and
 *                                 anchor exists in that file when present).
 *   2. clickstop-link-resolves — links in CONTEXT.md "Clickstop Summary"
 *                                 table point at an existing clickstop file.
 *   3. prefix-matches-status   — clickstop file name prefix
 *                                 (done_/active_/planned_) matches the
 *                                 status icon in CONTEXT.md (✅/🔄/⬜).
 *   4. unique-cs-state         — each CS# appears in at most one of
 *                                 planned_/active_/done_ files.
 *   5. done-task-count         — ✅ rows with n/m where n<m must have a
 *                                 "Deferred" or "Will not be done" section.
 *   6. no-orphan-active-work   — WORKBOARD.md Active Work rows must not
 *                                 reference a CS# already marked ✅.
 *   7. workboard-stamp-fresh   — WORKBOARD.md "Last updated" stamp must be
 *                                 within 14 days of today (warn-only).
 *   8. state-in-vocabulary     — every Active Work `State` cell is one of
 *                                 the canonical states (CS44-1). Silent
 *                                 until the schema gains a State column.
 *   9. last-updated-iso8601    — every Active Work `Last Updated` cell
 *                                 parses as ISO 8601. Silent until the
 *                                 schema gains a Last Updated column.
 *  10. owner-in-orchestrators-table
 *                              — every Active Work `Owner` (or `Agent ID`)
 *                                 value appears in the Orchestrators
 *                                 table's agent-ID column.
 *
 * Escape hatch:`<!-- check:ignore <rule-name> -->` on the line itself or on
 * its own line above the next markdown block.
 *
 * Flags:
 *   --json     machine-readable output
 *   --strict   non-zero exit on errors (CS43-7 will flip CI to this)
 *   --root=P   override repo root (default: cwd)
 *
 * Exit codes: 0 always in default (warn-only) mode; 1 in --strict if any
 * finding has severity=error; 2 on internal/usage errors.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'coverage', 'dist', 'build',
  'test-results', 'playwright-report', '.vscode', '.idea',
]);

// Path fragments (POSIX) whose subtrees are skipped by the markdown walker.
// Test fixtures intentionally contain broken markdown to exercise the
// checker; running the checker against them at the repo level would just
// echo their failures.
const SKIP_PATH_FRAGMENTS = ['tests/fixtures'];

const STATUS_ICON = { '✅': 'done', '🔄': 'active', '⬜': 'planned' };
const PREFIX_FOR_STATE = { done: 'done_', active: 'active_', planned: 'planned_' };

// Canonical WORKBOARD Active Work states (CS44-1). The human-readable source
// of truth lives in INSTRUCTIONS.md § "WORKBOARD State Machine"; this
// constant is intentionally a duplicate so the checker has no parsing
// dependency on that file. Keep the two in sync.
const CANONICAL_STATES = [
  'claimed',
  'implementing',
  'validating',
  'pr_open',
  'local_review',
  'copilot_review',
  'ready_to_merge',
  'blocked',
];

// ---------- generic helpers ---------------------------------------------------

function walkMarkdown(root) {
  const out = [];
  const rootPosix = root.replace(/\\/g, '/');
  (function rec(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      if (SKIP_DIRS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      const rel = p.replace(/\\/g, '/').slice(rootPosix.length + 1);
      if (SKIP_PATH_FRAGMENTS.some(f => rel === f || rel.startsWith(f + '/'))) continue;
      if (e.isDirectory()) rec(p);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(p);
    }
  })(root);
  return out;
}

function readLines(p) {
  return fs.readFileSync(p, 'utf8').split(/\r?\n/);
}

function slugify(heading) {
  // GitHub-style: strip leading #s, lowercase, drop punctuation except `-`
  // and word chars, then map each whitespace char to a single `-` — note
  // runs of whitespace (e.g. where an em-dash was stripped leaving two
  // spaces around it) therefore become runs of hyphens, matching GitHub.
  return heading
    .replace(/^#+\s*/, '')
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s/g, '-');
}

function anchorsForFile(p) {
  const lines = readLines(p);
  const counts = new Map();
  const set = new Set();
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const base = slugify(m[1]);
    const n = counts.get(base) || 0;
    // GitHub: first occurrence is the bare slug, subsequent ones get -1, -2, ...
    set.add(n === 0 ? base : `${base}-${n}`);
    counts.set(base, n + 1);
  }
  return set;
}

const anchorCache = new Map();
function anchorsCached(p) {
  if (!anchorCache.has(p)) {
    try { anchorCache.set(p, anchorsForFile(p)); }
    catch { anchorCache.set(p, null); }
  }
  return anchorCache.get(p);
}

// Parse `<!-- check:ignore <rule> -->` directives. Inline (line has other
// content) → this line only. On its own line → next non-blank line block.
const IGNORE_RE = /<!--\s*check:ignore\s+([\w-]+)\s*-->/g;
const IGNORE_STRIP_RE = /<!--\s*check:ignore\s+[\w-]+\s*-->/g;

function parseIgnores(lines) {
  const ignores = []; // {rule, lines:Set<number>}
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const re = new RegExp(IGNORE_RE.source, 'g');
    let m;
    while ((m = re.exec(line)) !== null) {
      const rule = m[1];
      const stripped = line.replace(IGNORE_STRIP_RE, '').trim();
      const target = new Set();
      if (stripped.length > 0) {
        target.add(i + 1); // inline: this line (1-based)
      } else {
        // block: next non-blank line through next blank
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        while (j < lines.length && lines[j].trim() !== '') { target.add(j + 1); j++; }
      }
      ignores.push({ rule, lines: target });
    }
  }
  return ignores;
}

function isIgnored(ignores, rule, line) {
  for (const ig of ignores) {
    if (ig.rule !== rule) continue;
    if (line == null) { if (ig.lines.size === 0) return true; continue; }
    if (ig.lines.has(line)) return true;
  }
  return false;
}

// ---------- check 1: link-resolves -------------------------------------------

const LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function isExternal(url) {
  return /^(https?:|mailto:|tel:|ftp:)/i.test(url);
}

function checkLinkResolves(file, lines, ignores, repoRoot) {
  const findings = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    let m;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(line)) !== null) {
      const url = m[2].trim();
      if (!url || isExternal(url)) continue;
      if (url.startsWith('#')) {
        const slug = url.slice(1);
        const anchors = anchorsCached(file);
        if (anchors && !anchors.has(slug)) {
          findings.push({ rule: 'link-resolves', file, line: i + 1,
            severity: 'error', message: `in-page anchor #${slug} not found` });
        }
        continue;
      }
      // Strip query and split anchor.
      const [pathPartRaw, anchor] = url.split('#');
      const pathPart = pathPartRaw.split('?')[0];
      if (!pathPart) continue;
      const baseDir = path.dirname(file);
      const target = safeResolveInside(baseDir, repoRoot, pathPart);
      if (!target) {
        findings.push({ rule: 'link-resolves', file, line: i + 1,
          severity: 'error', message: `invalid or out-of-repo link → ${url}` });
        continue;
      }
      // Allow links to directories.
      let stat;
      try { stat = fs.statSync(target); } catch { stat = null; }
      if (!stat) {
        findings.push({ rule: 'link-resolves', file, line: i + 1,
          severity: 'error', message: `broken link → ${url}` });
        continue;
      }
      if (anchor && stat.isFile() && target.toLowerCase().endsWith('.md')) {
        const anchors = anchorsCached(target);
        if (anchors && !anchors.has(anchor)) {
          findings.push({ rule: 'link-resolves', file, line: i + 1,
            severity: 'error', message: `anchor #${anchor} not found in ${path.relative(repoRoot, target)}` });
        }
      }
    }
  }
  return findings.filter(f => !isIgnored(ignores, f.rule, f.line));
}

// ---------- CONTEXT.md / clickstop parsing -----------------------------------

function parseClickstopSummary(contextPath) {
  // Returns array of {cs:'CS17', state:'done', n, m, linkPath, line}
  const rows = [];
  if (!fs.existsSync(contextPath)) return rows;
  const lines = readLines(contextPath);
  let inSummary = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+Clickstop Summary/.test(line)) { inSummary = true; continue; }
    if (inSummary && /^##\s+/.test(line)) break;
    if (!inSummary) continue;
    const cells = line.split('|').map(s => s.trim());
    if (cells.length < 6) continue;
    const cs = cells[1];
    if (!/^CS\d+$/i.test(cs)) continue;
    const statusCell = cells[3];
    const tasksCell = cells[4];
    const linkCell = cells[5];
    let state = null;
    for (const ic of Object.keys(STATUS_ICON)) {
      if (statusCell.includes(ic)) { state = STATUS_ICON[ic]; break; }
    }
    const taskMatch = /(\d+)\s*\/\s*(\d+)/.exec(tasksCell);
    const linkMatch = /\(([^)]+)\)/.exec(linkCell);
    rows.push({
      cs: cs.toUpperCase(),
      state,
      n: taskMatch ? Number(taskMatch[1]) : null,
      m: taskMatch ? Number(taskMatch[2]) : null,
      linkPath: linkMatch ? linkMatch[1] : null,
      line: i + 1,
    });
  }
  return rows;
}

// ---------- check 2 & 3: clickstop link + prefix -----------------------------

function safeResolveInside(baseDir, repoRoot, rawPath) {
  // Return the resolved absolute path iff it decodes cleanly and stays under
  // repoRoot; otherwise return null. Guards against (a) malformed percent
  // escapes throwing URIError and (b) `../../..`-style traversal out of the
  // repository.
  let decoded;
  try { decoded = decodeURIComponent(rawPath); }
  catch { return null; }
  const abs = path.resolve(baseDir, decoded);
  const rootAbs = path.resolve(repoRoot);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) return null;
  return abs;
}

function resolveRelative(base, linkPath, repoRoot) {
  // Mirror of the path handling in checkLinkResolves so consumers of the
  // CONTEXT.md Clickstop Summary don't trip on fragment/query suffixes and
  // can't accidentally stat something outside the repo.
  const [pathPartRaw] = linkPath.split('#');
  const pathPart = pathPartRaw.split('?')[0];
  if (!pathPart) return null;
  return safeResolveInside(base, repoRoot, pathPart);
}

function checkClickstopLinksAndPrefix(repoRoot, rows, contextPath, ignores) {
  const findings = [];
  for (const r of rows) {
    if (!r.linkPath) {
      findings.push({ rule: 'clickstop-link-resolves', file: contextPath, line: r.line,
        severity: 'error', message: `${r.cs}: row missing details link` });
      continue;
    }
    const target = resolveRelative(path.dirname(contextPath), r.linkPath, repoRoot);
    if (!target || !fs.existsSync(target)) {
      findings.push({ rule: 'clickstop-link-resolves', file: contextPath, line: r.line,
        severity: 'error', message: `${r.cs}: link does not resolve → ${r.linkPath}` });
      continue;
    }
    const expected = r.state ? PREFIX_FOR_STATE[r.state] : null;
    const base = path.basename(target);
    if (expected && !base.startsWith(expected)) {
      findings.push({ rule: 'prefix-matches-status', file: contextPath, line: r.line,
        severity: 'error',
        message: `${r.cs}: status ${r.state} expects prefix '${expected}*' but file is '${base}'` });
    }
  }
  return findings.filter(f => !isIgnored(ignores, f.rule, f.line));
}

// ---------- check 4: unique-cs-state -----------------------------------------

function checkUniqueCsState(repoRoot) {
  const findings = [];
  const dirs = [
    'project/clickstops',          // root: should be empty of clickstop files post-CS43-5
    'project/clickstops/planned',
    'project/clickstops/active',
    'project/clickstops/done',
  ];
  const map = new Map(); // CS# → [{file, prefix}]
  for (const d of dirs) {
    const full = path.join(repoRoot, d);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      const m = /^(done|active|planned)_(cs\d+)_/i.exec(name);
      if (!m) continue;
      const cs = m[2].toUpperCase();
      const arr = map.get(cs) || [];
      arr.push({ file: path.join(full, name), prefix: m[1].toLowerCase() });
      map.set(cs, arr);
    }
  }
  for (const [cs, arr] of map) {
    const states = new Set(arr.map(a => a.prefix));
    if (states.size > 1) {
      for (const a of arr) {
        // Emit on the first non-blank content line so an own-line
        // `<!-- check:ignore unique-cs-state -->` placed above it (per the
        // documented block-scope semantics of the escape hatch) suppresses
        // this finding.
        let contentLine = 1;
        try {
          const lines = readLines(a.file);
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() !== '' && !/<!--/.test(lines[i])) { contentLine = i + 1; break; }
          }
        } catch { /* fall through with line=1 */ }
        findings.push({ rule: 'unique-cs-state', file: a.file, line: contentLine,
          severity: 'error',
          message: `${cs} appears in multiple states: ${[...states].sort().join(', ')}` });
      }
    }
  }
  // Per-file ignore: read each offending file's directives and filter.
  return findings.filter(f => {
    try {
      const ig = parseIgnores(readLines(f.file));
      return !isIgnored(ig, f.rule, f.line);
    } catch { return true; }
  });
}

// ---------- check 5: done-task-count -----------------------------------------

function checkDoneTaskCount(rows, contextPath, repoRoot, ignores) {
  const findings = [];
  for (const r of rows) {
    if (r.state !== 'done' || r.n == null || r.m == null) continue;
    if (r.n >= r.m) continue;
    let hasDeferred = false;
    if (r.linkPath) {
      const target = resolveRelative(path.dirname(contextPath), r.linkPath, repoRoot);
      if (target && fs.existsSync(target)) {
        const txt = fs.readFileSync(target, 'utf8');
        hasDeferred = /^#{1,6}\s+(deferred|will\s+not\s+be\s+done)/im.test(txt);
      }
    }
    if (!hasDeferred) {
      findings.push({ rule: 'done-task-count', file: contextPath, line: r.line,
        severity: 'error',
        message: `${r.cs}: marked ✅ with ${r.n}/${r.m} but linked file lacks Deferred / Will not be done section` });
    }
  }
  return findings.filter(f => !isIgnored(ignores, f.rule, f.line));
}

// ---------- check 6: no-orphan-active-work ----------------------------------

function checkNoOrphanActiveWork(repoRoot, rows) {
  const findings = [];
  const wbPath = path.join(repoRoot, 'WORKBOARD.md');
  if (!fs.existsSync(wbPath)) return findings;
  const lines = readLines(wbPath);
  const wbIgnores = parseIgnores(lines);
  const doneCs = new Set(rows.filter(r => r.state === 'done').map(r => r.cs));
  let inActive = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+Active Work/.test(line)) { inActive = true; continue; }
    if (inActive && /^##\s+/.test(line)) break;
    if (!inActive) continue;
    const cells = line.split('|').map(s => s.trim());
    if (cells.length < 3) continue;
    const csCell = cells[2];
    const m = /^CS\d+$/i.exec(csCell);
    if (!m) continue;
    const cs = csCell.toUpperCase();
    if (doneCs.has(cs)) {
      findings.push({ rule: 'no-orphan-active-work', file: wbPath, line: i + 1,
        severity: 'error',
        message: `Active Work row references ${cs} which is marked ✅ in CONTEXT.md` });
    }
  }
  return findings.filter(f => !isIgnored(wbIgnores, f.rule, f.line));
}

// ---------- check 7: workboard-stamp-fresh -----------------------------------

function checkWorkboardStampFresh(repoRoot, now) {
  const findings = [];
  const wbPath = path.join(repoRoot, 'WORKBOARD.md');
  if (!fs.existsSync(wbPath)) return findings;
  const lines = readLines(wbPath);
  const wbIgnores = parseIgnores(lines);
  for (let i = 0; i < lines.length; i++) {
    const m = /\*\*Last updated:\*\*\s+(\S+)/.exec(lines[i]);
    if (!m) continue;
    const stamp = new Date(m[1]);
    if (Number.isNaN(stamp.getTime())) {
      findings.push({ rule: 'workboard-stamp-fresh', file: wbPath, line: i + 1,
        severity: 'warning', message: `unparseable Last updated stamp: ${m[1]}` });
      break;
    }
    const days = Math.floor((now - stamp) / 86400000);
    if (days > 14) {
      findings.push({ rule: 'workboard-stamp-fresh', file: wbPath, line: i + 1,
        severity: 'warning', message: `Last updated ${days} days ago (>14)` });
    }
    break;
  }
  return findings.filter(f => !isIgnored(wbIgnores, f.rule, f.line));
}

// ---------- checks 8/9/10: WORKBOARD state-vocabulary, ISO 8601, owner ------
//
// All three rules are conditional: they activate only when the relevant
// columns exist in the WORKBOARD.md Active Work header. Until CS44-3
// upgrades the schema (today the columns are `Task ID | Clickstop |
// Description | Agent ID | Worktree | Branch | PR | Started`) these rules
// emit nothing.

function findSection(lines, headingRe) {
  // Returns {start, end} (0-based, end exclusive) for lines under a `##`
  // heading matching headingRe, or null. `end` is the next `##` or EOF.
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(lines[i])) { start = i + 1; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  return { start, end };
}

function parseMarkdownTable(lines, start, end) {
  // Find the first markdown table inside lines[start..end). Returns
  // { headers: [...], rows: [{cells, lineNo (1-based), raw}] } or null.
  let headerIdx = -1;
  for (let i = start; i < end - 1; i++) {
    const cur = lines[i];
    const next = lines[i + 1];
    if (/^\s*\|.*\|\s*$/.test(cur) && /^\s*\|[\s:|-]+\|\s*$/.test(next)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;
  const splitRow = (line) => {
    // Split on `|` that is not preceded by a backslash, then unescape `\|`.
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'));
  };
  const headers = splitRow(lines[headerIdx]);
  const rows = [];
  for (let i = headerIdx + 2; i < end; i++) {
    const line = lines[i];
    if (!/^\s*\|/.test(line)) break;
    rows.push({ cells: splitRow(line), lineNo: i + 1, raw: line });
  }
  return { headers, rows };
}

function colIndex(headers, predicate) {
  for (let i = 0; i < headers.length; i++) {
    if (predicate(headers[i])) return i;
  }
  return -1;
}

function getActiveWorkTable(lines) {
  const sec = findSection(lines, /^##\s+Active Work/);
  if (!sec) return null;
  return parseMarkdownTable(lines, sec.start, sec.end);
}

function getOrchestratorsTable(lines) {
  const sec = findSection(lines, /^##\s+Orchestrators/);
  if (!sec) return null;
  return parseMarkdownTable(lines, sec.start, sec.end);
}

function checkStateInVocabulary(wbPath, lines, ignores) {
  const findings = [];
  const tbl = getActiveWorkTable(lines);
  if (!tbl) return findings;
  const idx = colIndex(tbl.headers, h => /^state$/i.test(h));
  if (idx === -1) return findings; // schema not upgraded yet — silent.
  const allowed = new Set(CANONICAL_STATES);
  for (const row of tbl.rows) {
    const value = (row.cells[idx] || '').trim();
    if (!value) continue;
    if (!allowed.has(value)) {
      findings.push({
        rule: 'state-in-vocabulary', file: wbPath, line: row.lineNo,
        severity: 'error',
        message: `State '${value}' is not in canonical vocabulary (${CANONICAL_STATES.join(', ')})`,
      });
    }
  }
  return findings.filter(f => !isIgnored(ignores, f.rule, f.line));
}

// Strict-ish ISO 8601 date / date-time pattern. Accepts:
//   YYYY-MM-DD
//   YYYY-MM-DDTHH:mm[:ss[.fff]][Z|±HH:mm|±HHmm]
// Rejects locale/RFC-2822 strings that Date.parse() would otherwise accept.
const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function checkLastUpdatedIso8601(wbPath, lines, ignores) {
  const findings = [];
  const tbl = getActiveWorkTable(lines);
  if (!tbl) return findings;
  const idx = colIndex(tbl.headers, h => /^last\s*updated$/i.test(h));
  if (idx === -1) return findings; // silent until schema upgrade.
  for (const row of tbl.rows) {
    const value = (row.cells[idx] || '').trim();
    if (!value || value === '—' || value === '-') continue;
    if (!ISO_8601_RE.test(value) || Number.isNaN(Date.parse(value))) {
      findings.push({
        rule: 'last-updated-iso8601', file: wbPath, line: row.lineNo,
        severity: 'error',
        message: `Last Updated value '${value}' is not parseable as ISO 8601`,
      });
    }
  }
  return findings.filter(f => !isIgnored(ignores, f.rule, f.line));
}

function checkOwnerInOrchestratorsTable(wbPath, lines, ignores) {
  const findings = [];
  const active = getActiveWorkTable(lines);
  if (!active) return findings;
  // Accept either the post-CS44-3 `Owner` column or today's `Agent ID`.
  const ownerIdx = colIndex(active.headers, h => /^(owner|agent\s*id)$/i.test(h));
  if (ownerIdx === -1) return findings;
  const orch = getOrchestratorsTable(lines);
  if (!orch) return findings;
  const orchIdx = colIndex(orch.headers, h => /^(agent\s*id|orchestrator|owner)$/i.test(h));
  if (orchIdx === -1) return findings;
  const known = new Set(orch.rows.map(r => (r.cells[orchIdx] || '').trim()).filter(Boolean));
  for (const row of active.rows) {
    const value = (row.cells[ownerIdx] || '').trim();
    if (!value || value === '—' || value === '-') continue;
    if (!known.has(value)) {
      findings.push({
        rule: 'owner-in-orchestrators-table', file: wbPath, line: row.lineNo,
        severity: 'error',
        message: `Owner '${value}' is not listed in the Orchestrators table`,
      });
    }
  }
  return findings.filter(f => !isIgnored(ignores, f.rule, f.line));
}

// ---------- main runner ------------------------------------------------------

function run(opts) {
  const repoRoot = path.resolve(opts.root || process.cwd());
  const now = opts.now || new Date();
  const findings = [];

  const mdFiles = walkMarkdown(repoRoot);
  for (const f of mdFiles) {
    const lines = readLines(f);
    const ignores = parseIgnores(lines);
    findings.push(...checkLinkResolves(f, lines, ignores, repoRoot));
  }

  const contextPath = path.join(repoRoot, 'CONTEXT.md');
  const rows = parseClickstopSummary(contextPath);
  const ctxIgnores = fs.existsSync(contextPath) ? parseIgnores(readLines(contextPath)) : [];
  findings.push(...checkClickstopLinksAndPrefix(repoRoot, rows, contextPath, ctxIgnores));
  findings.push(...checkUniqueCsState(repoRoot));
  findings.push(...checkDoneTaskCount(rows, contextPath, repoRoot, ctxIgnores));
  findings.push(...checkNoOrphanActiveWork(repoRoot, rows));
  findings.push(...checkWorkboardStampFresh(repoRoot, now));

  // CS44-5a: WORKBOARD state-vocabulary / ISO 8601 / owner-in-orchestrators.
  // All three are no-ops until CS44-3 upgrades the schema.
  const wbPath = path.join(repoRoot, 'WORKBOARD.md');
  if (fs.existsSync(wbPath)) {
    const wbLines = readLines(wbPath);
    const wbIgnores = parseIgnores(wbLines);
    findings.push(...checkStateInVocabulary(wbPath, wbLines, wbIgnores));
    findings.push(...checkLastUpdatedIso8601(wbPath, wbLines, wbIgnores));
    findings.push(...checkOwnerInOrchestratorsTable(wbPath, wbLines, wbIgnores));
  }

  // Normalise file paths to repo-relative for output stability.
  for (const f of findings) {
    if (f.file) f.file = path.relative(repoRoot, f.file).replace(/\\/g, '/');
  }
  return findings;
}

function formatText(findings) {
  const errors = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.filter(f => f.severity === 'warning').length;
  const byRule = new Map();
  for (const f of findings) {
    if (!byRule.has(f.rule)) byRule.set(f.rule, []);
    byRule.get(f.rule).push(f);
  }
  const out = [];
  for (const [rule, list] of [...byRule.entries()].sort()) {
    out.push(`\n[${rule}] (${list.length})`);
    for (const f of list) {
      const loc = f.line != null ? `${f.file}:${f.line}` : f.file;
      out.push(`  ${f.severity.toUpperCase()} ${loc} — ${f.message}`);
    }
  }
  out.push('');
  out.push(`${findings.length} findings (${errors} errors, ${warnings} warnings)`);
  return out.join('\n');
}

function parseArgs(argv) {
  const opts = { json: false, strict: false, root: null };
  for (const a of argv.slice(2)) {
    if (a === '--json') opts.json = true;
    else if (a === '--strict') opts.strict = true;
    else if (a.startsWith('--root=')) opts.root = a.slice(7);
    else if (a === '--help' || a === '-h') {
      console.log('usage: check-docs-consistency.js [--json] [--strict] [--root=DIR]');
      process.exit(0);
    } else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

if (require.main === module) {
  const opts = parseArgs(process.argv);
  const findings = run(opts);
  if (opts.json) {
    process.stdout.write(JSON.stringify({ findings }, null, 2) + '\n');
  } else {
    process.stdout.write(formatText(findings) + '\n');
  }
  const hasErrors = findings.some(f => f.severity === 'error');
  process.exit(opts.strict && hasErrors ? 1 : 0);
}

module.exports = { run, formatText, slugify, parseIgnores, parseClickstopSummary };
