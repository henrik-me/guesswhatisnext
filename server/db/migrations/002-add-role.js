/**
 * Migration 002 — Add role column to users.
 *
 * No-op if the column already exists (e.g. database created with
 * the latest schema.sql which already includes the role column).
 */

module.exports = {
  version: 2,
  name: 'add-role-to-users',
  async up(db) {
    try {
      await db.exec(
        "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' " +
        "CHECK(role IN ('user', 'system', 'admin'))"
      );
    } catch (_err) {
      // Column already exists — safe to ignore
    }
  },
};
