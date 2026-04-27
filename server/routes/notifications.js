'use strict';

/**
 * Notification routes — in-app notifications for users.
 * Users can view, mark-read, and bulk-mark-read their notifications.
 */

const express = require('express');
const { getDbAdapter } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { unreadCountCache, coerceUnreadCount } = require('../services/unread-count-cache');
const { bootQuietContext, logBootQuiet } = require('../services/boot-quiet');
const logger = require('../logger');

const router = express.Router();

/** GET /api/notifications — list user's notifications.
 *
 * Boot-quiet contract (CS53-19): header-less non-system requests get an
 * empty list immediately — no DB query. The SPA refetches with
 * `X-User-Activity: 1` on first user gesture (e.g. opening the
 * notifications drawer).
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const unreadOnly = req.query.unread === 'true' || req.query.unread === '1';
    const userActivity = req.get('X-User-Activity') === '1';
    const isSystemList = req.user.role === 'system';
    const ctx = bootQuietContext(req);
    if (!ctx.allowDb) {
      logBootQuiet('/api/notifications', ctx, false);
      return res.json({ notifications: [], unread_count: 0 });
    }
    const db = await getDbAdapter();

    let query = 'SELECT id, user_id, type, message, data, is_read, created_at FROM notifications WHERE user_id = ?';
    const params = [userId];

    if (unreadOnly) {
      query += ' AND is_read = 0';
    }

    query += ' ORDER BY created_at DESC';
    if (db.dialect === 'mssql') {
      query += ' OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY';
    } else {
      query += ' LIMIT 50';
    }

    const willSeedCache = userActivity || isSystemList;
    // Only capture a generation token when we're actually going to call
    // setIfFresh — beginRead has the side-effect of lazily seeding the
    // generations Map (R9), and seeding for boot/focus polls that will
    // never store wastes an entry and an eviction-check (Copilot R10).
    const token = willSeedCache ? unreadCountCache.beginRead(userId) : null;
    const notifications = await db.all(query, params);

    const countRow = await db.get(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    // Same MSSQL-safe coercion as /count (Copilot R5 finding) — single helper.
    const unreadCount = coerceUnreadCount(countRow ? countRow.count : 0);

    // Seed the unread-count cache from this fresh DB read so a follow-up
    // /api/notifications/count request — including a header-less boot/focus
    // poll on a different page load — gets a HIT instead of MISS-NO-ACTIVITY.
    // Only seed when the request was a user gesture or operator call;
    // otherwise we'd let an unrelated background fetch populate the cache.
    if (willSeedCache) {
      unreadCountCache.setIfFresh(userId, unreadCount, token);
    }

    res.json({
      notifications: notifications.map(n => {
        let data = null;
        if (n.data) {
          try { data = JSON.parse(n.data); } catch { /* malformed JSON — treat as null */ }
        }
        return {
          id: n.id,
          type: n.type,
          message: n.message,
          data,
          read: !!n.is_read,
          created_at: n.created_at,
        };
      }),
      unread_count: unreadCount,
    });
    logBootQuiet('/api/notifications', ctx, true);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/notifications/count — unread count for badge.
 *
 * Boot-quiet contract (CS53-23): for requests that reach this handler
 * (i.e. after `requireAuth` and the global cold-start init gate in
 * `server/app.js`), the DB is touched ONLY when the request carries
 * `X-User-Activity: 1` AND the cache misses. Boot/focus/poller traffic
 * (no header) gets the cached value or `{ unread_count: 0 }` from this
 * handler — never a DB query at the route layer.
 *
 * Caveat — pre-route exceptions (CS53-19.D scope, not closed by this PR):
 * the global `/api/*` request gate at `server/app.js:258-280` triggers
 * `runInit()` for header-less requests when `!dbInitialized`, which can
 * touch the DB before this handler runs. CS53-19.D will gate that path
 * on `X-User-Activity: 1` (and update `scripts/container-validate.js` to
 * send the header). Until then, the route-level guarantee is the one
 * documented above.
 *
 * System-key (operator) requests are exempt from the contract per
 * INSTRUCTIONS.md § Database & Data and may always read the DB on cache miss.
 * See INSTRUCTIONS.md § Database & Data (Boot-quiet rule).
 */
