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
 * that have an in-process cache (currently `/api/notifications/count`), or
 * `level: 'warn'` to bump the log level. The field set is the union of
 * CS53-23's existing log line and the new `dbTouched` signal CS53-19 adds
 * for the cache-less endpoints.
 *
 * Reserved keys (`gate`, `route`, `dbTouched`, `userActivity`, `isSystem`,
 * `userId`) are protected — `extra` cannot override them, even by accident.
 * This keeps the telemetry contract observable from the KQL query in
 * `docs/observability.md § B.14` regardless of how a caller misuses `extra`.
 * (Copilot R2 finding.)
 */
function logBootQuiet(route, ctx, dbTouched, extra) {
  const payload = {};
  // Apply caller-supplied extras FIRST so canonical fields below win on key
  // collision — protects the telemetry contract from accidental override.
  if (extra && typeof extra === 'object') {
    for (const k of Object.keys(extra)) {
      if (extra[k] !== undefined) payload[k] = extra[k];
    }
  }
  // Canonical fields (last write wins).
  payload.gate = 'boot-quiet';
  payload.route = route;
  payload.dbTouched = !!dbTouched;
  payload.userActivity = ctx.userActivity;
  payload.isSystem = ctx.isSystem;
  payload.userId = ctx.userId;
  // `level` is a control field, not a payload field — strip before logging.
  const wantWarn = extra && extra.level === 'warn';
  if ('level' in payload) delete payload.level;
  if (wantWarn) {
    logger.warn(payload, 'boot-quiet endpoint accessed');
  } else {
    logger.info(payload, 'boot-quiet endpoint accessed');
  }
}

module.exports = { bootQuietContext, logBootQuiet };
