/**
 * Feature flags API integration tests.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

let userToken;
const originalSubmitPuzzlePercentage = process.env.FEATURE_SUBMIT_PUZZLE_PERCENTAGE;
const originalSubmitPuzzleUsers = process.env.FEATURE_SUBMIT_PUZZLE_USERS;

process.env.FEATURE_SUBMIT_PUZZLE_PERCENTAGE = '0';
process.env.FEATURE_SUBMIT_PUZZLE_USERS = '';

beforeAll(setup);
afterAll(teardown);
afterAll(() => {
  if (originalSubmitPuzzlePercentage === undefined) {
    delete process.env.FEATURE_SUBMIT_PUZZLE_PERCENTAGE;
  } else {
    process.env.FEATURE_SUBMIT_PUZZLE_PERCENTAGE = originalSubmitPuzzlePercentage;
  }

  if (originalSubmitPuzzleUsers === undefined) {
    delete process.env.FEATURE_SUBMIT_PUZZLE_USERS;
  } else {
    process.env.FEATURE_SUBMIT_PUZZLE_USERS = originalSubmitPuzzleUsers;
  }
});

beforeAll(async () => {
  const { token } = await registerUser('features-api-user');
  userToken = token;
});

describe('GET /api/features', () => {
  test('returns feature flags for anonymous users', async () => {
    const res = await getAgent().get('/api/features');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features.submitPuzzle');
    expect(res.body).toMatchObject({
      features: {
        submitPuzzle: false,
      },
    });
  });

  test('returns feature flags for authenticated users', async () => {
    const res = await getAgent()
      .get('/api/features')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features.submitPuzzle');
    expect(res.body).toMatchObject({
      features: {
        submitPuzzle: expect.any(Boolean),
      },
    });
  });

  test('applies query param overrides outside production', async () => {
    const res = await getAgent()
      .get('/api/features?ff_submit_puzzle=true')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features.submitPuzzle', true);
  });

  test('ignores invalid query param overrides', async () => {
    const res = await getAgent()
      .get('/api/features?ff_submit_puzzle=maybe')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features.submitPuzzle', false);
  });

  test('applies header overrides outside production', async () => {
    const res = await getAgent()
      .get('/api/features')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-gwn-feature-submit-puzzle', 'true');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features.submitPuzzle', true);
  });
});
