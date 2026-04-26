'use strict';

/**
 * setup-smoke-user.js — operator one-time-per-environment script that creates
 * the deploy-smoke probe user `gwn-smoke-bot` directly via the DB adapter.
 *
 * The username `gwn-smoke-` prefix is reserved at registration (see
 * server/reserved-usernames.js + server/routes/auth.js), so the public
 * /api/auth/register endpoint cannot create this account. This script is the
 * only supported way to provision it.
 *
 * Operator usage (per environment, run once):
 *
 *   # Local SQLite (e.g. validating the script itself)
 *   SMOKE_USER_PASSWORD=<strong-pw> node scripts/setup-smoke-user.js
 *
 *   # Staging / production (Azure SQL via mssql adapter)
 *   SMOKE_USER_PASSWORD=<strong-pw> \
 *   DB_BACKEND=mssql \
 *   GWN_MSSQL_CONN_STRING=<conn-string> \
 *   node scripts/setup-smoke-user.js
 *
 * Idempotency: re-running with the user already present is a no-op success
 * (exit 0). The script never updates an existing user's password — operators
 * who need to rotate the password should DELETE the user first via direct DB
 * access, then re-run.
 *
 * Schema + hashing match server/routes/auth.js exactly: bcryptjs hashSync at
 * cost factor 10, INSERT into users (username, password_hash); the `role`
 * column defaults to 'user' and `created_at` defaults to CURRENT_TIMESTAMP
 * via the schema (see server/db/schema.sql).
 */

const bcrypt = require('bcryptjs');
const { createDb } = require('../server/db');

const SMOKE_USERNAME = 'gwn-smoke-bot';
const BCRYPT_COST = 10;
const MIN_PASSWORD_LENGTH = 6;

async function main() {
  const password = process.env.SMOKE_USER_PASSWORD;
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `SMOKE_USER_PASSWORD env var must be set (min ${MIN_PASSWORD_LENGTH} chars).`
    );
    process.exit(1);
  }

  const db = await createDb();
  try {
    const existing = await db.get(
      'SELECT id FROM users WHERE username = ?',
      [SMOKE_USERNAME]
    );
    if (existing) {
      console.log(
        `User '${SMOKE_USERNAME}' already exists (id=${existing.id}); nothing to do.`
      );
      return 0;
    }

    const hash = bcrypt.hashSync(password, BCRYPT_COST);
    const result = await db.run(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [SMOKE_USERNAME, hash]
    );
    console.log(
      `Created user '${SMOKE_USERNAME}' (id=${result.lastId}). ` +
        'Filtered from public leaderboards and community-puzzle listings by ' +
        'server/routes/{scores,puzzles}.js.'
    );
    return 0;
  } finally {
    await db.close().catch(() => { /* best effort */ });
  }
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('setup-smoke-user.js failed:', err);
      process.exit(1);
    });
}

module.exports = { main, SMOKE_USERNAME, BCRYPT_COST, MIN_PASSWORD_LENGTH };
