/**
 * Match routes — create/join rooms, match status.
 */

const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/** Generate a 6-character room code. */
function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/** POST /api/matches — create a new match room */
router.post('/', requireAuth, (req, res) => {
  const { totalRounds = 5, maxPlayers = 2 } = req.body;
  const db = getDb();

  // Validate maxPlayers
  const mp = Number(maxPlayers);
  if (!Number.isInteger(mp) || mp < 2 || mp > 10) {
    return res.status(400).json({ error: 'maxPlayers must be between 2 and 10' });
  }

  // Verify user exists in DB (JWT may reference a deleted/old user)
  const userExists = db.prepare('SELECT 1 FROM users WHERE id = ?').get(req.user.id);
  if (!userExists) {
    return res.status(401).json({ error: 'User not found — please log in again' });
  }

  const id = crypto.randomUUID();
  let roomCode = generateRoomCode();

  // Ensure unique room code
  while (db.prepare('SELECT 1 FROM matches WHERE room_code = ?').get(roomCode)) {
    roomCode = generateRoomCode();
  }

  db.prepare(
    `INSERT INTO matches (id, room_code, status, total_rounds, max_players, created_by, host_user_id) VALUES (?, ?, 'waiting', ?, ?, ?, ?)`
  ).run(id, roomCode, totalRounds, mp, req.user.id, req.user.id);

  db.prepare(
    `INSERT INTO match_players (match_id, user_id) VALUES (?, ?)`
  ).run(id, req.user.id);

  res.status(201).json({ matchId: id, roomCode, totalRounds, maxPlayers: mp });
});

/** POST /api/matches/join — join a match by room code */
router.post('/join', requireAuth, (req, res) => {
  const { roomCode } = req.body;

  if (!roomCode) {
    return res.status(400).json({ error: 'Room code required' });
  }

  const db = getDb();
  const match = db.prepare(
    `SELECT id, status, total_rounds, max_players FROM matches WHERE room_code = ?`
  ).get(roomCode.toUpperCase());

  if (!match) {
    return res.status(404).json({ error: 'Room not found' });
  }
  if (match.status === 'active' || match.status === 'finished') {
    return res.json({ matchId: match.id, roomCode: roomCode.toUpperCase(), status: 'spectator' });
  }
  if (match.status !== 'waiting') {
    return res.status(400).json({ error: 'Match is no longer available' });
  }

  // Check room capacity
  const playerCount = db.prepare('SELECT COUNT(*) as count FROM match_players WHERE match_id = ?').get(match.id);
  const maxPlayers = match.max_players || 2;
  if (playerCount.count >= maxPlayers) {
    return res.status(400).json({ error: 'Room is full' });
  }

  // Check not already joined
  const existing = db.prepare(
    `SELECT 1 FROM match_players WHERE match_id = ? AND user_id = ?`
  ).get(match.id, req.user.id);

  if (existing) {
    return res.json({ matchId: match.id, roomCode, status: 'already_joined' });
  }

  db.prepare(
    `INSERT INTO match_players (match_id, user_id) VALUES (?, ?)`
  ).run(match.id, req.user.id);

  res.json({ matchId: match.id, roomCode, totalRounds: match.total_rounds });
});

/** GET /api/matches/history — get match history for the current user */
router.get('/history', requireAuth, (req, res) => {
  const db = getDb();
  const limit = Math.min(Number(req.query.limit) || 20, 50);

  const rows = db.prepare(`
    SELECT m.id, m.room_code, m.status, m.total_rounds, m.created_at, m.finished_at,
           mp.score AS my_score,
           opp.score AS opp_score,
           opp_u.username AS opponent
    FROM match_players mp
    JOIN matches m ON mp.match_id = m.id
    LEFT JOIN match_players opp ON opp.match_id = m.id AND opp.user_id != mp.user_id
    LEFT JOIN users opp_u ON opp.user_id = opp_u.id
    WHERE mp.user_id = ? AND m.status = 'finished'
    ORDER BY m.finished_at DESC
    LIMIT ?
  `).all(req.user.id, limit);

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

  res.json({ history });
});

/** GET /api/matches/:id — get match status */
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const match = db.prepare(
    `SELECT id, room_code, status, total_rounds, created_at, finished_at FROM matches WHERE id = ?`
  ).get(req.params.id);

  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const players = db.prepare(
    `SELECT u.id, u.username, mp.score, mp.finished_at
     FROM match_players mp JOIN users u ON mp.user_id = u.id
     WHERE mp.match_id = ?`
  ).all(match.id);

  res.json({ ...match, players });
});

module.exports = router;
