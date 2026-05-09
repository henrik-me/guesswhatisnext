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
      .trim()
      // Normalize trailing slashes ('.husky/_/' -> '.husky/_'); Git
      // accepts either form but strict equality below would miss them.
      .replace(/\/+$/, '');
  } catch (e) {
    // git config exits non-zero when the key is unset (the common
    // "no hook installed yet" case). It can also fail because git is
    // not on PATH or this isn't a git repo — surface that to the user
    // rather than misreporting it as "not set".
    const msg = e && e.message ? e.message : String(e);
    if (/not a git repository|fatal:|ENOENT|spawn/i.test(msg)) {
      return { active: false, reason: `git config probe failed: ${msg.split('\n')[0]}` };
    }
    return { active: false, reason: 'core.hooksPath is not set' };
  }
  if (hooksPath !== '.husky' && hooksPath !== '.husky/_') {
    return { active: false, reason: `core.hooksPath is '${hooksPath || '(unset)'}', expected '.husky' or '.husky/_'` };
  }
  // Husky 9 wires Git to '.husky/_/<hook>' wrappers that source the user's
  // '.husky/<hook>' file. Both must exist for the hook to actually fire.
  // '.husky/_' is gitignored and can be removed by `git clean -dfx` / by a
  // bare `git pull` into a clone where it was never written, so we can't
  // assume it's present just because core.hooksPath points at it.
  const userHook = path.join(repoRoot, '.husky', 'pre-push');
  if (!fs.existsSync(userHook)) {
    return { active: false, reason: `.husky/pre-push does not exist` };
  }
  if (hooksPath === '.husky/_') {
    const wrapper = path.join(repoRoot, '.husky', '_', 'pre-push');
    if (!fs.existsSync(wrapper)) {
      return { active: false, reason: `.husky/_/pre-push wrapper missing — run \`npm install\` to regenerate` };
    }
  }
  // On Windows, Git tracks executability via core.fileMode and the actual
  // exec bit isn't meaningful — file existence is sufficient. On POSIX,
  // require the owner-execute bit on the user hook.
  if (process.platform !== 'win32') {
    try {
      const st = fs.statSync(userHook);
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
