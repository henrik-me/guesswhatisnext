# Clickstop CS10: CI/CD Pipeline

**Status:** ✅ Complete* (CS10-56 still pending)
**Completed:** Phase 10 complete except CS10-56

> **Note:** This clickstop is archived as "complete" because all core pipeline work is done.
> Task CS10-56 (unified infra setup script) remains pending and is tracked on
> [WORKBOARD.md](../../WORKBOARD.md) as a queued item. Once CS10-56 merges, the asterisk
> will be removed.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS10-51 | Simplify Dockerfile | ✅ Done | — | Single-stage node:22-slim; better-sqlite3 has prebuilds, no build tools needed |
| CS10-52 | Slim down PR CI checks | ✅ Done | CS10-51 | New ci.yml with parallel lint + test only; no Docker build in PR checks. E2E was added later in CS12. |
| CS10-53 | Remove push-to-main deploy pipeline | ✅ Done | CS10-52 | ci-cd.yml removed from tree; push to main no longer triggers any deployment |
| CS10-54 | Staging deploy on merge | ✅ Done | CS10-53 | New staging-deploy.yml: triggers on push to main, builds Docker image, pushes to GHCR, runs ephemeral smoke tests, fast-forwards release/staging, then (with manual approval) deploys to Azure staging |
| CS10-55 | Manual production deploy workflow | ✅ Done | CS10-54 | prod-deploy.yml: manual workflow_dispatch with image tag + confirmation, validates image exists in GHCR, deploys to production environment (with approval gate), runs health verification, auto-rollback on failure (PR #21) |
| CS10-56 | Unified infra setup script | ⬜ Pending | CS10-55 | Merge deploy.sh + setup-github.sh into one script: auto-generates secrets, creates Azure service principal, sets all GitHub secrets/variables, runs verification health check |

### CS10b — SQLite on Azure Files SMB Fix (COMPLETE)

During staging deployment testing, we discovered that **SQLite on Azure Files (SMB) is fundamentally broken** — the SMB mount does not support POSIX file locking (`fcntl`). Every lock attempt returns `SQLITE_BUSY` regardless of contention, even with a single process writing to a fresh empty file. This was confirmed via manual testing inside the container.

**Approaches tried and failed:**
- PRs #37-40: revision mode, deactivation ordering, az exec init-db, direct curl
- PR #41: EXCLUSIVE locking mode — still fails because SMB byte-range locks are unreliable
- URI filenames with `unix-none` VFS — better-sqlite3 doesn't support URI filenames
- WAL artifact cleanup, close/reopen avoidance — none helped

**Solution (PR #46): Use local filesystem for SQLite DB**
- Set `GWN_DB_PATH=/tmp/game.db` in the container env
- SQLite operates on the container's local filesystem where locking works
- Azure Files mount at `/app/data` retained but unused (pending cleanup)
- Trade-off: DB is ephemeral (lost on container restart) — acceptable for staging

**Other fixes applied during staging deployment debugging:**
- `az containerapp start` doesn't exist → use REST API (`az rest --method POST .../start`)
- Azure reports `RunningAtMaxScale` not `Running` → grep `^Running` to match both
- Concurrency group kills manual dispatch → `cancel-in-progress: ${{ github.event_name != 'workflow_dispatch' }}`
- `STAGING_AUTO_DEPLOY` repo variable gates auto-deploy (set to `false`, opt-in with `true`)

**Staging status:** ✅ Deployed and working (2026-04-01). CANONICAL_HOST fix (PR #72) resolved deploy failures caused by missing env var after HTTPS enablement (PR #59).

| # | Task | Status | Notes |
|---|---|---|---|
| CS10-57 | EXCLUSIVE locking + self-init DB | ✅ Done | PR #41 merged. Self-init retry loop, WS readiness gate, draining guards. |
| CS10-58 | Simplified deploy workflow | ✅ Done | PR #46 merged. Local filesystem fix. Deploy verification via revision state + az logs grep. |
| CS10-59 | Validate staging | ✅ Done | Staging deployed successfully. Self-init creates DB on local filesystem. |

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Docker base image | node:22-slim (single-stage) | better-sqlite3 ships prebuilt binaries; no python3/make/g++ needed. Simpler Dockerfile at cost of ~200MB vs ~100MB image |
| PR CI checks | Lint + test + E2E (no Docker build) | Docker build is slow, hits Docker Hub rate limits, and isn't needed for PR validation. E2E (Playwright) added in Phase 12. |
| Push to main | No auto-deployment (disabled) | Auto-deploy temporarily disabled in PR #41 to avoid unintended deploys. Manual workflow_dispatch only for now. |
| Staging branch strategy | Fast-forward release/staging to main HEAD | Simpler than cherry-picking; no history divergence; staging always matches main |
| Staging trigger | Manual workflow_dispatch only | Auto-deploy gated by STAGING_AUTO_DEPLOY repo variable (default false). Manual dispatch is the standard workflow; auto-deploy available when needed. |
| Ephemeral staging | Docker container in GitHub Actions | $0 infra cost; sufficient for automated smoke tests (health, auth, scores) |
| Azure staging | Behind manual approval after ephemeral passes | Persistent environment for manual QA; only promoted after automated validation |
| Production deploy | Manual workflow_dispatch from release/staging | Production only deploys code that has been validated in staging; never directly from main |
| Production gate | Requires staging environment green | Cannot trigger prod deploy unless the latest staging deployment succeeded |

## Notes

**Parallelism:** Phase 10b complete. Phase 11 (Azure SQL) is the follow-on.
