/**
 * WebSocket handler for real-time multiplayer matches.
 * Manages rooms, puzzle sync, round scoring, reconnection, and rematch.
 */

const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const { getDbAdapter } = require('../db');
const { checkAndUnlockAchievements } = require('../achievements');
const { getConfig } = require('../services/gameConfigLoader');
const { GAME_CONFIG_DEFAULTS } = require('../services/gameConfigDefaults');
const { computeFinalScore, computeRoundScore } = require('../services/scoringService');
const { getDbUnavailability } = require('../lib/transient-db-error');
const {
  getDbUnavailabilityState,
  setDbUnavailabilityState,
} = require('../lib/db-unavailability-state');
const pendingWrites = require('../lib/pending-writes');
const logger = require('../logger');

/** Active rooms: Map<roomCode, RoomState> */
const rooms = new Map();

/** Disconnected players awaiting reconnection: Map<`${userId}:${roomCode}`, DisconnectInfo> */
const disconnected = new Map();

/** Rematch requests: Map<roomCode, Set<userId>> */
const rematchRequests = new Map();

/** Finished rooms: Map<roomCode, { players, hostId, maxPlayers, totalRounds }> */
const finishedRooms = new Map();

/**
 * CS52-7b — resolve the active multiplayer config from `game_configs`
 * (CS52-7c loader). Returned shape: `{ rounds, round_timer_ms,
 * inter_round_delay_ms, source }`. `source` is `'game_configs'` when a DB
 * row supplied the values and `'code_default'` when the loader fell back to
 * `GAME_CONFIG_DEFAULTS.multiplayer` — distinguished by reference equality
 * (the loader returns the frozen defaults object as-is on fallback).
 */
async function loadMultiplayerConfig() {
  const cfg = await getConfig('multiplayer');
  const source = cfg === GAME_CONFIG_DEFAULTS.multiplayer ? 'code_default' : 'game_configs';
  return { ...cfg, source };
}

/** Gameplay message types that spectators are NOT allowed to send. */
const SPECTATOR_BLOCKED_ACTIONS = new Set([
  'answer', 'start-match', 'rematch-request', 'rematch-start-confirm',
]);
const ROOM_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const RECONNECT_WINDOW_MS = 30000;

/** Select `count` random puzzles from the database. */
async function selectRandomPuzzles(count) {
  const db = await getDbAdapter();
  const rows = await db.all('SELECT * FROM puzzles WHERE active = 1 ORDER BY RANDOM() LIMIT ?', [count]);
  return rows.map(row => ({
    ...row,
    sequence: JSON.parse(row.sequence),
    options: JSON.parse(row.options),
  }));
}

/**
 * CS52-7d — per-round scoring routes through the shared scoring service so
 * MP and single-player Ranked produce identical scores for identical
 * (correct, elapsed_ms, streak, round_timer_ms) tuples. The legacy
 * MP-specific `calculateScore(correct, timeMs)` was removed in favour of
 * `computeRoundScore` from `services/scoringService.js`.
 */
function scoreRoundForUser(room, userId, correct, elapsedMs) {
  const streak = room.streaks[userId] || 0;
  const result = computeRoundScore({
    correct,
    elapsedMs,
    streak,
    roundTimerMs: room.roundTimerMs,
  });
  room.streaks[userId] = result.newStreak;
  return result.pointsEarned;
}

/**
 * Initialize WebSocket server on the existing HTTP server.
 *
 * @param {import('http').Server} server - The HTTP server to attach to.
 * @param {Function} [isReady] - Optional callback returning true when the server
 *   is ready to accept connections. When provided and returning false, incoming
 *   WebSocket connections are closed with code 4503 ("Server not ready").
 */
