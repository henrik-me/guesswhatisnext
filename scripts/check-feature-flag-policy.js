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

const TRUTHY_TOKEN = '(true|yes|on|1|enable|enabled)';

// Match `FEATURE_FLAG_ALLOW_OVERRIDE` followed by `=` (shell / dotenv) or
// `:` (YAML), optional quotes, then a truthy token. Case-insensitive on the
// truthy token. The flag name itself is upper-case by repo convention; we
// keep the regex case-sensitive on the name to avoid false positives in
// docs / prose that might mention `feature_flag_allow_override` lowercase.
//
// `^(?!\s*(#|//))` rejects lines whose first non-whitespace is `#` (shell /
// YAML comment) or `//` (JS/JSON-with-comments) so commented-out config and
// documentation comments don't trigger violations.
const OVERRIDE_TRUTHY_RE = new RegExp(
  String.raw`^(?!\s*(#|\/\/)).*FEATURE_FLAG_ALLOW_OVERRIDE\s*[=:]\s*"?'?` + TRUTHY_TOKEN + String.raw`['"]?\b`,
  'i',
);

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
  for (const t of targets) {
    for (const f of scanFile(t, OVERRIDE_TRUTHY_RE)) {
      findings.push({
        ...f,
        message:
          'POLICY 1 violation: FEATURE_FLAG_ALLOW_OVERRIDE must NEVER be truthy in live-deploy assets. ' +
          'Override is a test/dev affordance only. Remove this env var from live-deploy config. ' +
          'See INSTRUCTIONS.md "Feature flag testing across environments" and CS40.',
      });
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

module.exports = { runPolicy1, runPolicy2, OVERRIDE_TRUTHY_RE, PERCENTAGE_100_RE };
