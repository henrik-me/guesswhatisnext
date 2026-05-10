#!/usr/bin/env node
/**
 * scripts/cleanup-test-data.js — CS81-1: one-off ops cleanup of the
 * `gwn-smoke-bot` user's accumulated `scores` rows.
 *
 * Why this exists separately from in-app cleanup:
 *   Test data hygiene is *test infrastructure* work, not application surface.
 *   We deliberately do NOT add an admin/delete-scores endpoint just to support
 *   test cleanup — that would widen the public app surface (auth, audit,
 *   blast radius, etc.) for a purely-test concern. Per the user direction
 *   2026-05-09T22:59 PT: "test data should in general be removed [as] part of
 *   the smoke validation and e2e validation … those would be test cleanup
 *   tasks".
 *
 *   This script is the one-off "drain accumulated test rows from prod" tool
 *   referenced by `.github/workflows/ops-cleanup-test-data.yml`. It runs
 *   under the GitHub Environment-gated workflow_dispatch (operator approval
 *   required), is parameterized to ONLY touch rows owned by `gwn-smoke-bot`,
 *   and is idempotent (a second invocation deletes 0 rows).
 *
 * Why this uses `mssql` directly (NOT `server/db/mssql-adapter.js`):
 *   Same boundary as `scripts/wake-db.js` — the runtime adapter has CS53
 *   timeout constants tuned for live request paths. The ops script needs a
 *   long, blocking, single-use connection; coupling to the adapter would
 *   either break CS53 or require new parameters to the adapter.
 *
 * Scope guard:
 *   - SELECT user_id WHERE username = 'gwn-smoke-bot'. If null → exit 0
 *     (idempotent: no smoke-bot user means no rows to clean).
 *   - All DELETEs are parameterized to that user_id. Never a wildcard.
 *
 * How to run (locally):
 *   $env:DATABASE_URL = "Server=...;Database=gwn-production;..."
 *   node scripts/cleanup-test-data.js          # delete
 *   $env:DRY_RUN = "1"; node scripts/cleanup-test-data.js  # count only
 *
 * Exit codes:
 *   0 — cleanup succeeded (or nothing to clean up).
 *   1 — any error (connection, query, post-delete assertion failure).
 */

'use strict';

const defaultSql = require('mssql');
const { wakeDb } = require('./wake-db.js');

const SMOKE_USER = 'gwn-smoke-bot';
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;

/**
 * Delete `gwn-smoke-bot`'s accumulated score rows. Idempotent: a re-run after
 * a successful cleanup deletes 0 rows.
 *
 * Wakes the DB first via `scripts/wake-db.js` (Azure SQL serverless can take
 * ~30–60s to resume after idle; without the wake step, a cold DB would
 * intermittently fail this one-shot cleanup). The wake step is skipped when
 * an explicit `deps.wake = false` is passed (used by tests).
 *
 * @param {Object} [deps]
 * @param {Object} [deps.sql] - mssql module (injectable for tests).
 * @param {string} [deps.connectionString] - defaults to process.env.DATABASE_URL.
 * @param {boolean} [deps.dryRun] - count only, do not delete. Defaults to
 *   `process.env.DRY_RUN === '1'`.
 * @param {number} [deps.connectTimeoutMs=30_000] - per-connect timeout.
 * @param {boolean|Function} [deps.wake] - if false, skip wake-db step;
 *   if a function, call it instead of the default wakeDb (test seam).
 *   Default: invoke wakeDb with the resolved sql + connection string.
 * @param {{ info: Function, error: Function }} [deps.log] - logger seam.
 * @returns {Promise<{ userId: number|null, beforeCount: number, afterCount: number, deleted: boolean }>}
 * @throws {Error} on validation failure, connection failure, query failure,
 *   or if the post-delete count assertion fails.
 */
