'use strict';

/**
 * CS61-1 — POST /api/admin/seed-smoke-user
 *
 * Idempotent admin endpoint that creates the deploy-time smoke probe user
 * `gwn-smoke-bot`. Used by `scripts/seed-smoke-user-via-api.js` from
 * staging-deploy.yml (CS61-3) to seed the user inside the container's
 * ephemeral SQLite at `/tmp/game.db` after each new revision starts.
 *
 * Per CS61 plan v3 § Design D1 (Option β): a dedicated narrow admin endpoint
 * is preferred over bypassing the reserved-prefix check on `/api/auth/register`
 * (Option α) because:
 *   - `requireSystem` shrinks the auth surface (vs. public + rate-limited register).
 *   - The username is HARD-CODED here (no caller input), so the reserved-prefix
 *     bypass is structurally scoped to this endpoint and cannot be abused to
 *     mint arbitrary `gwn-smoke-*` accounts.
 *   - Audit-logged on every call.
 *
 * Locked endpoint contract (CS61 plan § D1):
 *   POST /api/admin/seed-smoke-user
 *   Auth:    requireSystem (existing x-api-key middleware).
 *   Body:    { password: string, ≥6 chars }.
 *   Result:  201 { status: 'created', username: 'gwn-smoke-bot' } on first call.
 *            200 { status: 'exists',  username: 'gwn-smoke-bot' } if already present.
 *            400 on missing/short password.
 *            401/403 from requireSystem on bad auth.
 *
 * Schema + hashing match `server/routes/auth.js` and `scripts/setup-smoke-user.js`
 * exactly: bcryptjs hashSync at cost factor 10, `INSERT INTO users (username,
 * password_hash) VALUES (?, ?)` — `role` defaults to 'user' and `created_at`
 * defaults to CURRENT_TIMESTAMP via the schema (server/db/schema.sql).
 *
 * Idempotency under races: two concurrent seed callers can both pass the
 * existence pre-check and both attempt INSERT; the UNIQUE constraint on
 * `users.username` makes the second INSERT fail. We catch that and re-check —
 * if the row now exists the loser returns 200 exists instead of 500.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const logger = require('../logger');
const { getDbAdapter } = require('../db');
const { requireSystem } = require('../middleware/auth');

const router = express.Router();

const SMOKE_USERNAME = 'gwn-smoke-bot';
const BCRYPT_COST = 10;
const MIN_PASSWORD_LENGTH = 6;

/** Returns true when the DB error looks like a UNIQUE-constraint violation
 *  on the `users.username` index. We check both the SQLite shape
 *  ("UNIQUE constraint failed: users.username") and the MSSQL shape
 *  (error number 2627 / 2601, or "duplicate" in the message) so the
 *  endpoint stays idempotent on either backend. Anything we can't classify
 *  is re-thrown so genuine 500s aren't swallowed. */
function isUniqueViolation(err) {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('unique constraint failed') && msg.includes('users.username')) return true;
  if (msg.includes('unique') && msg.includes('username')) return true;
  // mssql driver surfaces the SQL Server error number on `err.number`.
  if (err.number === 2627 || err.number === 2601) return true;
  return false;
}

router.post('/', requireSystem, async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: `password (string, ≥${MIN_PASSWORD_LENGTH} chars) required in body`,
      });
    }

    const db = await getDbAdapter();

    const existing = await db.get(
      'SELECT id FROM users WHERE username = ?',
      [SMOKE_USERNAME]
    );
    if (existing) {
      logger.info(
        {
          actor: 'system-api-key',
          action: 'seed-smoke-user',
          result: 'exists',
          username: SMOKE_USERNAME,
        },
        'audit.seed-smoke-user'
      );
      return res.status(200).json({ status: 'exists', username: SMOKE_USERNAME });
    }

    const hash = bcrypt.hashSync(password, BCRYPT_COST);
    try {
      await db.run(
        'INSERT INTO users (username, password_hash) VALUES (?, ?)',
        [SMOKE_USERNAME, hash]
      );
    } catch (err) {
      // Race: another concurrent seeder won the INSERT between our pre-check
      // and ours. Treat as success-on-rerun (200 exists) rather than 500.
      if (isUniqueViolation(err)) {
        const reread = await db.get(
          'SELECT id FROM users WHERE username = ?',
          [SMOKE_USERNAME]
        );
        if (reread) {
          logger.info(
            {
              actor: 'system-api-key',
              action: 'seed-smoke-user',
              result: 'exists',
              username: SMOKE_USERNAME,
              note: 'race-resolved',
            },
            'audit.seed-smoke-user'
          );
          return res.status(200).json({ status: 'exists', username: SMOKE_USERNAME });
        }
      }
      throw err;
    }

    logger.info(
      {
        actor: 'system-api-key',
        action: 'seed-smoke-user',
        result: 'created',
        username: SMOKE_USERNAME,
      },
      'audit.seed-smoke-user'
    );

    return res.status(201).json({ status: 'created', username: SMOKE_USERNAME });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
module.exports.SMOKE_USERNAME = SMOKE_USERNAME;
module.exports.MIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH;
