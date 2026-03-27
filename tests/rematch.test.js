/**
 * Tests for N-player rematch flow.
 */

const WebSocket = require('ws');
const { getAgent, getServer, setup, teardown, registerUser } = require('./helper');

beforeAll(setup);
afterAll(teardown);

/** Helper: get the server's listening address. */
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

/** Helper: create room, have all players join via WS, host starts match, play through all rounds. */
async function playFullMatch(tokens, { totalRounds = 3, maxPlayers = 4 } = {}) {
  const agent = getAgent();

  // Host creates room
  const createRes = await agent
    .post('/api/matches')
    .set('Authorization', `Bearer ${tokens[0]}`)
    .send({ totalRounds, maxPlayers });
  const { roomCode } = createRes.body;

  // All players connect and join
  const sockets = [];
  for (const token of tokens) {
    const ws = await connectWS(token);
    ws.send(JSON.stringify({ type: 'join', roomCode }));
    await waitForMessage(ws, 'joined');
    sockets.push(ws);
  }

  // Wait for lobby-state to settle
  await waitForMessage(sockets[0], 'lobby-state');

  // Host starts match
  const startPromises = sockets.map(ws => waitForMessage(ws, 'match-start'));
  sockets[0].send(JSON.stringify({ type: 'start-match' }));
  await Promise.all(startPromises);

  // Play through all rounds
  for (let round = 0; round < totalRounds; round++) {
    const roundPromises = sockets.map(ws => waitForMessage(ws, 'round'));
    await Promise.all(roundPromises);

    // All players answer (wrong answer is fine, we just need the match to end)
    const resultPromises = sockets.map(ws => waitForMessage(ws, 'roundResult'));
    for (const ws of sockets) {
      ws.send(JSON.stringify({ type: 'answer', answerId: 999, timeMs: 1000 }));
    }
    await Promise.all(resultPromises);
  }

  // Wait for gameOver on all
  const gameOverPromises = sockets.map(ws => waitForMessage(ws, 'gameOver'));
  const gameOvers = await Promise.all(gameOverPromises);

  return { roomCode, sockets, gameOvers };
}

