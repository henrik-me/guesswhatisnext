/**
 * Achievements API smoke tests.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

let userToken;

beforeAll(async () => {
  await setup();
  const { token } = await registerUser('achieveuser');
  userToken = token;
});

afterAll(teardown);

describe('GET /api/achievements', () => {
  test('returns all achievements with unlock status', async () => {
    const res = await getAgent()
      .get('/api/achievements')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.achievements)).toBe(true);
    expect(res.body.achievements.length).toBeGreaterThan(0);

    const achievement = res.body.achievements[0];
    expect(achievement.id).toBeDefined();
    expect(achievement.name).toBeDefined();
    expect(achievement.description).toBeDefined();
    expect(achievement.icon).toBeDefined();
    expect(achievement.category).toBeDefined();
    expect(typeof achievement.unlocked).toBe('boolean');
  });

  test('rejects without auth', async () => {
    const res = await getAgent().get('/api/achievements');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/achievements/me', () => {
  test('returns empty initially', async () => {
    const res = await getAgent()
      .get('/api/achievements/me')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.achievements)).toBe(true);
    expect(res.body.achievements.length).toBe(0);
  });

  test('returns unlocked achievements after triggering one', async () => {
    // Submit a score to trigger first_game achievement
    await getAgent()
      .post('/api/scores')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        mode: 'freeplay',
        score: 100,
        correctCount: 5,
        totalRounds: 10,
        bestStreak: 3,
      });

    const res = await getAgent()
      .get('/api/achievements/me')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.achievements.length).toBeGreaterThan(0);
  });
});
