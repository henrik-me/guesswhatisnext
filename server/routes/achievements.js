/**
 * Achievement routes — list achievements and user unlock status.
 */

const express = require('express');
const { getDb } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** GET /api/achievements — list all achievements with unlock status for current user */
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const achievements = db.prepare(`
    SELECT a.id, a.name, a.description, a.icon, a.category,
           ua.unlocked_at
    FROM achievements a
    LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
    ORDER BY a.category, a.id
  `).all(req.user.id);

  res.json({
    achievements: achievements.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      category: a.category,
      unlocked: !!a.unlocked_at,
      unlockedAt: a.unlocked_at || null,
    })),
  });
});

/** GET /api/achievements/me — list only unlocked achievements for current user */
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const achievements = db.prepare(`
    SELECT a.id, a.name, a.description, a.icon, a.category,
           ua.unlocked_at
    FROM achievements a
    INNER JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
    ORDER BY ua.unlocked_at DESC
  `).all(req.user.id);

  res.json({
    achievements: achievements.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      category: a.category,
      unlockedAt: a.unlocked_at,
    })),
  });
});

module.exports = router;
