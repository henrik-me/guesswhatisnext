/**
 * CS52-7e — `pending_writes` durable queue + drain worker tests.
 *
 * Design contract:
 *   project/clickstops/active/active_cs52_server-authoritative-scoring.md
 *   § Decision #9 (DB-aware degradation) +
 *   § Schema migration sketch § pending_writes durable queue +
 *   § Tasks CS52-7e
 *
 * Scope:
 *   - /finish during db-unavailable returns 202 + writes Variant A file.
 *   - /sync during db-unavailable returns 202 + writes Variant B file
 *     (mutually exclusive with 200's acked/rejected/entities fields).
 *   - Drain replays files in queued_at order on the next successful API
 *     request (post-response hook) and on the unavailability state's
 *     non-null → null transition.
 *   - Idempotency:
 *       * Variant A: replay over a row already finished → file deleted,
 *         no new DB write.
 *       * Variant B: replay calls processRecord, which is already
 *         idempotent on (user_id, client_game_id).
 *       * Variant C: re-drain over a match_id with existing rows is a noop.
 *   - Failed file is moved to dead/.
 *   - No timer: drain only fires from real request handlers.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const supertest = require('supertest');

const SEED_PUZZLES = Array.from({ length: 20 }, (_, i) => ({
  id: `pw-${String(i).padStart(3, '0')}`,
  category: 'Test',
  prompt: { type: 'text', sequence: ['1', '2', '3'], explanation: 'next' },
  options: ['A', 'B', 'C', 'D'],
  answer: 'A',
  difficulty: 1,
}));

let server;
let agent;
let tmpDir;
let dataDir;

function clearServerCache() {
  const serverDir = path.resolve(__dirname, '..', 'server');
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(serverDir)) delete require.cache[k];
  }
}

async function bootServer() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwn-cs52-7e-'));
  dataDir = tmpDir;
  process.env.GWN_DB_PATH = path.join(tmpDir, 'cs52-7e.db');
  process.env.GWN_DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';

  clearServerCache();

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
      `INSERT INTO ranked_puzzles (id, category, prompt, options, answer, difficulty, status, created_at)
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
    await new Promise((r, rej) => server.close((e) => (e ? rej(e) : r())));
    server = null;
    agent = null;
  }
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
  delete process.env.GWN_DB_PATH;
  delete process.env.GWN_DATA_DIR;
}

async function getDb() {
  const { getDbAdapter } = require('../server/db');
  return getDbAdapter();
}

async function registerUser(username) {
  const bcrypt = require('bcryptjs');
  const { generateToken } = require('../server/middleware/auth');
  const db = await getDb();
  const hash = bcrypt.hashSync('pw-very-long-1', 4);
  const result = await db.run(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)',
    [username, hash]
  );
  const user = { id: result.lastId, username, role: 'user' };
  const token = require('../server/middleware/auth').generateToken(user);
  // touch generateToken reference to silence unused-var warnings in some tooling
  void generateToken;
  return { user, token };
}

function authH(token) { return { Authorization: `Bearer ${token}` }; }

const PENDING_DIR_NAME = 'pending-writes';
function pendingPath() { return path.join(dataDir, PENDING_DIR_NAME); }
function deadPath() { return path.join(pendingPath(), 'dead'); }

async function listPending() {
  if (!fs.existsSync(pendingPath())) return [];
  return (await fsp.readdir(pendingPath())).filter((f) => f.endsWith('.json'));
}
async function listDead() {
  if (!fs.existsSync(deadPath())) return [];
  return (await fsp.readdir(deadPath())).filter((f) => f.endsWith('.json'));
}
async function readPending(name) {
  return JSON.parse(await fsp.readFile(path.join(pendingPath(), name), 'utf8'));
}

function setUnavailable() {
  const m = require('../server/lib/db-unavailability-state');
  m.setDbUnavailabilityState({ reason: 'capacity-exhausted', message: 'test-only' });
}
function clearUnavailable() {
  const m = require('../server/lib/db-unavailability-state');
  m.setDbUnavailabilityState(null);
}

async function pause(ms) { return new Promise((r) => setTimeout(r, ms)); }

beforeAll(bootServer, 30000);
afterAll(shutdown);

beforeEach(async () => {
  // Reset in-process dispatched-round state and queue dirs between tests.
  const sessions = require('../server/routes/sessions');
  if (sessions.__test) sessions.__test.resetState();
  if (fs.existsSync(pendingPath())) {
    fs.rmSync(pendingPath(), { recursive: true, force: true });
  }
  clearUnavailable();
});

// ────────────────────────────────────────────────────────────────────────

describe('CS52-7e — POST /api/sessions/:id/finish under db-unavailable', () => {
  test('returns 202 + queuedRequestId and writes a Variant A file', async () => {
    const { token } = await registerUser('pw-finish');
    const create = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' });
    expect(create.status).toBe(201);
    const sessionId = create.body.sessionId;

    setUnavailable();
    const finish = await agent.post(`/api/sessions/${sessionId}/finish`).set(authH(token)).send({});
    expect(finish.status).toBe(202);
    expect(finish.body.queuedRequestId).toMatch(/[0-9a-f-]{36}/);
    expect(finish.body.retryAfterMs).toBe(5000);
    expect(finish.body.unavailable).toBe(true);
    // 202 must NOT contain 200-shape success fields.
    expect(finish.body.score).toBeUndefined();
    expect(finish.body.correctCount).toBeUndefined();

    const files = await listPending();
    expect(files.length).toBe(1);
    const record = await readPending(files[0]);
    expect(record.endpoint).toBe('POST /api/sessions/:id/finish');
    expect(record.concrete_route.session_id).toBe(sessionId);
    expect(typeof record.user_id).toBe('number');
    expect(record.schema_version).toBe(1);
    expect(record.queued_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('CS52-7e — POST /api/sync under db-unavailable', () => {
  test('returns 202 + queuedRequestIds and writes a Variant B file (mutually exclusive with 200 fields)', async () => {
    const { token } = await registerUser('pw-sync-202');
    setUnavailable();

    const records = [
      {
        client_game_id: 'cg-202-1',
        mode: 'freeplay', variant: 'freeplay',
        score: 100, correct_count: 5, total_rounds: 10, best_streak: 3,
        completed_at: '2026-04-25T12:00:00Z', schema_version: 1,
      },
      {
        client_game_id: 'cg-202-2',
        mode: 'daily', variant: 'daily',
        score: 200, correct_count: 7, total_rounds: 10, best_streak: 4,
        completed_at: '2026-04-25T12:01:00Z', schema_version: 1,
      },
    ];
    const res = await agent
      .post('/api/sync')
      .set(authH(token))
      .set('X-User-Activity', '1')
      .send({ queuedRecords: records, revalidate: { profile: null } });
    expect(res.status).toBe(202);
    expect(Array.isArray(res.body.queuedRequestIds)).toBe(true);
    expect(res.body.queuedRequestIds.length).toBe(1);
    expect(res.body.retryAfterMs).toBe(5000);
    expect(res.body.unavailable).toBe(true);
    // Mutual exclusivity with the 200 shape.
    expect(res.body.acked).toBeUndefined();
    expect(res.body.rejected).toBeUndefined();
    expect(res.body.entities).toBeUndefined();

    const files = await listPending();
    expect(files.length).toBe(1);
    const record = await readPending(files[0]);
    expect(record.endpoint).toBe('POST /api/sync');
    expect(record.payload.queuedRecords).toHaveLength(2);
    expect(record.client_game_ids).toEqual(['cg-202-1', 'cg-202-2']);
  });
});

describe('CS52-7e — drain on next successful request', () => {
  test('Variant A + Variant B replay in queued_at order on the next successful request', async () => {
    const { token, user } = await registerUser('pw-drain');

    // Set up a finished-rounds session ready to be /finished.
    const create = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' });
    const sessionId = create.body.sessionId;
    let round = create.body.round0;
    for (let i = 0; i < 10; i++) {
      await pause(60);
      await agent.post(`/api/sessions/${sessionId}/answer`).set(authH(token)).send({
        round_num: round.round_num,
        puzzle_id: round.puzzle.id,
        answer: round.puzzle.options[0],
        client_time_ms: 1000,
      });
      if (i < 9) {
        const nxt = await agent.post(`/api/sessions/${sessionId}/next-round`).set(authH(token)).send({});
        round = nxt.body;
      }
    }

    setUnavailable();

    // Enqueue Variant B first (older queued_at).
    const sync = await agent
      .post('/api/sync')
      .set(authH(token))
      .set('X-User-Activity', '1')
      .send({
        queuedRecords: [{
          client_game_id: 'cg-drain-1',
          mode: 'freeplay', variant: 'freeplay',
          score: 555, correct_count: 5, total_rounds: 10, best_streak: 2,
          completed_at: '2026-04-25T12:00:00Z', schema_version: 1,
        }],
      });
    expect(sync.status).toBe(202);
    await pause(20);

    // Enqueue Variant A.
    const finish = await agent.post(`/api/sessions/${sessionId}/finish`).set(authH(token)).send({});
    expect(finish.status).toBe(202);

    expect((await listPending()).length).toBe(2);

    // DB returns. The next successful API request triggers the drain.
    clearUnavailable();
    const next = await agent.get('/api/features');
    expect(next.status).toBe(200);

    // Drain runs via res.on('finish'); give it a moment to settle.
    await pause(300);

    // Both files drained.
    expect((await listPending()).length).toBe(0);
    expect((await listDead()).length).toBe(0);

    const db = await getDb();
    const sessionRow = await db.get(
      `SELECT status, score FROM ranked_sessions WHERE id = ?`,
      [sessionId]
    );
    expect(sessionRow.status).toBe('finished');
    expect(sessionRow.score).toBeGreaterThan(0);

    const scoreRow = await db.get(
      `SELECT score, source, variant FROM scores WHERE user_id = ? AND client_game_id = ?`,
      [user.id, 'cg-drain-1']
    );
    expect(scoreRow).toBeTruthy();
    expect(scoreRow.score).toBe(555);
    expect(scoreRow.source).toBe('offline');

    // Plus a ranked scores row from the /finish replay.
    const rankedRow = await db.get(
      `SELECT score, source FROM scores WHERE user_id = ? AND source = 'ranked'`,
      [user.id]
    );
    expect(rankedRow).toBeTruthy();
  });

  test('Variant A idempotency: replay against an already-finished session is a noop', async () => {
    const { token } = await registerUser('pw-idem-A');
    const create = await agent.post('/api/sessions').set(authH(token)).send({ mode: 'ranked_freeplay' });
    const sessionId = create.body.sessionId;
    let round = create.body.round0;
    for (let i = 0; i < 10; i++) {
      await pause(60);
      await agent.post(`/api/sessions/${sessionId}/answer`).set(authH(token)).send({
        round_num: round.round_num,
        puzzle_id: round.puzzle.id,
        answer: round.puzzle.options[0],
        client_time_ms: 1000,
      });
      if (i < 9) {
        const nxt = await agent.post(`/api/sessions/${sessionId}/next-round`).set(authH(token)).send({});
        round = nxt.body;
      }
    }
    // Live finish.
    const live = await agent.post(`/api/sessions/${sessionId}/finish`).set(authH(token)).send({});
    expect(live.status).toBe(200);
    const db = await getDb();
    const before = await db.all(`SELECT id FROM scores WHERE source = 'ranked'`);

    // Now hand-craft a stale Variant A file as if the live response was lost.
    const pendingWrites = require('../server/lib/pending-writes');
    pendingWrites.__resetForTests();
    await pendingWrites.enqueue({
      endpoint: 'POST /api/sessions/:id/finish',
      concrete_route: { session_id: sessionId },
      user_id: live.body.score != null ? (await db.get(`SELECT user_id FROM ranked_sessions WHERE id=?`, [sessionId])).user_id : 0,
      payload: {},
    });
    expect((await listPending()).length).toBe(1);

    // Trigger drain via a successful request.
    const trig = await agent.get('/api/features');
    expect(trig.status).toBe(200);
    await pause(200);

    // File deleted, no extra ranked row inserted.
    expect((await listPending()).length).toBe(0);
    expect((await listDead()).length).toBe(0);
    const after = await db.all(`SELECT id FROM scores WHERE source = 'ranked'`);
    expect(after.length).toBe(before.length);
  });
});

describe('CS52-7e — Variant C drain (multiplayer match completion)', () => {
  test('synthetic Variant C with 2 participants → 2 ranked_sessions rows + N events; idempotent on match_id', async () => {
    const { user: u1 } = await registerUser('mp-1');
    const { user: u2 } = await registerUser('mp-2');
    const matchId = `match-${Date.now()}`;
    const sess1 = '11111111-1111-1111-1111-111111111111';
    const sess2 = '22222222-2222-2222-2222-222222222222';
    const startedAt = new Date().toISOString();
    const finishedAt = new Date().toISOString();

    // Manually pre-seed the matches row so the FK in ranked_sessions can resolve
    // (FK in 008 ranked_sessions doesn't reference matches; ranked_sessions.match_id
    // is just an indexed nullable column — we still create the file & drain it).
    const pendingWrites = require('../server/lib/pending-writes');
    pendingWrites.__resetForTests();
    await pendingWrites.enqueue({
      endpoint: 'INTERNAL multiplayer-match-completion',
      concrete_route: { match_id: matchId, room_code: 'CODE' },
      user_id: null,
      payload: {
        config_snapshot: { rounds: 2, round_timer_ms: 20000, inter_round_delay_ms: 0 },
        started_at: startedAt,
        finished_at: finishedAt,
        participants: [
          {
            user_id: u1.id,
            ranked_session_id: sess1,
            score: 100, correct_count: 2, best_streak: 2,
            events: [
              { round_num: 0, puzzle_id: 'pw-000', answer: 'A', correct: 1,
                round_started_at: startedAt, received_at: startedAt, elapsed_ms: 1000, client_time_ms: 1000 },
              { round_num: 1, puzzle_id: 'pw-001', answer: 'A', correct: 1,
                round_started_at: startedAt, received_at: startedAt, elapsed_ms: 1100, client_time_ms: 1100 },
            ],
          },
          {
            user_id: u2.id,
            ranked_session_id: sess2,
            score: 50, correct_count: 1, best_streak: 1,
            events: [
              { round_num: 0, puzzle_id: 'pw-000', answer: 'B', correct: 0,
                round_started_at: startedAt, received_at: startedAt, elapsed_ms: 2000, client_time_ms: 2000 },
              { round_num: 1, puzzle_id: 'pw-001', answer: 'A', correct: 1,
                round_started_at: startedAt, received_at: startedAt, elapsed_ms: 1500, client_time_ms: 1500 },
            ],
          },
        ],
      },
    });

    expect((await listPending()).length).toBe(1);

    // Trigger drain via a successful request.
    const trig = await agent.get('/api/features');
    expect(trig.status).toBe(200);
    await pause(200);

    expect((await listPending()).length).toBe(0);
    expect((await listDead()).length).toBe(0);

    const db = await getDb();
    const rows = await db.all(`SELECT id, user_id, score, match_id FROM ranked_sessions WHERE match_id = ?`, [matchId]);
    expect(rows.length).toBe(2);
    const events = await db.all(
      `SELECT session_id, round_num FROM ranked_session_events WHERE session_id IN (?, ?)`,
      [sess1, sess2]
    );
    expect(events.length).toBe(4); // 2 participants × 2 events

    // Re-drain: enqueue the same file again → should be idempotent (no duplicates).
    await pendingWrites.enqueue({
      endpoint: 'INTERNAL multiplayer-match-completion',
      concrete_route: { match_id: matchId, room_code: 'CODE' },
      user_id: null,
      payload: {
        config_snapshot: { rounds: 2, round_timer_ms: 20000, inter_round_delay_ms: 0 },
        started_at: startedAt,
        finished_at: finishedAt,
        participants: [{
          user_id: u1.id, ranked_session_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          score: 0, correct_count: 0, best_streak: 0, events: [],
        }],
      },
    });
    const trig2 = await agent.get('/api/features');
    expect(trig2.status).toBe(200);
    await pause(200);

    expect((await listPending()).length).toBe(0);
    const stillTwo = await db.all(`SELECT id FROM ranked_sessions WHERE match_id = ?`, [matchId]);
    expect(stillTwo.length).toBe(2); // no duplicate insertion
  });
});

describe('CS52-7e — failed file moves to dead/', () => {
  test('an unparseable endpoint dead-letters', async () => {
    const pendingWrites = require('../server/lib/pending-writes');
    pendingWrites.__resetForTests();
    await pendingWrites.enqueue({
      endpoint: 'NOT-A-REAL-ENDPOINT',
      concrete_route: {},
      user_id: 1,
      payload: {},
    });
    expect((await listPending()).length).toBe(1);

    const trig = await agent.get('/api/features');
    expect(trig.status).toBe(200);
    await pause(200);

    expect((await listPending()).length).toBe(0);
    const dead = await listDead();
    expect(dead.length).toBe(1);
    // Original content preserved.
    const text = await fsp.readFile(path.join(deadPath(), dead[0]), 'utf8');
    const record = JSON.parse(text);
    expect(record.endpoint).toBe('NOT-A-REAL-ENDPOINT');
  });
});

describe('CS52-7e — no-timer property', () => {
  test('drain does NOT fire on a clean boot when no requests arrive', async () => {
    // Boot is already done in beforeAll. Verify no accidental drain timer is
    // wired up: no pending-writes module APIs reference setInterval/setTimeout
    // for drain, and a freshly-enqueued file remains untouched until a real
    // request triggers the drain.
    const pendingWrites = require('../server/lib/pending-writes');
    pendingWrites.__resetForTests();
    await pendingWrites.enqueue({
      endpoint: 'POST /api/sync',
      concrete_route: {},
      user_id: 1,
      payload: { queuedRecords: [], revalidate: {} },
      client_game_ids: [],
    });
    expect((await listPending()).length).toBe(1);
    // Wait noticeably longer than any plausible polling interval.
    await pause(800);
    expect((await listPending()).length).toBe(1);

    // Static source check: the pending-writes module must not register a
    // setInterval/setTimeout (other than ad-hoc test fixtures). This is a
    // belt-and-braces complement to runtime evidence.
    const src = await fsp.readFile(
      path.resolve(__dirname, '..', 'server', 'lib', 'pending-writes.js'),
      'utf8'
    );
    expect(src).not.toMatch(/setInterval\s*\(/);
    expect(src).not.toMatch(/setTimeout\s*\(/);
    const replaySrc = await fsp.readFile(
      path.resolve(__dirname, '..', 'server', 'services', 'pending-writes-replay.js'),
      'utf8'
    );
    expect(replaySrc).not.toMatch(/setInterval\s*\(/);
    expect(replaySrc).not.toMatch(/setTimeout\s*\(/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Copilot R1 fixes
// ────────────────────────────────────────────────────────────────────────

describe('CS52-7e R1 — /finish enqueue rejects invalid session id', () => {
  test('non-UUID sessionId returns 400 and does NOT write a queue file', async () => {
    const { token } = await registerUser('pw-finish-bad-id');
    setUnavailable();
    const r = await agent
      .post('/api/sessions/not-a-uuid/finish')
      .set(authH(token))
      .send({});
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/invalid session id/i);
    expect((await listPending()).length).toBe(0);
  });
});

describe('CS52-7e R1 — pending_writes queue depth backpressure', () => {
  test('enqueue throws PENDING_WRITES_QUEUE_FULL once depth >= max', async () => {
    const pendingWrites = require('../server/lib/pending-writes');
    pendingWrites.__resetForTests();
    process.env.PENDING_WRITES_MAX_DEPTH = '3';
    try {
      for (let i = 0; i < 3; i++) {
        await pendingWrites.enqueue({
          endpoint: 'POST /api/sync',
          concrete_route: {},
          user_id: 1,
          payload: { queuedRecords: [], revalidate: {} },
          client_game_ids: [],
        });
      }
      let err;
      try {
        await pendingWrites.enqueue({
          endpoint: 'POST /api/sync',
          concrete_route: {},
          user_id: 1,
          payload: { queuedRecords: [], revalidate: {} },
          client_game_ids: [],
        });
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.code).toBe('PENDING_WRITES_QUEUE_FULL');
      expect(err.depth).toBe(3);
      expect(err.max).toBe(3);
      // The 4th enqueue must NOT have written a file.
      expect((await listPending()).length).toBe(3);
    } finally {
      delete process.env.PENDING_WRITES_MAX_DEPTH;
    }
  });

  test('/api/sync route maps queue-full to 503 + Retry-After', async () => {
    const { token } = await registerUser('pw-sync-full');
    const pendingWrites = require('../server/lib/pending-writes');
    pendingWrites.__resetForTests();
    // Pre-fill queue to the cap.
    process.env.PENDING_WRITES_MAX_DEPTH = '1';
    try {
      await pendingWrites.enqueue({
        endpoint: 'POST /api/sync',
        concrete_route: {},
        user_id: 999,
        payload: { queuedRecords: [], revalidate: {} },
        client_game_ids: [],
      });
      setUnavailable();
      const r = await agent
        .post('/api/sync')
        .set(authH(token))
        .set('X-User-Activity', '1')
        .send({
          queuedRecords: [
            {
              client_game_id: 'cg-1',
              completed_at: new Date().toISOString(),
              mode: 'ranked_freeplay',
              score: 10,
              correct_count: 1,
              best_streak: 1,
            },
          ],
          revalidate: {},
        });
      expect(r.status).toBe(503);
      expect(r.headers['retry-after']).toBe('30');
      expect(r.body.error).toMatch(/overloaded/i);
    } finally {
      delete process.env.PENDING_WRITES_MAX_DEPTH;
    }
  });
});

describe('CS52-7e R1 — replay cleanup error aborts drain', () => {
  test('non-ENOENT unlink failure stops drain and leaves remaining files in place', async () => {
    const pendingWrites = require('../server/lib/pending-writes');
    pendingWrites.__resetForTests();

    await pendingWrites.enqueue({
      endpoint: 'TEST_ENDPOINT',
      concrete_route: {},
      user_id: 1,
      payload: {},
    });
    await pendingWrites.enqueue({
      endpoint: 'TEST_ENDPOINT',
      concrete_route: {},
      user_id: 1,
      payload: {},
    });
    expect((await listPending()).length).toBe(2);

    // Replay handler succeeds, but we simulate a non-ENOENT unlink failure
    // by stubbing fsp.unlink for this drain pass.
    const fsPromises = require('fs/promises');
    const realUnlink = fsPromises.unlink;
    fsPromises.unlink = async () => {
      const err = new Error('simulated EACCES');
      err.code = 'EACCES';
      throw err;
    };
    let result;
    try {
      result = await pendingWrites.drainOnce({
        replayHandlers: { TEST_ENDPOINT: async () => {} },
      });
    } finally {
      fsPromises.unlink = realUnlink;
    }
    // First file's handler succeeded but unlink failed → drain aborts.
    // Second file is left in place for next drain.
    expect(result.drained).toBe(0);
    expect((await listPending()).length).toBe(2);
  });
});
