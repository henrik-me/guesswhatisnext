/**
 * Seed puzzles into the database from puzzleData.js.
 * Idempotent — uses INSERT OR REPLACE so it can be run repeatedly.
 *
 * Usage: node server/db/seed-puzzles.js
 */

const { getDb, initDb } = require('./connection');
const puzzles = require('../puzzleData');

function seedPuzzles() {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO puzzles (id, category, difficulty, type, sequence, answer, options, explanation, active)
    VALUES (@id, @category, @difficulty, @type, @sequence, @answer, @options, @explanation, 1)
  `);

  const insertAll = db.transaction((puzzleList) => {
    for (const p of puzzleList) {
      stmt.run({
        id: p.id,
        category: p.category,
        difficulty: p.difficulty,
        type: p.type,
        sequence: JSON.stringify(p.sequence),
        answer: p.answer,
        options: JSON.stringify(p.options),
        explanation: p.explanation,
      });
    }
  });

  insertAll(puzzles);
  console.log(`🧩 Seeded ${puzzles.length} puzzles into database`);
}

// Run directly
if (require.main === module) {
  initDb();
  seedPuzzles();
  process.exit(0);
}

module.exports = { seedPuzzles };
