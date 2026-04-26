'use strict';

/**
 * CS52-7c — DB-backed `game_configs` loader with in-process cache.
 *
 * Per CS52 § Decision #10:
 *   - In-process `Map<mode, { config, cachedAt }>` cache.
 *   - 24h TTL — these tunables change rarely; multi-instance propagation
 *     is deferred until horizontal scale (operator caveat documented).
 *   - On cache miss: read row from `game_configs` WHERE mode=:mode.
 *     If a row exists → cache + return. If no row → return the code-level
 *     default from `GAME_CONFIG_DEFAULTS` (also cached so subsequent reads
 *     don't re-hit the DB) so a fresh empty DB always boots to a working
 *     game (§ Decision #10 fallback rule).
 *   - Mode not in defaults at all → throw (unknown mode is a programming
 *     error, not a runtime override).
 *   - `bustCache(mode)` invalidates a single entry; the admin route calls
 *     this on UPSERT so operators see their change take effect immediately
 *     on the same instance (§ Decision #10 cache-bust rule).
 *   - `bustAllCaches()` clears the whole map (tests, "force reload").
 *   - No background timer: cache fills lazily on read.
 *
 * Logger emits `{msg: 'game-configs cache miss', mode, source, updated_at?}`
 * on every cache fill so operators can observe propagation across revisions
 * (§ Decision #10 operator caveat: 30s revision overlap during deploys).
 *
 * The exported singleton is wired to the shared `getDbAdapter()` and
 * `Date.now`. Tests can construct an isolated loader via `createLoader({
 * getDb, now, logger, ttlMs })` to inject a fake clock + mock db.
 *
 * Consumers (CS52-3 ranked sessions, CS52-7b multiplayer):
 *   const { getConfig } = require('./services/gameConfigLoader');
 *   const cfg = await getConfig('ranked_freeplay');
 *   // cfg = { rounds, round_timer_ms, inter_round_delay_ms }
 */

const logger = require('../logger');
const { getDbAdapter } = require('../db');
const { GAME_CONFIG_DEFAULTS } = require('./gameConfigDefaults');

const GAME_CONFIG_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Build a loader bound to a specific db getter, clock, logger, and TTL.
 * The default singleton at the bottom of this file is the production wiring;
 * tests use this factory to inject fakes.
 *
 * @param {Object} opts
 * @param {() => Promise<import('../db/base-adapter')>} opts.getDb - async db
 *   accessor. Called on every cache miss.
 * @param {() => number} [opts.now] - clock (defaults to Date.now). TTL math
 *   uses `now()` so tests can advance time without real timers.
 * @param {Object} [opts.logger] - pino-shaped logger (defaults to shared).
 * @param {number} [opts.ttlMs] - cache TTL (defaults to 24h).
 * @returns {{getConfig: (mode: string) => Promise<{rounds:number,round_timer_ms:number,inter_round_delay_ms:number}>,
 *            bustCache: (mode: string) => void,
 *            bustAllCaches: () => void,
 *            _cacheSize: () => number}}
 */
function createLoader({ getDb, now = Date.now, logger: log = logger, ttlMs = GAME_CONFIG_TTL_MS } = {}) {
  if (typeof getDb !== 'function') {
    throw new Error('createLoader requires opts.getDb (async function returning a db adapter)');
  }

  /** @type {Map<string, {config: object, cachedAt: number}>} */
  const cache = new Map();

  function isFresh(entry) {
    return entry && (now() - entry.cachedAt) < ttlMs;
  }

  /**
   * Resolve the active config for `mode`.
   * @param {string} mode
   * @returns {Promise<{rounds:number,round_timer_ms:number,inter_round_delay_ms:number}>}
   * @throws {Error} if `mode` is not a known server-authoritative mode.
   */
  async function getConfig(mode) {
    const cached = cache.get(mode);
    if (isFresh(cached)) return cached.config;

    const defaults = GAME_CONFIG_DEFAULTS[mode];
    if (!defaults) {
      // Unknown mode: not in defaults → not a valid server-authoritative
      // mode. Treat as programming error (consumers should pass a literal
      // from GAME_CONFIG_DEFAULTS keys).
      throw new Error(`Unknown game config mode: ${mode}`);
    }

    const db = await getDb();
    const row = await db.get(
      'SELECT rounds, round_timer_ms, inter_round_delay_ms, updated_at FROM game_configs WHERE mode = ?',
      [mode]
    );

    let config;
    let source;
    let updatedAt;
    if (row) {
      config = Object.freeze({
        rounds: row.rounds,
        round_timer_ms: row.round_timer_ms,
        inter_round_delay_ms: row.inter_round_delay_ms,
      });
      source = 'db';
      updatedAt = row.updated_at;
    } else {
      config = defaults;
      source = 'defaults';
    }

    cache.set(mode, { config, cachedAt: now() });
    log.info(
      { msg: 'game-configs cache miss', mode, source, ...(updatedAt ? { updated_at: updatedAt } : {}) },
      'game-configs cache miss'
    );
    return config;
  }

  function bustCache(mode) {
    cache.delete(mode);
  }

  function bustAllCaches() {
    cache.clear();
  }

  return { getConfig, bustCache, bustAllCaches, _cacheSize: () => cache.size };
}

// Default singleton — wired to the shared db adapter.
const singleton = createLoader({ getDb: () => getDbAdapter() });

module.exports = {
  createLoader,
  GAME_CONFIG_TTL_MS,
  getConfig: singleton.getConfig,
  bustCache: singleton.bustCache,
  bustAllCaches: singleton.bustAllCaches,
};
