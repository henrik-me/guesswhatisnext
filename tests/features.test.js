/**
 * Feature flags API tests.
 */

const { getAgent, setup, teardown, registerUser } = require('./helper');

let userToken;

beforeAll(async () => {
  await setup();
  const { token } = await registerUser('feature-user');
  userToken = token;
});

afterAll(teardown);

describe('GET /api/features', () => {
  test('returns default-disabled flags for anonymous users', async () => {
    const res = await getAgent().get('/api/features');

    expect(res.status).toBe(200);
    expect(res.body.features).toEqual({ submitPuzzle: false });
  });

  test('returns default-disabled flags for authenticated users', async () => {
    const res = await getAgent()
      .get('/api/features')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.features.submitPuzzle).toBe(false);
  });

  test('applies the query override for authenticated requests', async () => {
    const res = await getAgent()
      .get('/api/features?ff_submit_puzzle=1')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.features.submitPuzzle).toBe(true);
  });

  test('ignores invalid override values', async () => {
    const res = await getAgent()
      .get('/api/features?ff_submit_puzzle=maybe')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.features.submitPuzzle).toBe(false);
  });
});
