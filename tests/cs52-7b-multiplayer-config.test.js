'use strict';

/**
 * CS52-7b — multiplayer config alignment.
 *
 * Per CS52 § Decision #4 + § Decision #8:
 *   - Multiplayer reads `rounds`, `round_timer_ms`, `inter_round_delay_ms`
 *     from `game_configs.multiplayer` via the CS52-7c loader, with code-level
 *     defaults as fallback.
 *   - Client cannot override these values — any `totalRounds` /
 *     `round_timer_ms` / `inter_round_delay_ms` field on the create-room
 *     payload (or WS message) is ignored.
 *   - Updating the `game_configs.multiplayer` row changes the shape of the
 *     NEXT match created without a redeploy.
 *
 * These tests intentionally hit the route + WS handler + loader together
 * rather than mocking the loader, so the integration is what's verified.
 */

const WebSocket = require('ws');
const { getAgent, getServer, setup, teardown, registerUser, setGameConfig } = require('./helper');
const { GAME_CONFIG_DEFAULTS } = require('../server/services/gameConfigDefaults');

let hostToken;
let joinerToken;

beforeAll(async () => {
  await setup();
  hostToken = (await registerUser('cfg_host', 'password123')).token;
  joinerToken = (await registerUser('cfg_joiner', 'password123')).token;
});

afterAll(teardown);

function getServerAddr() {
  const addr = getServer().address();
  return `127.0.0.1:${addr.port}`;
}

function connectWS(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${getServerAddr()}/ws?token=${encodeURIComponent(token)}`);
    const timer = setTimeout(() => reject(new Error('WS connect timeout')), 5000);
    ws.on('message', function onFirst(data) {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'connected') {
        clearTimeout(timer);
        ws.removeListener('message', onFirst);
        resolve(ws);
      }
    });
    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

function waitForMessage(ws, type, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${type}"`)), timeoutMs);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

describe('POST /api/matches — client cannot override server-authoritative config', () => {
  beforeEach(async () => {
    // Reset to canonical defaults before each assertion.
    await setGameConfig('multiplayer', {
      rounds: GAME_CONFIG_DEFAULTS.multiplayer.rounds,
      round_timer_ms: GAME_CONFIG_DEFAULTS.multiplayer.round_timer_ms,
      inter_round_delay_ms: GAME_CONFIG_DEFAULTS.multiplayer.inter_round_delay_ms,
    });
  });

  test('client-supplied totalRounds=999 is ignored — server uses game_configs', async () => {
    const res = await getAgent()
      .post('/api/matches')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ totalRounds: 999 });

    expect(res.status).toBe(201);
    expect(res.body.totalRounds).toBe(GAME_CONFIG_DEFAULTS.multiplayer.rounds);
    expect(res.body.totalRounds).not.toBe(999);
  });

  test('client-supplied round_timer_ms / inter_round_delay_ms are ignored', async () => {
    // Set a distinctive non-default config so we can prove the server reads
    // from game_configs and not from the client payload.
    await setGameConfig('multiplayer', {
      rounds: 4,
      round_timer_ms: 12345,
      inter_round_delay_ms: 678,
    });

    // Spy on the structured match-start log so we can verify the timer/delay
    // actually applied to the live room (the HTTP response only carries
    // totalRounds; timer/delay live on the WS room state).
    const logger = require('../server/logger');
    const infoCalls = [];
    const origInfo = logger.info.bind(logger);
    logger.info = (...args) => {
      infoCalls.push(args);
      return origInfo(...args);
    };

    let createRes;
    let hostWs;
    let joinerWs;
    try {
      createRes = await getAgent()
        .post('/api/matches')
        .set('Authorization', `Bearer ${hostToken}`)
        .send({
          totalRounds: 42,
          round_timer_ms: 1,             // would brick gameplay
          inter_round_delay_ms: 999999,  // would stall gameplay
        });

      expect(createRes.status).toBe(201);
      // Response only carries totalRounds — must reflect server config.
      expect(createRes.body.totalRounds).toBe(4);

      // matches row also reflects server config, not the client's 42.
      const { getDbAdapter } = require('../server/db');
      const db = await getDbAdapter();
      const row = await db.get('SELECT total_rounds FROM matches WHERE id = ?', [createRes.body.matchId]);
      expect(row.total_rounds).toBe(4);

      // Drive the room to startMatch so the snapshot log fires.
      const { roomCode } = createRes.body;
      await getAgent()
        .post('/api/matches/join')
        .set('Authorization', `Bearer ${joinerToken}`)
        .send({ roomCode });

      hostWs = await connectWS(hostToken);
      joinerWs = await connectWS(joinerToken);

      const hostJoined = waitForMessage(hostWs, 'joined');
      hostWs.send(JSON.stringify({ type: 'join', roomCode }));
      await hostJoined;

      const joinerJoined = waitForMessage(joinerWs, 'joined');
      const hostLobby = waitForMessage(hostWs, 'lobby-state');
      joinerWs.send(JSON.stringify({ type: 'join', roomCode }));
      await joinerJoined;
      await hostLobby;

      const hostStart = waitForMessage(hostWs, 'match-start');
      hostWs.send(JSON.stringify({ type: 'start-match' }));
      await hostStart;

      // The structured snapshot log must contain server-config timer/delay
      // values, not the client's 1 / 999999.
      const snap = infoCalls
        .map((a) => a[0])
        .find((o) => o && o.event === 'multiplayer_match_started' && o.room_code === roomCode);
      expect(snap).toBeDefined();
      expect(snap.config.rounds).toBe(4);
      expect(snap.config.round_timer_ms).toBe(12345);
      expect(snap.config.inter_round_delay_ms).toBe(678);
      expect(snap.config.round_timer_ms).not.toBe(1);
      expect(snap.config.inter_round_delay_ms).not.toBe(999999);
    } finally {
      logger.info = origInfo;
      if (hostWs) hostWs.close();
      if (joinerWs) joinerWs.close();
    }
  });

  test('admin update of game_configs.multiplayer changes the next match', async () => {
    // Override to 7 rounds.
    await setGameConfig('multiplayer', {
      rounds: 7,
      round_timer_ms: 12000,
      inter_round_delay_ms: 500,
    });

    const res = await getAgent()
      .post('/api/matches')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({}); // client says nothing

    expect(res.status).toBe(201);
    expect(res.body.totalRounds).toBe(7);
  });
});

