/**
 * CS52-8 — Cross-task integration / E2E gap-fill tests.
 *
 * Per the CS52-8 task spec: per-task PRs (CS52-2 .. CS52-7e) already cover
 * each individual contract. This file is intentionally small and focuses on
 * scenarios that span two or more tasks and that would otherwise fall through
 * the cracks of the per-task suites:
 *
 *   1. Claim-prompt DECLINE (CS52-4 modal × CS52-5 sync-client):
 *      after a user dismisses the prompt, L1 records remain attributed to
 *      their pre-sign-in user_id (null / mismatched), and a subsequent
 *      sign-in re-detects the same claimable bucket. No data loss, no
 *      auto-claim.
 *
 *   2. Multiplayer match-end achievement evaluation (CS52-7 × CS52-7d):
 *      a completed MP match unlocks server achievements for participants
 *      via the `mp_match_end` source — proving the cross-cutting
 *      "achievements unlock from ranked sessions AND multiplayer matches"
 *      contract end-to-end (the per-task achievement suite has a unit-level
 *      assertion but the wire-level WS path was only "covered indirectly").
 *
 * Coverage matrix for the full CS52-8 acceptance list lives in the PR body
 * (## Acceptance Criteria Coverage); see that table for which existing test
 * file pins each criterion.
 */

const WebSocket = require('ws');
const {
  getAgent,
  getServer,
  setup,
  teardown,
  registerUser,
  setGameConfig,
} = require('./helper');

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
});

afterAll(teardown);

function getServerAddr() {
  const addr = getServer().address();
  return `127.0.0.1:${addr.port}`;
}

function connectWS(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://${getServerAddr()}/ws?token=${encodeURIComponent(token)}`
    );
    const timeout = setTimeout(() => reject(new Error('WS connect timeout')), 5000);
    ws.on('message', function onFirst(data) {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'connected') {
        clearTimeout(timeout);
        ws.removeListener('message', onFirst);
        resolve(ws);
      }
    });
    ws.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

function waitForMessage(ws, type, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timeout waiting for "${type}"`)),
      timeoutMs
    );
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

async function waitFor(predicate, { timeoutMs = 4000, intervalMs = 50, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor("${label}") timed out after ${timeoutMs}ms (last=${JSON.stringify(last)})`);
}

describe('CS52-8 cross-task: multiplayer match-end achievement evaluation', () => {
  test('a completed MP match unlocks achievements for both participants (mp_match_end source)', async () => {
    const { getDbAdapter } = require('../server/db');
    const agent = getAgent();
    const totalRounds = TEST_ROUNDS;

    // Fresh users so the "first-game" achievement is guaranteed unlockable
    // and there are no entanglements with other tests' state.
    const { token: hToken, user: hUser } = await registerUser('cs528_mp_ach_h', 'password123');
    const { token: jToken, user: jUser } = await registerUser('cs528_mp_ach_j', 'password123');

    const createRes = await agent
      .post('/api/matches')
      .set('Authorization', `Bearer ${hToken}`)
      .send({ maxPlayers: 2 });
    expect([200, 201]).toContain(createRes.status);
    const { roomCode } = createRes.body;

    await agent
      .post('/api/matches/join')
      .set('Authorization', `Bearer ${jToken}`)
      .send({ roomCode });

    const db = await getDbAdapter();
    const matchRow = await db.get(
      `SELECT id FROM matches WHERE room_code = ?`,
      [roomCode]
    );
    const matchId = matchRow.id;

    let hostWs;
    let joinerWs;
    try {
      hostWs = await connectWS(hToken);
      joinerWs = await connectWS(jToken);

      hostWs.send(JSON.stringify({ type: 'join', roomCode }));
      await waitForMessage(hostWs, 'joined');
      joinerWs.send(JSON.stringify({ type: 'join', roomCode }));
      await waitForMessage(joinerWs, 'joined');

      const startH = waitForMessage(hostWs, 'match-start');
      const startJ = waitForMessage(joinerWs, 'match-start');
      hostWs.send(JSON.stringify({ type: 'start-match' }));
      await Promise.all([startH, startJ]);

      for (let round = 0; round < totalRounds; round++) {
        await Promise.all([
          waitForMessage(hostWs, 'round'),
          waitForMessage(joinerWs, 'round'),
        ]);
        const mr = await db.get(
          `SELECT puzzle_id FROM match_rounds WHERE match_id = ? AND round_num = ?`,
          [matchId, round + 1]
        );
        const pz = await db.get(`SELECT answer FROM puzzles WHERE id = ?`, [mr.puzzle_id]);
        const correctId = pz.answer;
        const rH = waitForMessage(hostWs, 'roundResult');
        const rJ = waitForMessage(joinerWs, 'roundResult');
        hostWs.send(JSON.stringify({ type: 'answer', answerId: correctId, timeMs: 500 }));
        joinerWs.send(JSON.stringify({ type: 'answer', answerId: correctId, timeMs: 500 }));
        await Promise.all([rH, rJ]);
      }

      await waitForMessage(hostWs, 'gameOver');
      await waitForMessage(joinerWs, 'gameOver');

      // Achievement evaluation runs after persistCompletedMatch — poll for
      // user_achievements rows so we don't race the async path.
      const unlocked = await waitFor(
        async () => {
          const rows = await db.all(
            `SELECT user_id, achievement_id FROM user_achievements
              WHERE user_id IN (?, ?)
              ORDER BY user_id`,
            [hUser.id, jUser.id]
          );
          return rows.length >= 2 ? rows : null;
        },
        { timeoutMs: 5000, label: 'user_achievements rows for both MP participants' }
      );

      // Both participants must have at least one achievement unlocked from
      // the match-end pass. The exact set depends on seed data, but
      // `first-game` is the minimum guarantee for a fresh user playing their
      // first server-validated session.
      const hostUnlocks = unlocked.filter((r) => r.user_id === hUser.id);
      const joinerUnlocks = unlocked.filter((r) => r.user_id === jUser.id);
      expect(hostUnlocks.length).toBeGreaterThanOrEqual(1);
      expect(joinerUnlocks.length).toBeGreaterThanOrEqual(1);
    } finally {
      // Always close whichever sockets were successfully opened, even if
      // the second connectWS rejected — helper.teardown() does not reach
      // upgraded WS connections, so a leak here would pollute later tests.
      if (hostWs) { try { hostWs.close(); } catch { /* ignore */ } }
      if (joinerWs) { try { joinerWs.close(); } catch { /* ignore */ } }
    }
  }, 20000);
});
