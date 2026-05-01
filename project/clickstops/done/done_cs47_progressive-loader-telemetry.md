# CS47 — Progressive Loader Telemetry

**Status:** ✅ Done — merged via [PR #322](https://github.com/henrik-me/guesswhatisnext/pull/322) (squash 836aa48, 2026-04-30T07:11Z)
**Depends on:** CS42
**Parallel-safe with:** any
**Goal:** Emit lightweight client telemetry from ProgressiveLoader on exit of the 503-retry warmup path so we can observe in production how often the path fires, how long real users wait, and how often the 35s wall-clock cap exhausts. Replaces "test cold-start in production" (not safely possible) with continuous observation.

**Scope carve-out (2026-04-29):** Originally CS47 also included the Azure Monitor alert (was CS47-4) and workbook/dashboard (was CS47-5). Both depend on ≥1 week of real prod baseline data to set thresholds and design the panels meaningfully — and prod cold-start telemetry is currently noisy / not representative because Azure SQL is in capacity-exhausted state. Both items are moved to **[CS72 — Progressive Loader Warmup Alert And Dashboard](../planned/planned_cs72_progressive-loader-warmup-alert-and-dashboard.md)** (renumbered from CS70 on 2026-05-01 to resolve a number collision with CS70 role-change JWT invalidation), picked up after CS47 ships and the DB is healthy. CS47 now ends at "telemetry pipeline shipped + verified end-to-end against staging AI from a local container, with `environment` tag in place so dev traffic never trips a future prod alert."

**Origin:** Deferred from CS42 (see `project/clickstops/done/done_cs42_production-cold-start-messages.md` — Plan Refinement Round 2, finding #7, rubber-duck critique 2026-04-21). Originally proposed as CS42-5b, the rubber-duck review (gpt-5.4) flagged it as scope creep for a UX-polish clickstop: the existing `/api/telemetry/errors` endpoint is specifically error-shaped, and adding generic client UX telemetry + alerting is a new observability feature, not a small UX fix. CS42 is closing with E2E (CS42-5a/5b) + one-time manual prod verification (CS42-5c) as the evidence bar; CS47 adds the continuous-observation layer once CS42 lands.

---

## Problem

After CS42 ships, there is no signal from production telling us whether the ProgressiveLoader 503-retry path is actually firing, how long real users wait, or whether the 35s wall-clock cap ever exhausts (which would indicate Azure SQL warmup genuinely exceeds budget or a backend regression). Manual sampling via CS42-5c is a one-shot snapshot, not ongoing evidence.

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS47-1 | Design telemetry schema | ✅ Done in [PR #322](https://github.com/henrik-me/guesswhatisnext/pull/322) | Single event per warmup-retry session emitted on exit. Fields: `event` (constant `progressiveLoader.warmupExhausted`), `screen` (one of the `MESSAGE_SETS` keys: `leaderboard` / `profile` / `achievements` / `community`), `attempts` (int), `totalWaitMs` (int), `outcome` ∈ {`success`, `cap-exhausted`, `aborted`}, `environment` (derived server-side from `NODE_ENV` + a new `GWN_ENV` override so local-container traffic is filterable: values `local-container` / `staging` / `production`). 100% sampling. New route `POST /api/telemetry/ux-events` (do **not** reuse `/api/telemetry/errors` — it's error-shaped). |
| CS47-2 | Client emission | ✅ Done in [PR #322](https://github.com/henrik-me/guesswhatisnext/pull/322) | In `public/js/progressive-loader.js`, emit a single event on exit from the retry loop (success or cap-exhausted) via `navigator.sendBeacon` (fall back to `fetch(..., { keepalive: true })` if `sendBeacon` unavailable). Fire-and-forget; never block the UI. No PII; no URLs; no request bodies. Same boot-quiet posture as other beacons: do not retry on failure. |
| CS47-3a | Server ingestion — Pino structured log | ✅ Done in [PR #322](https://github.com/henrik-me/guesswhatisnext/pull/322) | New `POST /api/telemetry/ux-events` handler in `server/routes/telemetry.js`. Validates shape (allowlist `event` + `outcome`; numeric range checks on `attempts`/`totalWaitMs`; clamp `screen` to known set), shares `telemetryLimiter` rate limit, no auth required (same as `/api/telemetry/auth-deadline-exhausted`). Server attaches `environment` from a new `getDeployEnvironment()` helper (returns `process.env.GWN_ENV || (NODE_ENV mapping)`). Emits `logger.warn({ event, screen, attempts, totalWaitMs, outcome, environment })` so it lands in `ContainerAppConsoleLogs_CL.Log_s` in the Azure-deployed environments. **Telemetry validation gate:** confirm the line appears in container logs via `scripts/container-validate.js --mode=transient` (which exercises the warmup path). |
| CS47-3b | Server ingestion — OTel span event (so local-container traffic is workspace-visible) | ✅ Done in [PR #322](https://github.com/henrik-me/guesswhatisnext/pull/322) | In the same handler, also call `trace.getActiveSpan()?.addEvent(name, attributes)` with the same payload (plus `environment`). Reason: Pino → AI log forwarding is not wired (CS54-9 deferred), so Pino lines from local containers never reach `ContainerAppConsoleLogs_CL`. The OTel span-event path **does** flow when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set on the local container; the installed Azure Monitor exporter maps non-exception span events to AI `traces` rows with `message=progressiveLoader.warmupExhausted`, which lets CS47-4 validate the end-to-end pipeline against staging AI from a laptop. Both emission paths share the same field schema so the future CS70 alert KQL can union both tables (or pick whichever lands by then). |
| CS47-4 | Phase B — Local-container → staging AI end-to-end validation | 🟡 Pending — Phase B validation deferred to orchestrator (staging AI conn-string required) | With `APPLICATIONINSIGHTS_CONNECTION_STRING` pointed at the **staging** AI resource and `GWN_ENV=local-container`, run `scripts/container-validate.js --mode=transient` against the local stack. Confirm: (a) Pino warn line appears in local container logs (CS47-3a path); (b) OTel span event shows up in staging AI's `traces` table within ~2 min as `message=progressiveLoader.warmupExhausted` with `customDimensions.environment=local-container`. Capture the KQL used + screenshot/JSON proof in the PR body's `## Telemetry Validation` section. **Does not** install any alert rule — that's CS70. **Does not** require Azure SQL (uses the simulator from CS53-10). |
| CS47-5 | Document KQL building blocks in `docs/observability.md` § B.x | ✅ Done in [PR #322](https://github.com/henrik-me/guesswhatisnext/pull/322) | Two queries: (1) AI `traces` query for the OTel span-event path, filterable by `environment`; (2) `ContainerAppConsoleLogs_CL` query for the Pino path, also filterable by `environment`. Healthy / unhealthy interpretation paragraphs (mirroring § B.15 auth-warmup-deadline). Explicit cross-link to CS70 saying "the alert and workbook built on these queries live in CS70 once ≥1 week of post-deploy baseline data is available." |

---

## Design Considerations

- **Privacy / data minimisation.** No user identifiers; no URL parameters; no request bodies. Only event name, screen name (from `MESSAGE_SETS` key: `leaderboard` / `profile` / `achievements` / `community`), attempt count, total wait ms, outcome, and the server-attached `environment` tag.
- **Sampling.** Warmup retries are low-frequency (one per user per cold start). 100% sampling is fine. If volume becomes a concern, head-sample per session, not per event.
- **Cost.** Azure Monitor log ingestion is per-GB; a small JSON event per cold start should be negligible at current MAU. The expected steady-state ingest from this signal is < 100 MB/month → ≪ $1/month at East US Pay-As-You-Go pricing. The non-trivial monthly cost (alert evaluation ~$1.50/month) lives in CS70, not here.
- **Dual emission rationale (Pino + OTel span event).** Pino lines reach `ContainerAppConsoleLogs_CL` only because Azure Container Apps collects container stdout. Local containers don't run in Container Apps, so their Pino lines never reach the workspace — which would block end-to-end validation of the future alert/dashboard from a laptop. The OTel span-event path piggy-backs on the existing `AzureMonitorTraceExporter` wired in `server/telemetry.js` (already chosen when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set), so a local container with the staging conn-string can land trace/message rows in staging AI tagged `environment=local-container`. CS54-9's "Pino → AI log forwarding" gap is the underlying reason for the dual path; if that gap closes later, the OTel path can be retired.
- **`environment` tag.** Server-derived (not client-trustable): a new `getDeployEnvironment()` helper returns `process.env.GWN_ENV || mapFromNodeEnv(process.env.NODE_ENV)`. Acceptable values: `local-container`, `staging`, `production`. The future CS70 alert query MUST filter on `environment in ('staging','production')` so dev traffic never trips it.
- **Interaction with CS42.** Requires the CS42 retry path (already merged — CS42 is in `done/`).
- **Interaction with current Azure SQL state.** Azure SQL is currently in capacity-exhausted state (CS53 territory), so prod cold-start traffic is not representative. CS47 ships the pipeline regardless because the local-container → staging validation in CS47-4 uses `GWN_SIMULATE_DB_UNAVAILABLE=transient` (CS53-10 simulator) and does not need a healthy Azure SQL. The week-of-real-data threshold tuning lives in CS70 and waits for DB recovery.
- **Not in scope.** Instrumenting other long-running UI operations (score sync, match lobby) — scope creep; do those as separate clickstops if the pattern proves valuable.

## Acceptance

- New `POST /api/telemetry/ux-events` route validates and accepts the documented payload; rejects malformed payloads with 4xx; rate-limited by the existing `telemetryLimiter`.
- Both emission paths fire from `public/js/progressive-loader.js` on every retry-loop exit (success or cap-exhausted) and never block the UI.
- `scripts/container-validate.js --mode=transient` proves the Pino warn line lands in container logs with the documented field set including `environment`.
- With `APPLICATIONINSIGHTS_CONNECTION_STRING` pointed at staging AI and `GWN_ENV=local-container`, the same simulator run produces a trace row in staging AI within ~2 min where `message=progressiveLoader.warmupExhausted` and `customDimensions.environment=local-container`. KQL + proof captured in PR body.
- `docs/observability.md` carries both KQL queries (Pino path + OTel span-event path) with healthy/unhealthy interpretation paragraphs and an explicit cross-link to CS70.
- No PII, no URLs, no request bodies leave the client. The server attaches `environment`; the client cannot influence it.
- Unit tests cover: route validation (happy + each rejection mode), `getDeployEnvironment()` mapping, dual emission firing both Pino and OTel paths.

## Will not be done as part of this clickstop

- **Azure Monitor alert rule.** Provisioning the scheduled query rule + Action Group + threshold tuning. → **[CS72](../planned/planned_cs72_progressive-loader-warmup-alert-and-dashboard.md)**.
- **Azure Monitor workbook / dashboard.** Panels, queries, layout. → **[CS72](../planned/planned_cs72_progressive-loader-warmup-alert-and-dashboard.md)**.
- **Threshold tuning** for the future alert — needs ≥1 week of real prod data with a healthy Azure SQL. → CS72.
- **Production cold-start probe.** This CS does not run real cold-start in prod; the local-container → staging path with the CS53-10 simulator is the validation channel.

## Cross-references

- CS42 (done) — origin clickstop for the ProgressiveLoader retry path.
- CS53-10 (done) — `GWN_SIMULATE_DB_UNAVAILABLE=transient` + `GWN_SIMULATE_COLD_START_FAILS=N` simulator, used by CS47-4 to drive the warmup path during validation.
- CS54-9 (deferred) — Pino → AI log forwarding gap that justifies the dual-emit design.
- [CS72 — Progressive Loader Warmup Alert And Dashboard](../planned/planned_cs72_progressive-loader-warmup-alert-and-dashboard.md) — picks up where CS47 ends (renumbered from CS70 on 2026-05-01 to resolve a number collision).
