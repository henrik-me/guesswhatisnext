/**
 * Feature flag evaluation tests.
 */

const {
  FEATURE_FLAGS,
  clampRolloutPercentage,
  evaluateFeatureDetailed,
  evaluateFeatureFlag,
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
  test('array input ["true"] returns true', () => {
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

  test('invalid string "maybe" returns null', () => {
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
    expect(clampRolloutPercentage(-5)).toBe(0);
  });

  test('number > 100 returns 100', () => {
    expect(clampRolloutPercentage(150)).toBe(100);
  });

  test('float string "50.7" returns 50', () => {
    expect(clampRolloutPercentage('50.7')).toBe(50);
  });

  test('non-numeric string "abc" returns 0', () => {
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
  test('unknown flag name throws an Error', () => {
    expect(() => isFeatureEnabled('nonExistentFlag', {})).toThrow('Unknown feature flag: nonExistentFlag');
  });
});

describe('getFeatureFlags', () => {
  const { getFeatureFlags } = require('../server/feature-flags');

  test('returns an object with all expected flag keys', () => {
    const flags = getFeatureFlags();
    expect(typeof flags).toBe('object');
    expect(Object.keys(flags)).toContain('submitPuzzle');
  });

  test('values are booleans', () => {
    const flags = getFeatureFlags();
    for (const val of Object.values(flags)) {
      expect(typeof val).toBe('boolean');
    }
  });
});

describe('evaluateFeatureDetailed', () => {
  const VALID_REASONS = new Set([
    'override',
    'default-on',
    'user-targeted',
    'rollout',
    'rollout-miss',
    'rollout-no-key',
    'default-off',
  ]);

  test('returns { enabled, reason, flag } structure', () => {
    const result = evaluateFeatureDetailed('submitPuzzle', {});
    expect(result).toHaveProperty('enabled');
    expect(result).toHaveProperty('reason');
    expect(result).toHaveProperty('flag', 'submitPuzzle');
  });

  test('enabled is boolean', () => {
    const result = evaluateFeatureDetailed('submitPuzzle', {});
    expect(typeof result.enabled).toBe('boolean');
  });

  test('reason is one of the valid reason strings', () => {
    const result = evaluateFeatureDetailed('submitPuzzle', {});
    expect(VALID_REASONS.has(result.reason)).toBe(true);
  });

  test('returns reason "override" when query override is set', () => {
    const result = evaluateFeatureDetailed('submitPuzzle', {
      query: { ff_submit_puzzle: 'true' },
    });
    expect(result.reason).toBe('override');
    expect(result.enabled).toBe(true);
    expect(result.flag).toBe('submitPuzzle');
  });

  test('returns reason "default-off" for anonymous request with no rollout', () => {
    const result = evaluateFeatureDetailed('submitPuzzle', {});
    expect(result.reason).toBe('default-off');
    expect(result.enabled).toBe(false);
  });

  test('throws for unknown flag name', () => {
    expect(() => evaluateFeatureDetailed('unknownFlag', {})).toThrow('Unknown feature flag: unknownFlag');
  });
});

describe('header case-insensitivity for overrides', () => {
  test('mixed-case overrideHeader definition matches lowercased incoming header', () => {
    const feature = {
      ...FEATURE_FLAGS.submitPuzzle,
      users: new Set(),
      rolloutPercentage: 0,
      allowOverride: true,
      // Feature definition uses mixed case; Express always lowercases incoming headers
      overrideHeader: 'X-GWN-Feature-Submit-Puzzle',
    };

    // Express lowercases all request headers; our code normalizes via .toLowerCase() fallback
    const result = evaluateFeatureFlag(feature, {
      headers: { 'x-gwn-feature-submit-puzzle': 'true' },
    });
    expect(result.enabled).toBe(true);
    expect(result.reason).toBe('override');
  });
});
