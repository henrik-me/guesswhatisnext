/**
 * Unit tests for the in-process unread-notification-count cache.
 */

const { UnreadCountCache } = require('../server/services/unread-count-cache');

describe('UnreadCountCache', () => {
  let cache;
  beforeEach(() => {
    cache = new UnreadCountCache();
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

  test('cache lifetime is process lifetime — no TTL re-read', () => {
    // Process-lifetime cache: repeated get() always hits, never expires.
    // The class has no TTL/timer machinery, so a tight-loop assertion is
    // sufficient — there is no time-based code path that could evict the entry.
    // (Replaces the v1 5-min-TTL test removed for Policy 1 compliance — CS53-23.A.)
    cache.set(1, 5);
    expect(cache.get(1)).toBe(5);
    expect(cache.get(1)).toBe(5);
    expect(cache.get(1)).toBe(5);
    expect(cache.snapshot().hits).toBe(3);
    expect(cache.snapshot().misses).toBe(0);
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
    expect(cache.snapshot()).toEqual({ size: 0, generationsSize: 0, hits: 0, misses: 0, invalidations: 0, staleSetsRejected: 0, evictions: 0 });
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

  test('writer-vs-reader precedence: invalidate between concurrent reader stores rejects the later one', () => {
    // Two readers both captured the same generation before any writer ran.
    const tokA = cache.beginRead(1);
    const tokB = cache.beginRead(1);
    // Reader A's setIfFresh wins because no writer has bumped the generation yet.
    expect(cache.setIfFresh(1, 3, tokA)).toBe(true);
    // A writer fires between the two stores (e.g. notification insert) and
    // bumps the generation via invalidate().
    cache.invalidate(1);
    // Reader B's setIfFresh is now stale (its captured gen != current gen)
    // and is rejected, so the cache stays empty until the next user-activity
    // reader recomputes — preventing a stale reader from clobbering the
    // writer's invalidation.
    expect(cache.setIfFresh(1, 3, tokB)).toBe(false);
    expect(cache.get(1)).toBeNull();
  });

  test('bounded eviction: entries map cannot grow unbounded under read-once-many-users churn', () => {
    // CS53-23 R8 — long-lived process with many distinct users must not
    // accumulate cache entries forever. Cap is enforced by FIFO eviction
    // on every set / setIfFresh / invalidate.
    const { MAX_ENTRIES } = require('../server/services/unread-count-cache');
    const N = MAX_ENTRIES + 500;
    for (let i = 1; i <= N; i++) {
      cache.set(i, i);
    }
    const snap = cache.snapshot();
    expect(snap.size).toBeLessThanOrEqual(MAX_ENTRIES);
    expect(snap.evictions).toBeGreaterThan(0);
    // The most-recently-inserted entry must still be present (FIFO evicts
    // oldest first).
    expect(cache.get(N)).toBe(N);
  });

  test('bounded eviction: orphan generations from invalidate-only churn get cleaned up', () => {
    // CS53-23 R8 — a workload that only ever fans out invalidate() calls
    // for distinct users (e.g. notification-insert hot path) used to leak
    // gen counters forever. Cap on generations.size triggers orphan eviction.
    const { MAX_ENTRIES } = require('../server/services/unread-count-cache');
    const cap = MAX_ENTRIES * 2;
    const N = cap + 1000;
    for (let i = 1; i <= N; i++) {
      // Bump the gen via invalidate without first setting (entry stays absent).
      cache.invalidate(i);
    }
    const snap = cache.snapshot();
    expect(snap.generationsSize).toBeLessThanOrEqual(cap);
    expect(snap.evictions).toBeGreaterThan(0);
  });

  test('R9 — eviction does NOT silently accept stale stores from in-flight readers', () => {
    // Copilot R9 correctness finding: under the previous implementation,
    // beginRead returned 0 when no gen entry existed, and eviction could
    // delete a gen entry making `generations.get(userId) || 0` default
    // back to 0 — so a reader holding a token=0 captured pre-bump could
    // incorrectly match the post-eviction default and commit a stale value.
    //
    // The fix:
    //   1. beginRead lazily seeds with a globally monotonic _nextGen, so
    //      tokens are NEVER 0.
    //   2. setIfFresh rejects when currentGen === undefined, not just when
    //      it doesn't match the token.
    //
    // This test reproduces the original race: capture a token, simulate
    // a writer + an eviction that drops the gen entry, then attempt
    // setIfFresh — must be REJECTED.
    const tok = cache.beginRead(1);
    expect(tok).toBeGreaterThan(0); // (1) tokens are never 0

    // Simulate writer + eviction by dropping the gen entry directly
    // (mirrors what _evictIfFull would do for an orphan).
    cache.invalidate(1);
    cache.generations.delete(1);

    // (2) Attempt to commit with the original token — must be rejected.
    expect(cache.setIfFresh(1, 99, tok)).toBe(false);
    expect(cache.get(1)).toBeNull();
  });
});
