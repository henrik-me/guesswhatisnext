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
| CS42-2 | Immediate fix — bump `CACHE_NAME` to `gwn-v3` | ✅ Done | [PR #223](https://github.com/henrik-me/guesswhatisnext/pull/223) — Bump `CACHE_NAME` `gwn-v2` → `gwn-v3` in `public/sw.js`. Unit test for activate-handler purge logic added. |
| CS42-2b | SW upgrade / migration semantics | ✅ Done | [PR #223](https://github.com/henrik-me/guesswhatisnext/pull/223) — `controllerchange` one-shot reload guard in `sw-register.js` with `sessionStorage` flag. Unit test added. |
| CS42-3 | ProgressiveLoader 503 auto-retry | ✅ Done | PR [#222](https://github.com/henrik-me/guesswhatisnext/pull/222) — server Retry-After header, RetryableError, timer split, 30s cap, fetchProfile batch promotion, message additions (6s/20s), animated ellipsis |
| CS42-4 | Content-hashed `CACHE_NAME` (drift-proofing) | ✅ Done | [PR #224](https://github.com/henrik-me/guesswhatisnext/pull/224) — Build-time SHA-256 content hash over template + sorted STATIC_ASSETS + asset bytes. `scripts/build-sw.js` generates `public/sw.js` with `gwn-<8-hex>` cache name. CI freshness check, Dockerfile wired, CONTRIBUTING.md documented. |
| CS42-5a | E2E — SW upgrade/migration path | ✅ Done | [PR #225](https://github.com/henrik-me/guesswhatisnext/pull/225) — `tests/e2e/sw-upgrade.spec.mjs`: seeds bogus `gwn-v2` cache with sentinel, triggers SW update to `gwn-v3`, asserts cache purge + sentinel not served + controllerchange one-shot reload. |
| CS42-5b | E2E — 503 retry path | ⬜ Pending | Playwright test using **`page.route()` interception** (no delay-middleware extension) to script a one-shot "503 with Retry-After → 200" sequence for `/api/scores/leaderboard`. Assert: (i) full message escalation sequence visible ("coffee break ☕", "waking up 😴"), (ii) no Retry button before the retry succeeds, (iii) data renders after the retry. A second variant asserts a 503 with **no** retry signal (simulated offline SW 503) is **not** retried — Retry button shows immediately. Depends on **CS42-3** merged only. |
| CS42-5c | One-time manual production verification | ⬜ Pending | Post-deploy checklist recorded in this file. **Critical:** start from a real `gwn-v2`-controlled browser (do **not** unregister/clear the SW first — the migration path is the thing we're validating). Steps: (1) confirm the test browser has `gwn-v2` cached via DevTools → Application → Cache Storage, (2) leave prod idle ~70 min or confirm DB is paused via Azure portal, (3) reload the site, (4) observe: new SW activates + controllerchange reload fires (CS42-2b); freshly-loaded app shows the full 0/3/6/10/20s message escalation on the cold `/api/scores/leaderboard` call with animated ellipsis visible throughout (CS42-3); data renders without the Retry button inside 30s, (5) paste DevTools Application + Network screenshots into the implementation PR. One-shot human sign-off; not automated. |

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

Two review rounds:

**Round 1 — with user.** Split the original single CS42-5 into 5a/5b/5c; locked CS42-4 to hashed-filename approach. Reasoning: Azure SQL auto-pause cannot be triggered on demand from CI without affecting real production data, so reproducible testing moves to staging/overlay; prod gets telemetry + a one-shot checklist.

**Round 2 — rubber-duck critique (gpt-5.4), 10 findings, all adopted.** Key revisions over Round 1:

1. **CS42-4 keeps `public/sw.js` committed** — a gitignored generated file breaks `npm start`, tests, and Docker in this repo (no existing build step). Codegen edits in place; output is idempotent. Hash inputs extended to cover template text + path list + asset bytes so SW-logic changes also rotate `CACHE_NAME`.
2. **New CS42-2b** — bare `CACHE_NAME` bump does *not* fix already-controlled users on the first post-deploy visit. Added `controllerchange` one-shot reload in `sw-register.js`. CS42-5c must start from a real `gwn-v2` browser, not a cleared SW, or the migration path goes untested.
3. **CS42-3 timer handling split** — message-escalation timers persist across retries, per-attempt request timeout does not. 30s cap (tightened from initially-proposed 35s per user review) is a wall-clock cap via `min(timeout, remainingWarmupMs)`, so we can't drift to ~50s. `AbortError` explicitly excluded from `RetryableError`.
4. **CS42-3 gated on retry signal, not raw 503** — SW offline fallback synthesises bare 503s with no body/header. Retrying those would give offline users 35s of fake "warming up" UX. Added small server change: `Retry-After` HTTP header on `server/app.js:173,177` as the canonical signal. Not strictly client-only anymore.
5. **CS42-3 handles `fetchProfile()` specially** — it uses `Promise.allSettled` and currently tolerates partial failures; a mid-warmup `RetryableError` there must promote the whole batch to retryable, not silently drop into partial-data render.
6. **CS42-5 split on test-shape lines, not delay-middleware overloading** — SW-upgrade tests (SW enabled) and 503-retry tests (Playwright `page.route()` interception for one-shot 503→200) cannot share a harness. `coldstart-real.spec.mjs` stays focused on the pending-request path.
7. **Telemetry deferred** — scope creep for a UX-polish clickstop. Moved to **CS47** (see `project/clickstops/planned/planned_cs47_progressive-loader-telemetry.md`).
8. **Dependency graph relaxed** — 5a depends on "2 or 4", 5b depends on 3 only. Enables parallel validation instead of serialising everything behind 2+3+4.
9. **CS42-4 explicitly tagged as code/config PR** — full validation suite + Copilot review; `CONTRIBUTING.md` changes link to sources per "Link, don't restate".
10. **CS42-2b is the explicit migration task** the first-round plan was missing.

## Design Considerations

- Azure SQL auto-pause resume takes 10–30s — the ProgressiveLoader's 15s default timeout is too tight. CS42-3 introduces a 30s **wall-clock** warmup window applied only to the retry-signal loop; the normal timeout is unchanged for non-retryable errors.
- **Message cadence:** every screen shows a message change at 0/3/6/10/20s so no holding gap exceeds 10s. Final message holds at most 10s before the 30s Retry fallback. Distinct per-screen wording at the 20s step preserves the playful tone (the content is supposed to be a bit fun, not uniform).
- **Animated ellipsis** — persistent decorative cue on all loading messages; pure CSS; `aria-hidden` so it doesn't interfere with the existing `aria-live="polite"` announcement; respects `prefers-reduced-motion`. Naturally absent on the Retry state.
- Retry interval comes from `Retry-After` header (canonical) or `retryAfter` JSON body (fallback), clamped to 2000–8000ms. A fixed ladder would over- or under-wait depending on where the DB is in its resume curve.
- **Local delay middleware still works.** CS38's `GWN_DB_DELAY_MS` holds the request pending (never returns 503) — that path doesn't exercise CS42-3 at all and is covered by the existing `coldstart-real.spec.mjs`. The 503-retry path is a different scenario and is covered by CS42-5b via `page.route()` interception, not by extending the delay middleware.
- The retry logic must be **generic to any transient 503 with a retry signal**, not tied to DB-warmup error strings. The retry-signal presence (header or body field) is the sole gate.
- **SW upgrade semantics (CS42-2b)** — `controllerchange` + one-shot reload is the industry pattern (workbox, create-react-app). Guarded with a session flag so we cannot loop. If user-visible reload is rejected in PR review, fallback is an explicit "Reload for updates" banner.
- **Parallelism after the critique:**
  - CS42-2 and CS42-2b are small and can ride in the same PR.
  - CS42-3 is independent of CS42-2/2b (different files, different concerns).
  - CS42-4 depends on CS42-2 merged (replaces the manual `gwn-v3` with a generated digest).
  - CS42-5a depends on **CS42-2 or CS42-4** merged (any mechanism that produces a new CACHE_NAME) **and** CS42-2b merged.
  - CS42-5b depends on **CS42-3** merged only.
  - CS42-5c depends on 2, 2b, 3, 4 all merged and deployed.
- **Not in scope.** Changing the server's decision to return 503 fast (we keep it — healthy clients should not hang). Changing Azure SQL's auto-pause delay (infra decision, separate). Generic client UX telemetry (deferred to CS47).
