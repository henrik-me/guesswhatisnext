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

### Option A: ProgressiveLoader handles 503 with auto-retry
Make ProgressiveLoader treat 503 as "server is warming up" — show progressive messages and auto-retry the fetch instead of treating it as a final error. This is client-side only, no server changes.
- **Pro:** No server changes, works with any backend that returns 503 during warmup
- **Con:** ProgressiveLoader currently has `maxRetries: 0` default — needs retry logic for this specific case

### Option B: Server holds requests during DB warmup
Instead of returning 503 immediately, queue incoming requests and wait for DB init to complete (with a timeout). Server responds once DB is ready or times out.
- **Pro:** Client code unchanged, progressive messages work naturally (fetch stays pending)
- **Con:** Complex server change, risk of connection piling up during long warmups, changes behavior for all clients

### Option C: Hybrid — server returns 503 with Retry-After, client respects it
Server returns `503` with `Retry-After: 5` header. ProgressiveLoader checks for this header and auto-retries with progressive messages during the retry window.
- **Pro:** Standard HTTP semantics, explicit signal from server, client and server cooperate
- **Con:** Requires changes to both client and server

---

## Design Considerations
- Azure SQL auto-pause resume takes 10-30s — progressive messages need to cover this window
- The existing `SYNC_BACKOFF=[1000,3000,9000]` in score sync (`progressive-loader.js:105`) shows the loader already supports backoff for score submission — similar pattern could apply here
- Whatever fix is chosen must not break the local delay middleware testing (which already works)
- The fix should be generic enough to handle any transient server unavailability, not just DB warmup
