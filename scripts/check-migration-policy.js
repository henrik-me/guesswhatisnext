#!/usr/bin/env node
/**
 * CS41-11 — Migration policy linter.
 *
 * Scans `server/db/migrations/NNN-*.js` for backward-incompat SQL patterns
 * that would break old server code running against the new schema during a
 * rolling deploy (the window between "migrations applied" and "all replicas
 * on new image"). Per INSTRUCTIONS.md § Database & Data: migrations are
 * additive / append-only by default; backward-incompat changes need an
 * expand-migrate-contract multi-PR plan (CS41-13) and an explicit override
 * comment that links to that plan.
 *
 * Patterns rejected (from the SQL extracted out of JS string/template
 * literals — JS comments and JS code outside strings are not scanned):
 *
 *   1. DROP COLUMN
 *   2. DROP TABLE <name>      (allowed: `IF EXISTS`, or part of the SQLite
 *                              table-rebuild idiom — see migration 006)
 *   3. RENAME COLUMN
 *   4. ALTER TABLE x RENAME TO y    (allowed: SQLite rebuild idiom where
 *                                    source name ends with `_new`)
 *   5. ADD [COLUMN] x ... NOT NULL  without DEFAULT in the same statement
 *   6. ALTER COLUMN ... NOT NULL    (always — type/nullability change is
 *                                    backward-incompat regardless of default)
 *   7. DROP FOREIGN KEY  /  DROP CONSTRAINT FK_*
 *
 * Override mechanism (modeled on scripts/check-docs-consistency.js's
 * `<!-- check:ignore <rule> -->` pattern):
 *
 *     // MIGRATION-POLICY-OVERRIDE: <reason ≥ 20 chars + URL or CS-link>
 *     await db.exec('ALTER TABLE x DROP COLUMN y');
 *
 *   - Or inline on the offending line (after the SQL string).
 *   - Reason must be ≥ 20 chars and contain either a URL (`http`) or a
 *     CS-link (e.g. `CS41-13`).
 *
 * Exit codes:
 *   0 — no violations OR every violation has a valid override comment.
 *   1 — at least one violation lacks a valid override (or has a malformed
 *       override).
 *
 * Wired into `npm test` so it runs in PR-time CI plus any local `npm test`.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'server', 'db', 'migrations');

// --------------------------------------------------------------------------
// JS source → SQL-only mask
// --------------------------------------------------------------------------
//
// Returns a string the same length as `source` where every character that
// is NOT inside a JS string literal (single-quoted, double-quoted, or
// template literal) has been replaced with a space — but newlines are
// preserved so character offsets map directly back to (line, col) in the
// original file. JS line and block comments are also blanked out so SQL
// keywords appearing in JSDoc / `// note: DROP COLUMN ...` text are not
// flagged.
//
// This is intentionally not a real JS parser. It handles enough of the JS
// lexer to be correct for migration files: strings, template literals
// (without `${…}` interpolation handling beyond ignoring nested code as
// non-string), and `//` / `/* */` comments.

function stripJsToSqlMask(source) {
  const out = new Array(source.length);
  for (let i = 0; i < out.length; i++) out[i] = source[i] === '\n' ? '\n' : ' ';

  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];

    // Line comment
    if (c === '/' && c2 === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') {
          // newline already preserved in `out`
        }
        i++;
      }
      i += 2;
      continue;
    }
    // String literal: ' or "
    if (c === "'" || c === '"') {
      const quote = c;
      i++;
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < n) {
          // copy the escaped char (and the backslash) verbatim into the mask
          out[i] = source[i] === '\n' ? '\n' : source[i];
          out[i + 1] = source[i + 1] === '\n' ? '\n' : source[i + 1];
          i += 2;
          continue;
        }
        if (source[i] === '\n') {
          // unterminated string spanning newline — bail by ending the
          // literal at the newline (matches JS behavior for ' and ")
          break;
        }
        out[i] = source[i];
        i++;
      }
      i++; // skip closing quote
      continue;
    }
    // Template literal
    if (c === '`') {
      i++;
      while (i < n && source[i] !== '`') {
        if (source[i] === '\\' && i + 1 < n) {
          out[i] = source[i] === '\n' ? '\n' : source[i];
          out[i + 1] = source[i + 1] === '\n' ? '\n' : source[i + 1];
          i += 2;
          continue;
        }
        // ${...} interpolation — leave the JS code as masked-out (spaces);
        // this avoids treating identifiers inside ${} as SQL keywords.
        if (source[i] === '$' && source[i + 1] === '{') {
          // skip to matching close brace, accounting for nesting
          let depth = 1;
          i += 2;
          while (i < n && depth > 0) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') depth--;
            // preserve newlines inside interpolation
            i++;
          }
          continue;
        }
        out[i] = source[i] === '\n' ? '\n' : source[i];
        i++;
      }
      i++; // skip closing backtick
      continue;
    }

    i++;
  }

  return out.join('');
}

