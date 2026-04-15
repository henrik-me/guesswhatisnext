# CS25 — MSSQL E2E Testing (Expanded Scope)

**Status:** 🔄 In Progress
**Goal:** MSSQL as a supported local dev container with HTTPS, logging, telemetry (including OTel trace verification), cold-start simulation, and per-test server log correlation. Run the full E2E suite against the MSSQL + Caddy HTTPS stack and add coverage for HTTPS behavior, structured logging, OTel traces, and cold-start UX with real server delays.

**Deferred from:** [CS19 — Community Puzzle Navigation & Testing](done/done_cs19_community-puzzle-navigation.md) (task CS19-4)
**Reason deferred:** Docker MSSQL E2E testing requires additional infrastructure setup beyond the scope of the CS19 navigation changes. The MSSQL Docker stack (`docker-compose.mssql.yml`) was set up as part of CS18 but E2E test automation against it has not been implemented yet.

---

## Tasks

### Phase 0: Stabilize MSSQL Docker Stack

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-0a | Fix SYSTEM_API_KEY mismatch | ⬜ Pending | Change `docker-compose.mssql.yml` to use `SYSTEM_API_KEY=test-system-api-key` matching Playwright config. Fixes 5 known container E2E failures. |
| CS25-0b | Add HOST_PORT support | ⬜ Pending | Port parameterization for multi-agent isolation. |
| CS25-0c | Add DB readiness wait | ⬜ Pending | Wait for `/api/health` with `database.status=ok`, not just `/healthz`. |
| CS25-0d | Add convenience npm scripts | ⬜ Pending | `dev:mssql`, `dev:mssql:down`, `test:e2e:mssql`. |

### Phase 1: Run Existing E2E Suite Against MSSQL

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-1a | Create MSSQL Playwright config | ⬜ Pending | `BASE_URL=https://localhost` (Caddy), `SYSTEM_API_KEY=test-system-api-key`, `ignoreHTTPSErrors=true`. |
| CS25-1b | Run full E2E suite against MSSQL | ⬜ Pending | Run all 68 tests, identify and fix MSSQL-specific failures. |
| CS25-1c | Document MSSQL E2E results | ⬜ Pending | Record pass/fail and any MSSQL-specific fixes. |

### Phase 2: HTTPS / Security Header E2E Tests

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-2a | Caddy HTTP→HTTPS redirect test | ⬜ Pending | Hit `http://localhost:3001`, verify redirect to HTTPS. Tests proxy layer. |
| CS25-2b | HSTS header test | ⬜ Pending | Verify `Strict-Transport-Security` header (Helmet). |
| CS25-2c | CSP header test | ⬜ Pending | Verify `Content-Security-Policy` with expected directives. |
| CS25-2d | Security headers test | ⬜ Pending | X-Content-Type-Options, X-Frame-Options, Referrer-Policy. |

### Phase 3: Per-Test Server Log Capture

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-3a | Per-test log-capture fixture | ⬜ Pending | Playwright fixture: `docker compose logs --since <timestamp>` per test, attach to HTML report. |
| CS25-3b | ERROR/FATAL flagging per test | ⬜ Pending | Parse pino level 50/60, annotate test on server errors. |
| CS25-3c | Log format assertions | ⬜ Pending | Verify container logs are structured JSON with expected fields. |
| CS25-3d | Full E2E log summary | ⬜ Pending | Post-run `docker compose logs app` to `test-results/` + aggregate classifier. |

### Phase 4: OTel Trace Verification

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-4a | OTLP exporter fallback in telemetry.js | ⬜ Pending | ~10 line change: use `@opentelemetry/exporter-trace-otlp-http` when `OTEL_EXPORTER_OTLP_ENDPOINT` set and no Azure conn string. |
| CS25-4b | Add OTLP collector to compose stack | ⬜ Pending | `otel/opentelemetry-collector` (~50MB) with file exporter on shared volume. |
| CS25-4c | Add exporter-trace-otlp-http dependency | ⬜ Pending | Optional dep for local/CI trace verification. |
| CS25-4d | E2E trace assertions | ⬜ Pending | Verify spans exist, attributes correct, trace_ids correlate with logs. |
| CS25-4e | Integrate OTel into test:e2e:mssql | ⬜ Pending | Start collector, run tests, assert traces, include in artifacts. |

