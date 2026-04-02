/**
 * Migration tracker — manages versioned schema migrations.
 *
 * Tracks applied migrations in a `_migrations` table and runs
 * pending ones in order. Each migration is wrapped in a transaction.
 *
 * This module is used by BaseAdapter.migrate() and should not be
 * imported directly by routes.
 */

const MIGRATIONS_TABLE = '_migrations';
const logger = require('../../logger');

/**
 * Ensure the migrations tracking table exists.
 * @param {import('../base-adapter')} db
 */
async function ensureMigrationsTable(db) {
  if (db.dialect === 'sqlite') {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } else {
    await db.exec(`
      IF OBJECT_ID('${MIGRATIONS_TABLE}', 'U') IS NULL
      CREATE TABLE ${MIGRATIONS_TABLE} (
        version INT PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        applied_at DATETIME DEFAULT GETDATE()
      )
    `);
  }
}

/**
 * Get the set of already-applied migration versions.
 * @param {import('../base-adapter')} db
 * @returns {Promise<Set<number>>}
 */
async function getAppliedVersions(db) {
  const rows = await db.all(`SELECT version FROM ${MIGRATIONS_TABLE}`);
  return new Set(rows.map((r) => r.version));
}

/**
 * Run all pending migrations in version order.
 *
 * @param {import('../base-adapter')} db - Database adapter
 * @param {Array<{version: number, name: string, up: function}>} migrations
 *   Each migration must export `{ version, name, up(db) }`.
 *   `up` receives the adapter and should use db.exec/run/etc.
 * @returns {Promise<number>} Number of newly applied migrations
 */
async function runMigrations(db, migrations) {
  await ensureMigrationsTable(db);
  const applied = await getAppliedVersions(db);

  const pending = migrations
    .filter((m) => !applied.has(m.version))
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await db.transaction(async (tx) => {
      await migration.up(tx);
      await tx.run(
        `INSERT INTO ${MIGRATIONS_TABLE} (version, name) VALUES (?, ?)`,
        [migration.version, migration.name]
      );
    });
    logger.info({ version: migration.version, name: migration.name }, 'Migration applied');
  }

  return pending.length;
}

module.exports = { runMigrations, ensureMigrationsTable, getAppliedVersions };
