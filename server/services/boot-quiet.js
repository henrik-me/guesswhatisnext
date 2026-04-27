/**
 * Boot-quiet contract helper (CS53-19).
 *
 * Provides a single source of truth for:
 *   - reading the `X-User-Activity` request header,
 *   - detecting system-key callers (operator/system bypasses the contract per
 *     INSTRUCTIONS.md § Database & Data),
 *   - deciding whether the handler is allowed to touch the DB,
 *   - emitting the structured Pino telemetry line the boot-quiet KQL queries
 *     in `docs/observability.md` § B.x consume,
 *   - setting the `X-Boot-Quiet-DB-Touched` response header so end-to-end
 *     tests can assert the contract via the wire (works in any environment:
 *     local Playwright webServer, Docker container, deployed Azure, etc.).
 *
 * All boot/focus endpoints share the same shape — see CS53-23's
 * `/api/notifications/count` handler as the canonical pattern. The
 * `dbTouched` field is the contract-enforcement signal: header-less
 * non-system requests MUST log `dbTouched=false` AND respond with
 * `X-Boot-Quiet-DB-Touched: false`.
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
 * If `res` (the Express response object) is provided, also sets the
 * `X-Boot-Quiet-DB-Touched: true|false` response header so the boot-quiet
 * E2E test can assert the contract via the wire instead of by scraping a
 * server-stdout log file (the log-file approach worked in local Playwright
 * but failed in CI's Docker-based Ephemeral Smoke Test where stdout doesn't
 * tee to the host filesystem). The header MUST be set BEFORE any
 * `res.json()` / `res.end()` / `res.set()` for body content; callers should
 * call this function before responding. Also sets `X-Boot-Quiet-User-Activity`
 * and `X-Boot-Quiet-Is-System` so the test can discriminate scenarios
 * without parsing logs.
 *
 * Reserved keys (`gate`, `route`, `dbTouched`, `userActivity`, `isSystem`,
 * `userId`) are protected — `extra` cannot override them, even by accident.
 * This keeps the telemetry contract observable from the KQL query in
 * `docs/observability.md § B.14` regardless of how a caller misuses `extra`.
 * (Copilot R2 finding.)
 */
function logBootQuiet(route, ctx, dbTouched, extra, res) {
  const dbTouchedBool = !!dbTouched;
  // Set response headers (best-effort — silently no-op if res is missing or
  // headers were already sent, which can happen on unusual error paths).
  if (res && typeof res.set === 'function' && !res.headersSent) {
    res.set('X-Boot-Quiet-DB-Touched', dbTouchedBool ? 'true' : 'false');
    res.set('X-Boot-Quiet-User-Activity', ctx.userActivity ? 'true' : 'false');
    res.set('X-Boot-Quiet-Is-System', ctx.isSystem ? 'true' : 'false');
  }

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
  payload.dbTouched = dbTouchedBool;
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
