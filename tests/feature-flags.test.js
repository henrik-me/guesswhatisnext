/**
 * Feature flag evaluation tests.
 */

const {
  FEATURE_FLAGS,
  evaluateFeatureFlag,
  getRolloutBucket,
  getStableRolloutKey,
} = require('../server/feature-flags');

describe('feature flag evaluation', () => {
  test('enables a feature for configured users', () => {
    const feature = {
      ...FEATURE_FLAGS.submitPuzzle,
      users: new Set(['target-user', '42']),
      rolloutPercentage: 0,
      allowOverride: true,
    };

    expect(evaluateFeatureFlag(feature, { user: { id: 7, username: 'target-user' } })).toBe(true);
    expect(evaluateFeatureFlag(feature, { user: { id: 42, username: 'someone-else' } })).toBe(true);
    expect(evaluateFeatureFlag(feature, { user: { id: 9, username: 'another-user' } })).toBe(false);
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
    expect(evaluateFeatureFlag(feature, { user: includedUser })).toBe(true);
    expect(evaluateFeatureFlag(feature, { user: excludedUser })).toBe(false);
  });

  test('respects rollout boundaries at 0 and 100 percent and at the user bucket threshold', () => {
    const boundaryUser = { id: 29, username: 'boundary-user' };
    const stableKey = getStableRolloutKey(boundaryUser);
    const boundaryBucket = getRolloutBucket(stableKey);

    expect(getRolloutBucket(stableKey)).toBe(boundaryBucket);
    expect(boundaryBucket).toBeGreaterThanOrEqual(0);
    expect(boundaryBucket).toBeLessThan(100);
    expect(evaluateFeatureFlag({ ...FEATURE_FLAGS.submitPuzzle, users: new Set(), rolloutPercentage: 0 }, { user: boundaryUser })).toBe(false);
    expect(evaluateFeatureFlag({ ...FEATURE_FLAGS.submitPuzzle, users: new Set(), rolloutPercentage: boundaryBucket }, { user: boundaryUser })).toBe(false);
    expect(evaluateFeatureFlag({ ...FEATURE_FLAGS.submitPuzzle, users: new Set(), rolloutPercentage: boundaryBucket + 1 }, { user: boundaryUser })).toBe(true);
    expect(evaluateFeatureFlag({ ...FEATURE_FLAGS.submitPuzzle, users: new Set(), rolloutPercentage: 100 }, { user: boundaryUser })).toBe(true);
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
    ).toBe(true);

    expect(
      evaluateFeatureFlag(overrideableFeature, {
        headers: { 'x-gwn-feature-submit-puzzle': 'enabled' },
      }),
    ).toBe(true);

    expect(
      evaluateFeatureFlag(lockedFeature, {
        query: { ff_submit_puzzle: 'true' },
        headers: { 'x-gwn-feature-submit-puzzle': 'enabled' },
      }),
    ).toBe(false);
  });
});
