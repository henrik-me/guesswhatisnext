/**
 * Migration 005 — Add type and options columns to puzzle_submissions.
 *
 * - type: defaults to 'emoji' for backward compat with existing rows
 * - options: nullable JSON array; null means "auto-generate on approval"
 */

module.exports = {
  version: 5,
  name: 'add-submission-type-and-options',
  async up(db) {
    if (db.dialect === 'mssql') {
      await db.exec(`
        IF COL_LENGTH('puzzle_submissions', 'type') IS NULL
          ALTER TABLE puzzle_submissions ADD type NVARCHAR(50) NOT NULL
            CONSTRAINT DF_puzzle_submissions_type DEFAULT 'emoji'
            CONSTRAINT CK_puzzle_submissions_type CHECK(type IN ('emoji', 'text'));
      `);
      await db.exec(`
        IF COL_LENGTH('puzzle_submissions', 'options') IS NULL
          ALTER TABLE puzzle_submissions ADD options NVARCHAR(MAX);
      `);
    } else {
      try {
        await db.exec(
          "ALTER TABLE puzzle_submissions ADD COLUMN type TEXT NOT NULL DEFAULT 'emoji' CHECK(type IN ('emoji', 'text'))"
        );
      } catch (err) {
        const msg = err && err.message ? err.message : '';
        if (!/duplicate column|already exists/i.test(msg)) throw err;
      }
      try {
        await db.exec(
          'ALTER TABLE puzzle_submissions ADD COLUMN options TEXT'
        );
      } catch (err) {
        const msg = err && err.message ? err.message : '';
        if (!/duplicate column|already exists/i.test(msg)) throw err;
      }
    }
  },
};
