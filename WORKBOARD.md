# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-04-27T04:36Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-25T18:15Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active | 2026-04-26T23:48Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-27T01:15Z |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | ⚪ Offline | 2026-04-27T04:36Z |
| yoga-gwn-c5 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot5 | 🟢 Active | 2026-04-26T03:05Z |
| yoga-gwn-c5 (sub-agent) | HENRIKM-YOGA | C:\src\gwn-worktrees\wt-cs52-seed-route | 🟢 Active | 2026-04-27T04:30Z |
| omni-gwn | HENRIKM-OMNI| C:\src\guesswhatisnext | ⚪ Offline | 2026-04-22T00:55Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |

## Active Work

| CS-Task ID | Title | State | Owner | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------------|----------------|
| CS61 | **Activate CS41 smoke + DB migration validation in staging**<br>WT: `C:\src\guesswhatisnext_copilot2`<br>B:&nbsp; `yoga-gwn-c2/cs61-3a-init-db-before-seed` + `yoga-gwn-c2/cs61-5a-cs41-5-transition` | implementing | yoga-gwn-c2 | 2026-04-27T02:50Z | — |
|  | _**CS61-3a PR [#298](https://github.com/henrik-me/guesswhatisnext/pull/298) OPEN** (`yoga-gwn-c2/cs61-3a-init-db-before-seed`) — recovery for CS61-6 verification deploy failure (run 24971160848). Inserts `POST /api/admin/init-db` (12×5s retry) between `/healthz` wait and seed loop in staging-deploy.yml's CS61-1 seed step. Root cause: `/api/admin/*` cold-start gate bypass (server/app.js:296) let seed land while DB un-initialized → HTTP 500 (`SQLITE_ERROR: no such table: users`). Workflow-only; no server change. Tests: 6 new structural assertions in `tests/cs61-3a-init-db-before-seed.test.js` (presence + ordering after /healthz / before seed loop + auth header + retry budget + CS61-3a marker). Full suite 1001/1002 (+1 skipped); check:docs ✅ (0 findings); check:migration-policy ✅ (8 files); container:validate ✅ (HTTP 200 after 36966ms). Copilot review requested. **⚠️ Coordination note for orchestrator:** CS61-5a's commit on branch `yoga-gwn-c2/cs61-5a-cs41-5-transition` (commit 6459089) inadvertently includes CS61-3a's staging-deploy.yml edit because the parallel agent ran in the same worktree while my CS61-3a change was uncommitted. CS61-3a PR [#298](https://github.com/henrik-me/guesswhatisnext/pull/298) is clean (only CS61-3a content); orchestrator should rebase/clean CS61-5a before merge to avoid double-application. Prior CS61-0..CS61-2 MERGED ([#284](https://github.com/henrik-me/guesswhatisnext/pull/284), [#287](https://github.com/henrik-me/guesswhatisnext/pull/287), [#285](https://github.com/henrik-me/guesswhatisnext/pull/285)); CS61-3 PR [#289](https://github.com/henrik-me/guesswhatisnext/pull/289) + CS61-5 PR [#290](https://github.com/henrik-me/guesswhatisnext/pull/290) still open._ |  |  |  |  |
| CS52-10 | **Server-Authoritative Scoring with Offline-First Local Mode**<br>WT: `C:\src\gwn-worktrees\wt-cs52-10`<br>B:&nbsp; `yoga-gwn-c5/cs52-10-impl` | implementing | yoga-gwn-c5 | 2026-04-27T04:30Z | — |
|  | _**Unblocked.** c2's CS61-3a fix landed → CS52-bearing image (sha `92024a1`, includes all CS52-2..CS52-7e + CS52-polish #296) deployed to staging revision `gwn-staging--deploy-1777262867` at 0% traffic (c2's CS41-12 smoke step still fails for unrelated reasons; revision is reachable directly via FQDN). Probe ran against the new revision: **3 PASS** (c /api/sync happy, d admin route flip+revert+auth+validation, f schema migration 8/8 incl. cs52-ranked-schema + both UNIQUE INDEXes), **1 SKIP** (e App Insights manual KQL), **2 FAIL** — both root-caused to `ranked_pool_empty` (staging's `ranked_puzzles` table empty; same operator-step gap I hit on local stack). **Filed CS52-followup:** small admin endpoint `POST /api/admin/seed-ranked-puzzles` mirroring CS52-7c's pattern → seed staging via API → re-run probe → expect 5 PASS / 1 SKIP. Sub-agent `cs52-seed-admin-impl` dispatched. Then attest CS52-10 ready. Then PAUSE before CS52-11 prod deploy (always needs user approval per INSTRUCTIONS.md § Production deploys)._ |  |  |  |  |
| CS60 | **Post-CS54 observability follow-up (cost watch + deferred-gap decisions)**<br>WT: `C:\src\gwn-c3-worktrees\wt-cs60-1a-corrective`<br>B:&nbsp; `yoga-gwn-c3/cs60-1a-corrective` | copilot_review | yoga-gwn-c3 | 2026-04-27T04:20Z | — |
|  | _CS60-1a + CS60-1b done. Per-day reports now include $ cost (DKK by meter) + Container Apps compute (UsageNanoCores) + memory (WorkingSetBytes) + Requests + RestartCount, in addition to AI ingest. Day 0 (2026-04-25): 2.24 DKK total. Day 1 (2026-04-26): **gwn-staging cost = $0** (CS58 scale-to-zero fully working), prod 1.36 DKK, total 1.37 DKK. AI: ~25 MB/month each env (~0.5% of 5GB cap); whole-workspace ~1.49 GB/month dominated by `ContainerAppSystemLogs_CL`. KQL bug fixed (staging-only AI-scope query asymmetry — root cause CS60-4). Cross-CS: `SQLITE_ERROR` storm = known CS61-1 deploy regression. New `+7d cost-watch summary` section in appendix shows 2-of-7 days observed with pending Day 2..Day 7 rows; CS60-2h on 2026-05-02 is the canonical close-out. **PR [#293](https://github.com/henrik-me/guesswhatisnext/pull/293) OPEN** — Copilot review requested (started before user clarified docs-only PRs with GPT-5.4 local review don't need Copilot; continuing with it now that it's started). CI green (docs-consistency + telemetry gate). 3 GPT-5.4 findings addressed in `dccac82`; cost/metrics expansion in `7f63931`; docs/observability.md § A.2 updated with workspace-direct workaround. **Next after #293 merges:** daily ticks CS60-1c..CS60-2h._ |  |  |  |  |
| CS53-8b | **Public /api/db-status ops endpoint**<br>WT: `C:\src\gwn-worktrees\wt-cs53-8b`<br>B:&nbsp; `yoga-gwn/cs53-8b-db-status-endpoint` | implementing | yoga-gwn | 2026-04-27T04:25Z | — |
|  | _Per active_cs53 row 60: GET /api/db-status reads in-memory state ({dbInitialized, isInFlight, unavailability}) — NO DB query, bypasses request gate, public no-auth, rate-limited 30/min/IP. Pino info `event=db-status-probe` per request feeds KQL § B.17 polling watchdog. Route factory takes getter closures; mounted in server/app.js. SPA must NOT poll — for operators + external uptime monitors only. 6 tests passing locally including no-DB-touch assertion._ |  |  |  |  |

> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
