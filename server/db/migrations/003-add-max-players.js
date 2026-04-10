/**
 * Migration 003 — Add max_players and host_user_id to matches.
 *
 * No-op if columns already exist.  When adding, also backfills
 * host_user_id from created_by.  Each column is handled independently
 * so a partial prior run doesn't leave the schema in a broken state.
 */

const DUPLICATE_COL_RE = /duplicate column|already exists/i;

function isDuplicateColumnError(err) {
  const msg = err && err.message ? err.message : '';
  return DUPLICATE_COL_RE.test(msg);
}

module.exports = {
  version: 3,
  name: 'add-max-players-and-host-to-matches',
  async up(db) {
    if (db.dialect === 'mssql') {
      await db.exec(`
        IF COL_LENGTH('matches', 'max_players') IS NULL
          ALTER TABLE matches ADD max_players INT NOT NULL DEFAULT 2;
      `);
      await db.exec(`
        IF COL_LENGTH('matches', 'host_user_id') IS NULL
          ALTER TABLE matches ADD host_user_id INT;
      `);
      await db.exec(`
        IF NOT EXISTS (
          SELECT 1 FROM sys.foreign_keys fk
          JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
          JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
          WHERE fk.parent_object_id = OBJECT_ID('matches') AND c.name = 'host_user_id'
        )
          ALTER TABLE matches ADD CONSTRAINT FK_matches_host_user_id FOREIGN KEY (host_user_id) REFERENCES users(id);
      `);
    } else {
      try {
        await db.exec('ALTER TABLE matches ADD COLUMN max_players INTEGER NOT NULL DEFAULT 2');
      } catch (err) {
        if (!isDuplicateColumnError(err)) throw err;
      }

      try {
        await db.exec('ALTER TABLE matches ADD COLUMN host_user_id INTEGER REFERENCES users(id)');
      } catch (err) {
        if (!isDuplicateColumnError(err)) throw err;
      }
    }

    // Backfill host_user_id — safe whether column was just added or already existed
    await db.exec('UPDATE matches SET host_user_id = created_by WHERE host_user_id IS NULL');
  },
};
