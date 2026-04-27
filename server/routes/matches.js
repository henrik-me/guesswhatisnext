/**
 * Match routes — create/join rooms, match status.
 */

const express = require('express');
const crypto = require('crypto');
const { getDbAdapter } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getConfig } = require('../services/gameConfigLoader');
const logger = require('../logger');
const { RESERVED_USERNAME_LIKE_PATTERNS } = require('../reserved-usernames');
const { bootQuietContext, logBootQuiet } = require('../services/boot-quiet');

/** SQL fragment: `<alias>.username NOT LIKE ?` joined with AND for every reserved prefix. */
function reservedUsernameFilter(alias) {
  return RESERVED_USERNAME_LIKE_PATTERNS
    .map(() => `${alias}.username NOT LIKE ?`)
    .join(' AND ');
}

const router = express.Router();

/** Generate a 6-character room code. */
function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/**
 * POST /api/matches — create a new match room.
 *
 * CS52-7b § Decision #8: `total_rounds` / `round_timer_ms` /
 * `inter_round_delay_ms` are NOT client-configurable. Any such fields in the
 * request body are ignored; the canonical multiplayer shape is sourced from
 * the `game_configs` table via `getConfig('multiplayer')` (CS52-7c loader),
 * with a code-level fallback in `gameConfigDefaults.js`.
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { maxPlayers = 2 } = req.body;
    const db = await getDbAdapter();

    // Validate maxPlayers
    const mp = Number(maxPlayers);
    if (!Number.isInteger(mp) || mp < 2 || mp > 10) {
      return res.status(400).json({ error: 'maxPlayers must be between 2 and 10' });
    }

    // Verify user exists in DB (JWT may reference a deleted/old user)
    const userExists = await db.get('SELECT 1 FROM users WHERE id = ?', [req.user.id]);
    if (!userExists) {
      return res.status(401).json({ error: 'User not found — please log in again' });
    }

    // CS52-7b: server-authoritative config. Ignore any client-supplied
    // totalRounds / round_timer_ms / inter_round_delay_ms.
    const mpConfig = await getConfig('multiplayer');
    const totalRounds = mpConfig.rounds;

    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'totalRounds')
        && Number(req.body.totalRounds) !== totalRounds) {
      logger.info(
        { userId: req.user.id, attemptedTotalRounds: req.body.totalRounds, configRounds: totalRounds },
        'multiplayer client totalRounds override ignored'
      );
    }

    const id = crypto.randomUUID();
    let roomCode = generateRoomCode();

    // Ensure unique room code
    while (await db.get('SELECT 1 FROM matches WHERE room_code = ?', [roomCode])) {
      roomCode = generateRoomCode();
    }

    await db.run(
      `INSERT INTO matches (id, room_code, status, total_rounds, max_players, created_by, host_user_id) VALUES (?, ?, 'waiting', ?, ?, ?, ?)`,
      [id, roomCode, totalRounds, mp, req.user.id, req.user.id]
    );

    await db.run(
      `INSERT INTO match_players (match_id, user_id) VALUES (?, ?)`,
      [id, req.user.id]
    );

    res.status(201).json({ matchId: id, roomCode, totalRounds, maxPlayers: mp });
  } catch (err) {
    next(err);
  }
});

/** POST /api/matches/join — join a match by room code */
router.post('/join', requireAuth, async (req, res, next) => {
  try {
    const { roomCode } = req.body;

    if (!roomCode) {
      return res.status(400).json({ error: 'Room code required' });
    }

    const db = await getDbAdapter();
    const match = await db.get(
      `SELECT id, status, total_rounds, max_players FROM matches WHERE room_code = ?`,
      [roomCode.toUpperCase()]
    );

    if (!match) {
      return res.status(404).json({ error: 'Room not found' });
    }
    if (match.status === 'active') {
      return res.json({ matchId: match.id, roomCode: roomCode.toUpperCase(), status: 'spectator' });
    }
    if (match.status !== 'waiting') {
      return res.status(400).json({ error: 'Match is no longer available' });
    }

    // Check room capacity
    const playerCount = await db.get('SELECT COUNT(*) as count FROM match_players WHERE match_id = ?', [match.id]);
    const maxPlayers = match.max_players || 2;
    if (playerCount.count >= maxPlayers) {
      return res.status(400).json({ error: 'Room is full' });
    }

    // Check not already joined
    const existing = await db.get(
      `SELECT 1 FROM match_players WHERE match_id = ? AND user_id = ?`,
      [match.id, req.user.id]
    );

    if (existing) {
      return res.json({ matchId: match.id, roomCode, status: 'already_joined' });
    }

    await db.run(
      `INSERT INTO match_players (match_id, user_id) VALUES (?, ?)`,
      [match.id, req.user.id]
    );

    res.json({ matchId: match.id, roomCode, totalRounds: match.total_rounds });
  } catch (err) {
    next(err);
  }
});

/** GET /api/matches/history — get match history for the current user.
 *
 * Boot-quiet contract (CS53-19): header-less non-system requests get an
 * empty history array — no DB query.
 */
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const ctx = bootQuietContext(req);
    if (!ctx.allowDb) {
      logBootQuiet('/api/matches/history', ctx, false, undefined, res);
      return res.json({ history: [] });
    }
    const db = await getDbAdapter();
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const rows = await db.all(`
      SELECT m.id, m.room_code, m.status, m.total_rounds, m.created_at, m.finished_at,
             mp.score AS my_score,
             opp.score AS opp_score,
             opp_u.username AS opponent
      FROM match_players mp
      JOIN matches m ON mp.match_id = m.id
      LEFT JOIN match_players opp ON opp.match_id = m.id AND opp.user_id != mp.user_id
      LEFT JOIN users opp_u ON opp.user_id = opp_u.id
      WHERE mp.user_id = ? AND m.status = 'finished'
        AND (opp_u.username IS NULL OR (${reservedUsernameFilter('opp_u')}))
      ORDER BY m.finished_at DESC
      LIMIT ?
    `, [req.user.id, ...RESERVED_USERNAME_LIKE_PATTERNS, limit]);

    const history = rows.map(row => {
      let result = 'loss';
      if (row.my_score > (row.opp_score || 0)) result = 'win';
      else if (row.my_score === (row.opp_score || 0)) result = 'tie';

      return {
        matchId: row.id,
        opponent: row.opponent || 'Unknown',
        myScore: row.my_score,
        oppScore: row.opp_score || 0,
        result,
        totalRounds: row.total_rounds,
        date: row.finished_at || row.created_at,
      };
    });

    // logBootQuiet sets X-Boot-Quiet-* response headers — call BEFORE res.json().
    logBootQuiet('/api/matches/history', ctx, true, undefined, res);
    res.json({ history });
  } catch (err) {
    next(err);
  }
});

/** GET /api/matches/:id — get match status */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const match = await db.get(
      `SELECT id, room_code, status, total_rounds, created_at, finished_at FROM matches WHERE id = ?`,
      [req.params.id]
    );

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const players = await db.all(
      `SELECT u.id, u.username, mp.score, mp.finished_at
       FROM match_players mp JOIN users u ON mp.user_id = u.id
       WHERE mp.match_id = ? AND ${reservedUsernameFilter('u')}`,
      [match.id, ...RESERVED_USERNAME_LIKE_PATTERNS]
    );

    res.json({ ...match, players });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
