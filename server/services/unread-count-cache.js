'use strict';

/**
 * In-process unread-notification-count cache (v2 — Policy 1 compliant).
 *
 * Goal: a stale browser tab (or any client) polling `/api/notifications/count`
 * MUST NOT wake an auto-paused Azure SQL serverless DB. The cache serves
 * counts from memory; the DB is touched only when a request explicitly
 * carries `X-User-Activity: 1` AND the cache misses (see CS53-23).
 *
 * Correctness model:
 *   - Source of truth is the DB.
 *   - Cache lifetime is the process lifetime — there is NO TTL. Re-reading
 *     "just in case" would itself wake an idle DB and violates the
 *     no-DB-waking-background-work policy (INSTRUCTIONS.md § Database & Data).
 *   - Cache is invalidated ONLY by writers (notification insert, mark-read,
 *     mark-all-read). Writers do NOT call `set()` to seed a fresh count
 *     (R4 moved mark-all-read off `set(0)` to avoid a race with concurrent
 *     inserts), so the cache is only populated by user-activity (or
 *     system) reads that miss and recompute from the DB. Cold start
 *     (process restart) therefore means the cache is empty until the
 *     first such read seeds it; until then, header-less /count requests
 *     return the empty default per the boot-quiet contract.
 *   - Per-user GENERATION counter prevents read-vs-write races: a concurrent
 *     writer that fires while a reader is mid-DB-query bumps the gen; the
 *     reader's subsequent `setIfFresh` is rejected because its captured gen
 *     is stale.
 *
 * Single-process only. Scale-out (multiple app instances) requires a shared
 * cache (Redis) and pub/sub invalidation — out of scope here.
 */

/**
 * Coerce an unread-count value to a safe non-negative integer.
 * Avoids `count | 0` which truncates to int32 and silently wraps values
 * above 2^31-1 to negative (then clamped to 0) — Copilot review finding.
 */
function _coerceCount(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.trunc(n);
}

/**
 * Hard cap on the total number of distinct users tracked by either map.
 * In practice the live working set is far smaller than this — typical
 * deployments have hundreds to low-thousands of active users — but the
 * caps below give us a defense-in-depth bound on memory growth in two
 * unbounded-churn scenarios Copilot R8 flagged:
 *
 *  - Many distinct users invalidate (e.g. fan-out notifications) but
 *    never read again — the entry is deleted by `invalidate()` but the
 *    `generations` counter stays, so `generations` grows without bound.
 *  - Many distinct users read once and never again — both `entries` and
 *    `generations` accumulate forever.
 *
 * Eviction strategy is simple FIFO over insertion order (JS Map preserves
 * it). When a cap is hit, evict ~1% of the oldest entries from BOTH maps
 * in lockstep — the orphan-gen pass also walks `generations` for users
 * with no live entry. Evicting a live entry is safe: a future read just
 * recomputes from DB on the next user-activity request, exactly the same
 * as a cold-start cache miss.
 */
const MAX_ENTRIES = 10000;
const EVICT_BATCH = Math.max(1, Math.floor(MAX_ENTRIES / 100));

class UnreadCountCache {
  constructor() {
    this.entries = new Map(); // userId -> count
    this.generations = new Map(); // userId -> monotonic int (bumped on every write)
    this.stats = { hits: 0, misses: 0, invalidations: 0, staleSetsRejected: 0, evictions: 0 };
  }

  /**
   * Begin a read attempt: returns a token the caller must pass back to setIfFresh().
   * Captures the current generation so a concurrent invalidate() can be detected.
   */
  beginRead(userId) {
    return this.generations.get(userId) || 0;
  }

  /** Returns cached count for userId, or null if miss. No TTL — process-lifetime cache. */
  get(userId) {
    if (!this.entries.has(userId)) {
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return this.entries.get(userId);
  }

  /**
   * Conditional set: only stores if the generation matches the token captured
   * at the start of the read. If a writer ran in between, the set is rejected
   * and the cache stays empty so the next user-activity reader recomputes.
   * Returns true on store, false on rejection.
   */
  setIfFresh(userId, count, token) {
    const currentGen = this.generations.get(userId) || 0;
    if (currentGen !== token) {
      this.stats.staleSetsRejected++;
      return false;
    }
    this.entries.set(userId, _coerceCount(count));
    this._evictIfFull();
    return true;
  }

  /**
   * Unconditional set used only by writers that independently know the exact
   * fresh unread count without re-reading the DB. Writers that do not know
   * the exact post-write value (the common case — e.g. mark-all-read after
   * R4, notification insert, mark-single-read) should call `invalidate()`
   * instead, so the next user-activity read recomputes from the DB and
   * avoids the race where a concurrent writer's value gets overwritten by
   * a stale `set(0)`. Bumps the generation so any in-flight reader's
   * `setIfFresh()` will be rejected.
   */
  set(userId, count) {
    this._bumpGen(userId);
    this.entries.set(userId, _coerceCount(count));
    this._evictIfFull();
  }

  /**
   * Invalidate user's cache. Bumps the generation so any in-flight reader's
   * setIfFresh() is rejected. The next user-activity read will recompute from
   * DB; reads without `X-User-Activity: 1` will continue to return 0 from the
   * route layer until a writer or user-activity reader seeds the cache again.
   */
  invalidate(userId) {
    this._bumpGen(userId);
    if (this.entries.delete(userId)) this.stats.invalidations++;
    this._evictIfFull();
  }

  _bumpGen(userId) {
    this.generations.set(userId, (this.generations.get(userId) || 0) + 1);
  }

  /**
   * Bounded-size eviction (Copilot R8). Called from every mutation path so
   * unbounded-churn workloads (fan-out invalidates to many distinct users,
   * read-once users) can't grow either map without limit. FIFO over insertion
   * order; orphan-gen pass cleans up generations whose entry has already been
   * deleted by `invalidate()`.
   */
  _evictIfFull() {
    if (this.entries.size > MAX_ENTRIES) {
      let i = 0;
      for (const userId of this.entries.keys()) {
        this.entries.delete(userId);
        this.generations.delete(userId);
        this.stats.evictions++;
        if (++i >= EVICT_BATCH) break;
      }
    }
    // Cap orphan generations too — invalidate() leaves a gen counter behind
    // even after the entry is gone (so in-flight readers' setIfFresh stays
    // race-correct). Cap at 2× MAX_ENTRIES to leave headroom for in-flight
    // races, then evict orphans (no live entry) in FIFO order.
    if (this.generations.size > MAX_ENTRIES * 2) {
      let i = 0;
      for (const userId of this.generations.keys()) {
        if (this.entries.has(userId)) continue;
        this.generations.delete(userId);
        this.stats.evictions++;
        if (++i >= EVICT_BATCH) break;
      }
    }
  }

  /** Test helper: clear everything. */
  clear() {
    this.entries.clear();
    this.generations.clear();
    this.stats = { hits: 0, misses: 0, invalidations: 0, staleSetsRejected: 0, evictions: 0 };
  }

  /** Diagnostic snapshot. */
  snapshot() {
    return { size: this.entries.size, generationsSize: this.generations.size, ...this.stats };
  }
}

const singleton = new UnreadCountCache();

module.exports = {
  UnreadCountCache,
  unreadCountCache: singleton,
  coerceUnreadCount: _coerceCount,
};
