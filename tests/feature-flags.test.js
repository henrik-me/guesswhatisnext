/**
 * Feature flag evaluation tests.
 */

const {
  FEATURE_FLAGS,
  clampRolloutPercentage,
  evaluateFeatureDetailed,
  evaluateFeatureFlag,
  getFeatureFlags,
  getRolloutBucket,
  getStableRolloutKey,
  isFeatureEnabled,
  parseOverrideValue,
} = require('../server/feature-flags');

const ENABLED_OVERRIDE_VALUES = ['1', 'true', 'yes', 'on', 'enable', 'enabled'];
const DISABLED_OVERRIDE_VALUES = ['0', 'false', 'no', 'off', 'disable', 'disabled'];
const DETAILED_REASONS = new Set([
  'override',
  'default-on',
  'user-targeted',
  'rollout',
  'rollout-miss',
  'rollout-no-key',
  'default-off',
]);

function createFeature(overrides = {}) {
  return {
    ...FEATURE_FLAGS.submitPuzzle,
    users: new Set(),
    rolloutPercentage: 0,
    allowOverride: true,
    ...overrides,
  };
}

describe('feature flag helpers', () => {
  test.each([
    { input: ['true'], expected: true, name: 'accepts array input with enabled value' },
    { input: [undefined], expected: null, name: 'returns null for array input with undefined first element' },
    { input: '   ', expected: null, name: 'returns null for whitespace-only string' },
    { input: '', expected: null, name: 'returns null for empty string' },
    { input: null, expected: null, name: 'returns null for null input' },
    { input: undefined, expected: null, name: 'returns null for undefined input' },
    { input: 'maybe', expected: null, name: 'returns null for invalid string input' },
  ])('$name', ({ input, expected }) => {
    expect(parseOverrideValue(input)).toBe(expected);
  });

  test.each(ENABLED_OVERRIDE_VALUES)('parses enabled override value %s', (input) => {
    expect(parseOverrideValue(input)).toBe(true);
  });

  test.each(DISABLED_OVERRIDE_VALUES)('parses disabled override value %s', (input) => {
    expect(parseOverrideValue(input)).toBe(false);
  });

  test.each([
    { input: Number.NaN, expected: 0, name: 'maps NaN to 0' },
    { input: -1, expected: 0, name: 'clamps negative numbers to 0' },
    { input: 101, expected: 100, name: 'clamps numbers above 100 to 100' },
    { input: '50.7', expected: 50, name: 'parses float strings using integer semantics' },
    { input: 'abc', expected: 0, name: 'maps non-numeric strings to 0' },
    { input: null, expected: 0, name: 'maps null to 0' },
    { input: undefined, expected: 0, name: 'maps undefined to 0' },
  ])('clampRolloutPercentage $name', ({ input, expected }) => {
    expect(clampRolloutPercentage(input)).toBe(expected);
  });
});

