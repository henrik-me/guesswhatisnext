/**
 * Tests for scripts/setup-smoke-user.js — the operator script that
 * provisions the deploy-smoke probe user.
 *
 * Boots a fresh isolated SQLite DB with the real schema (via migrations)
 * and exercises main() directly.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const bcrypt = require('bcryptjs');

// Set isolated DB path BEFORE any server module gets required (config.js
// snapshots GWN_DB_PATH at import time).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwn-smoke-script-'));
const dbPath = path.join(tmpDir, 'smoke.db');
process.env.GWN_DB_PATH = dbPath;
process.env.NODE_ENV = 'test';
delete process.env.DB_BACKEND;
delete process.env.DATABASE_URL;

const { main, SMOKE_USERNAME } = require('../scripts/setup-smoke-user');

let exitSpy;
let exitCode;

beforeAll(async () => {
  // Bootstrap schema via the real migration framework.
  const { createDb } = require('../server/db');
  const migrations = require('../server/db/migrations');
  const bootDb = await createDb();
  await bootDb.migrate(migrations);
  await bootDb.close();
});

afterAll(() => {
  delete process.env.SMOKE_USER_PASSWORD;
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  exitCode = undefined;
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
    exitCode = code;
    throw new Error(`__process_exit_${code}`);
  });
});

afterEach(() => {
  exitSpy.mockRestore();
});

describe('scripts/setup-smoke-user.js', () => {
  test('rejects missing/short SMOKE_USER_PASSWORD with exit 1', async () => {
    process.env.SMOKE_USER_PASSWORD = 'abc'; // < 6 chars
    await expect(main()).rejects.toThrow('__process_exit_1');
    expect(exitCode).toBe(1);
  });

  test('creates smoke user when absent (returns 0)', async () => {
    process.env.SMOKE_USER_PASSWORD = 'strongpass-cs41-0';
    const code = await main();
    expect(code).toBe(0);

    // Verify the user exists with a valid bcrypt hash + default role.
    const { createDb } = require('../server/db');
    const db = await createDb();
    const row = await db.get(
      'SELECT id, username, password_hash, role FROM users WHERE username = ?',
      [SMOKE_USERNAME]
    );
    await db.close();
    expect(row).not.toBeNull();
    expect(row.username).toBe(SMOKE_USERNAME);
    expect(row.role).toBe('user');
    expect(bcrypt.compareSync('strongpass-cs41-0', row.password_hash)).toBe(true);
  });

  test('idempotent: re-running with user present is a no-op success', async () => {
    process.env.SMOKE_USER_PASSWORD = 'a-different-password-99';
    const code = await main();
    expect(code).toBe(0);

    // Password from the original create call must still verify; the new
    // password must NOT (i.e. the script does not silently rotate).
    const { createDb } = require('../server/db');
    const db = await createDb();
    const row = await db.get(
      'SELECT password_hash FROM users WHERE username = ?',
      [SMOKE_USERNAME]
    );
    await db.close();
    expect(bcrypt.compareSync('strongpass-cs41-0', row.password_hash)).toBe(true);
    expect(bcrypt.compareSync('a-different-password-99', row.password_hash)).toBe(false);
  });
});