function initWebSocket(server, isReady) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Reject connections when DB is not ready (Azure self-init in progress)
    if (typeof isReady === 'function' && !isReady()) {
      ws.close(4503, 'Server not ready');
      return;
    }

    // Authenticate via query param token
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    let user;
    try {
      user = jwt.verify(token, JWT_SECRET);
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    ws.user = user;
    ws.isAlive = true;
    ws._msgQueue = Promise.resolve();

    logger.info({ userId: user.id }, 'Player connected to WebSocket');

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      // Chain message handling per-socket to prevent interleaved async mutations
      ws._msgQueue = ws._msgQueue.then(() => {
        let msg;
        try {
          msg = JSON.parse(data);
        } catch {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
          }
          return;
        }
        return handleMessage(ws, msg);
      }).catch((err) => {
        logger.error({ err }, 'WebSocket handler error');
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'error', message: 'Internal server error' }));
        }
      });
    });

    ws.on('close', () => {
      handleDisconnect(ws).catch(() => { /* non-fatal */ });
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

  logger.info('WebSocket server ready on /ws');
  return wss;
}

/** Handle incoming WebSocket messages. */
async function handleMessage(ws, msg) {
  // Spectators can only join — block gameplay actions
  if (ws.isSpectator && SPECTATOR_BLOCKED_ACTIONS.has(msg.type)) {
    return sendTo(ws, { type: 'error', message: 'Spectators cannot perform this action' });
  }

  switch (msg.type) {
    case 'join':
      await handleJoin(ws, msg.roomCode);
      break;
    case 'answer':
      handleAnswer(ws, msg);
      break;
    case 'start-match':
      await handleStartMatch(ws);
      break;
    case 'rematch-request':
      handleRematchRequest(ws);
      break;
    case 'rematch-start-confirm':
      await handleRematchStartConfirm(ws);
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
  }
}

/** Handle a player joining a room (or reconnecting). */
async function handleJoin(ws, roomCode) {
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
      ws.isSpectator = false;

      logger.info({ userId: ws.user.id, roomCode: code }, 'Player reconnected');

      sendReconnectState(ws, code, room);
      return;
    }
  }

  if (!rooms.has(code)) {
    // CS52-7b: pre-seed defaults; startMatch() snapshots the live config.
    const mpDefaults = GAME_CONFIG_DEFAULTS.multiplayer;
    rooms.set(code, {
      players: new Map(),
      spectators: new Map(),
      hostId: null,
      maxPlayers: 2,
      droppedPlayers: new Map(),
      round: 0,
      totalRounds: mpDefaults.rounds,
      roundTimerMs: mpDefaults.round_timer_ms,
      interRoundDelayMs: mpDefaults.inter_round_delay_ms,
      configSource: 'code_default',
      scores: {},
      streaks: {},
      rankedSessionIds: {},
      roundsMeta: {},
      matchId: null,
      startedAtIso: null,
      configSnapshot: null,
      started: false,
      puzzles: [],
      answers: {},
      roundTimer: null,
      createdAt: Date.now(),
    });
  }

  const room = rooms.get(code);

  // Ensure spectators map exists (for rooms created before this change)
  if (!room.spectators) room.spectators = new Map();

  // Load match info from DB to get max_players and host
  try {
    const db = await getDbAdapter();
    const match = await db.get('SELECT max_players, host_user_id, total_rounds FROM matches WHERE room_code = ?', [code]);
    if (match) {
      room.maxPlayers = match.max_players || 2;
      room.hostId = match.host_user_id;
      room.totalRounds = match.total_rounds || 5;
    }
  } catch {
    // Non-fatal: use defaults
  }

  if (room.started) {
    // Reconnect: player still in active list (old socket close event hasn't fired yet)
    if (room.players.has(ws.user.id)) {
      const oldWs = room.players.get(ws.user.id);
      try { oldWs.close(); } catch { /* ignore stale socket */ }
      room.players.set(ws.user.id, ws);
      ws.isSpectator = false;
      logger.info({ userId: ws.user.id, roomCode: code }, 'Player reconnected');
      sendReconnectState(ws, code, room);
      return;
    }
    // Reconnect: player was dropped but hasn't been forfeited yet
    if (room.droppedPlayers.has(ws.user.id)) {
      const dcKey2 = `${ws.user.id}:${code}`;
      const dcInfo2 = disconnected.get(dcKey2);
      if (dcInfo2?.forfeitTimer) clearTimeout(dcInfo2.forfeitTimer);
      disconnected.delete(dcKey2);
      room.players.set(ws.user.id, ws);
      room.droppedPlayers.delete(ws.user.id);
      ws.isSpectator = false;
      logger.info({ userId: ws.user.id, roomCode: code }, 'Player reconnected');
      sendReconnectState(ws, code, room);
      return;
    }
    return joinAsSpectator(ws, code, room);
  }

  // After match ends, room stays alive for rematch — new users should spectate
  if (finishedRooms.has(code)) {
    return joinAsSpectator(ws, code, room);
  }

  // Cap joins at maxPlayers
  if (room.players.size >= room.maxPlayers && !room.players.has(ws.user.id)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
    return;
  }

  ws.isSpectator = false;
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

/** Join a user as a spectator for an active or finished match. */
function joinAsSpectator(ws, roomCode, room) {
  ws.isSpectator = true;
  room.spectators.set(ws.user.id, ws);

  const players = [];
  room.players.forEach((pws, uid) => {
    players.push({ username: pws.user.username, score: room.scores[uid] || 0, connected: true });
  });
  room.droppedPlayers.forEach(({ username }, uid) => {
    players.push({ username, score: room.scores[uid] || 0, connected: false });
  });

  // Normalize totalRounds to a positive integer and clamp currentRound >= 0
  const safeTotalRounds = Math.max(1, Math.floor(room.totalRounds) || 1);
  const currentRound = Math.max(0, Math.min(room.round, safeTotalRounds - 1));

  sendTo(ws, {
    type: 'spectator-joined',
    roomCode,
    spectatorCount: room.spectators.size,
    currentRound,
    totalRounds: safeTotalRounds,
    scores: buildScoresSnapshot(room),
    players,
  });

  broadcastSpectatorCount(roomCode);

  // If the match has already finished, immediately send gameOver to the spectator
  if (finishedRooms.has(roomCode)) {
    const userScores = [];
    room.players.forEach((pws, uid) => {
      userScores.push({ userId: uid, username: pws.user.username, total: room.scores[uid] || 0 });
    });
    room.droppedPlayers.forEach(({ username }, uid) => {
      if (!userScores.find(e => e.userId === uid)) {
        userScores.push({ userId: uid, username, total: room.scores[uid] || 0 });
      }
    });
    userScores.sort((a, b) => b.total - a.total);
    assignRanks(userScores);

    const rank1 = userScores.filter(e => e.rank === 1);
    sendTo(ws, buildSpectatorGameOver(
      rank1.length === 1 ? rank1[0].username : null,
      userScores,
    ));
  }
}

/** Build a spectator-safe gameOver payload (isYou always false). */
function buildSpectatorGameOver(winner, userScores, extraFields = {}) {
  return {
    type: 'gameOver',
    winner,
    totalPlayers: userScores.length,
    rankings: userScores.map(e => ({
      username: e.username,
      score: e.total,
      rank: e.rank,
      isYou: false,
    })),
    scores: Object.fromEntries(userScores.map(e => [e.username, e.total])),
    results: userScores.map(e => ({ username: e.username, score: e.total })),
    ...extraFields,
  };
}

