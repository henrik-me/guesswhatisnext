# Clickstop CS28: Staging Deployment & Validation

**Status:** 🔴 Blocked (E2E smoke test failures)
**Goal:** Deploy the latest main branch to Azure staging environment and validate that all features work correctly. This is a prerequisite for CS29 (production deployment).

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS28-1 | Trigger staging deployment | 🔴 Failed | — | Workflow triggered (run 24312714586). Build & push succeeded, but Ephemeral Smoke Test failed (16/46 E2E tests). Azure deploy was skipped. |
| CS28-2 | Verify staging health | ✅ Partial | CS28-1 | Tested against *existing* staging deployment (not new revision). App responds, DB active. `/api/health` returns 401 (requires SYSTEM_API_KEY). |
| CS28-3 | Validate core features on staging | ✅ Partial | CS28-2 | Validated against existing staging. See Feature Validation table below. |
| CS28-4 | Validate recent changes on staging | ⬜ Blocked | CS28-1 | Cannot validate — new revision was not deployed. |
| CS28-5 | Document staging validation results | ✅ Done | CS28-3, CS28-4 | Results documented below. |

## CS28 Staging Deployment Results

### Workflow Run
- **Run ID:** [24312714586](https://github.com/henrik-me/guesswhatisnext/actions/runs/24312714586)
- **Status:** ❌ Failure (smoke test)
- **Head SHA:** `4351585672f103340ba672e7329b1a7777655fd2`
- **Image Tag:** `4351585` (built and pushed to GHCR successfully)
- **Duration:** 2026-04-12T17:51:36Z → 2026-04-12T18:13:46Z (~22 min)

### Job Results
| Job | Status | Notes |
|-----|--------|-------|
| Build & Push Docker Image | ✅ Success | Image pushed to `ghcr.io/henrik-me/guesswhatisnext:4351585` and `:latest` |
| Ephemeral Smoke Test | ❌ Failed | 30 passed, 16 failed. All failures in community/moderation/my-submissions E2E tests |
| Fast-Forward release/staging | ⏭️ Skipped | Depends on smoke-test |
| Deploy to Azure Staging | ⏭️ Skipped | Depends on update-staging-branch |

### Smoke Test Failures (16 tests)
All failures are in community puzzle submission and moderation E2E tests:
- `tests/e2e/community.spec.mjs` — 7 failures (create puzzle auth redirect, onboarding, type selector, image type, options editor, submit with custom options, gallery rendering)
- `tests/e2e/moderation.spec.mjs` — 2 failures (preview rendering, bulk approve flow)
- `tests/e2e/my-submissions.spec.mjs` — 7 failures (submit/view/edit/delete submissions, notifications)

Root cause appears to be `submitPuzzle` feature flag is `false` in staging, causing community puzzle submission API calls to fail (HTTP response not OK at submission step).

### Feature Validation (Existing Staging Deployment)
Tested against the *previously deployed* staging revision at `https://gwn-staging.blackbay-4189fc2a.eastus.azurecontainerapps.io`:

| Endpoint | Status | Notes |
|----------|--------|-------|
| /api/health | ⚠️ 401 | Requires SYSTEM_API_KEY header (not available to agent) — but app is clearly running |
| /api/puzzles | ✅ 200 | 504 puzzles returned (with bearer token auth) |
| /api/features | ✅ 200 | `{"features":{"submitPuzzle":false}}` |
| /api/auth/register | ✅ 201 | Successfully registered `cs28-test-1870591110` |
| /api/auth/login | ✅ 200 | Token received |
| /api/auth/me | ✅ 200 | User profile returned correctly |
| /api/achievements | ✅ 200 | Achievement list returned |
| /api/scores POST | ✅ 201 | Score submitted, achievements unlocked (`first-game`, `perfect-game`) |
| /api/scores/leaderboard | ✅ 200 | Leaderboard data returned (with bearer token) |

### Image SHA for Production Promotion
**Not available** — deployment was blocked by smoke test failure. The image `ghcr.io/henrik-me/guesswhatisnext:4351585` exists in GHCR but was not deployed to Azure staging.

### Issues Found & Recommended Actions
1. **BLOCKER:** 16 E2E tests fail in smoke test because `submitPuzzle` feature flag is `false`, which makes community puzzle submission endpoints return errors. The E2E tests assume this feature is enabled.
2. **Fix options:**
   - a) Enable `submitPuzzle` feature flag in the staging smoke test environment (set env var in workflow)
   - b) Skip community/moderation/my-submissions E2E tests when `submitPuzzle` is disabled
   - c) Fix the E2E tests to handle the disabled feature flag gracefully
3. **Existing staging deployment is healthy** — all core features (auth, puzzles, scores, leaderboard, achievements) work correctly on the currently deployed revision.

## Prerequisites

- All target clickstops merged to main
- `staging-deploy.yml` workflow functional
- Azure staging environment (`gwn-staging`) provisioned
- Required secrets configured: `AZURE_CREDENTIALS`, `GHCR_PAT`, `JWT_SECRET`, `SYSTEM_API_KEY`
- Required variables configured: `STAGING_URL`, `CANONICAL_HOST`, `GHCR_USERNAME`

## Notes

- Staging auto-deploy is disabled (`STAGING_AUTO_DEPLOY=false`). Must trigger manually via workflow_dispatch.
- Staging uses ephemeral local SQLite (not Azure SQL). Production uses Azure SQL free tier.
- On successful validation, the same image SHA will be promoted to production in CS29.
