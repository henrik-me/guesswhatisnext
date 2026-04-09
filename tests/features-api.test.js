/**
 * Feature flags API integration tests.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

beforeAll(setup);
afterAll(teardown);

describe('GET /api/features', () => {
  test('returns feature booleans for anonymous users', async () => {
    const res = await getAgent().get('/api/features');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      features: {
        submitPuzzle: expect.any(Boolean),
      },
    });
  });

  test('returns feature booleans for authenticated users', async () => {
    const { token } = await registerUser('feature-api-user');
    const res = await getAgent()
      .get('/api/features')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      features: {
        submitPuzzle: expect.any(Boolean),
      },
    });
  });

  test('applies query overrides in non-production mode when override is allowed', async () => {
    const res = await getAgent().get('/api/features?ff_submit_puzzle=true');

    expect(res.status).toBe(200);
    expect(res.body.features.submitPuzzle).toBe(true);
  });

  test('applies header overrides in non-production mode when override is allowed', async () => {
    const res = await getAgent()
      .get('/api/features')
      .set('x-gwn-feature-submit-puzzle', 'true');

    expect(res.status).toBe(200);
    expect(res.body.features.submitPuzzle).toBe(true);
  });
});
