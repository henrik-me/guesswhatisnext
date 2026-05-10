#!/usr/bin/env node
/**
 * scripts/wake-db.js — CS73: standalone Azure SQL "wake" utility used by
 * `.github/workflows/prod-deploy.yml` immediately before the migration step.
 *
 * Why this exists separately from `server/db/mssql-adapter.js`:
 *   `gwn-production` runs on Azure SQL `GP_S_Gen5` serverless with
 *   `autoPauseDelay=60min`. After idle, a connect attempt does trigger the
 *   resume but the resume itself takes ~30–60s. The runtime adapter
 *   (`mssql-adapter.js`) hard-codes `MssqlAdapter.CONNECT_TIMEOUT_MS = 5000`
 *   deliberately (CS53-3 / CS53-6) so the *user-request* warmup-retry path
 *   can exercise more attempts inside the user's budget. We must NOT touch
 *   that constant — the deploy-time wake needs a long timeout, the live
 *   request path needs a short one.
 *
 *   So the deploy step uses this script, which talks to `mssql` directly
 *   with its own per-attempt timeout + bounded retry/backoff budget. Zero
 *   coupling to the runtime adapter; zero risk to the CS53 contract.
 *
 * How to run:
 *   $env:DATABASE_URL = "Server=...;Database=gwn-production;..."
 *   node scripts/wake-db.js
 *
 * Exit codes:
 *   0 — DB responded to `SELECT 1` within the total budget.
 *   1 — total budget exhausted across all retries (still cold, or a real
 *       connectivity outage). The deploy step should abort.
 */

'use strict';

const defaultSql = require('mssql');

// Azure SQL transient error codes for which a retry is appropriate.
// 40613: Database '...' on server '...' is not currently available.
// 40197: The service has encountered an error processing your request. Please try again.
// 40501: The service is currently busy.
// 49918/49919/49920: Cannot process request — too many operations / not enough resources.
const RETRYABLE_SQL_NUMBERS = new Set([40613, 40197, 40501, 49918, 49919, 49920]);

// Permanent failures we never want to retry, even though mssql wraps them
// in `ConnectionError` / `RequestError`. Retrying these just burns the
// 150s budget and turns a real config outage into a slow failure.
const NON_RETRYABLE_CODES = new Set([
  'ELOGIN',          // mssql login failure (bad credentials)
  'ENOTFOUND',       // DNS resolution failed (bad server hostname)
  'ECONNREFUSED',    // server actively refused (firewall / port closed)
  'EINSTLOOKUP',     // SQL Browser instance lookup failed
  'ENOTOPEN',        // pool not open (programming error)
  'EALREADYCONNECTED',
  'EALREADYCONNECTING',
]);

// Linear backoff schedule capped at 15s. Indexed by (attempt - 1).
const BACKOFF_SCHEDULE_MS = [5_000, 10_000, 15_000];

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err) {
  if (!err) return false;
  // Explicit retry list: Azure SQL transient SQL errors (always retry).
  if (typeof err.number === 'number' && RETRYABLE_SQL_NUMBERS.has(err.number)) return true;
  // Explicit non-retry list: permanent mssql/tedious failure codes.
  if (typeof err.code === 'string' && NON_RETRYABLE_CODES.has(err.code)) return false;
  // Common login-failure message patterns surface without a clean code.
  const message = String((err && err.message) || '');
  if (/login failed/i.test(message)) return false;
  if (/cannot open server/i.test(message)) return false;
  if (/password did not match/i.test(message)) return false;
  // Catch-all: mssql wraps tedious errors as ConnectionError / RequestError.
  // Retry these only when there's no specific number/code that would have
  // told us they were permanent (ELOGIN etc. were filtered out above).
  const name = err.name || '';
  if (name === 'ConnectionError' || name === 'RequestError') return true;
  return false;
}

function backoffFor(attemptIndex) {
  return BACKOFF_SCHEDULE_MS[Math.min(attemptIndex, BACKOFF_SCHEDULE_MS.length - 1)];
}

/**
 * Wake an Azure SQL DB by opening a short-lived connection and running
 * `SELECT 1`, retrying transient errors within a total time budget.
 *
 * @param {Object} [deps]
 * @param {Object} [deps.sql] - mssql module (injectable for tests).
 * @param {string} [deps.connectionString] - defaults to process.env.DATABASE_URL.
 * @param {number} [deps.perAttemptTimeoutMs=30000] - per-connect timeout.
 * @param {number} [deps.totalBudgetMs=150000] - hard cap across all attempts.
 * @param {Function} [deps.sleep] - async (ms) => void; injectable for tests.
 * @param {{ info: Function, error: Function }} [deps.log] - logger seam.
 * @returns {Promise<{ attempts: number, elapsedMs: number }>} on success.
 *          Throws an Error on budget exhaustion.
 */
