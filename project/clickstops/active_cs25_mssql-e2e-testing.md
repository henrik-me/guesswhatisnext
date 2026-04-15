# CS25 — MSSQL E2E Testing (Expanded Scope)

**Status:** 🔄 In Progress
**Goal:** MSSQL as a supported local dev container with HTTPS, logging, telemetry (including OTel trace verification), cold-start simulation, and per-test server log correlation. Run the full E2E suite against the MSSQL + Caddy HTTPS stack and add coverage for HTTPS behavior, structured logging, OTel traces, and cold-start UX with real server delays.

**Deferred from:** [CS19 — Community Puzzle Navigation & Testing](done/done_cs19_community-puzzle-navigation.md) (task CS19-4)
**Reason deferred:** Docker MSSQL E2E testing requires additional infrastructure setup beyond the scope of the CS19 navigation changes. The MSSQL Docker stack (`docker-compose.mssql.yml`) was set up as part of CS18 but E2E test automation against it has not been implemented yet.

---

## Tasks

### Phase 0: Stabilize MSSQL Docker Stack (🖥️ Local)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-0a | Fix SYSTEM_API_KEY mismatch | ⬜ Pending | Change `docker-compose.mssql.yml` to use `SYSTEM_API_KEY=test-system-api-key` matching Playwright config. Fixes 5 known container E2E failures. |
| CS25-0b | Add HOST_PORT support | ⬜ Pending | Port parameterization for multi-agent isolation. |
| CS25-0c | Add DB readiness wait | ⬜ Pending | Wait for `/api/health` with `database.status=ok`, not just `/healthz`. |
| CS25-0d | Add convenience npm scripts | ⬜ Pending | `dev:mssql`, `dev:mssql:down`, `test:e2e:mssql`. |
| CS25-0e | Pin & mirror MSSQL image to GHCR | ⬜ Pending | Pin to specific CU tag (e.g., `2022-CU16-ubuntu-22.04`) instead of `:2022-latest`. Push pinned image to `ghcr.io/henrik-me/mssql-server:<tag>` for fast CI pulls and Docker Hub rate-limit avoidance. Also mirror OTLP collector image. Document version update process. |
| CS25-0f | Verify Docker Compose v2 requirement | ⬜ Pending | Compose file uses `services:` without `version:` key (Compose v2+ format). Add version check to npm scripts (`docker compose version`), document minimum requirement in INSTRUCTIONS.md. |

### Phase 1: Run Existing E2E Suite Against MSSQL (🖥️ Local)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-1a | Create MSSQL Playwright config | ⬜ Pending | `BASE_URL=https://localhost` (Caddy), `SYSTEM_API_KEY=test-system-api-key`, `ignoreHTTPSErrors=true`. |
| CS25-1b | Run full E2E suite against MSSQL | ⬜ Pending | Run all 68 tests, identify and fix MSSQL-specific failures. |
| CS25-1c | Document MSSQL E2E results | ⬜ Pending | Record pass/fail and any MSSQL-specific fixes. |

### Phase 2: HTTPS / Security Header E2E Tests (🖥️ Local)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-2a | Caddy HTTP→HTTPS redirect test | ⬜ Pending | Hit `http://localhost:3001`, verify redirect to HTTPS. Tests proxy layer. |
| CS25-2b | HSTS header test | ⬜ Pending | Verify `Strict-Transport-Security` header (Helmet). |
| CS25-2c | CSP header test | ⬜ Pending | Verify `Content-Security-Policy` with expected directives. |
| CS25-2d | Security headers test | ⬜ Pending | X-Content-Type-Options, X-Frame-Options, Referrer-Policy. |

### Phase 3: Per-Test Server Log Capture (🖥️ Local)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-3a | Per-test log-capture fixture | ⬜ Pending | Playwright fixture: `docker compose logs --since <timestamp>` per test, attach to HTML report. |
| CS25-3b | ERROR/FATAL flagging per test | ⬜ Pending | Parse pino level 50/60, annotate test on server errors. |
| CS25-3c | Log format assertions | ⬜ Pending | Verify container logs are structured JSON with expected fields. |
| CS25-3d | Full E2E log summary | ⬜ Pending | Post-run `docker compose logs app` to `test-results/` + aggregate classifier. |
| CS25-3e | Log capture overhead monitoring | ⬜ Pending | Measure total log capture time across all tests. Warn in CI output if >60s, fail/alert if >120s. Include the measurement in test artifacts so regressions are visible. |

