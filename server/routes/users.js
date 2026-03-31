'use strict';

/**
 * User management routes — admin role management.
 * Only admin/system users can list users or change roles.
 */

const express = require('express');
const { getDb } = require('../db/connection');
const { requireSystem } = require('../middleware/auth');

const router = express.Router();

/** GET /api/users — list all users (admin/system only). */
router.get('/', requireSystem, (_req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, username, role, created_at FROM users ORDER BY id ASC'
  ).all();
  res.json({ users: rows });
});

/** PUT /api/users/:id/role — change a user's role (admin/system only). */
router.put('/:id/role', requireSystem, (req, res) => {
  const { role } = req.body;

  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin or user' });
  }

  const targetId = Number(req.params.id);
  if (Number.isNaN(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  // Prevent demoting yourself
  if (req.user.id === targetId && role !== req.user.role) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }

  const db = getDb();
  const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(targetId);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Prevent modifying the system account
  if (user.role === 'system') {
    return res.status(400).json({ error: 'Cannot modify the system account' });
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);

  res.json({ id: targetId, username: user.username, role, message: `User ${user.username} role updated to ${role}` });
});

module.exports = router;
