/**
 * CS52-followup — POST /api/admin/seed-ranked-puzzles endpoint tests.
 *
 * Asserts:
 *   - 401 on missing/wrong x-api-key (requireSystem).
 *   - 200 on first call returns { inserted=N, skipped=0, total=N, version }.
 *   - 200 on second call is idempotent — { inserted=0, skipped=N, total=N }.
 *   - DB row count in `ranked_puzzles` matches N before and after re-seed.
 *
 * Mirrors `tests/seed-smoke-user-endpoint.test.js` setup / agent pattern.
 */

const { getAgent, setup, teardown } = require('./helper');

const SYSTEM_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';

beforeAll(setup);
afterAll(teardown);

async function clearRankedPuzzles() {
  const { getDbAdapter } = require('../server/db');
  const db = await getDbAdapter();
  await db.run('DELETE FROM ranked_puzzles');
}

function loadSeedTotal() {
  const fs = require('fs');
  const { SEED_FILE } = require('../server/services/seedRankedPuzzles');
  const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
  return data.puzzles.length;
}

describe('POST /api/admin/seed-ranked-puzzles', () => {
  beforeEach(async () => {
    // Make sure the DB adapter is alive for suites that drain between files.
    await getAgent().post('/api/admin/init-db').set('X-API-Key', SYSTEM_KEY);
    await clearRankedPuzzles();
  });

  test('rejects with no auth (401)', async () => {
    const res = await getAgent().post('/api/admin/seed-ranked-puzzles').send({});
    expect(res.status).toBe(401);
  });

  test('rejects with wrong API key (401)', async () => {
    const res = await getAgent()
      .post('/api/admin/seed-ranked-puzzles')
      .set('X-API-Key', 'wrong-key-xyz')
      .send({});
    expect(res.status).toBe(401);
  });

  test('first call seeds all puzzles; second call is a no-op (idempotent)', async () => {
    const total = loadSeedTotal();

    const first = await getAgent()
      .post('/api/admin/seed-ranked-puzzles')
      .set('X-API-Key', SYSTEM_KEY)
      .send({});
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      inserted: total,
      skipped: 0,
      total,
      version: 1,
    });

    const { getDbAdapter } = require('../server/db');
    const db = await getDbAdapter();
    let rows = await db.all('SELECT id, status FROM ranked_puzzles');
    expect(rows.length).toBe(total);
    for (const r of rows) {
      expect(r.status).toBe('active');
    }

    const second = await getAgent()
      .post('/api/admin/seed-ranked-puzzles')
      .set('X-API-Key', SYSTEM_KEY)
      .send({});
    expect(second.status).toBe(200);
    expect(second.body).toEqual({
      inserted: 0,
      skipped: total,
      total,
      version: 1,
    });

    rows = await db.all('SELECT id FROM ranked_puzzles');
    expect(rows.length).toBe(total);
  });
});
