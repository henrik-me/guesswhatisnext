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
let _instancePromise = null;

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
    let MssqlAdapter;
    try {
      MssqlAdapter = require('./mssql-adapter');
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        throw new Error(
          'MSSQL database backend is not yet available because the mssql-adapter module is missing. ' +
            'To use SQLite instead, remove DATABASE_URL from the environment or do not pass opts.backend = "mssql".',
          { cause: err }
        );
      }
      throw err;
    }
    const adapter = new MssqlAdapter(opts.connectionString || config.DATABASE_URL);
    await adapter.connect();
    return adapter;
  }

  if (!backend || backend === 'sqlite') {
    let SqliteAdapter;
    try {
      SqliteAdapter = require('./sqlite-adapter');
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        throw new Error(
          'SQLite database backend is not yet available. ' +
            'The sqlite-adapter module has not been added yet.',
          { cause: err }
        );
      }
      throw err;
    }
    const adapter = new SqliteAdapter(
      opts.sqlitePath || config.GWN_DB_PATH,
      opts.sqliteOptions
    );
    await adapter.connect();
    return adapter;
  }

  throw new Error(
    `Unsupported database backend "${backend}". Expected "sqlite" or "mssql".`
  );
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
  if (!_instancePromise) {
    _instancePromise = createDb(opts).then((adapter) => {
      _instance = adapter;
      return adapter;
    }).catch((err) => {
      _instancePromise = null;
      throw err;
    });
  }
  return _instancePromise;
}

/**
 * Close and discard the singleton adapter.
 * @returns {Promise<void>}
 */
async function closeDbAdapter() {
  if (_instance) {
    try {
      await _instance.close();
    } finally {
      _instance = null;
      _instancePromise = null;
    }
    return;
  }

  // If creation is in-flight, wait for it to resolve then close.
  if (_instancePromise) {
    try {
      const adapter = await _instancePromise;
      if (adapter && typeof adapter.close === 'function') {
        await adapter.close();
      }
    } finally {
      _instance = null;
      _instancePromise = null;
    }
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
