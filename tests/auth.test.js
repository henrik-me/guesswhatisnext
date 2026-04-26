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

  test('coerces string user-id from JWT payload to integer (CS53-23 R4 defense)', async () => {
    // Defense-in-depth: even if a non-numeric id ever sneaks into the JWT
    // payload (e.g. UUID-id user added later), requireAuth must hand
    // downstream code a numeric id so DB params, ownership checks, and
    // in-memory caches (unread-count-cache) all key consistently.
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../server/middleware/auth');
    // Hand-craft a token with a string id.
    const stringIdToken = jwt.sign(
      { id: '42', username: 'string-id-user', role: 'user' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    // /api/auth/me echoes req.user back; it's the cleanest way to inspect
    // what the middleware produced without poking internals.
    const res = await getAgent()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${stringIdToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(42);
    expect(typeof res.body.user.id).toBe('number');
  });

  test('rejects JWT with non-coercible user id (CS53-23 R5 — must not collapse to 0=system)', async () => {
    // Copilot R5 security finding: the previous _coerceUserId returned 0
    // for any non-finite / non-positive value, which would silently
    // authenticate a malformed token as the system pseudo-user (id=0).
    // The fix returns null and requireAuth must respond 401 instead.
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../server/middleware/auth');

    // Each of these payloads should be REJECTED with 401 — never silently
    // become req.user.id = 0.
    const badPayloads = [
      { id: 'not-a-number', username: 'attacker', role: 'user' },
      { id: 0, username: 'attacker', role: 'user' },           // would alias to system
      { id: -1, username: 'attacker', role: 'user' },
      { id: null, username: 'attacker', role: 'user' },
      { id: 1.5, username: 'attacker', role: 'user' },          // non-integer
    ];
    for (const payload of badPayloads) {
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
      const res = await getAgent()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    }
  });
});
