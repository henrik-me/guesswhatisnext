'use strict';

/**
 * CS61-2 — Admin route for migration tracker introspection.
 *
 * Mounted at `/api/admin/migrations`. Single endpoint:
 *
 *   GET /api/admin/migrations
 *
 * Auth: `requireSystem` middleware (SYSTEM_API_KEY via x-api-key, or admin
 * role via JWT) — same auth pattern as the rest of `/api/admin/*`.
 *
 * Response shape (locked by CS61 plan v3 § Design D2):
 *   {
 *     applied:   number,         // count of migrations recorded as applied
 *     expected:  number,         // count of migrations defined in code
 *     status:    'ok' | 'pending' | 'ahead' | 'error',
 *     names:     string[],       // names of applied migrations in version order
 *     lastError: string | null,  // tracker query error, null on success
 *   }
 *
 * Status taxonomy:
 *   - 'ok'      : applied === expected (and no tracker error). Also covers
 *                 the `applied === 0 && expected === 0` "no migrations
 *                 defined" case — vacuously consistent.
 *   - 'pending' : applied < expected — server boot did not finish migrating
 *                 (likely transient during cold-start; legit failure if
 *                 persistent). This is also the state on a fresh DB where
 *                 the `_migrations` table exists but is empty (applied=0).
 *   - 'ahead'   : applied > expected — code is older than the DB (rolled-
 *                 back deploy after newer code applied newer migrations).
 *                 LEGITIMATE during rollback windows; smoke MUST NOT treat
 *                 this as failure on old-rev/rollback paths.
 *   - 'error'   : the tracker query itself failed (e.g. `_migrations` table
 *                 does not exist because `migrate()` has never run on this
 *                 DB). Surfaced via `getMigrationState().lastError !== null`
 *                 — the adapter swallows the throw so this route never 500s
 *                 on a well-formed tracker miss.
 *
 * Uses adapter-level `db.getMigrationState()` (CS61-0). Routes MUST NOT
 * import `server/db/migrations/_tracker.js` directly — see base-adapter.js.
 *
 * Performance: one `SELECT version, name FROM _migrations ORDER BY version`
 * per call. Sub-millisecond against either backend; safe for smoke polling.
 */

const express = require('express');
const { getDbAdapter } = require('../db');
const { requireSystem } = require('../middleware/auth');
const migrations = require('../db/migrations');

const router = express.Router();

router.get('/', requireSystem, async (req, res, next) => {
  try {
    const db = await getDbAdapter();
    const state = await db.getMigrationState();

    const expected = migrations.length;
    const applied = state.applied;

    let status;
    if (state.lastError) {
      status = 'error';
    } else if (applied === expected) {
      status = 'ok';
    } else if (applied < expected) {
      status = 'pending';
    } else {
      status = 'ahead';
    }

    return res.status(200).json({
      applied,
      expected,
      status,
      names: state.appliedNames,
      lastError: state.lastError,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
