# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-04-27T03:20Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-25T18:15Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active | 2026-04-26T23:48Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-27T01:15Z |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | 🟢 Active | 2026-04-27T03:20Z |
| yoga-gwn-c5 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot5 | 🟢 Active | 2026-04-26T03:05Z |
| omni-gwn | HENRIKM-OMNI| C:\src\guesswhatisnext | ⚪ Offline | 2026-04-22T00:55Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |

## Active Work

| CS-Task ID | Title | State | Owner | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------------|----------------|
| CS61 | **Activate CS41 smoke + DB migration validation in staging**<br>WT: `C:\src\guesswhatisnext_copilot2`<br>B:&nbsp; `yoga-gwn-c2/cs61-3a-init-db-before-seed` + `yoga-gwn-c2/cs61-5a-cs41-5-transition` | implementing | yoga-gwn-c2 | 2026-04-27T02:50Z | — |
|  | _**CS61-3a PR [#298](https://github.com/henrik-me/guesswhatisnext/pull/298) OPEN** (`yoga-gwn-c2/cs61-3a-init-db-before-seed`) — recovery for CS61-6 verification deploy failure (run 24971160848). Inserts `POST /api/admin/init-db` (12×5s retry) between `/healthz` wait and seed loop in staging-deploy.yml's CS61-1 seed step. Root cause: `/api/admin/*` cold-start gate bypass (server/app.js:296) let seed land while DB un-initialized → HTTP 500 (`SQLITE_ERROR: no such table: users`). Workflow-only; no server change. Tests: 6 new structural assertions in `tests/cs61-3a-init-db-before-seed.test.js` (presence + ordering after /healthz / before seed loop + auth header + retry budget + CS61-3a marker). Full suite 1001/1002 (+1 skipped); check:docs ✅ (0 findings); check:migration-policy ✅ (8 files); container:validate ✅ (HTTP 200 after 36966ms). Copilot review requested. **⚠️ Coordination note for orchestrator:** CS61-5a's commit on branch `yoga-gwn-c2/cs61-5a-cs41-5-transition` (commit 6459089) inadvertently includes CS61-3a's staging-deploy.yml edit because the parallel agent ran in the same worktree while my CS61-3a change was uncommitted. CS61-3a PR [#298](https://github.com/henrik-me/guesswhatisnext/pull/298) is clean (only CS61-3a content); orchestrator should rebase/clean CS61-5a before merge to avoid double-application. Prior CS61-0..CS61-2 MERGED ([#284](https://github.com/henrik-me/guesswhatisnext/pull/284), [#287](https://github.com/henrik-me/guesswhatisnext/pull/287), [#285](https://github.com/henrik-me/guesswhatisnext/pull/285)); CS61-3 PR [#289](https://github.com/henrik-me/guesswhatisnext/pull/289) + CS61-5 PR [#290](https://github.com/henrik-me/guesswhatisnext/pull/290) still open._ |  |  |  |  |
| CS52-10 | **Server-Authoritative Scoring with Offline-First Local Mode**<br>WT: `C:\src\gwn-worktrees\wt-cs52-10`<br>B:&nbsp; `yoga-gwn-c5/cs52-10-impl` | blocked | yoga-gwn-c5 | 2026-04-27T01:55Z | Waiting on c2's CS61-3 (PR #289) fix |
|  | _**BLOCKED on CS61-1 staging-deploy regression.** PR [#291](https://github.com/henrik-me/guesswhatisnext/pull/291) OPEN with the staging-pointing probe driver (`scripts/cs52-10-staging-probe.js`) but all 6 validation scenarios are 🚫 BLOCKED — both staging-deploy.yml dispatches (runs 24970777175, 24971160848) failed in the new `Seed gwn-smoke-bot via API (CS61-1)` step with HTTP 500 (App Insights `exceptions`: `SQLITE_ERROR: no such table: users` ×30+) because the seed loop's 10×5s retry budget expires before CS53-9 lazy DB self-init completes. CS41-5 rolled back; live revision `gwn-staging--deploy-1777143570` (image `6b368de`) predates CS52, so even ad-hoc probing has no CS52 surface to hit. **Not CS52 code** — coordination comment posted on c2's PR [#289](https://github.com/henrik-me/guesswhatisnext/pull/289) (issuecomment-4323522077) with two suggested fixes (prime DB via `/api/features` GET, OR widen retry budget). Probe script + worktree wt-cs52-10 kept warm for re-run once unblocked. **Next:** await c2's CS61-3 fix to land → re-trigger staging-deploy.yml → re-run probe → expect "Ready for CS52-11 prod deploy" attestation._ |  |  |  |  |
| CS60 | **Post-CS54 observability follow-up (cost watch + deferred-gap decisions)**<br>WT: `C:\src\gwn-c3-worktrees\wt-cs60-1a-corrective`<br>B:&nbsp; `yoga-gwn-c3/cs60-1a-corrective` | copilot_review | yoga-gwn-c3 | 2026-04-27T01:15Z | — |
|  | _CS60-1a + CS60-1b done (Day 0 backfill + Day 1 +24h captured to appendix). KQL bug fixed (workspace-mode AI requires `AppRequests`/`AppDependencies` via `az monitor log-analytics query`, not classic `union *`). Cumulative 25.18h sample: AI ~25 MB/month staging + prod each (~0.5% of 5GB cap); whole-workspace ~1.49 GB/month dominated by `ContainerAppSystemLogs_CL` + `ContainerAppConsoleLogs_CL`. Cross-CS evidence: `SQLITE_ERROR no such table: users` storm = CS61-1 deploy regression already tracked under CS61/CS52-10. **PR [#293](https://github.com/henrik-me/guesswhatisnext/pull/293) OPEN** (`yoga-gwn-c3/cs60-1a-corrective`) — corrective docs-only PR addressing 3 GPT-5.4 review findings on the claim commit (CS60-4 KQL still using broken classic `dependencies`; projection math denominator wrong; CS41-7 contract misstatement). Awaiting Copilot review (or merge — docs-only PR, REVIEWS.md says skip-Copilot for docs is acceptable; will use auto-merge once CI green). **Next after #293 merges:** daily ticks CS60-1c..CS60-2h; CS stays open through ~2026-05-25 for CS60-3 +30d window._ |  |  |  |  |
| CS53-10 | **DB-unavailable + cold-start-fails simulators**<br>WT: `C:\src\gwn-worktrees\wt-cs53-10`<br>B:&nbsp; `yoga-gwn/cs53-10-db-unavailable-sim` | implementing | yoga-gwn | 2026-04-27T03:42Z | — |
|  | _Implementing CS53-10 per design in active_cs53 doc § "CS53-10 design (2026-04-24)". Adds `GWN_SIMULATE_DB_UNAVAILABLE={capacity_exhausted,transient}` + `GWN_SIMULATE_COLD_START_FAILS=N` env vars to `server/db/mssql-adapter.js`; extends `scripts/container-validate.js` with `--mode={default,cold-start-fails,capacity-exhausted,transient}`. Going with tentative recommendations on open questions: verbatim prod message (no "(simulated)" suffix), E2E banner check split to CS53-10b, public DB-touching endpoint out of scope. Probes will send `X-User-Activity:1` (CS53-19.D requirement)._ |  |  |  |  |

> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
