'use strict';

const { run } = require('../scripts/check-commit-trailers.js');

const GOOD_HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NO_COPILOT_HASH = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NO_AGENT_HASH = 'cccccccccccccccccccccccccccccccccccccccc';
const ALLOWLIST_HASH = 'dddddddddddddddddddddddddddddddddddddddd';
const MIXED_HASH = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

function commit(hash, message) {
  return `${hash}\n${message}\n---\n`;
}

function runLog(log, pathsByHash) {
  return run({
    gitLog: log,
    getChangedPaths(hash) {
      return pathsByHash[hash] || ['scripts/check.js'];
    },
  });
}

describe('check-commit-trailers', () => {
  test('passes when required trailers are present', () => {
    const log = commit(GOOD_HASH, `feat: add gate\n\nAgent: omni-gwn/wt-3\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`);
    expect(runLog(log, { [GOOD_HASH]: ['scripts/check.js'] })).toEqual([]);
  });

  test('flags missing Co-authored-by trailer', () => {
    const log = commit(NO_COPILOT_HASH, 'feat: add gate\n\nAgent: omni-gwn/wt-3');
    const findings = runLog(log, { [NO_COPILOT_HASH]: ['scripts/check.js'] });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Co-authored-by');
  });

  test('flags missing Agent trailer', () => {
    const log = commit(NO_AGENT_HASH, 'feat: add gate\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>');
    const findings = runLog(log, { [NO_AGENT_HASH]: ['scripts/check.js'] });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Agent: <token>/<token>');
  });

  test('skips allowlisted path-only commits', () => {
    const log = commit(ALLOWLIST_HASH, 'workboard: claim cs66');
    expect(runLog(log, { [ALLOWLIST_HASH]: ['WORKBOARD.md', 'project/clickstops/active/active_cs66.md'] })).toEqual([]);
  });

  test('checks mixed allowlisted and non-allowlisted path commits', () => {
    const log = commit(MIXED_HASH, 'feat: mixed changes');
    const findings = runLog(log, { [MIXED_HASH]: ['WORKBOARD.md', 'scripts/check.js'] });
    expect(findings).toHaveLength(2);
    expect(findings.join('\n')).toContain('Co-authored-by');
    expect(findings.join('\n')).toContain('Agent: <token>/<token>');
  });
});
