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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const {
  OVERRIDE_TRUTHY_RE,
  PERCENTAGE_100_RE,
  scanEnvObjectForm,
  jsonHasOverrideTruthy,
} = require('../scripts/check-feature-flag-policy.js');

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

// CS40 follow-up (GPT-5.4 review HIGH): ARM/Bicep env-object form
//   { name: 'FEATURE_FLAG_ALLOW_OVERRIDE', value: 'true' }
// crosses multiple lines and is invisible to OVERRIDE_TRUTHY_RE. These tests
// exercise the file-scanning code path of `scanEnvObjectForm` directly.
describe('CS40 follow-up Policy 1 — ARM/Bicep env-object form (name/value)', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs40fu-'));
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  function writeFixture(name, content) {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, content, 'utf8');
    return p;
  }

  it('detects truthy override in JSON env-object form (ARM template shape)', () => {
    const arm = {
      properties: {
        template: {
          containers: [{
            name: 'app',
            env: [
              { name: 'NODE_ENV', value: 'production' },
              { name: OVERRIDE, value: 'true' },
            ],
          }],
        },
      },
    };
    const file = writeFixture('aca.json', JSON.stringify(arm, null, 2));
    const findings = scanEnvObjectForm(file);
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe(file);
  });

  it('does NOT flag JSON env-objects without the override flag', () => {
    const arm = {
      env: [
        { name: 'NODE_ENV', value: 'production' },
        { name: 'PORT', value: '3000' },
        { name: 'FEATURE_SUBMIT_PUZZLE_PERCENTAGE', value: '50' },
      ],
    };
    const file = writeFixture('clean.json', JSON.stringify(arm, null, 2));
    expect(scanEnvObjectForm(file)).toEqual([]);
  });

  it('does NOT flag JSON env-objects with the flag set falsy', () => {
    const arm = { env: [{ name: OVERRIDE, value: 'false' }] };
    const file = writeFixture('falsy.json', JSON.stringify(arm, null, 2));
    expect(scanEnvObjectForm(file)).toEqual([]);
  });

  // Fail-closed: a malformed JSON template could hide a truthy override from
  // the policy guard. The scanner must emit a finding (so CI fails) rather
  // than silently skipping the file.
  it('emits a Policy 1 finding for malformed JSON (fail closed)', () => {
    const file = writeFixture('broken.json', '{ "env": [ { "name": "X", "value": ');
    const findings = scanEnvObjectForm(file);
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe(file);
    expect(findings[0].line).toBe(1);
    expect(findings[0].snippet).toMatch(/malformed JSON; policy scan could not be applied/);
  });

  it('detects truthy override in Bicep env-object form (multi-line name/value)', () => {
    // Hand-crafted to mirror what a Container App bicep authoring would produce.
    const bicep = [
      "resource app 'Microsoft.App/containerApps@2023-05-01' = {",
      '  properties: {',
      '    template: {',
      '      containers: [',
      '        {',
      '          name: \'app\'',
      '          env: [',
      '            {',
      `              name: '${OVERRIDE}'`,
      "              value: 'true'",
      '            }',
      '          ]',
      '        }',
      '      ]',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const file = writeFixture('aca.bicep', bicep);
    const findings = scanEnvObjectForm(file);
    expect(findings).toHaveLength(1);
    expect(findings[0].snippet).toMatch(/value:\s*'true'/);
  });

  it('does NOT flag Bicep env-objects with the flag set falsy', () => {
    const bicep = [
      'env: [',
      '  {',
      `    name: '${OVERRIDE}'`,
      "    value: 'false'",
      '  }',
      ']',
    ].join('\n');
    const file = writeFixture('falsy.bicep', bicep);
    expect(scanEnvObjectForm(file)).toEqual([]);
  });

  it('does NOT match truthy-token prefixes such as "trueish" or "100"', () => {
    const bicep = [
      `name: '${OVERRIDE}'`,
      "value: 'trueish'",
      '',
      `name: '${OVERRIDE}'`,
      "value: '100'",
    ].join('\n');
    const file = writeFixture('prefix.bicep', bicep);
    expect(scanEnvObjectForm(file)).toEqual([]);
  });

  it('detects truthy override when Bicep value appears BEFORE name (reverse order)', () => {
    const bicep = [
      'env: [',
      '  {',
      "    value: 'true'",
      `    name: '${OVERRIDE}'`,
      '  }',
      ']',
    ].join('\n');
    const file = writeFixture('reverse.bicep', bicep);
    const findings = scanEnvObjectForm(file);
    expect(findings).toHaveLength(1);
  });

  it('does NOT flag commented-out Bicep env-objects', () => {
    const bicep = [
      '// {',
      `//   name: '${OVERRIDE}'`,
      "//   value: 'true'",
      '// }',
    ].join('\n');
    const file = writeFixture('commented.bicep', bicep);
    expect(scanEnvObjectForm(file)).toEqual([]);
  });

  it('does NOT cross object boundaries: truthy value in neighbouring env object stays isolated', () => {
    // First object has a truthy value but is NOT the override flag; second
    // object IS the override flag but is falsy. Brace-bounded pairing must
    // keep them separate.
    const bicep = [
      'env: [',
      '  {',
      "    name: 'NODE_ENV'",
      "    value: 'true'",
      '  }',
      '  {',
      `    name: '${OVERRIDE}'`,
      "    value: 'false'",
      '  }',
      ']',
    ].join('\n');
    const file = writeFixture('neighbours.bicep', bicep);
    expect(scanEnvObjectForm(file)).toEqual([]);
  });

  it('detects truthy override on a single-line Bicep env-object literal', () => {
    const bicep = `env: [ { name: '${OVERRIDE}', value: 'true' } ]`;
    const file = writeFixture('inline.bicep', bicep);
    const findings = scanEnvObjectForm(file);
    expect(findings).toHaveLength(1);
  });

  it('detects truthy override when name and { are on the same line', () => {
    const bicep = [
      `env: [ { name: '${OVERRIDE}'`,
      "    value: 'true'",
      '  } ]',
    ].join('\n');
    const file = writeFixture('open-same-line.bicep', bicep);
    const findings = scanEnvObjectForm(file);
    expect(findings).toHaveLength(1);
  });

  it('does NOT match `name`/`value` substrings inside longer identifiers (word boundary)', () => {
    // `hostname:` contains `name:` and `somevalue:` contains `value:`.
    // Without `\b` boundaries on the BICEP_NAME_RE / BICEP_VALUE_TRUTHY_RE
    // patterns these would falsely satisfy the pair-detection inside the
    // same braces, producing a spurious finding. The override flag never
    // appears here as a real `name:` entry.
    const bicep = [
      'env: [',
      '  {',
      `    hostname: '${OVERRIDE}'`,
      "    somevalue: 'true'",
      '  }',
      ']',
    ].join('\n');
    const file = writeFixture('confusable-identifiers.bicep', bicep);
    expect(scanEnvObjectForm(file)).toEqual([]);
  });

  // R4 Copilot finding: braces inside a `//` line comment must NOT throw off
  // the brace-pairing walk in `enclosingBraceLineRange`. Here the comment on
  // the line above the real env entry contains an unbalanced `{` that, before
  // the comment-strip pass was added, caused the walker to pair the override
  // `name:` with the truthy `value:` from a *different* (sibling) object.
  it('does NOT mis-pair across braces hidden inside line comments', () => {
    const bicep = [
      'env: [',
      '  {',
      "    name: 'NEIGHBOUR'",
      "    value: 'true'",
      '  }',
      "  // example shape from docs: { name: 'X', value: 'true' }",
      '  {',
      `    name: '${OVERRIDE}'`,
      "    value: 'false'",
      '  }',
      ']',
    ].join('\n');
    const file = writeFixture('comment-braces.bicep', bicep);
    expect(scanEnvObjectForm(file)).toEqual([]);
  });
});

// R4 Copilot finding: the JSON walker compared `node.name` with `===`, which
// would miss a lowercase-misspelled override entry that the single-line regex
// (case-insensitive) would otherwise catch. The walker must be case-insensitive
// on the flag name to keep the two scan paths consistent.
describe('CS40 follow-up Policy 1 — JSON walker case-insensitivity', () => {
  it('detects lowercase-misspelled override flag in JSON env-object form', () => {
    const arm = {
      env: [
        { name: 'feature_flag_allow_override', value: 'true' },
      ],
    };
    expect(jsonHasOverrideTruthy(arm)).toBe(true);
  });

  it('detects mixed-case override flag in JSON env-object form', () => {
    const arm = {
      env: [
        { name: 'Feature_Flag_Allow_Override', value: 'YES' },
      ],
    };
    expect(jsonHasOverrideTruthy(arm)).toBe(true);
  });

  it('does NOT match unrelated string-typed name values', () => {
    expect(jsonHasOverrideTruthy({ name: 'NODE_ENV', value: 'true' })).toBe(false);
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

