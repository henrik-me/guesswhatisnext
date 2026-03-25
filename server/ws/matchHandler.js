/**
 * WebSocket handler for real-time multiplayer matches.
 * Manages rooms, puzzle sync, round scoring, reconnection, and rematch.
 */

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const { getDb } = require('../db/connection');
const puzzlePool = require('../puzzleData');

/** Active rooms: Map<roomCode, RoomState> */
const rooms = new Map();

/** Disconnected players awaiting reconnection: Map<`${userId}:${roomCode}`, DisconnectInfo> */
const disconnected = new Map();

/** Rematch requests: Map<roomCode, Set<userId>> */
const rematchRequests = new Map();

/** Maps a finished roomCode to the pair of userIds+usernames for rematch */
const finishedPairs = new Map();

const ROUND_TIMEOUT_MS = 20000;
const ROOM_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const NEXT_ROUND_DELAY_MS = 3000;
const RECONNECT_WINDOW_MS = 30000;

/** Select `count` random puzzles from the pool (Fisher-Yates shuffle on a copy). */
function selectRandomPuzzles(count) {
  const pool = [...puzzlePool];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(count, pool.length));
}

/** Calculate score for an answer. */
function calculateScore(correct, timeMs) {
  if (!correct) return 0;
  const base = 100;
  const speedBonus = Math.max(0, 100 * (1 - timeMs / 15000));
  return Math.round(base + speedBonus);
}

/** Initialize WebSocket server on the existing HTTP server. */
function initWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Authenticate via query param token
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    let user = null;
    try {
      user = jwt.verify(token, JWT_SECRET);
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    ws.user = user;
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        handleMessage(ws, msg);
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      handleDisconnect(ws);
    });

    ws.send(JSON.stringify({ type: 'connected', user: { id: user.id, username: user.username } }));
  });

  // Heartbeat to detect stale connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  // Periodically clean up idle waiting rooms
  const roomCleanup = setInterval(() => {
    const now = Date.now();
    rooms.forEach((room, code) => {
      if (!room.started && room.createdAt && now - room.createdAt > ROOM_IDLE_TIMEOUT_MS) {
        broadcastToRoom(code, { type: 'error', message: 'Room timed out waiting for players' });
        cleanupRoom(code);
      }
    });
  }, 60000);

  wss.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(roomCleanup);
  });

  console.log('🔌 WebSocket server ready on /ws');
  return wss;
}

/** Handle incoming WebSocket messages. */
function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'join':
      handleJoin(ws, msg.roomCode);
      break;
    case 'answer':
      handleAnswer(ws, msg);
      break;
    case 'rematch-request':
      handleRematchRequest(ws);
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
  }
}

/** Handle a player joining a room (or reconnecting). */
function handleJoin(ws, roomCode) {
  if (!roomCode) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room code required' }));
    return;
  }

  const code = roomCode.toUpperCase();
  ws.roomCode = code;

  // Check if this is a reconnection to an active match
  const dcKey = `${ws.user.id}:${code}`;
  const dcInfo = disconnected.get(dcKey);
  if (dcInfo && rooms.has(code)) {
    const room = rooms.get(code);
    if (room.started) {
      // Clear the forfeit timer
      if (dcInfo.forfeitTimer) clearTimeout(dcInfo.forfeitTimer);
      disconnected.delete(dcKey);

      // Restore player in room
      room.players.set(ws.user.id, ws);

      // Send reconnect state to the rejoining player
      ws.send(JSON.stringify({
        type: 'reconnected',
        roomCode: code,
        scores: buildScoresSnapshot(room),
        currentRound: room.round,
        totalRounds: room.totalRounds,
        myScore: room.scores[ws.user.id] || 0,
      }));

      // Notify the other player
      broadcastToRoom(code, {
        type: 'opponent-reconnected',
        username: ws.user.username,
      }, ws.user.id);

      return;
    }
  }

  if (!rooms.has(code)) {
    rooms.set(code, {
      players: new Map(),
      round: 0,
      totalRounds: 5,
      scores: {},
      started: false,
      puzzles: [],
      answers: {},
      roundTimer: null,
      createdAt: Date.now(),
    });
  }

  const room = rooms.get(code);

  if (room.started) {
    ws.send(JSON.stringify({ type: 'error', message: 'Match already in progress' }));
    return;
  }

  room.players.set(ws.user.id, ws);
  room.scores[ws.user.id] = room.scores[ws.user.id] || 0;

  // Notify the joining player
  ws.send(JSON.stringify({
    type: 'joined',
    roomCode: code,
    playerCount: room.players.size,
  }));

  // Notify other players
  broadcastToRoom(code, {
    type: 'player-joined',
    username: ws.user.username,
    playerCount: room.players.size,
  }, ws.user.id);

  // Auto-start when 2 players have joined
  if (room.players.size === 2 && !room.started) {
    startMatch(code);
  }
}

