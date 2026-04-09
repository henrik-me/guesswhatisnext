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

describe('feature flag evaluation', () => {
  test('enables a feature for configured users', () => {
    const feature = {
      ...FEATURE_FLAGS.submitPuzzle,
      users: new Set(['target-user', '42']),
      rolloutPercentage: 0,
      allowOverride: true,
    };

    expect(evaluateFeatureFlag(feature, { user: { id: 7, username: 'target-user' } }).enabled).toBe(true);
    expect(evaluateFeatureFlag(feature, { user: { id: 42, username: 'someone-else' } }).enabled).toBe(true);
    expect(evaluateFeatureFlag(feature, { user: { id: 9, username: 'another-user' } }).enabled).toBe(false);
  });

  test('uses deterministic percentage rollout for stable user identifiers', () => {
    const feature = {
      ...FEATURE_FLAGS.submitPuzzle,
      users: new Set(),
      rolloutPercentage: 50,
      allowOverride: true,
    };
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
    expect(evaluateFeatureFlag(feature, { user: includedUser }).enabled).toBe(true);
    expect(evaluateFeatureFlag(feature, { user: excludedUser }).enabled).toBe(false);
  });

  test('respects rollout boundaries at 0 and 100 percent and at the user bucket threshold', () => {
    const boundaryUser = { id: 29, username: 'boundary-user' };
    const stableKey = getStableRolloutKey(boundaryUser);
    const boundaryBucket = getRolloutBucket(stableKey);

    expect(getRolloutBucket(stableKey)).toBe(boundaryBucket);
    expect(boundaryBucket).toBeGreaterThanOrEqual(0);
    expect(boundaryBucket).toBeLessThan(100);
    expect(evaluateFeatureFlag({ ...FEATURE_FLAGS.submitPuzzle, users: new Set(), rolloutPercentage: 0 }, { user: boundaryUser }).enabled).toBe(false);
    expect(
      evaluateFeatureFlag({ ...FEATURE_FLAGS.submitPuzzle, users: new Set(), rolloutPercentage: boundaryBucket }, { user: boundaryUser }).enabled,
    ).toBe(false);
    expect(
      evaluateFeatureFlag({ ...FEATURE_FLAGS.submitPuzzle, users: new Set(), rolloutPercentage: boundaryBucket + 1 }, { user: boundaryUser }).enabled,
    ).toBe(true);
    expect(evaluateFeatureFlag({ ...FEATURE_FLAGS.submitPuzzle, users: new Set(), rolloutPercentage: 100 }, { user: boundaryUser }).enabled).toBe(true);
  });

  test('does not include anonymous users in percentage rollouts', () => {
    const feature = {
      ...FEATURE_FLAGS.submitPuzzle,
      users: new Set(),
      rolloutPercentage: 50,
      allowOverride: false,
    };

    // No user at all
    expect(evaluateFeatureFlag(feature, {}).enabled).toBe(false);
    // User object without id or username
    expect(evaluateFeatureFlag(feature, { user: {} }).enabled).toBe(false);
    // Null user
    expect(evaluateFeatureFlag(feature, { user: null }).enabled).toBe(false);
  });

  test('supports query and header overrides only for overrideable features', () => {
    const overrideableFeature = {
      ...FEATURE_FLAGS.submitPuzzle,
      users: new Set(),
      rolloutPercentage: 0,
      allowOverride: true,
    };
    const lockedFeature = {
      ...overrideableFeature,
      allowOverride: false,
    };

    expect(
      evaluateFeatureFlag(overrideableFeature, {
        query: { ff_submit_puzzle: 'true' },
      }).enabled,
    ).toBe(true);

    expect(
      evaluateFeatureFlag(overrideableFeature, {
        headers: { 'x-gwn-feature-submit-puzzle': 'enabled' },
      }).enabled,
    ).toBe(true);

    expect(
      evaluateFeatureFlag(lockedFeature, {
        query: { ff_submit_puzzle: 'true' },
        headers: { 'x-gwn-feature-submit-puzzle': 'enabled' },
      }).enabled,
    ).toBe(false);
  });
});

describe('parseOverrideValue', () => {
  test('handles arrays, null-like inputs, and invalid strings', () => {
    expect(parseOverrideValue(['true'])).toBe(true);
    expect(parseOverrideValue([undefined])).toBeNull();
    expect(parseOverrideValue('   ')).toBeNull();
    expect(parseOverrideValue('')).toBeNull();
    expect(parseOverrideValue(null)).toBeNull();
    expect(parseOverrideValue(undefined)).toBeNull();
    expect(parseOverrideValue('maybe')).toBeNull();
  });

  test('accepts all enabled override aliases', () => {
    for (const value of ['1', 'true', 'yes', 'on', 'enable', 'enabled']) {
      expect(parseOverrideValue(value)).toBe(true);
    }
  });

  test('accepts all disabled override aliases', () => {
    for (const value of ['0', 'false', 'no', 'off', 'disable', 'disabled']) {
      expect(parseOverrideValue(value)).toBe(false);
    }
  });
});

describe('clampRolloutPercentage', () => {
  test('clamps and normalizes edge-case rollout percentage values', () => {
    expect(clampRolloutPercentage(Number.NaN)).toBe(0);
    expect(clampRolloutPercentage(-1)).toBe(0);
    expect(clampRolloutPercentage(101)).toBe(100);
    expect(clampRolloutPercentage('50.7')).toBe(50);
    expect(clampRolloutPercentage('abc')).toBe(0);
    expect(clampRolloutPercentage(null)).toBe(0);
    expect(clampRolloutPercentage(undefined)).toBe(0);
  });
});

describe('feature flag module exports', () => {
  test('throws for unknown feature names', () => {
    expect(() => evaluateFeatureDetailed('does-not-exist')).toThrow('Unknown feature flag: does-not-exist');
  });

  test('getFeatureFlags returns all configured keys with boolean values', () => {
    const flags = getFeatureFlags({});

    expect(Object.keys(flags).sort()).toEqual(Object.keys(FEATURE_FLAGS).sort());
    for (const value of Object.values(flags)) {
      expect(typeof value).toBe('boolean');
    }
  });

  test('evaluateFeatureDetailed returns enabled, reason, and flag fields', () => {
    const result = evaluateFeatureDetailed('submitPuzzle', {});

    expect(result.flag).toBe('submitPuzzle');
    expect(typeof result.enabled).toBe('boolean');
    expect(
      ['override', 'default-on', 'user-targeted', 'rollout', 'rollout-miss', 'rollout-no-key', 'default-off'].includes(result.reason),
    ).toBe(true);
  });

  test('accepts case-insensitive override headers', () => {
    const enabled = isFeatureEnabled('submitPuzzle', {
      headers: { 'X-GWN-FEATURE-SUBMIT-PUZZLE': 'TrUe' },
    });

    expect(enabled).toBe(true);
  });
});
