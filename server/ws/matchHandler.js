/**
 * WebSocket handler for real-time multiplayer matches.
 * Manages rooms, puzzle sync, round scoring, reconnection, and rematch.
 */

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const { getDb } = require('../db/connection');
const { checkAndUnlockAchievements } = require('../achievements');

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

/** Select `count` random puzzles from the database. */
function selectRandomPuzzles(count) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM puzzles WHERE active = 1 ORDER BY RANDOM() LIMIT ?').all(count);
  return rows.map(row => ({
    ...row,
    sequence: JSON.parse(row.sequence),
    options: JSON.parse(row.options),
  }));
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
    case 'start-match':
      handleStartMatch(ws);
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
      room.droppedPlayers.delete(ws.user.id);

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
      hostId: null,
      maxPlayers: 2,
      droppedPlayers: new Map(),
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

  // Load match info from DB to get max_players and host
  try {
    const db = getDb();
    const match = db.prepare('SELECT max_players, host_user_id, total_rounds FROM matches WHERE room_code = ?').get(code);
    if (match) {
      room.maxPlayers = match.max_players || 2;
      room.hostId = match.host_user_id;
      room.totalRounds = match.total_rounds || 5;
    }
  } catch {
    // Non-fatal: use defaults
  }

  if (room.started) {
    ws.send(JSON.stringify({ type: 'error', message: 'Match already in progress' }));
    return;
  }

  // Cap joins at maxPlayers
  if (room.players.size >= room.maxPlayers && !room.players.has(ws.user.id)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
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

  // Broadcast lobby-state to ALL players in the room
  broadcastLobbyState(code);
}

/** Broadcast lobby state to all players in a room. */
function broadcastLobbyState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const players = [...room.players.entries()].map(([userId, ws]) => ({
    username: ws.user.username,
    isHost: userId === room.hostId,
  }));

  const hostWs = room.players.get(room.hostId);

  broadcastToRoom(roomCode, {
    type: 'lobby-state',
    players,
    maxPlayers: room.maxPlayers,
    hostUsername: hostWs ? hostWs.user.username : null,
  });
}

