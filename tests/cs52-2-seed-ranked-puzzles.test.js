/**
 * CS52-2 — Ranked puzzle seed-script test.
 *
 * Asserts the operator-invoked seed script:
 *   - inserts all puzzles from ranked-puzzles-v1.json on first run
 *   - is idempotent (second run inserts zero rows, skips all)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwn-cs52-2-seed-'));
  process.env.GWN_DB_PATH = path.join(tmpDir, 'seed.db');
  process.env.NODE_ENV = 'test';
});

afterAll(async () => {
  try {
    const { closeDbAdapter } = require('../server/db');
    await closeDbAdapter();
  } catch {
    /* ignore */
  }
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  delete process.env.GWN_DB_PATH;
});

describe('seed-ranked-puzzles script', () => {
  test('first run inserts all puzzles, second run is a no-op (idempotent)', async () => {
    const { getDbAdapter } = require('../server/db');
    const migrations = require('../server/db/migrations');
    const db = await getDbAdapter();
    await db.migrate(migrations);

    const { seedRankedPuzzles, SEED_FILE } = require('../scripts/seed-ranked-puzzles');
    const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));

    // First run — every puzzle inserted.
    const first = await seedRankedPuzzles();
    expect(first.inserted).toBe(data.puzzles.length);
    expect(first.skipped).toBe(0);

    const rows = await db.all('SELECT id, status FROM ranked_puzzles');
    expect(rows.length).toBe(data.puzzles.length);
    for (const r of rows) {
      expect(r.status).toBe('active');
    }

    // Second run on the same DB — every puzzle skipped, no rows inserted.
    const second = await seedRankedPuzzles();
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(data.puzzles.length);
  });

  test('all puzzle ids are unique and answer is in options', () => {
    const { SEED_FILE } = require('../scripts/seed-ranked-puzzles');
    const data = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
    const ids = data.puzzles.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of data.puzzles) {
      expect(p.options).toContain(p.answer);
    }
  });
});
