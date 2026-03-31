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

  test('rate-limits registration and includes Retry-After header', async () => {
    // Send registration requests until we hit a 429 (previous tests in this
    // describe already consumed some of the burst budget)
    let rateLimited = false;
    for (let i = 0; i < 10; i++) {
      const res = await getAgent()
        .post('/api/auth/register')
        .send({ username: `ratelim${i}`, password: 'password123' });

      if (res.status === 429) {
        expect(res.body.error).toBeDefined();
        expect(res.headers['retry-after']).toBeDefined();
        rateLimited = true;
        break;
      }
    }

    expect(rateLimited).toBe(true);
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
