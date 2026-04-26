'use strict';

/**
 * CS52-7c — Admin route for `game_configs`.
 *
 * Mounted at `/api/admin/game-configs`. Single endpoint:
 *
 *   PUT /api/admin/game-configs/:mode
 *
 * Auth: `requireSystem` middleware (SYSTEM_API_KEY via x-api-key, or admin
 * role via JWT) — same auth pattern as `/api/admin/drain`, `/api/admin/init-db`.
 * 401 for missing/invalid api key; 403 for authenticated but non-system user.
 *
 * Validation (per CS52 § Decision #10 — bounds protect operators from
 * hand-typed `UPDATE game_configs SET rounds=0` bricking the mode):
 *   - `:mode` must be a key of GAME_CONFIG_DEFAULTS (whitelist).
 *   - `rounds`               : integer ∈ [1, 50]                  (required)
 *   - `round_timer_ms`       : integer ∈ [5000, 60000]            (required)
 *   - `inter_round_delay_ms` : integer ∈ [0, 10000]               (optional, default 0)
 *
 * Action: UPSERT into `game_configs` (dialect-portable update-then-insert,
 * inside a transaction). Sets `updated_at` to ISO-8601 NOW. Busts the local
 * loader cache for this mode so subsequent `getConfig(mode)` calls on this
 * instance see the new value immediately (§ Decision #10 cache-bust rule).
 *
 * Response 200:
 *   { mode, rounds, round_timer_ms, inter_round_delay_ms, updated_at }
 *
 * Logger emits `{msg: 'game-configs updated', mode, rounds, round_timer_ms,
 * inter_round_delay_ms, actor: 'admin-route'}` for the audit trail.
 */

const express = require('express');
const logger = require('../logger');
const { getDbAdapter } = require('../db');
const { requireSystem } = require('../middleware/auth');
const { VALID_MODES, VALIDATION_BOUNDS } = require('../services/gameConfigDefaults');
const { bustCache } = require('../services/gameConfigLoader');

const router = express.Router();

function isInt(v) {
  return typeof v === 'number' && Number.isInteger(v);
}

function inRange(v, { min, max }) {
  return v >= min && v <= max;
}

/**
 * Validate the request body and produce a normalized config.
 * Returns `{ ok: true, value }` or `{ ok: false, status, body }`.
 */
function validateBody(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, body: { error: 'Invalid body', reason: 'request body must be a JSON object' } };
  }

  const { rounds, round_timer_ms, inter_round_delay_ms } = body;

  if (!isInt(rounds) || !inRange(rounds, VALIDATION_BOUNDS.rounds)) {
    return {
      ok: false,
      status: 400,
      body: { error: 'Invalid rounds', reason: `rounds must be an integer in [${VALIDATION_BOUNDS.rounds.min}, ${VALIDATION_BOUNDS.rounds.max}]` },
    };
  }

  if (!isInt(round_timer_ms) || !inRange(round_timer_ms, VALIDATION_BOUNDS.round_timer_ms)) {
    return {
      ok: false,
      status: 400,
      body: { error: 'Invalid round_timer_ms', reason: `round_timer_ms must be an integer in [${VALIDATION_BOUNDS.round_timer_ms.min}, ${VALIDATION_BOUNDS.round_timer_ms.max}]` },
    };
  }

  // inter_round_delay_ms is optional — default to 0 if omitted (consistent
  // with the schema DEFAULT 0 in migration 008).
  let delay = inter_round_delay_ms;
  if (delay === undefined || delay === null) {
    delay = 0;
  } else if (!isInt(delay) || !inRange(delay, VALIDATION_BOUNDS.inter_round_delay_ms)) {
    return {
      ok: false,
      status: 400,
      body: { error: 'Invalid inter_round_delay_ms', reason: `inter_round_delay_ms must be an integer in [${VALIDATION_BOUNDS.inter_round_delay_ms.min}, ${VALIDATION_BOUNDS.inter_round_delay_ms.max}]` },
    };
  }

  return { ok: true, value: { rounds, round_timer_ms, inter_round_delay_ms: delay } };
}

/**
 * Portable UPSERT (UPDATE then INSERT-if-zero) inside a transaction.
 * Both adapters expose `tx.run` returning `{ changes, lastId }`.
 *
 * We deliberately avoid SQLite's `ON CONFLICT … DO UPDATE` and MSSQL's
 * `MERGE` so the same SQL works on both backends. Update-first means an
 * existing row is updated in place (preserving primary key); insert-on-zero
 * handles first-time writes. Wrapping in a transaction prevents a torn
 * read between the UPDATE and the INSERT under concurrent admin writes
 * (which are vanishingly rare anyway — admin route, not user traffic).
 */
async function upsertConfig(db, { mode, rounds, round_timer_ms, inter_round_delay_ms, updated_at }) {
  await db.transaction(async (tx) => {
    const updateRes = await tx.run(
      'UPDATE game_configs SET rounds = ?, round_timer_ms = ?, inter_round_delay_ms = ?, updated_at = ? WHERE mode = ?',
      [rounds, round_timer_ms, inter_round_delay_ms, updated_at, mode]
    );
    if (!updateRes || !updateRes.changes) {
      await tx.run(
        'INSERT INTO game_configs (mode, rounds, round_timer_ms, inter_round_delay_ms, updated_at) VALUES (?, ?, ?, ?, ?)',
        [mode, rounds, round_timer_ms, inter_round_delay_ms, updated_at]
      );
    }
  });
}

router.put('/:mode', requireSystem, async (req, res, next) => {
  try {
    const { mode } = req.params;

    if (!VALID_MODES.has(mode)) {
      return res.status(400).json({
        error: 'Invalid mode',
        reason: `mode must be one of: ${[...VALID_MODES].join(', ')}`,
      });
    }

    const validation = validateBody(req.body);
    if (!validation.ok) return res.status(validation.status).json(validation.body);

    const { rounds, round_timer_ms, inter_round_delay_ms } = validation.value;
    const updated_at = new Date().toISOString();

    const db = await getDbAdapter();
    await upsertConfig(db, { mode, rounds, round_timer_ms, inter_round_delay_ms, updated_at });

    bustCache(mode);

    logger.info(
      {
        msg: 'game-configs updated',
        mode,
        rounds,
        round_timer_ms,
        inter_round_delay_ms,
        actor: 'admin-route',
      },
      'game-configs updated'
    );

    return res.status(200).json({ mode, rounds, round_timer_ms, inter_round_delay_ms, updated_at });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
