# CS25 — MSSQL E2E Testing (Expanded Scope)

**Status:** ✅ Complete
**Goal:** MSSQL as a supported local dev container with HTTPS, logging, telemetry (including OTel trace verification), cold-start simulation, and per-test server log correlation. Run the full E2E suite against the MSSQL + Caddy HTTPS stack and add coverage for HTTPS behavior, structured logging, OTel traces, and cold-start UX with real server delays.

**Deferred from:** [CS19 — Community Puzzle Navigation & Testing](done_cs19_community-puzzle-navigation.md) (task CS19-4)
**Reason deferred:** Docker MSSQL E2E testing requires additional infrastructure setup beyond the scope of the CS19 navigation changes. The MSSQL Docker stack (`docker-compose.mssql.yml`) was set up as part of CS18 but E2E test automation against it has not been implemented yet.

---

## Tasks

### Phase 0: Stabilize MSSQL Docker Stack (🖥️ Local) — PR [#183](https://github.com/henrik-me/guesswhatisnext/pull/183)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-0a | Fix SYSTEM_API_KEY mismatch | ✅ Done | Changed `docker-compose.mssql.yml` to use `SYSTEM_API_KEY=test-system-api-key` matching Playwright config. |
| CS25-0b | Add HOST_PORT support | ✅ Done | Port parameterization for multi-agent isolation. |
| CS25-0c | Add DB readiness wait | ✅ Done | Wait for `/api/health` with `database.status=ok`, not just `/healthz`. |
| CS25-0d | Add convenience npm scripts | ✅ Done | `dev:mssql`, `dev:mssql:down`, `test:e2e:mssql`. |
| CS25-0e | Pin MSSQL image version | ✅ Done | Pinned to `2022-CU17-ubuntu-22.04`. CI pulls directly from MCR (no GHCR mirror needed — CS25-6a skipped). |
| CS25-0f | Verify Docker Compose v2 requirement | ✅ Done | Added `scripts/check-compose-v2.js` version check to npm scripts. |

### Phase 1: Run Existing E2E Suite Against MSSQL (🖥️ Local) — PR [#184](https://github.com/henrik-me/guesswhatisnext/pull/184)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-1a | Create MSSQL Playwright config | ✅ Done | `BASE_URL=https://localhost`, `SYSTEM_API_KEY=test-system-api-key`, `ignoreHTTPSErrors=true`. |
| CS25-1b | Run full E2E suite against MSSQL | ✅ Done | All existing tests pass against MSSQL + Caddy HTTPS stack. |
| CS25-1c | Document MSSQL E2E results | ✅ Done | Results recorded in PR. |

### Phase 2: HTTPS / Security Header E2E Tests (🖥️ Local) — PR [#185](https://github.com/henrik-me/guesswhatisnext/pull/185)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-2a | Caddy HTTP→HTTPS redirect test | ✅ Done | Verifies redirect from `http://localhost:3001` to HTTPS. |
| CS25-2b | HSTS header test | ✅ Done | Verifies `Strict-Transport-Security` header (Helmet). |
| CS25-2c | CSP header test | ✅ Done | Verifies `Content-Security-Policy` with expected directives. |
| CS25-2d | Security headers test | ✅ Done | X-Content-Type-Options, X-Frame-Options, Referrer-Policy. |

### Phase 3: Per-Test Server Log Capture (🖥️ Local) — PR [#188](https://github.com/henrik-me/guesswhatisnext/pull/188)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-3a | Per-test log-capture fixture | ✅ Done | Playwright fixture captures `docker compose logs --since <timestamp>` per test, attaches to HTML report. |
| CS25-3b | ERROR/FATAL flagging per test | ✅ Done | Parses pino level 50/60, annotates test on server errors. |
| CS25-3c | Log format assertions | ✅ Done | Verifies container logs are structured JSON with expected fields. |
| CS25-3d | Full E2E log summary | ✅ Done | Post-run `docker compose logs app` to `test-results/` + aggregate classifier. |
| CS25-3e | Log capture overhead monitoring | ✅ Done | Measures total log capture time across all tests. Warns in CI output if >60s, fails/alerts if >120s. |

### Phase 4: OTel Trace Verification (🖥️ Local) — PR [#186](https://github.com/henrik-me/guesswhatisnext/pull/186)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-4a | OTLP exporter fallback in telemetry.js | ✅ Done | ~10 line change: uses `@opentelemetry/exporter-trace-otlp-http` when `OTEL_EXPORTER_OTLP_ENDPOINT` set and no Azure conn string. |
| CS25-4b | Add OTLP collector to compose stack | ✅ Done | `otel/opentelemetry-collector:0.100.0` with file exporter on shared volume. |
| CS25-4c | Add exporter-trace-otlp-http dependency | ✅ Done | Pinned to version compatible with existing `@opentelemetry/sdk-node@0.214.0`. OTel packages must be updated together. |
| CS25-4d | E2E trace assertions | ✅ Done | Verifies spans exist, attributes correct, trace_ids correlate with logs. |
| CS25-4e | Integrate OTel into test:e2e:mssql | ✅ Done | Collector starts with compose, tests assert traces, results included in artifacts. |

