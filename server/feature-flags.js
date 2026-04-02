'use strict';

const { config } = require('./config');

const ENABLED_OVERRIDE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);
const DISABLED_OVERRIDE_VALUES = new Set(['0', 'false', 'no', 'off', 'disable', 'disabled']);

function clampRolloutPercentage(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function parseUserList(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseOverrideValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return null;

  const normalized = String(raw).trim().toLowerCase();
  if (!normalized) return null;
  if (ENABLED_OVERRIDE_VALUES.has(normalized)) return true;
  if (DISABLED_OVERRIDE_VALUES.has(normalized)) return false;
  return null;
}

const FEATURE_FLAGS = Object.freeze({
  submitPuzzle: Object.freeze({
    key: 'submitPuzzle',
    defaultEnabled: false,
    rolloutPercentage: clampRolloutPercentage(config.FEATURE_SUBMIT_PUZZLE_PERCENTAGE),
    users: parseUserList(config.FEATURE_SUBMIT_PUZZLE_USERS),
    allowOverride: true,
    overrideQueryParam: 'ff_submit_puzzle',
    overrideHeader: 'x-gwn-feature-submit-puzzle',
  }),
});

function getFeatureDefinition(featureName) {
  const feature = FEATURE_FLAGS[featureName];
  if (!feature) {
    throw new Error(`Unknown feature flag: ${featureName}`);
  }
  return feature;
}

function getTargetKeys(user) {
  if (!user) return [];

  const keys = [];
  if (user.id !== undefined && user.id !== null) {
    keys.push(String(user.id).trim().toLowerCase());
  }
  if (user.username) {
    keys.push(String(user.username).trim().toLowerCase());
  }
  return keys.filter(Boolean);
}

function getStableRolloutKey(user) {
  if (!user) return null;
  if (user.id !== undefined && user.id !== null) {
    return `id:${String(user.id).trim().toLowerCase()}`;
  }
  if (user.username) {
    return `user:${String(user.username).trim().toLowerCase()}`;
  }
  return null;
}

function getRolloutBucket(stableKey) {
  let hash = 0;
  for (const char of String(stableKey || '')) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return ((hash % 100) + 100) % 100;
}

function getFeatureOverride(feature, req = {}) {
  if (!feature.allowOverride) return null;

  const queryValue = req.query && req.query[feature.overrideQueryParam];
  const queryOverride = parseOverrideValue(queryValue);
  if (queryOverride !== null) return queryOverride;

  const headers = req.headers || {};
  const headerValue = headers[feature.overrideHeader] ?? headers[feature.overrideHeader.toLowerCase()];
  const headerOverride = parseOverrideValue(headerValue);
  if (headerOverride !== null) return headerOverride;

  return null;
}

function isUserTargeted(feature, user) {
  if (!feature.users || feature.users.size === 0) return false;
  return getTargetKeys(user).some((key) => feature.users.has(key));
}

function evaluateFeatureFlag(feature, req = {}) {
  const override = getFeatureOverride(feature, req);
  if (override !== null) return override;
  if (feature.defaultEnabled) return true;
  if (isUserTargeted(feature, req.user)) return true;

  if (feature.rolloutPercentage > 0) {
    const stableKey = getStableRolloutKey(req.user);
    if (stableKey) {
      return getRolloutBucket(stableKey) < feature.rolloutPercentage;
    }
  }

  return false;
}

function isFeatureEnabled(featureName, req = {}) {
  return evaluateFeatureFlag(getFeatureDefinition(featureName), req);
}

function getFeatureFlags(req = {}) {
  return Object.fromEntries(
    Object.keys(FEATURE_FLAGS).map((featureName) => [featureName, isFeatureEnabled(featureName, req)]),
  );
}

module.exports = {
  FEATURE_FLAGS,
  clampRolloutPercentage,
  evaluateFeatureFlag,
  getFeatureFlags,
  getRolloutBucket,
  getStableRolloutKey,
  isFeatureEnabled,
  parseOverrideValue,
  parseUserList,
};
