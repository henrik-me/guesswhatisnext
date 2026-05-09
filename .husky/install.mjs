// CS77 — husky install shim.
//
// Why this file: this repo runs `npm ci --omit=dev` in the Dockerfile,
// prod-deploy.yml, and staging-deploy.yml. Husky is a devDependency, so a
// plain `"prepare": "husky"` would crash those installs because the binary
// is absent. This shim:
//   1. Skips entirely when CI=true (GitHub Actions) or NODE_ENV=production
//      (Dockerfile) — no devDeps, nothing to install.
//   2. Probes the current state via `git config core.hooksPath` and skips
//      re-install with a friendly log line if the hook is already wired.
//   3. Otherwise calls `husky()` to set core.hooksPath and lay down .husky/_.
//
// See: project/clickstops/active/active_cs77_pre-push-docs-lint-hook.md
// and https://typicode.github.io/husky/how-to.html#ci-server-and-docker

import { execSync } from 'node:child_process';
import fs from 'node:fs';

function isCiEnv() {
  // Treat any truthy CI value as CI (only literal 'false'/'0'/'' is "not CI").
  // Many non-GitHub CI systems set CI=1, CI=true, or just CI=<anything>.
  const v = (process.env.CI || '').trim().toLowerCase();
  return v !== '' && v !== 'false' && v !== '0';
}

if (
  isCiEnv() ||
  process.env.NODE_ENV === 'production' ||
  // npm sets these when called with --omit=dev / --production. Guard
  // against the case where someone runs `npm ci --omit=dev` locally
  // without CI or NODE_ENV set: husky is a devDep so it isn't installed,
  // and a bare `import('husky')` would throw ERR_MODULE_NOT_FOUND.
  /\bdev\b/i.test(process.env.npm_config_omit || '') ||
  process.env.npm_config_production === 'true'
) {
  // Silent no-op in CI / production-style installs (npm ci --omit=dev).
  process.exit(0);
}

function currentHooksPath() {
  try {
    return execSync('git config core.hooksPath', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
      // Normalize trailing slashes — Git accepts '.husky/_/' but our
      // strict comparison below would miss it.
      .replace(/\/+$/, '');
  } catch {
    return '';
  }
}

// Husky 9 sets core.hooksPath to '.husky/_' (wrapper scripts that source
// the user's .husky/<hook>). Treat that as "configured" only if the
// generated wrapper actually exists — '.husky/_' is gitignored so a
// `git clean -dfx` (or a fresh worktree that inherits the parent's
// core.hooksPath but doesn't have the wrapper directory yet) can leave
// the config pointing at a missing directory; we must re-install in
// that case rather than silently skip.
function isConfiguredAndPresent(p) {
  if (p !== '.husky' && p !== '.husky/_') return false;
  if (p === '.husky/_' && !fs.existsSync('.husky/_/pre-push')) return false;
  return fs.existsSync('.husky/pre-push');
}

if (isConfiguredAndPresent(currentHooksPath())) {
  console.log('✓ CS77 pre-push hook already configured (no changes)');
  process.exit(0);
}

try {
  console.log('→ configuring CS77 pre-push hook');
  const { default: husky } = await import('husky');
  const out = husky();
  if (out) console.log(out);
} catch (e) {
  // Defense-in-depth: never let `prepare` crash `npm install`. If husky
  // can't run (no .git directory, git not on PATH, source-zip install,
  // etc.), warn loudly to stderr but exit 0 so devDep installs still
  // succeed — `npm run check:hook` will surface the missing hook on
  // next invocation.
  process.stderr.write(`⚠ CS77 husky install skipped: ${e && e.message ? e.message : String(e)}\n`);
  process.stderr.write(`  Run \`npm run check:hook\` after install to verify hook state.\n`);
  process.exit(0);
}