async function wakeDb(deps = {}) {
  const sql = deps.sql || defaultSql;
  const connectionString = deps.connectionString || process.env.DATABASE_URL;
  const perAttemptTimeoutMs = deps.perAttemptTimeoutMs ?? 30_000;
  const totalBudgetMs = deps.totalBudgetMs ?? 150_000;
  const sleep = deps.sleep || defaultSleep;
  const log = deps.log || { info: console.log, error: console.error };

  if (!connectionString) {
    throw new Error('wake-db: DATABASE_URL is unset; nothing to connect to.');
  }
  if (!Number.isFinite(perAttemptTimeoutMs) || perAttemptTimeoutMs <= 0) {
    throw new Error(`wake-db: perAttemptTimeoutMs must be a positive number (got ${perAttemptTimeoutMs}).`);
  }
  if (!Number.isFinite(totalBudgetMs) || totalBudgetMs <= 0) {
    throw new Error(`wake-db: totalBudgetMs must be a positive number (got ${totalBudgetMs}).`);
  }

  // Mirror `server/db/mssql-adapter.js:354-361` — parse first, then override
  // both connect AND request timeouts on top-level + the underlying tedious
  // options block so values are honored regardless of mssql's forwarding
  // logic. The wake script's SELECT 1 is tiny, but a cold-resumed DB can
  // take a moment to satisfy the first request, so we size requestTimeout
  // to the same per-attempt budget as the connect.
  //
  // The per-attempt timeout is recomputed each iteration as
  // `min(perAttemptTimeoutMs, remainingBudgetMs)` so a slow final attempt
  // cannot overshoot `totalBudgetMs` by up to one full per-attempt timeout.
  const baseConfig = sql.ConnectionPool.parseConnectionString(connectionString);
  baseConfig.options = baseConfig.options || {};

  const startedAt = Date.now();
  let attempt = 0;
  let lastError;

  while (true) {
    const remainingMs = totalBudgetMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;
    attempt += 1;
    const attemptTimeoutMs = Math.min(perAttemptTimeoutMs, remainingMs);
    const config = {
      ...baseConfig,
      connectionTimeout: attemptTimeoutMs,
      requestTimeout: attemptTimeoutMs,
      options: {
        ...baseConfig.options,
        connectTimeout: attemptTimeoutMs,
        requestTimeout: attemptTimeoutMs,
      },
    };
    let pool;
    let nextWaitMs = 0;
    let shouldRetry = false;
    try {
      pool = new sql.ConnectionPool(config);
      await pool.connect();
      await pool.request().query('SELECT 1');
      const elapsedMs = Date.now() - startedAt;
      log.info(`[CS73 wake-db] success on attempt ${attempt} after ${elapsedMs}ms`);
      return { attempts: attempt, elapsedMs };
    } catch (err) {
      lastError = err;
      const code = (err && (err.number || err.code)) || err?.name || 'unknown';
      const message = (err && err.message) || String(err);
      if (!isRetryable(err)) {
        log.error(`[CS73 wake-db] attempt ${attempt} failed with non-retryable error (${code}): ${message}`);
        // Pool close happens in finally{} below; rethrow after that.
        throw err;
      }
      const remainingAfterMs = totalBudgetMs - (Date.now() - startedAt);
      const wait = backoffFor(attempt - 1);
      // Need room for the backoff PLUS at least a minimal next attempt
      // (1ms is enough — Math.min in the next iteration will clamp).
      if (remainingAfterMs <= wait) {
        log.error(`[CS73 wake-db] attempt ${attempt} failed (${code}): ${message}; budget exhausted (${remainingAfterMs}ms remaining < ${wait}ms backoff)`);
        // Fall through to finally + while loop exits naturally on next check.
      } else {
        log.info(`[CS73 wake-db] attempt ${attempt} failed (${code}): ${message}; retrying in ${Math.round(wait / 1000)}s`);
        shouldRetry = true;
        nextWaitMs = wait;
      }
    } finally {
      if (pool) {
        await pool.close().catch(() => {});
      }
    }
    if (!shouldRetry) break;
    // Sleep AFTER the pool is closed so we don't hold a failed connection
    // open during the backoff window — important when the retry was
    // triggered by Azure SQL resource pressure (49918/49919/49920).
    await sleep(nextWaitMs);
  }

  const totalElapsedMs = Date.now() - startedAt;
  const summary = `wake-db: total budget ${totalBudgetMs}ms exhausted after ${attempt} attempt(s) in ${totalElapsedMs}ms; last error: ${lastError && lastError.message ? lastError.message : lastError}`;
  const wrapped = new Error(summary);
  wrapped.cause = lastError;
  throw wrapped;
}

async function main(deps = {}) {
  const log = deps.log || { info: console.log, error: console.error };
  let exitCode = 0;
  try {
    await wakeDb(deps);
  } catch (err) {
    log.error(`[CS73 wake-db] FAILED: ${err && err.message ? err.message : err}`);
    exitCode = 1;
  }
  process.exit(exitCode);
}

if (require.main === module) {
  main();
}

module.exports = {
  wakeDb,
  main,
  // exported for tests
  RETRYABLE_SQL_NUMBERS,
  NON_RETRYABLE_CODES,
  BACKOFF_SCHEDULE_MS,
};
