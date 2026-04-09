'use strict';

const { config } = require('./config');
const logger = require('./logger');

const ENABLED_OVERRIDE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);
const DISABLED_OVERRIDE_VALUES = new Set(['0', 'false', 'no', 'off', 'disable', 'disabled']);

/**
 * Normalize a user identifier to a consistent lowercase trimmed string.
 * @param {*} value - The value to normalize.
 * @returns {string} Trimmed, lowercased string representation.
 */
function normalizeIdentifier(value) {
  return String(value).trim().toLowerCase();
}

/**
 * Clamp a rollout percentage to an integer in [0, 100].
 * @param {*} value - Raw percentage value (string, number, etc.).
 * @returns {number} Integer between 0 and 100 inclusive.
 */
function clampRolloutPercentage(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

/**
 * Parse a comma-separated user list into a Set of normalized identifiers.
 * @param {string} value - Comma-separated list of user identifiers.
 * @returns {Set<string>} Set of normalized, non-empty identifiers.
 */
function parseUserList(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => normalizeIdentifier(item))
      .filter(Boolean),
  );
}

/**
 * Parse an override value from a query param or header.
 * @param {*} value - Raw override value (string, array, null, undefined).
 * @returns {boolean|null} true for enabled, false for disabled, null for unrecognized.
 */
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
    allowOverride: config.NODE_ENV !== 'production' && config.NODE_ENV !== 'staging',
    overrideQueryParam: 'ff_submit_puzzle',
    overrideHeader: 'x-gwn-feature-submit-puzzle',
  }),
});

/**
 * Look up a feature flag definition by name.
 * @param {string} featureName - The flag key (e.g. 'submitPuzzle').
 * @returns {object} The frozen feature flag definition.
 * @throws {Error} If the feature name is not registered.
 */
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
    keys.push(normalizeIdentifier(user.id));
  }
  if (user.username) {
    keys.push(normalizeIdentifier(user.username));
  }
  return keys.filter(Boolean);
}

/**
 * Derive a stable key for percentage-based rollout bucketing.
 * @param {object|null} user - The user object (with id and/or username).
 * @returns {string|null} A prefixed stable key, or null for anonymous users.
 */
function getStableRolloutKey(user) {
  if (!user) return null;
  if (user.id !== undefined && user.id !== null) {
    return `id:${normalizeIdentifier(user.id)}`;
  }
  if (user.username) {
    return `user:${normalizeIdentifier(user.username)}`;
  }
  return null;
}

/**
 * Hash a stable key into a rollout bucket in [0, 100).
 * @param {string} stableKey - The stable rollout key.
 * @returns {number} Bucket number between 0 and 99 inclusive.
 */
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

/**
 * Evaluate a feature flag against a request context.
 * @param {object} feature - A feature flag definition from FEATURE_FLAGS.
 * @param {object} [req={}] - Express-like request object.
 * @returns {{ enabled: boolean, reason: string }} Evaluation result with reason.
 */
function evaluateFeatureFlag(feature, req = {}) {
  let enabled;
  let reason;

  const override = getFeatureOverride(feature, req);
  if (override !== null) {
    enabled = override;
    reason = 'override';
  } else if (feature.defaultEnabled) {
    enabled = true;
    reason = 'default-on';
  } else if (isUserTargeted(feature, req.user)) {
    enabled = true;
    reason = 'user-targeted';
  } else if (feature.rolloutPercentage > 0) {
    const stableKey = getStableRolloutKey(req.user);
    if (!stableKey) {
      enabled = false;
      reason = 'rollout-no-key';
    } else if (getRolloutBucket(stableKey) < feature.rolloutPercentage) {
      enabled = true;
      reason = 'rollout';
    } else {
      enabled = false;
      reason = 'rollout-miss';
    }
  } else {
    enabled = false;
    reason = 'default-off';
  }

  logger.debug({ flag: feature.key, enabled, reason }, 'feature flag evaluated');
  return { enabled, reason };
}

/**
 * Evaluate a feature flag by name with full detail.
 * @param {string} featureName - The flag key (e.g. 'submitPuzzle').
 * @param {object} [req={}] - Express-like request object.
 * @returns {{ enabled: boolean, reason: string, flag: string }} Detailed evaluation result.
 */
function evaluateFeatureDetailed(featureName, req = {}) {
  const feature = getFeatureDefinition(featureName);
  const { enabled, reason } = evaluateFeatureFlag(feature, req);
  return { enabled, reason, flag: featureName };
}

/**
 * Check whether a named feature flag is enabled.
 * @param {string} featureName - The flag key (e.g. 'submitPuzzle').
 * @param {object} [req={}] - Express-like request object.
 * @returns {boolean} true if the feature is enabled.
 */
function isFeatureEnabled(featureName, req = {}) {
  return evaluateFeatureFlag(getFeatureDefinition(featureName), req).enabled;
}

/**
 * Get all feature flags evaluated against a request context.
 * @param {object} [req={}] - Express-like request object.
 * @returns {Record<string, boolean>} Map of flag names to boolean enabled state.
 */
function getFeatureFlags(req = {}) {
  return Object.fromEntries(
    Object.keys(FEATURE_FLAGS).map((featureName) => [featureName, isFeatureEnabled(featureName, req)]),
  );
}

module.exports = {
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
  parseUserList,
};
