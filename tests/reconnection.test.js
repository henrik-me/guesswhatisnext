/**
 * Reconnection & edge-case tests for N-player matches.
 * Tests: reconnect mid-match, player-disconnected notification, host transfer on forfeit,
 *        all-but-one disconnect → last player wins.
 */

const WebSocket = require('ws');
const { getAgent, getServer, setup, teardown, registerUser } = require('./helper');

let tokens = {};

beforeAll(async () => {
  await setup();
  for (const name of ['rc_host', 'rc_p2', 'rc_p3', 'rc_p4']) {
    const { token } = await registerUser(name, 'password123');
    tokens[name] = token;
  }
});

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

async function createRoom(hostToken, maxPlayers, totalRounds = 3) {
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

async function startMatchAndGetRound(hostWs, playerSockets, _roomCode) {
  const startPromises = playerSockets.map(ws => waitForMessage(ws, 'match-start'));
  hostWs.send(JSON.stringify({ type: 'start-match' }));
  await Promise.all(startPromises);

  const roundPromises = playerSockets.map(ws => waitForMessage(ws, 'round'));
  return Promise.all(roundPromises);
}

describe('Reconnection & Edge Cases', () => {

  test('player disconnects and reconnects mid-match: gets full state', async () => {
    const roomCode = await createRoom(tokens.rc_host, 3, 3);

    const hostWs = await connectWS(tokens.rc_host);
    const p2Ws = await connectWS(tokens.rc_p2);
    const p3Ws = await connectWS(tokens.rc_p3);

    await joinRoom(hostWs, roomCode);
    await joinRoom(p2Ws, roomCode);
    await joinRoom(p3Ws, roomCode);

    // Start match and play first round
    const allSockets = [hostWs, p2Ws, p3Ws];
    const rounds = await startMatchAndGetRound(hostWs, allSockets, roomCode);

    // All answer round 0
    const resultPromises = allSockets.map(ws => waitForMessage(ws, 'roundResult'));
    hostWs.send(JSON.stringify({ type: 'answer', answerId: rounds[0].puzzle.answer, timeMs: 2000 }));
    p2Ws.send(JSON.stringify({ type: 'answer', answerId: rounds[1].puzzle.answer, timeMs: 2000 }));
    p3Ws.send(JSON.stringify({ type: 'answer', answerId: rounds[2].puzzle.answer, timeMs: 2000 }));
    await Promise.all(resultPromises);

    // P3 disconnects
    const hostDcP = waitForMessage(hostWs, 'player-disconnected');
    const p2DcP = waitForMessage(p2Ws, 'player-disconnected');
    p3Ws.close();
    const dcMsg = await hostDcP;
    const dcMsgP2 = await p2DcP;

    expect(dcMsg.username).toBe('rc_p3');
    expect(dcMsg.remainingCount).toBe(2);
    expect(dcMsgP2.username).toBe('rc_p3');

    // P3 reconnects with a new WS connection
    const p3WsNew = await connectWS(tokens.rc_p3);
    const reconnectedP = waitForMessage(p3WsNew, 'reconnected');
    const hostReconnP = waitForMessage(hostWs, 'player-reconnected');
    p3WsNew.send(JSON.stringify({ type: 'join', roomCode }));

    const reconnMsg = await reconnectedP;
    const hostReconnMsg = await hostReconnP;

    // Verify full state in reconnected message
    expect(reconnMsg.roomCode).toBe(roomCode);
    expect(reconnMsg.currentRound).toBeDefined();
    expect(reconnMsg.totalRounds).toBe(3);
    expect(reconnMsg.players).toBeDefined();
    expect(reconnMsg.players.length).toBeGreaterThanOrEqual(3);

    // All players should be listed with scores and connected status
    const p3Entry = reconnMsg.players.find(p => p.username === 'rc_p3');
    expect(p3Entry).toBeDefined();
    expect(p3Entry.connected).toBe(true);
    expect(typeof p3Entry.score).toBe('number');

    // droppedPlayers should be empty now (p3 reconnected)
    expect(reconnMsg.droppedPlayers).toEqual([]);

    // Host got player-reconnected notification
    expect(hostReconnMsg.username).toBe('rc_p3');
    expect(hostReconnMsg.remainingCount).toBe(3);

    hostWs.close();
    p2Ws.close();
    p3WsNew.close();
  }, 30000);

  test('player disconnects in N-player: remaining players get notification with correct count', async () => {
    const roomCode = await createRoom(tokens.rc_host, 4, 2);

    const hostWs = await connectWS(tokens.rc_host);
    const p2Ws = await connectWS(tokens.rc_p2);
    const p3Ws = await connectWS(tokens.rc_p3);
    const p4Ws = await connectWS(tokens.rc_p4);

    await joinRoom(hostWs, roomCode);
    await joinRoom(p2Ws, roomCode);
    await joinRoom(p3Ws, roomCode);
    await joinRoom(p4Ws, roomCode);

    // Start match
    const allSockets = [hostWs, p2Ws, p3Ws, p4Ws];
    await startMatchAndGetRound(hostWs, allSockets, roomCode);

    // P4 disconnects — remaining 3 should all get notification
    const hostDcP = waitForMessage(hostWs, 'player-disconnected');
    const p2DcP = waitForMessage(p2Ws, 'player-disconnected');
    const p3DcP = waitForMessage(p3Ws, 'player-disconnected');
    p4Ws.close();

    const [hostDc, p2Dc, p3Dc] = await Promise.all([hostDcP, p2DcP, p3DcP]);

    expect(hostDc.username).toBe('rc_p4');
    expect(hostDc.remainingCount).toBe(3);
    expect(p2Dc.username).toBe('rc_p4');
    expect(p2Dc.remainingCount).toBe(3);
    expect(p3Dc.username).toBe('rc_p4');
    expect(p3Dc.remainingCount).toBe(3);

    // Now P3 disconnects — remaining 2 get notification
    const hostDcP2 = waitForMessage(hostWs, 'player-disconnected');
    const p2DcP2 = waitForMessage(p2Ws, 'player-disconnected');
    p3Ws.close();

    const [hostDc2, p2Dc2] = await Promise.all([hostDcP2, p2DcP2]);
    expect(hostDc2.username).toBe('rc_p3');
    expect(hostDc2.remainingCount).toBe(2);
    expect(p2Dc2.username).toBe('rc_p3');
    expect(p2Dc2.remainingCount).toBe(2);

    hostWs.close();
    p2Ws.close();
  }, 30000);

  test('host disconnect + forfeit: host transfers to next connected player', async () => {
    // Override RECONNECT_WINDOW_MS to be short for this test
    // We achieve this by having a 3-player match where host disconnects,
    // then someone else disconnects so only 1 remains → forfeit triggers fast
    const roomCode = await createRoom(tokens.rc_host, 3, 3);

    const hostWs = await connectWS(tokens.rc_host);
    const p2Ws = await connectWS(tokens.rc_p2);
    const p3Ws = await connectWS(tokens.rc_p3);

    await joinRoom(hostWs, roomCode);
    await joinRoom(p2Ws, roomCode);
    await joinRoom(p3Ws, roomCode);

    const allSockets = [hostWs, p2Ws, p3Ws];
    await startMatchAndGetRound(hostWs, allSockets, roomCode);

    // Host disconnects
    const p2DcP = waitForMessage(p2Ws, 'player-disconnected');
    const p3DcP = waitForMessage(p3Ws, 'player-disconnected');
    hostWs.close();

    const p2Dc = await p2DcP;
    const p3Dc = await p3DcP;
    expect(p2Dc.username).toBe('rc_host');
    expect(p3Dc.username).toBe('rc_host');

    // P3 also disconnects → P2 is last one standing → should get gameOver
    const p2GameOverP = waitForMessage(p2Ws, 'gameOver');
    p3Ws.close();

    const gameOver = await p2GameOverP;
    expect(gameOver.forfeit).toBe(true);
    expect(gameOver.winner).toBe('rc_p2');
    expect(gameOver.totalPlayers).toBe(3);

    p2Ws.close();
  }, 30000);

  test('all-but-one disconnect: last player gets win', async () => {
    const roomCode = await createRoom(tokens.rc_host, 4, 3);

    const hostWs = await connectWS(tokens.rc_host);
    const p2Ws = await connectWS(tokens.rc_p2);
    const p3Ws = await connectWS(tokens.rc_p3);
    const p4Ws = await connectWS(tokens.rc_p4);

    await joinRoom(hostWs, roomCode);
    await joinRoom(p2Ws, roomCode);
    await joinRoom(p3Ws, roomCode);
    await joinRoom(p4Ws, roomCode);

    const allSockets = [hostWs, p2Ws, p3Ws, p4Ws];
    await startMatchAndGetRound(hostWs, allSockets, roomCode);

    // P4 disconnects
    p4Ws.close();
    await waitForMessage(hostWs, 'player-disconnected');

    // P3 disconnects
    p3Ws.close();
    await waitForMessage(hostWs, 'player-disconnected');

    // P2 disconnects — host is last one standing
    const hostGameOverP = waitForMessage(hostWs, 'gameOver');
    p2Ws.close();

    const gameOver = await hostGameOverP;
    expect(gameOver.forfeit).toBe(true);
    expect(gameOver.winner).toBe('rc_host');
    expect(gameOver.totalPlayers).toBe(4);
    expect(gameOver.rankings).toHaveLength(4);

    // Host should be rank 1
    const hostRank = gameOver.rankings.find(r => r.username === 'rc_host');
    expect(hostRank.rank).toBe(1);
    expect(hostRank.isYou).toBe(true);

    hostWs.close();
  }, 30000);
});
