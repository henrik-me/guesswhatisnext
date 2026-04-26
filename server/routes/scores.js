/**
 * Score routes — submit scores, leaderboard queries.
 */

const express = require('express');
const { getDbAdapter } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const logger = require('../logger');
const { RESERVED_USERNAME_LIKE_PATTERNS } = require('../reserved-usernames');

/** SQL fragment that excludes reserved-prefix usernames. Joins with `AND` into an existing WHERE. */
const RESERVED_USERNAME_FILTER_SQL = RESERVED_USERNAME_LIKE_PATTERNS
  .map(() => 'u.username NOT LIKE ?')
  .join(' AND ');

const router = express.Router();

// CS52-6 § Public leaderboard. Variants are gameplay modes addressable via
// the LB URL: `freeplay` and `daily` are separate leaderboards because
// their round counts and timing differ — comparing them is meaningless.
const VALID_VARIANTS = new Set(['freeplay', 'daily']);

// CS52-6 § Decision #6: public LBs accept three source filters. Legacy is
// NEVER part of any public LB filter (it's profile-only — the contract for
// pre-CS52 rows that predate the validated/self-reported distinction).
const VALID_LB_SOURCES = new Set(['ranked', 'offline', 'all']);

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
      `INSERT INTO scores (user_id, mode, score, correct_count, total_rounds, best_streak, source)
       VALUES (?, ?, ?, ?, ?, ?, 'offline')`,
      [req.user.id, mode, score, correctCount || 0, totalRounds || 0, bestStreak || 0]
    );

    // CS52-7: Achievement evaluation is intentionally SKIPPED here.
    // Server achievements unlock only from server-validated outcomes:
    //   - POST /api/sessions/:id/finish (ranked, CS52-3)
    //   - WS multiplayer match-end (existing)
    // The legacy POST /api/scores accepts a self-reported score with no
    // server-side validation of timing or correctness, so it must not
    // gate achievement unlocks. See INSTRUCTIONS.md § Achievement gating.
    logger.info(
      {
        event: 'achievement_evaluation_skipped',
        user_id: req.user.id,
        source: 'legacy_scores_post',
        mode,
      },
      'achievement evaluation skipped: legacy POST /api/scores'
    );

    res.status(201).json({ id: result.lastId, newAchievements: [] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/scores/leaderboard?variant=freeplay|daily&source=ranked|offline|all
 *                                                    &period=alltime|weekly|daily&limit=20
 *
 * CS52-6 § API contract sketch § Public leaderboard.
 *  - `variant` is REQUIRED — returns 400 if missing or unrecognized.
 *  - `source` defaults to `ranked` (the competitive view, per Decision #6);
 *    `offline` shows self-reported games; `all` is the union ranked+offline.
 *  - Legacy rows (`source='legacy'`) are NEVER returned here — they live
 *    only on personal endpoints (`/api/scores/me`, profile) per Decision #6.
 *  - Each row carries `source` so the client can render a provenance badge.
 *  - `config` is included on every row for forward-compat with the CS52
 *    contract; in CS52-6 we return `null` (offline configs are user-
 *    customisable and not denormalised onto `scores`; ranked rows do not
 *    yet carry a back-pointer to their `ranked_sessions.config_snapshot`).
 *    A future migration adding `scores.session_id` will populate this
 *    field for ranked rows.
 */
router.get('/leaderboard', optionalAuth, async (req, res, next) => {
  try {
    const { variant, period = 'alltime', limit = 20 } = req.query;
    const source = req.query.source || 'ranked';

    if (!variant || !VALID_VARIANTS.has(variant)) {
      return res.status(400).json({
        error: 'variant query param required',
        allowed: Array.from(VALID_VARIANTS),
      });
    }
    if (!VALID_LB_SOURCES.has(source)) {
      return res.status(400).json({
        error: 'source must be ranked, offline, or all',
        allowed: Array.from(VALID_LB_SOURCES),
      });
    }

    const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));

    let dateFilter = '';
    if (period === 'daily') {
      dateFilter = "AND date(s.played_at) = date('now')";
    } else if (period === 'weekly') {
      dateFilter = "AND s.played_at >= datetime('now', '-7 days')";
    }

    // Source filter — legacy is excluded from every branch. `all` is the
    // server-side union of ranked+offline (the spec also allows clients to
    // compute `all` from the union of the two cached responses; the server
    // honours the explicit query for callers that don't cache).
    let sourceFilter;
    const params = [variant];
    if (source === 'all') {
      sourceFilter = "AND s.source IN ('ranked','offline')";
    } else {
      sourceFilter = 'AND s.source = ?';
      params.push(source);
    }
    params.push(safeLimit);

    const db = await getDbAdapter();
    const rows = await db.all(`
      SELECT s.id, s.score, s.correct_count, s.total_rounds, s.best_streak, s.played_at, s.source,
             u.id as user_id, u.username
      FROM scores s
      JOIN users u ON s.user_id = u.id
      WHERE s.mode = ? ${sourceFilter} AND ${RESERVED_USERNAME_FILTER_SQL} ${dateFilter}
      ORDER BY s.score DESC
      LIMIT ?
    `, [...params.slice(0, -1), ...RESERVED_USERNAME_LIKE_PATTERNS, params[params.length - 1]]);

    const updatedAt = new Date().toISOString();
    const leaderboard = rows.map((row, i) => ({
      rank: i + 1,
      // CS52-6 § API contract: each row carries `user` (canonical) plus
      // `username` (legacy alias) so existing UI code keeps working while
      // new clients can use the locked-down contract.
      user: row.username,
      username: row.username,
      score: row.score,
      correctCount: row.correct_count,
      totalRounds: row.total_rounds,
      bestStreak: row.best_streak,
      playedAt: row.played_at,
      source: row.source,
      // See block-comment above re: `config` provenance in CS52-6.
      config: null,
      isCurrentUser: req.user?.id === row.user_id,
    }));

    logger.info({
      event: 'lb_request',
      variant,
      source,
      period,
      row_count: leaderboard.length,
      user_id: req.user?.id || null,
    }, 'GET /api/scores/leaderboard');

    res.json({
      // `rows` is the canonical CS52-6 contract field; `leaderboard` is
      // kept as an alias so existing UI code (CS52-pre) keeps working.
      rows: leaderboard,
      leaderboard,
      mode: variant,
      variant,
      period,
      source,
      cursor: updatedAt,
      updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/scores/leaderboard/multiplayer?source=ranked|offline|all&period=...
 *
 * CS52-6: source defaults to `ranked`. Multiplayer matches are always
 * server-validated (no offline path), so `offline` returns an empty list
 * and `ranked`/`all` return the existing aggregated rows. Each row carries
 * `source: 'ranked'` so the provenance UI is consistent across LBs.
 */
router.get('/leaderboard/multiplayer', optionalAuth, async (req, res, next) => {
  try {
    const { period = 'alltime', limit = 20 } = req.query;
    const source = req.query.source || 'ranked';
    if (!VALID_LB_SOURCES.has(source)) {
      return res.status(400).json({
        error: 'source must be ranked, offline, or all',
        allowed: Array.from(VALID_LB_SOURCES),
      });
    }

    const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));

    // Multiplayer has no offline path — short-circuit to an empty list.
    if (source === 'offline') {
      const updatedAt = new Date().toISOString();
      logger.info({
        event: 'lb_request',
        variant: 'multiplayer',
        source,
        period,
        row_count: 0,
        user_id: req.user?.id || null,
      }, 'GET /api/scores/leaderboard/multiplayer (offline → empty)');
      return res.json({
        rows: [],
        leaderboard: [],
        mode: 'multiplayer',
        period,
        source,
        cursor: updatedAt,
        updatedAt,
      });
    }

    let dateFilter = '';
    let dateFilterW = '';
    if (period === 'daily') {
      dateFilter = "AND date(m.finished_at) = date('now')";
      dateFilterW = "AND date(m_w.finished_at) = date('now')";
    } else if (period === 'weekly') {
      dateFilter = "AND m.finished_at >= datetime('now', '-7 days')";
      dateFilterW = "AND m_w.finished_at >= datetime('now', '-7 days')";
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
        WHERE m_w.status = 'finished' ${dateFilterW}
          AND mp_w.score = (
            SELECT MAX(mp2.score) FROM match_players mp2 WHERE mp2.match_id = mp_w.match_id
          )
        GROUP BY mp_w.user_id
      ) w ON w.user_id = u.id
      WHERE m.status = 'finished' AND ${RESERVED_USERNAME_FILTER_SQL} ${dateFilter}
      GROUP BY u.id, u.username, w.wins
      ORDER BY wins DESC, total_score DESC
      LIMIT ?
    `, [...RESERVED_USERNAME_LIKE_PATTERNS, safeLimit]);

    const updatedAt = new Date().toISOString();
    const leaderboard = rows.map((row, i) => ({
      rank: i + 1,
      // CS52-6 § API contract: `user` is the canonical field; `username`
      // is kept as an alias for legacy clients.
      user: row.username,
      username: row.username,
      wins: row.wins,
      matchesPlayed: row.matches_played,
      winRate: row.matches_played > 0 ? Math.round((row.wins / row.matches_played) * 100) : 0,
      totalScore: row.total_score,
      avgScore: row.avg_score,
      // CS52-6: multiplayer rows are always server-validated.
      source: 'ranked',
      config: null,
      isCurrentUser: req.user?.id === row.user_id,
    }));

    logger.info({
      event: 'lb_request',
      variant: 'multiplayer',
      source,
      period,
      row_count: leaderboard.length,
      user_id: req.user?.id || null,
    }, 'GET /api/scores/leaderboard/multiplayer');

    res.json({
      rows: leaderboard,
      leaderboard,
      mode: 'multiplayer',
      period,
      source,
      cursor: updatedAt,
      updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/scores/me — get current user's scores */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    // CS52-6 § Decision #6: profile shows ALL rows including legacy; the
    // `source` column drives the per-row provenance badge in the UI
    // (Ranked / Offline / Legacy).
    const scores = await db.all(
      `SELECT id, mode, score, correct_count, total_rounds, best_streak, played_at, source
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

    // Multiplayer stats from match_players (scores table only has freeplay)
    const mpStats = await db.get(`
      SELECT COUNT(*) as games_played,
             MAX(mp.score) as high_score,
             ROUND(AVG(mp.score), 0) as avg_score,
             0 as best_streak
      FROM match_players mp
      JOIN matches m ON mp.match_id = m.id
      WHERE mp.user_id = ? AND m.status = 'finished'
    `, [req.user.id]);

    if (mpStats && mpStats.games_played > 0) {
      stats.push({
        mode: 'multiplayer',
        games_played: mpStats.games_played,
        high_score: mpStats.high_score,
        avg_score: mpStats.avg_score,
        best_streak: mpStats.best_streak,
      });
    }

    res.json({ scores, stats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
