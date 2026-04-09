'use strict';

const { config } = require('./config');
const logger = require('./logger');

const ENABLED_OVERRIDE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);
const DISABLED_OVERRIDE_VALUES = new Set(['0', 'false', 'no', 'off', 'disable', 'disabled']);

function normalizeIdentifier(value) {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

/**
 * Clamp a rollout percentage to the inclusive range 0-100.
 *
 * @param {string|number|null|undefined} value - Raw rollout percentage value.
 * @returns {number} The clamped rollout percentage.
 */
function clampRolloutPercentage(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

/**
 * Parse a comma-separated user list into normalized identifiers.
 *
 * @param {string|null|undefined} value - Raw comma-separated user list.
 * @returns {Set<string>} The normalized user identifiers.
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
 * Parse a feature flag override value from a query parameter or header.
 *
 * @param {string|string[]|null|undefined} value - Raw override value.
 * @returns {boolean|null} Parsed boolean override, or null when invalid.
 */
function parseOverrideValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
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
 * Get a stable, normalized rollout key for a user.
 *
 * @param {{ id?: string|number|null, username?: string|null }|null|undefined} user - User identity.
 * @returns {string|null} Stable rollout key, or null when unavailable.
 */
function getStableRolloutKey(user) {
  if (!user) return null;
  const normalizedId = normalizeIdentifier(user.id);
  if (normalizedId) {
    return `id:${normalizedId}`;
  }
  const normalizedUsername = normalizeIdentifier(user.username);
  if (normalizedUsername) {
    return `user:${normalizedUsername}`;
  }
  return null;
}

/**
 * Compute a deterministic rollout bucket for a stable key.
 *
 * @param {string|null|undefined} stableKey - Stable user rollout key.
 * @returns {number} A bucket value from 0 to 99.
 */
function getRolloutBucket(stableKey) {
  let hash = 0;
  for (const char of String(stableKey || '')) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return ((hash % 100) + 100) % 100;
}

function getHeaderValue(headers, headerName) {
  const normalizedHeaderName = normalizeIdentifier(headerName);
  if (!headers || !normalizedHeaderName) return undefined;

  if (Object.prototype.hasOwnProperty.call(headers, normalizedHeaderName)) {
    return headers[normalizedHeaderName];
  }

  return Object.entries(headers).find(([key]) => normalizeIdentifier(key) === normalizedHeaderName)?.[1];
}

function getFeatureOverride(feature, req = {}) {
  if (!feature.allowOverride) return null;

  const queryValue = req.query && req.query[feature.overrideQueryParam];
  const queryOverride = parseOverrideValue(queryValue);
  if (queryOverride !== null) return queryOverride;

  const headers = req.headers || {};
  const headerValue = getHeaderValue(headers, feature.overrideHeader);
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
 *
 * @param {object} feature - Feature flag definition.
 * @param {object} [req={}] - Request-like object containing user, query, and headers.
 * @returns {{ enabled: boolean, reason: string }} Evaluation result.
 */
function evaluateFeatureFlag(feature, req = {}) {
  const result = (() => {
    const override = getFeatureOverride(feature, req);
    if (override !== null) {
      return { enabled: override, reason: 'override' };
    }

    if (feature.defaultEnabled) {
      return { enabled: true, reason: 'default-on' };
    }

    if (isUserTargeted(feature, req.user)) {
      return { enabled: true, reason: 'user-targeted' };
    }

    if (feature.rolloutPercentage > 0) {
      const stableKey = getStableRolloutKey(req.user);
      if (!stableKey) {
        return { enabled: false, reason: 'rollout-no-key' };
      }
      if (getRolloutBucket(stableKey) < feature.rolloutPercentage) {
        return { enabled: true, reason: 'rollout' };
      }
      return { enabled: false, reason: 'rollout-miss' };
    }

    return { enabled: false, reason: 'default-off' };
  })();

  logger.debug({ flag: feature.key, enabled: result.enabled, reason: result.reason }, 'feature flag evaluated');
  return result;
}

/**
 * Evaluate a feature by name and include the flag identifier in the result.
 *
 * @param {string} featureName - Feature flag name.
 * @param {object} [req={}] - Request-like object containing user, query, and headers.
 * @returns {{ enabled: boolean, reason: string, flag: string }} Detailed evaluation result.
 */
function evaluateFeatureDetailed(featureName, req = {}) {
  return {
    ...evaluateFeatureFlag(getFeatureDefinition(featureName), req),
    flag: featureName,
  };
}

/**
 * Check whether a named feature is enabled for a request.
 *
 * @param {string} featureName - Feature flag name.
 * @param {object} [req={}] - Request-like object containing user, query, and headers.
 * @returns {boolean} Whether the feature is enabled.
 */
function isFeatureEnabled(featureName, req = {}) {
  return evaluateFeatureFlag(getFeatureDefinition(featureName), req).enabled;
}

/**
 * Get all feature flag states for a request.
 *
 * @param {object} [req={}] - Request-like object containing user, query, and headers.
 * @returns {Record<string, boolean>} Map of feature names to boolean enabled states.
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
