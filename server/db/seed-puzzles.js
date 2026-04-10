/**
 * Seed puzzles into the database from puzzleData.js.
 * Idempotent — SQLite uses INSERT OR REPLACE (upsert), MSSQL uses
 * conditional INSERT (skips existing rows).
 *
 * Usage: node server/db/seed-puzzles.js
 */

const { getDbAdapter } = require('./index');
const puzzles = require('../puzzleData');
const logger = require('../logger');

async function seedPuzzles() {
  const db = await getDbAdapter();

  await db.transaction(async (tx) => {
    for (const p of puzzles) {
      const params = [p.id, p.category, p.difficulty, p.type, JSON.stringify(p.sequence), p.answer, JSON.stringify(p.options), p.explanation];
      if (db.dialect === 'mssql') {
        // Single-query conditional INSERT; pass id twice for the WHERE NOT EXISTS check
        await tx.run(
          `INSERT INTO puzzles (id, category, difficulty, type, sequence, answer, options, explanation, active)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1
           WHERE NOT EXISTS (SELECT 1 FROM puzzles WHERE id = ?)`,
          [...params, p.id]
        );
      } else {
        await tx.run(
          `INSERT OR REPLACE INTO puzzles (id, category, difficulty, type, sequence, answer, options, explanation, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          params
        );
      }
    }
  });

  logger.info({ count: puzzles.length }, 'Puzzles seeded into database');
}

// Run directly
if (require.main === module) {
  (async () => {
    try {
      const migrations = require('./migrations');
      const db = await getDbAdapter();
      await db.migrate(migrations);
      await seedPuzzles();
    } catch (err) {
      logger.error({ err }, 'Seed failed');
      process.exitCode = 1;
    } finally {
      try {
        const { closeDbAdapter } = require('./index');
        await closeDbAdapter();
      } catch { /* ignore */ }
      if (process.exitCode) {
        process.exit(process.exitCode);
      }
    }
  })();
}

module.exports = { seedPuzzles };
