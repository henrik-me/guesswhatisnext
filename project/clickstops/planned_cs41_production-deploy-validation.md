# CS41 — Production Deploy Validation

**Status:** ⬜ Planned
**Goal:** Add comprehensive post-deploy validation to the production pipeline beyond basic health checks. Ensure functional correctness, database connectivity, performance baselines, and telemetry are verified on every production deploy.

**Origin:** Identified during CS25 production deploy — the current pipeline only checks `/api/health` returns HTTP 200. It doesn't verify database status, functional endpoints, response times, or telemetry.

---

## Current State

The production deploy pipeline (`prod-deploy.yml`) validates:
- ✅ Image exists in GHCR
- ✅ Container App deploys and starts
- ✅ `/api/health` returns HTTP 200 (8 attempts, 30s apart)
- ✅ Auto-rollback on health check failure

**Gaps identified:**

| Gap | Risk |
|-----|------|
| Health check doesn't verify `checks.database.status=ok` | Deploy could succeed with broken DB (e.g., Azure SQL auto-pause not resumed) |
| No functional smoke tests | Regression in auth, scores, puzzles could go live undetected |
| No response time measurement | Performance regression undetected |
| No telemetry verification | Silent Azure Monitor breakage |
| Rollback doesn't verify rolled-back version is healthy | Double failure possible |

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS41-1 | Add functional smoke tests to prod deploy | ⬜ Pending | After health check passes, run a subset of staging smoke tests: register test user, submit score, fetch puzzles. Use a dedicated test user prefix to avoid polluting real data. Clean up test data after. |
| CS41-2 | Add response time baselines | ⬜ Pending | Measure response times for health, puzzles, leaderboard endpoints during smoke tests. Warn if >2s (Azure SQL cold start), fail if >30s (something is broken). Log times in workflow output for trend analysis. |
| CS41-3 | Verify telemetry pipeline | ⬜ Pending | After deploy, check Azure Monitor for recent traces from the new revision. May require Azure CLI queries against App Insights. Evaluate feasibility — might need `APPLICATIONINSIGHTS_CONNECTION_STRING` accessible in the workflow. |
| CS41-4 | Improve rollback verification | ⬜ Pending | After rollback, verify the rolled-back revision is healthy (same health check loop). Currently rollback just deploys and does a single curl check. |
| CS41-5 | Add deployment summary annotation | ⬜ Pending | At end of successful deploy, post a GitHub Actions summary with: image tag, revision name, health check timing, response times, test results. Makes deploy history easy to review. |

---

## Design Considerations

- **No test data pollution:** Smoke tests must use identifiable test usernames (e.g., `prod-smoke-{timestamp}`) and clean up after themselves. Production data must not be affected.
- **Azure SQL cold start:** The database may be auto-paused when the deploy runs. First health check may take 10-30s while Azure SQL resumes. Response time baselines must account for this.
- **Rollback safety:** If smoke tests fail, trigger the existing rollback mechanism. The smoke test step should set an output that the rollback step checks.
- **Keep it fast:** Production deploy is already 5m 30s. Smoke tests should add no more than 60s. Response time checks are part of the smoke test timing.
