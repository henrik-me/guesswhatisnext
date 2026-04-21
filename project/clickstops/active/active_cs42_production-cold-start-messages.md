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
| CS42-1 | Investigate: why progressive messages don't appear in production | ✅ Done | Root cause: service worker stale cache serving pre-CS38 `app.js`. Secondary: 503 auto-retry needed for new users. |
| CS42-2 | Fix service worker cache versioning (immediate unblock) | ⬜ Pending | Bump `CACHE_NAME` `gwn-v2` → `gwn-v3` in `public/sw.js`. Existing `activate` handler (`sw.js:42-47`) already purges old `gwn-*` caches — keep as-is. Add unit test covering activate-handler purge logic via a mocked `caches` API (no full SW harness). Deployable independently of CS42-3/4. |
| CS42-3 | ProgressiveLoader 503 auto-retry | ⬜ Pending | Option A (client-only). Detect `res.status === 503` at each `progressiveLoad` fetchFn call site (`public/js/app.js` ×4) and throw a typed `RetryableError { retryAfter }`. In `progressive-loader.js`, catch `RetryableError` separately: **do not** increment `attempt`, **do not** clear escalation timers, sleep `retryAfter` seconds (capped 2–8s; body `retryAfter` or header `Retry-After`), re-run `fetchFn`. Enforce a total warmup window of 35s (covers Azure SQL 10–30s resume) before falling through to the existing retry-button path. Unit tests added to `progressive-loader.test.js`. |
| CS42-4 | Hashed-filename cache busting | ⬜ Pending | Build-time solution so `CACHE_NAME` drift can no longer cause CS42-1's bug. Approach: tiny Node script (`scripts/build-sw.js`) run as an `npm run build:sw` step (wired into `prebuild` and the Dockerfile) that (a) reads the `STATIC_ASSETS` list from a source template, (b) computes a stable SHA-256 digest over their file contents, (c) templates `CACHE_NAME = 'gwn-{digest8}'` into the generated `public/sw.js`. No webpack. Source of truth is a template file (`public/sw.template.js`) — generated `sw.js` is gitignored, built in CI and the Dockerfile. Document the mechanism in `CONTRIBUTING.md`. |
| CS42-5a | Reproducible cold-start E2E in staging/overlay | ⬜ Pending | Extend `tests/e2e/coldstart-real.spec.mjs` using the existing `docker-compose.mssql.delay.yml` overlay (`GWN_DB_DELAY_MS` / `GWN_DB_DELAY_PATTERN`). New scenarios: (1) returning user with `gwn-v{old}` cache installed → after bump, activate purges old cache and serves new `app.js`; (2) 503 during warmup drives full ProgressiveLoader escalation sequence (no premature Retry button), request eventually succeeds before 35s cap. Run under `npm run test:e2e:mssql`. Deterministic — this is the real quality gate. |
| CS42-5b | Production telemetry + Azure Monitor alert | ⬜ Pending | `public/js/progressive-loader.js` emits lightweight client telemetry on entry/exit of the 503-retry path (counts + total wait time) via the existing `/api/telemetry` endpoint. Add an Azure Monitor query/alert on spike of 503-retry terminations that exhaust the 35s window (signals prod cold start is genuinely exceeding budget, or backend degradation). Replaces "test in prod" with "observe in prod". |
| CS42-5c | One-time manual production verification | ⬜ Pending | Post-deploy checklist recorded in this file: (1) leave prod idle ~70 min or confirm DB is paused via Azure portal, (2) hard-clear SW in a real browser (`chrome://serviceworker-internals` or DevTools → Application → Service Workers → Unregister), (3) hit `/leaderboard`, (4) record observed message sequence + DevTools Network waterfall, (5) paste evidence into the implementation PR. One-shot human sign-off; not automated. |

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

## Plan Refinement (2026-04-21, omni-gwn-c2)

Original CS42-5 ("Validate in production") split into **CS42-5a/5b/5c** after reviewing feasibility of a reproducible production cold-start E2E. Key reasoning:

- **Azure SQL auto-pause cannot be triggered on demand from CI** without either (a) ~60 min idle with zero traffic — impractical and defeated by health-check pings, or (b) privileged Azure REST `pause` against the shared production database — affects real users, race-prone, not acceptable.
- Forcing a Container App revision restart produces **app** cold start, not DB cold start, so it doesn't exercise the 503-retry path that CS42-3 fixes.
- Therefore: reproducible testing moves to **staging** using the already-built `GWN_DB_DELAY_MS` overlay (CS38 infrastructure); production gets **telemetry-based observation** (CS42-5b) plus a **one-time manual checklist** (CS42-5c).

CS42-4 updated from "consider hashed filenames" to "implement hashed filenames" (user direction): the chosen mechanism is a build-time Node script that templates a content-digest-based `CACHE_NAME` into `public/sw.js`. This makes drift (the root cause of CS42-1) structurally impossible rather than operationally avoided.

## Design Considerations

- Azure SQL auto-pause resume takes 10–30s — the ProgressiveLoader's 15s default timeout is too tight. CS42-3 introduces a separate 35s warmup window that applies only to the 503-retry loop; the normal timeout is unchanged for non-503 errors.
- The existing `SYNC_BACKOFF=[1000,3000,9000]` in score sync (`progressive-loader.js:105`) is a precedent for backoff — CS42-3 will use a shorter, request-driven backoff (server body's `retryAfter`, clamped 2–8s) rather than a fixed ladder, because warmup latency is unpredictable and a single successful retry should not be penalised.
- **Local delay middleware must keep working.** CS38's `GWN_DB_DELAY_MS` holds the request pending (never returns 503), so CS42-3's changes must not assume 503 is the only cold-start signal. CS42-5a must explicitly test both the "pending request" path (delay overlay) and the "503 + retry" path (simulated via a short-lived 503 response from the delay middleware, TBD in CS42-5a implementation).
- The 503-retry fix must be **generic to any transient 503**, not tied to DB-warmup error strings. The server's existing `retryAfter` in the 503 body (`server/app.js:173,177`) is the sole signal used.
- **Parallelism.** CS42-2 (SW bump) and CS42-3 (ProgressiveLoader) are independent — can run in two worktrees in parallel. CS42-4 (hashed filenames) depends on CS42-2 being merged (replaces the manual `gwn-v3` with a generated digest). CS42-5a/5b/5c depend on CS42-2, CS42-3, CS42-4 all being merged. CS42-5b (telemetry) and CS42-5a (E2E) can be developed in parallel; CS42-5c is strictly last.
- **Not in scope.** Changing the server 503 behaviour (Option B from the original investigation) — we keep fast 503s so healthy clients don't hang. Changing Azure SQL's auto-pause delay — out of CS42's UX scope, a separate infra decision.
