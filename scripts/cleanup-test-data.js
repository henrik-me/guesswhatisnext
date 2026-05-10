#!/usr/bin/env node
/**
 * scripts/cleanup-test-data.js — CS81-1 + CS82-1: ops cleanup of accumulated
 * test-user `scores` rows. Targets:
 *   1. `gwn-smoke-bot` (CS81-1 — exact match; the durable smoke runner user).
 *   2. CS-prefix dev test users matching the `CS_PREFIX_PATTERN` regex
 *      (CS82-1 — machine-generated CS52-style usernames such as
 *      `cs5210umop3dc23a`; see the constant's docstring for the exact shape
 *      and the rejection rules for plausible human-chosen lookalikes).
 *   3. Any explicit usernames passed via the `EXTRA_USERNAMES` env var
 *      (CS82-1 — comma-separated allowlist for surgical one-off cases).
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
 *   required), is parameterized to ONLY touch rows owned by matched test
 *   users, and is idempotent (a second invocation deletes 0 rows).
 *
 * Why this uses `mssql` directly (NOT `server/db/mssql-adapter.js`):
 *   Same boundary as `scripts/wake-db.js` — the runtime adapter has CS53
 *   timeout constants tuned for live request paths. The ops script needs a
 *   long, blocking, single-use connection; coupling to the adapter would
 *   either break CS53 or require new parameters to the adapter.
 *
 * Scope guard (minimum-blast-radius):
 *   - Target user_ids are resolved by looking up specific usernames; never a
 *     wildcard SQL `LIKE` is used in the DELETE. The CS-prefix matching is
 *     done in JS (regex) AFTER the SQL query returns candidates, so the
 *     final DELETE is always parameterized to a specific resolved user_id.
 *   - We only DELETE `scores` rows. The `users` rows themselves are left
 *     intact to preserve referential integrity for any historical
 *     `match_players` or other related tables. The blast radius of removing
 *     the rows is the leaderboard pollution; removing the users adds risk
 *     of cascading FK breakage for no incremental benefit.
 *
 * How to run (locally):
 *   $env:DATABASE_URL = "Server=...;Database=gwn-production;..."
 *   node scripts/cleanup-test-data.js                       # delete
 *   $env:DRY_RUN = "1"; node scripts/cleanup-test-data.js   # count only
 *   $env:EXTRA_USERNAMES = "alice-test,bob-test"; node scripts/cleanup-test-data.js
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

// CS82-1: machine-generated CS-prefix dev-test users, e.g. `cs5210umop3dc23a`.
// Shape: literal `cs`, then a maximal digit run (`\d+(?!\d)` — the negative
// lookahead forbids the engine from backtracking the digit run to leave
// digits leaking into the suffix), then a suffix of mixed alphanumerics
// containing at least one letter AND at least one digit. The mixed-suffix
// requirement (vs the plan's looser `[a-z0-9]+`) is a deliberate tightening
// (CS82 PR #334 local-review finding): real CS52-10 entries (the four
// `cs5210umop3dc23a/b` and `cs5210umop4jes6a/b` users) all have mixed
// alphanumeric suffixes, while plausible human-chosen names like
// `cs50student` (suffix all letters) or `cs100abc` (suffix all letters)
// would otherwise false-positive. Public registration permits any 3-20
// character username except the `gwn-smoke-` reserved prefix
// (`server/routes/auth.js:65-69`), so the broader regex would put real users
// at risk on a future cleanup run. Filtering happens in JS after the SQL
// candidate-fetch (see CS-prefix path in cleanupTestData) so the final
// DELETE is always scoped by specific resolved user_id, never by SQL `LIKE`.
const CS_PREFIX_PATTERN = /^cs\d+(?!\d)(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]+$/;

function parseExtraUsernames(raw) {
  if (raw == null || raw === '') return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Delete accumulated score rows for known/matched test users. Idempotent: a
 * re-run after a successful cleanup deletes 0 rows.
 *
 * Targets resolved (in order):
 *   1. The exact-match `gwn-smoke-bot` user (CS81-1).
 *   2. Users whose username matches `CS_PREFIX_PATTERN` (CS82-1 — see the
 *      constant's docstring for the exact regex and rejection rationale).
 *      Candidates come from a `username LIKE 'cs%'` SQL prefilter; the regex
 *      is applied in JS to keep portability across SQL flavours and to keep
 *      the regex auditable (not hidden in a server-side T-SQL `LIKE` pattern).
 *   3. Users named in `EXTRA_USERNAMES` (env or `deps.extraUsernames`) —
 *      comma-separated allowlist for surgical one-off cleanup of known-test
 *      usernames that don't match the regex (CS82-1).
 *
 * Each matched user is processed independently: count `scores` rows, log
 * `before count: N (<username>)`, DELETE the rows, count again, assert
 * post-count == 0, log `after count: N`. Failures are surfaced as thrown
 * errors so the calling workflow halts and the operator can investigate
 * (no silent partial cleanup).
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
 * @param {string|string[]} [deps.extraUsernames] - comma-separated string or
 *   array of explicit usernames to also clean up. Defaults to
 *   `process.env.EXTRA_USERNAMES`.
 * @param {number} [deps.connectTimeoutMs=30_000] - per-connect timeout.
 * @param {boolean|Function} [deps.wake] - if false, skip wake-db step;
 *   if a function, call it instead of the default wakeDb (test seam).
 *   Default: invoke wakeDb with the resolved sql + connection string.
 * @param {{ info: Function, error: Function }} [deps.log] - logger seam.
 * @returns {Promise<{
 *   targets: Array<{ username: string, userId: number, source: 'smoke'|'cs-prefix'|'extra', beforeCount: number, afterCount: number, deleted: boolean }>,
 *   totalDeleted: number,
 *   dryRun: boolean,
 * }>}
 * @throws {Error} on validation failure, connection failure, query failure,
 *   or if a per-user post-delete count assertion fails.
 */
