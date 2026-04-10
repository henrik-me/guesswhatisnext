/**
 * Score routes — submit scores, leaderboard queries.
 */

const express = require('express');
const { getDbAdapter } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { checkAndUnlockAchievements } = require('../achievements');

const router = express.Router();

/** POST /api/scores — submit a game score (requires auth) */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { mode, score, correctCount, totalRounds, bestStreak } = req.body;

    if (!mode || score == null) {
      return res.status(400).json({ error: 'mode and score required' });
    }
    if (!['freeplay', 'daily'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be freeplay or daily' });
    }

    const db = await getDbAdapter();

    // Verify user exists in DB (JWT may reference a deleted/old user)
    const userExists = await db.get('SELECT 1 FROM users WHERE id = ?', [req.user.id]);
    if (!userExists) {
      return res.status(401).json({ error: 'User not found — please log in again' });
    }

    const result = await db.run(
      `INSERT INTO scores (user_id, mode, score, correct_count, total_rounds, best_streak)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, mode, score, correctCount || 0, totalRounds || 0, bestStreak || 0]
    );

    // Check achievements
    const context = {
      score: score || 0,
      correctCount: correctCount || 0,
      totalRounds: totalRounds || 0,
      bestStreak: bestStreak || 0,
      mode,
      isWin: false,
      fastestAnswerMs: req.body.fastestAnswerMs || null,
    };
    const newAchievements = await checkAndUnlockAchievements(req.user.id, context);

    res.status(201).json({ id: result.lastId, newAchievements });
  } catch (err) {
    next(err);
  }
});

/** GET /api/scores/leaderboard?mode=freeplay&period=all|weekly|daily&limit=20 */
router.get('/leaderboard', requireAuth, async (req, res, next) => {
  try {
    const { mode = 'freeplay', period = 'all', limit = 20 } = req.query;
    const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));

    let dateFilter = '';
    if (period === 'daily') {
      dateFilter = "AND date(s.played_at) = date('now')";
    } else if (period === 'weekly') {
      dateFilter = "AND s.played_at >= datetime('now', '-7 days')";
    }

    const db = await getDbAdapter();
    const rows = await db.all(`
      SELECT s.id, s.score, s.correct_count, s.total_rounds, s.best_streak, s.played_at,
             u.id as user_id, u.username
      FROM scores s
      JOIN users u ON s.user_id = u.id
      WHERE s.mode = ? ${dateFilter}
      ORDER BY s.score DESC
      LIMIT ?
    `, [mode, safeLimit]);

    // Add rank and highlight current user
    const leaderboard = rows.map((row, i) => ({
      rank: i + 1,
      username: row.username,
      score: row.score,
      correctCount: row.correct_count,
      totalRounds: row.total_rounds,
      bestStreak: row.best_streak,
      playedAt: row.played_at,
      isCurrentUser: req.user?.id === row.user_id,
    }));

    res.json({ leaderboard, mode, period });
  } catch (err) {
    next(err);
  }
});

/** GET /api/scores/leaderboard/multiplayer?period=all|weekly|daily&limit=20 */
router.get('/leaderboard/multiplayer', requireAuth, async (req, res, next) => {
  try {
    const { period = 'all', limit = 20 } = req.query;
    const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));

    let dateFilter = '';
    if (period === 'daily') {
      dateFilter = "AND date(m.finished_at) = date('now')";
    } else if (period === 'weekly') {
      dateFilter = "AND m.finished_at >= datetime('now', '-7 days')";
    }

    const db = await getDbAdapter();
    // Wins computed in a subquery to avoid SUM(CASE WHEN ... (subquery))
    // which MSSQL rejects (aggregate on expression containing subquery).
    const rows = await db.all(`
      SELECT u.id as user_id, u.username,
             COUNT(DISTINCT mp.match_id) as matches_played,
             SUM(mp.score) as total_score,
             ROUND(AVG(mp.score), 0) as avg_score,
             COALESCE(w.wins, 0) as wins
      FROM match_players mp
      JOIN users u ON mp.user_id = u.id
      JOIN matches m ON mp.match_id = m.id
      LEFT JOIN (
        SELECT mp_w.user_id, COUNT(*) as wins
        FROM match_players mp_w
        JOIN matches m_w ON mp_w.match_id = m_w.id
        WHERE m_w.status = 'finished' ${dateFilter}
          AND mp_w.score = (
            SELECT MAX(mp2.score) FROM match_players mp2 WHERE mp2.match_id = mp_w.match_id
          )
        GROUP BY mp_w.user_id
      ) w ON w.user_id = u.id
      WHERE m.status = 'finished' ${dateFilter}
      GROUP BY u.id, u.username, w.wins
      ORDER BY wins DESC, total_score DESC
      LIMIT ?
    `, [safeLimit]);

    const leaderboard = rows.map((row, i) => ({
      rank: i + 1,
      username: row.username,
      wins: row.wins,
      matchesPlayed: row.matches_played,
      winRate: row.matches_played > 0 ? Math.round((row.wins / row.matches_played) * 100) : 0,
      totalScore: row.total_score,
      avgScore: row.avg_score,
      isCurrentUser: req.user?.id === row.user_id,
    }));

    res.json({ leaderboard, mode: 'multiplayer', period });
  } catch (err) {
    next(err);
  }
});

/** GET /api/scores/me — get current user's scores */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const scores = await db.all(
      `SELECT id, mode, score, correct_count, total_rounds, best_streak, played_at
       FROM scores WHERE user_id = ? ORDER BY played_at DESC LIMIT 50`,
      [req.user.id]
    );

    const stats = await db.all(`
      SELECT mode,
             COUNT(*) as games_played,
             MAX(score) as high_score,
             ROUND(AVG(score), 0) as avg_score,
             MAX(best_streak) as best_streak
      FROM scores WHERE user_id = ?
      GROUP BY mode
    `, [req.user.id]);

    res.json({ scores, stats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
