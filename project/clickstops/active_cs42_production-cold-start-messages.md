# CS42 — Production Cold Start Progressive Messages

**Status:** 🔄 In Progress
**Goal:** Investigate and fix why progressive loading messages (friendly "waking up the database" UX) appear during local cold-start testing but not in production when Azure SQL is auto-paused.

---

## Investigation Findings (CS42-1)

### Root Cause

**Local cold-start:** The delay middleware (`server/middleware/delay.js`) holds HTTP requests open for the configured duration (e.g., 45s). ProgressiveLoader (`public/js/progressive-loader.js`) is purely timer-based — it shows escalating messages at 3s/6s/10s while the fetch is **pending**. This works because the response is slow.

**Production cold-start:** When Azure SQL is auto-paused and resuming (~10-30s), the server does NOT hold requests open. Instead:
1. App starts, DB self-init retry loop runs in background (`server/app.js:352-410`)
2. User request arrives → server checks DB readiness → not ready → returns **503 immediately** (`server/app.js:168-178`)
3. ProgressiveLoader gets a fast error response → fetch completes → messages never escalate
4. User sees error/empty state instead of friendly progressive messages

**The difference:** Local delay holds the request **pending** (slow response). Production returns **fast 503** (immediate error). ProgressiveLoader only shows messages while waiting — a fast error short-circuits the entire escalation.

### Evidence
- `server/middleware/delay.js:35-45` — delay middleware disabled when `NODE_ENV=production/staging`
- `server/app.js:168-178` — returns 503 when DB not initialized
- `progressive-loader.js:7-11` — default timeout 15s, messages shown only while fetch pending
- `progressive-loader.js:23-69` — escalation timers cleared when fetch resolves (even with error)
- `docker-compose.mssql.delay.yml:22-33` — local cold-start uses NODE_ENV=development to enable delays
- `.github/workflows/prod-deploy.yml:188` — production sets NODE_ENV=production (no delays)

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS42-1 | Investigate: why progressive messages don't appear in production | ✅ Done | Root cause: server returns 503 immediately instead of holding request. See findings above. |
| CS42-2 | Plan fix based on findings | ⬜ Pending | Choose approach — see options below. |
| CS42-3 | Implement fix | ⬜ Pending | — |
| CS42-4 | Validate in production | ⬜ Pending | Verify progressive messages appear during Azure SQL cold start. |

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
