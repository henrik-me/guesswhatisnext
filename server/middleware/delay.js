'use strict';

/**
 * Delay middleware — simulates DB cold start by adding artificial delay to API routes.
 * Controlled by GWN_DB_DELAY_MS env var (milliseconds, 0-45000).
 * Only active when NODE_ENV is not 'production'.
 *
 * Usage: GWN_DB_DELAY_MS=15000 npm start
 */
function createDelayMiddleware() {
  const delayMs = parseInt(process.env.GWN_DB_DELAY_MS, 10);
  if (!delayMs || delayMs <= 0 || process.env.NODE_ENV === 'production') {
    return null;
  }

  const logger = require('../logger');
  const cappedDelay = Math.min(delayMs, 45000);
  logger.info({ delayMs: cappedDelay }, 'API delay simulation active');

  return (req, res, next) => {
    if (req.path.startsWith('/api/') && req.path !== '/api/health' && req.path !== '/healthz') {
      let cancelled = false;
      const timer = setTimeout(() => {
        if (!cancelled) next();
      }, cappedDelay);
      res.on('close', () => { cancelled = true; clearTimeout(timer); });
    } else {
      next();
    }
  };
}

module.exports = { createDelayMiddleware };
