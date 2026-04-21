# CS42 — Production Cold Start Progressive Messages

**Status:** 🔄 In Progress
**Goal:** Investigate and fix why progressive loading messages (friendly "waking up the database" UX) appear during local cold-start testing but not in production when Azure SQL is auto-paused.

---

## Investigation Findings (CS42-1)

### Root Cause: Service Worker Stale Cache

The progressive loading messages **do exist in the deployed code** — production has the current `progressive-loader.js` and `app.js`. The problem is the **service worker** (`public/sw.js`) serves a **stale cached version** of `app.js` from before CS38.

**Evidence:**
1. The text the user sees ("Leaderboard unavailable — start the server to see rankings") was **removed** in CS38 (commit `62edc68`). It existed in the original `app.js` (commit `677814e`) but was replaced by ProgressiveLoader.
2. Production serves the correct current files:
   - `curl -s https://gwn.metzger.dk/js/progressive-loader.js` → contains ProgressiveLoader with MESSAGE_SETS
   - `curl -s https://gwn.metzger.dk/js/app.js` → contains `progressiveLoad()` calls, no "start the server" text
3. The service worker cache name is `gwn-v2` (`public/sw.js:6`) and has **never been bumped** since it was created (commit `92f515e`, Phase 8). The service worker uses **cache-first** for static assets (`sw.js:92`), so returning users get the old cached `app.js` from their browser's service worker cache.
4. The `STATIC_ASSETS` list (`sw.js:7-31`) includes `/js/app.js` — this is pre-cached on install and served from cache on subsequent visits.

**Why local works:** Local development doesn't use the service worker (or uses a fresh one each time). The MSSQL Docker stack serves files directly without caching.

**Why production doesn't work for returning users:** The service worker installed `gwn-v2` cache on a previous visit with the old `app.js`. On return, the service worker intercepts the request for `/js/app.js` and serves the cached (pre-CS38) version — which has the old "Leaderboard unavailable" error handling instead of ProgressiveLoader.

**Why new/incognito users would see it correctly:** No service worker cache → browser fetches fresh files → ProgressiveLoader works. But the ProgressiveLoader itself has a separate issue (503 auto-retry, documented below) that would also need fixing.

### Secondary Issue: 503 Auto-Retry (affects new users)

Even after fixing the cache, new users hitting production during Azure SQL cold start would still have a suboptimal experience:
- Server returns 503 immediately when DB not initialized (`server/app.js:176-177`)
- ProgressiveLoader gets fast error → escalation timers cleared → Retry button shown immediately
- User never sees the friendly escalation messages ("coffee break ☕", "waking up database 😴")
- This is because `maxRetries: 0` and the catch block clears timers on any error

This is the issue analyzed in the previous investigation — still valid but secondary to the cache problem.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS42-1 | Investigate: why progressive messages don't appear in production | ✅ Done | Root cause: service worker stale cache serving pre-CS38 app.js. Secondary: 503 auto-retry needed for new users. |
| CS42-2 | Fix service worker cache versioning | ⬜ Pending | Bump `CACHE_NAME` from `gwn-v2` to `gwn-v3` (or implement hash-based versioning). Old cache is purged on activate. |
| CS42-3 | Fix ProgressiveLoader 503 auto-retry | ⬜ Pending | Auto-retry on 503 with escalation timers kept running (Option A from analysis below). |
| CS42-4 | Add cache-busting strategy | ⬜ Pending | Prevent this from happening again — consider versioned filenames, ETag-based revalidation, or bumping CACHE_NAME on every deploy. |
| CS42-5 | Validate in production | ⬜ Pending | Deploy, clear service worker in browser, verify progressive messages appear during Azure SQL cold start. |

---

## Fix Options (CS42-2)

### Option A: ProgressiveLoader auto-retries on 503 (recommended)
When `fetchFn` throws and the error is from a 503 response, don't count it as a failed attempt — instead, auto-retry with the progressive messages still running. The escalation timers stay active across retries, so users see the full message sequence ("Fetching the rankings..." → "coffee break ☕" → "Waking up the database 😴") while the loader silently retries in the background.

Implementation sketch:
```javascript
// In fetchFn (app.js), throw a typed error for 503
if (res.status === 503) throw new RetryableError('Server warming up');

// In progressiveLoad, catch RetryableError separately:
// - Don't increment attempt counter
// - Don't clear escalation timers
// - Wait 2-3s, then retry fetchFn
// - Only give up after total elapsed time exceeds timeout (15s default)
```

- **Pro:** Client-side only, no server changes, progressive messages work naturally during retries, generic for any 503
- **Con:** Need to distinguish 503 from other errors in the catch block. The server already returns `{ retryAfter: 5 }` in the 503 body — can use that as a signal.

### Option B: Server holds requests during DB warmup
Instead of returning 503 immediately, queue incoming requests and wait for DB init to complete (with a timeout). Server responds once DB is ready or times out.
- **Pro:** Client code unchanged, progressive messages work naturally (fetch stays pending)
- **Con:** Complex server change, risk of connection piling up during long warmups, changes behavior for all clients, doesn't work if Azure SQL takes 30s+ to resume

### Option C: Hybrid — server returns 503 with Retry-After header, client respects it
Server already returns `retryAfter: 5` in the 503 JSON body (`server/app.js:173,177`). Add the `Retry-After` HTTP header too. ProgressiveLoader checks for 503 + Retry-After and auto-retries.
- **Pro:** Standard HTTP semantics, server already has the signal in the body
- **Con:** Requires both client and server changes for essentially the same result as Option A

**Recommendation: Option A** — simplest, client-only, and the server's 503 response already distinguishes "warming up" from other errors. The key insight is: don't clear the escalation timers on a 503 retry — let them keep running so the user sees the friendly messages while the loader retries silently.

---

## Design Considerations
- Azure SQL auto-pause resume takes 10-30s — the ProgressiveLoader's 15s default timeout may not be enough. Consider increasing the effective timeout during 503 retries (e.g., 30s total for warming-up scenarios).
- The existing `SYNC_BACKOFF=[1000,3000,9000]` in score sync (`progressive-loader.js:105`) shows the loader already supports backoff for score submission — similar pattern applies here.
- Whatever fix is chosen must not break the local delay middleware testing (which already works — delay holds the request pending, no 503 involved).
- The fix should be generic enough to handle any transient 503 (not just DB warmup).
