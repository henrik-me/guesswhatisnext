# Clickstop CS31: Production Deployment & Verification

**Status:** ⬜ Planned
**Goal:** Deploy the staging-validated image to Azure production environment and verify it works correctly.

**Depends on:** [CS30 — Staging Deployment & Validation](planned_CS30_staging-deployment.md)

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS31-1 | Trigger production deployment | ⬜ Pending | CS30 ✅ | Run `prod-deploy.yml` via workflow_dispatch with the staging-validated image SHA and `confirm=production`. |
| CS31-2 | Verify production health | ⬜ Pending | CS31-1 | Confirm `/api/health` returns OK, Azure Container App revision running, Azure SQL DB accessible, auto-pause recovery works. |
| CS31-3 | Validate production features | ⬜ Pending | CS31-2 | Smoke test core flows: auth, puzzles, scores, leaderboard, multiplayer, community submissions. Verify HTTPS, security headers, CORS. |
| CS31-4 | Verify monitoring & rollback readiness | ⬜ Pending | CS31-2 | Confirm health monitor workflow runs, Application Insights telemetry flowing, rollback procedure documented with previous image SHA. |
| CS31-5 | Document production deployment | ⬜ Pending | CS31-3, CS31-4 | Record deployed image SHA, validation results, any issues. Update CONTEXT.md deployment status. |

## Prerequisites

- CS30 (staging) fully validated with documented image SHA
- `prod-deploy.yml` workflow functional
- Azure production environment (`gwn-production`) provisioned
- Required secrets: `AZURE_CREDENTIALS`, `GHCR_PAT`, `JWT_SECRET`, `SYSTEM_API_KEY`, `DATABASE_URL`, `PROD_URL`
- Production environment reviewers configured for manual approval gate

## Notes

- Production uses Azure SQL free tier (auto-pauses after ~1hr idle, cold start 10-30s).
- Same image bytes as staging — no rebuild, no drift.
- Auto-rollback on health check failure (reverts to previous SHA-tagged image + creates GitHub issue).
- `release/production` branch fast-forwarded to deployed commit after successful verification.