/** Broadcast spectator count to all room members (players + spectators). */
function broadcastSpectatorCount(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  if (!room.spectators) room.spectators = new Map();

  const msg = { type: 'spectator-count', count: room.spectators.size };
  const data = JSON.stringify(msg);

  room.players.forEach((ws) => {
    if (ws.readyState === 1) ws.send(data);
  });
  room.spectators.forEach((ws) => {
    if (ws.readyState === 1) ws.send(data);
  });
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
async function handleStartMatch(ws) {
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

  await startMatch(roomCode);
}

/** Start a match: select puzzles and send the first round. */
async function startMatch(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  if (room.started || room.starting) return;

  room.starting = true;

  // CS52-7b: snapshot the active multiplayer config at match-start so
  // mid-match admin edits don't desync rounds-in-flight. The matches table
  // stores `total_rounds` only (pre-CS52-7d); timer/delay live on the room.
  let configSource = 'code_default';
  try {
    const mpConfig = await loadMultiplayerConfig();
    room.totalRounds = mpConfig.rounds;
    room.roundTimerMs = mpConfig.round_timer_ms;
    room.interRoundDelayMs = mpConfig.inter_round_delay_ms;
    room.configSource = mpConfig.source;
    configSource = mpConfig.source;
  } catch (err) {
    // Loader failure is non-fatal: defaults baked into the room at handleJoin
    // remain in force. Log so operators see it.
    logger.warn({ err, roomCode }, 'Failed to load multiplayer config; using room defaults');
  }

  // CS52-7d: snapshot the canonical config shape used by the shared scoring
  // service / pending-writes Variant C / ranked_sessions.config_snapshot. We
  // freeze the shape at match-start so admin edits mid-match cannot retro-
  // actively change scoring or persisted shape.
  room.configSnapshot = {
    rounds: room.totalRounds,
    round_timer_ms: room.roundTimerMs,
    inter_round_delay_ms: room.interRoundDelayMs,
  };

  // CS52-7d: pre-allocate one ranked_sessions UUID per joined participant.
  // These IDs become the row PKs whether the match is persisted live (via
  // the shared scoring service) or replayed from a Variant C pending_writes
  // file when the DB is unavailable at match-end. Pre-allocation here means
  // the on-disk queue file carries deterministic IDs from the moment of
  // match-end, so re-drains stay idempotent on `match_id` regardless of
  // when the live DB write succeeds vs. when the drain runs.
  room.rankedSessionIds = {};
  room.streaks = {};
  room.roundsMeta = {};
  room.players.forEach((_ws, userId) => {
    room.rankedSessionIds[userId] = crypto.randomUUID();
    room.streaks[userId] = 0;
  });

  try {
    room.puzzles = await selectRandomPuzzles(room.totalRounds);
  } catch (err) {
    room.starting = false;
    logger.error({ err, roomCode }, 'Failed to load puzzles for room');
    broadcastToRoom(roomCode, { type: 'error', message: 'Failed to load puzzles. Please try again.' });
    cleanupRoom(roomCode);
    return;
  }
  room.started = true;
  room.starting = false;

  // Resolve match_id (best-effort) for the structured config-snapshot log line.
  let matchId = null;
  try {
    const db = await getDbAdapter();
    const m = await db.get('SELECT id FROM matches WHERE room_code = ?', [roomCode]);
    if (m) matchId = m.id;
  } catch { /* non-fatal */ }
  room.matchId = matchId;
  room.startedAtIso = new Date().toISOString();

  // CS52-7b telemetry signal: structured config-snapshot at match start.
  // Cross-references docs/observability.md § B.11 (matches per config shape).
  // Note: use `event` (not `msg`) for the structured discriminator — Pino
  // overwrites object-level `msg` with the string message argument, so KQL
  // filters must key off `event` to be reliable.
  logger.info(
    {
      event: 'multiplayer_match_started',
      match_id: matchId,
      room_code: roomCode,
      config: {
        rounds: room.totalRounds,
        round_timer_ms: room.roundTimerMs,
        inter_round_delay_ms: room.interRoundDelayMs,
      },
      source: configSource,
      playerCount: room.players.size,
    },
    'multiplayer match started'
  );

  // Build player name list
  const playerNames = [];
  room.players.forEach((ws) => playerNames.push(ws.user.username));

  // Update match status in DB. CS52-7b: also persist the live snapshotted
  // total_rounds so the matches row matches what the room actually plays
  // (admin edits between room creation and start would otherwise diverge).
  try {
    const db = await getDbAdapter();
    await db.run(
      `UPDATE matches SET status = 'active', total_rounds = ? WHERE room_code = ?`,
      [room.totalRounds, roomCode]
    );
  } catch {
    // Non-fatal: match can proceed without DB update
  }

  broadcastToRoom(roomCode, {
    type: 'match-start',
    players: playerNames,
    totalRounds: room.totalRounds,
  });

  // Start the first round after a brief delay
  setTimeout(() => sendRound(roomCode).catch(() => {}), 1000);
}

/** Send the current round's puzzle to all players. */
async function sendRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.round >= room.totalRounds) return;

  const roundNum = room.round;
  const puzzle = room.puzzles[roundNum];

  room.answers[roundNum] = {};

  // Record round in DB
  try {
    const db = await getDbAdapter();
    const match = await db.get(`SELECT id FROM matches WHERE room_code = ?`, [roomCode]);
    if (match) {
      await db.run(
        `INSERT OR IGNORE INTO match_rounds (match_id, round_num, puzzle_id) VALUES (?, ?, ?)`,
        [match.id, roundNum + 1, puzzle.id]
      );
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
      submitted_by: puzzle.submitted_by || null,
    },
    totalRounds: room.totalRounds,
  });

  const startedAtMs = Date.now();
  room.roundStartedAt = startedAtMs;
  // CS52-7d: capture per-round metadata (puzzle_id + server-side
  // round_started_at) so endMatch can build per-participant
  // ranked_session_events with server-derived elapsed_ms.
  room.roundsMeta[roundNum] = {
    puzzle_id: puzzle.id,
    round_started_at_ms: startedAtMs,
    round_started_at_iso: new Date(startedAtMs).toISOString(),
    answer_key: puzzle.answer,
  };

  // CS52-7b: round timeout from snapshotted config (loader → game_configs).
  room.roundTimer = setTimeout(() => {
    resolveRound(roomCode);
  }, room.roundTimerMs);
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
    // `timeMs` is the legacy client-supplied value, kept for telemetry only
    // (CS52-7d: scoring uses server-derived elapsed_ms — see resolveRound).
    timeMs: typeof msg.timeMs === 'number' ? msg.timeMs : null,
    receivedAtMs: Date.now(),
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
  const roundMeta = room.roundsMeta[roundNum];
  const roundTimerMs = room.roundTimerMs;
  room.players.forEach((ws, userId) => {
    const answer = roundAnswers[userId];
    const correct = answer ? answer.answerId === puzzle.answer : false;
    // CS52-7d: server-derived elapsed_ms drives scoring. The client's
    // `timeMs` is telemetry only (matches the CS52-3 anti-cheat invariant).
    let elapsedMs;
    if (answer && roundMeta) {
      elapsedMs = Math.max(0, answer.receivedAtMs - roundMeta.round_started_at_ms);
    } else {
      // No answer received before timeout — treat as full-timer elapsed so
      // speedBonus = 0 (and correct=0 means points=0 anyway).
      elapsedMs = roundTimerMs;
    }
    const points = scoreRoundForUser(room, userId, correct, elapsedMs);

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
    setTimeout(() => endMatch(roomCode).catch(() => {}), room.interRoundDelayMs);
  } else {
    setTimeout(() => sendRound(roomCode).catch(() => {}), room.interRoundDelayMs);
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

/**
 * CS52-7d — build one `{ ranked_session_id, user_id, score, correct_count,
 * best_streak, events: [...] }` payload per pre-allocated participant.
 *
 * Drops users who never had a ranked_session_id pre-allocated (defensive —
 * pre-allocation happens once at startMatch over `room.players`). For each
 * participant, emits **one event per round** so the recomputed
 * `computeFinalScore()` walk sees the same correctness/streak sequence the
 * live `endRound` produced (which calls `scoreRoundForUser` for every
 * participant — answered or not — to reset streaks on misses). Unanswered
 * rounds are written with `correct=0`, `answer=''`, `elapsed_ms=roundTimerMs`,
 * `client_time_ms=null`, and `received_at = round_started_at + roundTimerMs`,
 * which mirrors the live timeout handling at line ~720.
 *
 * Server-derived `elapsed_ms = received_at_ms − round_started_at_ms` is
 * the only value used by the shared scoring service; the client's `timeMs`
 * survives only as `client_time_ms` for telemetry parity with single-
 * player Ranked.
 */
function buildParticipantPayloads(room) {
  const configSnapshot = room.configSnapshot;
  const roundTimerMs = room.roundTimerMs;
  const participants = [];
  const userIds = Object.keys(room.rankedSessionIds || {});
  for (const userIdStr of userIds) {
    const userId = Number(userIdStr);
    const rankedSessionId = room.rankedSessionIds[userIdStr];
    const events = [];
    for (let r = 0; r < room.totalRounds; r++) {
      const meta = room.roundsMeta[r];
      if (!meta) {
        // Defensive (Copilot R2): emit a visible structured error and drop
        // the round rather than silently shortening `events`. A missing
        // `roundsMeta[r]` here would mean the live `endRound` never ran for
        // that round, which should never happen on a normal completion path
        // — but if it ever does, the discrepancy must be observable in logs
        // rather than buried as a 0-event gap.
        logger.error(
          {
            event: 'multiplayer_match_persist_meta_missing',
            user_id: userId,
            round_num: r,
            total_rounds: room.totalRounds,
            match_id: room.matchId,
          },
          'multiplayer: roundsMeta[r] missing while building participant payload — round dropped'
        );
        continue;
      }
      const answer = room.answers[r] && room.answers[r][userId];
      if (answer) {
        const correct = answer.answerId === meta.answer_key ? 1 : 0;
        const elapsedMs = Math.max(0, answer.receivedAtMs - meta.round_started_at_ms);
        events.push({
          round_num: r,
          puzzle_id: meta.puzzle_id,
          answer: String(answer.answerId == null ? '' : answer.answerId),
          correct,
          round_started_at: meta.round_started_at_iso,
          received_at: new Date(answer.receivedAtMs).toISOString(),
          elapsed_ms: elapsedMs,
          client_time_ms:
            typeof answer.timeMs === 'number' && Number.isFinite(answer.timeMs)
              ? Math.trunc(answer.timeMs)
              : null,
        });
      } else {
        // Unanswered round — emit a zero-points event so streak is reset
        // when computeFinalScore replays the sequence (parity with live
        // endRound's per-participant scoreRoundForUser call).
        const timeoutAtMs = meta.round_started_at_ms + roundTimerMs;
        events.push({
          round_num: r,
          puzzle_id: meta.puzzle_id,
          answer: '',
          correct: 0,
          round_started_at: meta.round_started_at_iso,
          received_at: new Date(timeoutAtMs).toISOString(),
          elapsed_ms: roundTimerMs,
          client_time_ms: null,
        });
      }
    }
    const final = computeFinalScore(events, configSnapshot);
    participants.push({
      user_id: userId,
      ranked_session_id: rankedSessionId,
      score: final.score,
      correct_count: final.correctCount,
      best_streak: final.bestStreak,
      events,
    });
  }
  return participants;
}

/**
 * CS52-7d — write one `ranked_sessions` row per participant + N
 * `ranked_session_events` rows per participant in a single transaction.
 * Caller decides whether `db` is the live adapter or a transaction
 * scope; this helper just runs the inserts.
 */
async function insertMatchRows(tx, { matchId, roomCode, configSnapshot,
                                       startedAtIso, finishedAtIso, participants }) {
  const configJson = JSON.stringify(configSnapshot);
  // CS52-7d (Copilot R4): `ranked_sessions.match_id` is NVARCHAR(255) on
  // MSSQL / TEXT on SQLite (migration 008). `matches.id` is INT on MSSQL,
  // so the driver would otherwise bind `matchId` as INT here, forcing an
  // implicit INT→NVARCHAR conversion on the column and degrading the
  // partial index `idx_ranked_sessions_match_id`. Coerce to string at
  // every ranked_sessions bind site (writes here, reads in
  // pending-writes-replay) while keeping INT for legacy `matches`/
  // `match_players` updates which use the native INT `id`/`match_id`.
  const matchIdStr = String(matchId);
  for (const p of participants) {
    await tx.run(
      `INSERT INTO ranked_sessions
         (id, user_id, mode, match_id, room_code, config_snapshot, status,
          score, correct_count, best_streak, started_at, finished_at, expires_at)
       VALUES (?, ?, 'multiplayer', ?, ?, ?, 'finished', ?, ?, ?, ?, ?, ?)`,
      [
        p.ranked_session_id,
        p.user_id,
        matchIdStr,
        roomCode,
        configJson,
        p.score,
        p.correct_count,
        p.best_streak,
        startedAtIso,
        finishedAtIso,
        finishedAtIso,
      ]
    );
    for (const ev of p.events) {
      await tx.run(
        `INSERT INTO ranked_session_events
           (session_id, round_num, puzzle_id, answer, correct,
            round_started_at, received_at, elapsed_ms, client_time_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.ranked_session_id,
          ev.round_num,
          ev.puzzle_id,
          ev.answer,
          ev.correct,
          ev.round_started_at,
          ev.received_at,
          ev.elapsed_ms,
          ev.client_time_ms,
        ]
      );
    }
  }
}

/**
 * CS52-7d — orchestrate the unified MP persist.
 *
 * Live path: single transaction inserting ranked_sessions + events for all
 * participants, plus the legacy matches/match_players UPDATE so existing
 * leaderboard / history endpoints keep working.
 *
 * DB-unavailable path (Variant C of CS52-7e): when `getDbUnavailability()`
 * returns a descriptor (cold-start, free-tier exhaustion), the planned
 * rows are serialised to a single pending_writes file. The drain replays
 * idempotently on `match_id` once the DB recovers. The match is not
 * declared "saved" to players until the queue file is fsynced — that
 * preserves the existing match-finished = score-recorded UX contract
 * even during a DB blip.
 */
async function persistCompletedMatch(room, roomCode, userScores) {
  const finishedAtIso = new Date().toISOString();
  const startedAtIso = room.startedAtIso || finishedAtIso;
  const configSnapshot = room.configSnapshot;
  const participants = buildParticipantPayloads(room);

  // Pre-flight: if the unavailability state is already non-null, skip the
  // live attempt and queue Variant C directly. This mirrors the
  // /api/sessions/:id/finish route's preflight short-circuit.
  const preState = getDbUnavailabilityState();
  if (preState) {
    // Best-effort matchId rehydration before short-circuiting (Copilot R2 —
    // ensure the Variant C file has its idempotency key even if startMatch
    // didn't manage to populate `room.matchId`). The DB is known unavailable
    // here so the lookup is unlikely to succeed, but it costs little and
    // helps in the narrow window where preState was set by a peer route
    // while this room's DB connection might still answer.
    if (!room.matchId) {
      try {
        const db = await getDbAdapter();
        const m = await db.get(`SELECT id FROM matches WHERE room_code = ?`, [roomCode]);
        if (m) room.matchId = m.id;
      } catch { /* expected while DB unavailable; enqueueVariantC will log loudly */ }
    }
    await enqueueVariantC(room, roomCode, {
      configSnapshot, startedAtIso, finishedAtIso, participants,
    }, preState);
    return;
  }

  let matchId = room.matchId;
  try {
    const db = await getDbAdapter();
    if (!matchId) {
      const m = await db.get(`SELECT id FROM matches WHERE room_code = ?`, [roomCode]);
      if (m) {
        matchId = m.id;
        room.matchId = matchId;
      }
    }
    if (!matchId) {
      // No `matches` row — the match was never registered (test fixture or
      // DB write failure at room create). Without an id we cannot link the
      // ranked_sessions rows; log + skip silently rather than dead-letter.
      logger.warn({ roomCode },
        'multiplayer: persist skipped — no matches row for room_code');
      return;
    }
    await db.transaction(async (tx) => {
      // CS52-7d (Copilot R3): use DB-side CURRENT_TIMESTAMP for the legacy
      // `matches`/`match_players` DATETIME columns rather than binding an
      // ISO-Z string. The mssql-adapter passes CURRENT_TIMESTAMP through to
      // T-SQL unchanged (it's a valid SQL Server keyword), avoiding the
      // implicit string→DATETIME conversion path that has been brittle in
      // production (see done_cs18_mssql-production-fixes.md). The new
      // ranked_sessions rows still take the ISO timestamp so all four
      // timestamp columns (started_at/finished_at/expires_at) on a single
      // row are written consistently in one transaction.
      await tx.run(
        `UPDATE matches SET status = 'finished', finished_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [matchId]
      );
      for (const { userId, total } of userScores) {
        await tx.run(
          `UPDATE match_players SET score = ?, finished_at = CURRENT_TIMESTAMP WHERE match_id = ? AND user_id = ?`,
          [total, matchId, userId]
        );
      }
      await insertMatchRows(tx, {
        matchId, roomCode, configSnapshot, startedAtIso, finishedAtIso, participants,
      });
    });
    logger.info(
      {
        event: 'multiplayer_match_persisted',
        match_id: matchId,
        room_code: roomCode,
        participant_count: participants.length,
        persistence_path: 'live',
      },
      'multiplayer match persisted (live)'
    );
  } catch (err) {
    const u = getDbUnavailability(err);
    if (u) {
      setDbUnavailabilityState(u);
      try {
        await enqueueVariantC(room, roomCode, {
          configSnapshot, startedAtIso, finishedAtIso, participants,
        }, u, matchId);
        return;
      } catch (enqueueErr) {
        logger.error(
          { err: enqueueErr, roomCode, matchId },
          'multiplayer: Variant C enqueue failed — match persist lost'
        );
        throw enqueueErr;
      }
    }
    throw err;
  }
}

async function enqueueVariantC(room, roomCode, planned, descriptor, matchIdHint) {
  const matchId = matchIdHint || room.matchId;
  if (!matchId) {
    // Without a match_id the Variant C row would have no idempotency key.
    // Log + drop loudly rather than queueing a malformed file. Emit the
    // structured `multiplayer_match_persist_dropped` event (Copilot R2 —
    // make the loss observable in App Insights so on-call can grep) so
    // missing-matchId is symmetric with the queue-full drop path below.
    logger.error(
      {
        event: 'multiplayer_match_persist_dropped',
        reason: 'missing_match_id',
        room_code: roomCode,
        participant_count: planned && planned.participants && planned.participants.length,
        descriptor_reason: descriptor && descriptor.reason,
      },
      'multiplayer: Variant C enqueue skipped — no match_id available'
    );
    return;
  }
  try {
    const { request_id } = await pendingWrites.enqueue({
      endpoint: 'INTERNAL multiplayer-match-completion',
      concrete_route: { match_id: matchId, room_code: roomCode },
      user_id: null,
      payload: {
        config_snapshot: planned.configSnapshot,
        started_at: planned.startedAtIso,
        finished_at: planned.finishedAtIso,
        participants: planned.participants,
      },
    });
    logger.info(
      {
        event: 'multiplayer_match_persisted',
        match_id: matchId,
        room_code: roomCode,
        participant_count: planned.participants.length,
        persistence_path: 'pending_writes_variant_c',
        request_id,
        reason: descriptor && descriptor.reason,
      },
      'multiplayer match persisted (pending_writes Variant C)'
    );
  } catch (err) {
    if (err && err.code === 'PENDING_WRITES_QUEUE_FULL') {
      logger.error(
        { roomCode, matchId, depth: err.depth, max: err.max,
          event: 'multiplayer_match_persist_dropped',
          reason: 'pending_writes_queue_full' },
        'multiplayer: Variant C enqueue rejected (queue full) — match lost'
      );
      return;
    }
    throw err;
  }
}

/** End the match: determine winner, persist to DB, broadcast results, keep room for rematch. */
async function endMatch(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  logger.info({ roomCode, playerCount: room.players.size + room.droppedPlayers.size }, 'Match ended');

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

  // Build per-player gameOver with personalised isYou / yourRank + isHost
  room.players.forEach((ws, userId) => {
    const entry = userScores.find(e => e.userId === userId);
    sendTo(ws, {
      type: 'gameOver',
      winner,
      totalPlayers,
      isHost: userId === room.hostId,
      hostUsername: room.players.get(room.hostId)?.user?.username || null,
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

  // Send generic gameOver to spectators
  if (room.spectators) {
    const data = JSON.stringify(buildSpectatorGameOver(winner, userScores));
    room.spectators.forEach((ws) => {
      if (ws.readyState === 1) ws.send(data);
    });
  }

  // CS52-7d: persist completed match through the unified storage + scoring
  // path. One `ranked_sessions` row per (match, player) + N
  // `ranked_session_events` rows per participant, written in a single
  // transaction. Score is recomputed from per-event server-derived
  // elapsed_ms via the shared scoring service so the persisted value is
  // the canonical algorithm — no MP-specific scoring code touches the row.
  //
  // When `getDbUnavailability()` is non-null at match-end (cold-start, free-
  // tier exhaustion, etc.) the planned rows are serialised to a single
  // pending_writes Variant C file (CS52-7e); the drain replays them
  // idempotently on `match_id` once the DB returns.
  await persistCompletedMatch(room, roomCode, userScores).catch((err) => {
    logger.error({ err, roomCode, matchId: room.matchId },
      'multiplayer: unified persist failed (non-fatal to UX, may dead-letter)');
  });

  // Check achievements for all players (CS52-7: MP match-end is a
  // server-validated outcome — achievement evaluation is allowed here.)
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
      const unlocked = await checkAndUnlockAchievements(userId, context);
      logger.info(
        {
          event: 'achievement_evaluation',
          user_id: userId,
          source: 'mp_match_end',
          room_code: roomCode,
          achievements_unlocked: unlocked.map((a) => a.id),
        },
        'achievements evaluated for multiplayer match-end'
      );
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

  // Store finished room info for potential rematch (players, settings, host)
  finishedRooms.set(roomCode, {
    players: userScores.map(({ userId, username }) => ({ userId, username })),
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    totalRounds: room.totalRounds,
  });

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
      finishedRooms.delete(roomCode);
    }
  }, 60000);
}

/** Remove a room and clear any timers. */
function cleanupRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  if (room.roundTimer) clearTimeout(room.roundTimer);
  if (room.spectators) {
    room.spectators.forEach((ws) => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room closed' }));
      }
    });
    room.spectators.clear();
  }
  rooms.delete(roomCode);
}