// --------------------------------------------------------------------------
// SQL pattern detection
// --------------------------------------------------------------------------

// Each rule: { id, description, find: (sqlMask, fullMask) => Array<{offset,
// length, snippet}> }.

const NEWLINE_RE = /\n/g;
function offsetToLineCol(source, offset) {
  let line = 1;
  let lastNl = -1;
  NEWLINE_RE.lastIndex = 0;
  let m;
  while ((m = NEWLINE_RE.exec(source)) && m.index < offset) {
    line++;
    lastNl = m.index;
  }
  return { line, col: offset - lastNl };
}

function matchAll(re, text) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ index: m.index, match: m[0], groups: m });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

// Trim a SQL fragment to a one-line snippet for reporting.
function snippetAt(text, offset, length) {
  const start = Math.max(0, offset - 0);
  const end = Math.min(text.length, offset + length + 40);
  let s = text.substring(start, end);
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > 100) s = s.substring(0, 100) + '…';
  return s;
}

// Statement boundary: previous `;` (or start) → next `;` (or end).
function statementRange(text, offset) {
  let start = offset;
  while (start > 0 && text[start - 1] !== ';') start--;
  let end = offset;
  while (end < text.length && text[end] !== ';') end++;
  return { start, end, text: text.substring(start, end) };
}

