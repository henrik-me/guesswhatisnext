#!/usr/bin/env node
// CS77-2b — probe whether the husky pre-push hook is active in this clone.
//
// Used as `npm run check:hook` (fast, ~100ms, no npm spin-up beyond node)
// and as a library function from scripts/check-docs-consistency.js to
// emit a soft warning when the hook is missing (CS77-2c).

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function isHookActive(repoRoot = process.cwd()) {
  let hooksPath = '';
  try {
    hooksPath = execSync('git config core.hooksPath', {
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd: repoRoot,
    })
      .toString()
      .trim();
  } catch {
    return { active: false, reason: 'core.hooksPath is not set' };
  }
  if (hooksPath !== '.husky' && hooksPath !== '.husky/_') {
    return { active: false, reason: `core.hooksPath is '${hooksPath || '(unset)'}', expected '.husky' or '.husky/_'` };
  }
  const hookFile = path.join(repoRoot, '.husky', 'pre-push');
  if (!fs.existsSync(hookFile)) {
    return { active: false, reason: `.husky/pre-push does not exist` };
  }
  // On Windows, Git tracks executability via core.fileMode and the actual
  // exec bit isn't meaningful — file existence is sufficient. On POSIX,
  // require the owner-execute bit.
  if (process.platform !== 'win32') {
    try {
      const st = fs.statSync(hookFile);
      if ((st.mode & 0o100) === 0) {
        return { active: false, reason: `.husky/pre-push is not executable (chmod +x .husky/pre-push)` };
      }
    } catch (e) {
      return { active: false, reason: `failed to stat .husky/pre-push: ${e.message}` };
    }
  }
  return { active: true, reason: '' };
}

if (require.main === module) {
  const result = isHookActive();
  if (result.active) {
    console.log('✓ CS77 pre-push hook is active in this clone');
    process.exit(0);
  } else {
    console.error(`✗ CS77 pre-push hook is NOT active in this clone — run \`npm install\` to activate (see CS77).`);
    console.error(`  reason: ${result.reason}`);
    process.exit(1);
  }
}

module.exports = { isHookActive };
