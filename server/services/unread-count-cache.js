'use strict';

/**
 * In-process unread-notification-count cache.
 *
 * Goal: a stale browser tab (or any client) polling `/api/notifications/count`
 * MUST NOT wake an auto-paused Azure SQL serverless DB. The cache serves
 * counts from memory, so polls only hit the DB on a cache miss.
 *
 * Correctness model:
 *   - Source of truth is the DB.
 *   - Writers (notification insert, mark-read, mark-all-read) call invalidate()
 *     so the next read recomputes from DB.
 *   - Per-user GENERATION counter prevents read-vs-write races: a concurrent
 *     writer that fires while a reader is mid-DB-query bumps the gen; the
 *     reader's subsequent `set` is rejected because its captured gen is stale.
 *   - TTL is a safety net only (e.g. process restart on another node, missed
 *     invalidation). Default 5 minutes.
 *
 * Single-process only. Scale-out (multiple app instances) requires a shared
 * cache (Redis) and pub/sub invalidation — out of scope here.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000;

class UnreadCountCache {
  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    this.ttlMs = ttlMs;
    this.entries = new Map(); // userId -> { count, expiresAt }
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

  /** Returns cached count for userId, or null if miss/expired. */
  get(userId) {
    const e = this.entries.get(userId);
    if (!e) {
      this.stats.misses++;
      return null;
    }
    if (Date.now() > e.expiresAt) {
      this.entries.delete(userId);
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return e.count;
  }

  /**
   * Conditional set: only stores if the generation matches the token captured
   * at the start of the read. If a writer ran in between, the set is rejected
   * and the cache stays empty so the next reader recomputes.
   * Returns true on store, false on rejection.
   */
  setIfFresh(userId, count, token) {
    const currentGen = this.generations.get(userId) || 0;
    if (currentGen !== token) {
      this.stats.staleSetsRejected++;
      return false;
    }
    this.entries.set(userId, {
      count: Math.max(0, count | 0),
      expiresAt: Date.now() + this.ttlMs,
    });
    return true;
  }

  /**
   * Unconditional set used by writers that KNOW the fresh value
   * (e.g. mark-all-read knows the count is now 0). Bumps the generation
   * so any in-flight reader's setIfFresh() will be rejected.
   */
  set(userId, count) {
    this._bumpGen(userId);
    this.entries.set(userId, {
      count: Math.max(0, count | 0),
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /** Invalidate user's cache (next read will recompute from DB). */
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
