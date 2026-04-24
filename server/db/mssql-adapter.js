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
 * Rewrite SQLite-specific SQL idioms to T-SQL equivalents.
 *
 * Called before rewriteParams so `?` placeholders are still intact.
 * Returns both the rewritten SQL and (possibly reordered) params because
 * LIMIT ? OFFSET ? → OFFSET ? ROWS FETCH NEXT ? ROWS ONLY swaps the
 * two parameter positions.
 *
 * @param {string} sqlStr  - SQL text with SQLite idioms
 * @param {Array}  params  - Positional parameter values
 * @returns {{ sql: string, params: Array }}
 */
function rewriteSql(sqlStr, params = []) {
  let sql = sqlStr;
  let p = [...params];

  // 1. LIMIT / OFFSET → OFFSET / FETCH NEXT
  //    Must handle LIMIT ... OFFSET ... first (more specific), then plain LIMIT ...
  //    Support both placeholders and numeric literals so existing SQLite-style
  //    queries like `... LIMIT 50` also work against SQL Server unchanged.
  const limitOffsetRe = /\bORDER\s+BY\s+([\s\S]+?)\bLIMIT\s+(\?|\d+)\s+OFFSET\s+(\?|\d+)/i;
  const limitOnlyRe = /\bORDER\s+BY\s+([\s\S]+?)\bLIMIT\s+(\?|\d+)/i;

  const loMatch = sql.match(limitOffsetRe);
  if (loMatch) {
    const limitToken = loMatch[2];
    const offsetToken = loMatch[3];

    // Rewrite SQL: keep ORDER BY part, replace LIMIT/OFFSET with OFFSET/FETCH.
    sql = sql.replace(
      limitOffsetRe,
      (_match, orderByExpr, rewrittenLimitToken, rewrittenOffsetToken) =>
        `ORDER BY ${orderByExpr}OFFSET ${rewrittenOffsetToken} ROWS FETCH NEXT ${rewrittenLimitToken} ROWS ONLY`
    );

    // Swap params only when both LIMIT and OFFSET are placeholders.
    // SQLite has (LIMIT, OFFSET) but T-SQL needs (OFFSET, FETCH NEXT).
    if (limitToken === '?' && offsetToken === '?') {
      const qPositions = findPlaceholderPositions(sqlStr);
      const limitIdx = qPositions.length - 2; // LIMIT ?
      const offsetIdx = qPositions.length - 1; // OFFSET ?

      const newParams = [...p];
      newParams[limitIdx] = p[offsetIdx]; // OFFSET value goes first
      newParams[offsetIdx] = p[limitIdx]; // FETCH NEXT value goes second
      p = newParams;
    }
  } else {
    const lMatch = sql.match(limitOnlyRe);
    if (lMatch) {
      sql = sql.replace(
        limitOnlyRe,
        (_match, orderByExpr, limitToken) =>
          `ORDER BY ${orderByExpr}OFFSET 0 ROWS FETCH NEXT ${limitToken} ROWS ONLY`
      );
    }
  }

  // 2. RANDOM() → NEWID()
  sql = sql.replace(/\bRANDOM\(\)/gi, 'NEWID()');

  // 3. Date functions
  //    datetime('now', '-N days|hours') → DATEADD(day|hour, -N, GETUTCDATE())
  sql = sql.replace(
    /\bdatetime\(\s*'now'\s*,\s*'-(\d+)\s+(days?|hours?)'\s*\)/gi,
    (_match, n, unit) => {
      const sqlUnit = unit.toLowerCase().startsWith('hour') ? 'hour' : 'day';
      return `DATEADD(${sqlUnit}, -${n}, GETUTCDATE())`;
    }
  );

  //    date('now') / DATE('now') → CAST(GETUTCDATE() AS DATE)
  sql = sql.replace(/\bdate\(\s*'now'\s*\)/gi, 'CAST(GETUTCDATE() AS DATE)');

  //    date(expr) / DATE(expr) → CAST(expr AS DATE)  (non-'now' expressions)
  sql = sql.replace(
    /\bdate\(([^')][^)]*)\)/gi,
    'CAST($1 AS DATE)'
  );

  return { sql, params: p };
}

/**
 * Return the zero-based ordinal indices of unquoted `?` placeholders,
 * skipping those inside single-quoted strings.
 */
function findPlaceholderPositions(sqlStr) {
  const positions = [];
  let inString = false;
  for (let i = 0; i < sqlStr.length; i++) {
    const ch = sqlStr[i];
    if (ch === "'") {
      if (i + 1 < sqlStr.length && sqlStr[i + 1] === "'") {
        i++;
      } else {
        inString = !inString;
      }
    } else if (ch === '?' && !inString) {
      positions.push(positions.length);
    }
  }
  return positions;
}

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

/* ── INSERT helpers ───────────────────────────────────────────────────── */

const INSERT_OR_IGNORE_RE = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i;
const INSERT_INTO_RE = /^\s*INSERT\s+INTO\b/i;
const INSERT_SELECT_RE = /^\s*INSERT\s+INTO\b[^)]*\)\s*SELECT\b/i;

/**
 * Shared _run implementation for both MssqlAdapter and MssqlTxAdapter.
 *
 * Handles:
 * - SQL rewriting (LIMIT, RANDOM, dates)
 * - INSERT OR IGNORE → strip OR IGNORE, catch duplicate key errors
 * - Plain INSERT → append SCOPE_IDENTITY() for lastId
 *
 * @param {string}   sqlStr   - Original SQL with `?` placeholders
 * @param {Array}    params   - Positional parameter values
 * @param {function} execFn   - (sql, params) => Promise<mssqlResult>
 *                               Called with rewriteSql'd SQL (still using `?`).
 *                               The callback should rewriteParams + execute.
 * @returns {Promise<{changes: number, lastId: number}>}
 */
async function runWithInsertHandling(sqlStr, params, execFn) {
  const rw = rewriteSql(sqlStr, params);
  let { sql } = rw;
  const rwParams = rw.params;

  // INSERT OR IGNORE → strip OR IGNORE, catch duplicate key errors
  if (INSERT_OR_IGNORE_RE.test(sql)) {
    sql = sql.replace(/\bOR\s+IGNORE\s+/i, '');
    try {
      const result = await execFn(sql, rwParams);
      return {
        changes: result.rowsAffected[0] || 0,
        lastId: (result.recordset && result.recordset[0] && result.recordset[0].lastId) || 0,
      };
    } catch (err) {
      const errorNumber = err.number || (err.originalError && err.originalError.number);
      // 2627 = unique constraint violation, 2601 = unique index violation
      if (errorNumber === 2627 || errorNumber === 2601) {
        return { changes: 0, lastId: 0 };
      }
      throw err;
    }
  }

  // Plain INSERT (not INSERT … SELECT) → append SCOPE_IDENTITY()
  if (INSERT_INTO_RE.test(sql) && !INSERT_SELECT_RE.test(sql)) {
    sql = `${sql}; SELECT SCOPE_IDENTITY() AS lastId`;
  }

  const result = await execFn(sql, rwParams);
  return {
    changes: result.rowsAffected[0] || 0,
    lastId: (result.recordset && result.recordset[0] && result.recordset[0].lastId) || 0,
  };
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
    const rw = rewriteSql(sqlStr, params);
    const { sql: rewritten, inputs } = rewriteParams(rw.sql, rw.params);
    const request = new this._sql.Request(this._tx);
    bindInputs(request, inputs);
    const result = await request.query(rewritten);
    return result.recordset[0] || null;
  }

  async _all(sqlStr, params = []) {
    const rw = rewriteSql(sqlStr, params);
    const { sql: rewritten, inputs } = rewriteParams(rw.sql, rw.params);
    const request = new this._sql.Request(this._tx);
    bindInputs(request, inputs);
    const result = await request.query(rewritten);
    return result.recordset;
  }

  async _run(sqlStr, params = []) {
    return runWithInsertHandling(sqlStr, params, (finalSql, finalParams) => {
      const { sql: rewritten, inputs } = rewriteParams(finalSql, finalParams);
      const request = new this._sql.Request(this._tx);
      bindInputs(request, inputs);
      return request.query(rewritten);
    });
  }

  async _exec(sqlStr) {
    const request = new this._sql.Request(this._tx);
    await request.batch(sqlStr);
  }

  async _transaction() {
    throw new Error('Nested transactions are not supported in MSSQL adapter');
  }

  async _healthCheck() {
    try {
      const start = Date.now();
      await this._get('SELECT 1 AS ok');
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
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
    // Cold-start simulation hook (CS53 / Policy 2). When
    // GWN_SIMULATE_COLD_START_MS is set to a positive integer, the FIRST
    // _connect() call after process start sleeps for that duration before
    // contacting the server. Subsequent connects are unaffected. Off by
    // default; only enabled by `npm run container:validate` so cold-start
    // behavior is exercised on every container restart, mimicking Azure SQL
    // serverless auto-pause resume timing. Never set this in real
    // staging/production deployments — local container validation runs the
    // app with NODE_ENV=production by design, so the gate is "not in real
    // prod", not "not in production-mode locally".
    const simulateRaw = process.env.GWN_SIMULATE_COLD_START_MS;
    // Strict numeric parsing — accept only "digits-only" so misconfigured
    // values like "30s" or "5000ms" fail closed (no delay) instead of being
    // silently truncated by parseInt().
    const simulateMs = typeof simulateRaw === 'string' && /^\d+$/.test(simulateRaw)
      ? Number(simulateRaw)
      : Number.NaN;
    if (Number.isFinite(simulateMs) && simulateMs > 0 && !MssqlAdapter._coldStartConsumed) {
      MssqlAdapter._coldStartConsumed = true;
      await new Promise((resolve) => setTimeout(resolve, simulateMs));
    }
    // Parse the connection string into a config object so we can override
    // timeout defaults without losing user-supplied options (encrypt,
    // trustServerCertificate, etc.). CS53-3 / CS53-6:
    //   - connectTimeout: 5000  (was the mssql library default of 15000) —
    //     fail fast on a paused Azure SQL serverless DB so the warmup
    //     retry path can exercise more attempts inside the client budget.
    //   - requestTimeout: 15000 — explicit so we don't drift if the
    //     library default ever changes; warm-pool query latency is the
    //     same as before.
    const config = this._sql.ConnectionPool.parseConnectionString(this._connectionString);
    config.connectionTimeout = MssqlAdapter.CONNECT_TIMEOUT_MS;
    config.requestTimeout = MssqlAdapter.REQUEST_TIMEOUT_MS;
    config.options = config.options || {};
    // Pass through to tedious explicitly so the timeout is honored even if
    // mssql's top-level→options forwarding logic changes between versions.
    config.options.connectTimeout = MssqlAdapter.CONNECT_TIMEOUT_MS;
    config.options.requestTimeout = MssqlAdapter.REQUEST_TIMEOUT_MS;
    this._pool = await this._sql.connect(config);
  }

  async _get(sqlStr, params = []) {
    const rw = rewriteSql(sqlStr, params);
    const { sql: rewritten, inputs } = rewriteParams(rw.sql, rw.params);
    const request = this._pool.request();
    bindInputs(request, inputs);
    const result = await request.query(rewritten);
    return result.recordset[0] || null;
  }

  async _all(sqlStr, params = []) {
    const rw = rewriteSql(sqlStr, params);
    const { sql: rewritten, inputs } = rewriteParams(rw.sql, rw.params);
    const request = this._pool.request();
    bindInputs(request, inputs);
    const result = await request.query(rewritten);
    return result.recordset;
  }

  async _run(sqlStr, params = []) {
    const pool = this._pool;
    return runWithInsertHandling(sqlStr, params, (finalSql, finalParams) => {
      const { sql: rewritten, inputs } = rewriteParams(finalSql, finalParams);
      const request = pool.request();
      bindInputs(request, inputs);
      return request.query(rewritten);
    });
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

  async _healthCheck() {
    try {
      const start = Date.now();
      await this._get('SELECT 1 AS ok');
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }
}

// Expose helpers for testing
MssqlAdapter._rewriteParams = rewriteParams;
MssqlAdapter._rewriteSql = rewriteSql;
// Process-lifetime flag — see _connect() above.
MssqlAdapter._coldStartConsumed = false;
MssqlAdapter._resetColdStart = () => { MssqlAdapter._coldStartConsumed = false; };
// Connection / request timeouts (CS53-3 / CS53-6). Exposed as static fields
// so tests can assert against them and so future tuning lives in one place.
MssqlAdapter.CONNECT_TIMEOUT_MS = 5000;
MssqlAdapter.REQUEST_TIMEOUT_MS = 15000;

module.exports = MssqlAdapter;
