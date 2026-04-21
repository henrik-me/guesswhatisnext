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
