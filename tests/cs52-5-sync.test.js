/**
 * CS52-5 — POST /api/sync server tests.
 *
 * Covers:
 *   - happy path (queuedRecords ack + revalidate entities)
 *   - payload-hash conflict (same client_game_id, different payload → rejected)
 *   - payload-hash idempotent retry (same payload → acked)
 *   - X-User-Activity header is required
 *   - achievement evaluation skipped for offline-source records
 *   - source filter on legacy /api/scores/leaderboard
 */

const { getAgent, getAgentNoActivity, setup, teardown, registerUser } = require('./helper');

let userToken;

beforeAll(async () => {
  await setup();
  const reg = await registerUser('syncuser');
  userToken = reg.token;
});

afterAll(teardown);

function authedSync(body, headers = {}) {
  return getAgent()
    .post('/api/sync')
    .set('Authorization', `Bearer ${userToken}`)
    .set('X-User-Activity', '1')
    .set('Content-Type', 'application/json')
    .set(headers)
    .send(body);
}

describe('POST /api/sync — boot-quiet enforcement', () => {
  test('returns 400 when X-User-Activity header is missing', async () => {
    const res = await getAgentNoActivity()
      .post('/api/sync')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ queuedRecords: [], revalidate: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/X-User-Activity/);
  });

  test('returns 401 without auth', async () => {
    const res = await getAgent()
      .post('/api/sync')
      .set('X-User-Activity', '1')
      .send({ queuedRecords: [], revalidate: {} });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/sync — queuedRecords write path', () => {
  test('happy path: new records are acked', async () => {
    const records = [
      {
        client_game_id: 'cg-1',
        mode: 'freeplay',
        variant: 'freeplay',
        score: 1234,
        correct_count: 8,
        total_rounds: 10,
        best_streak: 5,
        fastest_answer_ms: 1500,
        completed_at: '2026-04-25T12:00:00Z',
        schema_version: 1,
      },
      {
        client_game_id: 'cg-2',
        mode: 'daily',
        variant: 'daily',
        score: 999,
        correct_count: 7,
        total_rounds: 10,
        best_streak: 3,
        completed_at: '2026-04-25T12:01:00Z',
        schema_version: 1,
      },
    ];
    const res = await authedSync({ queuedRecords: records, revalidate: {} });
    expect(res.status).toBe(200);
    expect(res.body.acked.sort()).toEqual(['cg-1', 'cg-2']);
    expect(res.body.rejected).toEqual([]);
    expect(res.body.entities).toEqual({});
  });

  test('idempotent retry: same client_game_id + same payload → acked again', async () => {
    const rec = {
      client_game_id: 'cg-1',
      mode: 'freeplay',
      variant: 'freeplay',
      score: 1234,
      correct_count: 8,
      total_rounds: 10,
      best_streak: 5,
      fastest_answer_ms: 1500,
      completed_at: '2026-04-25T12:00:00Z',
      schema_version: 1,
    };
    const res = await authedSync({ queuedRecords: [rec] });
    expect(res.status).toBe(200);
    expect(res.body.acked).toEqual(['cg-1']);
    expect(res.body.rejected).toEqual([]);
  });

  test('payload-hash conflict: same client_game_id + different payload → rejected', async () => {
    const rec = {
      client_game_id: 'cg-1',
      mode: 'freeplay',
      variant: 'freeplay',
      score: 5555, // different score
      correct_count: 8,
      total_rounds: 10,
      best_streak: 5,
      fastest_answer_ms: 1500,
      completed_at: '2026-04-25T12:00:00Z',
      schema_version: 1,
    };
    const res = await authedSync({ queuedRecords: [rec] });
    expect(res.status).toBe(200);
    expect(res.body.acked).toEqual([]);
    expect(res.body.rejected).toEqual([
      { client_game_id: 'cg-1', reason: 'conflict_with_existing' },
    ]);
  });

  test('canonical completed_at: same instant in different surface forms is idempotent (not conflict)', async () => {
    // Regression for Copilot R5 #2: payload_hash used String(completed_at)
    // directly so "...:00Z" vs "...:00.000Z" hashed differently and a
    // benign retry from a client that sent the un-suffixed form would be
    // misclassified as conflict_with_existing. The hash now normalizes via
    // new Date(...).toISOString() to match the persisted played_at.
    const equivalent = {
      client_game_id: 'cg-1',
      mode: 'freeplay',
      variant: 'freeplay',
      score: 1234,
      correct_count: 8,
      total_rounds: 10,
      best_streak: 5,
      fastest_answer_ms: 1500,
      // Same instant as the seed record above, expressed with explicit ms.
      completed_at: '2026-04-25T12:00:00.000Z',
      schema_version: 1,
    };
    const res = await authedSync({ queuedRecords: [equivalent] });
    expect(res.status).toBe(200);
    expect(res.body.acked).toEqual(['cg-1']);
    expect(res.body.rejected).toEqual([]);
  });

  test('skips invalid records (missing client_game_id)', async () => {
    const res = await authedSync({ queuedRecords: [{ score: 100 }] });
    expect(res.status).toBe(200);
    expect(res.body.acked).toEqual([]);
  });

  test('rejects records with unsupported mode (matches legacy /api/scores validator)', async () => {
    // Regression for Copilot R6 #2: previously the route accepted any
    // raw.mode and persisted it into scores.mode, polluting downstream
    // profile/leaderboard queries.
    const res = await authedSync({
      queuedRecords: [{
        client_game_id: 'bad-mode-1',
        mode: 'multiplayer-trivia', // not in {freeplay, daily}
        score: 100,
        correct_count: 5,
        total_rounds: 10,
        best_streak: 2,
        schema_version: 1,
        completed_at: '2026-04-25T13:00:00Z',
      }],
    });
    expect(res.status).toBe(200);
    expect(res.body.acked).toEqual([]);
    expect(res.body.rejected).toEqual([
      { client_game_id: 'bad-mode-1', reason: 'invalid_payload' },
    ]);
  });

  test('rejects oversized batch (> MAX_QUEUED_RECORDS)', async () => {
    const records = Array.from({ length: 51 }, (_, i) => ({
      client_game_id: `bulk-${i}`,
      mode: 'freeplay',
      score: 1,
      correct_count: 0,
      total_rounds: 1,
      best_streak: 0,
      schema_version: 1,
    }));
    const res = await authedSync({ queuedRecords: records });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/sync — revalidate read path', () => {
  test('returns profile + leaderboard entities', async () => {
    const res = await authedSync({
      queuedRecords: [],
      revalidate: {
        profile: { since: null },
        'leaderboard:freeplay:offline': { since: null },
        'leaderboard:daily:offline': { since: null },
        achievements: { since: null },
        notifications: { since: null },
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.entities).toBeDefined();
    expect(res.body.entities.profile).toBeDefined();
    expect(Array.isArray(res.body.entities.profile.stats)).toBe(true);
    expect(res.body.entities['leaderboard:freeplay:offline']).toBeDefined();
    expect(Array.isArray(res.body.entities['leaderboard:freeplay:offline'].rows)).toBe(true);
    // cg-1 (freeplay) was inserted offline above
    const fpRows = res.body.entities['leaderboard:freeplay:offline'].rows;
    expect(fpRows.some(r => r.username === 'syncuser')).toBe(true);
  });

  test('ignores unknown revalidate keys (no error)', async () => {
    const res = await authedSync({
      queuedRecords: [],
      revalidate: { bogus: { since: null } },
    });
    expect(res.status).toBe(200);
    expect(res.body.entities).toEqual({});
  });
});

describe('POST /api/sync — achievement evaluation skipped for offline', () => {
  test('offline-source insert does NOT unlock achievements', async () => {
    // Reuse helper to register a fresh user, then submit a "perfect game"
    // (10/10) via /api/sync. /api/scores would have triggered the
    // first-game / perfect-streak achievements; /api/sync must not.
    const fresh = await registerUser('offlineachieve', 'pw1234567');
    const beforeRes = await getAgent()
      .get('/api/achievements/me')
      .set('Authorization', `Bearer ${fresh.token}`);
    const beforeCount = beforeRes.body.achievements.length;

    const res = await getAgent()
      .post('/api/sync')
      .set('Authorization', `Bearer ${fresh.token}`)
      .set('X-User-Activity', '1')
      .send({
        queuedRecords: [{
          client_game_id: 'perfect-1',
          mode: 'freeplay',
          variant: 'freeplay',
          score: 9999,
          correct_count: 10,
          total_rounds: 10,
          best_streak: 10,
          fastest_answer_ms: 800,
          completed_at: '2026-04-25T12:30:00Z',
          schema_version: 1,
        }],
      });
    expect(res.status).toBe(200);
    expect(res.body.acked).toEqual(['perfect-1']);
    expect(res.body.newAchievements).toBeUndefined(); // no field at all

    const afterRes = await getAgent()
      .get('/api/achievements/me')
      .set('Authorization', `Bearer ${fresh.token}`);
    expect(afterRes.body.achievements.length).toBe(beforeCount);
  });
});

describe('GET /api/scores/leaderboard — source filter (CS52-5/6)', () => {
  test('source=offline returns only offline records', async () => {
    const res = await getAgent().get('/api/scores/leaderboard?variant=freeplay&source=offline');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('offline');
    for (const row of res.body.leaderboard) {
      expect(row.source).toBe('offline');
    }
  });

  test('source=ranked excludes offline records', async () => {
    const res = await getAgent().get('/api/scores/leaderboard?variant=freeplay&source=ranked');
    expect(res.status).toBe(200);
    for (const row of res.body.leaderboard) {
      expect(row.source).toBe('ranked');
    }
  });

  test('source=all returns ranked + offline (legacy excluded)', async () => {
    const res = await getAgent().get('/api/scores/leaderboard?variant=freeplay&source=all');
    expect(res.status).toBe(200);
    for (const row of res.body.leaderboard) {
      expect(['ranked', 'offline']).toContain(row.source);
    }
  });

  test('CS52-6: omitting source defaults to ranked (no longer null)', async () => {
    const res = await getAgent().get('/api/scores/leaderboard?variant=freeplay');
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('ranked');
  });

  test('CS52-6: invalid source returns 400 (no longer 200 + null)', async () => {
    const res = await getAgent().get('/api/scores/leaderboard?variant=freeplay&source=garbage-value');
    expect(res.status).toBe(400);
  });
});

describe('completed_at persistence', () => {
  test('offline record persists completed_at as played_at (not sync time)', async () => {
    const fresh = await registerUser('playedatuser');
    const completedAt = '2025-01-15T08:30:00.000Z';
    const res = await getAgent()
      .post('/api/sync')
      .set('Authorization', `Bearer ${fresh.token}`)
      .set('X-User-Activity', '1')
      .send({
        queuedRecords: [{
          client_game_id: 'cg-played-at-1',
          mode: 'freeplay',
          variant: 'freeplay',
          score: 500,
          correct_count: 5,
          total_rounds: 10,
          best_streak: 2,
          completed_at: completedAt,
          schema_version: 1,
        }],
        revalidate: {},
      });
    expect(res.status).toBe(200);
    expect(res.body.acked).toContain('cg-played-at-1');
    // Read it back and confirm played_at matches completed_at to the second.
    const { getDbAdapter } = require('../server/db');
    const db = await getDbAdapter();
    const row = await db.get(
      'SELECT played_at FROM scores WHERE user_id = ? AND client_game_id = ?',
      [fresh.user.id, 'cg-played-at-1']
    );
    const got = new Date(row.played_at).toISOString().slice(0, 19);
    expect(got).toBe(completedAt.slice(0, 19));
  });

  // Copilot R1 #6: malformed completed_at must reject the record (not stall it
  // in L1 forever, not silently insert garbage). Reason classified as
  // invalid_payload so the client can surface the rejection cleanly.
  test('malformed completed_at is rejected with invalid_payload reason', async () => {
    const fresh = await registerUser('badtsuser');
    const res = await getAgent()
      .post('/api/sync')
      .set('Authorization', `Bearer ${fresh.token}`)
      .set('X-User-Activity', '1')
      .send({
        queuedRecords: [{
          client_game_id: 'cg-bad-ts-1',
          mode: 'freeplay',
          variant: 'freeplay',
          score: 100,
          correct_count: 1,
          total_rounds: 5,
          best_streak: 1,
          completed_at: 'not-a-date',
          schema_version: 1,
        }],
        revalidate: {},
      });
    expect(res.status).toBe(200);
    expect(res.body.acked).toEqual([]);
    expect(res.body.rejected).toEqual([
      { client_game_id: 'cg-bad-ts-1', reason: 'invalid_payload' },
    ]);
  });
});

describe('payload_hash deterministic', () => {
  test('same input produces same hash regardless of key order', () => {
    const { computePayloadHash } = require('../server/routes/sync');
    const a = computePayloadHash(42, {
      client_game_id: 'x',
      mode: 'freeplay',
      score: 100,
      correct_count: 5,
      total_rounds: 10,
      best_streak: 2,
      fastest_answer_ms: 1000,
      completed_at: '2026-04-25T00:00:00Z',
      schema_version: 1,
    });
    const b = computePayloadHash(42, {
      schema_version: 1,
      best_streak: 2,
      total_rounds: 10,
      correct_count: 5,
      score: 100,
      mode: 'freeplay',
      client_game_id: 'x',
      completed_at: '2026-04-25T00:00:00Z',
      fastest_answer_ms: 1000,
    });
    expect(a).toBe(b);
  });

  test('different score → different hash', () => {
    const { computePayloadHash } = require('../server/routes/sync');
    const base = {
      client_game_id: 'x', mode: 'freeplay', score: 100, correct_count: 5,
      total_rounds: 10, best_streak: 2, schema_version: 1,
      completed_at: '2026-04-25T00:00:00Z',
    };
    const a = computePayloadHash(42, base);
    const b = computePayloadHash(42, { ...base, score: 101 });
    expect(a).not.toBe(b);
  });
});
