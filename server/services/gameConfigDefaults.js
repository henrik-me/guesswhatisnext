'use strict';

/**
 * CS52-7c — Code-level canonical game-shape defaults.
 *
 * One frozen entry per server-authoritative mode. These are the SOURCE OF
 * TRUTH at boot per CS52 § Decision #4 and § Decision #10:
 *
 *   - The DB-backed `game_configs` table (migration 008) is empty by default;
 *     a row in it is an environment-specific OVERRIDE.
 *   - When no row exists for a mode, `gameConfigLoader.getConfig()` returns
 *     the values below, so a fresh empty DB always boots to a working game.
 *   - Updating a row via the admin route (`PUT /api/admin/game-configs/:mode`)
 *     changes the next session's shape without redeploy. Deleting the row
 *     falls back cleanly to these defaults.
 *
 * Mode keys here also act as the WHITELIST of valid `:mode` values for the
 * admin route — adding a new server-authoritative mode requires adding a
 * row here so the loader has a fallback and the route accepts the path.
 *
 * Design contract:
 *   project/clickstops/active/active_cs52_server-authoritative-scoring.md
 *   § "Key design decisions" #4 (canonical configs) and #10 (DB + fallback).
 */
const GAME_CONFIG_DEFAULTS = Object.freeze({
  ranked_freeplay: Object.freeze({ rounds: 10, round_timer_ms: 15000, inter_round_delay_ms: 0 }),
  ranked_daily: Object.freeze({ rounds: 10, round_timer_ms: 15000, inter_round_delay_ms: 0 }),
  multiplayer: Object.freeze({ rounds: 5, round_timer_ms: 20000, inter_round_delay_ms: 3000 }),
});

/** Set of valid mode keys (whitelist for the admin route). */
const VALID_MODES = Object.freeze(new Set(Object.keys(GAME_CONFIG_DEFAULTS)));

/** Validation bounds for the admin route payload (per CS52 § Decision #10). */
const VALIDATION_BOUNDS = Object.freeze({
  rounds: Object.freeze({ min: 1, max: 50 }),
  round_timer_ms: Object.freeze({ min: 5000, max: 60000 }),
  inter_round_delay_ms: Object.freeze({ min: 0, max: 10000 }),
});

module.exports = { GAME_CONFIG_DEFAULTS, VALID_MODES, VALIDATION_BOUNDS };
