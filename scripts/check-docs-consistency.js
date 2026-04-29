#!/usr/bin/env node
/**
 * scripts/check-docs-consistency.js — CS43-2
 *
 * Pure Node (no deps) docs consistency checker. See INSTRUCTIONS.md
 * § Documentation Conventions and project/clickstops/active/active_cs43_*.md
 * (or project/clickstops/done/done_cs43_*.md once archived) for the why.
 *
 * Checks:
 *   New in CS67 (warn-only on landing — flipped to error after a soak
 *   window):
 *     - sub-agent-checklist-canonical — docs/sub-agent-checklist.md exists
 *         and OPERATIONS.md contains a markdown link resolving to it.
 *
 *   New in CS62 (warning by default; CS65-2 flips to error in --strict
 *   once the live planned/active baseline is clean, mirroring the CS43-2 /
 *   CS43-7 pattern):
 *     - clickstop-h1-matches-filename  — every file under
 *         project/clickstops/{planned,active}/ whose name matches
 *         `(planned|active)_cs<n>_<slug>.md` has an H1 of the form
 *         `# CSnn — Human Title` whose CSID matches the filename CSID and
 *         whose kebab-cased title matches the filename slug. Files under
 *         project/clickstops/done/ are excluded as historical archive files
 *         by the CS65-2 scope decision. Files in those directories that do
 *         NOT match the clickstop naming convention (e.g.
 *         `cs60-data-appendix.md`) are NOT covered by this rule — they are
 *         companion docs, not clickstop files.
 *     - workboard-title-matches-h1     — each Active Work row's Title cell
 *         (line 1, before the first <br>, ** stripped) equals the human
 *         title of its parent CS file's H1.
 *
 *   New in CS65 (warning by default; CS65-2 flips to error in --strict
 *   after the baseline soaks clean):
 *     - plan-has-depends-on           — each planned_/active_ CS plan file
 *         matching the clickstop filename convention has a `**Depends on:**`
 *         line between the H1 and the first `##` heading.
 *     - plan-has-parallel-safe-with   — same scope, requiring a
 *         `**Parallel-safe with:**` line in that frontmatter block.
 *     - plan-has-status-line          — same scope, requiring an exact
 *         status line: `⬜ Planned`, `🔄 In Progress`, `✅ Done`, or
 *         `🚫 Blocked`.
 *     - plan-has-required-sections    — same scope, requiring literal
 *         `## Acceptance` and `## Cross-references` sections after the
 *         frontmatter.
 *     - plan-task-id-format           — in any markdown table whose first
 *         column header is `Task ID`, every non-empty first-column cell must
 *         match `^CS\d+-\d+([a-z])?$`.
 *
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
 *                                 reference a CS# that already has a
 *                                 `done_cs<N>_*.md` file under
 *                                 `project/clickstops/done/`.
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
 *  11. active-row-stale        — WORKBOARD.md Active Work row whose
 *                                 `Last Updated` cell is > 24h old (warn).
 *                                 Conditional on the column existing.
 *  12. active-row-reclaimable  — same row > 7d old (error). Conditional on
 *                                 the column existing. (CS44-5b)
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

// CS62: WORKBOARD.md Active Work column-1 header is `CS-Task ID` (rename
// from the pre-CS62 `Task ID`). The regex tolerates a missing or
// whitespace separator so `CSTaskID` / `CS Task ID` also match.
const CS_TASK_ID_HEADER_RE = /^cs[-\s]*task\s*id$/i;

// CS62: clickstop H1 must be `# CSnn — Human Title` with a real em-dash
// (U+2014). `-` and `--` are not accepted; the rule is intentionally strict
// so that the H1 ↔ filename-slug check has a single canonical shape.
const CLICKSTOP_H1_RE = /^#\s+(CS\d+)\s+\u2014\s+(.+?)\s*$/i;
const CLICKSTOP_FILENAME_RE = /^(planned|active|done)_(cs\d+)_([a-z0-9-]+)\.md$/i;

const PLAN_STATUS_LINE_RE = /^\*\*Status:\*\* (⬜ Planned|🔄 In Progress|✅ Done|🚫 Blocked)$/;
const PLAN_DEPENDS_ON_RE = /^\*\*Depends on:\*\* .+$/;
const PLAN_PARALLEL_SAFE_WITH_RE = /^\*\*Parallel-safe with:\*\* .+$/;
const PLAN_TASK_ID_RE = /^CS\d+-\d+([a-z])?$/;

const STRICT_ERROR_RULES = new Set([
  'clickstop-h1-matches-filename',
  'workboard-title-matches-h1',
  'plan-has-depends-on',
  'plan-has-parallel-safe-with',
  'plan-has-status-line',
  'plan-has-required-sections',
  'plan-task-id-format',
]);

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
// Stale-lock thresholds for WORKBOARD.md Active Work rows. Source of truth:
// project/clickstops/active/active_cs44_workboard-state-machine.md (CS44-2,
// stale-lock policy). Keep these named constants so the policy doc and the
// checker stay in sync — bump here and in CS44-2 together.
const STALE_THRESHOLD_HOURS = 24;
const RECLAIMABLE_THRESHOLD_DAYS = 7;

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

// CS62: kebab-case a clickstop human title for comparison against the
// filename slug. Rules: lowercase, ampersand → `and`, runs of any
// non-alphanumeric chars collapse to a single `-`, leading/trailing `-`
// stripped. Must stay in lockstep with the slug rules used by humans
// when authoring the filename — see project/clickstops/ examples.
function kebabSlug(s) {
  return String(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseClickstopFilename(name) {
  const m = CLICKSTOP_FILENAME_RE.exec(name);
  if (!m) return null;
  return {
    state: m[1].toLowerCase(),
    cs: m[2].toUpperCase(),
    slug: m[3].toLowerCase(),
  };
}

function parseClickstopH1WithLine(text) {
  // Like parseClickstopH1 but also returns the 1-based line number where
  // the eligible-content line was found (used to anchor warnings so the
  // existing `<!-- check:ignore ... -->` block-scope semantics suppress
  // them when the directive is placed above the H1).
  const lines = String(text).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '') continue;
    if (/^<!--.*-->\s*$/.test(t)) continue;
    const m = CLICKSTOP_H1_RE.exec(lines[i]);
    if (m) return { cs: m[1].toUpperCase(), title: m[2].trim(), line: i + 1 };
    return { cs: null, title: null, line: i + 1 };
  }
  return null;
}

function parseClickstopH1(text) {
  // Returns { cs, title } from the first non-blank, non-comment line if it
  // matches CLICKSTOP_H1_RE; { cs:null, title:null } if such a line exists
  // but doesn't match (malformed); null if the file has no eligible content.
  // Leading blank lines and standalone HTML comment lines (e.g. an
  // `<!-- check:ignore ... -->` directive placed above the H1) are skipped
  // so authors can keep escape-hatch comments at the top of a CS file.
  const r = parseClickstopH1WithLine(text);
  if (!r) return null;
  return { cs: r.cs, title: r.title };
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
const IGNORE_RE = /<!--\s*check:ignore\s+([\w-]+)(?:\s+.*?)?\s*-->/g;
const IGNORE_STRIP_RE = /<!--\s*check:ignore\s+[\w-]+(?:\s+.*?)?\s*-->/g;

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

// The done-set is derived from the filesystem (`project/clickstops/done/`)
// rather than CONTEXT.md. The CONTEXT.md clickstop summary table was
// retired in favor of folder pointers; the filesystem is now the source of
// truth for clickstop status. The `rows` parameter is intentionally
// unused here (kept for signature stability and other table-dependent
// rules).
//
// CS62: reads the `CS-Task ID` column by header lookup (was: hard-coded
// `cells[2]` index, which depended on the pre-CS62 column order) and
// extracts the `^CS\d+` parent CSID for the done-set comparison. Rows
// whose `CS-Task ID` cell is empty are description-continuation rows and
// are skipped.
function checkNoOrphanActiveWork(repoRoot, _rows) {
  const findings = [];
  const wbPath = path.join(repoRoot, 'WORKBOARD.md');
  if (!fs.existsSync(wbPath)) return findings;
  const lines = readLines(wbPath);
  const wbIgnores = parseIgnores(lines);
  const tbl = getActiveWorkTable(lines);
  if (!tbl) return findings;
  const csTaskIdx = colIndex(tbl.headers, h => CS_TASK_ID_HEADER_RE.test(h));
  if (csTaskIdx === -1) return findings;
  const doneCs = new Set();
  const doneDir = path.join(repoRoot, 'project', 'clickstops', 'done');
  if (fs.existsSync(doneDir)) {
    for (const name of fs.readdirSync(doneDir)) {
      const m = /^done_(cs\d+)_.+\.md$/i.exec(name);
      if (m) doneCs.add(m[1].toUpperCase());
    }
  }
  for (const row of tbl.rows) {
    const csCell = (row.cells[csTaskIdx] || '').trim();
    if (!csCell) continue; // description-continuation row
    const m = /^(CS\d+)/i.exec(csCell);
    if (!m) continue;
    const cs = m[1].toUpperCase();
    if (doneCs.has(cs)) {
      findings.push({ rule: 'no-orphan-active-work', file: wbPath, line: row.lineNo,
        severity: 'error',
        message: `Active Work row references ${cs} which has a done_${cs.toLowerCase()}_*.md file under project/clickstops/done/` });
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
// columns exist in the WORKBOARD.md Active Work header. CS44-3 introduced
// `State`, `Last Updated`, `Owner`/`Agent ID`; CS62 renamed column 1 from
// `Task ID` to `CS-Task ID` and introduced description-continuation rows
// (rows whose `CS-Task ID` cell is blank). When the `CS-Task ID` column
// is present, every per-row check skips description-continuation rows.

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

function splitMarkdownRow(line) {
  // Split on `|` that is not preceded by a backslash, then unescape `\|`.
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'));
}

function parseMarkdownTable(lines, start, end) {
  // Find the first markdown table inside lines[start..end). Returns
  // { headers: [...], rows: [{cells, lineNo (1-based), raw}] } or null.
  return parseMarkdownTableMatching(lines, start, end, () => true);
}

function parseMarkdownTableMatching(lines, start, end, headerPredicate) {
  // Walk all markdown tables inside lines[start..end). Returns the first
  // table whose parsed headers satisfy `headerPredicate(headers)`, or null.
  // CS62 leading-table case: a notes/legend table may precede the real
  // Active Work data table; using the first-table-only `parseMarkdownTable`
  // would silently skip the data table. Callers that need the data table
  // specifically should use this with a header predicate.
  let i = start;
  while (i < end - 1) {
    const cur = lines[i];
    const next = lines[i + 1];
    if (/^\s*\|.*\|\s*$/.test(cur) && /^\s*\|[\s:|-]+\|\s*$/.test(next)) {
      const headers = splitMarkdownRow(cur);
      const rows = [];
      let j = i + 2;
      for (; j < end; j++) {
        const line = lines[j];
        if (!/^\s*\|/.test(line)) break;
        rows.push({ cells: splitMarkdownRow(line), lineNo: j + 1, raw: line });
      }
      if (headerPredicate(headers)) return { headers, rows };
      i = j; // continue scanning past this table
      continue;
    }
    i++;
  }
  return null;
}

function colIndex(headers, predicate) {
  for (let i = 0; i < headers.length; i++) {
    if (predicate(headers[i])) return i;
  }
  return -1;
}

function getActiveWorkTable(lines) {
  // CS62: the `## Active Work` section may contain a leading legend/notes
  // table before the real data table. Walk all tables in the section and
  // return the first one whose headers contain `CS-Task ID`, with a
  // sensible fallback to header sets that include both `State` and `Owner`
  // (or `Agent ID`) for forward-compat with future schema tweaks. Falls
  // back to the first-table-found as a last resort so existing fixtures
  // keep their behavior when no candidate matches.
  const sec = findSection(lines, /^##\s+Active Work/);
  if (!sec) return null;
  const byCsTaskId = parseMarkdownTableMatching(lines, sec.start, sec.end,
    (hs) => hs.some(h => CS_TASK_ID_HEADER_RE.test(h)));
  if (byCsTaskId) return byCsTaskId;
  const byStateOwner = parseMarkdownTableMatching(lines, sec.start, sec.end,
    (hs) => hs.some(h => /^state$/i.test(h)) &&
            hs.some(h => /^(owner|agent\s*id)$/i.test(h)));
  if (byStateOwner) return byStateOwner;
  return parseMarkdownTable(lines, sec.start, sec.end);
}

function getOrchestratorsTable(lines) {
  const sec = findSection(lines, /^##\s+Orchestrators/);
  if (!sec) return null;
  return parseMarkdownTable(lines, sec.start, sec.end);
}

function isDescriptionRow(cells, csTaskIdx) {
  // CS62: description-continuation rows are identified by a blank
  // `CS-Task ID` cell. When the column isn't present (csTaskIdx === -1)
  // we can't distinguish, so don't skip.
  if (csTaskIdx === -1) return false;
  const v = (cells[csTaskIdx] || '').trim();
  return v === '';
}

function checkStateInVocabulary(wbPath, lines, ignores) {
  const findings = [];
  const tbl = getActiveWorkTable(lines);
  if (!tbl) return findings;
  const idx = colIndex(tbl.headers, h => /^state$/i.test(h));
  if (idx === -1) return findings; // schema not upgraded yet — silent.
  const csTaskIdx = colIndex(tbl.headers, h => CS_TASK_ID_HEADER_RE.test(h));
  const allowed = new Set(CANONICAL_STATES);
  for (const row of tbl.rows) {
    if (isDescriptionRow(row.cells, csTaskIdx)) continue;
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
  const csTaskIdx = colIndex(tbl.headers, h => CS_TASK_ID_HEADER_RE.test(h));
  for (const row of tbl.rows) {
    if (isDescriptionRow(row.cells, csTaskIdx)) continue;
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
  // CS62 schema: `Owner` column. Pre-CS62 schemas used `Agent ID`; both
  // are accepted here so old fixtures still pass and so any drift in old
  // CS files surfaces the same way. The `Task ID` → `CS-Task ID`
  // header rename is hard-cut elsewhere (see CS_TASK_ID_HEADER_RE).
  const ownerIdx = colIndex(active.headers, h => /^(owner|agent\s*id)$/i.test(h));
  if (ownerIdx === -1) return findings;
  const orch = getOrchestratorsTable(lines);
  if (!orch) return findings;
  const orchIdx = colIndex(orch.headers, h => /^(agent\s*id|orchestrator|owner)$/i.test(h));
  if (orchIdx === -1) return findings;
  const known = new Set(orch.rows.map(r => (r.cells[orchIdx] || '').trim()).filter(Boolean));
  const csTaskIdx = colIndex(active.headers, h => CS_TASK_ID_HEADER_RE.test(h));
  for (const row of active.rows) {
    if (isDescriptionRow(row.cells, csTaskIdx)) continue;
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

// ---------- checks 11 & 12: active-row-stale / active-row-reclaimable -------
// CS44-5b. Threshold-based freshness check for individual Active Work rows.
// Conditional: only fires when the Active Work table has a `Last Updated`
// column (added by CS44-3 schema upgrade, now the canonical schema).
// CS62: column-1 header is `CS-Task ID` (renamed from `Task ID`); rows
// whose `CS-Task ID` cell is blank are description-continuation rows and
// are skipped.

function parseTableRow(line) {
  // A markdown table row: leading `|`, cells separated by `|`, trailing `|`.
  // Returns trimmed cells (without the leading/trailing empty strings) or
  // null if the line is not a table row. Splits on `|` not preceded by `\`
  // and unescapes `\|` so authors can include literal pipes inside cells
  // (e.g. inline regex / shell snippets in description-continuation rows).
  if (!line.includes('|')) return null;
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return stripped.split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'));
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every(c => /^:?-{3,}:?$/.test(c));
}

// Strict ISO-8601 gate. We only act on values matching the format the
// CS44-5a `last-updated-iso8601` rule will enforce, so anything looser
// (e.g. `2026/04/01 00:00Z`, which `Date.parse` happily accepts) stays
// silent here — CS44-5a owns the format-error signal, and acting on a
// loose parse would emit a misleading age. Allows `Z` or numeric offset
// (with or without colon) and optional seconds/fractional seconds.
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

function checkActiveRowFreshness(repoRoot, now) {
  const findings = [];
  const wbPath = path.join(repoRoot, 'WORKBOARD.md');
  if (!fs.existsSync(wbPath)) return findings;
  const lines = readLines(wbPath);
  const wbIgnores = parseIgnores(lines);

  // Walk the `## Active Work` section. Multiple tables may exist (e.g. an
  // example/note table before the real one); we treat each table independently
  // so that a leading non-Active-Work table doesn't silence the rule. A
  // "table" is a contiguous block of `|`-prefixed lines. The first row of
  // each block is its header; we only act on tables whose header includes a
  // `Last Updated` column.
  let inActive = false;
  let header = null;        // {idxLastUpdated, idxTaskId, idxOwner}
  let sawSeparator = false;
  let skipThisTable = false;

  const resetTableState = () => { header = null; sawSeparator = false; skipThisTable = false; };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+Active Work/.test(line)) { inActive = true; resetTableState(); continue; }
    if (inActive && /^##\s+/.test(line)) break;
    if (!inActive) continue;

    const cells = parseTableRow(line);
    if (!cells) {
      // Non-table line ends the current table block.
      if (line.trim() !== '' || header || skipThisTable) resetTableState();
      continue;
    }

    if (skipThisTable) continue;

    if (!header) {
      const idxLastUpdated = cells.findIndex(c => /^last\s*updated$/i.test(c));
      if (idxLastUpdated === -1) {
        // Not the Active Work data table — skip until block ends, then
        // resume looking for the real header in the next block.
        skipThisTable = true;
        continue;
      }
      const idxTaskId = cells.findIndex(c => CS_TASK_ID_HEADER_RE.test(c));
      let idxOwner = cells.findIndex(c => /^owner$/i.test(c));
      if (idxOwner === -1) idxOwner = cells.findIndex(c => /^agent\s*id$/i.test(c));
      header = { idxLastUpdated, idxTaskId, idxOwner };
      continue;
    }

    if (!sawSeparator) {
      if (isSeparatorRow(cells)) { sawSeparator = true; continue; }
      sawSeparator = true; // tolerate missing separator
    }

    // CS62: skip description-continuation rows (blank CS-Task ID cell).
    if (header.idxTaskId !== -1) {
      const tid = (cells[header.idxTaskId] || '').trim();
      if (tid === '') continue;
    }

    const cell = cells[header.idxLastUpdated];
    if (cell == null || cell === '' || cell === '—' || cell === '-') continue;
    if (!ISO8601_RE.test(cell)) continue;
    const ts = Date.parse(cell);
    if (Number.isNaN(ts)) continue;

    const ageMs = now.getTime() - ts;
    const ageHours = ageMs / 3600000;
    const ageDays = ageMs / 86400000;
    const taskId = header.idxTaskId !== -1 ? cells[header.idxTaskId] : '(unknown task)';
    const owner = header.idxOwner !== -1 ? cells[header.idxOwner] : '(unknown owner)';

    if (ageDays > RECLAIMABLE_THRESHOLD_DAYS) {
      findings.push({
        rule: 'active-row-reclaimable', file: wbPath, line: i + 1,
        severity: 'error',
        message: `${taskId} (owner ${owner}): Last Updated ${ageDays.toFixed(1)}d ago (>${RECLAIMABLE_THRESHOLD_DAYS}d) — reclaimable per CS44-2`,
      });
    }
    if (ageHours > STALE_THRESHOLD_HOURS) {
      findings.push({
        rule: 'active-row-stale', file: wbPath, line: i + 1,
        severity: 'warning',
        message: `${taskId} (owner ${owner}): Last Updated ${ageHours.toFixed(1)}h ago (>${STALE_THRESHOLD_HOURS}h) — stale per CS44-2`,
      });
    }
  }

  return findings.filter(f => !isIgnored(wbIgnores, f.rule, f.line));
}

// ---------- CS62: clickstop-h1-matches-filename (strict-scoped) -------------

function checkClickstopH1MatchesFilename(repoRoot) {
  const findings = [];
  for (const sub of ['planned', 'active']) {
    const dir = path.join(repoRoot, 'project', 'clickstops', sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.toLowerCase().endsWith('.md')) continue;
      const file = path.join(dir, name);
      const parsed = parseClickstopFilename(name);
      if (!parsed) continue;
      let text;
      try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      const h1 = parseClickstopH1WithLine(text);
      if (!h1) {
        findings.push({ rule: 'clickstop-h1-matches-filename', file, line: 1,
          severity: 'warning',
          message: `file is empty; expected H1 of the form '# CSnn — Human Title'` });
        continue;
      }
      const lineNo = h1.line;
      if (!h1.cs || !h1.title) {
        findings.push({ rule: 'clickstop-h1-matches-filename', file, line: lineNo,
          severity: 'warning',
          message: `malformed H1 — expected '# CSnn — Human Title' with a real em-dash (\u2014)` });
        continue;
      }
      if (h1.cs.toUpperCase() !== parsed.cs.toUpperCase()) {
        findings.push({ rule: 'clickstop-h1-matches-filename', file, line: lineNo,
          severity: 'warning',
          message: `H1 CSID '${h1.cs}' does not match filename CSID '${parsed.cs}'` });
      }
      const expectedSlug = kebabSlug(h1.title);
      if (expectedSlug !== parsed.slug) {
        findings.push({ rule: 'clickstop-h1-matches-filename', file, line: lineNo,
          severity: 'warning',
          message: `filename slug '${parsed.slug}' does not match kebab-cased H1 title '${expectedSlug}'` });
      }
    }
  }
  // Per-file ignore: read each file's directives and filter.
  return findings.filter(f => {
    try {
      const ig = parseIgnores(readLines(f.file));
      return !isIgnored(ig, f.rule, f.line);
    } catch { return true; }
  });
}

// ---------- CS65: plan-file schema rules (strict-scoped) --------------------

function findPlanClickstopFiles(repoRoot) {
  const out = [];
  for (const sub of ['planned', 'active']) {
    const dir = path.join(repoRoot, 'project', 'clickstops', sub);
    if (!fs.existsSync(dir)) continue;
    let names;
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.md')) continue;
      const parsed = parseClickstopFilename(name);
      if (!parsed || parsed.state !== sub) continue;
      out.push(path.join(dir, name));
    }
  }
  return out;
}

function getPlanFrontmatterRange(lines) {
  const text = lines.join('\n');
  const h1 = parseClickstopH1WithLine(text);
  const start = h1 ? h1.line : 0;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  return { start, end, line: h1 ? h1.line : 1 };
}

function checkPlanFrontmatterLine(file, lines, ignores, rule, requiredRe, label, candidateRe) {
  const findings = [];
  const range = getPlanFrontmatterRange(lines);
  for (let i = range.start; i < range.end; i++) {
    if (requiredRe.test(lines[i])) return findings;
  }
  let line = range.line;
  if (candidateRe) {
    for (let i = range.start; i < range.end; i++) {
      if (candidateRe.test(lines[i])) { line = i + 1; break; }
    }
  }
  findings.push({
    rule, file, line,
    severity: 'warning',
    message: `missing valid ${label} line in clickstop frontmatter before the first ## heading`,
  });
  return findings.filter(f => !isIgnored(ignores, f.rule, f.line));
}

function hasLiteralHeading(lines, heading) {
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (line === heading) return true;
  }
  return false;
}

function checkPlanRequiredSections(file, lines, ignores) {
  const missing = [];
  if (!hasLiteralHeading(lines, '## Acceptance')) missing.push('## Acceptance');
  if (!hasLiteralHeading(lines, '## Cross-references')) missing.push('## Cross-references');
  if (missing.length === 0) return [];
  const range = getPlanFrontmatterRange(lines);
  const findings = [{
    rule: 'plan-has-required-sections', file, line: range.line,
    severity: 'warning',
    message: `missing required section(s): ${missing.join(', ')}`,
  }];
  return findings.filter(f => !isIgnored(ignores, f.rule, f.line));
}

function checkPlanTaskIdFormat(file, lines, ignores) {
  const findings = [];
  let inFence = false;
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\s*```/.test(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    const cur = lines[i];
    const next = lines[i + 1];
    if (!/^\s*\|.*\|\s*$/.test(cur) || !/^\s*\|[\s:|-]+\|\s*$/.test(next)) continue;
    const headers = splitMarkdownRow(cur);
    if (!headers[0] || !/^task\s*id$/i.test(headers[0])) continue;
    let j = i + 2;
    for (; j < lines.length; j++) {
      const line = lines[j];
      if (!/^\s*\|/.test(line)) break;
      const cells = splitMarkdownRow(line);
      const taskId = (cells[0] || '').trim();
      if (!taskId || /^task\s*id$/i.test(taskId) || /^:?-{3,}:?$/.test(taskId)) continue;
      if (!PLAN_TASK_ID_RE.test(taskId)) {
        findings.push({
          rule: 'plan-task-id-format', file, line: j + 1,
          severity: 'warning',
          message: `Task ID '${taskId}' must match ^CS\\d+-\\d+([a-z])?$`,
        });
      }
    }
    i = j - 1;
  }
  return findings.filter(f => !isIgnored(ignores, f.rule, f.line));
}

function checkPlanFileSchema(repoRoot) {
  const findings = [];
  for (const file of findPlanClickstopFiles(repoRoot)) {
    const lines = readLines(file);
    const ignores = parseIgnores(lines);
    findings.push(...checkPlanFrontmatterLine(file, lines, ignores,
      'plan-has-depends-on', PLAN_DEPENDS_ON_RE, '`**Depends on:** ...`', /^\*\*Depends on:\*\*/));
    findings.push(...checkPlanFrontmatterLine(file, lines, ignores,
      'plan-has-parallel-safe-with', PLAN_PARALLEL_SAFE_WITH_RE, '`**Parallel-safe with:** ...`', /^\*\*Parallel-safe with:\*\*/));
    findings.push(...checkPlanFrontmatterLine(file, lines, ignores,
      'plan-has-status-line', PLAN_STATUS_LINE_RE, '`**Status:** ...`', /^\*\*Status:\*\*/));
    findings.push(...checkPlanRequiredSections(file, lines, ignores));
    findings.push(...checkPlanTaskIdFormat(file, lines, ignores));
  }
  return findings;
}

