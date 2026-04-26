/**
 * Spectator mode tests.
 * Tests: spectator join, blocked actions, count broadcasts, round forwarding,
 * disconnect, normal player join, and HTTP join status.
 */

const WebSocket = require('ws');
const { getAgent, getServer, setup, teardown, registerUser, setGameConfig } = require('./helper');

let tokens = {};

beforeAll(async () => {
  await setup();
  // CS52-7b: rounds is server-authoritative. Default to 5 (the canonical MP
  // shape) for most spectator tests; the short-match test below overrides
  // to 2 in its own scope.
  await setGameConfig('multiplayer', {
    rounds: 5,
    round_timer_ms: 5000,
    inter_round_delay_ms: 200,
  });
  for (const name of ['spec_host', 'spec_p2', 'spec_viewer']) {
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
    function cleanup() {
      clearTimeout(timeout);
      ws.removeListener('message', onFirstMsg);
      ws.removeListener('error', onError);
    }
    function onFirstMsg(data) {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch (err) {
        cleanup();
        ws.terminate();
        reject(err);
        return;
      }
      if (msg.type === 'connected') {
        cleanup();
        resolve(ws);
      }
    }
    function onError(err) {
      cleanup();
      ws.terminate();
      reject(err);
    }
    const timeout = setTimeout(() => {
      cleanup();
      ws.terminate();
      reject(new Error('WS connect timeout'));
    }, 5000);
    ws.on('message', onFirstMsg);
    ws.on('error', onError);
  });
}

function waitForMessage(ws, type, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === type) {
          clearTimeout(timeout);
          ws.removeListener('message', handler);
          resolve(msg);
        }
      } catch (err) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        reject(err);
      }
    };
    const timeout = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`Timeout waiting for "${type}"`));
    }, timeoutMs);
    ws.on('message', handler);
  });
}

async function createRoom(hostToken, totalRounds) {
  // CS52-7b: client-supplied totalRounds is now ignored by the server. Tests
  // that need a non-default rounds count must call `setGameConfig('multiplayer',
  // {...})` from helper.js to override the canonical config before creating.
  if (totalRounds !== undefined) {
    await setGameConfig('multiplayer', {
      rounds: totalRounds,
      round_timer_ms: 5000,
      inter_round_delay_ms: 200,
    });
  }
  const res = await getAgent()
    .post('/api/matches')
    .set('Authorization', `Bearer ${hostToken}`)
    .send({});
  return res.body.roomCode;
}

async function joinRoom(ws, roomCode) {
  const joinPromise = waitForMessage(ws, 'joined');
  ws.send(JSON.stringify({ type: 'join', roomCode }));
  return joinPromise;
}

/**
 * Set up a 2-player match that has already started.
 * Returns { ws1, ws2, roomCode }.
 */
async function setupActiveMatch() {
  const roomCode = await createRoom(tokens.spec_host);
  const ws1 = await connectWS(tokens.spec_host);
  const ws2 = await connectWS(tokens.spec_p2);

  await joinRoom(ws1, roomCode);
  await joinRoom(ws2, roomCode);

  // Set up listeners BEFORE sending start-match to avoid race
  const start1P = waitForMessage(ws1, 'match-start');
  const start2P = waitForMessage(ws2, 'match-start');
  const round1P = waitForMessage(ws1, 'round');
  const round2P = waitForMessage(ws2, 'round');

  ws1.send(JSON.stringify({ type: 'start-match' }));
  await Promise.all([start1P, start2P]);
  await Promise.all([round1P, round2P]);

  return { ws1, ws2, roomCode };
}

