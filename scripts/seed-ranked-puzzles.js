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

const { getDbAdapter, closeDbAdapter } = require('../server/db');
const logger = require('../server/logger');
const {
  seedRankedPuzzles: seedRankedPuzzlesCore,
  SEED_FILE,
} = require('../server/services/seedRankedPuzzles');

/**
 * CLI/test entrypoint — opens its own adapter, runs the shared core, emits
 * the structured `Ranked puzzles seeded` log line, and returns the result.
 * Argument-less to preserve the CS52-2 test contract
 * (`tests/cs52-2-seed-ranked-puzzles.test.js`); the route calls the core
 * directly with an already-opened adapter.
 */
async function seedRankedPuzzles() {
  const db = await getDbAdapter();
  const result = await seedRankedPuzzlesCore(db);
  logger.info(
    {
      inserted: result.inserted,
      skipped: result.skipped,
      total: result.total,
      version: result.version,
    },
    'Ranked puzzles seeded'
  );
  return result;
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