/** Handle a player or spectator disconnecting — start reconnection window if match is active. */
async function handleDisconnect(ws) {
  if (!ws.roomCode) return;

  const room = rooms.get(ws.roomCode);
  if (!room) return;

  const roomCode = ws.roomCode;

  // Handle spectator disconnect — verify ws identity before removing
  if (ws.isSpectator) {
    if (room.spectators && room.spectators.get(ws.user.id) === ws) {
      room.spectators.delete(ws.user.id);
      broadcastSpectatorCount(roomCode);
    }
    return;
  }

  // Ignore stale socket close events (e.g. after reconnect replaced this socket)
  if (room.players.get(ws.user.id) !== ws) return;

  logger.info({ userId: ws.user.id, roomCode }, 'Player disconnected');

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
        await handleForfeit(roomCode, ws.user.id, ws.user.username);
      } else {
        cleanupRoom(roomCode);
      }
      return;
    }

    // More than 1 player still active — notify and give reconnect window
    broadcastToRoom(roomCode, {
      type: 'player-disconnected',
      username: ws.user.username,
      remainingCount: room.players.size,
    });

    const dcKey = `${ws.user.id}:${roomCode}`;
    const forfeitTimer = setTimeout(async () => {
      try {
        disconnected.delete(dcKey);
        logger.warn({ userId: ws.user.id, roomCode }, 'Player dropped after reconnect timeout');
        // Player didn't reconnect — they stay as dropped.

        // Host transfer if the disconnected player was host
        const currentRoom = rooms.get(roomCode);
        if (currentRoom && currentRoom.started && ws.user.id === currentRoom.hostId && currentRoom.players.size > 0) {
          const [[newHostId]] = [...currentRoom.players.entries()];
          currentRoom.hostId = newHostId;
          try {
            const db = await getDbAdapter();
            await db.run('UPDATE matches SET host_user_id = ? WHERE room_code = ?', [newHostId, roomCode]);
          } catch { /* non-fatal */ }
          logger.info({ roomCode, newHostId }, 'Host transferred');
          broadcastToRoom(roomCode, {
            type: 'host-transferred',
            newHost: currentRoom.players.get(newHostId).user.username,
          });
        }

        // Notify remaining players that the player has been removed
        if (currentRoom && currentRoom.started) {
          logger.info({ userId: ws.user.id, roomCode }, 'Player forfeited');
          broadcastToRoom(roomCode, {
            type: 'player-forfeited',
            username: ws.user.username,
            remainingCount: currentRoom.players.size,
          });
        }

        // Check if we still have enough players
        if (currentRoom && currentRoom.started && currentRoom.players.size <= 1) {
          if (currentRoom.players.size === 1) {
            await handleForfeit(roomCode, ws.user.id, ws.user.username);
          } else {
            cleanupRoom(roomCode);
          }
        }
      } catch { /* non-fatal */ }
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
      const db = await getDbAdapter();
      await db.run('UPDATE matches SET host_user_id = ? WHERE room_code = ?', [newHostId, roomCode]);
    } catch {
      // Non-fatal
    }

    logger.info({ roomCode, newHostId }, 'Host transferred');

    // If in rematch setup, also transfer host in finishedRooms and notify
    const finished = finishedRooms.get(roomCode);
    if (finished) {
      finished.hostId = newHostId;
      const newHostWs = room.players.get(newHostId);
      broadcastToRoom(roomCode, {
        type: 'host-transferred',
        newHost: newHostWs ? newHostWs.user.username : null,
      });
    }
  }

  // Remove from rematch requests if present
  const rematchSet = rematchRequests.get(roomCode);
  if (rematchSet) {
    rematchSet.delete(ws.user.id);
    // Broadcast updated ready list if in rematch setup
    const finished = finishedRooms.get(roomCode);
    if (finished) {
      broadcastRematchReady(roomCode);
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
    rematchRequests.delete(roomCode);
    finishedRooms.delete(roomCode);
  }
}