describe('Spectator Mode', () => {

  test('should join an active match as a spectator', async () => {
    const { ws1, ws2, roomCode } = await setupActiveMatch();
    const ws3 = await connectWS(tokens.spec_viewer);

    const specJoinedP = waitForMessage(ws3, 'spectator-joined');
    ws3.send(JSON.stringify({ type: 'join', roomCode }));
    const msg = await specJoinedP;

    expect(msg.type).toBe('spectator-joined');
    expect(msg.roomCode).toBe(roomCode);
    expect(msg.spectatorCount).toBe(1);
    expect(msg.scores).toBeDefined();
    expect(msg.players).toBeDefined();
    expect(msg.players.length).toBe(2);

    ws1.close();
    ws2.close();
    ws3.close();
  });

  test('should block spectators from answering', async () => {
    const { ws1, ws2, roomCode } = await setupActiveMatch();
    const ws3 = await connectWS(tokens.spec_viewer);

    const specJoinedP = waitForMessage(ws3, 'spectator-joined');
    ws3.send(JSON.stringify({ type: 'join', roomCode }));
    await specJoinedP;

    const errorP = waitForMessage(ws3, 'error');
    ws3.send(JSON.stringify({ type: 'answer', answerId: 'test', timeMs: 1000 }));
    const errorMsg = await errorP;

    expect(errorMsg.message).toBe('Spectators cannot perform this action');

    ws1.close();
    ws2.close();
    ws3.close();
  });

  test('should broadcast spectator count to all players', async () => {
    const { ws1, ws2, roomCode } = await setupActiveMatch();

    const ws3 = await connectWS(tokens.spec_viewer);
    const countP1 = waitForMessage(ws1, 'spectator-count');
    const countP2 = waitForMessage(ws2, 'spectator-count');
    const specJoinedP = waitForMessage(ws3, 'spectator-joined');

    ws3.send(JSON.stringify({ type: 'join', roomCode }));
    await specJoinedP;

    const [count1, count2] = await Promise.all([countP1, countP2]);
    expect(count1.count).toBe(1);
    expect(count2.count).toBe(1);

    ws1.close();
    ws2.close();
    ws3.close();
  });

  test('should forward round results to spectators', async () => {
    const { ws1, ws2, roomCode } = await setupActiveMatch();
    const ws3 = await connectWS(tokens.spec_viewer);

    const specJoinedP = waitForMessage(ws3, 'spectator-joined');
    ws3.send(JSON.stringify({ type: 'join', roomCode }));
    await specJoinedP;

    // Both players answer — spectator should receive roundResult
    const roundResultP = waitForMessage(ws3, 'roundResult');
    // The round was already received in setupActiveMatch; send answers
    ws1.send(JSON.stringify({ type: 'answer', answerId: 'any_answer', timeMs: 1000 }));
    ws2.send(JSON.stringify({ type: 'answer', answerId: 'any_answer', timeMs: 1000 }));

    const roundResult = await roundResultP;
    expect(roundResult.type).toBe('roundResult');

    ws1.close();
    ws2.close();
    ws3.close();
  });

  test('should update spectator count on spectator disconnect', async () => {
    const { ws1, ws2, roomCode } = await setupActiveMatch();
    const ws3 = await connectWS(tokens.spec_viewer);

    const specJoinedP = waitForMessage(ws3, 'spectator-joined');
    ws3.send(JSON.stringify({ type: 'join', roomCode }));
    await specJoinedP;

    // Wait for the initial spectator-count broadcast to players
    await waitForMessage(ws1, 'spectator-count');

    // Disconnect spectator and wait for updated count
    const countP = waitForMessage(ws1, 'spectator-count');
    ws3.close();
    const countMsg = await countP;

    expect(countMsg.count).toBe(0);

    ws1.close();
    ws2.close();
  });

  test('should allow joining a waiting room as a normal player', async () => {
    const roomCode = await createRoom(tokens.spec_host);
    const ws1 = await connectWS(tokens.spec_host);
    const ws3 = await connectWS(tokens.spec_viewer);

    await joinRoom(ws1, roomCode);

    // User3 should join as player (not spectator) since match hasn't started
    const joinedMsg = await joinRoom(ws3, roomCode);
    expect(joinedMsg.type).toBe('joined');

    ws1.close();
    ws3.close();
  });

  test('should block spectators from starting a match', async () => {
    const { ws1, ws2, roomCode } = await setupActiveMatch();
    const ws3 = await connectWS(tokens.spec_viewer);

    const specJoinedP = waitForMessage(ws3, 'spectator-joined');
    ws3.send(JSON.stringify({ type: 'join', roomCode }));
    await specJoinedP;

    const errorP = waitForMessage(ws3, 'error');
    ws3.send(JSON.stringify({ type: 'start-match' }));
    const errorMsg = await errorP;

    expect(errorMsg.message).toBe('Spectators cannot perform this action');

    ws1.close();
    ws2.close();
    ws3.close();
  });

  test('should block spectators from sending rematch requests', async () => {
    const { ws1, ws2, roomCode } = await setupActiveMatch();
    const ws3 = await connectWS(tokens.spec_viewer);

    const specJoinedP = waitForMessage(ws3, 'spectator-joined');
    ws3.send(JSON.stringify({ type: 'join', roomCode }));
    await specJoinedP;

    const errorP = waitForMessage(ws3, 'error');
    ws3.send(JSON.stringify({ type: 'rematch-request' }));
    const errorMsg = await errorP;

    expect(errorMsg.message).toBe('Spectators cannot perform this action');

    ws1.close();
    ws2.close();
    ws3.close();
  });

  test('should return spectator status from HTTP join for active matches', async () => {
    const { ws1, ws2, roomCode } = await setupActiveMatch();

    const res = await getAgent()
      .post('/api/matches/join')
      .set('Authorization', `Bearer ${tokens.spec_viewer}`)
      .send({ roomCode });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('spectator');
    expect(res.body.roomCode).toBe(roomCode);

    ws1.close();
    ws2.close();
  });

  test('should spectate a finished match and receive gameOver', async () => {
    // Use 2 rounds to keep test fast (3s delay per round)
    const roomCode = await createRoom(tokens.spec_host, 2);
    const ws1 = await connectWS(tokens.spec_host);
    const ws2 = await connectWS(tokens.spec_p2);

    await joinRoom(ws1, roomCode);
    await joinRoom(ws2, roomCode);

    const start1P = waitForMessage(ws1, 'match-start');
    const start2P = waitForMessage(ws2, 'match-start');
    const round1P = waitForMessage(ws1, 'round');
    const round2P = waitForMessage(ws2, 'round');

    ws1.send(JSON.stringify({ type: 'start-match' }));
    await Promise.all([start1P, start2P]);
    await Promise.all([round1P, round2P]);

    const totalRounds = 2;
    for (let i = 0; i < totalRounds; i++) {
      const resultType = i < totalRounds - 1 ? 'roundResult' : 'gameOver';
      const resultP1 = waitForMessage(ws1, resultType);
      const resultP2 = waitForMessage(ws2, resultType);

      ws1.send(JSON.stringify({ type: 'answer', answerId: 'some_answer', timeMs: 1000 }));
      ws2.send(JSON.stringify({ type: 'answer', answerId: 'some_answer', timeMs: 1000 }));

      await Promise.all([resultP1, resultP2]);

      if (i < totalRounds - 1) {
        await Promise.all([
          waitForMessage(ws1, 'round'),
          waitForMessage(ws2, 'round'),
        ]);
      }
    }

    // Match ended — room in rematch window. Spectator should get spectator-joined + gameOver
    const ws3 = await connectWS(tokens.spec_viewer);
    const specJoinedP = waitForMessage(ws3, 'spectator-joined');
    const gameOverP = waitForMessage(ws3, 'gameOver');

    ws3.send(JSON.stringify({ type: 'join', roomCode }));
    const specMsg = await specJoinedP;
    expect(specMsg.type).toBe('spectator-joined');

    const gameOverMsg = await gameOverP;
    expect(gameOverMsg.type).toBe('gameOver');
    expect(gameOverMsg.rankings).toBeDefined();
    expect(gameOverMsg.rankings.length).toBe(2);

    ws1.close();
    ws2.close();
    ws3.close();
  }, 30000);
});