/** Start a match: select puzzles and send the first round. */
function startMatch(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  room.started = true;
  room.puzzles = selectRandomPuzzles(room.totalRounds);

  // Build player name list
  const playerNames = [];
  room.players.forEach((ws) => playerNames.push(ws.user.username));

  // Update match status in DB
  try {
    const db = getDb();
    db.prepare(`UPDATE matches SET status = 'active' WHERE room_code = ?`).run(roomCode);
  } catch {
    // Non-fatal: match can proceed without DB update
  }

  broadcastToRoom(roomCode, {
    type: 'match-start',
    players: playerNames,
    totalRounds: room.totalRounds,
  });

  // Start the first round after a brief delay
  setTimeout(() => sendRound(roomCode), 1000);
}

/** Send the current round's puzzle to all players. */
function sendRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.round >= room.totalRounds) return;

  const roundNum = room.round;
  const puzzle = room.puzzles[roundNum];

  room.answers[roundNum] = {};

  // Record round in DB
  try {
    const db = getDb();
    const match = db.prepare(`SELECT id FROM matches WHERE room_code = ?`).get(roomCode);
    if (match) {
      db.prepare(
        `INSERT OR IGNORE INTO match_rounds (match_id, round_num, puzzle_id) VALUES (?, ?, ?)`
      ).run(match.id, roundNum + 1, puzzle.id);
    }
  } catch {
    // Non-fatal
  }

  // Send puzzle WITHOUT the answer
  broadcastToRoom(roomCode, {
    type: 'round',
    roundNum,
    puzzle: {
      sequence: puzzle.sequence,
      options: puzzle.options,
      type: puzzle.type,
    },
    totalRounds: room.totalRounds,
  });

  room.roundStartedAt = Date.now();

  // Set timeout for players who don't answer
  room.roundTimer = setTimeout(() => {
    resolveRound(roomCode);
  }, ROUND_TIMEOUT_MS);
}

/** Handle a player's answer. */
function handleAnswer(ws, msg) {
  const room = rooms.get(ws.roomCode);
  if (!room || !room.started) {
    ws.send(JSON.stringify({ type: 'error', message: 'No active match' }));
    return;
  }

  const roundNum = room.round;
  const roundAnswers = room.answers[roundNum];
  if (!roundAnswers) return;

  // Ignore duplicate answers
  if (roundAnswers[ws.user.id]) return;

  roundAnswers[ws.user.id] = {
    answerId: msg.answerId,
    timeMs: typeof msg.timeMs === 'number' ? msg.timeMs : ROUND_TIMEOUT_MS,
    userId: ws.user.id,
    username: ws.user.username,
  };

  ws.send(JSON.stringify({ type: 'answer-received', answerId: msg.answerId }));

  // Check if both players have answered
  if (Object.keys(roundAnswers).length >= room.players.size) {
    clearTimeout(room.roundTimer);
    resolveRound(ws.roomCode);
  }
}

/** Resolve the current round: score answers and broadcast results. */
function resolveRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const roundNum = room.round;
  const puzzle = room.puzzles[roundNum];
  const roundAnswers = room.answers[roundNum] || {};

  // Clear timeout if still pending
  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  // Build scores for this round
  const scores = {};
  room.players.forEach((ws, userId) => {
    const answer = roundAnswers[userId];
    const correct = answer ? answer.answerId === puzzle.answer : false;
    const timeMs = answer ? answer.timeMs : ROUND_TIMEOUT_MS;
    const points = calculateScore(correct, timeMs);

    room.scores[userId] = (room.scores[userId] || 0) + points;

    const username = ws.user.username;
    scores[username] = {
      correct,
      points,
      total: room.scores[userId],
    };
  });

  broadcastToRoom(roomCode, {
    type: 'roundResult',
    roundNum,
    correctAnswer: puzzle.answer,
    scores,
  });

  room.round++;

  // Check if match is over
  if (room.round >= room.totalRounds) {
    setTimeout(() => endMatch(roomCode), NEXT_ROUND_DELAY_MS);
  } else {
    setTimeout(() => sendRound(roomCode), NEXT_ROUND_DELAY_MS);
  }
}

