/**
 * Base database adapter — defines the async interface used by all routes.
 *
 * Concrete adapters (SQLite, mssql) extend this class and implement
 * the abstract _connect, _get, _all, _run, _exec, _transaction, and _close methods.
 *
 * Routes use only the public API: get(), all(), run(), exec(), transaction().
 * They never import better-sqlite3 or mssql directly.
 *
 * Parameter placeholders: routes always use `?`. The adapter translates
 * as needed (SQLite passes through; mssql rewrites to @p1, @p2, …).
 */

class BaseAdapter {
  /**
   * @param {'sqlite'|'mssql'} dialect
   */
  constructor(dialect) {
    if (new.target === BaseAdapter) {
      throw new Error('BaseAdapter is abstract — use SqliteAdapter or MssqlAdapter');
    }
    /** @readonly */
    this.dialect = dialect;
  }

  /**
   * Open the underlying database connection.
   * Called by the factory after construction.
   * @returns {Promise<void>}
   */
  async connect() {
    return this._connect();
  }

  /**
   * Fetch a single row.
   * @param {string} sql  - SQL with `?` placeholders
   * @param {Array}  [params=[]] - Positional parameters
   * @returns {Promise<Object|null>} Single row object, or null if none matched
   */
  async get(sql, params = []) {
    return this._get(sql, params);
  }

  /**
   * Fetch all matching rows.
   * @param {string} sql  - SQL with `?` placeholders
   * @param {Array}  [params=[]] - Positional parameters
   * @returns {Promise<Array<Object>>} Array of row objects (may be empty)
   */
  async all(sql, params = []) {
    return this._all(sql, params);
  }

  /**
   * Execute an INSERT / UPDATE / DELETE statement.
   * @param {string} sql  - SQL with `?` placeholders
   * @param {Array}  [params=[]] - Positional parameters
   * @returns {Promise<{changes: number, lastId: number}>}
   *   `changes` = rows affected, `lastId` = last auto-increment id (INSERT)
   */
  async run(sql, params = []) {
    return this._run(sql, params);
  }

  /**
   * Execute raw SQL (DDL, multi-statement). Used by migrations and schema init.
   * @param {string} sql - Raw SQL string (may contain multiple statements)
   * @returns {Promise<void>}
   */
  async exec(sql) {
    return this._exec(sql);
  }

  /**
   * Run a function inside a database transaction.
   *
   * The callback receives a transaction-scoped adapter that supports
   * get/all/run/exec. If the callback throws, the transaction is rolled back.
   *
   * @param {function(BaseAdapter): Promise<*>} fn
   * @returns {Promise<*>} Return value of fn
   */
  async transaction(fn) {
    return this._transaction(fn);
  }

  /**
   * Run all pending migrations.
   * @param {Array<{version: number, name: string, up: function(BaseAdapter): Promise<void>}>} migrations
   * @returns {Promise<number>} Count of newly applied migrations
   */
  async migrate(migrations) {
    return this._migrate(migrations);
  }

  /**
   * Returns migration tracker state. This is the supported route-facing
   * API for inspecting which migrations have been recorded as applied.
   * Routes MUST NOT import `./migrations/_tracker` directly.
   *
   * Errors from the tracker query are swallowed and reported via
   * `lastError` so callers (e.g. an admin endpoint) can map a non-null
   * `lastError` to HTTP 500 without the adapter throwing. A common
   * non-null case is "tracker table does not yet exist" (i.e. `migrate()`
   * has never been called against this database).
   *
   * @returns {Promise<{
   *   applied: number,           // count of migrations actually recorded as applied
   *   appliedNames: string[],    // names of applied migrations, in version order
   *   lastError: string|null     // last error from the tracker query, null on success
   * }>}
   */
  async getMigrationState() {
    try {
      const { getAppliedMigrations } = require('./migrations/_tracker');
      const rows = await getAppliedMigrations(this);
      return {
        applied: rows.length,
        appliedNames: rows.map((r) => r.name),
        lastError: null,
      };
    } catch (err) {
      return {
        applied: 0,
        appliedNames: [],
        lastError: err && err.message ? err.message : String(err),
      };
    }
  }

  /**
   * Health check — verifies the connection is alive.
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    try {
      await this.get('SELECT 1 AS ok');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detailed health check — returns backend-specific diagnostics.
   *
   * Each adapter implements `_healthCheck()` with its own checks
   * (e.g. file stat for SQLite, ping latency for MSSQL).
   *
   * @returns {Promise<{status: 'ok'|'error', [key: string]: *}>}
   */
  async healthCheck() {
    return this._healthCheck();
  }

  /**
   * Close the database connection and release resources.
   * @returns {Promise<void>}
   */
  async close() {
    return this._close();
  }

  // ── Abstract methods (subclasses MUST override) ────────────────────────

  async _connect() { throw new Error('Not implemented: _connect'); }
  async _get(_sql, _params) { throw new Error('Not implemented: _get'); }
  async _all(_sql, _params) { throw new Error('Not implemented: _all'); }
  async _run(_sql, _params) { throw new Error('Not implemented: _run'); }
  async _exec(_sql) { throw new Error('Not implemented: _exec'); }
  async _transaction(_fn) { throw new Error('Not implemented: _transaction'); }
  async _healthCheck() { throw new Error('Not implemented: _healthCheck'); }
  async _close() { throw new Error('Not implemented: _close'); }

  /**
   * Default migrate implementation using the migration tracker.
   * Subclasses can override if they need dialect-specific behavior.
   */
  async _migrate(migrations) {
    const { runMigrations } = require('./migrations/_tracker');
    return runMigrations(this, migrations);
  }
}

module.exports = BaseAdapter;
