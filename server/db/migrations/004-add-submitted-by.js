/**
 * Migration 004 — Add submitted_by column to puzzles.
 *
 * No-op if the column already exists.
 */

module.exports = {
  version: 4,
  name: 'add-submitted-by-to-puzzles',
  async up(db) {
    try {
      await db.exec('ALTER TABLE puzzles ADD COLUMN submitted_by TEXT');
    } catch (_err) {
      // Column already exists — safe to ignore
    }
  },
};