describe('WS match-start — totalRounds reflects server config, not client', () => {
  test('match-start broadcast carries server-config rounds even when client tried to override', async () => {
    // Set a distinctive value via the admin path.
    await setGameConfig('multiplayer', {
      rounds: 4,
      round_timer_ms: 5000,
      inter_round_delay_ms: 0,
    });

    // Host creates room while sending a bogus totalRounds=99.
    const createRes = await getAgent()
      .post('/api/matches')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ totalRounds: 99, maxPlayers: 2 });
    expect(createRes.status).toBe(201);
    expect(createRes.body.totalRounds).toBe(4);
    const { roomCode } = createRes.body;

    // Joiner joins via API.
    await getAgent()
      .post('/api/matches/join')
      .set('Authorization', `Bearer ${joinerToken}`)
      .send({ roomCode });

    // Both connect via WS, join the room, host starts.
    const hostWs = await connectWS(hostToken);
    const joinerWs = await connectWS(joinerToken);
    try {
      const hostJoined = waitForMessage(hostWs, 'joined');
      hostWs.send(JSON.stringify({ type: 'join', roomCode }));
      await hostJoined;

      // Register lobby-state listener BEFORE the join that triggers it.
      const hostLobby = waitForMessage(hostWs, 'lobby-state');
      const joinerJoined = waitForMessage(joinerWs, 'joined');
      joinerWs.send(JSON.stringify({ type: 'join', roomCode }));
      await joinerJoined;
      await hostLobby;

      const hostStartPromise = waitForMessage(hostWs, 'match-start');
      const joinerStartPromise = waitForMessage(joinerWs, 'match-start');
      hostWs.send(JSON.stringify({ type: 'start-match' }));
      const hostStart = await hostStartPromise;
      const joinerStart = await joinerStartPromise;

      // CS52-7b assertion: totalRounds in the broadcast is the server's
      // configured value (4), not the client's 99.
      expect(hostStart.totalRounds).toBe(4);
      expect(joinerStart.totalRounds).toBe(4);
    } finally {
      hostWs.close();
      joinerWs.close();
    }
  });
});
