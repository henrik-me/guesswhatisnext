/**
 * Admin endpoint tests for orchestrated deploy lifecycle.
 */

const { getAgent, setup, teardown } = require('./helper');

const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';

beforeAll(setup);
afterAll(teardown);

describe('POST /api/admin/drain', () => {
  test('returns 200 with system API key', async () => {
    const res = await getAgent()
      .post('/api/admin/drain')
      .set('X-API-Key', SYSTEM_KEY);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('drained');
    expect(res.body.activeRequests).toBe(0);
  });

  test('rejects without auth', async () => {
    const res = await getAgent().post('/api/admin/drain');
    expect(res.status).toBe(401);
  });

  test('rejects with regular user token', async () => {
    // Register a regular user first (DB may be drained, re-init)
    await getAgent()
      .post('/api/admin/init-db')
      .set('X-API-Key', SYSTEM_KEY);

    const regRes = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'admindrainuser', password: 'password123' });

    const res = await getAgent()
      .post('/api/admin/drain')
      .set('Authorization', `Bearer ${regRes.body.token}`);

    expect(res.status).toBe(403);
  });

  test('after drain, API routes return 503', async () => {
    // Ensure DB is initialized
    await getAgent()
      .post('/api/admin/init-db')
      .set('X-API-Key', SYSTEM_KEY);

    // Drain
    const drainRes = await getAgent()
      .post('/api/admin/drain')
      .set('X-API-Key', SYSTEM_KEY);
    expect(drainRes.status).toBe(200);

    // API routes should return 503
    const res = await getAgent().get('/api/puzzles');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Server is draining');
  });
});

describe('POST /api/admin/init-db', () => {
  test('returns 200 with system API key', async () => {
    const res = await getAgent()
      .post('/api/admin/init-db')
      .set('X-API-Key', SYSTEM_KEY);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('initialized');
  });

  test('rejects without auth', async () => {
    const res = await getAgent().post('/api/admin/init-db');
    expect(res.status).toBe(401);
  });

  test('rejects with regular user token', async () => {
    const regRes = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'admininituser', password: 'password123' });

    const res = await getAgent()
      .post('/api/admin/init-db')
      .set('Authorization', `Bearer ${regRes.body.token}`);

    expect(res.status).toBe(403);
  });

  test('after init-db, API routes work again', async () => {
    // Drain first
    await getAgent()
      .post('/api/admin/drain')
      .set('X-API-Key', SYSTEM_KEY);

    // Verify drained
    const drainedRes = await getAgent().get('/api/puzzles');
    expect(drainedRes.status).toBe(503);

    // Re-initialize
    const initRes = await getAgent()
      .post('/api/admin/init-db')
      .set('X-API-Key', SYSTEM_KEY);
    expect(initRes.status).toBe(200);

    // API routes should work
    const regRes = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'afterinituser', password: 'password123' });
    expect(regRes.status).toBe(201);
  });
});

describe('GET /healthz', () => {
  test('returns 200 even when drained', async () => {
    // Drain
    await getAgent()
      .post('/api/admin/drain')
      .set('X-API-Key', SYSTEM_KEY);

    // healthz should still work
    const res = await getAgent().get('/healthz');
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');

    // Re-init for cleanup
    await getAgent()
      .post('/api/admin/init-db')
      .set('X-API-Key', SYSTEM_KEY);
  });
});
