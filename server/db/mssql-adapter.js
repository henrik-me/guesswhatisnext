/**
 * MSSQL / Azure SQL adapter — extends BaseAdapter for SQL Server.
 *
 * Uses the `mssql` npm package for connection pooling, parameterised
 * queries, and transactions.  Routes use `?` placeholders; this adapter
 * rewrites them to `@p1, @p2, …` before sending to SQL Server.
 */

const BaseAdapter = require('./base-adapter');

/* ── helpers ─────────────────────────────────────────────────────────── */

/**
 * Rewrite `?` positional placeholders to `@p1, @p2, …` named params.
 * Question-marks inside single-quoted string literals are left alone.
 *
 * @param {string} sqlStr  - SQL text with `?` placeholders
 * @param {Array}  params  - Positional parameter values
 * @returns {{ sql: string, inputs: Array<{name: string, value: *}> }}
 */
function rewriteParams(sqlStr, params = []) {
  let idx = 0;
  const inputs = [];
  let inString = false;
  let rewritten = '';

  for (let i = 0; i < sqlStr.length; i++) {
    const ch = sqlStr[i];

    if (ch === "'") {
      // Toggle in-string, but treat '' (escaped quote) as staying in-string
      if (i + 1 < sqlStr.length && sqlStr[i + 1] === "'") {
        rewritten += "''";
        i++; // skip the second quote
      } else {
        inString = !inString;
        rewritten += ch;
      }
    } else if (ch === '?' && !inString) {
      const name = `p${++idx}`;
      inputs.push({ name, value: params[idx - 1] });
      rewritten += `@${name}`;
    } else {
      rewritten += ch;
    }
  }

  if (idx !== params.length) {
    throw new Error(
      `Parameter count mismatch: query has ${idx} placeholder(s) but ${params.length} value(s) were supplied`
    );
  }

  return { sql: rewritten, inputs };
}

/**
 * Bind an array of { name, value } inputs to an mssql Request.
 */
function bindInputs(request, inputs) {
  for (const inp of inputs) {
    request.input(inp.name, inp.value);
  }
}

/* ── Transaction-scoped adapter ──────────────────────────────────────── */

/**
 * Lightweight adapter used inside _transaction(fn).
 * All queries run on the given mssql.Transaction rather than the pool.
 */
class MssqlTxAdapter extends BaseAdapter {
  /**
   * @param {object} transaction - mssql Transaction instance
   * @param {object} mssqlPkg   - the mssql module (for creating Requests)
   */
  constructor(transaction, mssqlPkg) {
    super('mssql');
    this._tx = transaction;
    this._sql = mssqlPkg;
  }

  async _connect() { /* no-op */ }

  async _get(sqlStr, params = []) {
    const { sql: rewritten, inputs } = rewriteParams(sqlStr, params);
    const request = new this._sql.Request(this._tx);
    bindInputs(request, inputs);
    const result = await request.query(rewritten);
    return result.recordset[0] || null;
  }

  async _all(sqlStr, params = []) {
    const { sql: rewritten, inputs } = rewriteParams(sqlStr, params);
    const request = new this._sql.Request(this._tx);
    bindInputs(request, inputs);
    const result = await request.query(rewritten);
    return result.recordset;
  }

  async _run(sqlStr, params = []) {
    const { sql: rewritten, inputs } = rewriteParams(sqlStr, params);
    const request = new this._sql.Request(this._tx);
    bindInputs(request, inputs);
    const result = await request.query(rewritten);
    return {
      changes: result.rowsAffected[0] || 0,
      lastId: (result.recordset && result.recordset[0] && result.recordset[0].lastId) || 0,
    };
  }

  async _exec(sqlStr) {
    const request = new this._sql.Request(this._tx);
    await request.batch(sqlStr);
  }

  async _transaction() {
    throw new Error('Nested transactions are not supported in MSSQL adapter');
  }

  async _close() { /* no-op */ }
}

/* ── Main adapter ────────────────────────────────────────────────────── */

class MssqlAdapter extends BaseAdapter {
  /**
   * @param {string} connectionString - Azure SQL / SQL Server connection string
   * @param {object} [opts]
   * @param {object} [opts.mssql] - Override the mssql module (for testing)
   */
  constructor(connectionString, opts = {}) {
    super('mssql');
    this._connectionString = connectionString;
    this._sql = opts.mssql || require('mssql');
    this._pool = null;
  }

  async _connect() {
    this._pool = await this._sql.connect(this._connectionString);
  }

  async _get(sqlStr, params = []) {
    const { sql: rewritten, inputs } = rewriteParams(sqlStr, params);
    const request = this._pool.request();
    bindInputs(request, inputs);
    const result = await request.query(rewritten);
    return result.recordset[0] || null;
  }

  async _all(sqlStr, params = []) {
    const { sql: rewritten, inputs } = rewriteParams(sqlStr, params);
    const request = this._pool.request();
    bindInputs(request, inputs);
    const result = await request.query(rewritten);
    return result.recordset;
  }

  async _run(sqlStr, params = []) {
    const { sql: rewritten, inputs } = rewriteParams(sqlStr, params);
    const request = this._pool.request();
    bindInputs(request, inputs);
    const result = await request.query(rewritten);
    return {
      changes: result.rowsAffected[0] || 0,
      // TODO: For INSERT with IDENTITY, callers can append
      //       `; SELECT SCOPE_IDENTITY() AS lastId` to the SQL.
      lastId: (result.recordset && result.recordset[0] && result.recordset[0].lastId) || 0,
    };
  }

  async _exec(sqlStr) {
    const request = this._pool.request();
    await request.batch(sqlStr);
  }

  async _transaction(fn) {
    const transaction = new this._sql.Transaction(this._pool);
    await transaction.begin();
    const txAdapter = new MssqlTxAdapter(transaction, this._sql);
    try {
      const result = await fn(txAdapter);
      await transaction.commit();
      return result;
    } catch (err) {
      try {
        await transaction.rollback();
      } catch (rollbackErr) {
        err.rollbackError = rollbackErr;
      }
      throw err;
    }
  }

  async _close() {
    if (this._pool) {
      await this._pool.close();
      this._pool = null;
    }
  }
}

// Expose rewriteParams for testing
MssqlAdapter._rewriteParams = rewriteParams;

module.exports = MssqlAdapter;
