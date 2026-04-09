'use strict';

const { config } = require('./config');
const logger = require('./logger');

/** @param {*} value */
function normalizeIdentifier(value) {
  return String(value).trim().toLowerCase();
}

const ENABLED_OVERRIDE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);
const DISABLED_OVERRIDE_VALUES = new Set(['0', 'false', 'no', 'off', 'disable', 'disabled']);

/**
 * Clamps a rollout percentage value to the range [0, 100].
 * @param {*} value - Raw value to parse and clamp.
 * @returns {number} Integer in [0, 100].
 */
function clampRolloutPercentage(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

/**
 * Parses a comma-separated list of user identifiers into a normalized Set.
 * @param {*} value - Raw config value.
 * @returns {Set<string>} Lowercased, trimmed identifiers.
 */
function parseUserList(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Parses an override value (from query param or header) into true/false/null.
 * @param {*} value - Raw value, may be string, array, null, or undefined.
 * @returns {boolean|null} true/false if recognized, null if not.
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
 * Retrieves the feature flag definition for the given feature name.
 * @param {string} featureName - The name of the feature flag.
 * @returns {object} The feature flag definition object.
 * @throws {Error} If the feature flag is unknown.
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
 * Computes a deterministic bucket (0–99) for a stable rollout key.
 * @param {string} stableKey - The stable key for the user.
 * @returns {number} Integer in [0, 99].
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
 * Evaluates a feature flag and returns the result with reason.
 * @param {object} feature - The feature flag definition object.
 * @param {object} [req={}] - The request object (may contain user, query, headers).
 * @returns {{ enabled: boolean, reason: string }} Evaluation result.
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
 * Checks whether a named feature flag is enabled for the current request.
 * @param {string} featureName - The name of the feature flag.
 * @param {object} [req={}] - The request object.
 * @returns {boolean} True if the feature is enabled.
 */
function isFeatureEnabled(featureName, req = {}) {
  return evaluateFeatureFlag(getFeatureDefinition(featureName), req).enabled;
}

/**
 * Evaluates a named feature flag and returns a detailed result object.
 * @param {string} featureName - The name of the feature flag.
 * @param {object} [req={}] - The request object.
 * @returns {{ enabled: boolean, reason: string, flag: string }} Detailed evaluation result.
 */
function evaluateFeatureDetailed(featureName, req = {}) {
  const feature = getFeatureDefinition(featureName);
  const { enabled, reason } = evaluateFeatureFlag(feature, req);
  return { enabled, reason, flag: featureName };
}

/**
 * Returns a map of all feature flags evaluated for the current request.
 * @param {object} [req={}] - The request object.
 * @returns {Object.<string, boolean>} Map of feature name to enabled status.
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
  parseOverrideValue,
  parseUserList,
};
