#!/usr/bin/env node
/**
 * scripts/migrate.js — CLI wrapper around the existing migration framework
 * (`server/db/migrations` + `server/db/migrations/_tracker.js`).
 *
 * This is the standalone entry point used by deploy workflows
 * (.github/workflows/{prod,staging}-deploy.yml) to apply pending DB migrations
 * BEFORE traffic is shifted to a new revision. The script delegates to
 * `db.migrate(migrations)` — the same call `server/app.js` performs at
 * startup — and exits 0 on success / 1 on failure so the workflow step can
 * gate the subsequent traffic-shift step on a clean migration result.
 *
 * Backend selection follows `server/db/index.js`:
 *   - `DATABASE_URL` set → MSSQL adapter
 *   - `DATABASE_URL` unset → SQLite adapter (using `GWN_DB_PATH`)
 *
 * Idempotency: the framework's `_migrations` tracking table records every
 * applied migration's `version`; pending migrations are computed as
 * `migrations.filter(m => !applied.has(m.version))`. Running the script twice
 * back-to-back is a no-op on the second run (logs "Applied 0 migrations").
 *
 * How to run:
 *
 *   # Local against the dev MSSQL stack (`npm run dev:mssql`):
 *   $env:DATABASE_URL = "Server=localhost,1433;Database=gwn;User Id=sa;Password=GwnTest1!;Encrypt=false;TrustServerCertificate=true"
 *   node scripts/migrate.js
 *
 *   # Local against the dev SQLite database (no DATABASE_URL):
 *   node scripts/migrate.js
 *
 *   # In CI: DATABASE_URL is sourced from the per-environment GitHub secret
 *   #        (`secrets.DATABASE_URL` for prod, `secrets.STAGING_DATABASE_URL`
 *   #        for staging) and exported into the step's env.
 *
 * Exit codes:
 *   0 — all pending migrations applied (or no migrations were pending)
 *   1 — migration failed (connection error, transaction rollback, etc.)
 */

'use strict';

const defaultMigrations = require('../server/db/migrations');
const defaultDb = require('../server/db');

/**
 * Apply pending migrations against the singleton DB adapter.
 *
 * Dependencies are injectable for unit testing — production callers (the
 * CLI `main()` below) use the live `server/db` module and the live migration
 * registry. Tests pass in fakes so the script's wiring can be exercised
 * without touching a real adapter.
 *
 * @param {Object} [deps]
 * @param {Function} [deps.getDbAdapter] - Returns Promise<adapter>
 * @param {Array} [deps.migrations] - Migration definitions
 * @returns {Promise<number>} Count of newly applied migrations
 */
async function runMigrations(deps = {}) {
  const getDbAdapter = deps.getDbAdapter || defaultDb.getDbAdapter;
  const migrations = deps.migrations || defaultMigrations;
  const db = await getDbAdapter();
  return db.migrate(migrations);
}

async function main(deps = {}) {
  const closeDbAdapter = deps.closeDbAdapter || defaultDb.closeDbAdapter;
  let exitCode = 0;
  try {
    const applied = await runMigrations(deps);
    console.log(`Migrations complete (${applied} newly applied)`);
  } catch (err) {
    console.error('Migration failed:', err && err.stack ? err.stack : err);
    exitCode = 1;
  }
  try {
    await closeDbAdapter();
  } catch (closeErr) {
    console.error('Adapter close failed during error handling:', closeErr);
    if (exitCode === 0) exitCode = 1;
  }
  process.exit(exitCode);
}

if (require.main === module) {
  main();
}

module.exports = { runMigrations, main };
