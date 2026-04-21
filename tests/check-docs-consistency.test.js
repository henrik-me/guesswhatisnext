/**
 * Tests for scripts/check-docs-consistency.js (CS43-2)
 *
 * Each fixture under tests/fixtures/check-docs-consistency/ models a single
 * rule trigger (or, for `happy/`, a clean baseline). The test runs the
 * checker against each fixture and asserts on the emitted findings.
 */
'use strict';

const path = require('path');
const checker = require('../scripts/check-docs-consistency.js');
const { run, slugify, parseIgnores } = checker;

const FIX = path.join(__dirname, 'fixtures', 'check-docs-consistency');
const FIXED_NOW = new Date('2099-01-05T00:00:00Z'); // close to fixture stamps

function rules(findings) {
  return findings.map(f => f.rule).sort();
}

describe('check-docs-consistency', () => {
  test('happy fixture: zero findings', () => {
    const findings = run({ root: path.join(FIX, 'happy'), now: FIXED_NOW });
    expect(findings).toEqual([]);
  });

  test('broken-link fixture: link-resolves error', () => {
    const findings = run({ root: path.join(FIX, 'broken-link'), now: FIXED_NOW });
    expect(rules(findings)).toEqual(['link-resolves']);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].file).toBe('README.md');
    expect(findings[0].line).toBe(3);
    expect(findings[0].message).toContain('does-not-exist.md');
  });

  test('prefix-mismatch fixture: prefix-matches-status error', () => {
    const findings = run({ root: path.join(FIX, 'prefix-mismatch'), now: FIXED_NOW });
    expect(rules(findings)).toEqual(['prefix-matches-status']);
    expect(findings[0].message).toContain('CS1');
    expect(findings[0].message).toContain("'done_*'");
  });

  test('cs-in-two-states fixture: unique-cs-state error (one per file)', () => {
    const findings = run({ root: path.join(FIX, 'cs-in-two-states'), now: FIXED_NOW });
    expect(findings.every(f => f.rule === 'unique-cs-state')).toBe(true);
    expect(findings.length).toBe(2);
    expect(findings[0].message).toContain('CS7');
  });

  test('clickstop-link-missing fixture: CONTEXT.md details link that does not resolve', () => {
    const findings = run({ root: path.join(FIX, 'clickstop-link-missing'), now: FIXED_NOW });
    // The same broken link fires both rules; assert clickstop-link-resolves
    // is among them and reports the right CS.
    const cs = findings.find(f => f.rule === 'clickstop-link-resolves');
    expect(cs).toBeDefined();
    expect(cs.message).toContain('CS1');
    expect(cs.message).toContain('does_not_exist.md');
  });

  test('done-task-count fixture: error when n<m and no Deferred section', () => {
    const findings = run({ root: path.join(FIX, 'done-task-count'), now: FIXED_NOW });
    expect(rules(findings)).toEqual(['done-task-count']);
    expect(findings[0].message).toContain('2/5');
  });

  test('orphan-active-work fixture: WORKBOARD references done CS', () => {
    const findings = run({ root: path.join(FIX, 'orphan-active-work'), now: FIXED_NOW });
    expect(rules(findings)).toEqual(['no-orphan-active-work']);
    expect(findings[0].file).toBe('WORKBOARD.md');
    expect(findings[0].message).toContain('CS9');
  });

  test('stale-stamp fixture: workboard-stamp-fresh warning', () => {
    const findings = run({ root: path.join(FIX, 'stale-stamp'), now: FIXED_NOW });
    expect(rules(findings)).toEqual(['workboard-stamp-fresh']);
    expect(findings[0].severity).toBe('warning');
  });

  test('escape-hatch fixture: ignore comments suppress findings', () => {
    const findings = run({ root: path.join(FIX, 'escape-hatch'), now: FIXED_NOW });
    expect(findings).toEqual([]);
  });

  // ---- CS44-5a: state-vocabulary, ISO 8601, owner-in-orchestrators-table ----

  test('workboard-new-schema-happy: zero findings from new rules', () => {
    const findings = run({ root: path.join(FIX, 'workboard-new-schema-happy'), now: FIXED_NOW });
    expect(findings).toEqual([]);
  });

  test('workboard-bad-state: state-in-vocabulary error', () => {
    const findings = run({ root: path.join(FIX, 'workboard-bad-state'), now: FIXED_NOW });
    expect(rules(findings)).toEqual(['state-in-vocabulary']);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].file).toBe('WORKBOARD.md');
    expect(findings[0].message).toContain('reviewing');
  });

  test('workboard-bad-last-updated: last-updated-iso8601 error', () => {
    const findings = run({ root: path.join(FIX, 'workboard-bad-last-updated'), now: FIXED_NOW });
    expect(rules(findings)).toEqual(['last-updated-iso8601']);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('yesterday');
  });

  test('workboard-bad-owner: owner-in-orchestrators-table error', () => {
    const findings = run({ root: path.join(FIX, 'workboard-bad-owner'), now: FIXED_NOW });
    expect(rules(findings)).toEqual(['owner-in-orchestrators-table']);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('omni-gwn-typo');
  });

  test('workboard-old-schema-compat: new rules silent on pre-CS44-3 schema', () => {
    // Today's WORKBOARD has `Agent ID` (no `State`, no `Last Updated`).
    // state-in-vocabulary and last-updated-iso8601 should be silent;
    // owner-in-orchestrators-table activates on `Agent ID` and the value
    // is a known orchestrator, so it produces no finding either.
    const findings = run({ root: path.join(FIX, 'workboard-old-schema-compat'), now: FIXED_NOW });
    expect(findings).toEqual([]);
  });

  test('workboard-state-escape-hatch: inline ignores suppress all three rules', () => {
    const findings = run({ root: path.join(FIX, 'workboard-state-escape-hatch'), now: FIXED_NOW });
    expect(findings).toEqual([]);
  });

  test('last-updated-iso8601: rejects non-ISO formats Date.parse would accept', () => {
    // Sanity: Date.parse accepts these locale/RFC strings, but the rule
    // must not. Verify by running a synthetic fixture in a scratch dir.
    const fs = require('fs');
    const tmp = path.join(__dirname, '.tmp-iso-' + process.pid);
    fs.mkdirSync(tmp, { recursive: true });
    try {
      fs.writeFileSync(path.join(tmp, 'WORKBOARD.md'),
        '# WORKBOARD\n\n> **Last updated:** 2099-01-01T00:00Z\n\n' +
        '## Orchestrators\n\n| Agent ID | Status |\n|----------|--------|\n| a | x |\n\n' +
        '## Active Work\n\n| Task ID | Owner | Last Updated |\n|---------|-------|--------------|\n' +
        '| T1 | a | 01/02/2099 |\n' +
        '| T2 | a | Mon, 05 Jan 2099 00:00:00 GMT |\n');
      const findings = run({ root: tmp, now: FIXED_NOW });
      const iso = findings.filter(f => f.rule === 'last-updated-iso8601');
      expect(iso).toHaveLength(2);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('table parser: respects escaped pipes (\\|) inside cells', () => {
    const fs = require('fs');
    const tmp = path.join(__dirname, '.tmp-pipe-' + process.pid);
    fs.mkdirSync(tmp, { recursive: true });
    try {
      // Cell contains an escaped pipe; without escape-aware splitting
      // later columns would shift and `bogus-state` would be read as
      // State, causing a false positive.
      fs.writeFileSync(path.join(tmp, 'WORKBOARD.md'),
        '# WORKBOARD\n\n> **Last updated:** 2099-01-01T00:00Z\n\n' +
        '## Orchestrators\n\n| Agent ID | Status |\n|----------|--------|\n| omni-gwn | x |\n\n' +
        '## Active Work\n\n| Task ID | Description | State | Owner |\n|---------|-------------|-------|-------|\n' +
        '| T1 | foo \\| bar \\| baz | implementing | omni-gwn |\n');
      const findings = run({ root: tmp, now: FIXED_NOW });
      expect(findings).toEqual([]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ---- CS44-5b: active-row-stale / active-row-reclaimable ------------------

  test('active-row-fresh fixture: recent Last Updated → no threshold findings', () => {
    const findings = run({ root: path.join(FIX, 'active-row-fresh'), now: FIXED_NOW });
    expect(findings.filter(f => f.rule === 'active-row-stale')).toEqual([]);
    expect(findings.filter(f => f.rule === 'active-row-reclaimable')).toEqual([]);
  });

  test('active-row-stale-warn fixture: 30h old → warning only, no error', () => {
    const findings = run({ root: path.join(FIX, 'active-row-stale-warn'), now: FIXED_NOW });
    const stale = findings.filter(f => f.rule === 'active-row-stale');
    const reclaim = findings.filter(f => f.rule === 'active-row-reclaimable');
    expect(stale).toHaveLength(1);
    expect(stale[0].severity).toBe('warning');
    expect(stale[0].message).toContain('CS99-2');
    expect(stale[0].message).toContain('omni-gwn');
    expect(reclaim).toEqual([]);
  });

  test('active-row-stale-error fixture: 8d old → both warning AND error', () => {
    const findings = run({ root: path.join(FIX, 'active-row-stale-error'), now: FIXED_NOW });
    const stale = findings.filter(f => f.rule === 'active-row-stale');
    const reclaim = findings.filter(f => f.rule === 'active-row-reclaimable');
    expect(stale).toHaveLength(1);
    expect(stale[0].severity).toBe('warning');
    expect(reclaim).toHaveLength(1);
    expect(reclaim[0].severity).toBe('error');
    expect(reclaim[0].message).toContain('CS99-3');
    expect(reclaim[0].message).toContain('yoga-gwn');
  });

  test('active-row-no-column fixture: today\'s schema (Started, no Last Updated) → silent', () => {
    const findings = run({ root: path.join(FIX, 'active-row-no-column'), now: FIXED_NOW });
    expect(findings.filter(f => f.rule === 'active-row-stale')).toEqual([]);
    expect(findings.filter(f => f.rule === 'active-row-reclaimable')).toEqual([]);
  });

  test('active-row-ignored fixture: ignore comments suppress both rules', () => {
    const findings = run({ root: path.join(FIX, 'active-row-ignored'), now: FIXED_NOW });
    expect(findings.filter(f => f.rule === 'active-row-stale')).toEqual([]);
    expect(findings.filter(f => f.rule === 'active-row-reclaimable')).toEqual([]);
  });

  test('active-row-malformed fixture: unparseable Last Updated → silent (CS44-5a owns format)', () => {
    const findings = run({ root: path.join(FIX, 'active-row-malformed'), now: FIXED_NOW });
    expect(findings.filter(f => f.rule === 'active-row-stale')).toEqual([]);
    expect(findings.filter(f => f.rule === 'active-row-reclaimable')).toEqual([]);
  });

  test('active-row-loose-date fixture: parseable but non-ISO date → silent', () => {
    // `2098/12/28 00:00Z` is accepted by Date.parse but is not ISO 8601.
    // CS44-5a's `last-updated-iso8601` rule owns this signal; we must not
    // emit a misleading age-based finding here.
    const findings = run({ root: path.join(FIX, 'active-row-loose-date'), now: FIXED_NOW });
    expect(findings.filter(f => f.rule === 'active-row-stale')).toEqual([]);
    expect(findings.filter(f => f.rule === 'active-row-reclaimable')).toEqual([]);
  });

  test('active-row-leading-table fixture: note table before the real Active Work table does not silence the rules', () => {
    const findings = run({ root: path.join(FIX, 'active-row-leading-table'), now: FIXED_NOW });
    const stale = findings.filter(f => f.rule === 'active-row-stale');
    const reclaim = findings.filter(f => f.rule === 'active-row-reclaimable');
    expect(stale).toHaveLength(1);
    expect(reclaim).toHaveLength(1);
    expect(reclaim[0].message).toContain('CS99-7');
  });

  test('CHECK_DOCS_NOW_OVERRIDE env var injects "now" when opts.now is absent', () => {
    const prev = process.env.CHECK_DOCS_NOW_OVERRIDE;
    process.env.CHECK_DOCS_NOW_OVERRIDE = '2099-01-05T00:00:00Z';
    try {
      const findings = run({ root: path.join(FIX, 'active-row-stale-error') });
      expect(findings.some(f => f.rule === 'active-row-reclaimable')).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.CHECK_DOCS_NOW_OVERRIDE;
      else process.env.CHECK_DOCS_NOW_OVERRIDE = prev;
    }
  });

  test('unique-cs-state can be suppressed by own-line ignore above the heading', () => {
    // Dynamic: add an ignore comment to the top of one of the cs-in-two-states
    // files, rerun, and assert the findings for that file are gone.
    const fs = require('fs');
    const root = path.join(FIX, 'cs-in-two-states');
    const targetFile = path.join(root, 'project', 'clickstops', 'active', 'active_cs7_thing.md');
    const original = fs.readFileSync(targetFile, 'utf8');
    try {
      fs.writeFileSync(targetFile, '<!-- check:ignore unique-cs-state -->\n' + original);
      const findings = run({ root, now: FIXED_NOW });
      const byFile = findings.filter(f => f.file.endsWith('active_cs7_thing.md'));
      expect(byFile).toEqual([]);
      // The other file still produces its finding (ignore is file-scoped).
      expect(findings.some(f => f.file.endsWith('done_cs7_thing.md'))).toBe(true);
    } finally {
      fs.writeFileSync(targetFile, original);
    }
  });
});

describe('helpers', () => {
  test('slugify matches GitHub anchor algorithm for em-dash heading', () => {
    // "CONTEXT.md — Project State Updates" → punctuation stripped, each
    // remaining whitespace becomes a hyphen so consecutive spaces become
    // consecutive hyphens.
    expect(slugify('## CONTEXT.md — Project State Updates'))
      .toBe('contextmd--project-state-updates');
  });

  test('parseIgnores: inline form scopes to its own line', () => {
    const lines = [
      'foo <!-- check:ignore link-resolves -->',
      'bar',
    ];
    const ig = parseIgnores(lines);
    expect(ig).toHaveLength(1);
    expect(ig[0].rule).toBe('link-resolves');
    expect([...ig[0].lines]).toEqual([1]);
  });

  test('parseIgnores: own-line form scopes to next non-blank block', () => {
    const lines = [
      '<!-- check:ignore link-resolves -->',
      '',
      'first line of block',
      'second line of block',
      '',
      'after blank — not covered',
    ];
    const ig = parseIgnores(lines);
    expect([...ig[0].lines].sort((a, b) => a - b)).toEqual([3, 4]);
  });
});
