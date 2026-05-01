'use strict';

const fs = require('fs');
const path = require('path');
const { checkPrBody, run } = require('../scripts/check-pr-body.js');

const FIXTURES = path.join(__dirname, 'fixtures', 'check-pr-body');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
}

function runFixture(name) {
  const fixture = loadFixture(name);
  return run({
    pr: 123,
    fetchPrJson(_prNumber, command) {
      return fixture[command];
    },
  });
}

describe('check-pr-body', () => {
  test('failure messages link to canonical PR-body section docs', () => {
    const findings = runFixture('paginated-files-complete');
    expect(findings).toHaveLength(3);
    expect(findings.find(finding => finding.startsWith('PR body missing exact'))).toContain('See: REVIEWS.md#local-review-loop');
    expect(findings.find(finding => finding.startsWith("'## Container Validation'"))).toContain('See: OPERATIONS.md#cold-start-container-validation');
    expect(findings.find(finding => finding.startsWith("'## Telemetry Validation'"))).toContain('See: CONVENTIONS.md#4a-telemetry--observability-mandatory-for-all-new-work');
  });

  test('passes for a full code/config PR body', () => {
    expect(runFixture('passing')).toEqual([]);
  });

  test('flags a missing Local Review section', () => {
    const findings = runFixture('missing-local-review');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("## Local Review");
  });

  test('flags a missing Container Validation section for code PRs', () => {
    const findings = runFixture('missing-container-validation');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Container Validation');
  });

  test('uses the complete paginated files payload for PR classification', () => {
    const findings = runFixture('paginated-files-complete');
    expect(findings).toHaveLength(3);
    expect(findings.join('\n')).toContain('Local Review');
    expect(findings.join('\n')).toContain('Container Validation');
    expect(findings.join('\n')).toContain('Telemetry Validation');
  });

  test('does not count failed validation rows as passing', () => {
    const findings = runFixture('failing-validation-row');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Container Validation');
  });

  test('requires documented Container Validation table columns', () => {
    const findings = checkPrBody({
      body: '## Local Review\n| Round | Finding | Fix |\n|---|---|---|\n| 1 | Clean | clean - no issues found |\n\n## Container Validation\n| Whatever |\n|---|\n| ✅ pass |\n\n## Telemetry Validation\n- [x] No telemetry changes needed for probe fixture.',
      files: ['server/index.js'],
      commitOids: new Set(),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Cycle, Timestamp (UTC), Result, and Notes');
  });

  test('requires the Container Validation timestamp column to specify UTC', () => {
    const findings = checkPrBody({
      body: '## Local Review\n| Round | Finding | Fix |\n|---|---|---|\n| 1 | Clean | clean - no issues found |\n\n## Container Validation\n| Cycle | Timestamp | Result | Notes |\n|---|---|---|---|\n| Pre-local-review | 2026-05-01T12:00Z | ✅ pass | local validation completed |\n\n## Telemetry Validation\n- [x] No telemetry changes needed for probe fixture.',
      files: ['server/index.js'],
      commitOids: new Set(),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Cycle, Timestamp (UTC), Result, and Notes');
  });

  test('rejects non-exempt operational heading suffixes even with evidence', () => {
    const findings = checkPrBody({
      body: '## Local Review\n| Round | Finding | Fix |\n|---|---|---|\n| 1 | Clean | clean - no issues found |\n\n## Container Validation: custom suffix\n| Cycle | Timestamp (UTC) | Result | Notes |\n|---|---|---|---|\n| Pre-local-review | 2026-05-01T12:00Z | ✅ pass | local validation completed |\n\n## Telemetry Validation: custom suffix\n- [x] No telemetry changes needed for probe fixture.',
      files: ['server/index.js'],
      commitOids: new Set(),
    });
    expect(findings).toHaveLength(2);
    expect(findings.join('\n')).toContain('heading must be exact');
  });

  test('does not allow operational body prose to exempt non-exact headings', () => {
    const findings = checkPrBody({
      body: '## Local Review\n| Round | Finding | Fix |\n|---|---|---|\n| 1 | Clean | clean - no issues found |\n\n## Container Validation: custom suffix\nnot applicable (docs-only)\n\n## Telemetry Validation: custom suffix\nnot applicable (docs-only)',
      files: ['README.md'],
      commitOids: new Set(),
    });
    expect(findings).toHaveLength(2);
    expect(findings.join('\n')).toContain('heading must be exact');
  });

  test('requires operational not-applicable suffixes to start with the marker', () => {
    const findings = checkPrBody({
      body: '## Local Review: not applicable (docs-only)\n\n## Container Validation: custom suffix not applicable (docs-only)\n\n## Telemetry Validation: custom suffix not applicable (docs-only)',
      files: ['README.md'],
      commitOids: new Set(),
    });
    expect(findings).toHaveLength(2);
    expect(findings.join('\n')).toContain('heading must be exact');
  });

  test('does not treat not passing as passing validation evidence', () => {
    const findings = checkPrBody({
      body: '## Local Review\n| Round | Finding | Fix |\n|---|---|---|\n| 1 | Clean | clean - no issues found |\n\n## Container Validation\n| Cycle | Timestamp (UTC) | Result | Notes |\n|---|---|---|---|\n| Pre-local-review | 2026-05-01T12:00Z | not passing | local validation incomplete |\n\n## Telemetry Validation\n- [x] No telemetry changes needed for probe fixture.',
      files: ['server/index.js'],
      commitOids: new Set(),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Container Validation');
  });

  test('allows Container Validation notes to mention previous failures when Result passes', () => {
    expect(checkPrBody({
      body: '## Local Review\n| Round | Finding | Fix |\n|---|---|---|\n| 1 | Clean | clean - no issues found |\n\n## Container Validation\n| Cycle | Timestamp (UTC) | Result | Notes |\n|---|---|---|---|\n| Pre-local-review | 2026-05-01T12:00Z | ✅ pass | failed previously; reran clean |\n\n## Telemetry Validation\n- [x] No telemetry changes needed for probe fixture.',
      files: ['server/index.js'],
      commitOids: new Set(),
    })).toEqual([]);
  });

  test('allows docs-only not-applicable sections', () => {
    expect(runFixture('docs-only-escape')).toEqual([]);
  });

  test('allows docs-only Local Review exemption with inline clarification', () => {
    expect(checkPrBody({
      body: '## Local Review: not applicable (docs-only — no code changed)\n\n## Container Validation: not applicable (docs-only)\n\n## Telemetry Validation: not applicable (docs-only)',
      files: ['README.md'],
      commitOids: new Set(),
    })).toEqual([]);
  });

  test('rejects docs-only Local Review suffixes that are not exemptions', () => {
    const findings = checkPrBody({
      body: '## Local Review: custom suffix\n| Round | Finding | Fix |\n|---|---|---|\n| 1 | Clean | clean - no issues found |\n\n## Container Validation: not applicable (docs-only)\n\n## Telemetry Validation: not applicable (docs-only)',
      files: ['README.md'],
      commitOids: new Set(),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("missing exact '## Local Review'");
  });

  test('requires Local Review not-applicable marker in the heading', () => {
    const findings = checkPrBody({
      body: '## Local Review\n\nnot applicable (docs-only)\n\n## Container Validation: not applicable (docs-only)\n\n## Telemetry Validation: not applicable (docs-only)',
      files: ['README.md'],
      commitOids: new Set(),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('must contain a markdown table');
  });

  test('treats files under docs as docs-only', () => {
    expect(runFixture('docs-folder-escape')).toEqual([]);
  });

  test('allows CI-config-only validation escapes while still requiring Local Review evidence', () => {
    expect(runFixture('ci-only-escape')).toEqual([]);
  });

  test('allows documented telemetry validation checklists for code PRs', () => {
    expect(runFixture('telemetry-checklist')).toEqual([]);
  });

  test('allows CI-config-only escapes for yaml workflow files', () => {
    expect(runFixture('ci-yaml-escape')).toEqual([]);
  });

  test('flags malformed Local Review tables', () => {
    const findings = runFixture('malformed-local-review-table');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Round, Finding, and Fix');
  });

  test('requires the documented Local Review Finding column', () => {
    const findings = checkPrBody({
      body: '## Local Review\n| Round | Fix |\n|---|---|\n| 1 | clean - no issues found |\n\n## Container Validation: not applicable (tooling-only)\n\n## Telemetry Validation: not applicable (tooling-only)',
      files: ['scripts/check-pr-body.js'],
      commitOids: new Set(),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Round, Finding, and Fix');
  });

  test('flags non-numeric Local Review rounds', () => {
    const findings = runFixture('malformed-local-review-round');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('Round >= 1');
  });

  test('allows tooling-only not-applicable markers with inline clarification', () => {
    expect(runFixture('tooling-only-with-clarification')).toEqual([]);
  });

  test('allows hybrid docs+tooling not-applicable categories', () => {
    expect(runFixture('hybrid-category-docs-tooling')).toEqual([]);
  });

  test('allows N/A as a docs-only operational-section synonym', () => {
    expect(runFixture('na-synonym-docs-only')).toEqual([]);
  });

  test('keeps bullet-form Local Review sections rejected', () => {
    const findings = runFixture('bullet-form-local-review');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('must contain a markdown table');
    expect(findings[0]).toContain('| Round | Finding | Fix |');
  });

  test('rejects unknown not-applicable categories', () => {
    const findings = runFixture('bogus-category-rejected');
    expect(findings).toHaveLength(2);
    expect(findings.join('\n')).toContain('Container Validation');
    expect(findings.join('\n')).toContain('Telemetry Validation');
  });

  test('rejects non-canonical partial category tokens', () => {
    const findings = runFixture('ci-only-category-rejected');
    expect(findings).toHaveLength(2);
    expect(findings.join('\n')).toContain('Container Validation');
    expect(findings.join('\n')).toContain('Telemetry Validation');
  });

  test('rejects whitespace-only not-applicable category separators', () => {
    const findings = runFixture('whitespace-only-category-separator-rejected');
    expect(findings).toHaveLength(2);
    expect(findings.join('\n')).toContain('Container Validation');
    expect(findings.join('\n')).toContain('Telemetry Validation');
  });

  test('rejects malformed hybrid category suffixes', () => {
    const findings = runFixture('malformed-hybrid-category-rejected');
    expect(findings).toHaveLength(2);
    expect(findings.join('\n')).toContain('Container Validation');
    expect(findings.join('\n')).toContain('Telemetry Validation');
  });

  test('rejects tooling-only claims when changed files include runtime code', () => {
    const findings = runFixture('tooling-only-claim-but-files-are-code');
    expect(findings).toHaveLength(2);
    expect(findings.join('\n')).toContain('Container Validation');
    expect(findings.join('\n')).toContain('Telemetry Validation');
  });

  test('rejects standalone docs-only claims for mixed docs and tooling files', () => {
    const findings = runFixture('docs-only-claim-but-files-are-tooling');
    expect(findings).toHaveLength(2);
    expect(findings.join('\n')).toContain('Container Validation');
    expect(findings.join('\n')).toContain('Telemetry Validation');
  });
});
