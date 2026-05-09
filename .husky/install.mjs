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

if (process.env.CI === 'true' || process.env.NODE_ENV === 'production') {
  // Silent no-op in CI / production-style installs (npm ci --omit=dev).
  process.exit(0);
}

function currentHooksPath() {
  try {
    return execSync('git config core.hooksPath', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

// Husky 9 sets core.hooksPath to '.husky/_' (wrapper scripts that source
// the user's .husky/<hook>). Treat that as "configured".
function isConfigured(p) {
  return p === '.husky' || p === '.husky/_';
}

if (isConfigured(currentHooksPath())) {
  console.log('✓ CS77 pre-push hook already configured (no changes)');
  process.exit(0);
}

(async () => {
  console.log('→ configuring CS77 pre-push hook');
  const { default: husky } = await import('husky');
  const out = husky();
  if (out) console.log(out);
})();
