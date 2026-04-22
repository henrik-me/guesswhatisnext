'use strict';

const { isTransientDbError } = require('../server/lib/transient-db-error');

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
