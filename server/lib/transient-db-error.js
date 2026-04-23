'use strict';

/**
 * Detects whether a database error is a transient/retryable failure such as
 * an Azure SQL serverless cold-start timeout, a connection reset, or a known
 * MSSQL transient error number.
 *
 * Used in two places:
 *   1. server/app.js — startup self-init retry loop.
 *   2. server/app.js — central error handler, to convert mid-request transient
 *      DB failures into HTTP 503 (with Retry-After) so the CS42-3
 *      ProgressiveLoader on the client can retry instead of surfacing
 *      "Internal server error" to the user.
 *
 * @param {Error} err
 * @param {'mssql'|'sqlite'|string|undefined} dialect
 * @returns {boolean}
 */
function isTransientDbError(err, dialect) {
  if (!err) return false;

  if (dialect === 'mssql') {
    // Combined message string for pattern matching (covers wrapped errors).
    const combinedMessage = [
      err.message,
      err.originalError && err.originalError.message,
    ].filter(Boolean).join(' ');

    // Explicit NON-transient cases (must be checked before the broad
    // ConnectionError/RequestError catch-all below).
    //
    // Azure SQL Free Tier monthly compute allowance exhausted: the DB is
    // intentionally paused by Azure until 00:00 UTC on the 1st of next
    // month. Retrying within the same month is futile — it cannot succeed
    // and only burns the renewed allowance once the DB comes back.
    // The error surfaces with err.code === 'ELOGIN' and a message
    // containing "free amount allowance" / "paused for the remainder of
    // the month".
    if (/free (amount )?allowance|paused for the remainder of the month/i.test(combinedMessage)) {
      return false;
    }

    const MSSQL_TRANSIENT_NUMBERS = new Set([40613, 40197, 40501, 49918, 49919, 49920]);
    const errNumber = err.number || (err.originalError && err.originalError.number);
    if (MSSQL_TRANSIENT_NUMBERS.has(errNumber)) return true;
    if (err.code && /ETIMEOUT|ECONNREFUSED|ESOCKET|ECONNRESET/.test(err.code)) return true;
    // tedious / mssql wrap connection failures in these names; treat as transient.
    if (err.name === 'ConnectionError' || err.name === 'RequestError') return true;
    if (combinedMessage && /connection.*timeout|pool.*failed|database.*paused|database.*unavailable|failed to connect/i.test(combinedMessage)) {
      return true;
    }
    return false;
  }

  return err.code === 'SQLITE_BUSY' ||
    err.code === 'SQLITE_LOCKED' ||
    err.code === 'SQLITE_BUSY_SNAPSHOT';
}

module.exports = { isTransientDbError };
