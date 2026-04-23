# CS53 — Production cold-start retry hiccup investigation

**Status:** 🔄 In Progress
**Owner:** yoga-gwn
**Origin:** Deferred from CS42-5c manual production verification (2026-04-23). The CS42 retry path itself worked — progressive messages rendered, the SW migration succeeded, and 503/`Retry-After` plumbing fired — but the user observed that the **profile screen required ~3 explicit Retry-button clicks** before the database came up, with the full incident spanning ~22 minutes (14:09:06 → 14:31:13 PT, 2026-04-23).

## Goal

Use the **real production logs from the 2026-04-23 incident** (App Insights / Container Apps stdout) to determine whether the multi-retry experience is caused by:

- **(a) Server** — a transient error class CS48 doesn't classify, premature 503 with no `Retry-After`, pool exhaustion during warmup, internal retry storms, or self-init still in flight while requests are being served;
- **(b) Client** — `WARMUP_CAP_MS = 30000` in `progressive-loader.js` being too short for the actual cold-start floor of Azure SQL serverless free tier; raw `fetch()` calls that bypass the retry plumbing (e.g. `app.js:530` token validation on boot); profile-screen `onRetry: () => fetchProfile()` semantics resetting state in surprising ways;
- **(c) Infra** — Azure SQL serverless auto-pause + free-tier warmup variance fundamentally exceeding any reasonable client cap, in which case the answer is messaging + a documented floor rather than retry tuning.

## What we already know from code reading (pre-log-pull)

Findings from this session (no new bugs needed yet):

1. **Profile DOES use `progressive-loader`** (`public/js/app.js:2804–2868`). It runs four `apiFetch` calls in `Promise.allSettled`, batch-promotes any sub-`RetryableError` into one `RetryableError` for the loader, and rethrows on all-rejected. Structurally identical to leaderboard. So hypothesis (1) from the original plan ("profile bypasses retry plumbing") is **largely refuted by code**.
2. **`WARMUP_CAP_MS = 30000`** (`public/js/progressive-loader.js:14`). When wall-clock since the loader started exceeds 30s, the loader falls out of `retryLoop()` and renders the **Retry button**. Each manual click *re-enters* the loader with a fresh 30s budget. So 3 clicks ≈ 90s of effective warmup window, and the user's "more than 3 server-side timeouts per click" matches the loader's `min/max retryAfter` clamp of 2–8s × repeated attempts. **The 30s cap is the leading suspect.**
3. **Token validation on boot uses raw `fetch`** (`public/js/app.js:530`). Not `apiFetch`, not `progressiveLoad`. If the DB is cold during this initial request, the response is silently dropped on any non-401/403 path — no retry, no UI signal. Possibly unrelated to the profile-screen complaint, but still a known unhardened surface that CS53 should at minimum document and decide on.
4. **Server-side 503 path is consistent** (`server/app.js:328–366`): central error handler converts any `>=500 + isTransientDbError` into `503 + Retry-After: 5 + {retryAfter:5}`. Logs the incident with `transient: true`. No fall-through to 500 in the transient branch. So if a particular cold-start error reaches the user as a generic 500, it means `isTransientDbError` didn't match it — and **CS53-3 must verify this against actual prod log messages**.
5. **Self-init loop** (`server/app.js:370+`) runs every 5s up to 30 attempts with retry-classification. While self-init is failing, request handlers will see DB errors and emit 503s on their own — so during the warmup window we should see *both* `Self-init attempt failed, retrying in 5s` warnings *and* per-request `Transient DB error — responded 503` errors interleaved.

## Incident window (user-supplied)

