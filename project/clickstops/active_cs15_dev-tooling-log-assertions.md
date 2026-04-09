# Clickstop CS15: Dev Tooling & Log Assertions

**Status:** 🔄 Active
**Goal:** Consolidate dev server scripts, integrate log capture into e2e tests, and add CI log assertion tests.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS15-90 | Unified dev server script | ✅ Done | — | `scripts/dev-server.js`: HTTPS + log capture by default. Replaces standalone `log-wrapper.js`. npm scripts: `dev:full`, `dev:log`. |
| CS15-91 | E2e log capture integration | ⬜ Pending | CS15-90 | Playwright webServer uses dev-server.js to capture logs during test runs. Log file path configurable via env. |
| CS15-92 | Log assertion tests | ⬜ Pending | CS15-91 | Post-test assertion: no ERROR-level entries during clean e2e run. Catches silent failures and unexpected error paths. |
| CS15-93 | CI log artifact upload | ⬜ Pending | CS15-92 | On e2e failure in CI, upload captured log file as GitHub Actions artifact for debugging. |
| CS15-94 | Production log format validation | ⬜ Pending | CS15-91 | Assert JSON structure in NODE_ENV=production mode: required fields (level, time, msg, req.id), no pretty-print leaking. |

## Design Decisions

No clickstop-specific design decision table yet.

## Notes

**Parallelism:** CS15-91 first, then CS15-92+CS15-93+CS15-94 can run in parallel.
