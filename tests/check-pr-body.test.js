'use strict';

const fs = require('fs');
const path = require('path');
const { run } = require('../scripts/check-pr-body.js');

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

  test('allows docs-only not-applicable sections', () => {
    expect(runFixture('docs-only-escape')).toEqual([]);
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
    expect(findings[0]).toContain('Round and Fix');
  });
});
