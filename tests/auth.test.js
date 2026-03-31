/**
 * Auth API smoke tests.
 */

const { getAgent, setup, teardown } = require('./helper');

beforeAll(setup);
afterAll(teardown);

describe('POST /api/auth/register', () => {
  test('registers a new user', async () => {
    const res = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'alice', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('alice');
    expect(res.body.token).toBeDefined();
  });

  test('rejects duplicate username', async () => {
    const res = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'alice', password: 'password123' });

    expect(res.status).toBe(409);
  });

  test('rejects missing fields', async () => {
    const res = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'bob' });

    expect(res.status).toBe(400);
  });

  test('rejects short username', async () => {
    const res = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'ab', password: 'password123' });

    expect(res.status).toBe(400);
  });

  test('rejects short password', async () => {
    const res = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'charlie', password: '12345' });

    expect(res.status).toBe(400);
  });

  test('rate-limits after 5 registrations in a burst', async () => {
    // Use unique names to avoid 409 conflicts (alice already registered above)
    for (let i = 0; i < 4; i++) {
      await getAgent()
        .post('/api/auth/register')
        .send({ username: `burst${i}xx`, password: 'password123' });
    }

    // 6th request (alice + burst0-3 = 5 already) should be rate-limited
    const res = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'burst4xx', password: 'password123' });

    expect(res.status).toBe(429);
    expect(res.body.error).toBeDefined();
    // standardHeaders: true sends Retry-After header
    expect(res.headers['retry-after']).toBeDefined();
  });
});

describe('POST /api/auth/login', () => {
  test('logs in with valid credentials', async () => {
    const res = await getAgent()
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('alice');
  });

  test('rejects wrong password', async () => {
    const res = await getAgent()
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'wrongpass' });

    expect(res.status).toBe(401);
  });

  test('rejects non-existent user', async () => {
    const res = await getAgent()
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'password123' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  test('returns current user with valid token', async () => {
    const loginRes = await getAgent()
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'password123' });

    const res = await getAgent()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('alice');
  });

  test('rejects without auth', async () => {
    const res = await getAgent().get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