/** Handle forfeit — remaining player wins (last player standing). */
async function handleForfeit(roomCode, _forfeitUserId, _forfeitUsername) {
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

  // Send generic gameOver to spectators
  if (room.spectators) {
    const data = JSON.stringify(buildSpectatorGameOver(winnerUsername, userScores, { forfeit: true }));
    room.spectators.forEach((ws) => {
      if (ws.readyState === 1) ws.send(data);
    });
  }

  // Persist forfeit result
  try {
    const db = await getDbAdapter();
    const match = await db.get(`SELECT id FROM matches WHERE room_code = ?`, [roomCode]);
    if (match) {
      await db.run(
        `UPDATE matches SET status = 'finished', finished_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [match.id]
      );
      for (const { userId, total } of userScores) {
        await db.run(
          `UPDATE match_players SET score = ?, finished_at = CURRENT_TIMESTAMP WHERE match_id = ? AND user_id = ?`,
          [total, match.id, userId]
        );
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

/** Send reconnect state to a rejoining player and notify others. */
function sendReconnectState(ws, roomCode, room) {
  const players = [];
  room.players.forEach((pws, uid) => {
    players.push({ username: pws.user.username, score: room.scores[uid] || 0, connected: true });
  });
  room.droppedPlayers.forEach(({ username }, uid) => {
    players.push({ username, score: room.scores[uid] || 0, connected: false });
  });
  const droppedPlayers = [];
  room.droppedPlayers.forEach(({ username }) => droppedPlayers.push(username));

  ws.send(JSON.stringify({
    type: 'reconnected',
    roomCode,
    scores: buildScoresSnapshot(room),
    players,
    droppedPlayers,
    currentRound: room.round,
    totalRounds: room.totalRounds,
    myScore: room.scores[ws.user.id] || 0,
  }));

  broadcastToRoom(roomCode, {
    type: 'player-reconnected',
    username: ws.user.username,
    remainingCount: room.players.size,
  }, ws.user.id);
}

/** Handle a rematch request from a player (ready up). */
function handleRematchRequest(ws) {
  const roomCode = ws.roomCode;
  if (!roomCode) {
    return sendTo(ws, { type: 'error', message: 'No room to rematch in' });
  }

  const finished = finishedRooms.get(roomCode);
  if (!finished) {
    return sendTo(ws, { type: 'error', message: 'No finished match to rematch' });
  }

  // Verify player was in the finished match
  if (!finished.players.find(p => p.userId === ws.user.id)) {
    return sendTo(ws, { type: 'error', message: 'You were not in this match' });
  }

  if (!rematchRequests.has(roomCode)) {
    rematchRequests.set(roomCode, new Set());
  }

  rematchRequests.get(roomCode).add(ws.user.id);

  // Broadcast updated ready list to all players in the room
  broadcastRematchReady(roomCode);
}

/** Broadcast rematch-ready state to all players in a room. */
function broadcastRematchReady(roomCode) {
  const room = rooms.get(roomCode);
  const finished = finishedRooms.get(roomCode);
  if (!room || !finished) return;

  const requests = rematchRequests.get(roomCode) || new Set();

  // Build ready player username list
  const readyPlayers = [];
  requests.forEach(userId => {
    const playerWs = room.players.get(userId);
    if (playerWs) {
      readyPlayers.push(playerWs.user.username);
    } else {
      const finishedPlayer = finished.players.find(p => p.userId === userId);
      if (finishedPlayer) readyPlayers.push(finishedPlayer.username);
    }
  });

  broadcastToRoom(roomCode, {
    type: 'rematch-ready',
    readyPlayers,
    totalPlayers: room.players.size,
    hostUsername: room.players.get(finished.hostId)?.user?.username || null,
  });
}

/** Handle host confirming rematch start. */
async function handleRematchStartConfirm(ws) {
  const roomCode = ws.roomCode;
  if (!roomCode) {
    return sendTo(ws, { type: 'error', message: 'No room to rematch in' });
  }

  const finished = finishedRooms.get(roomCode);
  if (!finished) {
    return sendTo(ws, { type: 'error', message: 'No finished match to rematch' });
  }

  // Only the host can start the rematch
  if (ws.user.id !== finished.hostId) {
    return sendTo(ws, { type: 'error', message: 'Only the host can start the rematch' });
  }

  const requests = rematchRequests.get(roomCode);
  if (!requests || requests.size < 2) {
    return sendTo(ws, { type: 'error', message: 'Need at least 2 ready players to start rematch' });
  }

  // Host must be ready
  if (!requests.has(ws.user.id)) {
    return sendTo(ws, { type: 'error', message: 'Host must be ready to start rematch' });
  }

  // Gather ready players (only those still connected in the room)
  const room = rooms.get(roomCode);
  if (!room) return;

  const readyPlayers = [];
  requests.forEach(userId => {
    const playerWs = room.players.get(userId);
    if (playerWs) {
      const fp = finished.players.find(p => p.userId === userId);
      readyPlayers.push({ userId, username: fp ? fp.username : playerWs.user.username });
    }
  });

  if (readyPlayers.length < 2) {
    return sendTo(ws, { type: 'error', message: 'Need at least 2 connected ready players' });
  }

  // Create a new room with same settings
  let newCode = crypto.randomBytes(3).toString('hex').toUpperCase();

  // CS52-7b: re-fetch live multiplayer config for the rematch — an admin
  // edit between matches should take effect on the next match.
  let rematchConfig;
  try {
    rematchConfig = await loadMultiplayerConfig();
  } catch {
    rematchConfig = {
      ...GAME_CONFIG_DEFAULTS.multiplayer,
      source: 'code_default',
    };
  }
  const rematchTotalRounds = rematchConfig.rounds;

  try {
    const db = await getDbAdapter();
    while (await db.get('SELECT 1 FROM matches WHERE room_code = ?', [newCode])) {
      newCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    }
    const matchId = crypto.randomUUID();
    await db.run(
      `INSERT INTO matches (id, room_code, status, total_rounds, max_players, created_by, host_user_id) VALUES (?, ?, 'waiting', ?, ?, ?, ?)`,
      [matchId, newCode, rematchTotalRounds, finished.maxPlayers, readyPlayers[0].userId, finished.hostId]
    );
    for (const p of readyPlayers) {
      await db.run(
        `INSERT INTO match_players (match_id, user_id) VALUES (?, ?)`,
        [matchId, p.userId]
      );
    }
  } catch {
    // Non-fatal — proceed with in-memory room
  }

  rooms.set(newCode, {
    players: new Map(),
    spectators: new Map(),
    hostId: finished.hostId,
    maxPlayers: finished.maxPlayers,
    droppedPlayers: new Map(),
    round: 0,
    totalRounds: rematchTotalRounds,
    roundTimerMs: rematchConfig.round_timer_ms,
    interRoundDelayMs: rematchConfig.inter_round_delay_ms,
    configSource: rematchConfig.source,
    scores: {},
    streaks: {},
    rankedSessionIds: {},
    roundsMeta: {},
    matchId: null,
    startedAtIso: null,
    configSnapshot: null,
    started: false,
    puzzles: [],
    answers: {},
    roundTimer: null,
    createdAt: Date.now(),
  });

  // Notify only ready players
  const readyUserIds = new Set(readyPlayers.map(p => p.userId));
  room.players.forEach((playerWs, userId) => {
    if (readyUserIds.has(userId)) {
      sendTo(playerWs, { type: 'rematch-start', roomCode: newCode });
    }
  });

  // Clean up old rematch state
  rematchRequests.delete(roomCode);
  finishedRooms.delete(roomCode);
  cleanupRoom(roomCode);
}

/** Send a message to a single WebSocket if open. */
function sendTo(ws, msg) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(msg));
  }
}

/** Send a message to all players and spectators in a room, optionally excluding one. */
function broadcastToRoom(roomCode, msg, excludeUserId) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const data = JSON.stringify(msg);
  room.players.forEach((ws, userId) => {
    if (userId !== excludeUserId && ws.readyState === 1) {
      ws.send(data);
    }
  });
  if (room.spectators) {
    room.spectators.forEach((ws, userId) => {
      if (userId !== excludeUserId && ws.readyState === 1) {
        ws.send(data);
      }
    });
  }
}

module.exports = { initWebSocket, rooms };
