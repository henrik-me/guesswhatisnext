'use strict';

const { isTransientDbError, getDbUnavailability } = require('../server/lib/transient-db-error');

describe('isTransientDbError (mssql dialect)', () => {
  test('detects ConnectionError name (Azure SQL cold-start timeout)', () => {
    const err = new Error('Failed to connect to gwn-sqldb.database.windows.net:1433 in 15000ms');
    err.name = 'ConnectionError';
    expect(isTransientDbError(err, 'mssql')).toBe(true);
  });

  test('detects RequestError name', () => {
    const err = new Error('Request timed out');
    err.name = 'RequestError';
    expect(isTransientDbError(err, 'mssql')).toBe(true);
  });

  test('detects ETIMEOUT code', () => {
    const err = new Error('socket timeout');
    err.code = 'ETIMEOUT';
    expect(isTransientDbError(err, 'mssql')).toBe(true);
  });

  test('detects ECONNRESET code', () => {
    const err = new Error('connection reset');
    err.code = 'ECONNRESET';
    expect(isTransientDbError(err, 'mssql')).toBe(true);
  });

  test('detects MSSQL transient error number 40613 (database unavailable)', () => {
    const err = new Error('database is unavailable');
    err.number = 40613;
    expect(isTransientDbError(err, 'mssql')).toBe(true);
  });

  test('detects "failed to connect" message variants', () => {
    const err = new Error('Failed to connect to server in 15000ms');
    expect(isTransientDbError(err, 'mssql')).toBe(true);
  });

  test('detects nested originalError.number transient codes', () => {
    const err = new Error('wrapped');
    err.originalError = { number: 40197 };
    expect(isTransientDbError(err, 'mssql')).toBe(true);
  });

  test('does NOT classify generic Error as transient', () => {
    const err = new Error('some other failure');
    expect(isTransientDbError(err, 'mssql')).toBe(false);
  });

  test('does NOT classify SQL syntax error (non-transient number) as transient', () => {
    const err = new Error('Invalid column name');
    err.number = 207;
    expect(isTransientDbError(err, 'mssql')).toBe(false);
  });

  test('does NOT classify Azure SQL Free Tier monthly allowance exhaustion as transient (ELOGIN + free amount message)', () => {
    // Real Azure SQL Free Tier exhaustion error shape (CS53):
    // err.name = 'ConnectionError', err.code = 'ELOGIN'
    // The DB is intentionally paused until the 1st of next month;
    // retrying within the same month cannot succeed.
    const err = new Error(
      "This database has reached the monthly free amount allowance for the month of April 2026 " +
      "and is paused for the remainder of the month. The free amount will renew at 12:00 AM (UTC) on May 01, 2026."
    );
    err.name = 'ConnectionError';
    err.code = 'ELOGIN';
    expect(isTransientDbError(err, 'mssql')).toBe(false);
  });

  test('does NOT classify free-tier exhaustion when wrapped in originalError', () => {
    const err = new Error('Login failed');
    err.name = 'ConnectionError';
    err.code = 'ELOGIN';
    err.originalError = {
      message: 'free amount allowance for the month of April 2026 and is paused for the remainder of the month',
    };
    expect(isTransientDbError(err, 'mssql')).toBe(false);
  });

  test('still detects normal cold-start ConnectionError after free-tier exclusion', () => {
    // Regression: ensure the free-tier early-return does not break the
    // common Azure SQL serverless cold-start path (CS42).
    const err = new Error('Failed to connect to gwn-sqldb.database.windows.net:1433 in 15000ms');
    err.name = 'ConnectionError';
    err.code = 'ETIMEOUT';
    expect(isTransientDbError(err, 'mssql')).toBe(true);
  });
});

describe('isTransientDbError (sqlite dialect)', () => {
  test('detects SQLITE_BUSY', () => {
    const err = new Error('locked');
    err.code = 'SQLITE_BUSY';
    expect(isTransientDbError(err, 'sqlite')).toBe(true);
  });

  test('detects SQLITE_LOCKED', () => {
    const err = new Error('locked');
    err.code = 'SQLITE_LOCKED';
    expect(isTransientDbError(err, 'sqlite')).toBe(true);
  });

  test('does NOT classify constraint failure as transient', () => {
    const err = new Error('UNIQUE constraint failed');
    err.code = 'SQLITE_CONSTRAINT';
    expect(isTransientDbError(err, 'sqlite')).toBe(false);
  });
});

describe('isTransientDbError (defensive)', () => {
  test('returns false for null/undefined', () => {
    expect(isTransientDbError(null, 'mssql')).toBe(false);
    expect(isTransientDbError(undefined, 'mssql')).toBe(false);
  });

  test('unknown dialect falls back to sqlite-style check', () => {
    const err = new Error('busy');
    err.code = 'SQLITE_BUSY';
    expect(isTransientDbError(err, undefined)).toBe(true);
  });
});

describe('getDbUnavailability (mssql)', () => {
  test('detects free amount allowance message → capacity-exhausted', () => {
    const err = new Error(
      'This database has reached the monthly free amount allowance for the month of April 2026 and is paused for the remainder of the month.'
    );
    err.name = 'ConnectionError';
    err.code = 'ELOGIN';
    const result = getDbUnavailability(err, 'mssql');
    expect(result).not.toBeNull();
    expect(result.reason).toBe('capacity-exhausted');
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  test('detects message wrapped in originalError', () => {
    const err = new Error('Login failed');
    err.originalError = {
      message: 'free amount allowance reached; paused for the remainder of the month',
    };
    expect(getDbUnavailability(err, 'mssql')).not.toBeNull();
  });

  test('returns null for normal cold-start ETIMEOUT', () => {
    const err = new Error('Failed to connect to gwn-sqldb in 15000ms');
    err.code = 'ETIMEOUT';
    err.name = 'ConnectionError';
    expect(getDbUnavailability(err, 'mssql')).toBeNull();
  });

  test('returns null for non-mssql dialects', () => {
    const err = new Error('free amount allowance');
    expect(getDbUnavailability(err, 'sqlite')).toBeNull();
    expect(getDbUnavailability(err, undefined)).toBeNull();
  });

  test('returns null for null/undefined error', () => {
    expect(getDbUnavailability(null, 'mssql')).toBeNull();
    expect(getDbUnavailability(undefined, 'mssql')).toBeNull();
  });
});
