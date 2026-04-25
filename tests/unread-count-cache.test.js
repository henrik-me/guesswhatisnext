/**
 * Unit tests for the in-process unread-notification-count cache.
 */

const { UnreadCountCache } = require('../server/services/unread-count-cache');

describe('UnreadCountCache', () => {
  let cache;
  beforeEach(() => {
    cache = new UnreadCountCache({ ttlMs: 1000 });
  });

  test('miss on empty', () => {
    expect(cache.get(1)).toBeNull();
    expect(cache.snapshot().misses).toBe(1);
  });

  test('hit after set', () => {
    cache.set(1, 3);
    expect(cache.get(1)).toBe(3);
    expect(cache.snapshot().hits).toBe(1);
  });

  test('TTL expiry returns null', async () => {
    const c = new UnreadCountCache({ ttlMs: 20 });
    c.set(1, 5);
    await new Promise(r => setTimeout(r, 30));
    expect(c.get(1)).toBeNull();
  });

  test('invalidate removes entry', () => {
    cache.set(1, 7);
    cache.invalidate(1);
    expect(cache.get(1)).toBeNull();
    expect(cache.snapshot().invalidations).toBe(1);
  });

  test('invalidate is no-op for missing key', () => {
    cache.invalidate(99);
    expect(cache.snapshot().invalidations).toBe(0);
  });

  test('set coerces and clamps negative counts to 0', () => {
    cache.set(1, -5);
    expect(cache.get(1)).toBe(0);
  });

  test('set coerces non-integer to int', () => {
    cache.set(1, 3.7);
    expect(cache.get(1)).toBe(3);
  });

  test('per-user isolation', () => {
    cache.set(1, 2);
    cache.set(2, 9);
    expect(cache.get(1)).toBe(2);
    expect(cache.get(2)).toBe(9);
    cache.invalidate(1);
    expect(cache.get(1)).toBeNull();
    expect(cache.get(2)).toBe(9);
  });

  test('clear resets state and stats', () => {
    cache.set(1, 1);
    cache.get(1);
    cache.clear();
    expect(cache.snapshot()).toEqual({ size: 0, hits: 0, misses: 0, invalidations: 0, staleSetsRejected: 0 });
  });

  test('setIfFresh stores when generation matches token', () => {
    const tok = cache.beginRead(1);
    expect(cache.setIfFresh(1, 5, tok)).toBe(true);
    expect(cache.get(1)).toBe(5);
  });

  test('setIfFresh REJECTS stale write after concurrent invalidate', () => {
    // Reader captures gen, then writer invalidates BEFORE reader stores.
    const tok = cache.beginRead(1);
    cache.invalidate(1); // bumps gen
    const stored = cache.setIfFresh(1, 99, tok);
    expect(stored).toBe(false);
    expect(cache.get(1)).toBeNull();
    expect(cache.snapshot().staleSetsRejected).toBe(1);
  });

  test('setIfFresh REJECTS stale write after concurrent set (mark-all-read)', () => {
    const tok = cache.beginRead(1);
    cache.set(1, 0); // mark-all-read writes fresh value
    const stored = cache.setIfFresh(1, 7, tok);
    expect(stored).toBe(false);
    expect(cache.get(1)).toBe(0); // fresh value preserved
  });

  test('multiple concurrent readers: only first-finishing wins, stale ones rejected', () => {
    // Reader A captures gen=0
    const tokA = cache.beginRead(1);
    // Reader B captures gen=0 too
    const tokB = cache.beginRead(1);
    // A finishes first and stores 3
    expect(cache.setIfFresh(1, 3, tokA)).toBe(true);
    // Writer fires (e.g. notification insert)
    cache.invalidate(1);
    // B finishes with stale data (was scheduled before invalidate)
    expect(cache.setIfFresh(1, 3, tokB)).toBe(false);
    expect(cache.get(1)).toBeNull();
  });
});
