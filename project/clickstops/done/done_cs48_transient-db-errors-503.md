# CS48 — Transient DB errors → 503 (cold-start UX fix)

**Status:** ✅ Complete
**PR:** [#228](https://github.com/henrik-me/guesswhatisnext/pull/228) (squashed as `7558adb` on `main`)
**Closed:** 2026-04-23

## Problem

During production validation of CS42 (cold-start progressive messages), a real
cold-start scenario surfaced an **"Internal server error"** on the login page
instead of triggering the CS42-3 ProgressiveLoader retry path. Server logs
(prod, 2026-04-22 13:11Z) showed:

```
13:11:03  POST /api/auth/login → 500 (15004ms)
13:11:03  ConnectionError: Failed to connect to gwn-sqldb.database.windows.net:1433 in 15000ms
13:11:23  POST /api/auth/login → 500 (15001ms)
13:11:34  GET  /api/scores/leaderboard → 200  (DB now warm)
13:11:44  POST /api/auth/login → 200          (succeeds after navigation)
```

### Root cause

- The 503 gate in `server/app.js` checks `!dbInitialized`. After a successful
  startup self-init, `dbInitialized = true` and stays true.
- Azure SQL serverless **auto-pauses** while the app is idle, but the in-process
  mssql pool still appears initialized. The 503 gate passes, the route runs,
  the actual query times out after 15s with a `ConnectionError`.
- The central error handler converts every 500-class error into a generic
  `{ error: "Internal server error" }`, dropping all signal that this is a
  transient/retryable failure.
- The CS42-3 ProgressiveLoader on the client only retries on **503** with
  `Retry-After`, so a 500 is treated as a hard failure and surfaces as
  "Internal server error" to the user.

## Fix

Convert transient DB errors into **HTTP 503 with `Retry-After: 5`** in the
central error handler so the existing client-side retry path (CS42-3) takes
over instead of showing an error message.

## Tasks

| # | Task | Status |
|---|------|--------|
| CS48-1 | Extract `isTransientDbError(err, dialect)` into `server/lib/transient-db-error.js`. Covers MSSQL transient numbers (40613, 40197, 40501, 49918–49920), socket codes (ETIMEOUT/ECONNREFUSED/ESOCKET/ECONNRESET), tedious/mssql wrapper names (`ConnectionError`, `RequestError`), message regex (`failed to connect`, `connection.*timeout`, `pool.*failed`, `database.*paused`, `database.*unavailable`), nested `originalError.number`, and SQLite `SQLITE_BUSY/LOCKED/BUSY_SNAPSHOT`. | ✅ Done |
| CS48-2 | Wire `isTransientDbError` into the central error handler in `server/app.js`. When `status >= 500` and the error is transient, respond `503` with `Retry-After: 5` and body `{ error: 'Database temporarily unavailable', retryAfter: 5 }`. Logs include `transient: true`. | ✅ Done |
| CS48-3 | Refactor the startup self-init retry loop in `server/app.js` to use the same `isTransientDbError` utility (deduplication). | ✅ Done |
| CS48-4 | Unit tests in `tests/transient-db-error.test.js` covering MSSQL paths (ConnectionError name, transient numbers incl. nested, socket codes, message regex, false positives), SQLite paths (BUSY/LOCKED, constraint failures correctly rejected), and defensive cases (null/undefined). 14 tests, all green. | ✅ Done |

## Validation

- `npm test` → 473 passed (36 files)
- `npm run lint` → clean
- Re-verified on close-out (2026-04-23): `tests/transient-db-error.test.js` → 14/14 passed; `server/lib/transient-db-error.js` and the `server/app.js` wiring (lines 11, 338, 390) confirmed present on `main` at `7558adb`.

## Completion Checklist

- [x] All tasks ✅ Done
- [x] PR merged to `main` (#228 → `7558adb`)
- [x] Unit tests added and passing (14/14)
- [x] Code present in repo and exercised at runtime by central error handler + startup retry loop
- [x] No CONTEXT.md update required (filesystem is the source of truth for clickstop state)
- [x] No WORKBOARD.md row to remove (no agent had claimed this CS at close-out)

## Post-deploy verification (manual, by user)

After deploy, repeat the cold-start scenario from CS42-5c. Expected behavior:

1. Login attempt during DB cold-start no longer surfaces "Internal server
   error" — instead the ProgressiveLoader displays the cold-start retry
   messages (same flow as a fresh server boot).
2. Once Azure SQL completes wake-up (typically 30–60s), the next automatic
   retry succeeds without user intervention.
3. Server logs show the transient request as `level:50` with `transient: true`
   and HTTP `503` (not `500`).
