/**
 * Puzzle submissions API tests.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';
const ENABLED_SUBMISSIONS_PATH = '/api/submissions?ff_submit_puzzle=1';

let userToken;
let userToken2;

beforeAll(async () => {
  await setup();
  const { token } = await registerUser('submitter1');
  userToken = token;
  const { token: t2 } = await registerUser('submitter2');
  userToken2 = t2;
});

afterAll(teardown);

describe('POST /api/submissions', () => {
  test('rejects when submit-puzzle is disabled by default', async () => {
    const res = await getAgent()
      .post('/api/submissions')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['🌑', '🌒', '🌓'],
        answer: '🌔',
        explanation: 'Moon phases progress from new to full.',
        difficulty: 1,
        category: 'Nature',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not enabled/i);
  });

  test('creates a submission with valid data', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['🌑', '🌒', '🌓'],
        answer: '🌔',
        explanation: 'Moon phases progress from new to full.',
        difficulty: 1,
        category: 'Nature',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('pending');
  });

  test('allows header override for submit-puzzle', async () => {
    const res = await getAgent()
      .post('/api/submissions')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-Gwn-Feature-Submit-Puzzle', 'enabled')
      .send({
        sequence: ['🥚', '🐣', '🐥'],
        answer: '🐔',
        explanation: 'Life stages of a chicken.',
        difficulty: 1,
        category: 'Nature',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
  });

  test('rejects without auth', async () => {
    const res = await getAgent()
      .post('/api/submissions')
      .send({
        sequence: [1, 2, 3],
        answer: 4,
        explanation: 'Counting.',
        difficulty: 1,
        category: 'Math & Numbers',
      });

    expect(res.status).toBe(401);
  });

  test('rejects sequence with fewer than 3 elements', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: [1, 2],
        answer: 3,
        explanation: 'Too short.',
        difficulty: 1,
        category: 'Math & Numbers',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 3/);
  });

  test('rejects missing answer', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: [1, 2, 3],
        answer: '',
        explanation: 'Counting.',
        difficulty: 1,
        category: 'Math & Numbers',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/answer/i);
  });

  test('rejects missing explanation', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: [1, 2, 3],
        answer: 4,
        explanation: '   ',
        difficulty: 1,
        category: 'Math & Numbers',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/explanation/i);
  });

  test('rejects invalid difficulty', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: [1, 2, 3],
        answer: 4,
        explanation: 'Counting.',
        difficulty: 5,
        category: 'Math & Numbers',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/difficulty/i);
  });

  test('rejects invalid category', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: [1, 2, 3],
        answer: 4,
        explanation: 'Counting.',
        difficulty: 1,
        category: 'NonExistent',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category/i);
  });
});

describe('GET /api/submissions', () => {
  beforeAll(async () => {
    await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['X', 'Y', 'Z'],
        answer: 'A',
        explanation: 'Alphabet wraps around.',
        difficulty: 1,
        category: 'General Knowledge',
      });
  });

  test('returns own submissions', async () => {
    const res = await getAgent()
      .get('/api/submissions')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.submissions)).toBe(true);
    expect(res.body.submissions.length).toBeGreaterThan(0);

    const sub = res.body.submissions.find(
      (s) => s && s.status === 'pending' && Array.isArray(s.sequence),
    );
    expect(sub).toBeDefined();
  });

  test('does not show other users submissions', async () => {
    const res = await getAgent()
      .get('/api/submissions')
      .set('Authorization', `Bearer ${userToken2}`);

    expect(res.status).toBe(200);
    expect(res.body.submissions.length).toBe(0);
  });

  test('rejects without auth', async () => {
    const res = await getAgent().get('/api/submissions');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/submissions/pending', () => {
  beforeAll(async () => {
    await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: [10, 20, 30],
        answer: '40',
        explanation: 'Increments of 10.',
        difficulty: 1,
        category: 'Math & Numbers',
      });
  });

  test('returns pending submissions for system user', async () => {
    const res = await getAgent()
      .get('/api/submissions/pending')
      .set('X-API-Key', SYSTEM_KEY);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.submissions)).toBe(true);
    expect(res.body.submissions.length).toBeGreaterThan(0);
    const fromSubmitter1 = res.body.submissions.find((s) => s.submitted_by === 'submitter1');
    expect(fromSubmitter1).toBeDefined();
  });

  test('rejects for regular users', async () => {
    const res = await getAgent()
      .get('/api/submissions/pending')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/submissions/:id/review', () => {
  let submissionId;

  beforeAll(async () => {
    // Create a fresh submission to review
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['A', 'B', 'C'],
        answer: 'D',
        explanation: 'Alphabetical order.',
        difficulty: 1,
        category: 'General Knowledge',
      });
    submissionId = res.body.id;
  });

  test('approves a submission', async () => {
    const res = await getAgent()
      .put(`/api/submissions/${submissionId}/review`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ status: 'approved', reviewerNotes: 'Looks good!' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
  });

  test('rejects reviewing an already-reviewed submission', async () => {
    const res = await getAgent()
      .put(`/api/submissions/${submissionId}/review`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ status: 'rejected', reviewerNotes: 'Changed mind' });

    expect(res.status).toBe(409);
  });

  test('rejects invalid status', async () => {
    const res = await getAgent()
      .put(`/api/submissions/${submissionId}/review`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ status: 'maybe' });

    expect(res.status).toBe(400);
  });

  test('rejects non-string reviewerNotes with 400', async () => {
    // Create a fresh submission to avoid conflict with already-reviewed ones
    const createRes = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: [2, 4, 6],
        answer: '8',
        explanation: 'Even numbers.',
        difficulty: 1,
        category: 'Math & Numbers',
      });

    const res = await getAgent()
      .put(`/api/submissions/${createRes.body.id}/review`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ status: 'approved', reviewerNotes: { note: 'Not a string' } });

    expect(res.status).toBe(400);
  });

  test('returns 404 for non-existent submission', async () => {
    const res = await getAgent()
      .put('/api/submissions/99999/review')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ status: 'approved' });

    expect(res.status).toBe(404);
  });

  test('rejects for regular users', async () => {
    const res = await getAgent()
      .put(`/api/submissions/${submissionId}/review`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(403);
  });

  test('rejected submission shows reviewer notes in user list', async () => {
    // Create and reject a new submission
    const createRes = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: [10, 20, 30],
        answer: '40',
        explanation: 'Multiples of 10.',
        difficulty: 2,
        category: 'Math & Numbers',
      });

    await getAgent()
      .put(`/api/submissions/${createRes.body.id}/review`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ status: 'rejected', reviewerNotes: 'Too simple' });

    const listRes = await getAgent()
      .get('/api/submissions')
      .set('Authorization', `Bearer ${userToken}`);

    const rejected = listRes.body.submissions.find(s => s.id === createRes.body.id);
    expect(rejected).toBeDefined();
    expect(rejected.status).toBe('rejected');
    expect(rejected.reviewer_notes).toBe('Too simple');
  });
});

describe('POST /api/submissions — type and options validation', () => {
  test('accepts submission with valid type', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['🔴', '🟠', '🟡'],
        answer: '🟢',
        explanation: 'Rainbow colors.',
        difficulty: 1,
        category: 'Colors & Patterns',
        type: 'text',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
  });

  test('defaults type to emoji when not provided', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['🌑', '🌒', '🌓'],
        answer: '🌔',
        explanation: 'Moon phases.',
        difficulty: 1,
        category: 'Nature',
      });

    expect(res.status).toBe(201);

    const listRes = await getAgent()
      .get('/api/submissions')
      .set('Authorization', `Bearer ${userToken}`);

    const sub = listRes.body.submissions.find(s => s.id === res.body.id);
    expect(sub).toBeDefined();
    expect(sub.type).toBe('emoji');
  });

  test('rejects invalid type', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: [1, 2, 3],
        answer: '4',
        explanation: 'Counting.',
        difficulty: 1,
        category: 'Math & Numbers',
        type: 'video',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/type must be one of/);
  });

  test('rejects image submission without required options', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: [1, 2, 3],
        answer: '4',
        explanation: 'Counting.',
        difficulty: 1,
        category: 'Math & Numbers',
        type: 'image',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/image puzzles require/);
  });

  test('accepts submission with valid 4-element options', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['A', 'B', 'C'],
        answer: 'D',
        explanation: 'Alphabet.',
        difficulty: 1,
        category: 'General Knowledge',
        options: ['D', 'E', 'F', 'G'],
      });

    expect(res.status).toBe(201);
  });

  test('rejects options with wrong count', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['A', 'B', 'C'],
        answer: 'D',
        explanation: 'Alphabet.',
        difficulty: 1,
        category: 'General Knowledge',
        options: ['D', 'E', 'F'],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exactly 4/);
  });

  test('rejects options missing answer', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['A', 'B', 'C'],
        answer: 'D',
        explanation: 'Alphabet.',
        difficulty: 1,
        category: 'General Knowledge',
        options: ['E', 'F', 'G', 'H'],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/include the answer/);
  });

  test('rejects options with duplicates', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['A', 'B', 'C'],
        answer: 'D',
        explanation: 'Alphabet.',
        difficulty: 1,
        category: 'General Knowledge',
        options: ['D', 'D', 'E', 'F'],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/duplicates/);
  });

  test('rejects options with empty strings', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['A', 'B', 'C'],
        answer: 'D',
        explanation: 'Alphabet.',
        difficulty: 1,
        category: 'General Knowledge',
        options: ['D', 'E', '', 'F'],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty string/);
  });

  test('rejects options with whitespace-only strings', async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['A', 'B', 'C'],
        answer: 'D',
        explanation: 'Alphabet.',
        difficulty: 1,
        category: 'General Knowledge',
        options: ['D', 'E', '   ', 'F'],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty string/);
  });
});

describe('PUT /api/submissions/:id/review — type and options', () => {
  test('approve uses submission type instead of hardcoded emoji', async () => {
    const createRes = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['one', 'two', 'three'],
        answer: 'four',
        explanation: 'Counting words.',
        difficulty: 1,
        category: 'General Knowledge',
        type: 'text',
      });

    const approveRes = await getAgent()
      .put(`/api/submissions/${createRes.body.id}/review`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ status: 'approved' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.puzzleId).toBe(`community-${createRes.body.id}`);

    // Verify the puzzle was created with type 'text'
    const puzzlesRes = await getAgent()
      .get('/api/puzzles')
      .set('Authorization', `Bearer ${userToken}`);

    const puzzles = puzzlesRes.body;
    const puzzle = puzzles.find(p => p.id === approveRes.body.puzzleId);
    expect(puzzle).toBeDefined();
    expect(puzzle.type).toBe('text');
  });

  test('approve uses custom options when provided', async () => {
    const createRes = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['🍎', '🍊', '🍋'],
        answer: '🍇',
        explanation: 'Fruits.',
        difficulty: 1,
        category: 'Food',
        options: ['🍇', '🍉', '🍓', '🫐'],
      });

    const approveRes = await getAgent()
      .put(`/api/submissions/${createRes.body.id}/review`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ status: 'approved' });

    expect(approveRes.status).toBe(200);

    const puzzlesRes = await getAgent()
      .get('/api/puzzles')
      .set('Authorization', `Bearer ${userToken}`);

    const puzzles = puzzlesRes.body;
    const puzzle = puzzles.find(p => p.id === approveRes.body.puzzleId);
    expect(puzzle).toBeDefined();
    expect(puzzle.options).toEqual(['🍇', '🍉', '🍓', '🫐']);
  });

  test('approve auto-generates options when not provided', async () => {
    const createRes = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['🌱', '🌿', '🌳'],
        answer: '🌲',
        explanation: 'Plants growing.',
        difficulty: 1,
        category: 'Nature',
      });

    const approveRes = await getAgent()
      .put(`/api/submissions/${createRes.body.id}/review`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ status: 'approved' });

    expect(approveRes.status).toBe(200);

    const puzzlesRes = await getAgent()
      .get('/api/puzzles')
      .set('Authorization', `Bearer ${userToken}`);

    const puzzles = puzzlesRes.body;
    const puzzle = puzzles.find(p => p.id === approveRes.body.puzzleId);
    expect(puzzle).toBeDefined();
    expect(puzzle.options).toHaveLength(4);
    expect(puzzle.options).toContain('🌲');
  });

  test('backward compat: old submissions without type default to emoji on approve', async () => {
    const createRes = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['X', 'Y', 'Z'],
        answer: 'A',
        explanation: 'Wraps around.',
        difficulty: 1,
        category: 'General Knowledge',
      });

    const approveRes = await getAgent()
      .put(`/api/submissions/${createRes.body.id}/review`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ status: 'approved' });

    expect(approveRes.status).toBe(200);

    const puzzlesRes = await getAgent()
      .get('/api/puzzles')
      .set('Authorization', `Bearer ${userToken}`);

    const puzzles = puzzlesRes.body;
    const puzzle = puzzles.find(p => p.id === approveRes.body.puzzleId);
    expect(puzzle).toBeDefined();
    expect(puzzle.type).toBe('emoji');
  });
});

describe('GET /api/submissions/stats', () => {
  test('returns submission statistics for system user', async () => {
    const res = await getAgent()
      .get('/api/submissions/stats')
      .set('X-API-Key', SYSTEM_KEY);

    expect(res.status).toBe(200);
    expect(typeof res.body.pending).toBe('number');
    expect(typeof res.body.approved).toBe('number');
    expect(typeof res.body.rejected).toBe('number');
    expect(typeof res.body.total).toBe('number');
    expect(res.body.total).toBe(res.body.pending + res.body.approved + res.body.rejected);
    expect(typeof res.body.today.submitted).toBe('number');
    expect(typeof res.body.today.reviewed).toBe('number');
  });

  test('rejects for regular users', async () => {
    const res = await getAgent()
      .get('/api/submissions/stats')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/submissions/:id (edit)', () => {
  let editableId;

  beforeAll(async () => {
    const res = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['🔵', '🟢', '🟡'],
        answer: '🔴',
        explanation: 'Color circle.',
        difficulty: 2,
        category: 'Colors & Patterns',
      });
    editableId = res.body.id;
  });

  test('admin can edit a pending submission', async () => {
    const res = await getAgent()
      .put(`/api/submissions/${editableId}`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ explanation: 'Updated explanation' });

    expect(res.status).toBe(200);
    expect(res.body.explanation).toBe('Updated explanation');
  });

  test('owner can edit own pending submission with feature flag', async () => {
    const res = await getAgent()
      .put(`/api/submissions/${editableId}?ff_submit_puzzle=1`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ difficulty: 3 });

    expect(res.status).toBe(200);
    expect(res.body.difficulty).toBe(3);
  });

  test('non-owner regular user gets 403', async () => {
    const res = await getAgent()
      .put(`/api/submissions/${editableId}?ff_submit_puzzle=1`)
      .set('Authorization', `Bearer ${userToken2}`)
      .send({ difficulty: 1 });

    expect(res.status).toBe(403);
  });

  test('rejects editing a reviewed submission with 409', async () => {
    // Create and approve a submission
    const createRes = await getAgent()
      .post(ENABLED_SUBMISSIONS_PATH)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sequence: ['📕', '📗', '📘'],
        answer: '📙',
        explanation: 'Book colors.',
        difficulty: 1,
        category: 'General Knowledge',
      });
    await getAgent()
      .put(`/api/submissions/${createRes.body.id}/review`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ status: 'approved' });

    const res = await getAgent()
      .put(`/api/submissions/${createRes.body.id}`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ explanation: 'Changed' });

    expect(res.status).toBe(409);
  });

  test('rejects invalid fields', async () => {
    const res = await getAgent()
      .put(`/api/submissions/${editableId}`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({ difficulty: 99 });

    expect(res.status).toBe(400);
  });

  test('returns 404 for non-existent submission', async () => {
    const res = await getAgent()
      .put('/api/submissions/99999')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ explanation: 'Test' });

    expect(res.status).toBe(404);
  });

  test('returns 400 for empty body', async () => {
    const res = await getAgent()
      .put(`/api/submissions/${editableId}`)
      .set('X-API-Key', SYSTEM_KEY)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no fields/i);
  });

  test('rejects without auth', async () => {
    const res = await getAgent()
      .put(`/api/submissions/${editableId}`)
      .send({ explanation: 'No auth' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/submissions/bulk-review', () => {
  let bulkIds;

  beforeAll(async () => {
    bulkIds = [];
    for (let i = 0; i < 3; i++) {
      const res = await getAgent()
        .post(ENABLED_SUBMISSIONS_PATH)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          sequence: [i, i + 1, i + 2],
          answer: String(i + 3),
          explanation: `Bulk test ${i}`,
          difficulty: 1,
          category: 'Math & Numbers',
        });
      bulkIds.push(res.body.id);
    }
  });

  test('bulk approves multiple submissions', async () => {
    const res = await getAgent()
      .post('/api/submissions/bulk-review')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ ids: [bulkIds[0], bulkIds[1]], status: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].status).toBe('approved');
    expect(res.body.results[1].status).toBe('approved');

    // Verify puzzles were created
    const puzzlesRes = await getAgent()
      .get('/api/puzzles')
      .set('Authorization', `Bearer ${userToken}`);
    const puzzles = puzzlesRes.body;
    expect(puzzles.find(p => p.id === `community-${bulkIds[0]}`)).toBeDefined();
    expect(puzzles.find(p => p.id === `community-${bulkIds[1]}`)).toBeDefined();
  });

  test('handles partial failure (already reviewed)', async () => {
    const res = await getAgent()
      .post('/api/submissions/bulk-review')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ ids: [bulkIds[0], bulkIds[2]], status: 'rejected', reviewerNotes: 'Bulk reject' });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    const first = res.body.results.find(r => r.id === bulkIds[0]);
    const second = res.body.results.find(r => r.id === bulkIds[2]);
    expect(first.error).toMatch(/already reviewed/i);
    expect(second.status).toBe('rejected');
  });

  test('rejects invalid status', async () => {
    const res = await getAgent()
      .post('/api/submissions/bulk-review')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ ids: [1], status: 'maybe' });

    expect(res.status).toBe(400);
  });

  test('rejects empty ids', async () => {
    const res = await getAgent()
      .post('/api/submissions/bulk-review')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ ids: [], status: 'approved' });

    expect(res.status).toBe(400);
  });

  test('rejects for regular users', async () => {
    const res = await getAgent()
      .post('/api/submissions/bulk-review')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ids: [1], status: 'approved' });

    expect(res.status).toBe(403);
  });

  test('rejects batch exceeding size limit', async () => {
    const largeIds = Array.from({ length: 51 }, (_, i) => i + 1);
    const res = await getAgent()
      .post('/api/submissions/bulk-review')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ ids: largeIds, status: 'approved' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/maximum/i);
  });
});