### Phase 5: Cold Start UX Testing with Real Delays (🖥️ Local) — PR [#187](https://github.com/henrik-me/guesswhatisnext/pull/187)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-5a | Create delay-enabled compose profile | ✅ Done | `docker-compose.mssql.delay.yml` overlay with `NODE_ENV=development` for delay middleware passthrough. |
| CS25-5b | Add npm script for cold-start mode | ✅ Done | `dev:mssql:coldstart` with default 45s/16s/0/0/0/0 delay pattern. |
| CS25-5c | E2E tests with real server delays | ✅ Done | Progressive-loading tests against real delay middleware (not client-side mocks). |
| CS25-5d | Toggle documentation | ✅ Done | Documented cold start on/off via compose overlay in `docker-compose.mssql.delay.yml`. |

### Phase 6: CI Integration (☁️ GitHub)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-6a | Push MSSQL image to GHCR | ✅ Done | Pushed `ghcr.io/henrik-me/mssql-server:2022-CU17-ubuntu-22.04`. Made public for CI access. |
| CS25-6b | Add MSSQL + OTLP to staging deploy | ✅ Done | PR [#190](https://github.com/henrik-me/guesswhatisnext/pull/190), fix [#192](https://github.com/henrik-me/guesswhatisnext/pull/192). MSSQL + OTLP as service containers. 68 tests pass against MSSQL in staging. |
| CS25-6c | Evaluate separate MSSQL E2E workflow | ✅ Done | Not needed — staging deploy validates MSSQL + OTLP on every deploy. Cold-start testing (11 skipped tests) is local-only by design. |

### Phase 7: Documentation (📝 Docs) — PR [#189](https://github.com/henrik-me/guesswhatisnext/pull/189)

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS25-7a | Update CS25 clickstop file | ✅ Done | Phase 0-5 tasks marked done with PR references. |
| CS25-7b | Update CONTEXT.md | ✅ Done | Task counts, test inventory, dev scripts updated. |
| CS25-7c | Update INSTRUCTIONS.md | ✅ Done | MSSQL local dev instructions, milestone timing requirement. |
| CS25-7d | Update README.md | ✅ Done | MSSQL stack docs, cold start overlay, CI integration (planned). |

---

## Design Decisions

- **Scope:** E2E browser tests against MSSQL + HTTPS + logging + telemetry + cold start. Not unit-level adapter tests (those exist in `tests/mssql-adapter.test.js`).
- **Docker stack:** Uses existing `docker-compose.mssql.yml` with SQL Server 2022 + Caddy HTTPS proxy + OTLP collector.
- **Not the default yet:** Available as `npm run dev:mssql` — promoted to default only after proven stable.
- **Two modes:** Prod-like (NODE_ENV=production) for HTTPS/security/logging tests vs dev-mode (NODE_ENV=development via compose profile) for cold-start simulation. Delay middleware is disabled in production.
- **Per-test log capture:** Playwright fixture captures `docker compose logs --since <timestamp>` per test, attaches to HTML report, flags ERROR/FATAL. ~50-100ms overhead per test.
- **OTel trace verification:** OTLP collector container (~50MB) receives spans via OTLP HTTP exporter fallback in `server/telemetry.js`. Present locally; planned for staging CI (Phase 6). Skipped in PR CI. Production uses real Azure Monitor.
- **OTLP exporter fallback:** `server/telemetry.js` gains a ~10 line conditional: when `OTEL_EXPORTER_OTLP_ENDPOINT` is set and `APPLICATIONINSIGHTS_CONNECTION_STRING` is absent, use `@opentelemetry/exporter-trace-otlp-http`. Production path (Azure Monitor) is unaffected.
- **No secure-cookie tests:** Auth uses localStorage + Authorization headers, not cookies.
- **Cold start toggle:** Compose profiles, not hot-reload. Stop and restart with different profile.
- **CI model (planned — Phase 6):** Staging deploy will run MSSQL + OTLP as service containers on every deploy (CS25-6b), pulling directly from MCR (CS25-6a skipped — MCR has no rate limits). This will be the primary CI validation path. Separate MSSQL E2E workflow is optional for deeper testing (cold start, Caddy HTTPS). PR CI skips MSSQL/OTel (unit tests sufficient).
- **Version pinning:** MSSQL image pinned to specific CU tag (not `:latest`). OTel packages pinned to compatible versions and updated together. Docker Compose v2 minimum requirement verified in scripts.
- **Log capture monitoring:** Total per-test log capture overhead measured and reported. Warn at >60s, alert/fail at >120s to catch regressions early.

---

## Dependencies

```
🖥️ LOCAL VALIDATION
───────────────────
Phase 0 (stabilize stack)
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
