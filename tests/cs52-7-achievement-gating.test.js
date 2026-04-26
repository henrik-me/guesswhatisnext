/**
 * CS52-7 — Achievement gating.
 *
 * Server achievements unlock ONLY from server-validated outcomes:
 *   - POST /api/sessions/:id/finish (ranked, CS52-3)
 *   - WS multiplayer match-end (covered by ws/matchHandler — exercised
 *     indirectly via tests/e2e-multiplayer.test.js)
 *
 * Achievement evaluation is explicitly skipped for:
 *   - POST /api/sync (offline-source records)
 *   - POST /api/scores (legacy / offline submission path)
 *
 * Spec:
 *   project/clickstops/active/active_cs52_server-authoritative-scoring.md
 *   § Decision #7 + § Acceptance criteria
 *     "Server achievements unlock only from ranked sessions and multiplayer
 *      matches."
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const supertest = require('supertest');

const SEED_PUZZLES = Array.from({ length: 20 }, (_, i) => ({
  id: `cs52-7-tst-${String(i).padStart(3, '0')}`,
  category: 'Test',
  prompt: { type: 'text', sequence: ['1', '2', '3'], explanation: 'next' },
  options: ['A', 'B', 'C', 'D'],
  answer: 'A',
  difficulty: 1,
}));

let server;
let agent;
let tmpDir;

async function bootServer() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwn-cs52-7-'));
  process.env.GWN_DB_PATH = path.join(tmpDir, 'cs52-7.db');
  process.env.NODE_ENV = 'test';

  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(path.resolve(__dirname, '..', 'server'))) delete require.cache[k];
  }

  const { createServer } = require('../server/app');
  const result = createServer();
  server = result.server;
  if (result.dbReady) await result.dbReady;

  await new Promise((r) => server.listen(0, r));
  agent = supertest(server);

  const { getDbAdapter } = require('../server/db');
  const db = await getDbAdapter();
  for (const p of SEED_PUZZLES) {
    await db.run(
      `INSERT INTO ranked_puzzles
         (id, category, prompt, options, answer, difficulty, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      [p.id, p.category, JSON.stringify(p.prompt), JSON.stringify(p.options),
       p.answer, p.difficulty, new Date().toISOString()]
    );
  }
}

async function shutdown() {
  if (server) {
    try {
      const { closeDbAdapter } = require('../server/db');
      await closeDbAdapter();
    } catch { /* ignore */ }
    await new Promise((res, rej) => server.close((e) => (e ? rej(e) : res())));
    server = null;
    agent = null;
  }
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
  delete process.env.GWN_DB_PATH;
}

async function registerUser(username) {
  const bcrypt = require('bcryptjs');
  const { generateToken } = require('../server/middleware/auth');
  const { getDbAdapter } = require('../server/db');
  const db = await getDbAdapter();
  const hash = bcrypt.hashSync('pw-very-long-1', 4);
  const result = await db.run(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)',
    [username, hash]
  );
  const user = { id: result.lastId, username, role: 'user' };
  const token = generateToken(user);
  return { user, token };
}

function authH(token) { return { Authorization: `Bearer ${token}` }; }

beforeAll(bootServer, 30000);
afterAll(shutdown);

beforeEach(() => {
  const sessions = require('../server/routes/sessions');
  if (sessions.__test) sessions.__test.resetState();
});

