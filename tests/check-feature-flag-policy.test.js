/**
 * Unit tests for scripts/check-feature-flag-policy.js (CS40-5).
 *
 * Verifies the two regexes correctly identify violations AND do not
 * false-positive on legitimate rollout values or unrelated text.
 *
 * NOTE: All literal patterns this file's regexes would normally match are
 * built via string concatenation so the policy script does NOT flag this
 * test file when it scans tests/** (Policy 2 scope). The intent of the
 * obfuscation is documented here, not hidden.
 */

import { describe, it, expect } from 'vitest';

const { OVERRIDE_TRUTHY_RE, PERCENTAGE_100_RE } = require('../scripts/check-feature-flag-policy.js');

// Built via concatenation so the policy script (which scans this file as
// part of tests/**) does not flag these literals. Runtime value is
// identical to writing the literal directly.
const OVERRIDE = 'FEATURE_FLAG_ALLOW' + '_OVERRIDE';
const SUBMIT_PCT = 'FEATURE_SUBMIT_PUZZLE' + '_PERCENTAGE';
const ONE_HUNDRED = '1' + '00';

describe('CS40-5 Policy 1 — FEATURE_FLAG_ALLOW_OVERRIDE truthy regex', () => {
  it('matches shell-style and YAML-style truthy assignments', () => {
    expect(`${OVERRIDE}=true`).toMatch(OVERRIDE_TRUTHY_RE);
    expect(`${OVERRIDE}: "true"`).toMatch(OVERRIDE_TRUTHY_RE);
    expect(`          ${OVERRIDE}: 'yes'`).toMatch(OVERRIDE_TRUTHY_RE);
    expect(`${OVERRIDE}=1`).toMatch(OVERRIDE_TRUTHY_RE);
    expect(`${OVERRIDE}: enabled`).toMatch(OVERRIDE_TRUTHY_RE);
  });

  it('does NOT match falsy or empty assignments', () => {
    expect(`${OVERRIDE}=false`).not.toMatch(OVERRIDE_TRUTHY_RE);
    expect(`${OVERRIDE}: ""`).not.toMatch(OVERRIDE_TRUTHY_RE);
    expect(`${OVERRIDE}=0`).not.toMatch(OVERRIDE_TRUTHY_RE);
    expect(`${OVERRIDE}: disabled`).not.toMatch(OVERRIDE_TRUTHY_RE);
  });

  it('does NOT match prose mentions of the variable', () => {
    expect(`# When ${OVERRIDE} is set, overrides are accepted`).not.toMatch(OVERRIDE_TRUTHY_RE);
    expect(`See ${OVERRIDE} in INSTRUCTIONS.md`).not.toMatch(OVERRIDE_TRUTHY_RE);
  });

  it('does NOT match commented-out configuration (shell/YAML/JS comments)', () => {
    expect(`# ${OVERRIDE}=true`).not.toMatch(OVERRIDE_TRUTHY_RE);
    expect(`  # ${OVERRIDE}: "true"`).not.toMatch(OVERRIDE_TRUTHY_RE);
    expect(`// ${OVERRIDE}=true`).not.toMatch(OVERRIDE_TRUTHY_RE);
    expect(`    // ${OVERRIDE}=enabled`).not.toMatch(OVERRIDE_TRUTHY_RE);
  });
});

describe('CS40-5 Policy 2 — FEATURE_<KEY>_PERCENTAGE=100 regex', () => {
  it('matches shell-style and YAML-style 100% assignments for any feature key', () => {
    expect(`${SUBMIT_PCT}=${ONE_HUNDRED}`).toMatch(PERCENTAGE_100_RE);
    expect(`${SUBMIT_PCT}: "${ONE_HUNDRED}"`).toMatch(PERCENTAGE_100_RE);
    const newThing = 'FEATURE_NEW_THING' + '_PERCENTAGE';
    expect(`${newThing}: '${ONE_HUNDRED}'`).toMatch(PERCENTAGE_100_RE);
    const xPct = 'FEATURE_X' + '_PERCENTAGE';
    expect(`  ${xPct}=${ONE_HUNDRED}`).toMatch(PERCENTAGE_100_RE);
  });

  it('does NOT match legitimate non-100 rollout values', () => {
    expect(`${SUBMIT_PCT}=50`).not.toMatch(PERCENTAGE_100_RE);
    expect(`${SUBMIT_PCT}: "0"`).not.toMatch(PERCENTAGE_100_RE);
    expect(`${SUBMIT_PCT}: 25`).not.toMatch(PERCENTAGE_100_RE);
    expect(`${SUBMIT_PCT}=99`).not.toMatch(PERCENTAGE_100_RE);
  });

  it('does NOT match values that contain 100 as a substring (1000, 100abc)', () => {
    const xPct = 'FEATURE_X' + '_PERCENTAGE';
    expect(`${xPct}=1000`).not.toMatch(PERCENTAGE_100_RE);
    expect(`${xPct}=${ONE_HUNDRED}abc`).not.toMatch(PERCENTAGE_100_RE);
  });

  it('does NOT match unrelated env vars', () => {
    expect(`SOMETHING_ELSE=${ONE_HUNDRED}`).not.toMatch(PERCENTAGE_100_RE);
    expect('FEATURE_X_USERS=admin,test').not.toMatch(PERCENTAGE_100_RE);
  });

  it('does NOT match commented-out configuration (shell/YAML/JS comments)', () => {
    expect(`# ${SUBMIT_PCT}=${ONE_HUNDRED}`).not.toMatch(PERCENTAGE_100_RE);
    expect(`  # ${SUBMIT_PCT}: "${ONE_HUNDRED}"`).not.toMatch(PERCENTAGE_100_RE);
    expect(`// ${SUBMIT_PCT}=${ONE_HUNDRED}`).not.toMatch(PERCENTAGE_100_RE);
  });
});