/** Handle host requesting match start. */
function handleStartMatch(ws) {
  const roomCode = ws.roomCode;
  if (!roomCode) {
    return sendTo(ws, { type: 'error', message: 'Not in a room' });
  }

  const room = rooms.get(roomCode);
  if (!room) {
    return sendTo(ws, { type: 'error', message: 'Room not found' });
  }

  if (ws.user.id !== room.hostId) {
    return sendTo(ws, { type: 'error', message: 'Only the host can start the match' });
  }

  if (room.players.size < 2) {
    return sendTo(ws, { type: 'error', message: 'Need at least 2 players to start' });
  }

  if (room.started) {
    return sendTo(ws, { type: 'error', message: 'Match already started' });
  }

  startMatch(roomCode);
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

  // Check if all active players have answered
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

/** Assign ranks to a sorted-descending array of score entries, handling ties. */
function assignRanks(sortedEntries) {
  let currentRank = 1;
  for (let i = 0; i < sortedEntries.length; i++) {
    if (i > 0 && sortedEntries[i].total === sortedEntries[i - 1].total) {
      sortedEntries[i].rank = sortedEntries[i - 1].rank;
    } else {
      sortedEntries[i].rank = currentRank;
    }
    currentRank++;
  }
  return sortedEntries;
}

/** End the match: determine winner, persist to DB, broadcast results, keep room for rematch. */
function endMatch(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // Collect scores for all players (active + dropped)
  const userScores = [];
  room.players.forEach((ws, userId) => {
    userScores.push({ userId, username: ws.user.username, total: room.scores[userId] || 0 });
  });
  room.droppedPlayers.forEach(({ username }, userId) => {
    if (!userScores.find(e => e.userId === userId)) {
      userScores.push({ userId, username, total: 0 });
    }
  });

  // Sort descending by score and assign ranks with tie handling
  userScores.sort((a, b) => b.total - a.total);
  assignRanks(userScores);

  // Winner is rank-1 player (null if tie for 1st)
  const rank1Players = userScores.filter(e => e.rank === 1);
  const winner = rank1Players.length === 1 ? rank1Players[0].username : null;
  const totalPlayers = userScores.length;

  // Build per-player gameOver with personalised isYou / yourRank
  room.players.forEach((ws, userId) => {
    const entry = userScores.find(e => e.userId === userId);
    sendTo(ws, {
      type: 'gameOver',
      winner,
      totalPlayers,
      rankings: userScores.map(e => ({
        username: e.username,
        score: e.total,
        rank: e.rank,
        isYou: e.userId === userId,
      })),
      yourRank: entry ? entry.rank : totalPlayers,
      // Legacy fields for backward compatibility with 2-player clients
      scores: Object.fromEntries(userScores.map(e => [e.username, e.total])),
      results: userScores.map(e => ({ username: e.username, score: e.total })),
    });
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

  // Check achievements for all players
  try {
    for (const { userId, total, rank } of userScores) {
      const isWin = rank === 1 && rank1Players.length === 1;
      const context = {
        score: total,
        correctCount: 0,
        totalRounds: room.totalRounds,
        bestStreak: 0,
        mode: 'multiplayer',
        isWin,
        fastestAnswerMs: null,
      };
      const unlocked = checkAndUnlockAchievements(userId, context);
      if (unlocked.length > 0) {
        const ws = room.players.get(userId);
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'achievements-unlocked', achievements: unlocked }));
        }
      }
    }
  } catch {
    // Non-fatal
  }

  // Store player list for potential rematch
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

  // If match is active, track as dropped and give reconnect window
  if (room.started) {
    room.players.delete(ws.user.id);
    room.droppedPlayers.set(ws.user.id, { username: ws.user.username });

    // If only 1 player remains, end immediately — that player wins
    if (room.players.size <= 1) {
      // Cancel any pending reconnect timers for previously dropped players
      disconnected.forEach((info, key) => {
        if (key.endsWith(`:${roomCode}`) && info.forfeitTimer) {
          clearTimeout(info.forfeitTimer);
          disconnected.delete(key);
        }
      });

      if (room.players.size === 1) {
        handleForfeit(roomCode, ws.user.id, ws.user.username);
      } else {
        cleanupRoom(roomCode);
      }
      return;
    }

    // More than 1 player still active — notify and give reconnect window
    broadcastToRoom(roomCode, {
      type: 'opponent-disconnected',
      username: ws.user.username,
    });

    const dcKey = `${ws.user.id}:${roomCode}`;
    const forfeitTimer = setTimeout(() => {
      disconnected.delete(dcKey);
      // Player didn't reconnect — they stay as dropped.
      // Check if we still have enough players
      const currentRoom = rooms.get(roomCode);
      if (currentRoom && currentRoom.started && currentRoom.players.size <= 1) {
        if (currentRoom.players.size === 1) {
          handleForfeit(roomCode, ws.user.id, ws.user.username);
        } else {
          cleanupRoom(roomCode);
        }
      }
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

  // Host transfer in lobby (match not started)
  if (!room.started && ws.user.id === room.hostId && room.players.size > 0) {
    const [[newHostId]] = [...room.players.entries()];
    room.hostId = newHostId;

    // Update host in DB
    try {
      const db = getDb();
      db.prepare('UPDATE matches SET host_user_id = ? WHERE room_code = ?').run(newHostId, roomCode);
    } catch {
      // Non-fatal
    }
  }

  broadcastToRoom(roomCode, {
    type: 'player-left',
    username: ws.user.username,
    playerCount: room.players.size,
  });

  // Broadcast updated lobby state if still in lobby
  if (!room.started && room.players.size > 0) {
    broadcastLobbyState(roomCode);
  }

  // Clean up empty rooms
  if (room.players.size === 0) {
    cleanupRoom(roomCode);
  }
}

/** Handle forfeit — remaining player wins (last player standing). */
function handleForfeit(roomCode, forfeitUserId, forfeitUsername) {
  const room = rooms.get(roomCode);
  if (!room) return;

  // Clear round timer if active
  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  // Collect all players (active + dropped)
  const userScores = [];
  room.players.forEach((ws, userId) => {
    userScores.push({ userId, username: ws.user.username, total: room.scores[userId] || 0 });
  });
  room.droppedPlayers.forEach(({ username }, userId) => {
    if (!userScores.find(e => e.userId === userId)) {
      userScores.push({ userId, username, total: 0 });
    }
  });

  // Sort and assign ranks
  userScores.sort((a, b) => b.total - a.total);
  assignRanks(userScores);

  const totalPlayers = userScores.length;
  // The last remaining active player wins
  let winnerUsername = null;
  if (room.players.size === 1) {
    const [[, remainingWs]] = [...room.players.entries()];
    winnerUsername = remainingWs.user.username;
  }

  // Send personalised gameOver to each remaining connected player
  room.players.forEach((ws, userId) => {
    const entry = userScores.find(e => e.userId === userId);
    sendTo(ws, {
      type: 'gameOver',
      winner: winnerUsername,
      totalPlayers,
      rankings: userScores.map(e => ({
        username: e.username,
        score: e.total,
        rank: e.rank,
        isYou: e.userId === userId,
      })),
      yourRank: entry ? entry.rank : totalPlayers,
      scores: Object.fromEntries(userScores.map(e => [e.username, e.total])),
      results: userScores.map(e => ({ username: e.username, score: e.total })),
      forfeit: true,
    });
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
      for (const { userId, total } of userScores) {
        updatePlayer.run(total, match.id, userId);
      }
    }
  } catch {
    // Non-fatal
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
      hostId: pair[0].userId,
      maxPlayers: 2,
      droppedPlayers: new Map(),
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
