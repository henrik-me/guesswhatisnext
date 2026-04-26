#!/usr/bin/env node
/**
 * CS40-5 — Feature flag policy guard.
 *
 * Two policies enforced (each with a narrow, justified scope so legitimate
 * rollout configuration is never flagged):
 *
 *   POLICY 1 — `FEATURE_FLAG_ALLOW_OVERRIDE` must NEVER be truthy in
 *              live-deploy assets. The override flag is a test/dev affordance
 *              (see INSTRUCTIONS.md "Feature flag testing across environments").
 *              Letting it ship to the real production app or the live ACA
 *              container template would let any visitor toggle features via
 *              query string.
 *
 *              Live-deploy assets scanned:
 *                - .github/workflows/prod-deploy.yml
 *                - infra/deploy.sh
 *                - infra/deploy.ps1
 *                - infra/**\/*.bicep
 *                - infra/**\/*.json    (Container App ARM/JSON templates)
 *
 *              Detection covers two assignment shapes:
 *                - single-line `KEY=value` / `KEY: value` (shell, dotenv, YAML)
 *                - ARM/Bicep env-object form `{ name: 'KEY', value: 'value' }`
 *                  where name and value sit on separate lines (.json via
 *                  structural parse; .bicep via name+value regex pair).
 *
 *   POLICY 2 — `FEATURE_<KEY>_PERCENTAGE=100` (the deprecated blunt-enable
 *              E2E workaround from CS25; see CS40 origin notes) must NOT
 *              appear in test-oriented configs. Real production rollouts
 *              live in prod-deploy.yml / ACA templates and ANY value 0-100
 *              is legitimate there — this policy intentionally does NOT
 *              scan live-deploy assets.
 *
 *              Test-oriented files scanned:
 *                - tests/**\/*
 *                - docker-compose*.yml (root)
 *                - .github/workflows/**\/*.yml  (excluding prod-deploy.yml,
 *                  which is a live-deploy asset and covered by Policy 1's
 *                  override scan only)
 *
 * Each violation is reported as `file:line  <message>` and the script exits
 * 1 on any finding. Zero findings → exits 0. No external dependencies.
 *
 * Wired into `npm test` via `package.json` so it runs in PR-time CI plus
 * any local `npm test` invocation.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

// --------------------------------------------------------------------------
// File-list helpers
// --------------------------------------------------------------------------

function existsRel(relPath) {
  return fs.existsSync(path.join(REPO_ROOT, relPath));
}

function listFilesRecursive(relDir, predicate) {
  const abs = path.join(REPO_ROOT, relDir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const stack = [abs];
  while (stack.length > 0) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        // Skip node_modules just in case the script is run somewhere weird.
        if (ent.name === 'node_modules' || ent.name === '.git') continue;
        stack.push(full);
        continue;
      }
      if (predicate(full)) {
        out.push(path.relative(REPO_ROOT, full).replace(/\\/g, '/'));
      }
    }
  }
  return out;
}

function listRootDockerComposeFiles() {
  return fs.readdirSync(REPO_ROOT)
    .filter((name) => /^docker-compose.*\.ya?ml$/i.test(name))
    .map((name) => name);
}

// --------------------------------------------------------------------------
// Scanners
// --------------------------------------------------------------------------

// Single source of truth for the truthy-token list. Both the regex
// alternation (`TRUTHY_TOKEN`, used by single-line scanners) and the Set
// (`TRUTHY_VALUES`, used by the structural JSON walker) are derived from
// this array so the two scan paths cannot drift if the list is ever
// updated.
const TRUTHY_TOKENS = ['true', 'yes', 'on', '1', 'enable', 'enabled'];
const TRUTHY_TOKEN = `(${TRUTHY_TOKENS.join('|')})`;

// Match `FEATURE_FLAG_ALLOW_OVERRIDE` followed by `=` (shell / dotenv) or
// `:` (YAML), optional quotes, then a truthy token. The `i` flag makes the
// ENTIRE pattern case-insensitive — both the flag name and the truthy token.
// This is intentional: real env-var assignments use the canonical uppercase
// name, but if a config file or doc fragment writes the same assignment in
// lowercase (e.g. `feature_flag_allow_override=true`) it is still a policy
// violation worth flagging.
//
// `^(?!\s*(#|//))` rejects lines whose first non-whitespace is `#` (shell /
// YAML comment) or `//` (JS/JSON-with-comments) so commented-out config and
// documentation comments don't trigger violations.
const OVERRIDE_TRUTHY_RE = new RegExp(
  String.raw`^(?!\s*(#|\/\/)).*FEATURE_FLAG_ALLOW_OVERRIDE\s*[=:]\s*"?'?` + TRUTHY_TOKEN + String.raw`['"]?\b`,
  'i',
);

// ARM/Bicep Container App env entries use the object form
//   { name: 'FEATURE_FLAG_ALLOW_OVERRIDE', value: 'true' }
// where `name` and `value` typically sit on separate lines. The single-line
// `OVERRIDE_TRUTHY_RE` above misses this entirely. We detect it two ways:
//   - .json templates: structural JSON.parse + walk (precise, no false positives)
//   - .bicep templates: regex pair (no native bicep parser available)
const TRUTHY_VALUES = new Set(TRUTHY_TOKENS);

function isTruthyEnvValue(v) {
  if (v === true || v === 1) return true;
  if (typeof v !== 'string') return false;
  return TRUTHY_VALUES.has(v.trim().toLowerCase());
}

// Walk an arbitrary JSON value looking for objects shaped like
// `{ name: 'FEATURE_FLAG_ALLOW_OVERRIDE', value: <truthy> }`. Returns true on
// first hit; the caller does not need a count, only a finding.
function jsonHasOverrideTruthy(node) {
  if (node === null || typeof node !== 'object') return false;
  if (Array.isArray(node)) {
    for (const item of node) {
      if (jsonHasOverrideTruthy(item)) return true;
    }
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(node, 'name')
    && Object.prototype.hasOwnProperty.call(node, 'value')
    && node.name === 'FEATURE_FLAG_ALLOW_OVERRIDE'
    && isTruthyEnvValue(node.value)
  ) {
    return true;
  }
  for (const k of Object.keys(node)) {
    if (jsonHasOverrideTruthy(node[k])) return true;
  }
  return false;
}

// Bicep regex pair: locate name+value lines for the override flag within
// the SAME object literal `{ ... }`. We accept either property ordering
// (Bicep does not enforce a name-before-value convention) by checking both
// directions, and we constrain the pairing to the enclosing braces so that
// a truthy value in a *neighbouring* env object cannot create a false
// positive on a falsy override entry.
const BICEP_NAME_RE = /\bname\b\s*:\s*['"]FEATURE_FLAG_ALLOW_OVERRIDE['"]/;
// Require either a closing quote (when quoted) or a word boundary (when
// unquoted) after the truthy token so values like `'trueish'` or `100` do
// NOT match the `true` / `1` prefix. The leading `\bvalue\b` boundary
// prevents matching inside longer identifiers like `somevalue:` or
// `defaultValue:` (the latter only matters case-insensitively, but `\b`
// also defends against future renames).
const BICEP_VALUE_TRUTHY_RE = new RegExp(
  String.raw`\bvalue\b\s*:\s*(?:'` + TRUTHY_TOKEN + String.raw`'|"` + TRUTHY_TOKEN + String.raw`"|` + TRUTHY_TOKEN + String.raw`\b)`,
  'i',
);

// Given a character offset, return the line range [openLine, closeLine] of
// the nearest enclosing `{ ... }` block, or null if the offset is not inside
// a balanced brace pair. Brace counting is character-level and ignores the
// possibility of `{`/`}` inside string literals — Bicep env objects we care
// about contain only the override flag name (no braces), so this is safe in
// practice and keeps the implementation parser-free.
function enclosingBraceLineRange(content, lineStarts, charOffset) {
  let depth = 0;
  let openOff = -1;
  for (let i = charOffset - 1; i >= 0; i -= 1) {
    const c = content[i];
    if (c === '}') depth += 1;
    else if (c === '{') {
      if (depth === 0) { openOff = i; break; }
      depth -= 1;
    }
  }
  if (openOff < 0) return null;
  let d = 0;
  let closeOff = -1;
  for (let i = openOff; i < content.length; i += 1) {
    const c = content[i];
    if (c === '{') d += 1;
    else if (c === '}') {
      d -= 1;
      if (d === 0) { closeOff = i; break; }
    }
  }
  if (closeOff < 0) return null;
  let openLine = 0;
  let closeLine = 0;
  for (let i = 0; i < lineStarts.length; i += 1) {
    if (lineStarts[i] <= openOff) openLine = i;
    if (lineStarts[i] <= closeOff) closeLine = i;
    else break;
  }
  return { open: openLine, close: closeLine };
}

function scanEnvObjectForm(relPath) {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(REPO_ROOT, relPath);
  let content;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch {
    return [];
  }
  const findings = [];
  if (/\.json$/i.test(relPath)) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Fail closed: a malformed JSON template could hide a truthy override
      // from the policy guard. Emit a Policy 1 finding so CI fails until the
      // file is fixed (or removed). Line 1 is used because JSON.parse does
      // not give us a useful position we can rely on across Node versions.
      return [{
        file: relPath,
        line: 1,
        snippet: 'malformed JSON; policy scan could not be applied — fix the file or the override flag may be hidden from the policy guard',
      }];
    }
    if (jsonHasOverrideTruthy(parsed)) {
      findings.push({
        file: relPath,
        line: 1,
        snippet: `{ name: "FEATURE_FLAG_ALLOW_OVERRIDE", value: <truthy> } found in JSON template`,
      });
    }
    return findings;
  }
  if (/\.bicep$/i.test(relPath)) {
    const lines = content.split(/\r?\n/);
    // Precompute character offsets of each line start so we can map line
    // indices to absolute offsets for brace-range lookups.
    const lineStarts = [0];
    for (let i = 0; i < content.length; i += 1) {
      if (content[i] === '\n') lineStarts.push(i + 1);
    }
    // Skip commented-out lines (Bicep uses `//`; tolerate `#` for safety)
    // so that documentation/example blocks do not produce false positives.
    // This matches the comment-prefix rejection in OVERRIDE_TRUTHY_RE.
    const isComment = (line) => /^\s*(\/\/|#)/.test(line);
    const truthyValueLines = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (isComment(lines[i])) continue;
      if (BICEP_VALUE_TRUTHY_RE.test(lines[i])) truthyValueLines.push(i);
    }
    for (let i = 0; i < lines.length; i += 1) {
      if (isComment(lines[i])) continue;
      const nameMatch = lines[i].match(BICEP_NAME_RE);
      if (!nameMatch) continue;
      // Use the offset of the name match itself (not the line start) so that
      // an opening `{` appearing earlier on the SAME line is included in the
      // backward brace walk. `nameMatch.index` is set because BICEP_NAME_RE
      // is non-global.
      const nameOffset = lineStarts[i] + nameMatch.index;
      const range = enclosingBraceLineRange(content, lineStarts, nameOffset);
      if (!range) continue;
      // Allow same-line pairings: a `{ name: 'X', value: 'true' }` literal
      // has both matches on the same line, which is still one object.
      const match = truthyValueLines.find((j) => j >= range.open && j <= range.close);
      if (match !== undefined) {
        findings.push({
          file: relPath,
          line: i + 1,
          snippet: match === i ? lines[i].trim() : `${lines[i].trim()} ... ${lines[match].trim()}`,
        });
      }
    }
    return findings;
  }
  return findings;
}

// Match `FEATURE_<KEY>_PERCENTAGE` (any feature key) set to literal 100.
// Allow the same `=` / `:` and optional quoting. We intentionally only flag
// the literal 100 — that is the workaround pattern. Any other value is a
// real rollout config and not the policy's concern (Policy 2 scope).
// Same comment-prefix rejection as Policy 1.
const PERCENTAGE_100_RE = /^(?!\s*(#|\/\/)).*FEATURE_[A-Z0-9_]+_PERCENTAGE\s*[=:]\s*"?'?100"?'?\b/;

function scanFile(relPath, regex) {
  const abs = path.join(REPO_ROOT, relPath);
  let content;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch {
    return [];
  }
  const findings = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(regex);
    if (m) {
      findings.push({ file: relPath, line: i + 1, snippet: lines[i].trim() });
    }
  }
  return findings;
}

// --------------------------------------------------------------------------
// Policy execution
// --------------------------------------------------------------------------

function runPolicy1() {
  const targets = [];
  if (existsRel('.github/workflows/prod-deploy.yml')) targets.push('.github/workflows/prod-deploy.yml');
  if (existsRel('infra/deploy.sh')) targets.push('infra/deploy.sh');
  if (existsRel('infra/deploy.ps1')) targets.push('infra/deploy.ps1');
  for (const f of listFilesRecursive('infra', (p) => /\.(bicep|json)$/i.test(p))) {
    targets.push(f);
  }

  const findings = [];
  const policy1Message =
    'POLICY 1 violation: FEATURE_FLAG_ALLOW_OVERRIDE must NEVER be truthy in live-deploy assets. ' +
    'Override is a test/dev affordance only. Remove this env var from live-deploy config. ' +
    'See INSTRUCTIONS.md "Feature flag testing across environments" and CS40.';
  for (const t of targets) {
    for (const f of scanFile(t, OVERRIDE_TRUTHY_RE)) {
      findings.push({ ...f, message: policy1Message });
    }
    // ARM/Bicep templates also use a multi-line {name, value} env-object
    // shape that single-line regex above does not catch. Scan those forms
    // for .bicep / .json templates only (the live-deploy IaC files).
    if (/\.(bicep|json)$/i.test(t)) {
      for (const f of scanEnvObjectForm(t)) {
        findings.push({ ...f, message: policy1Message });
      }
    }
  }
  return findings;
}

function runPolicy2() {
  const targets = [];
  for (const f of listFilesRecursive('tests', () => true)) targets.push(f);
  for (const f of listRootDockerComposeFiles()) targets.push(f);
  for (const f of listFilesRecursive('.github/workflows', (p) => /\.ya?ml$/i.test(p))) {
    // prod-deploy.yml is a live-deploy asset — legitimate rollout values are
    // allowed there. Policy 1 covers its override-flag concern separately.
    if (/prod-deploy\.ya?ml$/i.test(f)) continue;
    targets.push(f);
  }

  const findings = [];
  for (const t of targets) {
    for (const f of scanFile(t, PERCENTAGE_100_RE)) {
      findings.push({
        ...f,
        message:
          'POLICY 2 violation: FEATURE_<KEY>_PERCENTAGE=100 in test-oriented config is the deprecated CS25 ' +
          'E2E workaround. Use the per-test override mechanism instead (?ff_<key>=true query param or ' +
          'X-Gwn-Feature-<Key> header). Set FEATURE_FLAG_ALLOW_OVERRIDE=true on the test/CI container if ' +
          'NODE_ENV=production|staging. See INSTRUCTIONS.md and CS40.',
      });
    }
  }
  return findings;
}

function main() {
  const findings = [...runPolicy1(), ...runPolicy2()];

  if (findings.length === 0) {
    process.stdout.write('check-feature-flag-policy: 0 findings.\n');
    process.exit(0);
  }

  process.stderr.write(`check-feature-flag-policy: ${findings.length} finding(s).\n\n`);
  for (const f of findings) {
    process.stderr.write(`${f.file}:${f.line}  ${f.snippet}\n  -> ${f.message}\n\n`);
  }
  process.exit(1);
}

if (require.main === module) main();

module.exports = {
  runPolicy1,
  runPolicy2,
  OVERRIDE_TRUTHY_RE,
  PERCENTAGE_100_RE,
  scanEnvObjectForm,
  jsonHasOverrideTruthy,
  isTruthyEnvValue,
};
