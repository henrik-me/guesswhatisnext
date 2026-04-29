# CS47 — Progressive Loader Telemetry

**Status:** ⬜ Planned
**Depends on:** CS42
**Parallel-safe with:** any
**Goal:** Emit lightweight client telemetry from ProgressiveLoader on entry/exit of the 503-retry warmup path, and wire an Azure Monitor alert on 35s-cap exhaustions. Replaces "test cold-start in production" (not safely possible) with continuous observation.

**Origin:** Deferred from CS42 (see `project/clickstops/active/active_cs42_production-cold-start-messages.md` — Plan Refinement Round 2, finding #7, rubber-duck critique 2026-04-21). Originally proposed as CS42-5b, the rubber-duck review (gpt-5.4) flagged it as scope creep for a UX-polish clickstop: the existing `/api/telemetry/errors` endpoint is specifically error-shaped, and adding generic client UX telemetry + alerting is a new observability feature, not a small UX fix. CS42 is closing with E2E (CS42-5a/5b) + one-time manual prod verification (CS42-5c) as the evidence bar; CS47 adds the continuous-observation layer once CS42 lands.

---

## Problem

After CS42 ships, there is no signal from production telling us whether the ProgressiveLoader 503-retry path is actually firing, how long real users wait, or whether the 35s wall-clock cap ever exhausts (which would indicate Azure SQL warmup genuinely exceeds budget or a backend regression). Manual sampling via CS42-5c is a one-shot snapshot, not ongoing evidence.

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS47-1 | Design telemetry schema | ⬜ Pending | Decide: event shape (one event per warmup-retry session, or span-style enter/exit?), fields (screen name, attempts, total wait ms, outcome ∈ {success, cap-exhausted, aborted}), sample rate (100% is probably fine for a low-frequency event), and whether to reuse `/api/telemetry/errors` (probably not — it's error-shaped) or add a new `/api/telemetry/ux-events` route. |
| CS47-2 | Client emission | ⬜ Pending | In `public/js/progressive-loader.js`, emit a single event on exit from the retry loop (success or cap-exhausted). Fire-and-forget; never block the UI. Honour user `Do Not Track` if we respect it elsewhere. |
| CS47-3 | Server ingestion | ⬜ Pending | New route handler (or extend telemetry route) that validates shape and forwards to the Pino logger with OTel trace context (existing logger mixin already adds trace IDs). No DB write — telemetry flows out via Azure Monitor from the logs. |
| CS47-4 | Azure Monitor alert | ⬜ Pending | Query the logs for `event.type=progressiveLoader.warmupExhausted` over a rolling 15 min window; alert if count > N (threshold set empirically after a week of baseline data). Document the alert rule in `infra/` with a link to the Azure portal — no restated values per "Link, don't restate". |
| CS47-5 | Dashboard | ⬜ Pending | Simple Azure Monitor workbook / dashboard showing warmup-retry volume over time, median wait, p95, cap-exhaustion rate. Primarily for post-deploy observation and capacity decisions about Azure SQL auto-pause behaviour. |

---

## Design Considerations

- **Privacy / data minimisation.** No user identifiers; no URL parameters; no request bodies. Only event name, screen name (from `MESSAGE_SETS` key: `leaderboard` / `profile` / `achievements` / `community`), attempt count, total wait ms, outcome.
- **Sampling.** Warmup retries are low-frequency (one per user per cold start). 100% sampling is fine. If volume becomes a concern, head-sample per session, not per event.
- **Cost.** Azure Monitor log ingestion is per-GB; a small JSON event per cold start should be negligible at current MAU but confirm cost model before enabling at 100%.
- **Interaction with CS42.** Requires CS42-3 to be merged so the 503-retry path actually exists to instrument. Ideally starts the week CS42-3 lands so we gather baseline data alongside rollout.
- **Not in scope.** Instrumenting other long-running UI operations (score sync, match lobby) — scope creep; do those as separate clickstops if the pattern proves valuable.

## Acceptance

- In production, we can answer "how many users hit the warmup retry path in the last 24h?" and "how often does the 35s cap exhaust?" without redeploying or reading source code.
- An alert fires when cap-exhaustion rate exceeds an empirically-set threshold, pointing on-call at Azure SQL behaviour rather than client-side UX.
- No PII or request-body data is collected.

## Cross-references

- CS42 — origin clickstop for the ProgressiveLoader retry path.
