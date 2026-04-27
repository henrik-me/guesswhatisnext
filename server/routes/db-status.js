'use strict';

/**
 * GET /api/db-status — public ops/health endpoint (CS53-8b).
 *
 * Returns the in-memory DB-init state without issuing a DB query.
 * Safe to probe externally because there is NO database access — the
 * three sources are:
 *   1. `getDbInitialized()` — closure over server/app.js's `dbInitialized`
 *      boolean (flipped to true on the first successful runInit()).
 *   2. `getInitInFlight()` — `initGuard.isInFlight()`, true while the
 *      shared init promise is pending.
 *   3. `getDbUnavailabilityState()` — the cached "permanent unavailable"
 *      descriptor (e.g. Azure SQL Free Tier capacity-exhausted), if
 *      runInit's last attempt produced one.
 *
 * Per CS53 Policy 1, this endpoint NEVER triggers a DB query — it is
 * pure introspection. SPA must NOT poll this endpoint; learns DB state
 * from real user request responses (UnavailableError / RetryableError
 * shapes from PR #234). This endpoint is for operator + external
 * uptime checks only.
 *
 * Telemetry: every request emits a structured Pino info line
 * `{ event: 'db-status-probe', dbInitialized, isInFlight, unavailable }`
 * so an unexpected polling pattern (SPA bug, or a misbehaving
 * external monitor) is visible in App Insights via KQL § B.17.
 *
 * Rate-limited at 30/min per IP — generous enough for legitimate
 * uptime checks but cheap enough to mitigate abuse.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const logger = require('../logger');
const { getDbUnavailabilityState } = require('../lib/db-unavailability-state');

function rateLimitHandler(req, res) {
  return res.status(429).json({ error: 'Too many db-status probes, try again later' });
}

const dbStatusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

function createDbStatusRouter({ getDbInitialized, getInitInFlight }) {
  if (typeof getDbInitialized !== 'function' || typeof getInitInFlight !== 'function') {
    throw new Error('createDbStatusRouter: getDbInitialized and getInitInFlight are required functions');
  }
  const router = express.Router();

  router.get('/', dbStatusLimiter, (req, res) => {
    const dbInitialized = !!getDbInitialized();
    const isInFlight = !!getInitInFlight();
    const unavailability = getDbUnavailabilityState() || null;
    logger.info(
      {
        event: 'db-status-probe',
        dbInitialized,
        isInFlight,
        unavailable: !!unavailability,
        unavailabilityReason: unavailability ? unavailability.reason : undefined,
      },
      'db-status probe',
    );
    return res.status(200).json({
      dbInitialized,
      isInFlight,
      unavailability,
    });
  });

  return router;
}

module.exports = { createDbStatusRouter, dbStatusLimiter };
