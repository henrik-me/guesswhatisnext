/**
 * Seed the ranked puzzle pool from server/db/seeds/ranked-puzzles-v1.json.
 *
 * Operator-invoked only — boot-quiet contract: the application MUST NOT
 * run this on its own. Use:
 *
 *     npm run seed:ranked-puzzles
 *
 * Idempotent: rows with an existing id are skipped (no overwrite). To
 * intentionally update a puzzle, retire it via a separate admin path.
 *
 * Distinct from the bundled local-mode deck (server/db/seed-puzzles.js +
 * public/js/puzzles.js) — ranked puzzles live in the `ranked_puzzles` table
 * and the answer field is NEVER returned through any client-facing endpoint
 * (per CS52 Decision #4).
 */

const path = require('path');
const fs = require('fs');
const { getDbAdapter, closeDbAdapter } = require('../server/db');
const logger = require('../server/logger');

const SEED_FILE = path.join(
  __dirname,
  '..',
  'server',
  'db',
  'seeds',
  'ranked-puzzles-v1.json'
);

async function seedRankedPuzzles() {
  const raw = fs.readFileSync(SEED_FILE, 'utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data.puzzles)) {
    throw new Error(`Seed file missing "puzzles" array: ${SEED_FILE}`);
  }

  const db = await getDbAdapter();
  const nowIso = new Date().toISOString();
  let inserted = 0;
  let skipped = 0;

  await db.transaction(async (tx) => {
    for (const p of data.puzzles) {
      const existing = await tx.get(
        'SELECT id FROM ranked_puzzles WHERE id = ?',
        [p.id]
      );
      if (existing) {
        skipped += 1;
        continue;
      }
      await tx.run(
        `INSERT INTO ranked_puzzles
           (id, category, prompt, options, answer, difficulty, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          p.id,
          p.category,
          typeof p.prompt === 'string' ? p.prompt : JSON.stringify(p.prompt),
          JSON.stringify(p.options),
          p.answer,
          p.difficulty ?? null,
          nowIso,
        ]
      );
      inserted += 1;
    }
  });

  logger.info(
    { inserted, skipped, total: data.puzzles.length, version: data.version },
    'Ranked puzzles seeded'
  );
  return { inserted, skipped };
}

if (require.main === module) {
  (async () => {
    try {
      const migrations = require('../server/db/migrations');
      const db = await getDbAdapter();
      await db.migrate(migrations);
      await seedRankedPuzzles();
    } catch (err) {
      logger.error({ err }, 'Ranked puzzle seed failed');
      process.exitCode = 1;
    } finally {
      try {
        await closeDbAdapter();
      } catch {
        /* ignore */
      }
      if (process.exitCode) process.exit(process.exitCode);
    }
  })();
}

module.exports = { seedRankedPuzzles, SEED_FILE };