- **2026-04-23 14:09:06.640 UTC → 14:31:13.943 UTC** (≈22 minutes total, 3 client retry-button cycles, "more than 3 server-side DB timeouts per cycle").
- App: production deployment of `gwn.metzger.dk` on Azure Container Apps, Azure SQL serverless free tier as backend.
- Telemetry: OTel SDK exporting traces to Azure Monitor via `APPLICATIONINSIGHTS_CONNECTION_STRING`. Pino logs (stdout) include `requestId`, `transient` flag, OTel `trace_id`/`span_id`. Container Apps stdout is also queryable.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS53-1 | Run the KQL query bundle below against App Insights / Container Apps logs for the incident window. Capture: full count of `transient: true` 503s, full count of non-503 `>=500` errors, distinct error messages / SQL error codes, self-init attempt timeline, and request-id correlation for the four profile endpoints (`/api/auth/me`, `/api/scores/me`, `/api/achievements`, `/api/matches/history`). User runs queries; orchestrator analyses results. | 🔄 In Progress | Logs come back → paste into a CS53 working-notes scratch (or as a comment in this file). Do not declare CS53-1 done until we have a count of distinct error classes. |
| CS53-2 | Cross-check every distinct error class from CS53-1 against `isTransientDbError` (`server/lib/transient-db-error.js`). For each: (a) was it correctly classified transient? (b) was 503 + `Retry-After` actually emitted? Document gaps. | ⬜ Pending | If a class slipped through to plain 500, that's a CS48 follow-up (small fix + new test) — fold into CS53. |
| CS53-3 | Quantify the actual cold-start duration distribution from CS53-1 (time from first 503 to first 200 across the incident). Compare with `WARMUP_CAP_MS = 30000`. Decide one of: raise the cap, make the cap adaptive (use `Retry-After` from the latest 503 instead of wall-clock), or accept the floor and improve messaging. | ⬜ Pending | Depends on CS53-1 numbers; this is the core remediation decision. |
| CS53-4 | Audit raw-`fetch` callsites that touch the API and decide which need to be routed through `apiFetch` + retry-aware handling. Specifically: `public/js/app.js:530` (boot token validation). Find others via `grep -nE "fetch\\('/api"`. | ⬜ Pending | Quick code audit; small fix scope if any need migration. |
| CS53-5 | Re-run manual cold-start validation against (a) leaderboard, (b) achievements, (c) multiplayer history, (d) community submissions, after waiting for Azure SQL to auto-pause. Record retry-count + wall-clock-to-success per screen. Confirms whether the issue is profile-specific or universal. | ⬜ Pending | Manual; orchestrator drafts a checklist, user runs. |
| CS53-6 | Implement remediation chosen in CS53-3 (and CS53-2/CS53-4 if those surfaced fixes). Land in one or more PRs through standard validation. | ⬜ Pending | Scope depends on findings. May be "no code change, document floor" if logs reveal the cap is well above warm-DB latency and the issue is purely cold-start length. |

## CS53-1 findings (preliminary, 2026-04-23)

App Insights is **not configured in production** (no `APPLICATIONINSIGHTS_CONNECTION_STRING` env var on the Container App), so OTel does not export traces. We are working from Container Apps stdout → Log Analytics (`ContainerAppConsoleLogs_CL`). Enabling App Insights in prod is tracked separately as **CS54** (planned).

## CS53-2 root-cause analysis (after deeper code reading, 2026-04-23)

Two distinct 503 paths exist server-side; understanding which one fired in the incident changes the remediation:

- **Path A — gating middleware (`server/app.js:170–178`)**: when `draining || !dbInitialized`, returns 503 + `Retry-After: 5` *before any DB call* with **no log statement**. Cost: ~0ms per request.
- **Path B — central error handler (`server/app.js:328–366`)**: triggered when a route handler reaches a transient DB error mid-request. **Emits the "Transient DB error — responded 503" log line**. Cost: 15000ms (mssql `connectTimeout`/`requestTimeout` defaults).

**Every error in Q1/Q7 is Path B** (all carry the "Transient DB error — responded 503" message). This is a critical signal:

> `dbInitialized` was **`true`** at incident time. The DB had already been initialized in this container; what we observed was Azure SQL **auto-pausing mid-session**, not a deploy-time cold-start.

This rules out the leading hypothesis from earlier ("deploy cold-start hits the WARMUP_CAP_MS too early"). The actual chain of events:

1. Azure SQL serverless auto-paused after the configured idle period.
2. Next request reaches a route handler → mssql pool tries to use a paused connection → **15s `requestTimeout`** fires → ETIMEOUT.
3. Central error handler catches it, classifies transient (correctly), emits 503 + `Retry-After: 5`. Logs the line we see.
4. Client `progressive-loader` enters `retryLoop()`. Sleeps 2–8s clamped from `Retry-After`. Retries. Server tries again → another 15s timeout → another 503.
5. Wall-clock cap (`WARMUP_CAP_MS = 30000`) exhausts after ~2 server attempts. Retry button shown.
6. **Self-init loop NEVER re-runs** — it short-circuits on `if (draining || dbInitialized) return;` (`server/app.js:379`). So the server has **no proactive DB warming** after the initial bootstrap. The only thing waking the DB is the per-request connection attempts themselves — and each one times out at 15s before the DB finishes warming.
7. Eventually (after some number of failed attempts) Azure SQL completes its resume cycle and a subsequent attempt succeeds.

