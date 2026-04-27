'use strict';

/**
 * CS52-followup — POST /api/admin/seed-ranked-puzzles
 *
 * Idempotent admin endpoint that seeds the `ranked_puzzles` table from
 * `server/db/seeds/ranked-puzzles-v1.json` (which IS in the production
 * Docker image — see Dockerfile `COPY server/`). This removes the operator
 * toil of having to `docker cp` or `az containerapp exec` the
 * `scripts/seed-ranked-puzzles.js` (which is intentionally NOT shipped) into
 * a running container.
 *
 * Mirrors CS52-7c (`PUT /api/admin/game-configs/:mode`) and CS61-1
 * (`POST /api/admin/seed-smoke-user`):
 *   - Auth: `requireSystem` middleware (SYSTEM_API_KEY via x-api-key, or
 *     admin role via JWT). 401 missing/invalid key, 403 non-system user.
 *   - Body: empty (no params; the seed file is the single source of truth).
 *   - Behaviour: delegates to `server/services/seedRankedPuzzles.js` — the
 *     same shared core the CLI uses, so dialect-specific idempotent INSERT
 *     semantics stay identical across both surfaces.
 *
 * Response 200: `{ inserted, skipped, total, version }` — matches the shape
 * of the CLI's structured `Ranked puzzles seeded` log line so dashboards
 * built against the script's telemetry continue to work for the route too.
 *
 * Idempotency: a second call against an already-seeded DB returns
 * `{ inserted: 0, skipped: 54, total: 54 }` (asserted in
 * `tests/cs52-followup-seed-admin.test.js`).
 *
 * Boot-quiet contract: the route is only reached on explicit POST; nothing
 * runs at app boot.
 */

const express = require('express');
const logger = require('../logger');
const { getDbAdapter } = require('../db');
const { requireSystem } = require('../middleware/auth');
const { seedRankedPuzzles } = require('../services/seedRankedPuzzles');

const router = express.Router();

router.post('/', requireSystem, async (_req, res, next) => {
  try {
    const db = await getDbAdapter();
    const result = await seedRankedPuzzles(db);

    // Reuse the CLI's structured log line so the existing observability
    // KQL (`docs/observability.md` — "Ranked puzzles seeded") covers both
    // surfaces, and add a route-specific audit event for invocation
    // tracing.
    logger.info(
      {
        inserted: result.inserted,
        skipped: result.skipped,
        total: result.total,
        version: result.version,
      },
      'Ranked puzzles seeded'
    );
    logger.info(
      {
        actor: 'admin-route',
        action: 'seed-ranked-puzzles',
        inserted: result.inserted,
        skipped: result.skipped,
        total: result.total,
        version: result.version,
      },
      'audit.seed-ranked-puzzles'
    );

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
