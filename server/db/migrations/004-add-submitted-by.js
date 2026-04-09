/**
 * Migration 004 — Add submitted_by column to puzzles.
 *
 * No-op if the column already exists.
 */

module.exports = {
  version: 4,
  name: 'add-submitted-by-to-puzzles',
  async up(db) {
    if (db.dialect === 'mssql') {
      await db.exec(`
        IF COL_LENGTH('puzzles', 'submitted_by') IS NULL
          ALTER TABLE puzzles ADD submitted_by NVARCHAR(255);
      `);
    } else {
      try {
        await db.exec('ALTER TABLE puzzles ADD COLUMN submitted_by TEXT');
      } catch (err) {
        const msg = err && err.message ? err.message : '';
        if (!/duplicate column|already exists/i.test(msg)) throw err;
      }
    }
  },
};
