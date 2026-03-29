/**
 * Centralised configuration from environment variables.
 * Provides sensible dev defaults but requires secrets in production.
 */

const path = require('path');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

const config = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT, 10) || 3000,
  JWT_SECRET: process.env.JWT_SECRET || (isProduction ? '' : 'gwn-dev-secret-change-in-production'),
  SYSTEM_API_KEY: process.env.SYSTEM_API_KEY || (isProduction ? '' : 'gwn-dev-system-key'),
  GWN_DB_PATH: process.env.GWN_DB_PATH || path.join(__dirname, '..', 'data', 'game.db'),
};

/**
 * Validate required configuration at startup.
 * Fails fast with a clear error if secrets are missing in production.
 */
function validateConfig() {
  const missing = [];
  if (!config.JWT_SECRET) missing.push('JWT_SECRET');
  if (!config.SYSTEM_API_KEY) missing.push('SYSTEM_API_KEY');

  if (missing.length > 0) {
    if (isProduction) {
      console.error(
        `❌ Missing required environment variables: ${missing.join(', ')}\n` +
        '   These must be set when NODE_ENV=production.\n' +
        '   Example: JWT_SECRET=… SYSTEM_API_KEY=… node server/index.js'
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

module.exports = { config, validateConfig };
