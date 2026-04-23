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

- **2026-04-23 14:09:06.640 PT → 14:31:13.943 PT** (≈22 minutes total, 3 client retry-button cycles, "more than 3 server-side DB timeouts per cycle").
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

## KQL queries for user to run (CS53-1)

> Run in Azure Portal → Application Insights → Logs (or Container Apps → Log Stream → KQL).
> Time window: `2026-04-23T21:09:06Z` to `2026-04-23T21:31:14Z` (assuming Pacific = UTC−7; **adjust if user was on a different TZ**).

**Q1 — All errors emitted by the app (App Insights `traces` table for Pino logs via OTel):**

```kql
let win_start = datetime(2026-04-23T21:09:00Z);
let win_end   = datetime(2026-04-23T21:31:30Z);
traces
| where timestamp between (win_start .. win_end)
| where severityLevel >= 2  // 2 = Warning, 3 = Error
| extend status = tostring(customDimensions.status),
         transient = tostring(customDimensions.transient),
         url = tostring(customDimensions.url),
         requestId = tostring(customDimensions.requestId),
         errMsg = tostring(customDimensions["err.message"]),
         errCode = tostring(customDimensions["err.code"]),
         errNumber = tostring(customDimensions["err.number"])
| project timestamp, severityLevel, message, status, transient, url, requestId, errMsg, errCode, errNumber
| order by timestamp asc
```

**Q2 — Distinct error classes seen (drives CS53-2 gap analysis):**

```kql
traces
| where timestamp between (datetime(2026-04-23T21:09:00Z) .. datetime(2026-04-23T21:31:30Z))
| where severityLevel >= 3
| extend errMsg = tostring(customDimensions["err.message"]),
         errCode = tostring(customDimensions["err.code"]),
         errNumber = tostring(customDimensions["err.number"]),
         transient = tostring(customDimensions.transient)
| summarize count(), min(timestamp), max(timestamp) by errMsg, errCode, errNumber, transient
| order by count_ desc
```

**Q3 — HTTP responses (App Insights `requests` table) — confirms 503 vs 500 emission ratios per URL:**

```kql
requests
| where timestamp between (datetime(2026-04-23T21:09:00Z) .. datetime(2026-04-23T21:31:30Z))
| where url contains "/api/"
| summarize count() by name, resultCode
| order by name, resultCode
```

**Q4 — Per-request timeline for the four profile endpoints (lets us see the exact retry pattern on the client):**

```kql
requests
| where timestamp between (datetime(2026-04-23T21:09:00Z) .. datetime(2026-04-23T21:31:30Z))
| where url has_any("/api/auth/me", "/api/scores/me", "/api/achievements", "/api/matches/history")
| project timestamp, name, resultCode, duration, id
| order by timestamp asc
```

**Q5 — Self-init progress (was the DB pool warm by the time requests started succeeding?):**

```kql
traces
| where timestamp between (datetime(2026-04-23T21:09:00Z) .. datetime(2026-04-23T21:31:30Z))
| where message has_any("Self-init", "Database self-initialized")
| project timestamp, message, customDimensions
| order by timestamp asc
```

**Q6 — Anything we missed (catch-all for the same window):**

```kql
union traces, exceptions
| where timestamp between (datetime(2026-04-23T21:09:00Z) .. datetime(2026-04-23T21:31:30Z))
| project timestamp, itemType, severityLevel, message, problemId = column_ifexists("problemId", ""), customDimensions
| order by timestamp asc
```

If any column names don't match (App Insights schemas vary by SDK version), Q1's `customDimensions` dump is the safest starting point — paste a raw row and the orchestrator will refine.

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
