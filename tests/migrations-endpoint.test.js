'use strict';

/**
 * CS61-2 — GET /api/admin/migrations integration tests.
 *
 * Boots the full server (helper.js) so the new route, requireSystem auth,
 * the DB adapter, and the static migrations registry all interact through
 * the real Express stack against a temp SQLite DB.
 *
 * Coverage:
 *   - Auth: missing / wrong api key → 401; non-admin JWT → 403.
 *   - Status `ok`: after server startup migrations completed normally.
 *   - Status taxonomy snapshot: response shape matches the locked D2 contract.
 *   - Status `ahead`: simulated by stubbing the static migrations array shorter
 *     than the tracker's actual applied count.
 *   - Status `error`: simulated by stubbing db.getMigrationState() to return
 *     a non-null lastError.
 *   - Status `pending`: simulated by stubbing db.getMigrationState() to return
 *     applied < expected.
 *
 * The "fresh DB without ensureMigrationsTable" case from the brief is
 * structurally identical to the simulated `error` path: the adapter
 * swallows the tracker throw and returns lastError !== null. We exercise
 * it via the stub since helper.js always boots through the migrate path.
 */

const { getAgent, setup, teardown } = require('./helper');

const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';

beforeAll(setup);
afterAll(teardown);

// Cached references to the live adapter + static registry so individual
// tests can stub one method and reliably restore it. Loaded inside
// beforeAll-controlled helpers because helper.js clears the require cache.
function getDbAdapterModule() {
  return require('../server/db');
}
function getMigrationsModule() {
  return require('../server/db/migrations');
}

describe('GET /api/admin/migrations — auth', () => {
  test('missing api key → 401', async () => {
    const res = await getAgent().get('/api/admin/migrations');
    expect(res.status).toBe(401);
  });

  test('wrong api key → 401', async () => {
    const res = await getAgent()
      .get('/api/admin/migrations')
      .set('X-API-Key', 'definitely-not-the-key');
    expect(res.status).toBe(401);
  });

  test('regular user JWT → 403', async () => {
    const reg = await getAgent()
      .post('/api/auth/register')
      .send({ username: 'migrendpointregular', password: 'password123' });
    const res = await getAgent()
      .get('/api/admin/migrations')
      .set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/migrations — status: ok (post-startup migrate)', () => {
  test('returns applied === expected, status ok, names sorted by version', async () => {
    const res = await getAgent()
      .get('/api/admin/migrations')
      .set('X-API-Key', SYSTEM_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      applied: expect.any(Number),
      expected: expect.any(Number),
      status: 'ok',
      names: expect.any(Array),
      lastError: null,
    });

    const migrations = getMigrationsModule();
    expect(res.body.expected).toBe(migrations.length);
    expect(res.body.applied).toBe(migrations.length);

    // names are returned in version order — match the static registry order.
    const expectedNames = [...migrations]
      .sort((a, b) => a.version - b.version)
      .map((m) => m.name);
    expect(res.body.names).toEqual(expectedNames);
  });

  test('response shape contains exactly the contracted keys (no extras)', async () => {
    const res = await getAgent()
      .get('/api/admin/migrations')
      .set('X-API-Key', SYSTEM_KEY);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ['applied', 'expected', 'lastError', 'names', 'status'].sort()
    );
  });
});

describe('GET /api/admin/migrations — status taxonomy via stubs', () => {
  let originalGetMigrationState = null;
  let dbInstance = null;

  beforeAll(async () => {
    const { getDbAdapter } = getDbAdapterModule();
    dbInstance = await getDbAdapter();
    originalGetMigrationState = dbInstance.getMigrationState.bind(dbInstance);
  });

  afterEach(() => {
    if (dbInstance && originalGetMigrationState) {
      dbInstance.getMigrationState = originalGetMigrationState;
    }
  });

  test('lastError set → status=error, surfaces lastError verbatim', async () => {
    dbInstance.getMigrationState = async () => ({
      applied: 0,
      appliedNames: [],
      lastError: 'Invalid object name \'_migrations\'.',
    });

    const res = await getAgent()
      .get('/api/admin/migrations')
      .set('X-API-Key', SYSTEM_KEY);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('error');
    expect(res.body.lastError).toBe('Invalid object name \'_migrations\'.');
    expect(res.body.applied).toBe(0);
    expect(res.body.names).toEqual([]);
  });

  test('applied < expected → status=pending', async () => {
    const migrations = getMigrationsModule();
    dbInstance.getMigrationState = async () => ({
      applied: Math.max(0, migrations.length - 1),
      appliedNames: migrations.slice(0, -1).map((m) => m.name),
      lastError: null,
    });

    const res = await getAgent()
      .get('/api/admin/migrations')
      .set('X-API-Key', SYSTEM_KEY);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.applied).toBe(migrations.length - 1);
    expect(res.body.expected).toBe(migrations.length);
    expect(res.body.lastError).toBeNull();
  });

  test('applied > expected → status=ahead (legitimate during rollback)', async () => {
    const migrations = getMigrationsModule();
    const fakeAhead = migrations.length + 1;
    const fakeNames = [
      ...migrations.map((m) => m.name),
      '999-from-newer-deploy',
    ];
    dbInstance.getMigrationState = async () => ({
      applied: fakeAhead,
      appliedNames: fakeNames,
      lastError: null,
    });

    const res = await getAgent()
      .get('/api/admin/migrations')
      .set('X-API-Key', SYSTEM_KEY);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ahead');
    expect(res.body.applied).toBe(fakeAhead);
    expect(res.body.expected).toBe(migrations.length);
    expect(res.body.names).toEqual(fakeNames);
    expect(res.body.lastError).toBeNull();
  });

  test('error trumps applied===expected (lastError is the dominant signal)', async () => {
    const migrations = getMigrationsModule();
    dbInstance.getMigrationState = async () => ({
      applied: migrations.length,
      appliedNames: migrations.map((m) => m.name),
      lastError: 'partial-read failed mid-query',
    });

    const res = await getAgent()
      .get('/api/admin/migrations')
      .set('X-API-Key', SYSTEM_KEY);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('error');
    expect(res.body.lastError).toBe('partial-read failed mid-query');
  });

  test('thrown exception (not lastError) → 500 via next(err)', async () => {
    dbInstance.getMigrationState = async () => {
      throw new Error('synthetic adapter blow-up');
    };

    const res = await getAgent()
      .get('/api/admin/migrations')
      .set('X-API-Key', SYSTEM_KEY);

    // Adapter contract is to swallow tracker errors into lastError, so a
    // raw throw indicates something more serious — surface as 500.
    expect(res.status).toBe(500);
  });
});
