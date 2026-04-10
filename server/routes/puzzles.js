/**
 * Puzzle routes — fetch puzzles from the database.
 */

const express = require('express');
const router = express.Router();
const { getDbAdapter } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

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

/** Parse a community puzzle row — includes submitted_by and created_at. */
function parseCommunityPuzzleRow(row) {
  return {
    id: row.id,
    category: row.category,
    difficulty: row.difficulty,
    type: row.type,
    sequence: JSON.parse(row.sequence),
    answer: row.answer,
    options: JSON.parse(row.options),
    explanation: row.explanation,
    submitted_by: row.submitted_by,
    created_at: row.created_at,
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

/** GET /api/puzzles/community — browse approved community puzzles (public). */
router.get('/community', optionalAuth, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const { category, difficulty } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    let whereClauses = 'submitted_by IS NOT NULL AND active = 1';
    const params = [];

    if (category) {
      whereClauses += ' AND category = ?';
      params.push(category);
    }
    if (difficulty) {
      const diff = parseInt(difficulty, 10);
      if (isNaN(diff) || diff < 1 || diff > 3) {
        return res.status(400).json({ error: 'Difficulty must be 1, 2, or 3' });
      }
      whereClauses += ' AND difficulty = ?';
      params.push(diff);
    }

    const countRow = await db.get(
      `SELECT COUNT(*) AS cnt FROM puzzles WHERE ${whereClauses}`,
      params
    );
    const total = countRow.cnt;

    const rows = await db.all(
      `SELECT * FROM puzzles WHERE ${whereClauses} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      puzzles: rows.map(parseCommunityPuzzleRow),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