// ---------- CS62: workboard-title-matches-h1 (warn-only) --------------------

function findClickstopFilesByCs(repoRoot, cs) {
  // Returns ALL matching files for cs across {planned,active,done}.
  // Caller decides how to handle 0/1/>1 matches.
  const out = [];
  const csLower = String(cs).toLowerCase();
  for (const sub of ['planned', 'active', 'done']) {
    const dir = path.join(repoRoot, 'project', 'clickstops', sub);
    if (!fs.existsSync(dir)) continue;
    let names;
    try { names = fs.readdirSync(dir); } catch { continue; }
    const re = new RegExp(`^(planned|active|done)_${csLower}_.+\\.md$`, 'i');
    for (const n of names) {
      if (re.test(n)) out.push(path.join(dir, n));
    }
  }
  return out;
}

function extractTitleCellLine1(cellRaw) {
  // Title cell is multi-line `**Title**<br>WT: ...<br>B:&nbsp; ...`.
  // Take the substring before the first `<br>`, strip surrounding `**`,
  // and trim leading/trailing whitespace.
  const firstSegment = String(cellRaw).split(/<br\s*\/?>/i)[0];
  let s = firstSegment.trim();
  // Strip a single wrapping pair of `**...**` if present.
  const m = /^\*\*(.*)\*\*$/s.exec(s);
  if (m) s = m[1];
  // Strip any leftover stray `**` (shouldn't happen for well-formed cells).
  s = s.replace(/\*\*/g, '');
  return s.trim();
}

