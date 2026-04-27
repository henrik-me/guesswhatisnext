/**
 * CS52-followup-1+2 — Leaderboard view-state persistence unit tests.
 *
 * Covers the small persistence helpers extracted into
 * public/js/leaderboard-persist.js so they can be tested without
 * standing up the full app.js (which is a top-level module not
 * easily importable in vitest).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  LEADERBOARD_MODE_KEY, LEADERBOARD_SOURCE_KEY, LEADERBOARD_PERIOD_KEY,
  VALID_LB_MODES, VALID_LB_SOURCES, VALID_LB_PERIODS,
  DEFAULT_LB_MODE, DEFAULT_LB_SOURCE, DEFAULT_LB_PERIOD,
  loadStoredLb, persistLb,
} from '../public/js/leaderboard-persist.js';

/** Minimal Storage stand-in. Only the two methods the helper uses. */
function makeMemoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    _data: data,
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; },
  };
}

/** Storage that throws on getItem/setItem (e.g. private mode quota). */
function makeBrokenStorage() {
  return {
    getItem() { throw new Error('storage broken'); },
    setItem() { throw new Error('storage broken'); },
  };
}

describe('CS52-followup-1+2 leaderboard persistence', () => {
  describe('defaults', () => {
    it('exports the expected default tab (mode, source, period)', () => {
      expect(DEFAULT_LB_MODE).toBe('freeplay');
      // Per user feedback (vs CS52-6 § Decision #6 which had ranked).
      expect(DEFAULT_LB_SOURCE).toBe('all');
      expect(DEFAULT_LB_PERIOD).toBe('alltime');
    });

    it('defaults are themselves in their respective allow-lists', () => {
      expect(VALID_LB_MODES.has(DEFAULT_LB_MODE)).toBe(true);
      expect(VALID_LB_SOURCES.has(DEFAULT_LB_SOURCE)).toBe(true);
      expect(VALID_LB_PERIODS.has(DEFAULT_LB_PERIOD)).toBe(true);
    });

    it('keys use distinct localStorage namespaces', () => {
      const keys = new Set([LEADERBOARD_MODE_KEY, LEADERBOARD_SOURCE_KEY, LEADERBOARD_PERIOD_KEY]);
      expect(keys.size).toBe(3);
      // All under the gwn_lb_ prefix so a wipe of LB-related state is greppable.
      for (const k of keys) {
        expect(k).toMatch(/^gwn_lb_/);
      }
    });
  });

  describe('loadStoredLb', () => {
    let storage;
    beforeEach(() => { storage = makeMemoryStorage(); });

    it('returns the stored value when valid', () => {
      storage.setItem(LEADERBOARD_SOURCE_KEY, 'ranked');
      expect(loadStoredLb(LEADERBOARD_SOURCE_KEY, VALID_LB_SOURCES, DEFAULT_LB_SOURCE, storage)).toBe('ranked');
    });

    it('returns the fallback when no value is stored', () => {
      expect(loadStoredLb(LEADERBOARD_SOURCE_KEY, VALID_LB_SOURCES, DEFAULT_LB_SOURCE, storage)).toBe('all');
    });

    it('returns the fallback when the stored value is not in the allow-list (corrupted)', () => {
      storage.setItem(LEADERBOARD_SOURCE_KEY, 'something-spoofed');
      expect(loadStoredLb(LEADERBOARD_SOURCE_KEY, VALID_LB_SOURCES, DEFAULT_LB_SOURCE, storage)).toBe('all');
    });

    it('returns the fallback when storage throws (e.g. private mode quota error)', () => {
      const broken = makeBrokenStorage();
      expect(loadStoredLb(LEADERBOARD_PERIOD_KEY, VALID_LB_PERIODS, DEFAULT_LB_PERIOD, broken)).toBe('alltime');
    });

    it('returns the fallback when storage is null/undefined', () => {
      expect(loadStoredLb(LEADERBOARD_MODE_KEY, VALID_LB_MODES, DEFAULT_LB_MODE, null)).toBe('freeplay');
    });

    it('validates each allow-list independently (mode vs source vs period)', () => {
      // A stored value valid for one set should NOT be accepted for another.
      storage.setItem(LEADERBOARD_MODE_KEY, 'ranked');     // 'ranked' is a source value
      storage.setItem(LEADERBOARD_SOURCE_KEY, 'freeplay'); // 'freeplay' is a mode value
      storage.setItem(LEADERBOARD_PERIOD_KEY, 'all');      // 'all' is a source value

      expect(loadStoredLb(LEADERBOARD_MODE_KEY, VALID_LB_MODES, DEFAULT_LB_MODE, storage)).toBe('freeplay');
      expect(loadStoredLb(LEADERBOARD_SOURCE_KEY, VALID_LB_SOURCES, DEFAULT_LB_SOURCE, storage)).toBe('all');
      expect(loadStoredLb(LEADERBOARD_PERIOD_KEY, VALID_LB_PERIODS, DEFAULT_LB_PERIOD, storage)).toBe('alltime');
    });
  });

  describe('persistLb', () => {
    it('writes the value to storage', () => {
      const storage = makeMemoryStorage();
      persistLb(LEADERBOARD_SOURCE_KEY, 'ranked', storage);
      expect(storage._data[LEADERBOARD_SOURCE_KEY]).toBe('ranked');
    });

    it('overwrites any existing value', () => {
      const storage = makeMemoryStorage({ [LEADERBOARD_SOURCE_KEY]: 'all' });
      persistLb(LEADERBOARD_SOURCE_KEY, 'offline', storage);
      expect(storage._data[LEADERBOARD_SOURCE_KEY]).toBe('offline');
    });

    it('swallows storage errors silently (does not throw)', () => {
      const broken = makeBrokenStorage();
      expect(() => persistLb(LEADERBOARD_PERIOD_KEY, 'weekly', broken)).not.toThrow();
    });

    it('no-ops when storage is null/undefined', () => {
      expect(() => persistLb(LEADERBOARD_MODE_KEY, 'daily', null)).not.toThrow();
    });
  });

  describe('round-trip per tab', () => {
    it.each([
      ['mode',   LEADERBOARD_MODE_KEY,   VALID_LB_MODES,   DEFAULT_LB_MODE,   'daily'],
      ['mode',   LEADERBOARD_MODE_KEY,   VALID_LB_MODES,   DEFAULT_LB_MODE,   'multiplayer'],
      ['source', LEADERBOARD_SOURCE_KEY, VALID_LB_SOURCES, DEFAULT_LB_SOURCE, 'ranked'],
      ['source', LEADERBOARD_SOURCE_KEY, VALID_LB_SOURCES, DEFAULT_LB_SOURCE, 'offline'],
      ['period', LEADERBOARD_PERIOD_KEY, VALID_LB_PERIODS, DEFAULT_LB_PERIOD, 'weekly'],
      ['period', LEADERBOARD_PERIOD_KEY, VALID_LB_PERIODS, DEFAULT_LB_PERIOD, 'daily'],
    ])('persists %s=%s round-trip', (_label, key, allowed, fallback, value) => {
      const storage = makeMemoryStorage();
      persistLb(key, value, storage);
      expect(loadStoredLb(key, allowed, fallback, storage)).toBe(value);
    });
  });
});
