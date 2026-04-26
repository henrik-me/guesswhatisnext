/**
 * CS61-1 — POST /api/admin/seed-smoke-user endpoint tests.
 *
 * Locked contract (CS61 plan v3 § D1):
 *   - Auth: requireSystem (x-api-key SYSTEM_API_KEY).
 *   - Body: { password: string, ≥6 chars }.
 *   - 201 { status:'created', username:'gwn-smoke-bot' } on first call.
 *   - 200 { status:'exists',  username:'gwn-smoke-bot' } on subsequent calls.
 *   - 400 on missing/short password.
 *   - Audit log `audit.seed-smoke-user` with structured context.
 *   - Reserved-prefix bypass scoped: /api/auth/register STILL rejects
 *     `gwn-smoke-*` even for usernames other than gwn-smoke-bot.
 */

const { getAgent, setup, teardown } = require('./helper');

const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';

beforeAll(setup);
afterAll(teardown);

async function deleteSmokeBotIfExists() {
  // Keep the test suite hermetic: other suites (or earlier tests in this file)
  // may have inserted gwn-smoke-bot. Strip it before each round of the
  // create→exists progression test.
  const { getDbAdapter } = require('../server/db');
  const db = await getDbAdapter();
  await db.run('DELETE FROM users WHERE username = ?', ['gwn-smoke-bot']);
}

describe('POST /api/admin/seed-smoke-user', () => {
  beforeEach(async () => {
    // Ensure DB is initialized (other suites may have drained it).
    await getAgent()
      .post('/api/admin/init-db')
      .set('X-API-Key', SYSTEM_KEY);
    await deleteSmokeBotIfExists();
  });

  test('rejects with no auth (401)', async () => {
    const res = await getAgent()
      .post('/api/admin/seed-smoke-user')
      .send({ password: 'sufficient-pw' });
    expect(res.status).toBe(401);
  });

  test('rejects with wrong API key (401)', async () => {
    const res = await getAgent()
      .post('/api/admin/seed-smoke-user')
      .set('X-API-Key', 'wrong-key-xyz')
      .send({ password: 'sufficient-pw' });
    expect(res.status).toBe(401);
  });

  test('rejects with regular-user JWT (403)', async () => {
    const reg = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'cs61seedreguser', password: 'password123' });
    expect(reg.status).toBe(201);
    const res = await getAgent()
      .post('/api/admin/seed-smoke-user')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ password: 'sufficient-pw' });
    expect(res.status).toBe(403);
  });

  test('rejects missing password (400)', async () => {
    const res = await getAgent()
      .post('/api/admin/seed-smoke-user')
      .set('X-API-Key', SYSTEM_KEY)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  test('rejects short password (400)', async () => {
    const res = await getAgent()
      .post('/api/admin/seed-smoke-user')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ password: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  test('rejects non-string password (400)', async () => {
    const res = await getAgent()
      .post('/api/admin/seed-smoke-user')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ password: 12345678 });
    expect(res.status).toBe(400);
  });

  test('first call creates user (201) with audit log; second call returns exists (200)', async () => {
    const logger = require('../server/logger');
    const infoCalls = [];
    const origInfo = logger.info.bind(logger);
    logger.info = (...args) => {
      infoCalls.push(args);
      return origInfo(...args);
    };

    try {
      const res1 = await getAgent()
        .post('/api/admin/seed-smoke-user')
        .set('X-API-Key', SYSTEM_KEY)
        .send({ password: 'sufficient-pw' });
      expect(res1.status).toBe(201);
      expect(res1.body).toEqual({ status: 'created', username: 'gwn-smoke-bot' });

      // Audit log emitted with the locked structured shape.
      const createdLog = infoCalls.find(
        (args) => args[1] === 'audit.seed-smoke-user'
              && args[0] && args[0].result === 'created'
      );
      expect(createdLog).toBeDefined();
      expect(createdLog[0]).toMatchObject({
        actor: 'system-api-key',
        action: 'seed-smoke-user',
        result: 'created',
        username: 'gwn-smoke-bot',
      });

      // Idempotent: second call returns 200 exists.
      const res2 = await getAgent()
        .post('/api/admin/seed-smoke-user')
        .set('X-API-Key', SYSTEM_KEY)
        .send({ password: 'a-different-pw-also-valid' });
      expect(res2.status).toBe(200);
      expect(res2.body).toEqual({ status: 'exists', username: 'gwn-smoke-bot' });

      const existsLog = infoCalls.find(
        (args) => args[1] === 'audit.seed-smoke-user'
              && args[0] && args[0].result === 'exists'
      );
      expect(existsLog).toBeDefined();
      expect(existsLog[0]).toMatchObject({
        actor: 'system-api-key',
        action: 'seed-smoke-user',
        result: 'exists',
        username: 'gwn-smoke-bot',
      });

      // Verify user is actually persisted with the expected role default.
      const { getDbAdapter } = require('../server/db');
      const db = await getDbAdapter();
      const row = await db.get(
        'SELECT username, role FROM users WHERE username = ?',
        ['gwn-smoke-bot']
      );
      expect(row).toBeDefined();
      expect(row.username).toBe('gwn-smoke-bot');
      expect(row.role).toBe('user');
    } finally {
      logger.info = origInfo;
    }
  });

  test('seeded user can log in via /api/auth/login with the supplied password', async () => {
    const seed = await getAgent()
      .post('/api/admin/seed-smoke-user')
      .set('X-API-Key', SYSTEM_KEY)
      .send({ password: 'login-roundtrip-pw' });
    expect([200, 201]).toContain(seed.status);

    const login = await getAgent()
      .post('/api/auth/login')
      .send({ username: 'gwn-smoke-bot', password: 'login-roundtrip-pw' });
    expect(login.status).toBe(200);
    expect(login.body.user.username).toBe('gwn-smoke-bot');
    expect(login.body.token).toBeDefined();
  });

  test('reserved-prefix bypass is scoped: /api/auth/register STILL rejects gwn-smoke-* usernames', async () => {
    // The endpoint creates `gwn-smoke-bot` directly via SQL with a hard-coded
    // username — it never calls isReservedUsername(). This proves the bypass
    // is structural and cannot leak to /api/auth/register.
    const res = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'gwn-smoke-evil', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reserved/i);

    // And gwn-smoke-bot itself is also still rejected on the public path.
    const res2 = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'gwn-smoke-bot', password: 'password123' });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toMatch(/reserved/i);
  });
});