### Phase 4: OTel Trace Verification (🖥️ Local)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-4a | OTLP exporter fallback in telemetry.js | ⬜ Pending | ~10 line change: use `@opentelemetry/exporter-trace-otlp-http` when `OTEL_EXPORTER_OTLP_ENDPOINT` set and no Azure conn string. |
| CS25-4b | Add OTLP collector to compose stack | ⬜ Pending | `otel/opentelemetry-collector` (~50MB) with file exporter on shared volume. |
| CS25-4c | Add exporter-trace-otlp-http dependency | ⬜ Pending | Optional dep for local/CI trace verification. Pin to version compatible with existing `@opentelemetry/sdk-node@0.214.0`. Add note in INSTRUCTIONS.md that OTel packages must be updated together. |
| CS25-4d | E2E trace assertions | ⬜ Pending | Verify spans exist, attributes correct, trace_ids correlate with logs. |
| CS25-4e | Integrate OTel into test:e2e:mssql | ⬜ Pending | Start collector, run tests, assert traces, include in artifacts. |

### Phase 5: Cold Start UX Testing with Real Delays (🖥️ Local)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-5a | Create delay-enabled compose profile | ⬜ Pending | `NODE_ENV=development` profile with `GWN_DB_DELAY_*` passthrough. Delay middleware is disabled in production. |
| CS25-5b | Add npm script for cold-start mode | ⬜ Pending | `dev:mssql:coldstart` with default delay pattern. |
| CS25-5c | E2E tests with real server delays | ⬜ Pending | Progressive-loading tests against real delay middleware (not client-side mocks). |
| CS25-5d | Toggle documentation | ⬜ Pending | Document cold start on/off via compose profiles. |

### Phase 6: CI Integration (☁️ GitHub)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-6a | Add MSSQL + OTLP to staging deploy | ⬜ Pending | Update `staging-deploy.yml`: add MSSQL (from GHCR mirror) and OTLP collector as service containers in the ephemeral smoke test job. App configured with `DATABASE_URL` pointing to MSSQL service. Validates MSSQL compatibility + trace pipeline on every staging deploy. Only after all local phases (0-5) are proven. |
| CS25-6b | Evaluate separate MSSQL E2E workflow | ⬜ Pending | Assess whether a separate manual/weekly workflow is still needed beyond staging deploy coverage (CS25-6a). May be useful for deeper testing (cold start, full Caddy HTTPS) that staging doesn't cover. |

### Phase 7: Documentation (📝 Docs)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-7a | Update CS25 clickstop file | ⬜ Pending | Final status, PR references, completion checklist. |
| CS25-7b | Update CONTEXT.md | ⬜ Pending | Task counts, known issues. |
| CS25-7c | Update INSTRUCTIONS.md | ⬜ Pending | MSSQL local dev instructions, `dev:mssql` scripts. |
| CS25-7d | Update README.md | ⬜ Pending | Container setup for local dev (MSSQL + Caddy + OTLP) and CI integration (staging deploy service containers). |

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
- **CI model:** Staging deploy runs MSSQL + OTLP as service containers on every deploy (CS25-6a), using GHCR-mirrored images (CS25-0e). This is the primary CI validation path. Separate MSSQL E2E workflow is optional for deeper testing (cold start, Caddy HTTPS). PR CI skips MSSQL/OTel (unit tests sufficient).
- **Version pinning:** MSSQL image pinned to specific CU tag (not `:latest`). OTel packages pinned to compatible versions and updated together. Docker Compose v2 minimum requirement verified in scripts.
- **Log capture monitoring:** Total per-test log capture overhead measured and reported. Warn at >60s, alert/fail at >120s to catch regressions early.

---

## Dependencies

```
🖥️ LOCAL VALIDATION
───────────────────
Phase 0 (stabilize stack + GHCR mirrors)
   │
   ▼
Phase 1 (run existing E2E on MSSQL)
   │
   ├──→ Phase 2 (HTTPS / security headers)
   ├──→ Phase 3 (per-test log capture)
   ├──→ Phase 4 (OTel trace verification)
   └──→ Phase 5 (cold start UX)

☁️ GITHUB CI (after all local phases proven)
─────────────────────────────────────────────
      Phases 0-5 all complete
            │
            └──→ Phase 6 (staging deploy + optional separate workflow)

📝 DOCS
───────
      Phase 6 complete
            │
            └──→ Phase 7 (documentation)
```

Phases 2, 3, 4, 5 can run in parallel after Phase 1. Phase 6 only begins after all local work is validated.
