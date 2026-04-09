/**
 * Features API integration tests.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

beforeAll(setup);
afterAll(teardown);

describe('GET /api/features', () => {
  test('returns 200 with features object for anonymous user', async () => {
    const res = await getAgent().get('/api/features');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features');
    expect(typeof res.body.features.submitPuzzle).toBe('boolean');
  });

  test('returns features for authenticated user', async () => {
    const { token } = await registerUser('feat-api-user', 'password123');

    const res = await getAgent()
      .get('/api/features')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features');
    expect(typeof res.body.features.submitPuzzle).toBe('boolean');
  });

  test('query param override works in non-production mode', async () => {
    const res = await getAgent().get('/api/features?ff_submit_puzzle=true');

    expect(res.status).toBe(200);
    expect(res.body.features.submitPuzzle).toBe(true);
  });

  test('header override works in non-production mode', async () => {
    const res = await getAgent()
      .get('/api/features')
      .set('x-gwn-feature-submit-puzzle', 'true');

    expect(res.status).toBe(200);
    expect(res.body.features.submitPuzzle).toBe(true);
  });
});
