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
  normalizeIdentifier,
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

    expect(evaluateFeatureFlag(feature, {}).enabled).toBe(false);
    expect(evaluateFeatureFlag(feature, { user: {} }).enabled).toBe(false);
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

describe('normalizeIdentifier', () => {
  test('trims and lowercases values', () => {
    expect(normalizeIdentifier('  Hello  ')).toBe('hello');
    expect(normalizeIdentifier(42)).toBe('42');
  });
});

describe('parseOverrideValue', () => {
  test('array input extracts first element', () => {
    expect(parseOverrideValue(['true'])).toBe(true);
  });

  test('array with undefined first element returns null', () => {
    expect(parseOverrideValue([undefined])).toBe(null);
  });

  test('whitespace-only string returns null', () => {
    expect(parseOverrideValue('   ')).toBe(null);
  });

  test('empty string returns null', () => {
    expect(parseOverrideValue('')).toBe(null);
  });

  test('null returns null', () => {
    expect(parseOverrideValue(null)).toBe(null);
  });

  test('undefined returns null', () => {
    expect(parseOverrideValue(undefined)).toBe(null);
  });

  test('invalid string returns null', () => {
    expect(parseOverrideValue('maybe')).toBe(null);
  });

  test.each(['1', 'true', 'yes', 'on', 'enable', 'enabled'])(
    'enabled value "%s" returns true',
    (val) => {
      expect(parseOverrideValue(val)).toBe(true);
    },
  );

  test.each(['0', 'false', 'no', 'off', 'disable', 'disabled'])(
    'disabled value "%s" returns false',
    (val) => {
      expect(parseOverrideValue(val)).toBe(false);
    },
  );
});

describe('clampRolloutPercentage', () => {
  test('NaN returns 0', () => {
    expect(clampRolloutPercentage(NaN)).toBe(0);
  });

  test('negative number returns 0', () => {
    expect(clampRolloutPercentage(-10)).toBe(0);
  });

  test('number greater than 100 returns 100', () => {
    expect(clampRolloutPercentage(200)).toBe(100);
  });

  test('float string is truncated to integer', () => {
    expect(clampRolloutPercentage('50.7')).toBe(50);
  });

  test('non-numeric string returns 0', () => {
    expect(clampRolloutPercentage('abc')).toBe(0);
  });

  test('null returns 0', () => {
    expect(clampRolloutPercentage(null)).toBe(0);
  });

  test('undefined returns 0', () => {
    expect(clampRolloutPercentage(undefined)).toBe(0);
  });
});

describe('getFeatureDefinition (via isFeatureEnabled)', () => {
  test('unknown flag name throws Error', () => {
    expect(() => isFeatureEnabled('nonExistentFlag')).toThrow('Unknown feature flag: nonExistentFlag');
  });
});

describe('getFeatureFlags', () => {
  test('returns an object with all flag keys', () => {
    const flags = getFeatureFlags({});
    expect(Object.keys(flags)).toContain('submitPuzzle');
  });

  test('values are booleans', () => {
    const flags = getFeatureFlags({});
    for (const value of Object.values(flags)) {
      expect(typeof value).toBe('boolean');
    }
  });
});

describe('evaluateFeatureDetailed', () => {
  test('returns { enabled, reason, flag } structure', () => {
    const result = evaluateFeatureDetailed('submitPuzzle', {});
    expect(result).toHaveProperty('enabled');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('flag');
    expect(result.flag).toBe('submitPuzzle');
    expect(typeof result.enabled).toBe('boolean');
    expect(typeof result.reason).toBe('string');
  });

  test('reason is "default-off" for default-disabled flag without override', () => {
    const result = evaluateFeatureDetailed('submitPuzzle', {});
    expect(result.reason).toBe('default-off');
  });

  test('reason is "override" when query param override is provided', () => {
    const result = evaluateFeatureDetailed('submitPuzzle', {
      query: { ff_submit_puzzle: 'true' },
    });
    expect(result).toEqual({ enabled: true, reason: 'override', flag: 'submitPuzzle' });
  });

  test('reason is one of the expected values', () => {
    const validReasons = ['override', 'default-on', 'user-targeted', 'rollout', 'rollout-miss', 'rollout-no-key', 'default-off'];
    const result = evaluateFeatureDetailed('submitPuzzle', {});
    expect(validReasons).toContain(result.reason);
  });
});

describe('header override value case-insensitivity', () => {
  test('lowercase header value is recognized', () => {
    const feature = {
      ...FEATURE_FLAGS.submitPuzzle,
      users: new Set(),
      rolloutPercentage: 0,
      allowOverride: true,
    };

    const result = evaluateFeatureFlag(feature, {
      headers: { 'x-gwn-feature-submit-puzzle': 'true' },
    });
    expect(result.enabled).toBe(true);
  });

  test('uppercase header value is recognized', () => {
    const feature = {
      ...FEATURE_FLAGS.submitPuzzle,
      users: new Set(),
      rolloutPercentage: 0,
      allowOverride: true,
    };

    const result = evaluateFeatureFlag(feature, {
      headers: { 'x-gwn-feature-submit-puzzle': 'TRUE' },
    });
    expect(result.enabled).toBe(true);
  });

  test('mixed-case header value is recognized', () => {
    const feature = {
      ...FEATURE_FLAGS.submitPuzzle,
      users: new Set(),
      rolloutPercentage: 0,
      allowOverride: true,
    };

    const result = evaluateFeatureFlag(feature, {
      headers: { 'x-gwn-feature-submit-puzzle': 'Enabled' },
    });
    expect(result.enabled).toBe(true);
  });
});