async function cleanupTestData(deps = {}) {
  const sql = deps.sql || defaultSql;
  const connectionStringExplicit = deps.connectionString !== undefined;
  const connectionString = deps.connectionString ?? process.env.DATABASE_URL;
  const dryRun = deps.dryRun ?? (process.env.DRY_RUN === '1');
  const connectTimeoutMs = deps.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const log = deps.log || { info: console.log, error: console.error };

  if (!connectionString || (typeof connectionString === 'string' && connectionString.trim() === '')) {
    const source = connectionStringExplicit ? 'connectionString argument' : 'DATABASE_URL env var';
    throw new Error(`cleanup-test-data: connection string is empty (resolved from ${source}); nothing to connect to.`);
  }
  if (!Number.isFinite(connectTimeoutMs) || connectTimeoutMs <= 0) {
    throw new Error(`cleanup-test-data: connectTimeoutMs must be a positive number (got ${connectTimeoutMs}).`);
  }

  // Wake the DB first — Azure SQL serverless auto-pauses after idle and
  // can take 30–60s to resume. Without this, a one-shot cleanup against
  // a paused DB fails intermittently with transient connect errors.
  // Reuses scripts/wake-db.js's retry/backoff (same boundary, same DI seam).
  if (deps.wake !== false) {
    const wakeFn = typeof deps.wake === 'function' ? deps.wake : wakeDb;
    try {
      await wakeFn({ sql, connectionString, log });
    } catch (err) {
      throw new Error(`cleanup-test-data: wake-db step failed: ${err && err.message ? err.message : err}`);
    }
  }

  const baseConfig = sql.ConnectionPool.parseConnectionString(connectionString);
  baseConfig.options = baseConfig.options || {};
  const config = {
    ...baseConfig,
    connectionTimeout: connectTimeoutMs,
    requestTimeout: connectTimeoutMs,
    options: {
      ...baseConfig.options,
      connectTimeout: connectTimeoutMs,
      requestTimeout: connectTimeoutMs,
    },
  };

  let pool;
  try {
    pool = new sql.ConnectionPool(config);
    await pool.connect();

    // Resolve smoke-bot user_id. Idempotent short-circuit if not present.
    const userRes = await pool.request()
      .input('username', sql.NVarChar, SMOKE_USER)
      .query('SELECT id FROM users WHERE username = @username');
    const userRow = userRes.recordset && userRes.recordset[0];
    if (!userRow || userRow.id == null) {
      log.info(`[CS81 cleanup-test-data] no '${SMOKE_USER}' user found — nothing to clean up`);
      return { userId: null, beforeCount: 0, afterCount: 0, deleted: false };
    }
    const userId = userRow.id;
    log.info(`[CS81 cleanup-test-data] resolved ${SMOKE_USER} user_id=${userId}`);

    const beforeRes = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT COUNT(*) AS n FROM scores WHERE user_id = @userId');
    const beforeCount = Number(beforeRes.recordset[0].n);
    log.info(`[CS81 cleanup-test-data] before count: ${beforeCount}`);

    if (dryRun) {
      log.info(`[CS81 cleanup-test-data] DRY_RUN — would delete ${beforeCount} rows; skipping`);
      return { userId, beforeCount, afterCount: beforeCount, deleted: false };
    }

    await pool.request()
      .input('userId', sql.Int, userId)
      .query('DELETE FROM scores WHERE user_id = @userId');

    const afterRes = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT COUNT(*) AS n FROM scores WHERE user_id = @userId');
    const afterCount = Number(afterRes.recordset[0].n);
    log.info(`[CS81 cleanup-test-data] after count: ${afterCount}`);

    if (afterCount !== 0) {
      throw new Error(`cleanup-test-data: post-delete count assertion failed — expected 0, got ${afterCount}`);
    }
    log.info(`[CS81 cleanup-test-data] deleted ${beforeCount} row(s) for ${SMOKE_USER}`);
    return { userId, beforeCount, afterCount, deleted: true };
  } finally {
    if (pool) {
      await pool.close().catch(() => {});
    }
  }
}

async function main(deps = {}) {
  const log = deps.log || { info: console.log, error: console.error };
  let exitCode = 0;
  try {
    await cleanupTestData(deps);
  } catch (err) {
    log.error(`[CS81 cleanup-test-data] FAILED: ${err && err.message ? err.message : err}`);
    exitCode = 1;
  }
  process.exit(exitCode);
}

if (require.main === module) {
  main();
}

module.exports = {
  cleanupTestData,
  main,
  SMOKE_USER,
};
