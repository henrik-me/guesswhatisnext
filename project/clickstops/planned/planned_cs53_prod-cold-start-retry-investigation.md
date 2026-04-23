# CS53 — Production cold-start retry hiccup investigation

**Status:** ⬜ Planned
**Origin:** Deferred from CS42-5c manual production verification (2026-04-23). The CS42 retry path itself worked — progressive messages rendered and the service worker migration path succeeded — but the user observed that the **profile screen required ~3 explicit Retry clicks** before the database connected. That's a longer wait than the design intent of CS42-3 (single 503 → auto-retry → cap at 30s) and warrants investigation against real production telemetry rather than another speculative fix.

**Goal:** Understand from production logs and Azure Monitor telemetry why a single cold-start can require multiple retries, then decide whether the fix is in (a) the server (e.g. transient detection misses, premature 503 with no `Retry-After` for some code paths, pool exhaustion during warmup), (b) the client (e.g. retry budget too short, profile screen path doesn't share the auto-retry plumbing the leaderboard does), or (c) infra (Azure SQL auto-pause behaviour, serverless free-tier warmup variance).

## Problem

Manual production verification of CS42 on 2026-04-23:
- Progressive messages displayed correctly during DB warmup ✅
- Service worker migration `gwn-v2` → content-hashed cache succeeded ✅
- **But:** profile screen needed three manual Retry-button clicks before the DB came up.

Possible explanations (to be ruled in/out by investigation, not by guessing):
1. The profile-screen call path doesn't go through the same `progressive-loader.js` retry plumbing as `/api/scores/leaderboard` — so it falls back to "Retry" UX instead of auto-retrying with escalating messages.
2. CS48's transient-error detection missed a class of cold-start error specific to the profile endpoint (auth + user lookup involves more queries than leaderboard).
3. Server returned 503 without a `Retry-After` header for some code path, falling out of the auto-retry loop early (CS42-3 only auto-retries when `Retry-After` is present or the JSON body has `retryAfter`).
4. Azure SQL warmup is genuinely longer than the 30s wall-clock cap for the free serverless tier under some conditions; the fix may be raising the cap or restructuring messaging.
5. Connection pool exhaustion during warmup — first connection wakes the DB, subsequent parallel requests time out before the pool warms up.

Additional unfinished validation from CS42-5c also rolled in here:
- Leaderboard cold-start (the canonical scenario CS42-3 was designed for) was not re-validated end-to-end against a real auto-paused prod DB on 2026-04-23.
- Other screens that fan out to multiple DB queries (achievements, multiplayer history, community submissions) have never been observed under cold start.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS53-1 | Pull production logs around the 2026-04-23 validation window. Identify the response codes, latencies, and `transient: true` flags on the failed profile-screen calls. | ⬜ Pending | Needs Azure Monitor query / `kubectl`/`az containerapp logs` against the prod revision active during validation. Capture request IDs and OTel trace IDs. |
| CS53-2 | Compare the profile screen's request path (in `public/js/app.js` / wherever the profile fetches happen) against the leaderboard's. Confirm whether profile uses `progressive-loader.js` or a bypass. | ⬜ Pending | Code-only audit. The likely fix surfaces here if profile is bypassing the shared retry path. |
| CS53-3 | Cross-check the failed responses against `isTransientDbError` (CS48). Are they being classified transient or not? Are they returning `Retry-After`? Document gaps. | ⬜ Pending | If responses came back as 500 instead of 503, CS48's classifier missed a case → small fix + new test. |
| CS53-4 | Re-run manual cold-start validation against (a) leaderboard, (b) achievements, (c) multiplayer history, (d) community submissions, after waiting for Azure SQL to auto-pause. Record retry-count + wall-clock-to-success per screen. | ⬜ Pending | The actual evidence the design holds up across the app, not just the profile screen. |
| CS53-5 | Decide remediation based on findings (server fix, client fix, cap raise, or "this is the floor and we accept it") and either implement here or spin off targeted clickstops. | ⬜ Pending | Decision task — may deliver code, may deliver "no further work warranted with rationale documented". |

## Acceptance Criteria

- We can explain (citing log evidence) **why** profile required multiple manual retries on 2026-04-23.
- We have observed cold-start behaviour on at least three more screens against real auto-paused prod and recorded the retry/latency profile.
- Either a fix is shipped that demonstrably reduces the retry count to 0–1 on the affected screen, OR a documented decision exists explaining why the current behaviour is the accepted floor (with the trade-offs spelled out).
- Any new transient-error class found is added to CS48's `isTransientDbError` with a regression test.

## Relationship to other clickstops

- **CS42** — closed; this CS picks up the loose thread from CS42-5c without reopening it.
- **CS48** — already centralized transient-error → 503 conversion. CS53-3 verifies that classifier covers the prod-observed errors; gaps get fixed inside CS48's surface.
- **CS47 (planned)** — adds *forward-looking* ProgressiveLoader telemetry + alerting. CS53 is *backward-looking* (read existing logs from a known incident). The two are complementary: CS53 likely produces requirements that strengthen the CS47 schema (e.g. "we need to capture which API path failed, not just that the loader fired").

## Will not be done as part of this clickstop

- General "make Azure SQL faster" infra work — separate concern, would warrant its own infra clickstop.
- Migrating off Azure SQL serverless free tier — cost/architecture decision, not a CS53 outcome.
- Adding new client-side telemetry routes — that's CS47's job.
