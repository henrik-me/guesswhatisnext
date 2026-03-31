/**
 * Migration 003 — Add max_players and host_user_id to matches.
 *
 * No-op if columns already exist.  When adding, also backfills
 * host_user_id from created_by.
 */

module.exports = {
  version: 3,
  name: 'add-max-players-and-host-to-matches',
  async up(db) {
    try {
      await db.exec('ALTER TABLE matches ADD COLUMN max_players INTEGER NOT NULL DEFAULT 2');
      await db.exec('ALTER TABLE matches ADD COLUMN host_user_id INTEGER REFERENCES users(id)');
      await db.exec('UPDATE matches SET host_user_id = created_by WHERE host_user_id IS NULL');
    } catch (err) {
      const msg = err && err.message ? err.message : '';
      if (!/duplicate column|already exists/i.test(msg)) throw err;
    }
  },
};
