/**
 * Achievement routes — list achievements and user unlock status.
 */

const express = require('express');
const { getDbAdapter } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { bootQuietContext, logBootQuiet } = require('../services/boot-quiet');

const router = express.Router();

/** GET /api/achievements — list all achievements with unlock status for current user.
 *
 * Boot-quiet contract (CS53-19): header-less non-system requests get an empty
 * achievements array immediately — no DB query. The SPA refetches with
 * `X-User-Activity: 1` on the first user gesture (e.g. opening the
 * achievements screen).
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const ctx = bootQuietContext(req);
    if (!ctx.allowDb) {
      logBootQuiet('/api/achievements', ctx, false);
      return res.json({ achievements: [] });
    }
    const db = await getDbAdapter();
    const achievements = await db.all(`
      SELECT a.id, a.name, a.description, a.icon, a.category,
             ua.unlocked_at
      FROM achievements a
      LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
      ORDER BY a.category, a.id
    `, [req.user.id]);

    logBootQuiet('/api/achievements', ctx, true);
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
  } catch (err) {
    next(err);
  }
});

/** GET /api/achievements/me — list only unlocked achievements for current user */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const achievements = await db.all(`
      SELECT a.id, a.name, a.description, a.icon, a.category,
             ua.unlocked_at
      FROM achievements a
      INNER JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
      ORDER BY ua.unlocked_at DESC
    `, [req.user.id]);

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
  } catch (err) {
    next(err);
  }
});

module.exports = router;