function checkWorkboardTitleMatchesH1(repoRoot, lines, wbPath, ignores) {
  const findings = [];
  const tbl = getActiveWorkTable(lines);
  if (!tbl) return findings;
  const csTaskIdx = colIndex(tbl.headers, h => CS_TASK_ID_HEADER_RE.test(h));
  const titleIdx = colIndex(tbl.headers, h => /^title$/i.test(h));
  if (csTaskIdx === -1 || titleIdx === -1) return findings;
  for (const row of tbl.rows) {
    const taskIdCell = (row.cells[csTaskIdx] || '').trim();
    if (!taskIdCell) continue; // description-continuation row
    const csMatch = /^(CS\d+)/i.exec(taskIdCell);
    if (!csMatch) continue;
    const cs = csMatch[1].toUpperCase();
    const matches = findClickstopFilesByCs(repoRoot, cs);
    if (matches.length > 1) {
      const rels = matches.map(m => path.relative(repoRoot, m).replace(/\\/g, '/')).join(', ');
      findings.push({ rule: 'workboard-title-matches-h1', file: wbPath, line: row.lineNo,
        severity: 'warning',
        message: `${taskIdCell}: ambiguous — ${matches.length} clickstop files match ${cs}: ${rels}. Resolve by deleting/renaming duplicates; H1 comparison is skipped until the ambiguity is resolved.` });
      continue; // short-circuit: don't compare against an arbitrary first match
    }
    const file = matches[0] || null;
    if (!file) {
      findings.push({ rule: 'workboard-title-matches-h1', file: wbPath, line: row.lineNo,
        severity: 'warning',
        message: `${taskIdCell}: no clickstop file found for ${cs} under project/clickstops/{active,planned,done}/` });
      continue;
    }
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const h1 = parseClickstopH1(text);
    if (!h1 || !h1.title) continue; // H1 issues are reported by the sibling rule
    const titleCell = (row.cells[titleIdx] || '').trim();
    const line1 = extractTitleCellLine1(titleCell);
    if (line1 !== h1.title.trim()) {
      const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
      findings.push({ rule: 'workboard-title-matches-h1', file: wbPath, line: row.lineNo,
        severity: 'warning',
        message: `${taskIdCell}: Title cell '${line1}' does not match H1 of ${rel} ('${h1.title}')` });
    }
  }
  return findings.filter(f => !isIgnored(ignores, f.rule, f.line));
}

