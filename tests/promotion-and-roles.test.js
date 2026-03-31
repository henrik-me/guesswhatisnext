/**
 * Tests for puzzle promotion (approved → live pool) and admin role management.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';

let userToken;
let adminId;

beforeAll(async () => {
  await setup();
  const { token } = await registerUser('promo-user');
  userToken = token;
  const { user: u2 } = await registerUser('admin-user');
  adminId = u2.id;

  // Promote admin-user to admin via system key
  await getAgent()
    .put(`/api/users/${adminId}/role`)
    .set('X-API-Key', SYSTEM_KEY)
    .send({ role: 'admin' });
});

afterAll(teardown);

describe('Puzzle Promotion — approved submission creates live puzzle', () => {
  let submissionId;

  beforeAll(async () => {
    const res = await getAgent()
      .post('/api/submissions')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['🔴', '🟠', '🟡'],
        answer: '🟢',
        explanation: 'Colors of the rainbow in order.',
        difficulty: 2,
        category: 'Colors & Patterns',
      });
    submissionId = res.body.id;
  });

  test('approving a submission inserts a puzzle with correct fields', async () => {
    const res = await getAgent()
      .put(`/api/submissions/${submissionId}/review`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ status: 'approved', reviewerNotes: 'Great puzzle!' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(res.body.puzzleId).toBe(`community-${submissionId}`);

    // Verify the puzzle was inserted into the live pool
    const puzzleRes = await getAgent()
      .get('/api/puzzles')
      .set('X-API-Key', SYSTEM_KEY);

    expect(puzzleRes.status).toBe(200);
    const communityPuzzle = puzzleRes.body.find(p => p.id === `community-${submissionId}`);
    expect(communityPuzzle).toBeDefined();
    expect(communityPuzzle.category).toBe('Colors & Patterns');
    expect(communityPuzzle.difficulty).toBe(2);
    expect(communityPuzzle.answer).toBe('🟢');
    expect(communityPuzzle.explanation).toBe('Colors of the rainbow in order.');
    expect(communityPuzzle.submitted_by).toBe('promo-user');
    expect(Array.isArray(communityPuzzle.options)).toBe(true);
    expect(communityPuzzle.options.length).toBe(4);
    expect(communityPuzzle.options).toContain('🟢');
  });

  test('rejecting a submission does NOT create a puzzle', async () => {
    const createRes = await getAgent()
      .post('/api/submissions')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: [1, 3, 5],
        answer: '7',
        explanation: 'Odd numbers.',
        difficulty: 1,
        category: 'Math & Numbers',
      });

    const reviewRes = await getAgent()
      .put(`/api/submissions/${createRes.body.id}/review`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ status: 'rejected', reviewerNotes: 'Too easy' });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.puzzleId).toBeUndefined();

    const puzzleRes = await getAgent()
      .get('/api/puzzles')
      .set('X-API-Key', SYSTEM_KEY);

    const rejectedPuzzle = puzzleRes.body.find(p => p.id === `community-${createRes.body.id}`);
    expect(rejectedPuzzle).toBeUndefined();
  });

  test('approved puzzle has submitted_by set to the submitter username', async () => {
    const createRes = await getAgent()
      .post('/api/submissions')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['A', 'C', 'E'],
        answer: 'G',
        explanation: 'Every other letter.',
        difficulty: 1,
        category: 'Letter & Word Patterns',
      });

    await getAgent()
      .put(`/api/submissions/${createRes.body.id}/review`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ status: 'approved' });

    const puzzleRes = await getAgent()
      .get('/api/puzzles')
      .set('X-API-Key', SYSTEM_KEY);

    const puzzle = puzzleRes.body.find(p => p.id === `community-${createRes.body.id}`);
    expect(puzzle).toBeDefined();
    expect(puzzle.submitted_by).toBe('promo-user');
  });
});

describe('GET /api/users — list users', () => {
  test('returns user list for system key', async () => {
    const res = await getAgent()
      .get('/api/users')
      .set('X-API-Key', SYSTEM_KEY);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThanOrEqual(3); // system + 2 registered
    const usernames = res.body.users.map(u => u.username);
    expect(usernames).toContain('promo-user');
    expect(usernames).toContain('admin-user');
  });

  test('rejects for regular users', async () => {
    const res = await getAgent()
      .get('/api/users')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  test('rejects without auth', async () => {
    const res = await getAgent().get('/api/users');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/users/:id/role — admin role management', () => {
  let targetUserId;

  beforeAll(async () => {
    const { user } = await registerUser('role-target');
    targetUserId = user.id;
  });

  test('admin can promote a user to admin', async () => {
    // Re-login admin-user to get a fresh token with admin role
    const loginRes = await getAgent()
      .post('/api/auth/login')
      .send({ username: 'admin-user', password: 'testpass123' });
    const freshAdminToken = loginRes.body.token;

    const res = await getAgent()
      .put(`/api/users/${targetUserId}/role`)
      .set('Authorization', `Bearer ${freshAdminToken}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
  });

  test('admin can demote a user back to user', async () => {
    const loginRes = await getAgent()
      .post('/api/auth/login')
      .send({ username: 'admin-user', password: 'testpass123' });
    const freshAdminToken = loginRes.body.token;

    const res = await getAgent()
      .put(`/api/users/${targetUserId}/role`)
      .set('Authorization', `Bearer ${freshAdminToken}`)
      .send({ role: 'user' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('user');
  });

  test('system key can change roles', async () => {
    const res = await getAgent()
      .put(`/api/users/${targetUserId}/role`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
  });

  test('regular user cannot change roles', async () => {
    const res = await getAgent()
      .put(`/api/users/${targetUserId}/role`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ role: 'admin' });

    expect(res.status).toBe(403);
  });

  test('rejects invalid role value', async () => {
    const res = await getAgent()
      .put(`/api/users/${targetUserId}/role`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ role: 'superadmin' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/i);
  });

  test('returns 404 for non-existent user', async () => {
    const res = await getAgent()
      .put('/api/users/99999/role')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ role: 'admin' });

    expect(res.status).toBe(404);
  });

  test('cannot demote yourself', async () => {
    const loginRes = await getAgent()
      .post('/api/auth/login')
      .send({ username: 'admin-user', password: 'testpass123' });
    const freshAdminToken = loginRes.body.token;

    const res = await getAgent()
      .put(`/api/users/${adminId}/role`)
      .set('Authorization', `Bearer ${freshAdminToken}`)
      .send({ role: 'user' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own role/i);
  });

  test('cannot modify system account', async () => {
    // Find system user ID
    const usersRes = await getAgent()
      .get('/api/users')
      .set('X-API-Key', SYSTEM_KEY);
    const systemUser = usersRes.body.users.find(u => u.role === 'system');

    const res = await getAgent()
      .put(`/api/users/${systemUser.id}/role`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/system/i);
  });
});
