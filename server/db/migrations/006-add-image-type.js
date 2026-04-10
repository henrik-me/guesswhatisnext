/**
 * Migration 006 — Widen puzzle_submissions.type CHECK to include 'image'.
 *
 * For databases where migration 005 already ran with the old constraint
 * (only 'emoji','text'), this recreates the table with the updated CHECK.
 * SQLite doesn't support ALTER CHECK, so we use the table-rebuild pattern.
 */

module.exports = {
  version: 6,
  name: 'add-image-type-to-submissions',
  async up(db) {
    if (db.dialect === 'mssql') {
      // Drop old constraint and add updated one
      await db.exec(`
        IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_puzzle_submissions_type')
          ALTER TABLE puzzle_submissions DROP CONSTRAINT CK_puzzle_submissions_type;
        ALTER TABLE puzzle_submissions
          ADD CONSTRAINT CK_puzzle_submissions_type CHECK(type IN ('emoji', 'text', 'image'));
      `);
    } else {
      // SQLite: rebuild table to update CHECK constraint
      await db.exec(`
        CREATE TABLE IF NOT EXISTS puzzle_submissions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          sequence TEXT NOT NULL,
          answer TEXT NOT NULL,
          explanation TEXT NOT NULL,
          difficulty INTEGER NOT NULL DEFAULT 1,
          category TEXT NOT NULL DEFAULT 'General Knowledge',
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
          reviewer_notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          reviewed_at DATETIME,
          type TEXT NOT NULL DEFAULT 'emoji' CHECK(type IN ('emoji', 'text', 'image')),
          options TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `);
      await db.exec(`
        INSERT OR IGNORE INTO puzzle_submissions_new
          (id, user_id, sequence, answer, explanation, difficulty, category, status, reviewer_notes, created_at, reviewed_at, type, options)
        SELECT id, user_id, sequence, answer, explanation, difficulty, category, status, reviewer_notes, created_at, reviewed_at, type, options
        FROM puzzle_submissions;
      `);
      await db.exec('DROP TABLE IF EXISTS puzzle_submissions;');
      await db.exec('ALTER TABLE puzzle_submissions_new RENAME TO puzzle_submissions;');
    }
  },
};
