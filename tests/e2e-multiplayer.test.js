/**
 * E2E tests — Multiplayer flow.
 * Tests: register → create room → join room → WebSocket match flow.
 *
 * CS52-7b note: rounds / timer / inter-round delay are server-authoritative
 * (sourced from `game_configs.multiplayer`). To keep this suite fast, the
 * `multiplayer` config is overridden to small values in beforeAll via the
 * test helper — clients no longer pick rounds.
 */

const WebSocket = require('ws');
const { getAgent, getServer, setup, teardown, registerUser, setGameConfig } = require('./helper');

let hostToken, joinerToken;
const TEST_ROUNDS = 3;
const TEST_TIMER_MS = 5000;
const TEST_DELAY_MS = 200;

beforeAll(async () => {
  await setup();
  await setGameConfig('multiplayer', {
    rounds: TEST_ROUNDS,
    round_timer_ms: TEST_TIMER_MS,
    inter_round_delay_ms: TEST_DELAY_MS,
  });
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
  test('create room returns server-authoritative config', async () => {
    const agent = getAgent();
    const res = await agent
      .post('/api/matches')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ totalRounds: 999, maxPlayers: 4 }); // CS52-7b: totalRounds ignored

    expect(res.status).toBe(201);
    expect(res.body.roomCode).toMatch(/^[0-9A-F]{6}$/);
    // Server uses game_configs, NOT the client's 999.
    expect(res.body.totalRounds).toBe(TEST_ROUNDS);
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

  test('lobby-state shows players, host, and host can start match', async () => {
    const agent = getAgent();

    // Host creates room via API
    const createRes = await agent
      .post('/api/matches')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ totalRounds: 3 });
    const { roomCode } = createRes.body;

    // Host connects via WS and joins
    const hostWs = await connectWS(hostToken);

    // Start listening for lobby-state BEFORE sending join (avoids race)
    const hostLobby1Promise = waitForMessage(hostWs, 'lobby-state');
    hostWs.send(JSON.stringify({ type: 'join', roomCode }));
    const joinMsg = await waitForMessage(hostWs, 'joined');
    expect(joinMsg.roomCode).toBe(roomCode);

    // Host receives lobby-state showing themselves as host
    const hostLobby1 = await hostLobby1Promise;
    expect(hostLobby1.players).toHaveLength(1);
    expect(hostLobby1.players[0].username).toBe('mp_host');
    expect(hostLobby1.players[0].isHost).toBe(true);
    expect(hostLobby1.hostUsername).toBe('mp_host');

    // Joiner connects and joins — listen for lobby-state before sending
    const joinerWs = await connectWS(joinerToken);
    const joinerLobbyPromise = waitForMessage(joinerWs, 'lobby-state');
    const hostLobby2Promise = waitForMessage(hostWs, 'lobby-state');
    joinerWs.send(JSON.stringify({ type: 'join', roomCode }));
    await waitForMessage(joinerWs, 'joined');

    // Both should receive updated lobby-state with 2 players
    const joinerLobby = await joinerLobbyPromise;
    expect(joinerLobby.players).toHaveLength(2);
    const hostInList = joinerLobby.players.find(p => p.username === 'mp_host');
    const joinerInList = joinerLobby.players.find(p => p.username === 'mp_joiner');
    expect(hostInList.isHost).toBe(true);
    expect(joinerInList.isHost).toBe(false);
    expect(joinerLobby.hostUsername).toBe('mp_host');

    // Host also gets the updated lobby-state
    const hostLobby2 = await hostLobby2Promise;
    expect(hostLobby2.players).toHaveLength(2);

    // Host sends start-match
    const hostStartPromise = waitForMessage(hostWs, 'match-start');
    const joinerStartPromise = waitForMessage(joinerWs, 'match-start');
    hostWs.send(JSON.stringify({ type: 'start-match' }));

    // Both receive match-start
    const hostStart = await hostStartPromise;
    expect(hostStart.players).toContain('mp_host');
    expect(hostStart.players).toContain('mp_joiner');
    expect(hostStart.totalRounds).toBe(3);

    const joinerStart = await joinerStartPromise;
    expect(joinerStart.players).toContain('mp_host');
    expect(joinerStart.players).toContain('mp_joiner');

    hostWs.close();
    joinerWs.close();
  });

  test('non-host cannot start match', async () => {
    const agent = getAgent();

    const createRes = await agent
      .post('/api/matches')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ totalRounds: 3 });
    const { roomCode } = createRes.body;

    // Both join
    const hostWs = await connectWS(hostToken);
    hostWs.send(JSON.stringify({ type: 'join', roomCode }));
    await waitForMessage(hostWs, 'joined');

    const joinerWs = await connectWS(joinerToken);
    const joinerErrPromise = waitForMessage(joinerWs, 'error');
    joinerWs.send(JSON.stringify({ type: 'join', roomCode }));
    await waitForMessage(joinerWs, 'joined');

    // Joiner tries to start — should get error
    joinerWs.send(JSON.stringify({ type: 'start-match' }));
    const err = await joinerErrPromise;
    expect(err.message).toMatch(/host/i);

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

  test('full lifecycle: create → join → play all rounds → gameOver → rematch', async () => {
    const agent = getAgent();
    const totalRounds = 3;

    // 1. Host creates room
    const createRes = await agent
      .post('/api/matches')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ totalRounds, maxPlayers: 2 });
    expect(createRes.status).toBe(201);
    const { roomCode } = createRes.body;

    // 2. Joiner joins via API
    const joinRes = await agent
      .post('/api/matches/join')
      .set('Authorization', `Bearer ${joinerToken}`)
      .send({ roomCode });
    expect(joinRes.status).toBe(200);

    // 3. Both connect via WebSocket
    const hostWs = await connectWS(hostToken);
    const joinerWs = await connectWS(joinerToken);

    // 4. Both join the room
    const hostLobbyPromise = waitForMessage(hostWs, 'lobby-state');
    hostWs.send(JSON.stringify({ type: 'join', roomCode }));
    await waitForMessage(hostWs, 'joined');
    await hostLobbyPromise;

    const joinerLobbyPromise = waitForMessage(joinerWs, 'lobby-state');
    const hostLobby2Promise = waitForMessage(hostWs, 'lobby-state');
    joinerWs.send(JSON.stringify({ type: 'join', roomCode }));
    await waitForMessage(joinerWs, 'joined');
    await joinerLobbyPromise;
    await hostLobby2Promise;

    // 5. Host starts match
    const hostStartPromise = waitForMessage(hostWs, 'match-start');
    const joinerStartPromise = waitForMessage(joinerWs, 'match-start');
    hostWs.send(JSON.stringify({ type: 'start-match' }));
    const hostStart = await hostStartPromise;
    await joinerStartPromise;
    expect(hostStart.totalRounds).toBe(totalRounds);

    // 6. Play through all rounds
    for (let round = 0; round < totalRounds; round++) {
      const hostRoundPromise = waitForMessage(hostWs, 'round');
      const joinerRoundPromise = waitForMessage(joinerWs, 'round');
      await Promise.all([hostRoundPromise, joinerRoundPromise]);

      const hostResultPromise = waitForMessage(hostWs, 'roundResult');
      const joinerResultPromise = waitForMessage(joinerWs, 'roundResult');
      hostWs.send(JSON.stringify({ type: 'answer', answerId: 999, timeMs: 1000 }));
      joinerWs.send(JSON.stringify({ type: 'answer', answerId: 999, timeMs: 1000 }));
      await Promise.all([hostResultPromise, joinerResultPromise]);
    }

    // 7. Both receive gameOver
    const hostGameOver = await waitForMessage(hostWs, 'gameOver');
    const joinerGameOver = await waitForMessage(joinerWs, 'gameOver');
    expect(hostGameOver.rankings).toBeDefined();
    expect(joinerGameOver.rankings).toBeDefined();

    // 8. Rematch flow: both ready up
    const hostReadyPromise = waitForMessage(hostWs, 'rematch-ready');
    const joinerReadyPromise = waitForMessage(joinerWs, 'rematch-ready');
    hostWs.send(JSON.stringify({ type: 'rematch-request' }));
    await Promise.all([hostReadyPromise, joinerReadyPromise]);

    const hostReady2Promise = waitForMessage(hostWs, 'rematch-ready');
    const joinerReady2Promise = waitForMessage(joinerWs, 'rematch-ready');
    joinerWs.send(JSON.stringify({ type: 'rematch-request' }));
    const hostReady2 = await hostReady2Promise;
    await joinerReady2Promise;
    expect(hostReady2.readyPlayers).toHaveLength(2);

    // 9. Host starts rematch
    const hostRematchPromise = waitForMessage(hostWs, 'rematch-start');
    const joinerRematchPromise = waitForMessage(joinerWs, 'rematch-start');
    hostWs.send(JSON.stringify({ type: 'rematch-start-confirm' }));
    const hostRematch = await hostRematchPromise;
    const joinerRematch = await joinerRematchPromise;

    // 10. Verify rematch-start has new room code
    expect(hostRematch.roomCode).toBeTruthy();
    expect(hostRematch.roomCode).toMatch(/^[0-9A-F]{6}$/);
    expect(hostRematch.roomCode).not.toBe(roomCode);
    expect(joinerRematch.roomCode).toBe(hostRematch.roomCode);

    hostWs.close();
    joinerWs.close();
  });
});