// ---------- CS67: sub-agent-checklist-canonical (warn-only) ------------------

function checkSubAgentChecklistCanonical(repoRoot) {
  const findings = [];
  const operationsPath = path.join(repoRoot, 'OPERATIONS.md');
  const checklistPath = path.join(repoRoot, 'docs', 'sub-agent-checklist.md');
  const instructionsPath = path.join(repoRoot, 'INSTRUCTIONS.md');

  const hasOperations = fs.existsSync(operationsPath);
  const hasChecklist = fs.existsSync(checklistPath);
  const hasRootPolicyMarker = fs.existsSync(instructionsPath) || fs.existsSync(path.join(repoRoot, 'package.json'));
  if (!hasOperations && !hasChecklist && !hasRootPolicyMarker) return findings;

  let operationsLines = [];
  let checklistHeadingLine = 1;
  let canonicalLinkLine = null;
  if (fs.existsSync(operationsPath)) {
    operationsLines = readLines(operationsPath);
    const headingIdx = operationsLines.findIndex(line => /Sub-Agent Checklist/i.test(line));
    if (headingIdx !== -1) checklistHeadingLine = headingIdx + 1;
  }

  const problems = [];
  if (!fs.existsSync(checklistPath)) {
    problems.push('docs/sub-agent-checklist.md does not exist');
  }

  if (!fs.existsSync(operationsPath)) {
    problems.push('OPERATIONS.md does not exist');
  } else {
    let hasCanonicalLink = false;
    for (let i = 0; i < operationsLines.length; i++) {
      const line = operationsLines[i];
      LINK_RE.lastIndex = 0;
      let m;
      while ((m = LINK_RE.exec(line)) !== null) {
        const url = m[2].trim();
        if (!url || isExternal(url) || url.startsWith('#')) continue;
        const [pathPartRaw] = url.split('#');
        const pathPart = pathPartRaw.split('?')[0];
        const target = safeResolveInside(path.dirname(operationsPath), repoRoot, pathPart);
        if (target && path.resolve(target) === path.resolve(checklistPath)) {
          hasCanonicalLink = true;
          canonicalLinkLine = i + 1;
          break;
        }
      }
      if (hasCanonicalLink) break;
    }
    if (!hasCanonicalLink) {
      problems.push('OPERATIONS.md does not contain a markdown link resolving to docs/sub-agent-checklist.md');
    }
  }

  if (problems.length > 0) {
    const firstEligibleLine = (filePath) => {
      const lines = readLines(filePath);
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (t === '') continue;
        if (/^<!--.*-->\s*$/.test(t)) continue;
        return i + 1;
      }
      return 1;
    };
    const fallbackPath = fs.existsSync(instructionsPath) ? instructionsPath : path.join(repoRoot, 'package.json');
    const file = fs.existsSync(operationsPath) ? operationsPath : (fs.existsSync(checklistPath) ? checklistPath : fallbackPath);
    const line = fs.existsSync(operationsPath) ?
      (canonicalLinkLine || checklistHeadingLine) : (fs.existsSync(checklistPath) ? firstEligibleLine(checklistPath) : 1);
    findings.push({
      rule: 'sub-agent-checklist-canonical', file, line,
      severity: 'warning',
      message: problems.join('; '),
    });
  }
  return findings.filter(f => {
    try {
      const ignores = parseIgnores(readLines(f.file));
      return !isIgnored(ignores, f.rule, f.line);
    } catch { return true; }
  });
}

