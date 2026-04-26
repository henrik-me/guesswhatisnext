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
let originalDbPath;
let originalNodeEnv;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwn-cs52-2-seed-'));
  originalDbPath = process.env.GWN_DB_PATH;
  originalNodeEnv = process.env.NODE_ENV;
  process.env.GWN_DB_PATH = path.join(tmpDir, 'seed.db');
  process.env.NODE_ENV = 'test';

  // Defensive isolation: if another test file in the same vitest worker has
  // already imported/initialized the server/db singleton, it will be holding a
  // handle to the previous GWN_DB_PATH. Close any existing adapter and then
  // purge the cached server modules so the next require('../server/db') gives
  // us a fresh singleton bound to OUR temp DB. Mirrors tests/helper.js.
  try {
    const existing = require('../server/db');
    if (typeof existing.closeDbAdapter === 'function') {
      await existing.closeDbAdapter();
    }
  } catch {
    /* ignore — module not yet loaded is fine */
  }
  const serverDir = path.resolve(__dirname, '..', 'server');
  const scriptsDir = path.resolve(__dirname, '..', 'scripts');
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverDir) || key.startsWith(scriptsDir)) {
      delete require.cache[key];
    }
  }
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
  // Restore previously-set env values (deleting if they weren't set originally)
  // so this file is well-behaved when run alongside others or under different
  // vitest isolation modes.
  if (originalDbPath === undefined) {
    delete process.env.GWN_DB_PATH;
  } else {
    process.env.GWN_DB_PATH = originalDbPath;
  }
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
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