router.get('/count', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userActivity = req.get('X-User-Activity') === '1';
    // System-key callers bypass the boot-quiet header gate (operator/system-key
    // is explicitly excluded from the contract — INSTRUCTIONS.md § Database & Data).
    const isSystem = req.user.role === 'system';

    const cached = unreadCountCache.get(userId);
    if (cached !== null) {
      res.set('X-Cache', 'HIT');
      // Telemetry (CS53-23 + CS53-19): emit one structured Pino line per
      // outcome so boot-quiet contract behavior is observable in App
      // Insights via the ContainerAppConsoleLogs_CL bridge (see
      // docs/observability.md § B.12). CS53-19 added `dbTouched` for
      // cross-endpoint matrix consistency — HIT and MISS-NO-ACTIVITY are
      // false (no DB query); MISS and STALE-DROP are true (DB queried).
      logger.info({
        gate: 'boot-quiet',
        route: '/api/notifications/count',
        cacheOutcome: 'HIT',
        dbTouched: false,
        userActivity,
        isSystem,
        userId,
      }, 'unread-count cache outcome');
      return res.json({ unread_count: cached });
    }

    if (!userActivity && !isSystem) {
      // Cache miss + no user-activity marker + not a system caller → MUST NOT
      // touch the DB. Returns the empty default. Writers in this PR only
      // call invalidate() (they do NOT set() a fresh count), so the cache
      // stays empty until a later user-activity (or system) read seeds it
      // from the DB. A brief undercount is acceptable per the documented
      // option (a) cold-cache miss policy.
      res.set('X-Cache', 'MISS-NO-ACTIVITY');
      logger.info({
        gate: 'boot-quiet',
        route: '/api/notifications/count',
        cacheOutcome: 'MISS-NO-ACTIVITY',
        dbTouched: false,
        userActivity,
        isSystem,
        userId,
      }, 'unread-count cache outcome');
      return res.json({ unread_count: 0 });
    }

    // Capture generation BEFORE the DB read so a concurrent writer is detected.
    const token = unreadCountCache.beginRead(userId);
    const db = await getDbAdapter();
    const row = await db.get(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    // Coerce to a safe non-negative integer. MSSQL COUNT(*) can return BigInt
    // or string depending on driver path; res.json() throws on BigInt and
    // HIT vs MISS would otherwise return inconsistent types. Single source of
    // truth lives in unread-count-cache.js to avoid drift.
    const count = coerceUnreadCount(row ? row.count : 0);
    const stored = unreadCountCache.setIfFresh(userId, count, token);
    const outcome = stored ? 'MISS' : 'STALE-DROP';
    res.set('X-Cache', outcome);
    // STALE-DROP signals that the cache rejected this read's value during
    // setIfFresh — either because a concurrent writer bumped the generation
    // OR because the user's gen entry was evicted between beginRead and
    // setIfFresh (Copilot R10). Both outcomes are correctness-preserving
    // and benign individually; we log at warn so a sustained spike (which
    // would indicate either a hot writer collision or eviction churn) is
    // visible in the boot-quiet KQL query. Branch instead of `.bind` to
    // avoid allocating a bound function on every request (Copilot R5).
    const dropReason = stored ? undefined : 'generation-changed-or-evicted';
    if (outcome === 'STALE-DROP') {
      logger.warn({
        gate: 'boot-quiet',
        route: '/api/notifications/count',
        cacheOutcome: outcome,
        dbTouched: true,
        dropReason,
        userActivity,
        isSystem,
        userId,
      }, 'unread-count cache outcome');
    } else {
      logger.info({
        gate: 'boot-quiet',
        route: '/api/notifications/count',
        cacheOutcome: outcome,
        dbTouched: true,
        userActivity,
        isSystem,
        userId,
      }, 'unread-count cache outcome');
    }
    res.json({ unread_count: count });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/notifications/:id/read — mark a single notification as read. */
router.put('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    const notification = await db.get('SELECT id, user_id FROM notifications WHERE id = ?', [id]);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    if (notification.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
    unreadCountCache.invalidate(req.user.id);
    res.json({ id, read: true });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/notifications/read-all — mark all of user's notifications as read.
 *
 * Note: we INVALIDATE the cache rather than `set(req.user.id, 0)`. A naive
 * `set(0)` here would lose a concurrent insert: if `createReviewNotification`
 * fires for this user between our `db.run` and our cache write, its
 * `invalidate()` would be overwritten by our zero, pinning a stale 0 in the
 * cache for the rest of the process lifetime (CS53-23 GPT-5.4 R4 finding).
 * The next user-activity read will recompute from DB and store the truthful
 * value — losing only one cache hit in exchange for correctness.
 */
router.put('/read-all', requireAuth, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const result = await db.run(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    unreadCountCache.invalidate(req.user.id);
    res.json({ updated: result.changes || 0 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
