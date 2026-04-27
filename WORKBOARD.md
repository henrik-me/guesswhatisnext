# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-04-27T04:50Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-25T18:15Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active | 2026-04-26T23:48Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | ⚪ Offline | 2026-04-27T04:36Z |
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
| CS52-10 | **Server-Authoritative Scoring with Offline-First Local Mode**<br>WT: `C:\src\gwn-worktrees\wt-cs52-10`<br>B:&nbsp; `yoga-gwn-c5/cs52-10-impl` | blocked | yoga-gwn-c5 | 2026-04-27T04:45Z | Coordinating — paused on user request to avoid stepping on another agent doing staging deploy validation |
|  | _**PAUSED on user request** (2026-04-27T04:45Z) — another agent is actively validating staging deploys. CS52 progress so far on this task: c2's CS61-3a fix landed → CS52-bearing image deployed to staging (multiple revisions tried: `92024a1` → `331f560` with seed endpoint). Probe ran against `gwn-staging--deploy-1777262867`: **3 PASS** (c /api/sync, d admin route, f schema 8/8 incl. cs52-ranked-schema + both UNIQUE INDEXes) + 1 SKIP (e App Insights manual) + 2 FAIL (a/b root-caused to empty `ranked_puzzles`). Filed + merged **CS52-followup PR [#303](https://github.com/henrik-me/guesswhatisnext/pull/303)** (admin `POST /api/admin/seed-ranked-puzzles`). Last attempt to seed `gwn-staging--deploy-1777264835` returned `{"error":"Invalid API key"}` — likely the SYSTEM_API_KEY rotated since I last fetched it from secrets. **NOT investigating further** until the other agent confirms staging is mine to touch. Probe script + worktree wt-cs52-10 are warm; will resume in <5 min once unblocked._ |  |  |  |  |
| CS60 | **Post-CS54 observability follow-up (cost watch + deferred-gap decisions)**<br>WT: `C:\src\gwn-c3-worktrees\wt-cs60-1a-corrective`<br>B:&nbsp; `yoga-gwn-c3/cs60-1a-corrective` | copilot_review | yoga-gwn-c3 | 2026-04-27T04:50Z | — |
|  | _**6 Copilot comments on PR [#293](https://github.com/henrik-me/guesswhatisnext/pull/293) addressed** in `b561f38` (rebased on main): 4× workspace name typo `workspace-gwnrg6bxt` → `workspace-gwnrg6bXt` in cs60-data-appendix.md (lines 121/127/176/182); 1× MiB unit comment fix (`1MB` → `1024*1024`); 1× Gap-1 KQL note reworded to align with staging-only AI-scope asymmetry finding (workspace-direct AppDependencies is the safe pattern for both envs). `check:docs` clean. Docs-only PR → container-validate + telemetry-validate gates N/A. Re-review requested. **After PR #293 merges** the CS will go back to ⏸ Waiting 24h state for next daily cost-watch tick (CS60-1c, earliest pickup ~2026-04-27T19:00Z once Day 2 lands in Cost Management) — daily ticks continue through CS60-2h on 2026-05-02. Day 0/Day 1 already recorded; gwn-staging cost = $0 (CS58 scale-to-zero); prod 1.36 DKK; AI ~25 MB/month each env (~0.5% of 5GB cap)._ |  |  |  |  |
| CS53-20 | **CD-side cold-start *assertion* smoke (validates CS53-10 simulator end-to-end)**<br>WT: (merged)<br>B:&nbsp; (merged) | validating | yoga-gwn | 2026-04-27T04:57Z | — |
|  | _**PR [#305](https://github.com/henrik-me/guesswhatisnext/pull/305) MERGED** (squash `6515bc4`, 2026-04-27T04:55Z). Dispatched staging-deploy.yml run [24977291152](https://github.com/henrik-me/guesswhatisnext/actions/runs/24977291152) to exercise the new `Cold-start assertion smoke (CS53-20)` job end-to-end (push events skip due to STAGING_AUTO_DEPLOY=false). This run is the live validation that CS53-10's simulator (PR #301) wires through the published image: probes /api/scores/leaderboard with cold-start-fails=3, asserts ≥1× 503+Retry-After then 200, asserts exactly 3 `mode=cold-start-fails` audit lines (no unarmed:* matches). Watcher running. After validation passes, mark CS53-20 ✅ Done._ |  |  |  |  |

> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
