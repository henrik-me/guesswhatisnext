/**
 * CS41-12 — old-server-on-new-schema smoke (pre-traffic-shift).
 *
 * Workflow YAML structural tests. The CS41-12 smoke step's *position* in
 * the deploy sequence is the entire correctness contract: it must run
 * AFTER the migration applies the new schema but BEFORE traffic shifts to
 * the new revision. If a future edit reorders these steps, the gate is
 * silently lost — only the YAML order encodes that invariant.
 *
 * We intentionally avoid pulling in a YAML parser dependency: line-position
 * checks against the canonical step header strings are sufficient to catch
 * the regressions we care about (step deleted, step reordered, step
 * collapsed into another).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WF_DIR = join(__dirname, '..', '.github', 'workflows');

function lineOf(content, headerSubstring) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(headerSubstring)) return i + 1;
  }
  return -1;
}

describe('CS41-12 deploy YAML structure (prod-deploy.yml)', () => {
  const yaml = readFileSync(join(WF_DIR, 'prod-deploy.yml'), 'utf8');

  const lineCapture = lineOf(yaml, '- name: Capture old revision (CS41-12 prep)');
  const lineMigrate = lineOf(yaml, '- name: Run DB migrations');
  const lineCs4112Smoke = lineOf(yaml, '- name: Smoke OLD revision against NEW schema (CS41-12)');
  const lineDeploy = lineOf(yaml, '- name: Deploy to production Container App');

  it('contains the CS41-12 capture step', () => {
    expect(lineCapture).toBeGreaterThan(0);
  });

  it('contains the CS41-12 smoke step', () => {
    expect(lineCs4112Smoke).toBeGreaterThan(0);
  });

  it('contains the migration step (CS41-4 dependency)', () => {
    expect(lineMigrate).toBeGreaterThan(0);
  });

  it('contains the traffic-shift step (az containerapp update)', () => {
    expect(lineDeploy).toBeGreaterThan(0);
  });

  it('orders capture BEFORE migration (must capture old FQDN before schema changes)', () => {
    expect(lineCapture).toBeLessThan(lineMigrate);
  });

  it('orders CS41-12 smoke AFTER migration (smoke must see the new schema)', () => {
    expect(lineCs4112Smoke).toBeGreaterThan(lineMigrate);
  });

  it('orders CS41-12 smoke BEFORE traffic shift (must abort pre-cutover)', () => {
    expect(lineCs4112Smoke).toBeLessThan(lineDeploy);
  });

  it('CS41-12 smoke uses the prod smoke-user secret', () => {
    // Must be the prod variant; staging variant would let a misconfigured
    // workflow silently authenticate against the wrong DB.
    const captureToDeploy = yaml
      .split('\n')
      .slice(lineCs4112Smoke - 1, lineDeploy - 1)
      .join('\n');
    expect(captureToDeploy).toMatch(/SMOKE_USER_PASSWORD_PROD/);
    expect(captureToDeploy).not.toMatch(/SMOKE_USER_PASSWORD_STAGING/);
  });

  it('CS41-12 smoke surface error string carries the operator-grep marker', () => {
    expect(yaml).toMatch(/MIGRATION BREAKS OLD SERVER/);
  });
});

describe('CS41-12 deploy YAML structure (staging-deploy.yml)', () => {
  const yaml = readFileSync(join(WF_DIR, 'staging-deploy.yml'), 'utf8');

  const lineMigrate = lineOf(yaml, '- name: Run DB migrations');
  const lineResolve = lineOf(yaml, '- name: Resolve OLD revision FQDN (CS41-12 prep)');
  const lineCs4112Smoke = lineOf(yaml, '- name: Smoke OLD revision against NEW schema (CS41-12)');
  const lineNewFqdn = lineOf(yaml, '- name: Get new revision FQDN (CS41-1)');
  const lineTraffic = lineOf(yaml, '- name: Switch traffic to new revision');

  it('contains the CS41-12 resolve-old-FQDN step', () => {
    expect(lineResolve).toBeGreaterThan(0);
  });

  it('contains the CS41-12 smoke step', () => {
    expect(lineCs4112Smoke).toBeGreaterThan(0);
  });

  it('contains the migration step (CS41-4 dependency)', () => {
    expect(lineMigrate).toBeGreaterThan(0);
  });

  it('contains the traffic-shift step', () => {
    expect(lineTraffic).toBeGreaterThan(0);
  });

  it('orders resolve-old-FQDN AFTER migration (depends on MIGRATION_STATUS env)', () => {
    expect(lineResolve).toBeGreaterThan(lineMigrate);
  });

  it('orders CS41-12 smoke AFTER resolve-old-FQDN', () => {
    expect(lineCs4112Smoke).toBeGreaterThan(lineResolve);
  });

  it('orders CS41-12 smoke BEFORE the CS41-1 new-revision smoke', () => {
    // CS41-12 must fail (and abort) before we waste cycles smoking the
    // new revision; equally important, it must run before traffic shifts.
    expect(lineCs4112Smoke).toBeLessThan(lineNewFqdn);
  });

  it('orders CS41-12 smoke BEFORE traffic shift (must abort pre-cutover)', () => {
    expect(lineCs4112Smoke).toBeLessThan(lineTraffic);
  });

  it('CS41-12 smoke uses the staging smoke-user secret', () => {
    const window = yaml
      .split('\n')
      .slice(lineCs4112Smoke - 1, lineNewFqdn - 1)
      .join('\n');
    expect(window).toMatch(/SMOKE_USER_PASSWORD_STAGING/);
    expect(window).not.toMatch(/SMOKE_USER_PASSWORD_PROD/);
  });

  it('CS41-12 smoke is gated on MIGRATION_STATUS=applied (no migration → no risk)', () => {
    const window = yaml
      .split('\n')
      .slice(lineResolve - 1, lineNewFqdn - 1)
      .join('\n');
    expect(window).toMatch(/MIGRATION_STATUS == 'applied'/);
  });

  it('CS41-12 surface error string carries the operator-grep marker', () => {
    expect(yaml).toMatch(/MIGRATION BREAKS OLD STAGING SERVER/);
  });
});

describe('CS41-9 deploy YAML structure (staging-deploy.yml pre-cutover gates)', () => {
  // The CS41-9 invariant: any failure in smoke / AI-verify on the new
  // revision must abort the deploy BEFORE the traffic-shift step so the
  // OLD revision keeps serving real (smoke-test) traffic. The render-
  // deploy-summary step, conversely, must run AFTER the traffic shift so
  // the summary can describe the post-cutover state on the success path
  // (and, via `if: always()`, the pre-cutover-abort state on failure).
  // If a future edit reorders any of these, the pre-cutover guarantee is
  // silently lost — only the YAML order encodes the contract.
  const yaml = readFileSync(join(WF_DIR, 'staging-deploy.yml'), 'utf8');

  const lineMigrate = lineOf(yaml, '- name: Run DB migrations');
  const lineSmokeOld = lineOf(yaml, '- name: Smoke OLD revision against NEW schema (CS41-12)');
  const lineNewFqdn = lineOf(yaml, '- name: Get new revision FQDN (CS41-1)');
  const lineSmokeNew = lineOf(yaml, '- name: Smoke deployed revision (CS41-1+2)');
  const lineAiVerify = lineOf(yaml, '- name: AI telemetry verification (CS41-3)');
  const lineTraffic = lineOf(yaml, '- name: Switch traffic to new revision');
  const lineSummary = lineOf(yaml, '- name: Render deploy summary (CS41-8)');

  it('contains all gate steps relevant to CS41-9', () => {
    expect(lineMigrate).toBeGreaterThan(0);
    expect(lineSmokeOld).toBeGreaterThan(0);
    expect(lineNewFqdn).toBeGreaterThan(0);
    expect(lineSmokeNew).toBeGreaterThan(0);
    expect(lineAiVerify).toBeGreaterThan(0);
    expect(lineTraffic).toBeGreaterThan(0);
    expect(lineSummary).toBeGreaterThan(0);
  });

  it('Smoke OLD revision runs AFTER Run DB migrations (CS41-12 contract)', () => {
    expect(lineSmokeOld).toBeGreaterThan(lineMigrate);
  });

  it('Smoke OLD revision runs BEFORE Smoke NEW revision', () => {
    expect(lineSmokeOld).toBeLessThan(lineSmokeNew);
  });

  it('Smoke NEW revision runs BEFORE traffic set (pre-cutover gate)', () => {
    expect(lineSmokeNew).toBeLessThan(lineTraffic);
  });

  it('AI telemetry verification runs AFTER Smoke NEW revision', () => {
    expect(lineAiVerify).toBeGreaterThan(lineSmokeNew);
  });

  it('AI telemetry verification runs BEFORE traffic set (pre-cutover gate)', () => {
    expect(lineAiVerify).toBeLessThan(lineTraffic);
  });

  it('Render deploy summary runs AFTER traffic set (post-cutover semantic)', () => {
    expect(lineSummary).toBeGreaterThan(lineTraffic);
  });
});