**Confirmed defaults from `node_modules/mssql/lib/tedious/connection-pool.js:41–42`:** both `connectTimeout` AND `requestTimeout` default to **15000ms**. `mssql.connect(connectionString)` in `server/db/mssql-adapter.js:312` passes no options → we inherit both defaults.

**Why wave 1 had only 3 endpoints (no `/api/auth/me`):** the boot-time raw `fetch('/api/auth/me')` at `public/js/app.js:530` fires at page load *before* the profile-screen `fetchProfile()` batch. It overlapped wave 1 (already in flight when `progressiveLoad` started), so wave 1 only saw 3 distinct fan-out URLs. Wave 2 (the retry batch) included `/api/auth/me` because the boot-time fetch had already failed silently and `fetchProfile()`'s batch picked it up. **The boot-time raw fetch is also unhardened** — on 503 it silently does nothing (only 401/403 are handled at `app.js:533`), so a paused DB at app boot leaves the user logged-in-but-not-loaded.

**Why `/api/notifications/count` shows up at 14:09:00 and 14:31:13:** `NOTIFICATION_POLL_INTERVAL = 60000ms` (`public/js/app.js:3142`) — it's a 60s interval poller hitting the DB. Each tick during a paused window adds a 15s timeout to the pool's traffic. The 14:31:13 entry is almost certainly a *second* auto-pause cycle (22 min idle from 14:09 → 14:31 lines up with Azure SQL's free-tier auto-pause threshold), not the tail of the same event.

## Root cause (one-line)

Azure SQL serverless auto-pauses idle; the mssql driver's default 15s `requestTimeout` is shorter than the DB's resume time, so each per-request connection attempt times out before the DB warms — and the server has **no proactive resume probe** after `dbInitialized = true` is set, so warming relies entirely on the very requests that keep timing out. The client's 30s `WARMUP_CAP_MS` then surfaces the Retry button after ~2 such attempts.

## Proposed remediation (CS53-3 decision)

Three small, additive fixes — all needed; none alone is sufficient:

1. **Server: tune mssql timeouts** — pass `connectionTimeout: 8000` and `requestTimeout: 8000` to `mssql.connect()`. Trades long single timeouts for more attempts per wall-clock window. (Going below ~5s risks false positives on real network jitter.)
2. **Server: add a proactive resume probe** — when the central error handler catches a transient error AND `dbInitialized === true`, schedule a short async background ping (`SELECT 1` with the same short timeout, retry-with-backoff up to N attempts) to wake the pool without holding the response. This is the missing piece that converts every paused-DB user-request into "fail-fast + warm in background" instead of "block 15s + hope the next click happens after warmup".
3. **Client: adaptive `WARMUP_CAP_MS`** — extend the wall-clock budget by `Retry-After` on each successive 503 instead of fixing 30s. Cap total at ~120s. Combined with #1, this means a typical Azure SQL resume (~30–60s) fits inside one client cycle without the user ever seeing a Retry button.

**Out-of-scope but flagged:**
- Boot-time raw `fetch('/api/auth/me')` at `public/js/app.js:530` should be migrated to `apiFetch` + tolerate 503. Small follow-up; fold into CS53-4.
- The 60s notifications poller adds steady pool pressure during paused windows. Could be backed off when the last response was 503. Optional polish, not required for the core fix.

## Data points still useful (not blocking)

- A query to find Path A 503s in the window — they would prove whether self-init was ever re-attempted. Path A is silent in logs today, so we'd need to either (a) add a debug log to that branch, or (b) infer absence from the fact that no `Self-init attempt` lines appear in Q5/Q7.
- A second-incident replay (CS53-5 manual re-validation after auto-pause) to verify the proposed fixes actually reduce retry count.

## CS53-1 findings — log timeline (raw)

**Q1 results from incident window (`2026-04-23T14:09:00Z` – `14:31:30Z`):**
- Every error in the window is the same shape: `Failed to connect to gwn-sqldb.database.windows.net:1433 in 15000ms`, `errCode = ETIMEOUT`, `transient = true`, status 503 emitted.
- Affected URLs include the four profile endpoints **plus** `/api/notifications/count` (a 60s poller, see `public/js/app.js:3163`).
- **CS48 classified every observed error as transient — no gaps to plug there.**

**Root-cause hypothesis (confirmed by code reading + log evidence):**
1. **mssql `connectTimeout` = 15000ms** — `server/db/mssql-adapter.js:312` calls `mssql.connect(connectionString)` with no options, so we inherit the mssql package's library default of 15s.
2. **Client `WARMUP_CAP_MS = 30000ms`** in `public/js/progressive-loader.js:14`.
3. With a 15s server attempt and a 30s client cap, **at most ~2 server attempts fit per client retry cycle** before the cap exhausts and the Retry button appears.
4. User clicked Retry 3 times → ~6 server attempts × 15s ≈ 90s of effective warmup, lining up with Azure SQL serverless free-tier cold-start times (typically 60–120s).

**Likely remediations (CS53-3 will pick one):**
- **(a)** Lower mssql `connectTimeout` to ~5s so 4–6 attempts fit per client cycle (faster failure surfacing, cheaper to retry).
- **(b)** Raise client `WARMUP_CAP_MS` to ~120s (covers full cold-start; risk: long perceived hang if it's a real outage).
- **(c)** Make the client cap *adaptive* — extend the budget by `Retry-After` from the latest 503 instead of using a fixed wall-clock (cleanest, more code).
- **(d)** Combine: lower server timeout + adaptive client cap.

**Open data point still needed (Q7 below):** the actual end-to-end cold-start duration on this incident — i.e., from first 503 to first 200 — and the self-init attempt cadence.

**Q7 results (registered 2026-04-23; analysis pending):**

```
14:09:00.633   503  /api/notifications/count        ← first failure (poller)
14:09:06.640   503  /api/scores/me                  ┐
14:09:06.640   503  /api/achievements               │ profile wave 1 (3 endpoints; no auth/me)
14:09:06.640   503  /api/matches/history            ┘
14:09:17.733   503  /api/matches/history            ┐
14:09:17.733   503  /api/auth/me                    │ profile wave 2 (4 endpoints, ~11.1s later)
14:09:17.733   503  /api/scores/me                  │
14:09:17.733   503  /api/achievements               ┘
14:31:13.943   503  /api/notifications/count        ← last 503 in window (poller)
```

Observations (raw, not yet interpreted into a remediation):
- **Only two client-driven waves** on the profile endpoints, not three. Wave 2 fired 11.1s after Wave 1 — consistent with a client `retryLoop` sleep (clamped 2–8s) + a 15s mssql attempt overlap.
- **Wave 1 has three endpoints, wave 2 has four.** The missing `/api/auth/me` in wave 1 is noteworthy — likely because `/api/auth/me` was already in flight from the boot-time raw `fetch` (`public/js/app.js:530`) and overlapped.
- **No `Self-init attempt failed` or `Database self-initialized` rows** appeared in Q7 — suggests either the self-init loop wasn't emitting during this window (it's quiet on success), or messages fell outside the level filter.
- **22-minute gap** between 14:09:17 and 14:31:13 with no visible error rows → strongly implies the DB warmed somewhere in that gap and subsequent requests succeeded. The 14:31:13 entry is likely a fresh auto-pause cycle catching the 60s-interval notifications poller.
- **Successful 2xx responses were not in the result set** — either because Pino only logs request-level detail on warn+ paths, or Q7's `status >= 200` branch didn't match (Pino info-level access logs may not carry a `status` field at the top level). A follow-up query against request-access logs would pin down the exact "first 200" timestamp.

**What we still do not know (do NOT move forward on remediation until these are answered):**
- Exact timestamp of the first successful 200 — i.e. the real cold-start floor.
- Whether the self-init loop ran and at what cadence during 14:09–14:31.
- Whether the 14:31:13 entry is a *second* auto-pause cycle (in which case the cold-start was much shorter than 22 min) or the tail of the same event.

## KQL queries for user to run (CS53-1)

> Run in Azure Portal → Container App → Logs (Log Analytics workspace).
> Time window: `2026-04-23T14:09:00Z` to `2026-04-23T14:31:30Z` (UTC, per user-supplied incident timestamps).
> Pino JSON lives in the `Log_s` field of `ContainerAppConsoleLogs_CL`.

**Q1 — All warn/error logs in the window (✅ already run; results captured above):**

```kql
let win_start = datetime(2026-04-23T14:09:00Z);
let win_end   = datetime(2026-04-23T14:31:30Z);
ContainerAppConsoleLogs_CL
| where TimeGenerated between (win_start .. win_end)
| extend P = parse_json(Log_s)
| where isnotempty(P.level) and toint(P.level) >= 40   // pino: 40=warn, 50=error, 60=fatal
| project TimeGenerated,
          level     = toint(P.level),
          msg       = tostring(P.msg),
          status    = toint(P.status),
          transient = tobool(P.transient),
          method    = tostring(P.method),
          url       = tostring(P.url),
          requestId = tostring(P.requestId),
          errMsg    = tostring(P.err.message),
          errCode   = tostring(P.err.code),
          errNumber = toint(P.err.number),
          ContainerAppName_s
| order by TimeGenerated asc
```

**Q2 — Distinct error classes (drives the CS48 gap analysis):**

```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-04-23T14:09:00Z) .. datetime(2026-04-23T14:31:30Z))
| extend P = parse_json(Log_s)
| where toint(P.level) >= 50
| extend errMsg = tostring(P.err.message),
         errCode = tostring(P.err.code),
         errNumber = toint(P.err.number),
         transient = tobool(P.transient),
         status = toint(P.status)
| summarize count(), min(TimeGenerated), max(TimeGenerated) by errMsg, errCode, errNumber, transient, status
| order by count_ desc
```

**Q3 — Response-code mix per URL (confirms 503 vs 500 emission ratios):**

```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-04-23T14:09:00Z) .. datetime(2026-04-23T14:31:30Z))
| extend P = parse_json(Log_s)
| where isnotempty(P.url) and isnotempty(P.status)
| summarize count() by url = tostring(P.url), status = toint(P.status)
| order by url asc, status asc
```

**Q4 — Per-request timeline for the four profile endpoints + notifications poller:**

```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-04-23T14:09:00Z) .. datetime(2026-04-23T14:31:30Z))
| extend P = parse_json(Log_s)
| extend url = tostring(P.url)
| where url has_any("/api/auth/me", "/api/scores/me", "/api/achievements", "/api/matches/history", "/api/notifications/count")
| project TimeGenerated, url, status = toint(P.status), transient = tobool(P.transient), requestId = tostring(P.requestId), msg = tostring(P.msg)
| order by TimeGenerated asc
```

**Q5 — Self-init timeline (when did the pool actually come up?):**

```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-04-23T14:09:00Z) .. datetime(2026-04-23T14:31:30Z))
| extend P = parse_json(Log_s)
| extend msg = tostring(P.msg)
| where msg has_any("Self-init", "Database self-initialized", "Self-init attempt")
| project TimeGenerated, msg, attempt = toint(P.attempt), errMsg = tostring(P.err.message)
| order by TimeGenerated asc
```

**Q6 — Catch-all (raw rows, when JSON parse fails or fields are unexpected):**

```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-04-23T14:09:00Z) .. datetime(2026-04-23T14:31:30Z))
| project TimeGenerated, Log_s, ContainerAppName_s, ContainerName_s
| order by TimeGenerated asc
```

**Q7 — End-to-end cold-start duration (first 503 → first 2xx + self-init markers):**

```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-04-23T14:09:00Z) .. datetime(2026-04-23T14:35:00Z))
| extend P = parse_json(Log_s)
| extend status = toint(P.status), msg = tostring(P.msg)
| where msg has_any("Self-init", "Database self-initialized") or status >= 200
| project TimeGenerated, msg, status, attempt = toint(P.attempt), url = tostring(P.url)
| order by TimeGenerated asc
| take 200
```

## Acceptance Criteria

- We can explain (citing log evidence from CS53-1) **why** profile required multiple manual retries on 2026-04-23, with a quantified cold-start duration.
- Every distinct error class observed has been audited against `isTransientDbError`, with gaps either fixed or explicitly accepted.
- Either a fix is shipped that demonstrably reduces the retry count to 0–1 on the affected screens (validated via CS53-5 cold-start re-runs), OR a documented decision exists explaining why the current behaviour is the accepted floor with the trade-offs spelled out.
- Any new transient-error class found is added to CS48's `isTransientDbError` with a regression test.
- Raw-`fetch` callsites that touch the API are either routed through `apiFetch`/`progressive-loader` or have an explicit "intentionally raw" rationale.

## Relationship to other clickstops

- **CS42** — closed; this CS picks up the loose thread from CS42-5c without reopening it.
- **CS48** — already centralized transient-error → 503 conversion. CS53-2 verifies that classifier covers the prod-observed errors; gaps get fixed inside CS48's surface.
- **CS47 (planned)** — adds *forward-looking* ProgressiveLoader telemetry + alerting. CS53 is *backward-looking* (read existing logs from a known incident). The two are complementary: CS53 likely produces requirements that strengthen the CS47 schema.

## Will not be done as part of this clickstop

- General "make Azure SQL faster" infra work — separate concern.
- Migrating off Azure SQL serverless free tier — cost/architecture decision.
- Adding new client-side telemetry routes — that's CS47's job.