/** End the match: determine winner, persist to DB, broadcast results, keep room for rematch. */
function endMatch(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // Build final scores keyed by username
  const finalScores = {};
  const userScores = [];
  room.players.forEach((ws, userId) => {
    const total = room.scores[userId] || 0;
    finalScores[ws.user.username] = total;
    userScores.push({ userId, username: ws.user.username, total });
  });

  // Determine winner
  userScores.sort((a, b) => b.total - a.total);
  const winner = userScores[0].total === userScores[1].total
    ? null
    : userScores[0].username;

  broadcastToRoom(roomCode, {
    type: 'gameOver',
    winner,
    scores: finalScores,
    results: userScores.map(({ username, total }) => ({ username, score: total })),
  });

  // Persist to database
  try {
    const db = getDb();
    const match = db.prepare(`SELECT id FROM matches WHERE room_code = ?`).get(roomCode);
    if (match) {
      db.prepare(
        `UPDATE matches SET status = 'finished', finished_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(match.id);

      const updatePlayer = db.prepare(
        `UPDATE match_players SET score = ?, finished_at = CURRENT_TIMESTAMP WHERE match_id = ? AND user_id = ?`
      );
      for (const { userId, total } of userScores) {
        updatePlayer.run(total, match.id, userId);
      }
    }
  } catch {
    // Non-fatal
  }

  // Store player pair for potential rematch
  finishedPairs.set(roomCode, userScores.map(({ userId, username }) => ({ userId, username })));

  // Mark match as finished but keep room alive for rematch for 60s
  room.started = false;
  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  setTimeout(() => {
    // If no rematch happened, clean up
    if (rooms.has(roomCode) && !rooms.get(roomCode).started) {
      cleanupRoom(roomCode);
      rematchRequests.delete(roomCode);
      finishedPairs.delete(roomCode);
    }
  }, 60000);
}

/** Remove a room and clear any timers. */
function cleanupRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  if (room.roundTimer) clearTimeout(room.roundTimer);
  rooms.delete(roomCode);
}

/** Handle a player disconnecting — start reconnection window if match is active. */
function handleDisconnect(ws) {
  if (!ws.roomCode) return;

  const room = rooms.get(ws.roomCode);
  if (!room) return;

  const roomCode = ws.roomCode;

  // If match is active, give 30s to reconnect before forfeiting
  if (room.started && room.players.size === 2) {
    room.players.delete(ws.user.id);

    // Notify remaining player about temporary disconnect
    broadcastToRoom(roomCode, {
      type: 'opponent-disconnected',
      username: ws.user.username,
    });

    const dcKey = `${ws.user.id}:${roomCode}`;
    const forfeitTimer = setTimeout(() => {
      disconnected.delete(dcKey);
      handleForfeit(roomCode, ws.user.id, ws.user.username);
    }, RECONNECT_WINDOW_MS);

    disconnected.set(dcKey, {
      userId: ws.user.id,
      username: ws.user.username,
      roomCode,
      disconnectedAt: Date.now(),
      forfeitTimer,
    });

    return;
  }

  room.players.delete(ws.user.id);

  broadcastToRoom(roomCode, {
    type: 'player-left',
    username: ws.user.username,
    playerCount: room.players.size,
  });

  if (room.started && room.players.size < 2) {
    // Only one player left and no reconnection window (shouldn't normally reach here)
    if (room.players.size === 1) {
      handleForfeit(roomCode, ws.user.id, ws.user.username);
    } else {
      cleanupRoom(roomCode);
    }
    return;
  }

  // Clean up empty rooms
  if (room.players.size === 0) {
    cleanupRoom(roomCode);
  }
}

/** Handle forfeit — remaining player wins. */
function handleForfeit(roomCode, forfeitUserId, forfeitUsername) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.players.size === 1) {
    const [[remainingId, remainingWs]] = [...room.players.entries()];
    const finalScores = {};
    finalScores[remainingWs.user.username] = room.scores[remainingId] || 0;
    finalScores[forfeitUsername] = room.scores[forfeitUserId] || 0;

    sendTo(remainingWs, {
      type: 'gameOver',
      winner: remainingWs.user.username,
      scores: finalScores,
      results: [
        { username: remainingWs.user.username, score: room.scores[remainingId] || 0 },
        { username: forfeitUsername, score: room.scores[forfeitUserId] || 0 },
      ],
      forfeit: true,
    });

    // Persist forfeit result
    try {
      const db = getDb();
      const match = db.prepare(`SELECT id FROM matches WHERE room_code = ?`).get(roomCode);
      if (match) {
        db.prepare(
          `UPDATE matches SET status = 'finished', finished_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(match.id);
        const updatePlayer = db.prepare(
          `UPDATE match_players SET score = ?, finished_at = CURRENT_TIMESTAMP WHERE match_id = ? AND user_id = ?`
        );
        updatePlayer.run(room.scores[remainingId] || 0, match.id, remainingId);
        updatePlayer.run(room.scores[forfeitUserId] || 0, match.id, forfeitUserId);
      }
    } catch {
      // Non-fatal
    }
  }

  cleanupRoom(roomCode);
}

