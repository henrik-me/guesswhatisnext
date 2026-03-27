/**
 * Puzzles API smoke tests.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

let userToken;

beforeAll(async () => {
  await setup();
  const { token } = await registerUser('puzzleuser');
  userToken = token;
});

afterAll(teardown);

describe('GET /api/puzzles', () => {
  test('returns puzzles with auth', async () => {
    const res = await getAgent()
      .get('/api/puzzles')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    // Check puzzle shape
    const puzzle = res.body[0];
    expect(puzzle.sequence).toBeDefined();
    expect(Array.isArray(puzzle.sequence)).toBe(true);
    expect(puzzle.options).toBeDefined();
    expect(puzzle.answer).toBeDefined();
    expect(puzzle.category).toBeDefined();
  });

  test('filters by category', async () => {
    const res = await getAgent()
      .get('/api/puzzles?category=numbers')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    if (res.body.length > 0) {
      expect(res.body.every(p => p.category === 'numbers')).toBe(true);
    }
  });

  test('filters by difficulty', async () => {
    const res = await getAgent()
      .get('/api/puzzles?difficulty=1')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    if (res.body.length > 0) {
      expect(res.body.every(p => p.difficulty === 1)).toBe(true);
    }
  });

  test('rejects invalid difficulty', async () => {
    const res = await getAgent()
      .get('/api/puzzles?difficulty=5')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
  });

  test('rejects without auth', async () => {
    const res = await getAgent().get('/api/puzzles');
    expect(res.status).toBe(401);
  });

  test('has at least 80 puzzles seeded', async () => {
    const res = await getAgent()
      .get('/api/puzzles')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.body.length).toBeGreaterThanOrEqual(80);
  });
});
