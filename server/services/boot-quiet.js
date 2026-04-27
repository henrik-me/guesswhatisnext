'use strict';

/**
 * Boot-quiet contract helper (CS53-19).
 *
 * Provides a single source of truth for:
 *   - reading the `X-User-Activity` request header,
 *   - detecting system-key callers (operator/system bypasses the contract per
 *     INSTRUCTIONS.md § Database & Data),
 *   - deciding whether the handler is allowed to touch the DB,
 *   - emitting the structured Pino telemetry line the boot-quiet KQL queries
 *     in `docs/observability.md` § B.x consume.
 *
 * All boot/focus endpoints share the same shape — see CS53-23's
 * `/api/notifications/count` handler as the canonical pattern. The
 * `dbTouched` field is the contract-enforcement signal: header-less
 * non-system requests MUST log `dbTouched=false`. The CI regression test in
 * `tests/e2e/boot-quiet.spec.mjs` parses the log lines and fails the build
 * if any header-less request shows `dbTouched=true`.
 */

const logger = require('../logger');

/** Read the boot-quiet request context off an Express req. */
function bootQuietContext(req) {
  const userActivity = req.get('X-User-Activity') === '1';
  const isSystem = req.user ? req.user.role === 'system' : false;
  const userId = req.user && Number.isInteger(req.user.id) ? req.user.id : null;
  return { userActivity, isSystem, userId, allowDb: userActivity || isSystem };
}

/**
 * Emit one boot-quiet telemetry line for `route` after the handler has decided
 * whether it touched the DB. `extra` may include `cacheOutcome` for endpoints
 * that have an in-process cache (currently `/api/notifications/count`). The
 * field set is the union of CS53-23's existing log line and the new
 * `dbTouched` signal CS53-19 adds for the cache-less endpoints.
 */
function logBootQuiet(route, ctx, dbTouched, extra) {
  const payload = {
    gate: 'boot-quiet',
    route,
    dbTouched: !!dbTouched,
    userActivity: ctx.userActivity,
    isSystem: ctx.isSystem,
    userId: ctx.userId,
  };
  if (extra && typeof extra === 'object') {
    for (const k of Object.keys(extra)) {
      if (extra[k] !== undefined) payload[k] = extra[k];
    }
  }
  if (extra && extra.level === 'warn') {
    delete payload.level;
    logger.warn(payload, 'boot-quiet endpoint accessed');
  } else {
    logger.info(payload, 'boot-quiet endpoint accessed');
  }
}

module.exports = { bootQuietContext, logBootQuiet };
