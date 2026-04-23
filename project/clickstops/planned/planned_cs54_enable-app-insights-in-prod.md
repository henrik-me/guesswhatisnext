# CS54 — Enable Azure Application Insights in production

**Status:** ⬜ Planned
**Origin:** Discovered during CS53-1 (2026-04-23). When pulling logs to investigate the cold-start retry hiccup, we found that the production Container App has no `APPLICATIONINSIGHTS_CONNECTION_STRING` env var set. The OTel SDK is wired and ready (`server/telemetry.js`) — it just falls back to no-export. As a result, neither `traces` nor `requests` tables exist for the prod resource in Application Insights; we can only query Container Apps console stdout via Log Analytics (`ContainerAppConsoleLogs_CL`).

## Goal

Enable Application Insights in production so future investigations have access to:
- Structured `requests` table (HTTP req/resp pairs with duration, status, name, id)
- `dependencies` table (mssql connection attempts, durations, success/fail)
- `exceptions` table (typed stack traces with request correlation)
- `traces` table (Pino logs with structured `customDimensions`)
- Distributed tracing via OTel `trace_id`/`span_id` already injected by `logger.js`

This eliminates the need for ad-hoc `parse_json(Log_s)` extraction over Container App console logs and unlocks proper KQL across HTTP and DB layers.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS54-1 | Provision an Application Insights resource for prod (or reuse an existing one in the gwn-production resource group). Capture the connection string. | ⬜ Pending | Use workspace-based App Insights so it lives in the same Log Analytics workspace as Container Apps logs. |
| CS54-2 | Add `APPLICATIONINSIGHTS_CONNECTION_STRING` as a secret env var on the prod Container App (and staging if it's also missing). Verify deploy workflow propagates it. | ⬜ Pending | Check `.github/workflows/prod-deploy.yml` and `staging-deploy.yml` for env var wiring. |
| CS54-3 | Deploy and verify: confirm `traces`, `requests`, `dependencies`, `exceptions` tables populate in App Insights within 5 min of restart. | ⬜ Pending | Smoke test: hit `/api/health` then `/api/scores/leaderboard?mode=freeplay&period=alltime`, confirm a `requests` row appears. |
| CS54-4 | Document KQL examples in OPERATIONS.md (or a new `docs/observability.md`) so future incident investigations can hit the ground running. Include the CS53 queries adapted to App Insights tables. | ⬜ Pending | Optional but high-value follow-through. |

## Acceptance Criteria

- `APPLICATIONINSIGHTS_CONNECTION_STRING` is set on prod Container App.
- `traces`, `requests`, `dependencies`, `exceptions` tables exist and populate continuously in App Insights for the prod resource.
- A documented KQL example bundle exists for common incident queries.

## Will not be done as part of this clickstop

- Custom metrics or alerts beyond what OTel auto-instrumentation provides — that's CS47's scope (ProgressiveLoader telemetry & alerting).
- Reworking `server/telemetry.js` — it already supports App Insights export via the connection string; only env-var wiring is missing.
- Backfilling historical incident data — App Insights only sees forward from when it's enabled.

## Relationship to other clickstops

- **CS53** — discovered this gap; CS53 finishes with Container Apps logs only. Future incident investigations benefit from CS54.
- **CS47 (planned)** — ProgressiveLoader UX telemetry + alerting. CS47 is *much* easier with App Insights in place; CS54 is effectively a prerequisite.
