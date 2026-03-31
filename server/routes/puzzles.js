/**
 * Puzzle routes — fetch puzzles from the database.
 */

const express = require('express');
const router = express.Router();
const { getDbAdapter } = require('../db');
const { requireAuth } = require('../middleware/auth');

/** Parse DB row JSON fields back to arrays. */
function parsePuzzleRow(row) {
  return {
    ...row,
    sequence: JSON.parse(row.sequence),
    options: JSON.parse(row.options),
    active: undefined,
    created_at: undefined,
  };
}

/** GET /api/puzzles — get all active puzzles (requires auth). */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const { category, difficulty } = req.query;

    let sql = 'SELECT * FROM puzzles WHERE active = 1';
    const params = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (difficulty) {
      const diff = parseInt(difficulty, 10);
      if (isNaN(diff) || diff < 1 || diff > 3) {
        return res.status(400).json({ error: 'Difficulty must be 1, 2, or 3' });
      }
      sql += ' AND difficulty = ?';
      params.push(diff);
    }

    sql += ' ORDER BY category, difficulty, id';

    const rows = await db.all(sql, params);
    const puzzles = rows.map(parsePuzzleRow);

    res.json(puzzles);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
