'use strict';

/**
 * Notification routes — in-app notifications for users.
 * Users can view, mark-read, and bulk-mark-read their notifications.
 */

const express = require('express');
const { getDbAdapter } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** GET /api/notifications — list user's notifications. */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const userId = req.user.id;
    const unreadOnly = req.query.unread === 'true' || req.query.unread === '1';

    let query = 'SELECT id, user_id, type, message, data, read, created_at FROM notifications WHERE user_id = ?';
    const params = [userId];

    if (unreadOnly) {
      query += ' AND read = 0';
    }

    query += ' ORDER BY created_at DESC LIMIT 50';

    const notifications = await db.all(query, params);

    const countRow = await db.get(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read = 0',
      [userId]
    );

    res.json({
      notifications: notifications.map(n => ({
        ...n,
        read: !!n.read,
        data: n.data ? JSON.parse(n.data) : null,
      })),
      unread_count: countRow ? countRow.count : 0,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/notifications/count — lightweight unread count for badge polling. */
router.get('/count', requireAuth, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const row = await db.get(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read = 0',
      [req.user.id]
    );
    res.json({ unread_count: row ? row.count : 0 });
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

    await db.run('UPDATE notifications SET read = 1 WHERE id = ?', [id]);
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
      'UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0',
      [req.user.id]
    );
    res.json({ updated: result.changes || 0 });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