### Phase 5: Cold Start UX Testing with Real Delays

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-5a | Create delay-enabled compose profile | ⬜ Pending | `NODE_ENV=development` profile with `GWN_DB_DELAY_*` passthrough. Delay middleware is disabled in production. |
| CS25-5b | Add npm script for cold-start mode | ⬜ Pending | `dev:mssql:coldstart` with default delay pattern. |
| CS25-5c | E2E tests with real server delays | ⬜ Pending | Progressive-loading tests against real delay middleware (not client-side mocks). |
| CS25-5d | Toggle documentation | ⬜ Pending | Document cold start on/off via compose profiles. |

### Phase 6: CI Integration

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-6a | Evaluate CI approach | ⬜ Pending | Service containers vs docker-compose-in-CI. |
| CS25-6b | Add CI workflow/job | ⬜ Pending | MSSQL E2E in CI (likely manual/weekly due to SQL Server startup cost). |
| CS25-6c | Add OTLP collector to staging deploy | ⬜ Pending | Service container in `staging-deploy.yml` smoke tests. Validate trace pipeline on every staging deploy. |
| CS25-6d | Cache MSSQL image | ⬜ Pending | Avoid 1.5GB cold pull per CI run. |

### Phase 7: Documentation

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-7a | Update CS25 clickstop file | ⬜ Pending | Final status, PR references, completion checklist. |
| CS25-7b | Update CONTEXT.md | ⬜ Pending | Task counts, known issues. |
| CS25-7c | Update INSTRUCTIONS.md | ⬜ Pending | MSSQL local dev instructions, `dev:mssql` scripts. |

---

## Design Decisions

- **Scope:** E2E browser tests against MSSQL + HTTPS + logging + telemetry + cold start. Not unit-level adapter tests (those exist in `tests/mssql-adapter.test.js`).
- **Docker stack:** Uses existing `docker-compose.mssql.yml` with SQL Server 2022 + Caddy HTTPS proxy + OTLP collector.
- **Not the default yet:** Available as `npm run dev:mssql` — promoted to default only after proven stable.
- **Two modes:** Prod-like (NODE_ENV=production) for HTTPS/security/logging tests vs dev-mode (NODE_ENV=development via compose profile) for cold-start simulation. Delay middleware is disabled in production.
- **Per-test log capture:** Playwright fixture captures `docker compose logs --since <timestamp>` per test, attaches to HTML report, flags ERROR/FATAL. ~50-100ms overhead per test.
- **OTel trace verification:** OTLP collector container (~50MB) receives spans via OTLP HTTP exporter fallback in `server/telemetry.js`. Present locally and in staging CI; skipped in PR CI. Production uses real Azure Monitor.
- **OTLP exporter fallback:** `server/telemetry.js` gains a ~10 line conditional: when `OTEL_EXPORTER_OTLP_ENDPOINT` is set and `APPLICATIONINSIGHTS_CONNECTION_STRING` is absent, use `@opentelemetry/exporter-trace-otlp-http`. Production path (Azure Monitor) is unaffected.
- **No secure-cookie tests:** Auth uses localStorage + Authorization headers, not cookies.
- **Cold start toggle:** Compose profiles, not hot-reload. Stop and restart with different profile.
- **CI model:** MSSQL E2E as manual/weekly workflow (SQL Server is slow to start). OTLP collector in staging deploy adds negligible overhead.

---

## Dependencies

```
Phase 0 (stabilize stack)
   │
   ▼
Phase 1 (run existing E2E on MSSQL)
   │
   ├──→ Phase 2 (HTTPS / security headers)
   ├──→ Phase 3 (per-test log capture)
   ├──→ Phase 4 (OTel trace verification)
   └──→ Phase 5 (cold start UX)
            │
            ▼
      Phases 2-5 all complete
            │
            ├──→ Phase 6 (CI integration)
            └──→ Phase 7 (documentation)
```

Phases 2, 3, 4, 5 can run in parallel after Phase 1.
