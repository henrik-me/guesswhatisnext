/**
 * CS52-3 — Ranked session API + shared scoring service.
 *
 * Covers:
 *   - Ranked Free Play happy path (full 10-round game)
 *   - Streaming dispatch (round N+1 not visible until /next-round)
 *   - 425 Too Early gate when called before inter_round_delay_ms
 *   - Server-derived elapsed_ms wins over forged client_time_ms
 *   - Cross-midnight Ranked Daily (yesterday's date does not block today)
 *   - Concurrent active-session race → exactly one 200 + one 409
 *   - In-band reconciliation: stale in_progress row converted to abandoned
 *   - Anti-cheat: out-of-order, timing-impossible, expired, double session,
 *     daily replay
 *   - /finish persists a corresponding scores row with source='ranked'
 *
 * Design contract:
 *   project/clickstops/active/active_cs52_server-authoritative-scoring.md
 *   § Ranked session lifecycle (CS52-3)
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const supertest = require('supertest');

const SEED_PUZZLES = [
  // Plenty of rows so a 10-round session never runs out.
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `tst-${String(i).padStart(3, '0')}`,
    category: 'Test',
    prompt: { type: 'text', sequence: ['1', '2', '3'], explanation: 'next' },
    options: ['A', 'B', 'C', 'D'],
    answer: 'A',
    difficulty: 1,
  })),
];

let server;
let agent;
let tmpDir;

async function bootServer() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwn-cs52-3-'));
  process.env.GWN_DB_PATH = path.join(tmpDir, 'cs52-3.db');
  process.env.NODE_ENV = 'test';

  // Force a fresh module graph so the singleton DB adapter binds to the new path.
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(path.resolve(__dirname, '..', 'server'))) delete require.cache[k];
  }

  const { createServer } = require('../server/app');
  const result = createServer();
  server = result.server;
  if (result.dbReady) await result.dbReady;

  await new Promise((r) => server.listen(0, r));
  agent = supertest(server);

  // Seed ranked_puzzles
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
  // Bypass register rate limiter (5/min) by inserting user directly + minting a JWT.
  const bcrypt = require('bcryptjs');
  const { generateToken } = require('../server/middleware/auth');
  const db = await getDb();
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

async function getDb() {
  const { getDbAdapter } = require('../server/db');
  return getDbAdapter();
}

beforeAll(bootServer, 30000);
afterAll(shutdown);

beforeEach(async () => {
  // Clear in-process dispatched-round state so tests don't leak.
  const sessions = require('../server/routes/sessions');
  if (sessions.__test) sessions.__test.resetState();
});

// ── Helpers exercising the protocol end-to-end ──────────────────────────

async function playRound(token, sessionId, round) {
  const a = await agent
    .post(`/api/sessions/${sessionId}/answer`)
    .set(authH(token))
    .send({
      round_num: round.round_num,
      puzzle_id: round.puzzle.id,
      answer: round.puzzle.options[0], // seed puzzles all answer = 'A' = options[0]
      client_time_ms: 1000,
    });
  return a;
}

async function nextRound(token, sessionId) {
  return agent.post(`/api/sessions/${sessionId}/next-round`).set(authH(token)).send({});
}

async function pause(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ────────────────────────────────────────────────────────────────────────

describe('CS52-3 — Ranked session API', () => {
  test('happy path: full 10-round Free Play session, /finish persists score row', async () => {
    const { token, user } = await registerUser('happy-fp');
    const create = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' });
    expect(create.status).toBe(201);
    expect(create.body.sessionId).toMatch(/[0-9a-f-]{36}/);
    expect(create.body.config.rounds).toBe(10);
    expect(create.body.round0.round_num).toBe(0);
    // Crucial: answer NEVER returned.
    expect(create.body.round0.puzzle).not.toHaveProperty('answer');

    const sessionId = create.body.sessionId;
    let round = create.body.round0;
    for (let i = 0; i < 10; i++) {
      // Honour the 50ms minimum elapsed_ms anti-cheat bound.
      await pause(60);
      const ans = await playRound(token, sessionId, round);
      expect(ans.status).toBe(200);
      expect(ans.body.correct).toBe(true);
      expect(ans.body.elapsed_ms).toBeGreaterThanOrEqual(50);
      if (i < 9) {
        const nxt = await nextRound(token, sessionId);
        expect(nxt.status).toBe(200);
        expect(nxt.body.puzzle).not.toHaveProperty('answer');
        expect(nxt.body.round_num).toBe(i + 1);
        round = nxt.body;
      }
    }
    const finish = await agent.post(`/api/sessions/${sessionId}/finish`).set(authH(token)).send({});
    expect(finish.status).toBe(200);
    expect(finish.body.correctCount).toBe(10);
    expect(finish.body.score).toBeGreaterThan(0);
    expect(finish.body.bestStreak).toBe(10);

    // Assert legacy scores row inserted with source='ranked'.
    const db = await getDb();
    const scoreRow = await db.get(
      `SELECT mode, score, source, variant FROM scores WHERE user_id = ?`,
      [user.id]
    );
    expect(scoreRow.source).toBe('ranked');
    expect(scoreRow.variant).toBe('freeplay');
    expect(scoreRow.score).toBe(finish.body.score);

    // Idempotency: second /finish returns the same shape.
    const again = await agent.post(`/api/sessions/${sessionId}/finish`).set(authH(token)).send({});
    expect(again.status).toBe(200);
    expect(again.body.score).toBe(finish.body.score);
  });

  test('streaming: only round 0 is returned; subsequent rounds via /next-round', async () => {
    const { token } = await registerUser('streaming');
    const c = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' });
    expect(Object.keys(c.body)).not.toContain('rounds'); // no array of all rounds
    expect(c.body.round0).toBeDefined();
    expect(c.body.round1).toBeUndefined();
    // /next-round before /answer → 409
    const sessionId = c.body.sessionId;
    const early = await nextRound(token, sessionId);
    expect(early.status).toBe(409);
  });

  test('425 Too Early when /next-round called before inter_round_delay_ms', async () => {
    const { token } = await registerUser('toofast');
    // Override default config with a 500ms inter-round delay.
    const db = await getDb();
    await db.run(
      `INSERT INTO game_configs (mode, rounds, round_timer_ms, inter_round_delay_ms, updated_at)
       VALUES ('ranked_freeplay', 3, 15000, 500, ?)`,
      [new Date().toISOString()]
    );

    const c = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' });
    expect(c.body.config.interRoundDelayMs).toBe(500);
    expect(c.body.config.rounds).toBe(3);
    await pause(60);
    await playRound(token, c.body.sessionId, c.body.round0);
    const tooEarly = await nextRound(token, c.body.sessionId);
    expect(tooEarly.status).toBe(425);
    expect(tooEarly.body.retryAfterMs).toBeGreaterThan(0);
    expect(tooEarly.headers['retry-after']).toBeDefined();
    await pause(550);
    const ok = await nextRound(token, c.body.sessionId);
    expect(ok.status).toBe(200);

    await db.run(`DELETE FROM game_configs WHERE mode = 'ranked_freeplay'`);
  });

  test('server-derived elapsed_ms wins over forged client_time_ms', async () => {
    const { token } = await registerUser('cheater');
    const c = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' });
    const sid = c.body.sessionId;
    await pause(150); // real elapsed ≥ 150ms
    const a = await agent
      .post(`/api/sessions/${sid}/answer`)
      .set(authH(token))
      .send({
        round_num: 0,
        puzzle_id: c.body.round0.puzzle.id,
        answer: c.body.round0.puzzle.options[0],
        client_time_ms: 51, // forged: pretend instant answer to maximise speed bonus
      });
    expect(a.status).toBe(200);
    expect(a.body.elapsed_ms).toBeGreaterThanOrEqual(150);
    // Score reflects the actual elapsed, not the forged 51ms.
    // Max single-round score (correct, ~0ms, streak 1) = 100 + 100 = 200.
    // With ~150ms elapsed of 15000ms budget, speed bonus = 100 - floor(100*150/15000) = 99
    // → score = 100 + 99 = 199. STRICTLY less than 200 (the ceiling that
    // unguarded forged client_time_ms would have produced).
    expect(a.body.runningScore).toBeLessThan(200);
    expect(a.body.runningScore).toBeGreaterThanOrEqual(195);
  });

  test('cross-midnight Ranked Daily: in-progress session created yesterday honors yesterday\'s daily_utc_date on finish', async () => {
    const { token, user } = await registerUser('crossmid2');
    const db = await getDb();
    // Create today's session normally.
    const c = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_daily' });
    expect(c.status).toBe(201);
    const sid = c.body.sessionId;
    const yesterdayUtc = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    // Simulate a session created pre-midnight: rewrite its daily_utc_date to
    // yesterday. The finish path must honor the SNAPSHOT, not "today".
    await db.run(`UPDATE ranked_sessions SET daily_utc_date = ? WHERE id = ?`, [yesterdayUtc, sid]);
    // Insert all 10 events directly (skip route validation — we're testing
    // /finish honors the snapshot, not the answer flow).
    const cfg = { rounds: 10, round_timer_ms: 15000, inter_round_delay_ms: 0 };
    const startedAt = new Date().toISOString();
    for (let r = 0; r < cfg.rounds; r++) {
      await db.run(
        `INSERT INTO ranked_session_events
           (session_id, round_num, puzzle_id, answer, correct,
            round_started_at, received_at, elapsed_ms, client_time_ms)
         VALUES (?, ?, ?, 'A', 1, ?, ?, 200, NULL)`,
        [sid, r, `tst-${String(r).padStart(3, '0')}`, startedAt, startedAt]
      );
    }
    // Drop in-process dispatched-round so /finish doesn't trip on stale state.
    require('../server/routes/sessions').__test.dispatchedRounds.delete(sid);
    const f = await agent.post(`/api/sessions/${sid}/finish`).set(authH(token));
    expect(f.status).toBe(200);
    // Today should still be eligible — today's daily must not collide with
    // yesterday's finished row.
    const today = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_daily' });
    expect(today.status).toBe(201);
    // Sanity: the row finished above retained yesterday's date.
    const row = await db.get(`SELECT daily_utc_date FROM ranked_sessions WHERE id = ?`, [sid]);
    expect(row.daily_utc_date).toBe(yesterdayUtc);
    // Cleanup user state for any later tests.
    void user;
  });

  test('cross-midnight Ranked Daily: yesterday\'s row does not block today', async () => {
    const { token, user } = await registerUser('crossmid');
    const db = await getDb();
    const yesterdayUtc = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    // Pre-create a finished daily for yesterday — must not block today's create.
    await db.run(
      `INSERT INTO ranked_sessions
         (id, user_id, mode, config_snapshot, status, score, correct_count,
          best_streak, started_at, finished_at, expires_at, daily_utc_date)
       VALUES (?, ?, 'ranked_daily', ?, 'finished', 100, 5, 3, ?, ?, ?, ?)`,
      [
        require('crypto').randomUUID(),
        user.id,
        JSON.stringify({ rounds: 10, round_timer_ms: 15000, inter_round_delay_ms: 0 }),
        new Date(Date.now() - 86400000).toISOString(),
        new Date(Date.now() - 86400000 + 60000).toISOString(),
        new Date(Date.now() - 86000000).toISOString(),
        yesterdayUtc,
      ]
    );
    const c = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_daily' });
    expect(c.status).toBe(201);
  });

  test('daily replay rejected: pre-existing finished daily for today → 409', async () => {
    const { token, user } = await registerUser('dailydup');
    const db = await getDb();
    const today = new Date().toISOString().slice(0, 10);
    await db.run(
      `INSERT INTO ranked_sessions
         (id, user_id, mode, config_snapshot, status, score, correct_count,
          best_streak, started_at, finished_at, expires_at, daily_utc_date)
       VALUES (?, ?, 'ranked_daily', ?, 'finished', 100, 5, 3, ?, ?, ?, ?)`,
      [
        require('crypto').randomUUID(),
        user.id,
        JSON.stringify({ rounds: 10, round_timer_ms: 15000, inter_round_delay_ms: 0 }),
        new Date().toISOString(),
        new Date().toISOString(),
        new Date(Date.now() + 60000).toISOString(),
        today,
      ]
    );
    const c = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_daily' });
    expect(c.status).toBe(409);
    expect(c.body.reason).toBe('already-played-daily');
  });

  test('concurrent active-session race: exactly one 201 + one 409', async () => {
    const { token } = await registerUser('racer');
    const [a, b] = await Promise.all([
      agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' }),
      agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.reason).toBe('active-session-exists');
  });

  test('in-band reconciliation: pre-expired in_progress row → reconciled to abandoned', async () => {
    const { token, user } = await registerUser('reconcile');
    const db = await getDb();
    const staleId = require('crypto').randomUUID();
    await db.run(
      `INSERT INTO ranked_sessions
         (id, user_id, mode, config_snapshot, status, started_at, expires_at)
       VALUES (?, ?, 'ranked_freeplay', ?, 'in_progress', ?, ?)`,
      [
        staleId, user.id,
        JSON.stringify({ rounds: 10, round_timer_ms: 15000, inter_round_delay_ms: 0 }),
        new Date(Date.now() - 600000).toISOString(),
        new Date(Date.now() - 60000).toISOString(), // expired 1 min ago
      ]
    );
    // POST /api/sessions reconciles, then succeeds.
    const c = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' });
    expect(c.status).toBe(201);
    const stale = await db.get('SELECT status FROM ranked_sessions WHERE id = ?', [staleId]);
    expect(stale.status).toBe('abandoned');
  });

  test('anti-cheat: out-of-order round_num → 400', async () => {
    const { token } = await registerUser('outoforder');
    const c = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' });
    await pause(60);
    const bad = await agent
      .post(`/api/sessions/${c.body.sessionId}/answer`)
      .set(authH(token))
      .send({ round_num: 5, puzzle_id: c.body.round0.puzzle.id, answer: 'A' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('out-of-order');
  });

  test('anti-cheat: timing-impossible (elapsed < 50ms) → 400', async () => {
    const { token } = await registerUser('toofast2');
    const c = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' });
    // Submit immediately, no pause: server-derived elapsed_ms < 50ms.
    const bad = await agent
      .post(`/api/sessions/${c.body.sessionId}/answer`)
      .set(authH(token))
      .send({ round_num: 0, puzzle_id: c.body.round0.puzzle.id, answer: 'A', client_time_ms: 60 });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('timing-impossible');
  });

  test('anti-cheat: expired session /answer → 410', async () => {
    const { token, user } = await registerUser('expireanswer');
    const c = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' });
    const db = await getDb();
    // Move expires_at into the past.
    await db.run(
      `UPDATE ranked_sessions SET expires_at = ? WHERE id = ? AND user_id = ?`,
      [new Date(Date.now() - 1000).toISOString(), c.body.sessionId, user.id]
    );
    await pause(60);
    const a = await agent
      .post(`/api/sessions/${c.body.sessionId}/answer`)
      .set(authH(token))
      .send({ round_num: 0, puzzle_id: c.body.round0.puzzle.id, answer: 'A' });
    // Reconciliation flips status to abandoned, which then short-circuits validation
    // either as 'expired' or 'not-in-progress'. Either is correct anti-cheat behaviour.
    expect([400, 410]).toContain(a.status);
    expect(['expired', 'not-in-progress']).toContain(a.body.error);
  });

  test('puzzle.answer is never returned through /api/sessions or /next-round', async () => {
    const { token } = await registerUser('answerleak');
    const c = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' });
    expect(c.body.round0.puzzle.answer).toBeUndefined();
    expect(JSON.stringify(c.body)).not.toMatch(/"answer":/);
    await pause(60);
    await playRound(token, c.body.sessionId, c.body.round0);
    const n = await nextRound(token, c.body.sessionId);
    expect(n.body.puzzle.answer).toBeUndefined();
    expect(JSON.stringify(n.body)).not.toMatch(/"answer":/);
  });

  test('finish before all rounds answered → 400', async () => {
    const { token } = await registerUser('earlyfinish');
    const c = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' });
    await pause(60);
    await playRound(token, c.body.sessionId, c.body.round0);
    const f = await agent.post(`/api/sessions/${c.body.sessionId}/finish`).set(authH(token)).send({});
    expect(f.status).toBe(400);
  });

  test('mode validation: missing/unknown mode → 400', async () => {
    const { token } = await registerUser('badmode');
    const r1 = await agent.post('/api/sessions').set(authH(token)).send({});
    expect(r1.status).toBe(400);
    const r2 = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'something_else' });
    expect(r2.status).toBe(400);
  });

  test('no auth → 401', async () => {
    const r = await agent.post('/api/sessions').send({ mode: 'ranked_freeplay' });
    expect(r.status).toBe(401);
  });
});

// ── Pure scoring service unit tests ──────────────────────────────────────

describe('CS52-3 — scoringService', () => {
  const svc = require('../server/services/scoringService');

  test('computeRoundScore: incorrect → 0 points, streak resets', () => {
    const r = svc.computeRoundScore({ correct: 0, elapsedMs: 100, streak: 5, roundTimerMs: 15000 });
    expect(r.pointsEarned).toBe(0);
    expect(r.newStreak).toBe(0);
  });

  test('computeRoundScore: correct fast answer at streak 0 → 100 base + ~100 bonus, ×1.0 mult', () => {
    const r = svc.computeRoundScore({ correct: 1, elapsedMs: 0, streak: 0, roundTimerMs: 15000 });
    expect(r.newStreak).toBe(1);
    expect(r.pointsEarned).toBe(200);
    expect(r.multiplier).toBe(1.0);
  });

  test('computeRoundScore: streak threshold ×1.5 kicks in at newStreak=3', () => {
    // streak 2 → newStreak 3 → multiplier 1.5
    const r = svc.computeRoundScore({ correct: 1, elapsedMs: 0, streak: 2, roundTimerMs: 15000 });
    expect(r.multiplier).toBe(1.5);
    expect(r.pointsEarned).toBe(Math.round(200 * 1.5));
  });

  test('computeRoundScore: streak threshold ×2.0 kicks in at newStreak=6', () => {
    const r = svc.computeRoundScore({ correct: 1, elapsedMs: 0, streak: 5, roundTimerMs: 15000 });
    expect(r.multiplier).toBe(2.0);
    expect(r.pointsEarned).toBe(Math.round(200 * 2.0));
  });

  test('computeFinalScore: aggregates 3 events with mixed correctness', () => {
    const events = [
      { correct: 1, elapsed_ms: 0 },
      { correct: 1, elapsed_ms: 0 },
      { correct: 0, elapsed_ms: 5000 },
    ];
    const r = svc.computeFinalScore(events, { round_timer_ms: 15000 });
    expect(r.correctCount).toBe(2);
    expect(r.bestStreak).toBe(2);
    expect(r.fastestAnswerMs).toBe(0);
    expect(r.score).toBe(400); // 200 + 200 + 0
  });

  test('validateAnswerEvent: rejects out-of-order', () => {
    const r = svc.validateAnswerEvent({
      session: { status: 'in_progress', expires_at: new Date(Date.now() + 60000).toISOString() },
      dispatchedRound: { round_num: 0, puzzle_id: 'p1', round_started_at_ms: Date.now() - 1000, puzzle: { id: 'p1', answer: 'A' } },
      roundNum: 5, puzzleId: 'p1', submittedAnswer: 'A',
      receivedAtMs: Date.now(), configSnapshot: { round_timer_ms: 15000 },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('out-of-order');
  });

  test('validateAnswerEvent: rejects timing-impossible (too fast)', () => {
    const start = Date.now();
    const r = svc.validateAnswerEvent({
      session: { status: 'in_progress', expires_at: new Date(start + 60000).toISOString() },
      dispatchedRound: { round_num: 0, puzzle_id: 'p1', round_started_at_ms: start, puzzle: { id: 'p1', answer: 'A' } },
      roundNum: 0, puzzleId: 'p1', submittedAnswer: 'A',
      receivedAtMs: start + 10, configSnapshot: { round_timer_ms: 15000 },
    });
    expect(r.error).toBe('timing-impossible');
  });

  test('validateAnswerEvent: ok path produces correct + elapsedMs', () => {
    const start = Date.now();
    const r = svc.validateAnswerEvent({
      session: { status: 'in_progress', expires_at: new Date(start + 60000).toISOString() },
      dispatchedRound: { round_num: 0, puzzle_id: 'p1', round_started_at_ms: start, puzzle: { id: 'p1', answer: 'A' } },
      roundNum: 0, puzzleId: 'p1', submittedAnswer: 'A',
      receivedAtMs: start + 500, configSnapshot: { round_timer_ms: 15000 },
    });
    expect(r.ok).toBe(true);
    expect(r.correct).toBe(1);
    expect(r.elapsedMs).toBe(500);
  });
});
