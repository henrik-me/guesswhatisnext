# Clickstop CS37: Health Monitor Investigation

**Status:** 🔄 In Progress
**Goal:** Investigate and fix the health monitor workflow failures. Scheduled runs have been stuck in "waiting" since ~April 12 due to environment approval gates.

**Deferred from:** [CS29 — Production Deployment & Verification](done/done_cs29_production-deployment.md)
**Reason deferred:** Discovered during CS29 production validation. Not blocking deployment but degrades monitoring coverage.

## Investigation Results (CS37-1 ✅)

**Root cause:** The `azure-check` job declares `environment: production`, which requires manual approval. Scheduled cron runs can't be manually approved, so every run since the approval gate was enforced (~April 12) is stuck in "waiting" indefinitely.

**Key findings:**
- Runs before April 11 completed successfully; all runs since April 12 are stuck in `waiting`
- The `azure-check` job only reads Azure state via `az containerapp show` — it doesn't deploy, modify, or wake the container
- `AZURE_CREDENTIALS` is a **repo-level secret** (confirmed via `gh secret list`), not environment-scoped — removing `environment: production` won't break secret access
- The original concern about `/api/health` auth is not relevant to Tier 1 — `azure-check` never calls HTTP endpoints. Tier 2 (`deep-check`) correctly sends `SYSTEM_API_KEY` via `X-API-Key` header
- Previous issue #27 (March 30 "Degraded" alert) was manually closed — the monitor was working correctly when it created that alert

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS37-1 | Investigate health monitor failures | ✅ Done | — | Root cause: `environment: production` on `azure-check` blocks cron runs. Auth concern not applicable to Tier 1. |
| CS37-2 | Fix health monitor | 🔜 Ready | CS37-1 | Remove `environment: production` from `azure-check` job. Keep it on `deep-check` (manual dispatch only, writes to prod). One-line change in health-monitor.yml. |
| CS37-3 | Validate health monitor runs clean | ⬜ Pending | CS37-2 | Three-stage validation: (1) manual dispatch azure-only — confirm no approval wait, (2) manual dispatch deep — confirm Tier 2 still works with approval gate, (3) wait for next cron run — confirm automated runs succeed. |

## Risk Assessment

**Low.** Removes an approval gate from a read-only monitoring job. No secrets access changes (repo-level secret). No deployment behavior changes. The `deep-check` tier retains its approval gate since it registers users and hits live endpoints.

## Notes

- Health monitor runs every 6 hours via cron (`health-monitor.yml`)
- Tier 1 (`azure-check`): Azure API only, no container wake, $0 cost — should run unattended
- Tier 2 (`deep-check`): HTTP endpoints, wakes container, manual dispatch only — approval gate appropriate
- The monitor creates GitHub issues on failure with `health-azure` or `health-deep` labels
- No local validation possible — the fix is a workflow config change that can only be validated by triggering the workflow on GitHub
