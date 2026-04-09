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
    if (db.dialect === 'mssql') {
      // MSSQL: use COL_LENGTH to check if column exists before adding
      await db.exec(`
        IF COL_LENGTH('users', 'role') IS NULL
        BEGIN
          ALTER TABLE users ADD role NVARCHAR(50) NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'system', 'admin'));
        END
      `);
    } else {
      try {
        await db.exec(
          "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' " +
          "CHECK(role IN ('user', 'system', 'admin'))"
        );
      } catch (err) {
        const msg = err && err.message ? err.message : '';
        if (!/duplicate column|already exists/i.test(msg)) throw err;
      }
    }
  },
};
