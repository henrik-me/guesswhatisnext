# Clickstop CS13: Observability & Logging

**Status:** ✅ Complete
**Completed:** Phase 13 complete

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS13-70 | Logger foundation + request logging | ✅ Done | — | Install Pino + pino-http + pino-pretty (dev). Create `server/logger.js` singleton, add `LOG_LEVEL` to config.js, add pino-http middleware before routes. JSON in staging/prod, pretty-print in dev. |
| CS13-71 | Centralized error handler + replace console.* | ✅ Done | CS13-70 | Add Express error-handling middleware at end of chain. Replace all 22 `console.*` calls with structured `logger.*` at appropriate levels. |
| CS13-72 | Auth & user activity logging | ✅ Done | CS13-70 | Log login/logout/registration at info, rate limits and auth failures at warn. Log WS connection/disconnection events. Add userId context to log entries. |
| CS13-73 | Client-side error reporting | ✅ Done | CS13-70 | Create `POST /api/telemetry/errors` endpoint (rate-limited, no auth). Add `window.onerror` and `unhandledrejection` handlers in client JS. Batch/debounce (max 10/min per client). |
| CS13-74 | OpenTelemetry SDK + Azure Monitor | ✅ Done | CS13-73 | Install `@opentelemetry/sdk-node` + `@azure/monitor-opentelemetry-exporter`. Create `server/telemetry.js` bootstrap. Auto-instrument HTTP/Express/DB. Provision App Insights (staging + prod). |
| CS13-75 | Environment-specific log configuration | ✅ Done | CS13-74 | Dev: debug + pretty-print + no OTel. Staging: info + JSON + OTel → Azure Monitor. Prod: info + JSON + OTel + sensitive data redaction + trace ID correlation. |
| CS13-76 | Logging tests + documentation | ✅ Done | CS13-75 | Unit tests for logger config, client error endpoint, error middleware. Update INSTRUCTIONS.md with logging conventions (when to use each level, structured context, correlation). |

## Design Decisions

No phase-specific design decision table.

**Log Levels:** trace (ultra-verbose) → debug (dev diagnostics) → info (normal operations) → warn (handled anomalies) → error (failures) → fatal (process crash).

## Notes

**Parallelism:** All Phase 13 work complete. Logging conventions documented in INSTRUCTIONS.md § 4.
