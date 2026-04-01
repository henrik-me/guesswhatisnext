/**
 * Spectator mode tests.
 * Tests: spectator join/leave, read-only enforcement, spectator count broadcasts,
 * and the lobby vs active match join behavior.
 */

const WebSocket = require('ws');
const { getAgent, getServer, setup, teardown, registerUser } = require('./helper');

let tokens = {};

beforeAll(async () => {
  await setup();
  for (const name of ['spec_host', 'spec_p2', 'spec_viewer1', 'spec_viewer2']) {
    const { token } = await registerUser(name, 'password123');
    tokens[name] = token;
  }
}, 30000);

afterAll(teardown);

function getServerAddr() {
  const addr = getServer().address();
  return `127.0.0.1:${addr.port}`;
}

function connectWS(token) {
  return new Promise((resolve, reject) => {
    const addr = getServerAddr();
    const ws = new WebSocket(`ws://${addr}/ws?token=${encodeURIComponent(token)}`);
    const timeout = setTimeout(() => reject(new Error('WS connect timeout')), 5000);
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

function waitForMessage(ws, type, timeoutMs = 10000) {
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

async function createRoom(hostToken, maxPlayers = 2, totalRounds = 3) {
  const res = await getAgent()
    .post('/api/matches')
    .set('Authorization', `Bearer ${hostToken}`)
    .send({ maxPlayers, totalRounds });
  return res.body.roomCode;
}

async function joinRoom(ws, roomCode) {
  const joinPromise = waitForMessage(ws, 'joined');
  ws.send(JSON.stringify({ type: 'join', roomCode }));
  return joinPromise;
}

/** Start a 2-player match and return { hostWs, joinerWs, roomCode }. */
async function setupActiveMatch(totalRounds = 3) {
  const roomCode = await createRoom(tokens.spec_host, 2, totalRounds);

  const hostWs = await connectWS(tokens.spec_host);
  const joinerWs = await connectWS(tokens.spec_p2);

  // Both join — set up listeners before sending to avoid races
  const hostLobbyPromise = waitForMessage(hostWs, 'lobby-state');
  await joinRoom(hostWs, roomCode);
  await hostLobbyPromise;

  const joinerLobbyPromise = waitForMessage(joinerWs, 'lobby-state');
  const hostLobby2Promise = waitForMessage(hostWs, 'lobby-state');
  await joinRoom(joinerWs, roomCode);
  await joinerLobbyPromise;
  await hostLobby2Promise;

  // Set up all listeners BEFORE starting to avoid race conditions
  const hostStartPromise = waitForMessage(hostWs, 'match-start');
  const joinerStartPromise = waitForMessage(joinerWs, 'match-start');
  const hostRoundPromise = waitForMessage(hostWs, 'round');
  const joinerRoundPromise = waitForMessage(joinerWs, 'round');

  hostWs.send(JSON.stringify({ type: 'start-match' }));

  await hostStartPromise;
  await joinerStartPromise;
  await hostRoundPromise;
  await joinerRoundPromise;

  return { hostWs, joinerWs, roomCode };
}

describe('Spectator Mode', () => {

  test('joining an active match assigns spectator role with game state', async () => {
    const { hostWs, joinerWs, roomCode } = await setupActiveMatch();

    const spectatorWs = await connectWS(tokens.spec_viewer1);
    spectatorWs.send(JSON.stringify({ type: 'join', roomCode }));
    const spectatorMsg = await waitForMessage(spectatorWs, 'spectator-joined');

    expect(spectatorMsg.roomCode).toBe(roomCode);
    expect(spectatorMsg.spectatorCount).toBe(1);
    expect(spectatorMsg.currentRound).toBeDefined();
    expect(spectatorMsg.totalRounds).toBe(3);
    expect(spectatorMsg.scores).toBeDefined();
    expect(spectatorMsg.players).toBeDefined();
    expect(spectatorMsg.players.length).toBe(2);

    spectatorWs.close();
    hostWs.close();
    joinerWs.close();
  });

  test('spectator cannot submit answers', async () => {
    const { hostWs, joinerWs, roomCode } = await setupActiveMatch();

    const spectatorWs = await connectWS(tokens.spec_viewer1);
    spectatorWs.send(JSON.stringify({ type: 'join', roomCode }));
    await waitForMessage(spectatorWs, 'spectator-joined');

    spectatorWs.send(JSON.stringify({ type: 'answer', answerId: 'a', timeMs: 1000 }));
    const errorMsg = await waitForMessage(spectatorWs, 'error');
    expect(errorMsg.message).toMatch(/spectator/i);

    spectatorWs.close();
    hostWs.close();
    joinerWs.close();
  });

  test('spectator count is broadcast to all room members', async () => {
    const { hostWs, joinerWs, roomCode } = await setupActiveMatch();

    // Listen BEFORE spectator joins
    const hostCountPromise = waitForMessage(hostWs, 'spectator-count');
    const joinerCountPromise = waitForMessage(joinerWs, 'spectator-count');

    const spectatorWs = await connectWS(tokens.spec_viewer1);
    spectatorWs.send(JSON.stringify({ type: 'join', roomCode }));
    await waitForMessage(spectatorWs, 'spectator-joined');

    const hostCount = await hostCountPromise;
    const joinerCount = await joinerCountPromise;
    expect(hostCount.count).toBe(1);
    expect(joinerCount.count).toBe(1);

    // Second spectator joins — listen before joining
    const hostCount2Promise = waitForMessage(hostWs, 'spectator-count');
    const spectator1Count2Promise = waitForMessage(spectatorWs, 'spectator-count');

    const spectator2Ws = await connectWS(tokens.spec_viewer2);
    spectator2Ws.send(JSON.stringify({ type: 'join', roomCode }));
    await waitForMessage(spectator2Ws, 'spectator-joined');

    const hostCount2 = await hostCount2Promise;
    const spectator1Count2 = await spectator1Count2Promise;
    expect(hostCount2.count).toBe(2);
    expect(spectator1Count2.count).toBe(2);

    spectatorWs.close();
    spectator2Ws.close();
    hostWs.close();
    joinerWs.close();
  });

  test('spectator receives round results and game broadcasts', async () => {
    const { hostWs, joinerWs, roomCode } = await setupActiveMatch();

    const spectatorWs = await connectWS(tokens.spec_viewer1);
    spectatorWs.send(JSON.stringify({ type: 'join', roomCode }));
    await waitForMessage(spectatorWs, 'spectator-joined');

    const spectatorResultPromise = waitForMessage(spectatorWs, 'roundResult');
    hostWs.send(JSON.stringify({ type: 'answer', answerId: 'a', timeMs: 1000 }));
    joinerWs.send(JSON.stringify({ type: 'answer', answerId: 'a', timeMs: 1000 }));

    const result = await spectatorResultPromise;
    expect(result.type).toBe('roundResult');
    expect(result.scores).toBeDefined();

    spectatorWs.close();
    hostWs.close();
    joinerWs.close();
  });

  test('spectator disconnect reduces count and notifies room', async () => {
    const { hostWs, joinerWs, roomCode } = await setupActiveMatch();

    const spectatorWs = await connectWS(tokens.spec_viewer1);

    // Listen for count BEFORE spectator joins
    const hostCount1Promise = waitForMessage(hostWs, 'spectator-count');
    spectatorWs.send(JSON.stringify({ type: 'join', roomCode }));
    await waitForMessage(spectatorWs, 'spectator-joined');
    await hostCount1Promise;

    // Now listen for the count update when spectator leaves
    const hostCount2Promise = waitForMessage(hostWs, 'spectator-count');
    spectatorWs.close();

    const updatedCount = await hostCount2Promise;
    expect(updatedCount.count).toBe(0);

    hostWs.close();
    joinerWs.close();
  });

  test('joining a waiting room adds as player, not spectator', async () => {
    const roomCode = await createRoom(tokens.spec_host, 4, 3);
    const hostWs = await connectWS(tokens.spec_host);
    await joinRoom(hostWs, roomCode);

    const viewerWs = await connectWS(tokens.spec_viewer1);
    const joinedPromise = waitForMessage(viewerWs, 'joined');
    viewerWs.send(JSON.stringify({ type: 'join', roomCode }));
    const joinMsg = await joinedPromise;

    expect(joinMsg.type).toBe('joined');
    expect(joinMsg.roomCode).toBe(roomCode);
    expect(joinMsg.playerCount).toBe(2);

    hostWs.close();
    viewerWs.close();
  });

  test('spectator cannot start a match', async () => {
    const { hostWs, joinerWs, roomCode } = await setupActiveMatch();

    const spectatorWs = await connectWS(tokens.spec_viewer1);
    spectatorWs.send(JSON.stringify({ type: 'join', roomCode }));
    await waitForMessage(spectatorWs, 'spectator-joined');

    spectatorWs.send(JSON.stringify({ type: 'start-match' }));
    const errorMsg = await waitForMessage(spectatorWs, 'error');
    expect(errorMsg.message).toMatch(/spectator/i);

    spectatorWs.close();
    hostWs.close();
    joinerWs.close();
  });

  test('spectator cannot send rematch request', async () => {
    const { hostWs, joinerWs, roomCode } = await setupActiveMatch();

    const spectatorWs = await connectWS(tokens.spec_viewer1);
    spectatorWs.send(JSON.stringify({ type: 'join', roomCode }));
    await waitForMessage(spectatorWs, 'spectator-joined');

    spectatorWs.send(JSON.stringify({ type: 'rematch-request' }));
    const errorMsg = await waitForMessage(spectatorWs, 'error');
    expect(errorMsg.message).toMatch(/spectator/i);

    spectatorWs.close();
    hostWs.close();
    joinerWs.close();
  });

  test('HTTP join returns spectator status for active match', async () => {
    const { hostWs, joinerWs, roomCode } = await setupActiveMatch();

    const res = await getAgent()
      .post('/api/matches/join')
      .set('Authorization', `Bearer ${tokens.spec_viewer1}`)
      .send({ roomCode });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('spectator');
    expect(res.body.roomCode).toBe(roomCode);

    hostWs.close();
    joinerWs.close();
  });
});
