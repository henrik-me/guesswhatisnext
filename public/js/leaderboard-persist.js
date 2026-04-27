/**
 * CS52-followup-1+2 — Leaderboard view-state persistence.
 *
 * Persists the user's three leaderboard tab selections (mode, source,
 * period) to localStorage so the last view is restored when they
 * re-open the leaderboard. Keys validate against an allow-list before
 * being trusted, so a corrupted/spoofed localStorage value falls back
 * to the documented default.
 *
 * Exported as a tiny, pure-data module so it can be unit-tested
 * without standing up a DOM.
 */

export const LEADERBOARD_MODE_KEY = 'gwn_lb_mode';
export const LEADERBOARD_SOURCE_KEY = 'gwn_lb_source';
export const LEADERBOARD_PERIOD_KEY = 'gwn_lb_period';

export const VALID_LB_MODES = new Set(['freeplay', 'daily', 'multiplayer']);
export const VALID_LB_SOURCES = new Set(['ranked', 'offline', 'all']);
export const VALID_LB_PERIODS = new Set(['alltime', 'weekly', 'daily']);

export const DEFAULT_LB_MODE = 'freeplay';
// CS52-followup-1: default `all` (was `ranked` per CS52-6 § Decision #6) so
// new users see their own Practice scores on the LB on first load.
export const DEFAULT_LB_SOURCE = 'all';
export const DEFAULT_LB_PERIOD = 'alltime';

/**
 * Read a stored LB selection. Returns the fallback if storage is
 * unavailable, the value is missing, or the value is not in the
 * allow-list.
 *
 * @param {string} key        one of the LEADERBOARD_*_KEY exports
 * @param {Set<string>} validSet  one of the VALID_LB_* exports
 * @param {string} fallback   the default to return when no valid value is stored
 * @param {Storage} [storage]  optional Storage; defaults to globalThis.localStorage
 *                             (set explicitly in tests).
 */
export function loadStoredLb(key, validSet, fallback, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage) return fallback;
  try {
    const stored = storage.getItem(key);
    return validSet.has(stored) ? stored : fallback;
  } catch { return fallback; }
}

/**
 * Persist a selection. Swallows storage errors (storage full or
 * unavailable) so the in-memory selection still applies for the
 * current session.
 *
 * @param {string} key
 * @param {string} value
 * @param {Storage} [storage]
 */
export function persistLb(key, value, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage) return;
  try { storage.setItem(key, value); }
  catch { /* selection is in-memory only this session */ }
}
