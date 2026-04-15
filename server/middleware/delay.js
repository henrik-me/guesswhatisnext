'use strict';

/**
 * Delay middleware — simulates DB cold start by adding artificial delay to API routes.
 * Controlled by GWN_DB_DELAY_MS env var (any positive integer in milliseconds, capped at 45000ms).
 * Only active when NODE_ENV is not 'production' or 'staging'.
 *
 * Excluded paths (no delay applied):
 *   - /api/health   (system health check)
 *   - /api/admin/*  (admin endpoints)
 *   - /api/telemetry/* (telemetry ingestion)
 *   - All non-/api/ routes (static assets, SPA fallback, /healthz)
 *
 * Usage: GWN_DB_DELAY_MS=15000 npm start
 */
function createDelayMiddleware() {
  const delayMs = parseInt(process.env.GWN_DB_DELAY_MS, 10);
  const env = process.env.NODE_ENV;
  if (!delayMs || delayMs <= 0 || env === 'production' || env === 'staging') {
    return null;
  }

  const logger = require('../logger');
  const cappedDelay = Math.min(delayMs, 45000);
  logger.info({ delayMs: cappedDelay }, 'API delay simulation active');

  return (req, res, next) => {
    const p = req.path;
    const shouldDelay = p.startsWith('/api/') &&
      p !== '/api/health' &&
      !p.startsWith('/api/admin/') && !p.startsWith('/api/telemetry/');

    if (shouldDelay) {
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