const RULES = [
  {
    id: 'drop-column',
    description: 'DROP COLUMN is backward-incompat (old server still SELECTs it)',
    find(sql) {
      const re = /\bDROP\s+COLUMN\b/gi;
      return matchAll(re, sql).map((m) => ({
        offset: m.index,
        length: m.match.length,
        snippet: snippetAt(sql, m.index, m.match.length),
      }));
    },
  },
  {
    id: 'drop-table',
    description: 'DROP TABLE is backward-incompat (use IF EXISTS for cleanup or rebuild idiom)',
    find(sql) {
      // Match DROP TABLE that is NOT followed by IF EXISTS.
      const re = /\bDROP\s+TABLE\s+(?!IF\s+EXISTS\b)([A-Za-z_][\w]*)/gi;
      const out = [];
      for (const m of matchAll(re, sql)) {
        const tableName = m.groups[1];
        // SQLite rebuild idiom: a sibling `RENAME TO <tableName>` exists in
        // the same file means this DROP TABLE is part of the rebuild and is
        // legitimate (the data was first copied into <tableName>_new which
        // is then renamed back to <tableName>).
        const rebuildRe = new RegExp(
          `\\bRENAME\\s+TO\\s+${tableName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`,
          'i'
        );
        if (rebuildRe.test(sql)) continue;
        out.push({
          offset: m.index,
          length: m.match.length,
          snippet: snippetAt(sql, m.index, m.match.length),
        });
      }
      return out;
    },
  },
  {
    id: 'rename-column',
    description: 'RENAME COLUMN breaks old SELECT/INSERT/UPDATE statements',
    find(sql) {
      const re = /\bRENAME\s+COLUMN\b/gi;
      return matchAll(re, sql).map((m) => ({
        offset: m.index,
        length: m.match.length,
        snippet: snippetAt(sql, m.index, m.match.length),
      }));
    },
  },
  {
    id: 'rename-table',
    description: 'ALTER TABLE x RENAME TO y breaks old code (allowed only for *_new rebuild idiom)',
    find(sql) {
      const re = /\bALTER\s+TABLE\s+([A-Za-z_][\w]*)\s+RENAME\s+TO\s+([A-Za-z_][\w]*)/gi;
      const out = [];
      for (const m of matchAll(re, sql)) {
        const src = m.groups[1];
        // Allow the SQLite rebuild idiom: source name ends with `_new`.
        if (/_new$/i.test(src)) continue;
        out.push({
          offset: m.index,
          length: m.match.length,
          snippet: snippetAt(sql, m.index, m.match.length),
        });
      }
      return out;
    },
  },
  {
    id: 'not-null-without-default',
    description:
      'ADD COLUMN ... NOT NULL without DEFAULT breaks INSERT statements from old server code',
    find(sql) {
      // Find every NOT NULL whose enclosing statement also contains an
      // ADD [COLUMN] clause but NOT a DEFAULT clause.
      const notNullRe = /\bNOT\s+NULL\b/gi;
      const out = [];
      const seenStatements = new Set();
      for (const m of matchAll(notNullRe, sql)) {
        const stmt = statementRange(sql, m.index);
        if (seenStatements.has(stmt.start)) continue;
        const stmtText = stmt.text;
        // Only ALTER TABLE ... ADD ... statements are interesting here. CREATE
        // TABLE is a fresh table — old server didn't know about it, so adding
        // NOT NULL columns to it is fine.
        if (!/\bALTER\s+TABLE\b/i.test(stmtText)) continue;
        if (!/\bADD\b/i.test(stmtText)) continue;
        // If the statement also contains DEFAULT (or PRIMARY KEY which auto-
        // generates, or IDENTITY for MSSQL) it's safe.
        if (/\bDEFAULT\b/i.test(stmtText)) continue;
        if (/\bIDENTITY\s*\(/i.test(stmtText)) continue;
        if (/\bPRIMARY\s+KEY\b/i.test(stmtText)) continue;
        // Report at the ADD … NOT NULL location, not the statement start, so
        // override comments can sit right next to the offending line.
        out.push({
          offset: m.index,
          length: m.match.length,
          snippet: snippetAt(sql, stmt.start, stmt.end - stmt.start),
        });
        seenStatements.add(stmt.start);
      }
      return out;
    },
  },
  {
    id: 'alter-column-not-null',
    description: 'ALTER COLUMN ... NOT NULL changes nullability — backward-incompat',
    find(sql) {
      const re = /\bALTER\s+COLUMN\b[^;]*\bNOT\s+NULL\b/gi;
      return matchAll(re, sql).map((m) => ({
        offset: m.index,
        length: m.match.length,
        snippet: snippetAt(sql, m.index, m.match.length),
      }));
    },
  },
  {
    id: 'drop-foreign-key',
    description: 'DROP FOREIGN KEY / DROP CONSTRAINT FK_* removes referential integrity guarantees',
    find(sql) {
      const out = [];
      const re1 = /\bDROP\s+FOREIGN\s+KEY\b/gi;
      for (const m of matchAll(re1, sql)) {
        out.push({
          offset: m.index,
          length: m.match.length,
          snippet: snippetAt(sql, m.index, m.match.length),
        });
      }
      const re2 = /\bDROP\s+CONSTRAINT\s+FK_[A-Za-z0-9_]+/gi;
      for (const m of matchAll(re2, sql)) {
        out.push({
          offset: m.index,
          length: m.match.length,
          snippet: snippetAt(sql, m.index, m.match.length),
        });
      }
      return out;
    },
  },
];

// --------------------------------------------------------------------------
// Override comment parsing
// --------------------------------------------------------------------------

const OVERRIDE_RE = /MIGRATION-POLICY-OVERRIDE:\s*(.*?)(?:\*\/|$)/;

function findOverrideOnLine(rawLine) {
  const m = OVERRIDE_RE.exec(rawLine);
  if (!m) return null;
  const reason = m[1].trim();
  return { reason };
}

const URL_RE = /\bhttps?:\/\/\S+/i;
const CS_LINK_RE = /\bCS\d+(?:-\d+\w*)?\b/;

function validateOverrideReason(reason) {
  if (!reason || reason.length < 20) {
    return { ok: false, error: `reason too short (${reason ? reason.length : 0} chars, need ≥ 20)` };
  }
  if (!URL_RE.test(reason) && !CS_LINK_RE.test(reason)) {
    return { ok: false, error: 'reason must contain a URL or a CS-link (e.g. CS41-13)' };
  }
  return { ok: true };
}

// Look for an override comment on `line` (inline) or on `line - 1` (above).
function findOverride(rawLines, line) {
  for (const candidate of [line, line - 1]) {
    if (candidate < 1 || candidate > rawLines.length) continue;
    const raw = rawLines[candidate - 1];
    const found = findOverrideOnLine(raw);
    if (found) {
      const validation = validateOverrideReason(found.reason);
      return { presentOn: candidate, reason: found.reason, validation };
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// File scanning
// --------------------------------------------------------------------------

function listMigrationFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^[0-9]+.*\.js$/.test(f))
    .filter((f) => f !== 'index.js' && f !== '_tracker.js')
    .sort()
    .map((f) => path.join(dir, f));
}

function scanFile(file) {
  const source = fs.readFileSync(file, 'utf-8');
  const sql = stripJsToSqlMask(source);
  const rawLines = source.split('\n');

  const findings = [];
  for (const rule of RULES) {
    const matches = rule.find(sql);
    for (const m of matches) {
      const { line, col } = offsetToLineCol(source, m.offset);
      const override = findOverride(rawLines, line);
      findings.push({
        file,
        rule: rule.id,
        description: rule.description,
        line,
        col,
        snippet: m.snippet,
        override,
      });
    }
  }
  return findings;
}

function scanAll(dir) {
  const files = listMigrationFiles(dir);
  const allFindings = [];
  for (const f of files) {
    for (const finding of scanFile(f)) allFindings.push(finding);
  }
  return { files, findings: allFindings };
}

// --------------------------------------------------------------------------
// Reporting
// --------------------------------------------------------------------------

function formatFindings(findings, repoRoot) {
  const lines = [];
  let hardFailures = 0;
  for (const f of findings) {
    const rel = path.relative(repoRoot, f.file).replace(/\\/g, '/');
    let status;
    if (f.override) {
      if (f.override.validation.ok) {
        status = `OVERRIDE present on line ${f.override.presentOn}`;
      } else {
        status = `INVALID OVERRIDE on line ${f.override.presentOn}: ${f.override.validation.error}`;
        hardFailures++;
      }
    } else {
      status = 'NO OVERRIDE — POLICY VIOLATION';
      hardFailures++;
    }
    lines.push(`${rel}:${f.line}  [${f.rule}]  ${status}`);
    lines.push(`    ${f.description}`);
    lines.push(`    > ${f.snippet}`);
  }
  return { text: lines.join('\n'), hardFailures };
}

function main(argv) {
  const dir = MIGRATIONS_DIR;
  const { files, findings } = scanAll(dir);
  const { text, hardFailures } = formatFindings(findings, REPO_ROOT);
  if (findings.length === 0) {
    console.log(`check-migration-policy: ${files.length} migration file(s) scanned, no findings.`);
    return 0;
  }
  console.log(`check-migration-policy: ${files.length} migration file(s) scanned, ${findings.length} finding(s):`);
  console.log(text);
  if (hardFailures > 0) {
    console.error(`\ncheck-migration-policy: ${hardFailures} policy violation(s) without a valid override.`);
    console.error('See INSTRUCTIONS.md § Database & Data and CS41-13 for the expand-migrate-contract pattern.');
    return 1;
  }
  console.log('\ncheck-migration-policy: all findings have a valid MIGRATION-POLICY-OVERRIDE.');
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  // exported for tests
  stripJsToSqlMask,
  scanFile,
  scanAll,
  formatFindings,
  validateOverrideReason,
  findOverrideOnLine,
  RULES,
  MIGRATIONS_DIR,
  main,
};
