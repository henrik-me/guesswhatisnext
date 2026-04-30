/**
 * Centralised configuration from environment variables.
 * Provides sensible dev defaults but requires secrets in production.
 */

const path = require('path');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production' || NODE_ENV === 'staging';

// Label-based hostname: each label is alnum (with interior hyphens), separated
// by single dots, followed by an optional port.  No underscores, no consecutive
// dots, no leading/trailing hyphens in labels.
const CANONICAL_HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*(?::\d{1,5})?$/i;
const DEPLOY_ENVIRONMENTS = ['local-container', 'staging', 'production'];

function getDeployEnvironment(env = process.env) {
  const override = (env.GWN_ENV || '').trim();
  if (override) {
    if (!DEPLOY_ENVIRONMENTS.includes(override)) {
      throw new Error(`Invalid GWN_ENV="${override}"; expected one of: ${DEPLOY_ENVIRONMENTS.join(', ')}`);
    }
    return override;
  }

  if (env.NODE_ENV === 'staging') return 'staging';
  if (env.NODE_ENV === 'production') return 'production';
  return 'local-container';
}

const config = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT, 10) || 3000,
  JWT_SECRET: process.env.JWT_SECRET || (isProduction ? '' : 'gwn-dev-secret-change-in-production'), // Dev/test default only — production/staging requires JWT_SECRET to be set and validates it at startup
  SYSTEM_API_KEY: process.env.SYSTEM_API_KEY || (isProduction ? '' : 'gwn-dev-system-key'), // Dev/test default only — production/staging requires SYSTEM_API_KEY to be set and validates it at startup
  GWN_DB_PATH: process.env.GWN_DB_PATH || path.join(__dirname, '..', 'data', 'game.db'),
  CANONICAL_HOST: (process.env.CANONICAL_HOST || '').trim(),
  DB_BACKEND: process.env.DATABASE_URL ? 'mssql' : 'sqlite',
  DATABASE_URL: process.env.DATABASE_URL || null,
  APPLICATIONINSIGHTS_CONNECTION_STRING: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING || '',
  FEATURE_SUBMIT_PUZZLE_PERCENTAGE: process.env.FEATURE_SUBMIT_PUZZLE_PERCENTAGE || '0',
  FEATURE_SUBMIT_PUZZLE_USERS: process.env.FEATURE_SUBMIT_PUZZLE_USERS || '',
  FEATURE_FLAG_ALLOW_OVERRIDE: process.env.FEATURE_FLAG_ALLOW_OVERRIDE || '',
  TRUST_PROXY: (() => {
    const trustProxy = parseInt(process.env.TRUST_PROXY, 10);
    if (Number.isNaN(trustProxy)) return 1;
    return Math.max(0, trustProxy);
  })(),
  LOG_LEVEL: (() => {
    const VALID_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
    const raw = (process.env.LOG_LEVEL || '').trim().toLowerCase();
    if (raw && VALID_LEVELS.includes(raw)) return raw;
    if (NODE_ENV === 'test') return 'silent';
    return isProduction ? 'info' : 'debug';
  })(),
};

/**
 * Validate required configuration at startup.
 * Fails fast with a clear error if secrets are missing in production.
 */
function validateConfig() {
  // Validate GWN_ENV early so a typo fails boot in prod/staging instead of
  // surfacing as intermittent 500s from request-time callers (e.g. telemetry).
  const nodeEnv = process.env.NODE_ENV || 'development';
  const failFast = nodeEnv === 'production' || nodeEnv === 'staging';
  if ((process.env.GWN_ENV || '').trim()) {
    try {
      getDeployEnvironment(process.env);
    } catch (err) {
      if (failFast) {
        // console.error used here — logger depends on config, can't require it
        console.error(`❌ ${err.message}`);
        throw err;
      }
      // console.warn used here — logger depends on config, can't require it
      console.warn(`⚠️  ${err.message}`);
    }
  }

  const missing = [];
  if (!(process.env.JWT_SECRET || '').trim()) missing.push('JWT_SECRET');
  if (!(process.env.SYSTEM_API_KEY || '').trim()) missing.push('SYSTEM_API_KEY');

  // Validate CANONICAL_HOST (required in production/staging for HTTPS redirect)
  if (isProduction) {
    const canonicalHost = (process.env.CANONICAL_HOST || '').trim();
    if (!canonicalHost) {
      missing.push('CANONICAL_HOST');
    } else if (!CANONICAL_HOST_RE.test(canonicalHost)) {
      // console.error used here — logger depends on config, can't require it
      console.error(
        `❌ CANONICAL_HOST="${canonicalHost}" is not a valid hostname[:port].\n` +
        '   Example: CANONICAL_HOST=example.com or CANONICAL_HOST=example.com:8443'
      );
      process.exit(1);
    }
  }

  if (missing.length > 0) {
    if (isProduction) {
      // console.error used here — logger depends on config, can't require it
      console.error(
        `❌ Missing required environment variables: ${missing.join(', ')}\n` +
        '   These must be set when NODE_ENV=production or NODE_ENV=staging.\n' +
        '   Example: JWT_SECRET=… SYSTEM_API_KEY=… CANONICAL_HOST=… node server/index.js'
      );
      process.exit(1);
    } else {
      // console.warn used here — logger depends on config, can't require it
      console.warn(
        `⚠️  Missing environment variables: ${missing.join(', ')}\n` +
        '   Using dev defaults. Set these before deploying to production.'
      );
    }
  }
}

module.exports = { config, validateConfig, CANONICAL_HOST_RE, getDeployEnvironment };
