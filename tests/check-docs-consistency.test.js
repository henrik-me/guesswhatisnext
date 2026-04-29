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
const { run, slugify, kebabSlug, parseIgnores, parseClickstopFilename, parseClickstopH1 } = checker;

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

  // ---- CS67: sub-agent-checklist-canonical ---------------------------------

  test('cs67-checklist-happy: OPERATIONS links to canonical checklist → no warning', () => {
    const findings = run({ root: path.join(FIX, 'cs67-checklist-happy'), now: FIXED_NOW });
    expect(findings.filter(f => f.rule === 'sub-agent-checklist-canonical')).toEqual([]);
  });

  test('cs67-checklist-missing-link: canonical checklist exists but OPERATIONS lacks link → warning', () => {
    const findings = run({ root: path.join(FIX, 'cs67-checklist-missing-link'), now: FIXED_NOW });
    const hits = findings.filter(f => f.rule === 'sub-agent-checklist-canonical');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('warning');
    expect(hits[0].file).toBe('OPERATIONS.md');
    expect(hits[0].message).toContain('markdown link');
  });

  test('cs67-checklist-broken: missing canonical checklist file → warning', () => {
    const findings = run({ root: path.join(FIX, 'cs67-checklist-broken'), now: FIXED_NOW });
    const hits = findings.filter(f => f.rule === 'sub-agent-checklist-canonical');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('warning');
    expect(hits[0].line).toBe(5);
    expect(hits[0].message).toContain('does not exist');
  });

  test('cs67-checklist-both-missing: project root missing both canonical targets → warning', () => {
    const findings = run({ root: path.join(FIX, 'cs67-checklist-both-missing'), now: FIXED_NOW });
    const hits = findings.filter(f => f.rule === 'sub-agent-checklist-canonical');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('warning');
    expect(hits[0].file).toBe('INSTRUCTIONS.md');
    expect(hits[0].message).toContain('docs/sub-agent-checklist.md does not exist');
    expect(hits[0].message).toContain('OPERATIONS.md does not exist');
  });

  test('cs67-checklist rule honors an ignore above the OPERATIONS checklist block', () => {
    const fs = require('fs');
    const root = path.join(FIX, 'cs67-checklist-missing-link');
    const operations = path.join(root, 'OPERATIONS.md');
    const original = fs.readFileSync(operations, 'utf8');
    try {
      const patched = original.replace(
        '**Sub-Agent Checklist**',
        '<!-- check:ignore sub-agent-checklist-canonical -->\n**Sub-Agent Checklist**');
      fs.writeFileSync(operations, patched);
      const findings = run({ root, now: FIXED_NOW });
      expect(findings.filter(f => f.rule === 'sub-agent-checklist-canonical')).toEqual([]);
    } finally {
      fs.writeFileSync(operations, original);
    }
  });

  test('cs67-checklist rule honors an ignore in the checklist file when OPERATIONS is missing', () => {
    const fs = require('fs');
    const root = path.join(FIX, 'cs67-checklist-missing-operations');
    const checklist = path.join(root, 'docs', 'sub-agent-checklist.md');
    const original = fs.readFileSync(checklist, 'utf8');
    try {
      fs.writeFileSync(checklist, '<!-- check:ignore sub-agent-checklist-canonical -->\n' + original);
      const findings = run({ root, now: FIXED_NOW });
      expect(findings.filter(f => f.rule === 'sub-agent-checklist-canonical')).toEqual([]);
    } finally {
      fs.writeFileSync(checklist, original);
    }
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

  // ---- CS62: clickstop-h1-matches-filename + workboard-title-matches-h1 ----

  test('cs62-h1-happy: H1 + filename slug align → no findings', () => {
    const findings = run({ root: path.join(FIX, 'cs62-h1-happy'), now: FIXED_NOW });
    expect(findings).toEqual([]);
  });

  test('cs62-h1-slug-drift: H1 title kebabs to a slug other than the filename slug → warning', () => {
    const findings = run({ root: path.join(FIX, 'cs62-h1-slug-drift'), now: FIXED_NOW });
    const hits = findings.filter(f => f.rule === 'clickstop-h1-matches-filename');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('warning');
    expect(hits[0].message).toContain('some-slug');
    expect(hits[0].message).toContain('different-title-entirely');
  });

  test('cs62-h1-csid-drift: H1 CSID does not match filename CSID → warning', () => {
    const findings = run({ root: path.join(FIX, 'cs62-h1-csid-drift'), now: FIXED_NOW });
    const hits = findings.filter(f => f.rule === 'clickstop-h1-matches-filename');
    // Both CSID-mismatch and slug-mismatch (CS999 vs cs102) findings expected.
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.every(f => f.severity === 'warning')).toBe(true);
    expect(hits.some(f => /CSID/i.test(f.message))).toBe(true);
  });

  test('cs62-h1-malformed-dash: ASCII `--` in place of em-dash → malformed-H1 warning', () => {
    const findings = run({ root: path.join(FIX, 'cs62-h1-malformed-dash'), now: FIXED_NOW });
    const hits = findings.filter(f => f.rule === 'clickstop-h1-matches-filename');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('warning');
    expect(hits[0].message).toContain('malformed');
  });

  test('cs62-h1-missing: no H1 at all → malformed-H1 warning', () => {
    const findings = run({ root: path.join(FIX, 'cs62-h1-missing'), now: FIXED_NOW });
    const hits = findings.filter(f => f.rule === 'clickstop-h1-matches-filename');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('warning');
  });

  test('cs62-h1-rule honors `<!-- check:ignore clickstop-h1-matches-filename -->`', () => {
    const fs = require('fs');
    const root = path.join(FIX, 'cs62-h1-slug-drift');
    const targetFile = path.join(root, 'project', 'clickstops', 'active', 'active_cs101_some-slug.md');
    const original = fs.readFileSync(targetFile, 'utf8');
    try {
      fs.writeFileSync(targetFile,
        '<!-- check:ignore clickstop-h1-matches-filename -->\n' + original);
      const findings = run({ root, now: FIXED_NOW });
      expect(findings.filter(f => f.rule === 'clickstop-h1-matches-filename')).toEqual([]);
    } finally {
      fs.writeFileSync(targetFile, original);
    }
  });

  test('cs62-title-happy: WORKBOARD Title cell line 1 equals H1 title → no warning', () => {
    const findings = run({ root: path.join(FIX, 'cs62-title-happy'), now: FIXED_NOW });
    expect(findings.filter(f => f.rule === 'workboard-title-matches-h1')).toEqual([]);
    // And the description-continuation row must not trigger the per-row checks.
    expect(findings.filter(f => f.rule === 'state-in-vocabulary')).toEqual([]);
    expect(findings.filter(f => f.rule === 'last-updated-iso8601')).toEqual([]);
    expect(findings.filter(f => f.rule === 'owner-in-orchestrators-table')).toEqual([]);
  });

  test('cs62-title-mismatch: WORKBOARD Title differs from H1 → warning', () => {
    const findings = run({ root: path.join(FIX, 'cs62-title-mismatch'), now: FIXED_NOW });
    const hits = findings.filter(f => f.rule === 'workboard-title-matches-h1');
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('warning');
    expect(hits[0].message).toContain('Drifted Title');
    expect(hits[0].message).toContain('My Thing');
  });

  test('cs62-title-no-file: WORKBOARD references a CS with no clickstop file → warning', () => {
    const findings = run({ root: path.join(FIX, 'cs62-title-no-file'), now: FIXED_NOW });
    const hits = findings.filter(f => f.rule === 'workboard-title-matches-h1');
    expect(hits).toHaveLength(1);
    expect(hits[0].message).toContain('CS999');
  });

  test('cs62-title-ambiguous: multiple clickstop files match one CSID → ambiguity warning', () => {
    const findings = run({ root: path.join(FIX, 'cs62-title-ambiguous'), now: FIXED_NOW });
    const hits = findings.filter(f => f.rule === 'workboard-title-matches-h1');
    // Exactly one ambiguity warning (Title cell line 1 matches H1 of the
    // first match, so no separate title-mismatch warning fires).
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe('warning');
    expect(hits[0].message).toContain('CS200');
    expect(hits[0].message).toContain('ambiguous');
    expect(hits[0].message).toContain('active_cs200_some-title.md');
    expect(hits[0].message).toContain('active_cs200_duplicate.md');
  });

  test('cs62-title-rule honors `<!-- check:ignore workboard-title-matches-h1 -->`', () => {
    const fs = require('fs');
    const root = path.join(FIX, 'cs62-title-mismatch');
    const wb = path.join(root, 'WORKBOARD.md');
    const original = fs.readFileSync(wb, 'utf8');
    try {
      const patched = original.replace(
        '| CS106-1 |',
        '<!-- check:ignore workboard-title-matches-h1 -->\n| CS106-1 |');
      fs.writeFileSync(wb, patched);
      const findings = run({ root, now: FIXED_NOW });
      expect(findings.filter(f => f.rule === 'workboard-title-matches-h1')).toEqual([]);
    } finally {
      fs.writeFileSync(wb, original);
    }
  });

  test('cs62-description-row: per-row checks skip rows with blank CS-Task ID cell', () => {
    // The description-continuation row has blank values everywhere except
    // a description-prose cell. Without the description-row guard, the
    // empty State / Last Updated / Owner cells would be skipped via their
    // own value-empty short-circuits, but the rules must explicitly skip
    // such rows so a stray non-empty value in a continuation row does not
    // produce a misleading finding either.
    const findings = run({ root: path.join(FIX, 'cs62-description-row'), now: FIXED_NOW });
    expect(findings.filter(f => f.rule === 'state-in-vocabulary')).toEqual([]);
    expect(findings.filter(f => f.rule === 'last-updated-iso8601')).toEqual([]);
    expect(findings.filter(f => f.rule === 'owner-in-orchestrators-table')).toEqual([]);
    expect(findings.filter(f => f.rule === 'active-row-stale')).toEqual([]);
    expect(findings.filter(f => f.rule === 'active-row-reclaimable')).toEqual([]);
    expect(findings.filter(f => f.rule === 'no-orphan-active-work')).toEqual([]);
    expect(findings.filter(f => f.rule === 'workboard-title-matches-h1')).toEqual([]);
  });

  test('cs62-leading-legend-table: leading non-data table does not silence no-orphan-active-work or workboard-title-matches-h1', () => {
    // The fixture's `## Active Work` section has a small Legend table BEFORE
    // the real Active Work data table. Pre-fix, getActiveWorkTable() would
    // return the legend table and both rules would silently skip. Post-fix,
    // it walks all tables in the section and picks the first one whose
    // headers contain `CS-Task ID`. CS300-1 is an orphan (done_cs300 exists)
    // and CS301-1's Title cell line 1 ("Wrong Workboard Title") differs
    // from active_cs301_*.md's H1 ("Real Title").
    const findings = run({ root: path.join(FIX, 'cs62-leading-legend-table'), now: FIXED_NOW });
    const orphans = findings.filter(f => f.rule === 'no-orphan-active-work');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].message).toContain('CS300');
    const titles = findings.filter(f => f.rule === 'workboard-title-matches-h1');
    expect(titles).toHaveLength(1);
    expect(titles[0].message).toContain('CS301-1');
    expect(titles[0].message).toContain('Wrong Workboard Title');
    expect(titles[0].message).toContain('Real Title');
  });

  test('cs62: no-orphan-active-work uses CS-Task ID header lookup and extracts parent CSID', () => {
    // The orphan-active-work fixture's CS-Task ID cell is `CS9-1`; the rule
    // must extract the `CS9` parent CSID and compare to done_cs9_*.md.
    const findings = run({ root: path.join(FIX, 'orphan-active-work'), now: FIXED_NOW });
    const hits = findings.filter(f => f.rule === 'no-orphan-active-work');
    expect(hits).toHaveLength(1);
    expect(hits[0].message).toContain('CS9');
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
      const byFile = findings.filter(f => f.file.endsWith('active_cs7_thing.md') && f.rule === 'unique-cs-state');
      expect(byFile).toEqual([]);
      // The other file still produces its finding (ignore is file-scoped).
      expect(findings.some(f => f.file.endsWith('done_cs7_thing.md'))).toBe(true);
    } finally {
      fs.writeFileSync(targetFile, original);
    }
  });

  // ---- CS65: planned/active clickstop plan-file schema ----------------------

  test.each([
    ['cs65-depends-on-happy', 'plan-has-depends-on'],
    ['cs65-parallel-safe-happy', 'plan-has-parallel-safe-with'],
    ['cs65-status-happy', 'plan-has-status-line'],
    ['cs65-required-sections-happy', 'plan-has-required-sections'],
    ['cs65-task-id-format-happy', 'plan-task-id-format'],
  ])('%s: %s happy path has no findings', (fixture) => {
    const findings = run({ root: path.join(FIX, fixture), now: FIXED_NOW });
    expect(findings).toEqual([]);
  });

  test.each([
    ['cs65-depends-on-missing', 'plan-has-depends-on', '`**Depends on:** ...`'],
    ['cs65-parallel-safe-missing', 'plan-has-parallel-safe-with', '`**Parallel-safe with:** ...`'],
    ['cs65-status-missing', 'plan-has-status-line', '`**Status:** ...`'],
    ['cs65-required-sections-missing', 'plan-has-required-sections', '## Acceptance'],
    ['cs65-task-id-format-invalid', 'plan-task-id-format', 'CS654-two'],
  ])('%s: emits %s warning', (fixture, rule, messagePart) => {
    const findings = run({ root: path.join(FIX, fixture), now: FIXED_NOW });
    expect(rules(findings)).toEqual([rule]);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].message).toContain(messagePart);
  });

  test('cs65 plan rules honor justified check:ignore comments', () => {
    const fs = require('fs');
    const root = path.join(FIX, 'cs65-depends-on-missing');
    const targetFile = path.join(root, 'project', 'clickstops', 'active', 'active_cs650_plan-schema.md');
    const original = fs.readFileSync(targetFile, 'utf8');
    try {
      fs.writeFileSync(targetFile,
        '<!-- check:ignore plan-has-depends-on — fixture intentionally omits dependency metadata -->\n' + original);
      const findings = run({ root, now: FIXED_NOW });
      expect(findings.filter(f => f.rule === 'plan-has-depends-on')).toEqual([]);
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

  test('kebabSlug: lowercase + non-alnum runs collapse to single hyphen', () => {
    expect(kebabSlug('Workboard Readability Restructure'))
      .toBe('workboard-readability-restructure');
    expect(kebabSlug('  Leading/trailing  '))
      .toBe('leading-trailing');
  });

  test('kebabSlug: `&` becomes `and`', () => {
    expect(kebabSlug('H1 ↔ filename consistency rules & guard'))
      .toBe('h1-filename-consistency-rules-and-guard');
  });

  test('parseClickstopFilename: matches active/planned/done with CS prefix and slug', () => {
    expect(parseClickstopFilename('active_cs62_workboard-readability-restructure.md'))
      .toEqual({ state: 'active', cs: 'CS62', slug: 'workboard-readability-restructure' });
    expect(parseClickstopFilename('done_cs7_thing.md'))
      .toEqual({ state: 'done', cs: 'CS7', slug: 'thing' });
    expect(parseClickstopFilename('not-a-clickstop.md')).toBeNull();
  });

  test('parseClickstopH1: em-dash variants — only U+2014 accepted', () => {
    expect(parseClickstopH1('# CS62 — Title')).toEqual({ cs: 'CS62', title: 'Title' });
    expect(parseClickstopH1('# CS62 - Title')).toEqual({ cs: null, title: null });
    expect(parseClickstopH1('# CS62 -- Title')).toEqual({ cs: null, title: null });
  });

  test('parseClickstopH1: skips leading blank/comment lines', () => {
    const text = '\n<!-- check:ignore foo -->\n\n# CS62 — Title\nbody\n';
    expect(parseClickstopH1(text)).toEqual({ cs: 'CS62', title: 'Title' });
  });
});
