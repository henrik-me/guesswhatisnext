/**
 * Database factory — creates the appropriate async adapter based on config.
 *
 * Usage:
 *   const { createDb } = require('./db');
 *   const db = await createDb();
 *   const user = await db.get('SELECT * FROM users WHERE id = ?', [1]);
 *
 * Backend selection:
 *   - DATABASE_URL present → mssql (Azure SQL)
 *   - DATABASE_URL absent  → sqlite (local dev, staging, tests)
 */

const { config } = require('../config');

let _instance = null;

/**
 * Create and connect a database adapter.
 *
 * @param {Object} [opts] - Override default config
 * @param {string} [opts.backend]          - 'sqlite' or 'mssql'
 * @param {string} [opts.sqlitePath]       - Path to SQLite database file
 * @param {string} [opts.connectionString] - mssql connection string
 * @param {Object} [opts.sqliteOptions]    - Extra options for SqliteAdapter (e.g. { busyTimeout })
 * @returns {Promise<import('./base-adapter')>} Connected adapter instance
 */
async function createDb(opts = {}) {
  const backend = opts.backend || config.DB_BACKEND;

  if (backend === 'mssql') {
    const MssqlAdapter = require('./mssql-adapter');
    const adapter = new MssqlAdapter(opts.connectionString || config.DATABASE_URL);
    await adapter.connect();
    return adapter;
  }

  const SqliteAdapter = require('./sqlite-adapter');
  const adapter = new SqliteAdapter(
    opts.sqlitePath || config.GWN_DB_PATH,
    opts.sqliteOptions
  );
  await adapter.connect();
  return adapter;
}

/**
 * Get or create the singleton database adapter.
 * Convenience for app startup — routes that need the shared instance
 * call this instead of createDb() directly.
 *
 * @param {Object} [opts] - Passed to createDb on first call
 * @returns {Promise<import('./base-adapter')>}
 */
async function getDbAdapter(opts) {
  if (!_instance) {
    _instance = await createDb(opts);
  }
  return _instance;
}

/**
 * Close and discard the singleton adapter.
 * @returns {Promise<void>}
 */
async function closeDbAdapter() {
  if (_instance) {
    await _instance.close();
    _instance = null;
  }
}

/**
 * Check if the singleton adapter has been created.
 * @returns {boolean}
 */
function isAdapterInitialized() {
  return _instance !== null;
}

module.exports = { createDb, getDbAdapter, closeDbAdapter, isAdapterInitialized };
