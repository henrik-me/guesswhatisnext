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
  test('returns leaderboard', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.leaderboard)).toBe(true);
    expect(res.body.mode).toBe('freeplay');
    expect(res.body.period).toBe('all');
  });

  test('filters by period', async () => {
    const res = await getAgent()
      .get('/api/scores/leaderboard?period=daily')
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
  });
});
