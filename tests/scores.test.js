/**
 * Scores & Leaderboard API smoke tests.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

let userToken;

beforeAll(async () => {
  await setup();
  const { token } = await registerUser('scoreuser');
  userToken = token;
});

afterAll(teardown);

describe('POST /api/scores', () => {
  test('submits a score', async () => {
    const res = await getAgent()
      .post('/api/scores')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        mode: 'freeplay',
        score: 150,
        correctCount: 8,
        totalRounds: 10,
        bestStreak: 5,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(Array.isArray(res.body.newAchievements)).toBe(true);
  });

  test('rejects missing mode', async () => {
    const res = await getAgent()
      .post('/api/scores')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ score: 100 });

    expect(res.status).toBe(400);
  });

  test('rejects invalid mode', async () => {
    const res = await getAgent()
      .post('/api/scores')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ mode: 'invalid', score: 100 });

    expect(res.status).toBe(400);
  });

  test('rejects without auth', async () => {
    const res = await getAgent()
      .post('/api/scores')
      .send({ mode: 'freeplay', score: 100 });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/scores/leaderboard', () => {
  test('requires variant param (returns 400 when missing)', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/variant/i);
  });

  test('rejects unknown variant', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard?variant=multiplayer')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
  });

  test('rejects invalid source', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard?variant=freeplay&source=banana')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
  });

  test('returns freeplay leaderboard with default source=ranked', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard?variant=freeplay')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(Array.isArray(res.body.leaderboard)).toBe(true);
    expect(res.body.variant).toBe('freeplay');
    expect(res.body.source).toBe('ranked');
    expect(res.body.updatedAt).toBeDefined();
    // CS52-6: legacy rows must NEVER appear in any public LB filter.
    for (const r of res.body.rows) {
      expect(r.source).not.toBe('legacy');
      expect(r.source).toBe('ranked');
    }
  });

  test('source=offline returns only offline-source rows (no legacy)', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard?variant=freeplay&source=offline')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    for (const r of res.body.rows) {
      expect(r.source).toBe('offline');
    }
  });

  test('source=all returns ranked+offline union (no legacy)', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard?variant=freeplay&source=all')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    for (const r of res.body.rows) {
      expect(['ranked', 'offline']).toContain(r.source);
    }
  });

  test('variant=daily returns daily-only rows', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard?variant=daily')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.variant).toBe('daily');
  });

  test('filters by period', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard?variant=freeplay&period=daily')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.period).toBe('daily');
  });
});

describe('GET /api/scores/leaderboard/multiplayer', () => {
  test('returns multiplayer leaderboard', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard/multiplayer')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.leaderboard)).toBe(true);
    expect(res.body.mode).toBe('multiplayer');
    expect(res.body.source).toBe('ranked');
  });

  test('source=offline returns empty (multiplayer is server-validated only)', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard/multiplayer?source=offline')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rows).toEqual([]);
    expect(res.body.source).toBe('offline');
  });

  test('rejects invalid source', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard/multiplayer?source=banana')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
  });

  test('filters by weekly period', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard/multiplayer?period=weekly')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.leaderboard)).toBe(true);
    expect(res.body.period).toBe('weekly');
  });

  test('filters by daily period', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard/multiplayer?period=daily')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.leaderboard)).toBe(true);
    expect(res.body.period).toBe('daily');
  });
});

describe('GET /api/scores/leaderboard (unauthenticated)', () => {
  test('returns leaderboard without auth (variant required)', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard?variant=freeplay');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  test('returns multiplayer leaderboard without auth', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard/multiplayer');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.leaderboard)).toBe(true);
  });
});

describe('GET /api/scores/me', () => {
  test('returns own scores and stats', async () => {
    const res = await getAgent()
      .get('/api/scores/me')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.scores)).toBe(true);
    expect(Array.isArray(res.body.stats)).toBe(true);
    // We submitted one score above
    expect(res.body.scores.length).toBeGreaterThanOrEqual(1);
    // CS52-6: every personal score row carries `source` for badge rendering.
    for (const s of res.body.scores) {
      expect(s).toHaveProperty('source');
    }
  });

  test('profile shows legacy rows (with badge), but they never leak to public LB', async () => {
    const db = await require('../server/db').getDbAdapter();
    const me = await db.get('SELECT id FROM users WHERE username = ?', ['scoreuser']);
    // Insert a synthetic legacy row directly (CS52 § Decision #6: legacy
    // rows backfilled at migration time look exactly like this).
    await db.run(
      `INSERT INTO scores (user_id, mode, score, correct_count, total_rounds, best_streak, source)
       VALUES (?, 'freeplay', 9999, 10, 10, 10, 'legacy')`,
      [me.id]
    );

    const meRes = await getAgent()
      .get('/api/scores/me')
      .set('Authorization', `Bearer ${userToken}`);
    expect(meRes.status).toBe(200);
    const sources = meRes.body.scores.map(s => s.source);
    expect(sources).toContain('legacy');

    for (const src of ['ranked', 'offline', 'all']) {
      const lb = await getAgent().get(`/api/scores/leaderboard?variant=freeplay&source=${src}`);
      expect(lb.status).toBe(200);
      for (const row of lb.body.rows) {
        expect(row.source).not.toBe('legacy');
      }
    }
  });

  // CS52-followup-2: stats are grouped by (mode, source) so Practice
  // averages don't contaminate Ranked averages and vice versa.
  test('stats are split by (mode, source)', async () => {
    const db = await require('../server/db').getDbAdapter();
    const me = await db.get('SELECT id FROM users WHERE username = ?', ['scoreuser']);

    // Wipe any prior scores for this user so the assertions are deterministic.
    await db.run('DELETE FROM scores WHERE user_id = ?', [me.id]);

    // Insert one Ranked freeplay, two Practice freeplay, one Ranked daily,
    // one Practice daily, one Legacy freeplay. Five distinct (mode, source)
    // combos plus a duplicate for the Practice freeplay aggregation check.
    const insert = (mode, source, score, streak) => db.run(
      `INSERT INTO scores (user_id, mode, score, correct_count, total_rounds, best_streak, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [me.id, mode, score, 5, 10, streak, source]
    );
    await insert('freeplay', 'ranked',  1000, 5);
    await insert('freeplay', 'offline', 500,  3);
    await insert('freeplay', 'offline', 700,  4);  // → avg should be 600, count 2
    await insert('daily',    'ranked',  800,  5);
    await insert('daily',    'offline', 400,  2);
    await insert('freeplay', 'legacy',  9999, 10);

    const meRes = await getAgent()
      .get('/api/scores/me')
      .set('Authorization', `Bearer ${userToken}`);
    expect(meRes.status).toBe(200);

    const stats = meRes.body.stats;
    // Find each (mode, source) combo we expect.
    const findStat = (mode, source) => stats.find(s => s.mode === mode && s.source === source);

    const rfp = findStat('freeplay', 'ranked');
    expect(rfp).toBeDefined();
    expect(Number(rfp.high_score)).toBe(1000);
    expect(Number(rfp.games_played)).toBe(1);

    const pfp = findStat('freeplay', 'offline');
    expect(pfp).toBeDefined();
    expect(Number(pfp.high_score)).toBe(700);
    expect(Number(pfp.games_played)).toBe(2);
    // Critical: avg is computed within (mode, source) — so Practice avg
    // doesn't get contaminated by the Ranked 1000 score.
    expect(Number(pfp.avg_score)).toBe(600);

    const rd = findStat('daily', 'ranked');
    expect(rd).toBeDefined();
    expect(Number(rd.high_score)).toBe(800);

    const pd = findStat('daily', 'offline');
    expect(pd).toBeDefined();
    expect(Number(pd.high_score)).toBe(400);

    const lfp = findStat('freeplay', 'legacy');
    expect(lfp).toBeDefined();
    expect(Number(lfp.high_score)).toBe(9999);

    // Multiplayer stats only appear if the user has finished an MP match;
    // this user hasn't, so no MP row should be present.
    expect(findStat('multiplayer', 'ranked')).toBeUndefined();
  });
});
