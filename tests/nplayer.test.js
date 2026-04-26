/**
 * N-Player match logic tests.
 * Tests: 3-player full match flow, disconnect mid-match, last-player-standing.
 */

const WebSocket = require('ws');
const { getAgent, getServer, setup, teardown, registerUser, setGameConfig } = require('./helper');

let tokens = {};

beforeAll(async () => {
  await setup();
  // CS52-7b: rounds is server-authoritative. Override to 3 to keep tests fast.
  await setGameConfig('multiplayer', {
    rounds: 3,
    round_timer_ms: 5000,
    inter_round_delay_ms: 200,
  });
  // Register players for N-player tests
  for (const name of ['np_host', 'np_p2', 'np_p3', 'np_p4']) {
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
  // CS52-7b: client-supplied totalRounds is ignored. Override server config.
  await setGameConfig('multiplayer', {
    rounds: totalRounds,
    round_timer_ms: 5000,
    inter_round_delay_ms: 200,
  });
  const res = await getAgent()
    .post('/api/matches')
    .set('Authorization', `Bearer ${hostToken}`)
    .send({ maxPlayers });
  return res.body.roomCode;
}

async function joinRoom(ws, roomCode) {
  const joinPromise = waitForMessage(ws, 'joined');
  ws.send(JSON.stringify({ type: 'join', roomCode }));
  return joinPromise;
}

describe('N-Player Match Logic', () => {

  test('3-player match: full round flow and final rankings', async () => {
    const roomCode = await createRoom(tokens.np_host, 3, 2);

    // Connect all 3 players
    const hostWs = await connectWS(tokens.np_host);
    const p2Ws = await connectWS(tokens.np_p2);
    const p3Ws = await connectWS(tokens.np_p3);

    // Join room — listen for lobby-state BEFORE sending join
    await joinRoom(hostWs, roomCode);
    await joinRoom(p2Ws, roomCode);
    const p3LobbyP = waitForMessage(p3Ws, 'lobby-state');
    await joinRoom(p3Ws, roomCode);

    // Verify lobby state shows 3 players
    const lobbyState = await p3LobbyP;
    expect(lobbyState.players).toHaveLength(3);

    // Host starts match
    const hostStartP = waitForMessage(hostWs, 'match-start');
    const p2StartP = waitForMessage(p2Ws, 'match-start');
    const p3StartP = waitForMessage(p3Ws, 'match-start');
    hostWs.send(JSON.stringify({ type: 'start-match' }));

    const hostStart = await hostStartP;
    await p2StartP;
    await p3StartP;
    expect(hostStart.players).toHaveLength(3);
    expect(hostStart.players).toContain('np_host');
    expect(hostStart.players).toContain('np_p2');
    expect(hostStart.players).toContain('np_p3');

    // Play through 2 rounds
    for (let round = 0; round < 2; round++) {
      const hostRound = await waitForMessage(hostWs, 'round');
      const p2Round = await waitForMessage(p2Ws, 'round');
      const p3Round = await waitForMessage(p3Ws, 'round');

      expect(hostRound.roundNum).toBe(round);
      expect(p2Round.roundNum).toBe(round);
      expect(p3Round.roundNum).toBe(round);

      // All 3 players answer (any answer)
      const hostResultP = waitForMessage(hostWs, 'roundResult');
      const p2ResultP = waitForMessage(p2Ws, 'roundResult');
      const p3ResultP = waitForMessage(p3Ws, 'roundResult');

      hostWs.send(JSON.stringify({ type: 'answer', answerId: hostRound.puzzle.options[0], timeMs: 2000 }));
      p2Ws.send(JSON.stringify({ type: 'answer', answerId: p2Round.puzzle.options[1], timeMs: 3000 }));
      p3Ws.send(JSON.stringify({ type: 'answer', answerId: p3Round.puzzle.options[2], timeMs: 4000 }));

      const hostResult = await hostResultP;
      await p2ResultP;
      await p3ResultP;

      // roundResult scores should have all 3 player entries
      expect(Object.keys(hostResult.scores)).toHaveLength(3);
      expect(hostResult.scores).toHaveProperty('np_host');
      expect(hostResult.scores).toHaveProperty('np_p2');
      expect(hostResult.scores).toHaveProperty('np_p3');
    }

    // Wait for gameOver
    const hostGameOver = await waitForMessage(hostWs, 'gameOver');
    const p2GameOver = await waitForMessage(p2Ws, 'gameOver');
    const p3GameOver = await waitForMessage(p3Ws, 'gameOver');

    // Verify N-player gameOver structure
    expect(hostGameOver.totalPlayers).toBe(3);
    expect(hostGameOver.rankings).toHaveLength(3);
    expect(hostGameOver.yourRank).toBeGreaterThanOrEqual(1);
    expect(hostGameOver.yourRank).toBeLessThanOrEqual(3);

    // Verify isYou is personalized
    const hostSelf = hostGameOver.rankings.find(r => r.isYou);
    expect(hostSelf).toBeDefined();
    expect(hostSelf.username).toBe('np_host');

    const p2Self = p2GameOver.rankings.find(r => r.isYou);
    expect(p2Self).toBeDefined();
    expect(p2Self.username).toBe('np_p2');

    const p3Self = p3GameOver.rankings.find(r => r.isYou);
    expect(p3Self).toBeDefined();
    expect(p3Self.username).toBe('np_p3');

    // Rankings should be sorted by score descending
    for (const go of [hostGameOver, p2GameOver, p3GameOver]) {
      for (let i = 1; i < go.rankings.length; i++) {
        expect(go.rankings[i - 1].score).toBeGreaterThanOrEqual(go.rankings[i].score);
      }
      // Every ranking entry has required fields
      for (const r of go.rankings) {
        expect(r).toHaveProperty('username');
        expect(r).toHaveProperty('score');
        expect(r).toHaveProperty('rank');
        expect(typeof r.isYou).toBe('boolean');
      }
    }

    // Legacy fields still present
    expect(hostGameOver.scores).toBeDefined();
    expect(hostGameOver.results).toBeDefined();
    expect(hostGameOver.results).toHaveLength(3);

    hostWs.close();
    p2Ws.close();
    p3Ws.close();
  }, 30000);

  test('player disconnect mid-match: match continues for remaining players', async () => {
    const roomCode = await createRoom(tokens.np_host, 3, 2);

    const hostWs = await connectWS(tokens.np_host);
    const p2Ws = await connectWS(tokens.np_p2);
    const p3Ws = await connectWS(tokens.np_p3);

    await joinRoom(hostWs, roomCode);
    await joinRoom(p2Ws, roomCode);
    await joinRoom(p3Ws, roomCode);

    // Host starts match
    const hostStartP = waitForMessage(hostWs, 'match-start');
    const p2StartP = waitForMessage(p2Ws, 'match-start');
    const p3StartP = waitForMessage(p3Ws, 'match-start');
    hostWs.send(JSON.stringify({ type: 'start-match' }));
    await hostStartP;
    await p2StartP;
    await p3StartP;

    // First round: all play
    const hostRound0 = await waitForMessage(hostWs, 'round');
    const p2Round0 = await waitForMessage(p2Ws, 'round');
    const p3Round0 = await waitForMessage(p3Ws, 'round');

    const hostResult0P = waitForMessage(hostWs, 'roundResult');
    const p2Result0P = waitForMessage(p2Ws, 'roundResult');
    const p3Result0P = waitForMessage(p3Ws, 'roundResult');

    hostWs.send(JSON.stringify({ type: 'answer', answerId: hostRound0.puzzle.options[0], timeMs: 2000 }));
    p2Ws.send(JSON.stringify({ type: 'answer', answerId: p2Round0.puzzle.options[0], timeMs: 2000 }));
    p3Ws.send(JSON.stringify({ type: 'answer', answerId: p3Round0.puzzle.options[0], timeMs: 2000 }));

    await hostResult0P;
    await p2Result0P;
    await p3Result0P;

    // Player 3 disconnects before round 2
    const hostDisconnectP = waitForMessage(hostWs, 'player-disconnected');
    p3Ws.close();
    const disconnectMsg = await hostDisconnectP;
    expect(disconnectMsg.username).toBe('np_p3');

    // Round 2 should still come for remaining 2 players
    const hostRound1 = await waitForMessage(hostWs, 'round');
    const p2Round1 = await waitForMessage(p2Ws, 'round');

    // Two remaining players answer
    const hostResult1P = waitForMessage(hostWs, 'roundResult');
    const p2Result1P = waitForMessage(p2Ws, 'roundResult');

    hostWs.send(JSON.stringify({ type: 'answer', answerId: hostRound1.puzzle.options[0], timeMs: 2000 }));
    p2Ws.send(JSON.stringify({ type: 'answer', answerId: p2Round1.puzzle.options[0], timeMs: 2000 }));

    await hostResult1P;
    await p2Result1P;

    // gameOver for the 2 remaining players
    const hostGameOver = await waitForMessage(hostWs, 'gameOver');
    await waitForMessage(p2Ws, 'gameOver');

    // Dropped player should appear in rankings
    expect(hostGameOver.totalPlayers).toBe(3);
    expect(hostGameOver.rankings).toHaveLength(3);
    const droppedEntry = hostGameOver.rankings.find(r => r.username === 'np_p3');
    expect(droppedEntry).toBeDefined();
    expect(droppedEntry.score).toBe(0);

    hostWs.close();
    p2Ws.close();
  }, 30000);

  test('last-player-standing: all but one disconnect → that player wins', async () => {
    const roomCode = await createRoom(tokens.np_host, 3, 3);

    const hostWs = await connectWS(tokens.np_host);
    const p2Ws = await connectWS(tokens.np_p2);
    const p3Ws = await connectWS(tokens.np_p3);

    await joinRoom(hostWs, roomCode);
    await joinRoom(p2Ws, roomCode);
    await joinRoom(p3Ws, roomCode);

    // Host starts match
    const hostStartP = waitForMessage(hostWs, 'match-start');
    const p2StartP = waitForMessage(p2Ws, 'match-start');
    const p3StartP = waitForMessage(p3Ws, 'match-start');
    hostWs.send(JSON.stringify({ type: 'start-match' }));
    await hostStartP;
    await p2StartP;
    await p3StartP;

    // Wait for first round to arrive
    await waitForMessage(hostWs, 'round');
    await waitForMessage(p2Ws, 'round');
    await waitForMessage(p3Ws, 'round');

    // Player 2 disconnects first
    p2Ws.close();
    await waitForMessage(hostWs, 'player-disconnected');

    // Player 3 disconnects — host is last one standing
    const hostGameOverP = waitForMessage(hostWs, 'gameOver');
    p3Ws.close();

    const gameOver = await hostGameOverP;
    expect(gameOver.forfeit).toBe(true);
    expect(gameOver.winner).toBe('np_host');
    expect(gameOver.totalPlayers).toBe(3);
    expect(gameOver.rankings).toHaveLength(3);

    // Host should be rank 1
    const hostRanking = gameOver.rankings.find(r => r.username === 'np_host');
    expect(hostRanking.rank).toBe(1);
    expect(hostRanking.isYou).toBe(true);

    hostWs.close();
  }, 30000);

  test('rankings handle ties correctly', async () => {
    const roomCode = await createRoom(tokens.np_host, 3, 1);

    const hostWs = await connectWS(tokens.np_host);
    const p2Ws = await connectWS(tokens.np_p2);
    const p3Ws = await connectWS(tokens.np_p3);

    await joinRoom(hostWs, roomCode);
    await joinRoom(p2Ws, roomCode);
    await joinRoom(p3Ws, roomCode);

    // Host starts match
    const hostStartP = waitForMessage(hostWs, 'match-start');
    const p2StartP = waitForMessage(p2Ws, 'match-start');
    const p3StartP = waitForMessage(p3Ws, 'match-start');
    hostWs.send(JSON.stringify({ type: 'start-match' }));
    await hostStartP;
    await p2StartP;
    await p3StartP;

    // Single round — all players give wrong answer → all get 0 → all tied
    await waitForMessage(hostWs, 'round');
    await waitForMessage(p2Ws, 'round');
    await waitForMessage(p3Ws, 'round');

    // Send deliberately wrong answers (use an answer that's definitely not correct)
    const wrongAnswer = 'DEFINITELY_WRONG_ANSWER';
    const hostResultP = waitForMessage(hostWs, 'roundResult');
    const p2ResultP = waitForMessage(p2Ws, 'roundResult');
    const p3ResultP = waitForMessage(p3Ws, 'roundResult');

    hostWs.send(JSON.stringify({ type: 'answer', answerId: wrongAnswer, timeMs: 2000 }));
    p2Ws.send(JSON.stringify({ type: 'answer', answerId: wrongAnswer, timeMs: 2000 }));
    p3Ws.send(JSON.stringify({ type: 'answer', answerId: wrongAnswer, timeMs: 2000 }));

    await hostResultP;
    await p2ResultP;
    await p3ResultP;

    // gameOver
    const hostGameOver = await waitForMessage(hostWs, 'gameOver');

    // All tied at 0 → all rank 1, no winner
    expect(hostGameOver.winner).toBeNull();
    expect(hostGameOver.totalPlayers).toBe(3);
    for (const r of hostGameOver.rankings) {
      expect(r.score).toBe(0);
      expect(r.rank).toBe(1);
    }

    hostWs.close();
    p2Ws.close();
    p3Ws.close();
  }, 30000);
});

