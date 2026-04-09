const { getAgent, setup, teardown, registerUser } = require('./helper');

beforeAll(setup);
afterAll(teardown);

describe('GET /api/features', () => {
  test('returns feature flags for anonymous users', async () => {
    const res = await getAgent().get('/api/features');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features.submitPuzzle');
    expect(typeof res.body.features.submitPuzzle).toBe('boolean');
  });

  test('returns feature flags for authenticated users', async () => {
    const { token } = await registerUser('features-auth-user');
    const res = await getAgent()
      .get('/api/features')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('features.submitPuzzle');
    expect(typeof res.body.features.submitPuzzle).toBe('boolean');
  });

  test('supports query override in non-production mode', async () => {
    const res = await getAgent().get('/api/features?ff_submit_puzzle=true');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      features: { submitPuzzle: true },
    });
  });

  test('supports header override in non-production mode', async () => {
    const res = await getAgent()
      .get('/api/features')
      .set('x-gwn-feature-submit-puzzle', 'true');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      features: { submitPuzzle: true },
    });
  });
});
