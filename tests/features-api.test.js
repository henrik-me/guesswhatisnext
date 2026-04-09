/**
 * Features API integration tests.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

beforeAll(setup);
afterAll(teardown);

describe('GET /api/features integration', () => {
  test('returns submitPuzzle boolean for anonymous users', async () => {
    const res = await getAgent().get('/api/features');

    expect(res.status).toBe(200);
    expect(typeof res.body.features.submitPuzzle).toBe('boolean');
  });

  test('returns features for authenticated users', async () => {
    const { token } = await registerUser('features-api-user');
    const res = await getAgent()
      .get('/api/features')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.features.submitPuzzle).toBe('boolean');
  });

  test('applies query override when allowed in non-production mode', async () => {
    const res = await getAgent().get('/api/features?ff_submit_puzzle=true');

    expect(res.status).toBe(200);
    expect(res.body.features.submitPuzzle).toBe(true);
  });

  test('applies header override when allowed in non-production mode', async () => {
    const res = await getAgent()
      .get('/api/features')
      .set('x-gwn-feature-submit-puzzle', 'true');

    expect(res.status).toBe(200);
    expect(res.body.features.submitPuzzle).toBe(true);
  });
});
