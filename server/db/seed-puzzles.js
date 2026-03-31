/**
 * Seed puzzles into the database from puzzleData.js.
 * Idempotent — uses INSERT OR REPLACE so it can be run repeatedly.
 *
 * Usage: node server/db/seed-puzzles.js
 */

const { getDbAdapter } = require('./index');
const puzzles = require('../puzzleData');

async function seedPuzzles() {
  const db = await getDbAdapter();

  await db.transaction(async (tx) => {
    for (const p of puzzles) {
      await tx.run(
        `INSERT OR REPLACE INTO puzzles (id, category, difficulty, type, sequence, answer, options, explanation, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [p.id, p.category, p.difficulty, p.type, JSON.stringify(p.sequence), p.answer, JSON.stringify(p.options), p.explanation]
      );
    }
  });

  console.log(`🧩 Seeded ${puzzles.length} puzzles into database`);
}

// Run directly
if (require.main === module) {
  (async () => {
    const migrations = require('./migrations');
    const db = await getDbAdapter();
    await db.migrate(migrations);
    await seedPuzzles();
    const { closeDbAdapter } = require('./index');
    await closeDbAdapter();
    process.exit(0);
  })();
}

module.exports = { seedPuzzles };
