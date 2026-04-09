/**
 * Feature flags API integration tests.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

let userToken;

beforeAll(setup);
afterAll(teardown);

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
        submitPuzzle: expect.any(Boolean),
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

  test('applies header overrides outside production', async () => {
    const res = await getAgent()
      .get('/api/features')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-gwn-feature-submit-puzzle', 'true');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features.submitPuzzle', true);
  });
});
