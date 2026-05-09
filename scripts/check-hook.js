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
      // Pipe stderr so the catch block can inspect Git's actual error
      // text (e.g. "fatal: not a git repository") instead of degrading
      // to a generic "Command failed" reason. We swallow it via the
      // catch — never leak to the user's terminal.
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: repoRoot,
    })
      .toString()
      .trim()
      // Normalize trailing slashes ('.husky/_/' -> '.husky/_'); Git
      // accepts either form but strict equality below would miss them.
      .replace(/\/+$/, '');
  } catch (e) {
    // git config exits non-zero (without writing to stderr) when the
    // key is unset — that's the common "no hook installed yet" case.
    // It writes to stderr when git itself fails (not a repo, permissions,
    // etc.). When git isn't on PATH, execSync throws with code='ENOENT'
    // and no stderr at all — handle that explicitly so the reason isn't
    // misreported as "key unset".
    if (e && e.code === 'ENOENT') {
      return { active: false, reason: `git config probe failed: git binary not found on PATH` };
    }
    const stderr = (e && e.stderr ? e.stderr.toString() : '').trim();
    if (stderr) {
      return { active: false, reason: `git config probe failed: ${stderr.split('\n')[0]}` };
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
