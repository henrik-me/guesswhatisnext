/**
 * WebSocket handler for real-time multiplayer matches.
 * Manages rooms, puzzle sync, and round scoring.
 */

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

/** Active rooms: Map<roomCode, RoomState> */
const rooms = new Map();

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

  wss.on('close', () => clearInterval(heartbeat));

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
    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
  }
}

/** Handle a player joining a room. */
function handleJoin(ws, roomCode) {
  if (!roomCode) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room code required' }));
    return;
  }

  const code = roomCode.toUpperCase();
  ws.roomCode = code;

  if (!rooms.has(code)) {
    rooms.set(code, {
      players: new Map(),
      round: 0,
      totalRounds: 5,
      scores: {},
      started: false,
    });
  }

  const room = rooms.get(code);
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
}

/** Handle a player's answer. Placeholder for step 18 (head-to-head engine). */
function handleAnswer(ws, msg) {
  // Will be fully implemented in step 18
  ws.send(JSON.stringify({ type: 'answer-received', answerId: msg.answerId }));
}

/** Handle a player disconnecting. */
function handleDisconnect(ws) {
  if (!ws.roomCode) return;

  const room = rooms.get(ws.roomCode);
  if (!room) return;

  room.players.delete(ws.user.id);

  broadcastToRoom(ws.roomCode, {
    type: 'player-left',
    username: ws.user.username,
    playerCount: room.players.size,
  });

  // Clean up empty rooms
  if (room.players.size === 0) {
    rooms.delete(ws.roomCode);
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
