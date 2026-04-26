/**
 * CS41-5 — rollback verification with explicit revision targeting.
 *
 * Workflow YAML structural tests. CS41-5 enhances the existing rollback
 * path in BOTH deploy YAMLs by re-running CS41-1 smoke + CS41-3 AI verify
 * AGAINST the rolled-back revision specifically. The contract:
 *
 *   1. The verification step EXISTS in both workflows.
 *   2. It is gated on the same condition that triggered the rollback step
 *      (so it fires exactly when rollback fired, not on healthy deploys).
 *   3. It runs AFTER the existing "Rollback on failure" action step (the
 *      rollback must complete before we verify the rolled-back revision).
 *   4. It surfaces the operator-grep marker "ROLLBACK TARGET ALSO UNHEALTHY"
 *      so on-call can distinguish this incident mode from CS41-12's
 *      "MIGRATION BREAKS OLD SERVER" annotation (different playbooks).
 *
 * Order matters: if a future edit reorders or deletes any of these, the
 * rollback-verification guarantee is silently lost.
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

describe('CS41-5 rollback verification (prod-deploy.yml)', () => {
  const yaml = readFileSync(join(WF_DIR, 'prod-deploy.yml'), 'utf8');

  const lineRollback = lineOf(yaml, '- name: Rollback on failure');
  const lineCs415 = lineOf(yaml, '- name: Rollback verification (CS41-5)');
  const lineFailIfUnhealthy = lineOf(yaml, '- name: Fail if unhealthy');

  it('contains the CS41-5 rollback verification step', () => {
    expect(lineCs415).toBeGreaterThan(0);
  });

  it('contains the existing Rollback on failure step', () => {
    expect(lineRollback).toBeGreaterThan(0);
  });

  it('CS41-5 runs AFTER the Rollback on failure step', () => {
    expect(lineCs415).toBeGreaterThan(lineRollback);
  });

  it('CS41-5 runs BEFORE the Fail if unhealthy gate (so its annotations land first)', () => {
    expect(lineFailIfUnhealthy).toBeGreaterThan(0);
    expect(lineCs415).toBeLessThan(lineFailIfUnhealthy);
  });

  it('CS41-5 is gated on the same condition that triggers rollback', () => {
    // The prod rollback step gates on smoke-exit != 0 OR healthcheck.healthy != 'true'.
    // CS41-5 must fire on the same condition (not `if: failure()`) so it
    // ONLY runs when rollback fired, not on unrelated late-job failures.
    const window = yaml.split('\n').slice(lineCs415 - 1, lineCs415 + 5).join('\n');
    expect(window).toMatch(/steps\.smoke\.outputs\.smoke-exit != '0'/);
    expect(window).toMatch(/steps\.healthcheck\.outputs\.healthy != 'true'/);
  });

  it('CS41-5 uses the prod smoke-user secret (not staging)', () => {
    const window = yaml
      .split('\n')
      .slice(lineCs415 - 1, lineFailIfUnhealthy - 1)
      .join('\n');
    expect(window).toMatch(/SMOKE_USER_PASSWORD_PROD/);
    expect(window).not.toMatch(/SMOKE_USER_PASSWORD_STAGING/);
  });

  it('CS41-5 captures rollback revision via traffic[?weight==100]', () => {
    const window = yaml
      .split('\n')
      .slice(lineCs415 - 1, lineFailIfUnhealthy - 1)
      .join('\n');
    expect(window).toMatch(/ROLLBACK_REVISION_NAME=/);
    expect(window).toMatch(/weight==/);
  });

  it('CS41-5 reuses scripts/smoke.js and scripts/verify-ai.js', () => {
    const window = yaml
      .split('\n')
      .slice(lineCs415 - 1, lineFailIfUnhealthy - 1)
      .join('\n');
    expect(window).toMatch(/node scripts\/smoke\.js/);
    expect(window).toMatch(/node scripts\/verify-ai\.js/);
  });

  it('CS41-5 surfaces the ROLLBACK TARGET ALSO UNHEALTHY operator-grep marker', () => {
    expect(yaml).toMatch(/ROLLBACK TARGET ALSO UNHEALTHY/);
  });

  it('CS41-5 AI verify is warning-only (does not undo successful rollback smoke)', () => {
    const window = yaml
      .split('\n')
      .slice(lineCs415 - 1, lineFailIfUnhealthy - 1)
      .join('\n');
    // The AI verify call wraps in `set +e` / `set -e` so a non-zero exit
    // does NOT abort the step; it then emits ::warning:: rather than ::error::.
    expect(window).toMatch(/set \+e/);
    expect(window).toMatch(/AI_VERIFY_OUTPUT_PATH=rollback-ai-verification\.json/);
    expect(window).toMatch(/::warning::CS41-5: AI/);
  });
});

describe('CS41-5 rollback verification (staging-deploy.yml)', () => {
  const yaml = readFileSync(join(WF_DIR, 'staging-deploy.yml'), 'utf8');

  const lineRollback = lineOf(yaml, '- name: Rollback on failure');
  const lineCs415 = lineOf(yaml, '- name: Rollback verification (CS41-5)');
  const lineTagDeployment = lineOf(yaml, '- name: Tag deployment');

  it('contains the CS41-5 rollback verification step', () => {
    expect(lineCs415).toBeGreaterThan(0);
  });

  it('contains the existing Rollback on failure step', () => {
    expect(lineRollback).toBeGreaterThan(0);
  });

  it('CS41-5 runs AFTER the Rollback on failure step', () => {
    expect(lineCs415).toBeGreaterThan(lineRollback);
  });

  it('CS41-5 runs BEFORE Tag deployment (verification belongs in the deploy job)', () => {
    expect(lineTagDeployment).toBeGreaterThan(0);
    expect(lineCs415).toBeLessThan(lineTagDeployment);
  });

  it('CS41-5 is gated on failure() && current-revision (mirrors rollback gating)', () => {
    const window = yaml.split('\n').slice(lineCs415 - 1, lineCs415 + 5).join('\n');
    expect(window).toMatch(/if: failure\(\) && steps\.deploy\.outputs\.current-revision != ''/);
  });

  it('CS41-5 uses the staging smoke-user secret (not prod)', () => {
    const window = yaml
      .split('\n')
      .slice(lineCs415 - 1, lineTagDeployment - 1)
      .join('\n');
    expect(window).toMatch(/SMOKE_USER_PASSWORD_STAGING/);
    expect(window).not.toMatch(/SMOKE_USER_PASSWORD_PROD/);
  });

  it('CS41-5 captures rollback revision via traffic[?weight==100]', () => {
    const window = yaml
      .split('\n')
      .slice(lineCs415 - 1, lineTagDeployment - 1)
      .join('\n');
    expect(window).toMatch(/ROLLBACK_REVISION_NAME=/);
    expect(window).toMatch(/weight==/);
  });

  it('CS41-5 reuses scripts/smoke.js and scripts/verify-ai.js', () => {
    const window = yaml
      .split('\n')
      .slice(lineCs415 - 1, lineTagDeployment - 1)
      .join('\n');
    expect(window).toMatch(/node scripts\/smoke\.js/);
    expect(window).toMatch(/node scripts\/verify-ai\.js/);
  });

  it('CS41-5 surfaces the ROLLBACK TARGET ALSO UNHEALTHY operator-grep marker', () => {
    expect(yaml).toMatch(/ROLLBACK TARGET ALSO UNHEALTHY/);
  });

  it('CS41-5 AI verify is warning-only (does not undo successful rollback smoke)', () => {
    const window = yaml
      .split('\n')
      .slice(lineCs415 - 1, lineTagDeployment - 1)
      .join('\n');
    expect(window).toMatch(/set \+e/);
    expect(window).toMatch(/AI_VERIFY_OUTPUT_PATH=rollback-ai-verification\.json/);
    expect(window).toMatch(/::warning::CS41-5: AI/);
  });
});