// ---------- main runner ------------------------------------------------------

function run(opts) {
  const repoRoot = path.resolve(opts.root || process.cwd());
  // `now` injection: opts.now (programmatic) > CHECK_DOCS_NOW_OVERRIDE env
  // var (test harness convenience) > real wall clock. The env var exists so
  // fixture timestamps in tests/fixtures/ can stay deterministic without
  // every caller threading `now` through manually. Tests only — do not set
  // this in production CI.
  let now = opts.now;
  if (!now && process.env.CHECK_DOCS_NOW_OVERRIDE) {
    const parsed = new Date(process.env.CHECK_DOCS_NOW_OVERRIDE);
    if (!Number.isNaN(parsed.getTime())) now = parsed;
  }
  if (!now) now = new Date();
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
  findings.push(...checkActiveRowFreshness(repoRoot, now));

  // CS44-5a: WORKBOARD state-vocabulary / ISO 8601 / owner-in-orchestrators.
  // CS62: also runs the new warn-only `workboard-title-matches-h1` rule
  // against the same Active Work table.
  const wbPath = path.join(repoRoot, 'WORKBOARD.md');
  if (fs.existsSync(wbPath)) {
    const wbLines = readLines(wbPath);
    const wbIgnores = parseIgnores(wbLines);
    findings.push(...checkStateInVocabulary(wbPath, wbLines, wbIgnores));
    findings.push(...checkLastUpdatedIso8601(wbPath, wbLines, wbIgnores));
    findings.push(...checkOwnerInOrchestratorsTable(wbPath, wbLines, wbIgnores));
    findings.push(...checkWorkboardTitleMatchesH1(repoRoot, wbLines, wbPath, wbIgnores));
  }

  // CS62: clickstop H1 ↔ filename consistency.
  findings.push(...checkClickstopH1MatchesFilename(repoRoot));

  // CS65: plan-file schema checks for planned_/active_ clickstops.
  findings.push(...checkPlanFileSchema(repoRoot));

  // CS67: canonical sub-agent checklist presence/link rule (warn-only).
  findings.push(...checkSubAgentChecklistCanonical(repoRoot));

  if (opts.strict) {
    for (const f of findings) {
      if (STRICT_ERROR_RULES.has(f.rule)) f.severity = 'error';
    }
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

module.exports = { run, formatText, slugify, kebabSlug, parseIgnores, parseClickstopSummary, parseClickstopFilename, parseClickstopH1 };
