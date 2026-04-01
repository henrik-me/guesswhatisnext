/**
 * Centralised configuration from environment variables.
 * Provides sensible dev defaults but requires secrets in production.
 */

const path = require('path');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production' || NODE_ENV === 'staging';

const CANONICAL_HOST_RE = /^[\w][\w.-]*(:\d+)?$/;

const config = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT, 10) || 3000,
  JWT_SECRET: process.env.JWT_SECRET || (isProduction ? '' : 'gwn-dev-secret-change-in-production'),
  SYSTEM_API_KEY: process.env.SYSTEM_API_KEY || (isProduction ? '' : 'gwn-dev-system-key'),
  GWN_DB_PATH: process.env.GWN_DB_PATH || path.join(__dirname, '..', 'data', 'game.db'),
  CANONICAL_HOST: (process.env.CANONICAL_HOST || '').trim(),
  DB_BACKEND: process.env.DATABASE_URL ? 'mssql' : 'sqlite',
  DATABASE_URL: process.env.DATABASE_URL || null,
};

/**
 * Validate required configuration at startup.
 * Fails fast with a clear error if secrets are missing in production.
 */
function validateConfig() {
  const missing = [];
  if (!(process.env.JWT_SECRET || '').trim()) missing.push('JWT_SECRET');
  if (!(process.env.SYSTEM_API_KEY || '').trim()) missing.push('SYSTEM_API_KEY');

  // Validate CANONICAL_HOST (required in production/staging for HTTPS redirect)
  if (isProduction) {
    const canonicalHost = (process.env.CANONICAL_HOST || '').trim();
    if (!canonicalHost) {
      missing.push('CANONICAL_HOST');
    } else if (!CANONICAL_HOST_RE.test(canonicalHost)) {
      console.error(
        `❌ CANONICAL_HOST="${canonicalHost}" is not a valid hostname[:port].\n` +
        '   Example: CANONICAL_HOST=example.com or CANONICAL_HOST=example.com:8443'
      );
      process.exit(1);
    }
  }

  if (missing.length > 0) {
    if (isProduction) {
      console.error(
        `❌ Missing required environment variables: ${missing.join(', ')}\n` +
        '   These must be set when NODE_ENV=production or NODE_ENV=staging.\n' +
        '   Example: JWT_SECRET=… SYSTEM_API_KEY=… CANONICAL_HOST=… node server/index.js'
      );
      process.exit(1);
    } else {
      console.warn(
        `⚠️  Missing environment variables: ${missing.join(', ')}\n` +
        '   Using dev defaults. Set these before deploying to production.'
      );
    }
  }
}

module.exports = { config, validateConfig, CANONICAL_HOST_RE };
