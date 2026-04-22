/**
 * SQLite adapter — wraps better-sqlite3 (synchronous) in the async
 * BaseAdapter interface.
 *
 * Supports both positional `?` parameters (arrays) and named `@param`
 * parameters (plain objects) for backward compatibility with seed-puzzles.js.
 */

const BaseAdapter = require('./base-adapter');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class SqliteAdapter extends BaseAdapter {
  /**
   * @param {string} dbPath - Path to the SQLite file, or ':memory:'
   * @param {Object} [options]
   * @param {number|string} [options.busyTimeout=30000] - busy_timeout pragma value (ms)
   */
  constructor(dbPath, options = {}) {
    super('sqlite');
    this._dbPath = dbPath;
    this._options = options;
    this._db = null;
    this._txLock = null;
    this._inTransaction = false;
  }

  /* ── Abstract method implementations ──────────────────────────────── */

  async _connect() {
    // Ensure parent directory exists (skip for in-memory databases)
    if (this._dbPath !== ':memory:') {
      const dir = path.dirname(this._dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    this._db = new Database(this._dbPath);

    const bt = parseInt(this._options.busyTimeout ?? 30000, 10);
    this._db.pragma(`busy_timeout = ${Number.isNaN(bt) ? 30000 : Math.max(0, bt)}`);

    const isAzure = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    this._db.pragma(isAzure ? 'journal_mode = DELETE' : 'journal_mode = WAL');
    this._db.pragma('foreign_keys = ON');
  }

  async _get(sql, params = []) {
    const stmt = this._db.prepare(sql);
    const row = Array.isArray(params) ? stmt.get(...params) : stmt.get(params);
    return row ?? null;
  }

  async _all(sql, params = []) {
    const stmt = this._db.prepare(sql);
    return Array.isArray(params) ? stmt.all(...params) : stmt.all(params);
  }

  async _run(sql, params = []) {
    const stmt = this._db.prepare(sql);
    const result = Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
    return { changes: result.changes, lastId: Number(result.lastInsertRowid) };
  }

  async _exec(sql) {
    this._db.exec(sql);
  }

  /**
   * Run `fn` inside a transaction.
   *
   * better-sqlite3's db.transaction() is fully synchronous and cannot wrap
   * async callbacks. We use manual BEGIN/COMMIT/ROLLBACK instead.
   * The callback receives `this` because all operations on a single SQLite
   * connection share the transaction context.
   *
   * An internal mutex prevents concurrent transactions from interleaving
   * on the shared connection — if another transaction is in progress the
   * caller waits until it completes. Nested transaction calls on the same
   * adapter are re-entrant (they skip BEGIN/COMMIT and run inside the
   * outer transaction).
   */
  async _transaction(fn) {
    // Re-entrant: if already inside a transaction, just run fn directly
    if (this._inTransaction) {
      return fn(this);
    }

    // Serialize concurrent transaction calls
    while (this._txLock) {
      await this._txLock;
    }

    let releaseLock;
    this._txLock = new Promise((resolve) => { releaseLock = resolve; });
    this._inTransaction = true;

    this._db.exec('BEGIN');
    try {
      const result = await fn(this);
      this._db.exec('COMMIT');
      return result;
    } catch (err) {
      this._db.exec('ROLLBACK');
      throw err;
    } finally {
      this._inTransaction = false;
      this._txLock = null;
      releaseLock();
    }
  }

  async _close() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }

  async _healthCheck() {
    try {
      if (this._dbPath === ':memory:') {
        await this.get('SELECT 1 AS ok');
        return { status: 'ok' };
      }
      const stat = fs.statSync(this._dbPath);
      return {
        status: 'ok',
        dbSizeMb: Math.round((stat.size / (1024 * 1024)) * 100) / 100,
      };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }
}

module.exports = SqliteAdapter;
