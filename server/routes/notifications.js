'use strict';

/**
 * Notification routes — in-app notifications for users.
 * Users can view, mark-read, and bulk-mark-read their notifications.
 */

const express = require('express');
const { getDbAdapter } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { unreadCountCache, coerceUnreadCount } = require('../services/unread-count-cache');
const logger = require('../logger');

const router = express.Router();

/** GET /api/notifications — list user's notifications. */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const userId = req.user.id;
    const unreadOnly = req.query.unread === 'true' || req.query.unread === '1';
    const userActivity = req.get('X-User-Activity') === '1';

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

    // Capture cache generation BEFORE any DB work for this request (list + count)
    // so we can race-safely seed the cache from this request's authoritative count.
    const token = unreadCountCache.beginRead(userId);
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
    if (userActivity || req.user.role === 'system') {
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
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/notifications/count — unread count for badge.
 *
 * Boot-quiet contract (CS53-23): the DB is touched ONLY when the request
 * carries `X-User-Activity: 1` AND the cache misses. Boot/focus/poller traffic
 * (no header) gets the cached value or `{ unread_count: 0 }` — never a DB query.
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
      // Telemetry (CS53-23): emit one structured Pino line per outcome so
      // boot-quiet contract behavior is observable in App Insights via the
      // ContainerAppConsoleLogs_CL bridge (see docs/observability.md § B.7).
      logger.info({
        gate: 'boot-quiet',
        route: '/api/notifications/count',
        cacheOutcome: 'HIT',
        userActivity,
        isSystem,
        userId,
      }, 'unread-count cache outcome');
      return res.json({ unread_count: cached });
    }

    if (!userActivity && !isSystem) {
      // Cache miss + no user-activity marker + not a system caller → MUST NOT
      // touch the DB. Returns the empty default; any in-flight writer will
      // seed the cache.
      res.set('X-Cache', 'MISS-NO-ACTIVITY');
      logger.info({
        gate: 'boot-quiet',
        route: '/api/notifications/count',
        cacheOutcome: 'MISS-NO-ACTIVITY',
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
    // STALE-DROP signals a real concurrent-writer race (correctness preserved
    // but worth surfacing if it spikes); use warn so it stands out in queries.
    const logFn = outcome === 'STALE-DROP' ? logger.warn.bind(logger) : logger.info.bind(logger);
    logFn({
      gate: 'boot-quiet',
      route: '/api/notifications/count',
      cacheOutcome: outcome,
      userActivity,
      isSystem,
      userId,
    }, 'unread-count cache outcome');
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