/** Build a username-keyed scores snapshot for a room. */
function buildScoresSnapshot(room) {
  const snapshot = {};
  room.players.forEach((ws, userId) => {
    snapshot[ws.user.username] = room.scores[userId] || 0;
  });
  return snapshot;
}

/** Handle a rematch request from a player. */
function handleRematchRequest(ws) {
  const roomCode = ws.roomCode;
  if (!roomCode) {
    ws.send(JSON.stringify({ type: 'error', message: 'No room to rematch in' }));
    return;
  }

  if (!rematchRequests.has(roomCode)) {
    rematchRequests.set(roomCode, new Set());
  }

  const requests = rematchRequests.get(roomCode);
  requests.add(ws.user.id);

  // Notify the opponent that a rematch was offered
  broadcastToRoom(roomCode, {
    type: 'rematch-offered',
    username: ws.user.username,
  }, ws.user.id);

  // Check if both players have requested rematch
  const pair = finishedPairs.get(roomCode);
  if (pair && requests.size >= 2) {
    // Both want rematch — create a new room
    const crypto = require('crypto');
    let newCode = crypto.randomBytes(3).toString('hex').toUpperCase();

    // Create DB match record
    try {
      const db = getDb();
      while (db.prepare('SELECT 1 FROM matches WHERE room_code = ?').get(newCode)) {
        newCode = crypto.randomBytes(3).toString('hex').toUpperCase();
      }
      const matchId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO matches (id, room_code, status, total_rounds, created_by) VALUES (?, ?, 'waiting', ?, ?)`
      ).run(matchId, newCode, 5, pair[0].userId);
      for (const p of pair) {
        db.prepare(
          `INSERT INTO match_players (match_id, user_id) VALUES (?, ?)`
        ).run(matchId, p.userId);
      }
    } catch {
      // Non-fatal — proceed with in-memory room
    }

    // Create the new room
    rooms.set(newCode, {
      players: new Map(),
      round: 0,
      totalRounds: 5,
      scores: {},
      started: false,
      puzzles: [],
      answers: {},
      roundTimer: null,
      createdAt: Date.now(),
    });

    // Notify both players
    broadcastToRoom(roomCode, {
      type: 'rematch-start',
      roomCode: newCode,
    });

    // Clean up old rematch state
    rematchRequests.delete(roomCode);
    finishedPairs.delete(roomCode);
  }
}

/** Send a message to a single WebSocket if open. */
function sendTo(ws, msg) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(msg));
  }
}

/** Send a message to all players in a room, optionally excluding one. */
function broadcastToRoom(roomCode, msg, excludeUserId) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const data = JSON.stringify(msg);
  room.players.forEach((ws, userId) => {
    if (userId !== excludeUserId && ws.readyState === 1) {
      ws.send(data);
    }
  });
}

module.exports = { initWebSocket, rooms };