async function cleanupTestData(deps = {}) {
  const sql = deps.sql || defaultSql;
  const connectionStringExplicit = deps.connectionString !== undefined;
  const connectionString = deps.connectionString ?? process.env.DATABASE_URL;
  const dryRun = deps.dryRun ?? (process.env.DRY_RUN === '1');
  const connectTimeoutMs = deps.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const log = deps.log || { info: console.log, error: console.error };

  // EXTRA_USERNAMES allowlist resolution (string|array|env).
  let extraUsernames;
  if (deps.extraUsernames !== undefined) {
    extraUsernames = Array.isArray(deps.extraUsernames)
      ? deps.extraUsernames.map((s) => String(s).trim()).filter((s) => s.length > 0)
      : parseExtraUsernames(deps.extraUsernames);
  } else {
    extraUsernames = parseExtraUsernames(process.env.EXTRA_USERNAMES);
  }

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
  // `connectTimeoutMs` is forwarded as wake-db's `perAttemptTimeoutMs` so
  // a single tuning knob covers both the wake retries and the cleanup
  // connection (wake's `totalBudgetMs` keeps its 150s default — that is
  // the cap across all retry attempts, distinct from per-attempt timeout).
  if (deps.wake !== false) {
    const wakeFn = typeof deps.wake === 'function' ? deps.wake : wakeDb;
    try {
      await wakeFn({ sql, connectionString, perAttemptTimeoutMs: connectTimeoutMs, log });
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

    // 1) Resolve the smoke-bot user (exact match). Idempotent: missing → skip.
    const targets = [];
    const seenIds = new Set();

    const smokeRes = await pool.request()
      .input('username', sql.NVarChar, SMOKE_USER)
      .query('SELECT id, username FROM users WHERE username = @username');
    const smokeRow = smokeRes.recordset && smokeRes.recordset[0];
    if (smokeRow && smokeRow.id != null) {
      targets.push({ username: smokeRow.username, userId: smokeRow.id, source: 'smoke' });
      seenIds.add(smokeRow.id);
    } else {
      log.info(`[CS82 cleanup-test-data] no '${SMOKE_USER}' user found — skipping smoke-bot path`);
    }

    // 2) Resolve CS-prefix candidates — SQL `LIKE` prefilter, regex in JS.
    const csRes = await pool.request()
      .query("SELECT id, username FROM users WHERE username LIKE 'cs%'");
    const csCandidates = (csRes.recordset || []).filter((r) => CS_PREFIX_PATTERN.test(r.username));
    let csQueued = 0;
    for (const row of csCandidates) {
      if (row.id == null || seenIds.has(row.id)) continue;
      targets.push({ username: row.username, userId: row.id, source: 'cs-prefix' });
      seenIds.add(row.id);
      csQueued += 1;
    }
    log.info(
      `[CS82 cleanup-test-data] cs-prefix matched ${csCandidates.length} user(s); queued ${csQueued} for cleanup (after dedupe + null-id filter)`
    );

    // 3) EXTRA_USERNAMES allowlist — explicit per-name lookup.
    for (const uname of extraUsernames) {
      const exRes = await pool.request()
        .input('username', sql.NVarChar, uname)
        .query('SELECT id, username FROM users WHERE username = @username');
      const exRow = exRes.recordset && exRes.recordset[0];
      if (!exRow || exRow.id == null) {
        log.info(`[CS82 cleanup-test-data] EXTRA_USERNAMES: '${uname}' not found — skipping`);
        continue;
      }
      if (seenIds.has(exRow.id)) {
        log.info(`[CS82 cleanup-test-data] EXTRA_USERNAMES: '${uname}' already matched — skipping duplicate`);
        continue;
      }
      targets.push({ username: exRow.username, userId: exRow.id, source: 'extra' });
      seenIds.add(exRow.id);
    }

    if (targets.length === 0) {
      log.info('[CS82 cleanup-test-data] no matching users — nothing to clean up');
      return { targets: [], totalDeleted: 0, dryRun };
    }

    // Per-user cleanup loop. Each user is independent; failures throw.
    let totalDeleted = 0;
    const results = [];
    for (const t of targets) {
      const beforeRes = await pool.request()
        .input('userId', sql.Int, t.userId)
        .query('SELECT COUNT(*) AS n FROM scores WHERE user_id = @userId');
      const beforeCount = Number(beforeRes.recordset[0].n);
      log.info(`[CS82 cleanup-test-data] before count: ${beforeCount} (${t.username}, source=${t.source})`);

      if (dryRun) {
        log.info(`[CS82 cleanup-test-data] DRY_RUN — would delete ${beforeCount} row(s) for ${t.username}; skipping`);
        results.push({ ...t, beforeCount, afterCount: beforeCount, deleted: false });
        continue;
      }

      const deleteRes = await pool.request()
        .input('userId', sql.Int, t.userId)
        .query('DELETE FROM scores WHERE user_id = @userId');
      // Prefer the driver's reported rowsAffected so a concurrent
      // insert/delete during cleanup is reflected accurately in the summary
      // (CS82 PR #334 R4). Fall back to beforeCount if the driver doesn't
      // surface rowsAffected (test fakes that omit it).
      const rowsAffected = Array.isArray(deleteRes && deleteRes.rowsAffected)
        ? Number(deleteRes.rowsAffected[0])
        : NaN;
      const deletedRows = Number.isFinite(rowsAffected) ? rowsAffected : beforeCount;

      const afterRes = await pool.request()
        .input('userId', sql.Int, t.userId)
        .query('SELECT COUNT(*) AS n FROM scores WHERE user_id = @userId');
      const afterCount = Number(afterRes.recordset[0].n);
      log.info(`[CS82 cleanup-test-data] after count: ${afterCount} (${t.username}, deletedRows=${deletedRows})`);

      if (afterCount !== 0) {
        throw new Error(`cleanup-test-data: post-delete count assertion failed for ${t.username} — expected 0, got ${afterCount}`);
      }
      totalDeleted += deletedRows;
      results.push({ ...t, beforeCount, deletedRows, afterCount, deleted: true });
    }

    log.info(
      `[CS82 cleanup-test-data] summary: ${results.length} user(s) processed, ${totalDeleted} row(s) deleted total (dryRun=${dryRun})`
    );
    return { targets: results, totalDeleted, dryRun };
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
    log.error(`[CS82 cleanup-test-data] FAILED: ${err && err.message ? err.message : err}`);
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
  CS_PREFIX_PATTERN,
  parseExtraUsernames,
};
