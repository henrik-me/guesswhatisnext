'use strict';

const { config } = require('./config');
const logger = require('./logger');

const ENABLED_OVERRIDE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);
const DISABLED_OVERRIDE_VALUES = new Set(['0', 'false', 'no', 'off', 'disable', 'disabled']);

function normalizeIdentifier(value) {
  return String(value).trim().toLowerCase();
}

/**
 * Clamp a rollout percentage to an integer from 0-100.
 *
 * @param {string|number|null|undefined} value - Candidate rollout percentage.
 * @returns {number} Clamped rollout percentage.
 */
function clampRolloutPercentage(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

/**
 * Parse a comma-separated list of user identifiers.
 *
 * @param {string} value - Comma-separated user identifiers.
 * @returns {Set<string>} Normalized user identifiers.
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
 * Parse a feature-flag override value from request input.
 *
 * @param {string|string[]|null|undefined} value - Raw override value.
 * @returns {boolean|null} Parsed boolean override, or null if invalid/missing.
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
 * Build a stable rollout key for deterministic bucket assignment.
 *
 * @param {{id?: string|number, username?: string}|null|undefined} user - Request user.
 * @returns {string|null} Stable rollout key, or null when unavailable.
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
 * Hash a stable key into rollout bucket range [0, 99].
 *
 * @param {string} stableKey - Stable user key.
 * @returns {number} Deterministic rollout bucket.
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
 * Evaluate a feature flag definition for the current request.
 *
 * @param {object} feature - Feature flag definition.
 * @param {object} [req={}] - Request-like object with user/query/headers.
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

  const evaluation = { enabled, reason };
  logger.debug({ flag: feature.key, ...evaluation }, 'feature flag evaluated');
  return evaluation;
}

/**
 * Evaluate a feature by name with detailed output.
 *
 * @param {string} featureName - Feature flag key.
 * @param {object} [req={}] - Request-like object with user/query/headers.
 * @returns {{ enabled: boolean, reason: string, flag: string }} Evaluation details.
 */
function evaluateFeatureDetailed(featureName, req = {}) {
  return {
    ...evaluateFeatureFlag(getFeatureDefinition(featureName), req),
    flag: featureName,
  };
}

/**
 * Evaluate whether a feature is enabled for a request.
 *
 * @param {string} featureName - Feature flag key.
 * @param {object} [req={}] - Request-like object with user/query/headers.
 * @returns {boolean} Whether the feature is enabled.
 */
function isFeatureEnabled(featureName, req = {}) {
  return evaluateFeatureFlag(getFeatureDefinition(featureName), req).enabled;
}

/**
 * Evaluate all configured feature flags for a request.
 *
 * @param {object} [req={}] - Request-like object with user/query/headers.
 * @returns {Record<string, boolean>} Map of feature keys to booleans.
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