describe('feature flag evaluation', () => {
  test('enables a feature for configured users', () => {
    const feature = createFeature({
      users: new Set(['target-user', '42']),
    });

    expect(evaluateFeatureFlag(feature, { user: { id: 7, username: 'target-user' } })).toMatchObject({
      enabled: true,
      reason: 'user-targeted',
    });
    expect(evaluateFeatureFlag(feature, { user: { id: 42, username: 'someone-else' } })).toMatchObject({
      enabled: true,
      reason: 'user-targeted',
    });
    expect(evaluateFeatureFlag(feature, { user: { id: 9, username: 'another-user' } })).toMatchObject({
      enabled: false,
      reason: 'default-off',
    });
  });

  test('uses deterministic percentage rollout for stable user identifiers', () => {
    const feature = createFeature({
      rolloutPercentage: 50,
    });
    const includedUser = { id: 1, username: 'alpha' };
    const excludedUser = { id: 101, username: 'user101' };
    const includedBucket = getRolloutBucket(getStableRolloutKey(includedUser));
    const excludedBucket = getRolloutBucket(getStableRolloutKey(excludedUser));

    expect(getRolloutBucket(getStableRolloutKey(includedUser))).toBe(includedBucket);
    expect(getRolloutBucket(getStableRolloutKey(excludedUser))).toBe(excludedBucket);
    expect(includedBucket).toBeGreaterThanOrEqual(0);
    expect(includedBucket).toBeLessThan(100);
    expect(excludedBucket).toBeGreaterThanOrEqual(0);
    expect(excludedBucket).toBeLessThan(100);
    expect(includedBucket).toBeLessThan(50);
    expect(excludedBucket).toBeGreaterThanOrEqual(50);
    expect(evaluateFeatureFlag(feature, { user: includedUser })).toMatchObject({ enabled: true, reason: 'rollout' });
    expect(evaluateFeatureFlag(feature, { user: excludedUser })).toMatchObject({
      enabled: false,
      reason: 'rollout-miss',
    });
  });

  test('respects rollout boundaries at 0 and 100 percent and at the user bucket threshold', () => {
    const boundaryUser = { id: 29, username: 'boundary-user' };
    const stableKey = getStableRolloutKey(boundaryUser);
    const boundaryBucket = getRolloutBucket(stableKey);

    expect(getRolloutBucket(stableKey)).toBe(boundaryBucket);
    expect(boundaryBucket).toBeGreaterThanOrEqual(0);
    expect(boundaryBucket).toBeLessThan(100);
    expect(evaluateFeatureFlag(createFeature({ rolloutPercentage: 0 }), { user: boundaryUser })).toMatchObject({
      enabled: false,
      reason: 'default-off',
    });
    expect(evaluateFeatureFlag(createFeature({ rolloutPercentage: boundaryBucket }), { user: boundaryUser })).toMatchObject({
      enabled: false,
      reason: 'rollout-miss',
    });
    expect(evaluateFeatureFlag(createFeature({ rolloutPercentage: boundaryBucket + 1 }), { user: boundaryUser })).toMatchObject({
      enabled: true,
      reason: 'rollout',
    });
    expect(evaluateFeatureFlag(createFeature({ rolloutPercentage: 100 }), { user: boundaryUser })).toMatchObject({
      enabled: true,
      reason: 'rollout',
    });
  });

  test('does not include anonymous users in percentage rollouts', () => {
    const feature = createFeature({
      rolloutPercentage: 50,
      allowOverride: false,
    });

    expect(evaluateFeatureFlag(feature, {})).toMatchObject({ enabled: false, reason: 'rollout-no-key' });
    expect(evaluateFeatureFlag(feature, { user: {} })).toMatchObject({
      enabled: false,
      reason: 'rollout-no-key',
    });
    expect(evaluateFeatureFlag(feature, { user: null })).toMatchObject({
      enabled: false,
      reason: 'rollout-no-key',
    });
  });

  test('supports query and header overrides only for overrideable features', () => {
    const overrideableFeature = createFeature();
    const lockedFeature = createFeature({
      allowOverride: false,
    });

    expect(
      evaluateFeatureFlag(overrideableFeature, {
        query: { ff_submit_puzzle: 'true' },
      }),
    ).toMatchObject({ enabled: true, reason: 'override' });

    expect(
      evaluateFeatureFlag(overrideableFeature, {
        headers: { 'x-gwn-feature-submit-puzzle': 'enabled' },
      }),
    ).toMatchObject({ enabled: true, reason: 'override' });

    expect(
      evaluateFeatureFlag(lockedFeature, {
        query: { ff_submit_puzzle: 'true' },
        headers: { 'x-gwn-feature-submit-puzzle': 'enabled' },
      }),
    ).toMatchObject({ enabled: false, reason: 'default-off' });
  });

  test('treats override headers as case-insensitive', () => {
    expect(
      evaluateFeatureFlag(createFeature(), {
        headers: { 'X-GWN-Feature-Submit-Puzzle': 'TRUE' },
      }),
    ).toMatchObject({ enabled: true, reason: 'override' });
  });

  test('returns all feature flags as booleans', () => {
    const flags = getFeatureFlags();

    expect(flags).toEqual(
      expect.objectContaining(
        Object.fromEntries(Object.keys(FEATURE_FLAGS).map((featureName) => [featureName, expect.any(Boolean)])),
      ),
    );
    expect(Object.keys(flags).sort()).toEqual(Object.keys(FEATURE_FLAGS).sort());
    expect(Object.values(flags).every((value) => typeof value === 'boolean')).toBe(true);
  });

  test('keeps isFeatureEnabled backward compatible', () => {
    expect(isFeatureEnabled('submitPuzzle')).toBe(false);
  });

  test('evaluateFeatureDetailed returns enabled, reason, and flag', () => {
    const result = evaluateFeatureDetailed('submitPuzzle', {
      query: { ff_submit_puzzle: 'true' },
    });

    expect(result).toMatchObject({
      enabled: true,
      reason: 'override',
      flag: 'submitPuzzle',
    });
    expect(DETAILED_REASONS.has(result.reason)).toBe(true);
  });

  test('evaluateFeatureDetailed reason is always a supported reason', () => {
    const result = evaluateFeatureDetailed('submitPuzzle', {});

    expect(result).toHaveProperty('flag', 'submitPuzzle');
    expect(result).toHaveProperty('enabled');
    expect(result).toHaveProperty('reason');
    expect(DETAILED_REASONS.has(result.reason)).toBe(true);
  });

  test('throws for unknown feature names', () => {
    expect(() => evaluateFeatureDetailed('unknown-flag')).toThrow('Unknown feature flag: unknown-flag');
    expect(() => isFeatureEnabled('unknown-flag')).toThrow('Unknown feature flag: unknown-flag');
  });
});
