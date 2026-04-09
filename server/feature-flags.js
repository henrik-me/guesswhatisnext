'use strict';

const { config } = require('./config');
const logger = require('./logger');

const ENABLED_OVERRIDE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);
const DISABLED_OVERRIDE_VALUES = new Set(['0', 'false', 'no', 'off', 'disable', 'disabled']);

function normalizeIdentifier(value) {
  return String(value).trim().toLowerCase();
}

/**
 * Clamp rollout percentage values to an integer in range 0-100.
 * @param {unknown} value - Candidate percentage input.
 * @returns {number} Clamped integer rollout percentage.
 */
function clampRolloutPercentage(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

/**
 * Parse a comma-separated user target list into a normalized key set.
 * @param {unknown} value - Comma-separated user identifiers.
 * @returns {Set<string>} Normalized target key set.
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
 * Parse a feature override value from query/header input.
 * @param {unknown} value - Raw request override value.
 * @returns {boolean|null} Parsed boolean override, or null when invalid.
 */
function parseOverrideValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null) return null;

  const normalized = normalizeIdentifier(raw);
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
 * Resolve a feature flag configuration by name.
 * @param {string} featureName - Feature flag key.
 * @returns {object} Feature configuration.
 * @throws {Error} When the feature name is unknown.
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
 * Build a stable identifier used for deterministic rollout bucketing.
 * @param {object|null|undefined} user - Request user object.
 * @returns {string|null} Stable rollout key or null when unavailable.
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
 * Hash a stable rollout key into a deterministic bucket from 0 to 99.
 * @param {string} stableKey - Stable rollout key.
 * @returns {number} Rollout bucket value.
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
  const expectedHeader = feature.overrideHeader.toLowerCase();
  const headerKey = Object.keys(headers).find((key) => key.toLowerCase() === expectedHeader);
  const headerValue = headerKey ? headers[headerKey] : undefined;
  const headerOverride = parseOverrideValue(headerValue);
  if (headerOverride !== null) return headerOverride;

  return null;
}

function isUserTargeted(feature, user) {
  if (!feature.users || feature.users.size === 0) return false;
  return getTargetKeys(user).some((key) => feature.users.has(key));
}

/**
 * Evaluate a feature configuration for a given request context.
 * @param {object} feature - Feature configuration object.
 * @param {object} [req={}] - Express-like request context.
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

  const result = { enabled, reason };
  logger.debug({ flag: feature.key, enabled: result.enabled, reason: result.reason }, 'feature flag evaluated');
  return result;
}

/**
 * Evaluate a named feature and include the evaluated flag name in the response.
 * @param {string} featureName - Feature flag key to evaluate.
 * @param {object} [req={}] - Express-like request context.
 * @returns {{ enabled: boolean, reason: string, flag: string }} Detailed evaluation result.
 */
function evaluateFeatureDetailed(featureName, req = {}) {
  const feature = getFeatureDefinition(featureName);
  const result = evaluateFeatureFlag(feature, req);
  return { ...result, flag: featureName };
}

/**
 * Evaluate whether a named feature is enabled for a request.
 * @param {string} featureName - Feature flag key to evaluate.
 * @param {object} [req={}] - Express-like request context.
 * @returns {boolean} Whether the feature is enabled.
 */
function isFeatureEnabled(featureName, req = {}) {
  return evaluateFeatureFlag(getFeatureDefinition(featureName), req).enabled;
}

/**
 * Evaluate all configured feature flags for a request context.
 * @param {object} [req={}] - Express-like request context.
 * @returns {Record<string, boolean>} Map of feature names to enabled booleans.
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
