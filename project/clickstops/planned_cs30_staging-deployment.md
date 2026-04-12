# Clickstop CS30: Staging Deployment & Validation

**Status:** ⬜ Planned
**Goal:** Deploy the latest main branch to Azure staging environment and validate that all features work correctly. This is a prerequisite for CS31 (production deployment).

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS30-1 | Trigger staging deployment | ⬜ Pending | — | Run `staging-deploy.yml` via workflow_dispatch. Monitor build, push, smoke tests, and Azure deployment. |
| CS30-2 | Verify staging health | ⬜ Pending | CS30-1 | Confirm `/api/health` returns OK, check Azure Container App revision is running, verify DB self-init completed. |
| CS30-3 | Validate core features on staging | ⬜ Pending | CS30-2 | Manual/automated validation: auth (register/login), puzzles, scores, leaderboard, multiplayer, community submissions, achievements. |
| CS30-4 | Validate recent changes on staging | ⬜ Pending | CS30-2 | Verify CS14 (community puzzle UX), CS19 (puzzle navigation), CS20 (auth UX if merged), CS22 (answer randomization) work correctly on staging. |
| CS30-5 | Document staging validation results | ⬜ Pending | CS30-3, CS30-4 | Record validation results, any issues found, and staging image SHA for production promotion. |

## Prerequisites

- All target clickstops merged to main
- `staging-deploy.yml` workflow functional
- Azure staging environment (`gwn-staging`) provisioned
- Required secrets configured: `AZURE_CREDENTIALS`, `GHCR_PAT`, `JWT_SECRET`, `SYSTEM_API_KEY`
- Required variables configured: `STAGING_URL`, `CANONICAL_HOST`, `GHCR_USERNAME`

## Notes

- Staging auto-deploy is disabled (`STAGING_AUTO_DEPLOY=false`). Must trigger manually via workflow_dispatch.
- Staging uses ephemeral local SQLite (not Azure SQL). Production uses Azure SQL free tier.
- On successful validation, the same image SHA will be promoted to production in CS31.
