'use strict';

const { run } = require('../scripts/check-commit-trailers.js');

const GOOD_HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NO_COPILOT_HASH = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NO_AGENT_HASH = 'cccccccccccccccccccccccccccccccccccccccc';
const ALLOWLIST_HASH = 'dddddddddddddddddddddddddddddddddddddddd';
const MIXED_HASH = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const COPILOT_AUTHOR_HASH = 'ffffffffffffffffffffffffffffffffffffffff';
const AGENT_LOGS_URL_HASH = '1111111111111111111111111111111111111111';

const COPILOT_AUTHOR_EMAIL = '198982749+Copilot@users.noreply.github.com';
const HUMAN_AUTHOR_EMAIL = 'human@example.com';

function commit(hash, message) {
  return `${hash}\n${message}\n---\n`;
}

function runLog(log, pathsByHash, authorsByHash = {}) {
  return run({
    gitLog: log,
    getChangedPaths(hash) {
      return pathsByHash[hash] || ['scripts/check.js'];
    },
    getCommitAuthor(hash) {
      return authorsByHash[hash] || HUMAN_AUTHOR_EMAIL;
    },
  });
}

describe('check-commit-trailers', () => {
  test('passes when required trailers are present', () => {
    const log = commit(GOOD_HASH, `feat: add gate\n\nAgent: omni-gwn/wt-3\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`);
    expect(runLog(log, { [GOOD_HASH]: ['scripts/check.js'] })).toEqual([]);
  });

  test('parses record-separated git log output when messages contain markdown rules', () => {
    const log = `\u001e${GOOD_HASH}\u001ffeat: add gate\n\n---\n\nAgent: omni-gwn/wt-3\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`;
    expect(runLog(log, { [GOOD_HASH]: ['scripts/check.js'] })).toEqual([]);
  });

  test('flags missing Co-authored-by trailer when author is not Copilot bot', () => {
    const log = commit(NO_COPILOT_HASH, 'feat: add gate\n\nAgent: omni-gwn/wt-3');
    const findings = runLog(log, { [NO_COPILOT_HASH]: ['scripts/check.js'] }, { [NO_COPILOT_HASH]: HUMAN_AUTHOR_EMAIL });
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
    const findings = runLog(log, { [MIXED_HASH]: ['WORKBOARD.md', 'scripts/check.js'] }, { [MIXED_HASH]: HUMAN_AUTHOR_EMAIL });
    expect(findings).toHaveLength(2);
    expect(findings.join('\n')).toContain('Co-authored-by');
    expect(findings.join('\n')).toContain('Agent: <token>/<token>');
  });

  test('accepts Copilot bot author in place of Co-authored-by trailer', () => {
    // copilot-swe-agent[bot] authored commits lack the trailer but should still pass.
    const log = commit(COPILOT_AUTHOR_HASH, 'fix: something\n\nAgent: omni-gwn/wt-3\nAgent-Logs-Url: https://github.com/org/repo/sessions/abc');
    const findings = runLog(
      log,
      { [COPILOT_AUTHOR_HASH]: ['scripts/check.js'] },
      { [COPILOT_AUTHOR_HASH]: COPILOT_AUTHOR_EMAIL },
    );
    expect(findings).toEqual([]);
  });

  test('accepts Agent-Logs-Url in place of Agent: <token>/<token> trailer', () => {
    const log = commit(AGENT_LOGS_URL_HASH, `fix: something\n\nAgent-Logs-Url: https://github.com/org/repo/sessions/abc\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`);
    const findings = runLog(log, { [AGENT_LOGS_URL_HASH]: ['scripts/check.js'] });
    expect(findings).toEqual([]);
  });

  test('accepts Agent-Logs-Url + Copilot bot author (session-env format)', () => {
    // This is the format emitted by report_progress in some Copilot session environments.
    const log = commit(AGENT_LOGS_URL_HASH, 'fix: something\n\nAgent-Logs-Url: https://github.com/org/repo/sessions/abc\nCo-authored-by: henrik-me <34380746+henrik-me@users.noreply.github.com>');
    const findings = runLog(
      log,
      { [AGENT_LOGS_URL_HASH]: ['scripts/check.js'] },
      { [AGENT_LOGS_URL_HASH]: COPILOT_AUTHOR_EMAIL },
    );
    expect(findings).toEqual([]);
  });
});
