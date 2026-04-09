'use strict';

const { config } = require('./config');
const logger = require('./logger');

const ENABLED_OVERRIDE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);
const DISABLED_OVERRIDE_VALUES = new Set(['0', 'false', 'no', 'off', 'disable', 'disabled']);

function normalizeIdentifier(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toLowerCase();
}

/**
 * Clamp a rollout percentage to an integer between 0 and 100.
 * @param {unknown} value - Raw rollout percentage value.
 * @returns {number} Integer percentage between 0 and 100.
 */
function clampRolloutPercentage(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

/**
 * Parse a comma-separated user allowlist into normalized identifiers.
 * @param {unknown} value - Raw configured user list.
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
 * Parse an override value from query params or headers.
 * @param {unknown} value - Raw override value.
 * @returns {boolean|null} Parsed override state, or null when invalid.
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
 * Build a stable rollout key for a user.
 * @param {{id?: unknown, username?: unknown}|null|undefined} user - User to evaluate.
 * @returns {string|null} Stable rollout key, or null for anonymous users.
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
 * Hash a rollout key into a deterministic bucket from 0-99.
 * @param {string|null|undefined} stableKey - Stable rollout key.
 * @returns {number} Deterministic bucket value.
 */
function getRolloutBucket(stableKey) {
  let hash = 0;
  for (const char of String(stableKey || '')) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return ((hash % 100) + 100) % 100;
}

function getHeaderValue(headers, headerName) {
  if (!headers) return undefined;

  const normalizedHeaderName = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalizedHeaderName) {
      return value;
    }
  }

  return undefined;
}

function getFeatureOverride(feature, req = {}) {
  if (!feature.allowOverride) return null;

  const queryValue = req.query && req.query[feature.overrideQueryParam];
  const queryOverride = parseOverrideValue(queryValue);
  if (queryOverride !== null) return queryOverride;

  const headerValue = getHeaderValue(req.headers, feature.overrideHeader);
  const headerOverride = parseOverrideValue(headerValue);
  if (headerOverride !== null) return headerOverride;

  return null;
}

function isUserTargeted(feature, user) {
  if (!feature.users || feature.users.size === 0) return false;
  return getTargetKeys(user).some((key) => feature.users.has(key));
}

/**
 * Evaluate a feature definition for a request.
 * @param {object} feature - Feature definition to evaluate.
 * @param {object} [req={}] - Express-like request object.
 * @returns {{ enabled: boolean, reason: string }} Evaluation result.
 */
function evaluateFeatureFlag(feature, req = {}) {
  let result;

  const override = getFeatureOverride(feature, req);
  if (override !== null) {
    result = { enabled: override, reason: 'override' };
  } else if (feature.defaultEnabled) {
    result = { enabled: true, reason: 'default-on' };
  } else if (isUserTargeted(feature, req.user)) {
    result = { enabled: true, reason: 'user-targeted' };
  } else if (feature.rolloutPercentage > 0) {
    const stableKey = getStableRolloutKey(req.user);
    if (!stableKey) {
      result = { enabled: false, reason: 'rollout-no-key' };
    } else if (getRolloutBucket(stableKey) < feature.rolloutPercentage) {
      result = { enabled: true, reason: 'rollout' };
    } else {
      result = { enabled: false, reason: 'rollout-miss' };
    }
  } else {
    result = { enabled: false, reason: 'default-off' };
  }

  logger.debug({ flag: feature.key, enabled: result.enabled, reason: result.reason }, 'feature flag evaluated');
  return result;
}

/**
 * Evaluate a named feature and include its flag key in the response.
 * @param {string} featureName - Feature flag name.
 * @param {object} [req={}] - Express-like request object.
 * @returns {{ enabled: boolean, reason: string, flag: string }} Detailed evaluation result.
 */
function evaluateFeatureDetailed(featureName, req = {}) {
  const result = evaluateFeatureFlag(getFeatureDefinition(featureName), req);
  return { ...result, flag: featureName };
}

/**
 * Check whether a named feature is enabled for a request.
 * @param {string} featureName - Feature flag name.
 * @param {object} [req={}] - Express-like request object.
 * @returns {boolean} True when the feature is enabled.
 */
function isFeatureEnabled(featureName, req = {}) {
  return evaluateFeatureFlag(getFeatureDefinition(featureName), req).enabled;
}

/**
 * Get all evaluated feature flags for a request.
 * @param {object} [req={}] - Express-like request object.
 * @returns {Record<string, boolean>} Boolean feature states by flag name.
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
