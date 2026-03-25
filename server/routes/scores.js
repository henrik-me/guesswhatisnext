/**
 * Score routes — submit scores, leaderboard queries.
 */

const express = require('express');
const { getDb } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** POST /api/scores — submit a game score (requires auth) */
router.post('/', requireAuth, (req, res) => {
  const { mode, score, correctCount, totalRounds, bestStreak } = req.body;

  if (!mode || score == null) {
    return res.status(400).json({ error: 'mode and score required' });
  }
  if (!['freeplay', 'daily'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be freeplay or daily' });
  }

  const db = getDb();
  const result = db.prepare(
    `INSERT INTO scores (user_id, mode, score, correct_count, total_rounds, best_streak)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(req.user.id, mode, score, correctCount || 0, totalRounds || 0, bestStreak || 0);

  res.status(201).json({ id: result.lastInsertRowid });
});

/** GET /api/scores/leaderboard?mode=freeplay&period=all|weekly|daily&limit=20 */
router.get('/leaderboard', requireAuth, (req, res) => {
  const { mode = 'freeplay', period = 'all', limit = 20 } = req.query;

  let dateFilter = '';
  if (period === 'daily') {
    dateFilter = "AND date(s.played_at) = date('now')";
  } else if (period === 'weekly') {
    dateFilter = "AND s.played_at >= datetime('now', '-7 days')";
  }

  const db = getDb();
  const rows = db.prepare(`
    SELECT s.id, s.score, s.correct_count, s.total_rounds, s.best_streak, s.played_at,
           u.id as user_id, u.username
    FROM scores s
    JOIN users u ON s.user_id = u.id
    WHERE s.mode = ? ${dateFilter}
    ORDER BY s.score DESC
    LIMIT ?
  `).all(mode, Math.min(Number(limit), 100));

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
});

/** GET /api/scores/me — get current user's scores */
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const scores = db.prepare(
    `SELECT id, mode, score, correct_count, total_rounds, best_streak, played_at
     FROM scores WHERE user_id = ? ORDER BY played_at DESC LIMIT 50`
  ).all(req.user.id);

  const stats = db.prepare(`
    SELECT mode,
           COUNT(*) as games_played,
           MAX(score) as high_score,
           ROUND(AVG(score), 0) as avg_score,
           MAX(best_streak) as best_streak
    FROM scores WHERE user_id = ?
    GROUP BY mode
  `).all(req.user.id);

  res.json({ scores, stats });
});

module.exports = router;