describe('N-player Rematch', () => {
  let hostToken, player2Token, player3Token;

  beforeAll(async () => {
    const host = await registerUser('rm_host', 'password123');
    const p2 = await registerUser('rm_player2', 'password123');
    const p3 = await registerUser('rm_player3', 'password123');
    hostToken = host.token;
    player2Token = p2.token;
    player3Token = p3.token;
  });

  test('rematch ready flow: 2 players finish match, both ready up, both receive rematch-ready', async () => {
    const { sockets } = await playFullMatch([hostToken, player2Token], { totalRounds: 3, maxPlayers: 2 });
    const [hostWs, player2Ws] = sockets;

    try {
      // Host readies up
      const hostReadyPromise = waitForMessage(hostWs, 'rematch-ready');
      const p2ReadyPromise1 = waitForMessage(player2Ws, 'rematch-ready');
      hostWs.send(JSON.stringify({ type: 'rematch-request' }));
      const hostReady = await hostReadyPromise;
      const p2Ready1 = await p2ReadyPromise1;

      expect(hostReady.readyPlayers).toContain('rm_host');
      expect(hostReady.readyPlayers).toHaveLength(1);
      expect(hostReady.totalPlayers).toBe(2);
      expect(p2Ready1.readyPlayers).toContain('rm_host');

      // Player 2 readies up
      const hostReadyPromise2 = waitForMessage(hostWs, 'rematch-ready');
      const p2ReadyPromise2 = waitForMessage(player2Ws, 'rematch-ready');
      player2Ws.send(JSON.stringify({ type: 'rematch-request' }));
      const hostReady2 = await hostReadyPromise2;
      const p2Ready2 = await p2ReadyPromise2;

      expect(hostReady2.readyPlayers).toContain('rm_host');
      expect(hostReady2.readyPlayers).toContain('rm_player2');
      expect(hostReady2.readyPlayers).toHaveLength(2);
      expect(p2Ready2.readyPlayers).toHaveLength(2);
    } finally {
      hostWs.close();
      player2Ws.close();
    }
  });

  test('host starts rematch: after both ready, host confirms, both receive rematch-start', async () => {
    const { sockets } = await playFullMatch([hostToken, player2Token], { totalRounds: 3, maxPlayers: 2 });
    const [hostWs, player2Ws] = sockets;

    try {
      // Both ready up
      hostWs.send(JSON.stringify({ type: 'rematch-request' }));
      await waitForMessage(hostWs, 'rematch-ready');

      player2Ws.send(JSON.stringify({ type: 'rematch-request' }));
      await waitForMessage(hostWs, 'rematch-ready');

      // Host confirms start
      const hostStartPromise = waitForMessage(hostWs, 'rematch-start');
      const p2StartPromise = waitForMessage(player2Ws, 'rematch-start');
      hostWs.send(JSON.stringify({ type: 'rematch-start-confirm' }));

      const hostStart = await hostStartPromise;
      const p2Start = await p2StartPromise;

      expect(hostStart.roomCode).toBeTruthy();
      expect(hostStart.roomCode).toMatch(/^[0-9A-F]{6}$/);
      expect(p2Start.roomCode).toBe(hostStart.roomCode);
    } finally {
      hostWs.close();
      player2Ws.close();
    }
  });

  test('non-host cannot start rematch', async () => {
    const { sockets } = await playFullMatch([hostToken, player2Token], { totalRounds: 3, maxPlayers: 2 });
    const [hostWs, player2Ws] = sockets;

    try {
      // Both ready up
      hostWs.send(JSON.stringify({ type: 'rematch-request' }));
      await waitForMessage(player2Ws, 'rematch-ready');

      player2Ws.send(JSON.stringify({ type: 'rematch-request' }));
      await waitForMessage(player2Ws, 'rematch-ready');

      // Non-host tries to start
      const errPromise = waitForMessage(player2Ws, 'error');
      player2Ws.send(JSON.stringify({ type: 'rematch-start-confirm' }));
      const err = await errPromise;

      expect(err.message).toMatch(/host/i);
    } finally {
      hostWs.close();
      player2Ws.close();
    }
  });

  test('partial rematch: 3 players finish, only 2 ready + host starts, rematch has those players', async () => {
    const { sockets } = await playFullMatch([hostToken, player2Token, player3Token], { totalRounds: 3, maxPlayers: 4 });
    const [hostWs, player2Ws, player3Ws] = sockets;

    try {
      // Host and player2 ready up (player3 does not)
      hostWs.send(JSON.stringify({ type: 'rematch-request' }));
      await waitForMessage(hostWs, 'rematch-ready');

      player2Ws.send(JSON.stringify({ type: 'rematch-request' }));
      await waitForMessage(hostWs, 'rematch-ready');

      // Host confirms start
      const hostStartPromise = waitForMessage(hostWs, 'rematch-start');
      const p2StartPromise = waitForMessage(player2Ws, 'rematch-start');

      // Player3 should NOT receive rematch-start, so set a short timeout
      let player3GotStart = false;
      const p3Listener = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'rematch-start') player3GotStart = true;
      };
      player3Ws.on('message', p3Listener);

      hostWs.send(JSON.stringify({ type: 'rematch-start-confirm' }));

      const hostStart = await hostStartPromise;
      const p2Start = await p2StartPromise;

      expect(hostStart.roomCode).toBeTruthy();
      expect(p2Start.roomCode).toBe(hostStart.roomCode);

      // Wait a bit to make sure player3 didn't get the message
      await new Promise(r => setTimeout(r, 500));
      expect(player3GotStart).toBe(false);

      player3Ws.removeListener('message', p3Listener);
    } finally {
      hostWs.close();
      player2Ws.close();
      player3Ws.close();
    }
  });
});
