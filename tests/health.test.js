/**
 * Health endpoint smoke tests.
 */

const { getAgent, setup, teardown } = require('./helper');

const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';

beforeAll(setup);
afterAll(teardown);

describe('GET /api/health', () => {
  test('returns health with system API key', async () => {
    const res = await getAgent()
      .get('/api/health')
      .set('X-API-Key', SYSTEM_KEY);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database).toBeDefined();
    expect(res.body.checks.websocket).toBeDefined();
    expect(res.body.checks.uptime).toBeDefined();
    expect(res.body.version).toBeDefined();
    expect(res.body.environment).toBe('test');
  });

  test('rejects without auth', async () => {
    const res = await getAgent().get('/api/health');
    expect(res.status).toBe(401);
  });

  test('rejects with regular user token', async () => {
    // Register a regular user
    const regRes = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'healthuser', password: 'password123' });

    const res = await getAgent()
      .get('/api/health')
      .set('Authorization', `Bearer ${regRes.body.token}`);

    expect(res.status).toBe(403);
  });
});
