/**
 * Puzzle routes — fetch puzzles from server.
 * In Phase 2, puzzles can be served from the DB or static data.
 * For now, serves the same puzzle set as the client-side JS.
 */

const express = require('express');
const router = express.Router();

/** GET /api/puzzles — get all puzzles (public) */
router.get('/', (req, res) => {
  // Puzzles are currently client-side; this endpoint exists for future
  // server-managed puzzle sets and to enable the multiplayer engine
  // to select puzzles server-side.
  res.json({ message: 'Puzzles are currently served client-side. This endpoint will be expanded in a future update.' });
});

module.exports = router;