async function pause(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function playFullRankedSession(token) {
  const create = await agent
    .post('/api/sessions')
    .set(authH(token))
    .send({ mode: 'ranked_freeplay' });
  expect(create.status).toBe(201);
  const sessionId = create.body.sessionId;
  let round = create.body.round0;

  for (let i = 0; i < 10; i++) {
    await pause(60);
    const ans = await agent
      .post(`/api/sessions/${sessionId}/answer`)
      .set(authH(token))
      .send({
        round_num: round.round_num,
        puzzle_id: round.puzzle.id,
        answer: round.puzzle.options[0],
        client_time_ms: 1000,
      });
    expect(ans.status).toBe(200);
    if (i < 9) {
      const nxt = await agent
        .post(`/api/sessions/${sessionId}/next-round`)
        .set(authH(token))
        .send({});
      expect(nxt.status).toBe(200);
      round = nxt.body;
    }
  }

  return agent
    .post(`/api/sessions/${sessionId}/finish`)
    .set(authH(token))
    .send({});
}

describe('CS52-7 — Achievement gating', () => {
  test('ranked /finish unlocks achievements (perfect-game + first-game)', async () => {
    const { token } = await registerUser('cs52-7-ranked');
    const finish = await playFullRankedSession(token);
    expect(finish.status).toBe(200);

    // The session above answered 10/10 correctly with bestStreak=10 →
    // expect first-game, perfect-game, streak-5, streak-10 all unlocked.
    expect(Array.isArray(finish.body.newAchievements)).toBe(true);
    const ids = finish.body.newAchievements.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['first-game', 'perfect-game']));

    const me = await agent.get('/api/achievements/me').set(authH(token));
    expect(me.status).toBe(200);
    const meIds = me.body.achievements.map((a) => a.id);
    expect(meIds).toEqual(expect.arrayContaining(['first-game', 'perfect-game']));
  });

  test('legacy POST /api/scores does NOT unlock achievements', async () => {
    const { token } = await registerUser('cs52-7-legacy');

    const submit = await agent
      .post('/api/scores')
      .set(authH(token))
      .send({
        mode: 'freeplay',
        score: 9999,
        correctCount: 10,
        totalRounds: 10,
        bestStreak: 10,
      });
    expect(submit.status).toBe(201);
    expect(submit.body.newAchievements).toEqual([]);

    const me = await agent.get('/api/achievements/me').set(authH(token));
    expect(me.status).toBe(200);
    expect(me.body.achievements.length).toBe(0);
  });

  test('POST /api/sync does NOT unlock achievements (offline records)', async () => {
    const { token } = await registerUser('cs52-7-sync');

    const res = await agent
      .post('/api/sync')
      .set(authH(token))
      .set('X-User-Activity', '1')
      .send({
        queuedRecords: [
          {
            client_game_id: 'cs52-7-sync-1',
            mode: 'freeplay',
            variant: 'freeplay',
            score: 9999,
            correct_count: 10,
            total_rounds: 10,
            best_streak: 10,
            fastest_answer_ms: 100,
            completed_at: '2026-04-25T12:00:00Z',
            schema_version: 1,
          },
        ],
        revalidate: {},
      });
    expect(res.status).toBe(200);
    expect(res.body.acked).toEqual(['cs52-7-sync-1']);

    const me = await agent.get('/api/achievements/me').set(authH(token));
    expect(me.status).toBe(200);
    expect(me.body.achievements.length).toBe(0);
  });

  test('end-to-end: same perfect-game outcome unlocks via ranked but NOT via offline', async () => {
    // Two users — Alice plays Ranked, Bob submits identical numbers via
    // /api/scores. Only Alice should hold perfect-game.
    const alice = await registerUser('cs52-7-alice');
    const bob = await registerUser('cs52-7-bob');

    const aliceFinish = await playFullRankedSession(alice.token);
    expect(aliceFinish.status).toBe(200);

    const bobSubmit = await agent
      .post('/api/scores')
      .set(authH(bob.token))
      .send({
        mode: 'freeplay',
        score: aliceFinish.body.score,
        correctCount: aliceFinish.body.correctCount,
        totalRounds: 10,
        bestStreak: aliceFinish.body.bestStreak,
      });
    expect(bobSubmit.status).toBe(201);

    const aliceMe = await agent.get('/api/achievements/me').set(authH(alice.token));
    const aliceIds = aliceMe.body.achievements.map((a) => a.id);
    expect(aliceIds).toContain('perfect-game');

    const bobMe = await agent.get('/api/achievements/me').set(authH(bob.token));
    expect(bobMe.body.achievements.length).toBe(0);
  });

  test('telemetry: ranked /finish emits achievement_evaluation log with source=ranked_finish', async () => {
    const logger = require('../server/logger');
    const captured = [];
    const orig = logger.info.bind(logger);
    logger.info = (...args) => {
      captured.push(args);
      return orig(...args);
    };
    try {
      const { token } = await registerUser('cs52-7-telemetry');
      const finish = await playFullRankedSession(token);
      expect(finish.status).toBe(200);

      const evt = captured.find(
        (a) => a[0] && typeof a[0] === 'object' && a[0].event === 'achievement_evaluation'
      );
      expect(evt).toBeTruthy();
      expect(evt[0].source).toBe('ranked_finish');
      expect(Array.isArray(evt[0].achievements_unlocked)).toBe(true);

      // No 'achievement_evaluation' event with source other than ranked_finish
      // / mp_match_end should ever be emitted.
      const offendingSources = captured
        .filter((a) => a[0] && typeof a[0] === 'object' && a[0].event === 'achievement_evaluation')
        .map((a) => a[0].source)
        .filter((s) => s !== 'ranked_finish' && s !== 'mp_match_end');
      expect(offendingSources).toEqual([]);
    } finally {
      logger.info = orig;
    }
  });
});
