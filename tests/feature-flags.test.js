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

    expect(evaluateFeatureFlag(feature, { user: { id: 7, username: 'target-user' } })).toEqual({
      enabled: true,
      reason: 'user-targeted',
    });
    expect(evaluateFeatureFlag(feature, { user: { id: 42, username: 'someone-else' } })).toEqual({
      enabled: true,
      reason: 'user-targeted',
    });
    expect(evaluateFeatureFlag(feature, { user: { id: 9, username: 'another-user' } })).toEqual({
      enabled: false,
      reason: 'default-off',
    });
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
    expect(evaluateFeatureFlag(feature, { user: includedUser })).toEqual({ enabled: true, reason: 'rollout' });
    expect(evaluateFeatureFlag(feature, { user: excludedUser })).toEqual({ enabled: false, reason: 'rollout-miss' });
  });

  test('respects rollout boundaries at 0 and 100 percent and at the user bucket threshold', () => {
    const boundaryUser = { id: 29, username: 'boundary-user' };
    const stableKey = getStableRolloutKey(boundaryUser);
    const boundaryBucket = getRolloutBucket(stableKey);

    expect(getRolloutBucket(stableKey)).toBe(boundaryBucket);
    expect(boundaryBucket).toBeGreaterThanOrEqual(0);
    expect(boundaryBucket).toBeLessThan(100);
    expect(evaluateFeatureFlag({ ...FEATURE_FLAGS.submitPuzzle, users: new Set(), rolloutPercentage: 0 }, { user: boundaryUser })).toEqual({
      enabled: false,
      reason: 'default-off',
    });
    expect(evaluateFeatureFlag({ ...FEATURE_FLAGS.submitPuzzle, users: new Set(), rolloutPercentage: boundaryBucket }, { user: boundaryUser })).toEqual({
      enabled: false,
      reason: 'rollout-miss',
    });
    expect(evaluateFeatureFlag({ ...FEATURE_FLAGS.submitPuzzle, users: new Set(), rolloutPercentage: boundaryBucket + 1 }, { user: boundaryUser })).toEqual({
      enabled: true,
      reason: 'rollout',
    });
    expect(evaluateFeatureFlag({ ...FEATURE_FLAGS.submitPuzzle, users: new Set(), rolloutPercentage: 100 }, { user: boundaryUser })).toEqual({
      enabled: true,
      reason: 'rollout',
    });
  });

  test('does not include anonymous users in percentage rollouts', () => {
    const feature = {
      ...FEATURE_FLAGS.submitPuzzle,
      users: new Set(),
      rolloutPercentage: 50,
      allowOverride: false,
    };

    // No user at all
    expect(evaluateFeatureFlag(feature, {})).toEqual({ enabled: false, reason: 'rollout-no-key' });
    // User object without id or username
    expect(evaluateFeatureFlag(feature, { user: {} })).toEqual({ enabled: false, reason: 'rollout-no-key' });
    // Null user
    expect(evaluateFeatureFlag(feature, { user: null })).toEqual({ enabled: false, reason: 'rollout-no-key' });
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

  test('supports case-insensitive header overrides', () => {
    const feature = {
      ...FEATURE_FLAGS.submitPuzzle,
      users: new Set(),
      rolloutPercentage: 0,
      allowOverride: true,
    };

    expect(
      evaluateFeatureFlag(feature, {
        headers: { 'X-GwN-FeAtUrE-SubMit-PuzZle': 'true' },
      }),
    ).toEqual({ enabled: true, reason: 'override' });
  });

  test('returns detailed feature evaluation results for named flags', () => {
    const result = evaluateFeatureDetailed('submitPuzzle', {
      query: { ff_submit_puzzle: 'true' },
    });

    expect(result).toEqual({
      enabled: true,
      reason: 'override',
      flag: 'submitPuzzle',
    });
  });

  test('returns a recognized reason from detailed evaluation', () => {
    const result = evaluateFeatureDetailed('submitPuzzle');

    expect([
      'override',
      'default-on',
      'user-targeted',
      'rollout',
      'rollout-miss',
      'rollout-no-key',
      'default-off',
    ]).toContain(result.reason);
  });

  test('throws for unknown feature names', () => {
    expect(() => evaluateFeatureDetailed('unknownFlag')).toThrow('Unknown feature flag: unknownFlag');
    expect(() => isFeatureEnabled('unknownFlag')).toThrow('Unknown feature flag: unknownFlag');
  });

  test('returns boolean states for every configured feature', () => {
    const features = getFeatureFlags({});

    expect(Object.keys(features)).toEqual(Object.keys(FEATURE_FLAGS));
    expect(Object.values(features).every((value) => typeof value === 'boolean')).toBe(true);
  });
});

describe('feature flag helpers', () => {
  test('parses override array and nullish edge cases', () => {
    expect(parseOverrideValue(['true'])).toBe(true);
    expect(parseOverrideValue([undefined])).toBeNull();
    expect(parseOverrideValue('   ')).toBeNull();
    expect(parseOverrideValue('')).toBeNull();
    expect(parseOverrideValue(null)).toBeNull();
    expect(parseOverrideValue(undefined)).toBeNull();
    expect(parseOverrideValue('maybe')).toBeNull();
  });

  test.each(['1', 'true', 'yes', 'on', 'enable', 'enabled'])(
    'parses enabled override value %s',
    (value) => {
      expect(parseOverrideValue(value)).toBe(true);
    },
  );

  test.each(['0', 'false', 'no', 'off', 'disable', 'disabled'])(
    'parses disabled override value %s',
    (value) => {
      expect(parseOverrideValue(value)).toBe(false);
    },
  );

  test('clamps rollout percentage edge cases', () => {
    expect(clampRolloutPercentage(Number.NaN)).toBe(0);
    expect(clampRolloutPercentage(-5)).toBe(0);
    expect(clampRolloutPercentage(120)).toBe(100);
    expect(clampRolloutPercentage('50.7')).toBe(50);
    expect(clampRolloutPercentage('abc')).toBe(0);
    expect(clampRolloutPercentage(null)).toBe(0);
    expect(clampRolloutPercentage(undefined)).toBe(0);
  });
});
