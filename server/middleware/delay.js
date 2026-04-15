'use strict';

/**
 * Delay middleware — simulates DB cold start by adding artificial delay to API routes.
 *
 * Supports two modes:
 *   1. GWN_DB_DELAY_PATTERN — comma-separated list of delays that cycle per navigation
 *      (e.g., "45000,15000,0,0,0,0"). The pattern advances when there's a 2s+ gap between
 *      requests (i.e., a new page navigation). Parallel requests within a burst all get
 *      the same delay, simulating real DB cold start behavior.
 *   2. GWN_DB_DELAY_MS — single fixed delay (backward compat)
 *
 * Each value is capped at 45000ms. Values <= 0 mean no delay for that step.
 * Only active when NODE_ENV is not 'production' or 'staging'.
 *
 * Excluded paths (no delay applied):
 *   - /api/health   (system health check)
 *   - /api/admin/*  (admin endpoints)
 *   - /api/telemetry/* (telemetry ingestion)
 *   - All non-/api/ routes (static assets, SPA fallback, /healthz)
 *
 * Usage:
 *   GWN_DB_DELAY_PATTERN=45000,15000,0,0,0,0 npm start   # cycling pattern
 *   GWN_DB_DELAY_MS=15000 npm start                       # fixed delay
 */
function parsePattern(raw) {
  if (!raw || !raw.trim()) return null;
  const values = raw.split(',').map((v) => {
    const n = parseInt(v.trim(), 10);
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 45000) : NaN;
  }).filter((n) => !Number.isNaN(n));
  return values.length > 0 ? values : null;
}

function createDelayMiddleware() {
  const env = process.env.NODE_ENV;
  if (env === 'production' || env === 'staging') return null;

  // GWN_DB_DELAY_PATTERN takes precedence over GWN_DB_DELAY_MS
  let pattern = parsePattern(process.env.GWN_DB_DELAY_PATTERN);
  if (!pattern) {
    const delayMs = parseInt(process.env.GWN_DB_DELAY_MS, 10);
    if (!delayMs || delayMs <= 0) return null;
    pattern = [Math.min(delayMs, 45000)];
  }

  const logger = require('../logger');
  if (pattern.length === 1) {
    logger.info({ delayMs: pattern[0] }, 'API delay simulation active');
  } else {
    logger.info({ pattern }, 'API delay pattern active: [%s] (cycling per navigation)', pattern.join(', '));
  }

  let stepIndex = 0;
  let lastRequestTime = null;
  const NAV_GAP_MS = 2000; // 2s gap = new navigation = advance step

  return (req, res, next) => {
    const p = req.path;
    const shouldDelay = p.startsWith('/api/') &&
      p !== '/api/health' &&
      !p.startsWith('/api/admin/') && !p.startsWith('/api/telemetry/');

    if (!shouldDelay) {
      next();
      return;
    }

    const now = Date.now();
    // Advance pattern step only on new navigation (2s+ gap since last request)
    if (lastRequestTime != null && (now - lastRequestTime) >= NAV_GAP_MS) {
      stepIndex = (stepIndex + 1) % pattern.length;
    }
    lastRequestTime = now;

    const delay = pattern[stepIndex];

    if (delay <= 0) {
      logger.debug({ path: p, step: stepIndex + 1, steps: pattern.length, delayMs: 0 },
        'Delaying %s by 0ms (step %d/%d)', p, stepIndex + 1, pattern.length);
      next();
      return;
    }

    logger.debug({ path: p, step: stepIndex + 1, steps: pattern.length, delayMs: delay },
      'Delaying %s by %dms (step %d/%d)', p, delay, stepIndex + 1, pattern.length);

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) next();
    }, delay);
    res.on('close', () => { cancelled = true; clearTimeout(timer); });
  };
}

module.exports = { createDelayMiddleware };
