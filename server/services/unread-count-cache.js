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
 *     mark-all-read). Cold start (process restart) means the cache is empty
 *     until either (a) the first writer runs, seeding implicitly, or (b) a
 *     user-activity-marked read seeds it from the DB.
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

class UnreadCountCache {
  constructor() {
    this.entries = new Map(); // userId -> count
    this.generations = new Map(); // userId -> monotonic int (bumped on every write)
    this.stats = { hits: 0, misses: 0, invalidations: 0, staleSetsRejected: 0 };
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
    return true;
  }

  /**
   * Unconditional set used by writers that KNOW the fresh value
   * (e.g. mark-all-read knows the count is now 0). Bumps the generation
   * so any in-flight reader's setIfFresh() will be rejected.
   */
  set(userId, count) {
    this._bumpGen(userId);
    this.entries.set(userId, _coerceCount(count));
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
  }

  _bumpGen(userId) {
    this.generations.set(userId, (this.generations.get(userId) || 0) + 1);
  }

  /** Test helper: clear everything. */
  clear() {
    this.entries.clear();
    this.generations.clear();
    this.stats = { hits: 0, misses: 0, invalidations: 0, staleSetsRejected: 0 };
  }

  /** Diagnostic snapshot. */
  snapshot() {
    return { size: this.entries.size, ...this.stats };
  }
}

const singleton = new UnreadCountCache();

module.exports = {
  UnreadCountCache,
  unreadCountCache: singleton,
};
