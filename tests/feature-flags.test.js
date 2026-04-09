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
    expect(evaluateFeatureFlag({ ...FEATURE_FLAGS.submitPuzzle, users: new Set(), rolloutPercentage: boundaryBucket }, { user: boundaryUser }).enabled).toBe(false);
    expect(evaluateFeatureFlag({ ...FEATURE_FLAGS.submitPuzzle, users: new Set(), rolloutPercentage: boundaryBucket + 1 }, { user: boundaryUser }).enabled).toBe(true);
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
      }),
    ).toEqual({ enabled: true, reason: 'override' });

    expect(
      evaluateFeatureFlag(overrideableFeature, {
        headers: { 'x-gwn-feature-submit-puzzle': 'enabled' },
      }),
    ).toEqual({ enabled: true, reason: 'override' });

    expect(
      evaluateFeatureFlag(lockedFeature, {
        query: { ff_submit_puzzle: 'true' },
        headers: { 'x-gwn-feature-submit-puzzle': 'enabled' },
      }),
    ).toEqual({ enabled: false, reason: 'default-off' });
  });

  test('supports case-insensitive override header names', () => {
    const feature = {
      ...FEATURE_FLAGS.submitPuzzle,
      users: new Set(),
      rolloutPercentage: 0,
      allowOverride: true,
    };

    expect(
      evaluateFeatureFlag(feature, {
        headers: { 'X-GWN-FEATURE-SUBMIT-PUZZLE': 'true' },
      }),
    ).toEqual({ enabled: true, reason: 'override' });
  });
});

describe('parseOverrideValue', () => {
  test('handles array and nullish edge cases', () => {
    expect(parseOverrideValue(['true'])).toBe(true);
    expect(parseOverrideValue([undefined])).toBeNull();
    expect(parseOverrideValue('   ')).toBeNull();
    expect(parseOverrideValue('')).toBeNull();
    expect(parseOverrideValue(null)).toBeNull();
    expect(parseOverrideValue(undefined)).toBeNull();
    expect(parseOverrideValue('maybe')).toBeNull();
  });

  test('parses all enabled override values', () => {
    for (const value of ['1', 'true', 'yes', 'on', 'enable', 'enabled']) {
      expect(parseOverrideValue(value)).toBe(true);
    }
  });

  test('parses all disabled override values', () => {
    for (const value of ['0', 'false', 'no', 'off', 'disable', 'disabled']) {
      expect(parseOverrideValue(value)).toBe(false);
    }
  });
});

describe('clampRolloutPercentage', () => {
  test('clamps and normalizes edge cases', () => {
    expect(clampRolloutPercentage(Number.NaN)).toBe(0);
    expect(clampRolloutPercentage(-10)).toBe(0);
    expect(clampRolloutPercentage(101)).toBe(100);
    expect(clampRolloutPercentage('50.7')).toBe(50);
    expect(clampRolloutPercentage('abc')).toBe(0);
    expect(clampRolloutPercentage(null)).toBe(0);
    expect(clampRolloutPercentage(undefined)).toBe(0);
  });
});

describe('feature flag module API', () => {
  test('throws for unknown feature names', () => {
    expect(() => isFeatureEnabled('unknownFeature')).toThrow('Unknown feature flag: unknownFeature');
    expect(() => evaluateFeatureDetailed('unknownFeature')).toThrow('Unknown feature flag: unknownFeature');
  });

  test('getFeatureFlags returns all known flags as booleans', () => {
    const flags = getFeatureFlags({});
    expect(Object.keys(flags)).toEqual(Object.keys(FEATURE_FLAGS));
    for (const value of Object.values(flags)) {
      expect(typeof value).toBe('boolean');
    }
  });

  test('evaluateFeatureDetailed returns detailed result shape', () => {
    const detailed = evaluateFeatureDetailed('submitPuzzle', { query: { ff_submit_puzzle: 'true' } });
    expect(detailed).toEqual({ enabled: true, reason: 'override', flag: 'submitPuzzle' });
    expect([
      'override',
      'default-on',
      'user-targeted',
      'rollout',
      'rollout-miss',
      'rollout-no-key',
      'default-off',
    ]).toContain(detailed.reason);
  });
});
