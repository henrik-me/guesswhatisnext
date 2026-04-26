'use strict';

/**
 * CS52-7c — `gameConfigLoader` unit tests.
 *
 * Uses `createLoader({ getDb, now, ttlMs })` with an in-memory fake DB and a
 * controllable clock to verify cache hit/miss/TTL/bust behaviour without
 * spinning up a real adapter.
 */

const { createLoader, GAME_CONFIG_TTL_MS } = require('../server/services/gameConfigLoader');
const { GAME_CONFIG_DEFAULTS } = require('../server/services/gameConfigDefaults');

function makeFakeDb(rows = {}) {
  let getCalls = 0;
  return {
    getCalls: () => getCalls,
    setRow(mode, row) { rows[mode] = row; },
    deleteRow(mode) { delete rows[mode]; },
    adapter: {
      async get(_sql, params) {
        getCalls++;
        const [mode] = params;
        return rows[mode] || null;
      },
    },
  };
}

function makeClock(start = 1700000000000) {
  let t = start;
  return {
    now: () => t,
    advance(ms) { t += ms; },
  };
}

const silentLogger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('gameConfigLoader', () => {
  let fake;
  let clock;
  let loader;

  beforeEach(() => {
    fake = makeFakeDb();
    clock = makeClock();
    loader = createLoader({
      getDb: async () => fake.adapter,
      now: clock.now,
      logger: silentLogger,
      ttlMs: GAME_CONFIG_TTL_MS,
    });
    silentLogger.info.mockClear();
  });

  test('cache hit on second call → no DB read', async () => {
    fake.setRow('ranked_freeplay', { rounds: 7, round_timer_ms: 12000, inter_round_delay_ms: 500, updated_at: '2026-01-01T00:00:00Z' });
    const a = await loader.getConfig('ranked_freeplay');
    const b = await loader.getConfig('ranked_freeplay');
    expect(a).toEqual({ rounds: 7, round_timer_ms: 12000, inter_round_delay_ms: 500 });
    expect(b).toBe(a);
    expect(fake.getCalls()).toBe(1);
  });

  test('cache miss with row → returns row + caches', async () => {
    fake.setRow('multiplayer', { rounds: 3, round_timer_ms: 25000, inter_round_delay_ms: 4000, updated_at: '2026-02-01T00:00:00Z' });
    const cfg = await loader.getConfig('multiplayer');
    expect(cfg).toEqual({ rounds: 3, round_timer_ms: 25000, inter_round_delay_ms: 4000 });
    expect(loader._cacheSize()).toBe(1);
    expect(silentLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'game-configs cache miss', mode: 'multiplayer', source: 'db', updated_at: '2026-02-01T00:00:00Z' }),
      'game-configs cache miss'
    );
  });

  test('cache miss without row → returns code defaults + caches (DB hit only once)', async () => {
    const cfg = await loader.getConfig('ranked_freeplay');
    expect(cfg).toEqual(GAME_CONFIG_DEFAULTS.ranked_freeplay);
    // Second call must NOT hit DB again — defaults are also cached.
    await loader.getConfig('ranked_freeplay');
    expect(fake.getCalls()).toBe(1);
    expect(silentLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'game-configs cache miss', mode: 'ranked_freeplay', source: 'defaults' }),
      'game-configs cache miss'
    );
  });

  test('unknown mode → throws', async () => {
    await expect(loader.getConfig('not_a_mode')).rejects.toThrow(/Unknown game config mode/);
  });

  test('TTL expiry → re-reads from DB', async () => {
    fake.setRow('ranked_daily', { rounds: 10, round_timer_ms: 15000, inter_round_delay_ms: 0, updated_at: '2026-01-01T00:00:00Z' });
    await loader.getConfig('ranked_daily');
    expect(fake.getCalls()).toBe(1);

    // Just under TTL — still cached.
    clock.advance(GAME_CONFIG_TTL_MS - 1);
    await loader.getConfig('ranked_daily');
    expect(fake.getCalls()).toBe(1);

    // Cross the TTL boundary — next read goes to DB again.
    clock.advance(2);
    fake.setRow('ranked_daily', { rounds: 12, round_timer_ms: 18000, inter_round_delay_ms: 0, updated_at: '2026-01-02T00:00:00Z' });
    const fresh = await loader.getConfig('ranked_daily');
    expect(fresh).toEqual({ rounds: 12, round_timer_ms: 18000, inter_round_delay_ms: 0 });
    expect(fake.getCalls()).toBe(2);
  });

  test('bustCache(mode) → next get re-reads', async () => {
    fake.setRow('multiplayer', { rounds: 5, round_timer_ms: 20000, inter_round_delay_ms: 3000, updated_at: '2026-01-01T00:00:00Z' });
    await loader.getConfig('multiplayer');
    expect(fake.getCalls()).toBe(1);

    loader.bustCache('multiplayer');
    fake.setRow('multiplayer', { rounds: 8, round_timer_ms: 22000, inter_round_delay_ms: 1000, updated_at: '2026-01-02T00:00:00Z' });

    const after = await loader.getConfig('multiplayer');
    expect(after).toEqual({ rounds: 8, round_timer_ms: 22000, inter_round_delay_ms: 1000 });
    expect(fake.getCalls()).toBe(2);
  });

  test('bustAllCaches() → clears every entry', async () => {
    await loader.getConfig('ranked_freeplay');
    await loader.getConfig('ranked_daily');
    expect(loader._cacheSize()).toBe(2);
    loader.bustAllCaches();
    expect(loader._cacheSize()).toBe(0);
  });

  test('createLoader requires getDb', () => {
    expect(() => createLoader({})).toThrow(/getDb/);
  });

  test('row deleted then cache busted → falls back to defaults', async () => {
    fake.setRow('ranked_freeplay', { rounds: 7, round_timer_ms: 12000, inter_round_delay_ms: 500, updated_at: '2026-01-01T00:00:00Z' });
    const before = await loader.getConfig('ranked_freeplay');
    expect(before.rounds).toBe(7);

    fake.deleteRow('ranked_freeplay');
    loader.bustCache('ranked_freeplay');
    const after = await loader.getConfig('ranked_freeplay');
    expect(after).toEqual(GAME_CONFIG_DEFAULTS.ranked_freeplay);
  });
});
