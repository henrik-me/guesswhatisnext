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
    try {
      await db.exec('ALTER TABLE matches ADD COLUMN max_players INTEGER NOT NULL DEFAULT 2');
    } catch (err) {
      if (!isDuplicateColumnError(err)) throw err;
    }

    let hostAdded = false;
    try {
      await db.exec('ALTER TABLE matches ADD COLUMN host_user_id INTEGER REFERENCES users(id)');
      hostAdded = true;
    } catch (err) {
      if (!isDuplicateColumnError(err)) throw err;
    }

    // Backfill host_user_id — safe to run whether column was just added or already existed
    if (hostAdded) {
      await db.exec('UPDATE matches SET host_user_id = created_by WHERE host_user_id IS NULL');
    }
  },
};
