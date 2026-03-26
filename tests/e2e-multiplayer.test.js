/**
 * E2E tests — Multiplayer flow.
 * Tests: register → create room → join room → WebSocket match flow.
 */

const WebSocket = require('ws');
const { getAgent, getServer, setup, teardown, registerUser } = require('./helper');

let hostToken, joinerToken;

beforeAll(async () => {
  await setup();
  const host = await registerUser('mp_host', 'password123');
  const joiner = await registerUser('mp_joiner', 'password123');
  hostToken = host.token;
  joinerToken = joiner.token;
});

afterAll(teardown);

/** Helper: get the server's listening address as host:port. */
function getServerAddr() {
  const addr = getServer().address();
  return `127.0.0.1:${addr.port}`;
}

/** Helper: connect a WebSocket and wait for the initial "connected" message. */
function connectWS(token) {
  return new Promise((resolve, reject) => {
    const addr = getServerAddr();
    const ws = new WebSocket(`ws://${addr}/ws?token=${encodeURIComponent(token)}`);
    const timeout = setTimeout(() => reject(new Error('WS connect timeout')), 5000);

    // Listen for the "connected" message that the server sends immediately
    ws.on('message', function onFirstMsg(data) {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'connected') {
        clearTimeout(timeout);
        ws.removeListener('message', onFirstMsg);
        ws._connectedMsg = msg;
        resolve(ws);
      }
    });
    ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

/** Helper: wait for a specific WS message type. */
function waitForMessage(ws, type, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for "${type}"`)), timeoutMs);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

describe('Multiplayer E2E', () => {
  test('create room returns valid room code', async () => {
    const agent = getAgent();
    const res = await agent
      .post('/api/matches')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ totalRounds: 3, maxPlayers: 4 });

    expect(res.status).toBe(201);
    expect(res.body.roomCode).toMatch(/^[0-9A-F]{6}$/);
    expect(res.body.totalRounds).toBe(3);
    expect(res.body.maxPlayers).toBe(4);
  });

  test('join room with valid code', async () => {
    const agent = getAgent();

    // Host creates room
    const createRes = await agent
      .post('/api/matches')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ totalRounds: 3 });
    const { roomCode } = createRes.body;

    // Joiner joins
    const joinRes = await agent
      .post('/api/matches/join')
      .set('Authorization', `Bearer ${joinerToken}`)
      .send({ roomCode });

    expect(joinRes.status).toBe(200);
    expect(joinRes.body.roomCode).toBe(roomCode);
  });

  test('stale token returns 401 on room create', async () => {
    const agent = getAgent();
    const jwt = require('jsonwebtoken');
    const fakeToken = jwt.sign(
      { id: 99999, username: 'ghost', role: 'user' },
      process.env.JWT_SECRET || 'gwn-dev-secret-change-in-production',
      { expiresIn: '1h' }
    );

    const res = await agent
      .post('/api/matches')
      .set('Authorization', `Bearer ${fakeToken}`)
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('room capacity enforced', async () => {
    const agent = getAgent();

    // Create room with maxPlayers=2
    const createRes = await agent
      .post('/api/matches')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ maxPlayers: 2 });
    const { roomCode } = createRes.body;

    // Joiner joins (fills the room)
    await agent
      .post('/api/matches/join')
      .set('Authorization', `Bearer ${joinerToken}`)
      .send({ roomCode });

    // Third player tries to join — should fail
    const { token: thirdToken } = await registerUser('mp_third', 'password123');
    const fullRes = await agent
      .post('/api/matches/join')
      .set('Authorization', `Bearer ${thirdToken}`)
      .send({ roomCode });

    expect(fullRes.status).toBe(400);
    expect(fullRes.body.error).toMatch(/full/i);
  });

  test('WebSocket connect and receive connected message', async () => {
    const ws = await connectWS(hostToken);
    expect(ws._connectedMsg.user.username).toBe('mp_host');
    ws.close();
  });

  test('WebSocket join room and receive lobby state', async () => {
    const agent = getAgent();

    // Create room via API
    const createRes = await agent
      .post('/api/matches')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ totalRounds: 3 });
    const { roomCode } = createRes.body;

    // Host connects via WS (connectWS already waits for 'connected')
    const hostWs = await connectWS(hostToken);

    // Host joins room
    hostWs.send(JSON.stringify({ type: 'join', roomCode }));
    const joinMsg = await waitForMessage(hostWs, 'joined');
    expect(joinMsg.roomCode).toBe(roomCode);

    // Joiner connects and joins
    const joinerWs = await connectWS(joinerToken);
    joinerWs.send(JSON.stringify({ type: 'join', roomCode }));

    // Both should receive lobby-state or player-joined
    const joinerJoin = await waitForMessage(joinerWs, 'joined');
    expect(joinerJoin.roomCode).toBe(roomCode);

    hostWs.close();
    joinerWs.close();
  });

  test('multiplayer leaderboard returns data', async () => {
    const agent = getAgent();
    const res = await agent
      .get('/api/scores/leaderboard/multiplayer')
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.leaderboard)).toBe(true);
    expect(res.body.mode).toBe('multiplayer');
  });

  test('match history returns for user', async () => {
    const agent = getAgent();
    const res = await agent
      .get('/api/matches/history')
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
  });
});
