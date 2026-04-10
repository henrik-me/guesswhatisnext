/**
 * Community gallery API tests.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

let userToken;

beforeAll(async () => {
  await setup();
  const { token } = await registerUser('galleryuser');
  userToken = token;
});

afterAll(teardown);

/** Insert an approved community puzzle directly into the puzzles table. */
async function insertCommunityPuzzle(overrides = {}) {
  const puzzle = {
    id: `community-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category: 'Nature',
    difficulty: 1,
    type: 'emoji',
    sequence: JSON.stringify(['🌑', '🌒', '🌓']),
    answer: '🌔',
    options: JSON.stringify(['🌔', '🌕', '🌖', '🌗']),
    explanation: 'Moon phases',
    submitted_by: 'testcreator',
    active: 1,
    ...overrides,
  };

  // Insert directly via the server's DB adapter for test setup.
  const db = require('../server/db');
  const adapter = await db.getDbAdapter();
  await adapter.run(
    `INSERT INTO puzzles (id, category, difficulty, type, sequence, answer, options, explanation, submitted_by, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [puzzle.id, puzzle.category, puzzle.difficulty, puzzle.type,
     puzzle.sequence, puzzle.answer, puzzle.options, puzzle.explanation,
     puzzle.submitted_by, puzzle.active]
  );
  return puzzle;
}

describe('GET /api/puzzles/community', () => {
  test('returns only community puzzles (submitted_by IS NOT NULL)', async () => {
    await insertCommunityPuzzle({ id: 'community-test-1', submitted_by: 'creator1' });

    const res = await getAgent().get('/api/puzzles/community');

    expect(res.status).toBe(200);
    expect(res.body.puzzles).toBeDefined();
    expect(Array.isArray(res.body.puzzles)).toBe(true);
    expect(res.body.puzzles.length).toBeGreaterThan(0);
    expect(res.body.puzzles.map(p => p.id)).toContain('community-test-1');

    // All returned puzzles should have submitted_by
    for (const p of res.body.puzzles) {
      expect(p.submitted_by).toBeTruthy();
    }
  });

  test('returns pagination metadata', async () => {
    const res = await getAgent().get('/api/puzzles/community?page=1&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(5);
    expect(typeof res.body.pagination.total).toBe('number');
    expect(typeof res.body.pagination.pages).toBe('number');
  });

  test('filters by category', async () => {
    await insertCommunityPuzzle({ id: 'community-sci-1', category: 'Science', submitted_by: 'creator2' });

    const res = await getAgent().get('/api/puzzles/community?category=Science');

    expect(res.status).toBe(200);
    expect(res.body.puzzles.length).toBeGreaterThan(0);
    expect(res.body.puzzles.map(p => p.id)).toContain('community-sci-1');
    for (const p of res.body.puzzles) {
      expect(p.category).toBe('Science');
    }
  });

  test('filters by difficulty', async () => {
    await insertCommunityPuzzle({ id: 'community-d2-1', difficulty: 2, submitted_by: 'creator3' });

    const res = await getAgent().get('/api/puzzles/community?difficulty=2');

    expect(res.status).toBe(200);
    for (const p of res.body.puzzles) {
      expect(p.difficulty).toBe(2);
    }
  });

  test('filters by category and difficulty combined', async () => {
    await insertCommunityPuzzle({ id: 'community-combo-1', category: 'Music', difficulty: 3, submitted_by: 'creator4' });

    const res = await getAgent().get('/api/puzzles/community?category=Music&difficulty=3');

    expect(res.status).toBe(200);
    for (const p of res.body.puzzles) {
      expect(p.category).toBe('Music');
      expect(p.difficulty).toBe(3);
    }
  });

  test('rejects invalid difficulty', async () => {
    const res = await getAgent().get('/api/puzzles/community?difficulty=5');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/difficulty/i);
  });

  test('empty result returns empty array with pagination', async () => {
    const res = await getAgent().get('/api/puzzles/community?category=NonExistentCategory');

    expect(res.status).toBe(200);
    expect(res.body.puzzles).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.pagination.pages).toBe(0);
  });

  test('accessible without auth (public endpoint)', async () => {
    const res = await getAgent().get('/api/puzzles/community');

    expect(res.status).toBe(200);
    expect(res.body.puzzles).toBeDefined();
  });

  test('accessible with auth too', async () => {
    const res = await getAgent()
      .get('/api/puzzles/community')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.puzzles).toBeDefined();
  });

  test('does not include inactive community puzzles', async () => {
    await insertCommunityPuzzle({ id: 'community-inactive-1', active: 0, submitted_by: 'inactiveuser' });

    const res = await getAgent().get('/api/puzzles/community');

    expect(res.status).toBe(200);
    const ids = res.body.puzzles.map(p => p.id);
    expect(ids).not.toContain('community-inactive-1');
  });

  test('does not include seeded puzzles (submitted_by IS NULL)', async () => {
    const res = await getAgent().get('/api/puzzles/community');

    expect(res.status).toBe(200);
    for (const p of res.body.puzzles) {
      expect(p.submitted_by).not.toBeNull();
      expect(p.submitted_by).toBeTruthy();
    }
  });

  test('puzzle shape includes expected fields', async () => {
    await insertCommunityPuzzle({ id: 'community-shape-1', submitted_by: 'shapecreator' });

    const res = await getAgent().get('/api/puzzles/community');

    expect(res.status).toBe(200);
    if (res.body.puzzles.length > 0) {
      const p = res.body.puzzles[0];
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('category');
      expect(p).toHaveProperty('difficulty');
      expect(p).toHaveProperty('type');
      expect(p).toHaveProperty('sequence');
      expect(Array.isArray(p.sequence)).toBe(true);
      expect(p).toHaveProperty('answer');
      expect(p).toHaveProperty('options');
      expect(Array.isArray(p.options)).toBe(true);
      expect(p).toHaveProperty('explanation');
      expect(p).toHaveProperty('submitted_by');
      expect(p).toHaveProperty('created_at');
    }
  });

  test('limit is capped at 50', async () => {
    const res = await getAgent().get('/api/puzzles/community?limit=100');

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(50);
  });

  test('pagination offset works correctly', async () => {
    // Insert enough puzzles to have multiple pages
    for (let i = 0; i < 3; i++) {
      await insertCommunityPuzzle({ id: `community-page-${i}`, submitted_by: `pageuser${i}` });
    }

    const page1 = await getAgent().get('/api/puzzles/community?page=1&limit=2');
    const page2 = await getAgent().get('/api/puzzles/community?page=2&limit=2');

    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);

    const ids1 = page1.body.puzzles.map(p => p.id);
    const ids2 = page2.body.puzzles.map(p => p.id);

    // Pages should not overlap
    for (const id of ids1) {
      expect(ids2).not.toContain(id);
    }
  });
});
