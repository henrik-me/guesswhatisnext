# Clickstop CS37: Health Monitor Investigation

**Status:** ⬜ Planned
**Goal:** Investigate and fix the health monitor workflow failures. The last 2 scheduled runs failed, likely because `/api/health` requires admin auth and the monitor may not be sending the correct credentials.

**Deferred from:** [CS29 — Production Deployment & Verification](done/done_cs29_production-deployment.md)
**Reason deferred:** Discovered during CS29 production validation. Not blocking deployment but degrades monitoring coverage.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS37-1 | Investigate health monitor failures | ⬜ Pending | — | Check health-monitor.yml workflow, examine failed run logs, determine why `/api/health` calls are failing (auth? URL? Azure SQL cold start?). |
| CS37-2 | Fix health monitor authentication | ⬜ Pending | CS37-1 | Ensure health monitor sends correct SYSTEM_API_KEY or admin credentials. Alternatively, make `/healthz` (unauthenticated) the monitored endpoint. |
| CS37-3 | Validate health monitor runs clean | ⬜ Pending | CS37-2 | Trigger manual run and confirm it passes. Wait for next scheduled run (every 6 hours) to confirm. |

## Notes

- Health monitor runs every 6 hours via cron (`health-monitor.yml`)
- `/api/health` requires admin role (returns 403 for non-admin, 401 for unauthenticated)
- `/healthz` is a simpler unauthenticated health endpoint — may be better for external monitoring
- The monitor creates GitHub issues on failure with `deployment-failure` label
