'use strict';

/**
 * Notification routes — in-app notifications for users.
 * Users can view, mark-read, and bulk-mark-read their notifications.
 */

const express = require('express');
const { getDbAdapter } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { unreadCountCache } = require('../services/unread-count-cache');

const router = express.Router();

/** GET /api/notifications — list user's notifications. */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const userId = req.user.id;
    const unreadOnly = req.query.unread === 'true' || req.query.unread === '1';

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

    const notifications = await db.all(query, params);

    const countRow = await db.get(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );

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
      unread_count: countRow ? countRow.count : 0,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/notifications/count — unread count for badge.
 *
 * Cache-first to prevent stale-tab polling from waking the DB.
 * Cache misses recompute from DB; invalidations happen on insert/mark-read.
 */
router.get('/count', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const cached = unreadCountCache.get(userId);
    if (cached !== null) {
      res.set('X-Cache', 'HIT');
      return res.json({ unread_count: cached });
    }
    // Capture generation BEFORE the DB read so a concurrent writer is detected.
    const token = unreadCountCache.beginRead(userId);
    const db = await getDbAdapter();
    const row = await db.get(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    const count = row ? row.count : 0;
    const stored = unreadCountCache.setIfFresh(userId, count, token);
    res.set('X-Cache', stored ? 'MISS' : 'STALE-DROP');
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

/** PUT /api/notifications/read-all — mark all of user's notifications as read. */
router.put('/read-all', requireAuth, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const result = await db.run(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    unreadCountCache.set(req.user.id, 0);
    res.json({ updated: result.changes || 0 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
