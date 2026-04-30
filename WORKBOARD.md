# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-04-30T02:48Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-30T02:47Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-27T05:31Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-30T02:48Z |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | ⚪ Offline | 2026-04-27T04:36Z |
| yoga-gwn-c5 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot5 | ⚪ Offline | 2026-04-27T06:20Z |
| omni-gwn | HENRIKM-OMNI| C:\src\guesswhatisnext | 🟢 Active | 2026-04-29T16:52Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |
| omni-gwn-c3 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-29T16:48Z |

## Active Work

| CS-Task ID | Title | State | Owner | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------------|----------------|
| CS52-11 | **Server Authoritative Scoring**<br>WT: _(none — task is operator-driven)_<br>B:&nbsp; _(no PR yet)_ | blocked | yoga-gwn-c5 | 2026-04-27T06:15Z | Awaiting explicit user approval before dispatching prod-deploy.yml (per [INSTRUCTIONS.md § Production deploys](INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user)) |
|  | _**Final CS52 task.** Prod deploy + 60-min App Insights soak + closeout (move CS file to `done/`, comment on issue [#198](https://github.com/henrik-me/guesswhatisnext/issues/198), update CONTEXT.md). All prior tasks merged: CS52-1 (design) → CS52-2 (schema) → CS52-3 (sessions API) → CS52-4 (mode picker) → CS52-5 (/api/sync) → CS52-6 (LB) → CS52-7 (achievements) → CS52-7b (MP config) → CS52-7c (game_configs) → CS52-7d (MP storage unification) → CS52-7e (pending_writes) → CS52-8 (E2E coverage) → CS52-9 (local MSSQL+HTTPS+OTLP validation) → CS52-polish [#296](https://github.com/henrik-me/guesswhatisnext/pull/296) (UX iteration) → CS52-followup [#303](https://github.com/henrik-me/guesswhatisnext/pull/303) (admin seed-ranked-puzzles endpoint) → CS52-10 [#291](https://github.com/henrik-me/guesswhatisnext/pull/291) (staging deploy + 5/6 PASS probe attestation, ea4aaac merged 2026-04-27T05:38Z). One unrelated finding from CS52-10 staging probe filed as [planned CS63](project/clickstops/planned/planned_cs63_game-configs-boot-race.md) (game_configs boot-race window — bounded, self-heals, doesn't block prod). **Coordination note:** c1 + c2 are still actively validating staging deploys; user has not yet asked for prod dispatch. Will not autonomously dispatch prod._ |  |  |  |  |
| CS60-1c/2c/2d | **Post CS54 Observability Followup — daily cost-watch backfill**<br>WT: `C:\src\gwn_copilot3-worktrees\wt-cs60-backfill`<br>B:&nbsp; `yoga-gwn-c3/cs60-2c-2e-backfill` | implementing | yoga-gwn-c3 | 2026-04-30T02:48Z | — |
|  | _PR [#293](https://github.com/henrik-me/guesswhatisnext/pull/293) (CS60-1b corrective) merged 2026-04-27T05:20Z. Resuming after 2-day gap. **Backfilling 3 daily ticks** — Day 2 = 2026-04-27 (CS60-1c) / Day 3 = 2026-04-28 (CS60-2c) / Day 4 = 2026-04-29 (CS60-2d) — into `project/clickstops/active/cs60-data-appendix.md`; all data still in Log Analytics + Cost Management retention. Single docs-only PR (sequential rows in same appendix file → one sub-agent, no parallelism needed). Skips Copilot review per docs-only carve-out; container-validate + telemetry-validate gates N/A. After this lands, CS60 returns to ⏸ Waiting for CS60-2e (Day 5 = 2026-04-30) → CS60-2f (Day 6 = 2026-05-01) → CS60-2h (Day 7 = 2026-05-02, canonical "+7d" interpretation point). Branch name `cs60-2c-2e-backfill` is a sticky misnomer from the initial claim — actual task IDs are 1c/2c/2d._ |  |  |  |  |
| CS68-1 | **Policy Doc Lint Rules**<br>WT: `C:\src\gwn-worktrees\wt-cs68-1`<br>B:&nbsp; `yoga-gwn/cs68-1-policy-doc-lint-rules` | ready_to_merge | yoga-gwn | 2026-04-30T03:14Z | — |
|  | _PR [#319](https://github.com/henrik-me/guesswhatisnext/pull/319) open. Local review clean; Copilot review COMMENTED with no comments (effective approval). Lint/Test/E2E/SW-cache/PR-body/trailer/telemetry gates ✅. Only failing CI check is `Run check-docs-consistency` on a **pre-existing baseline drift unrelated to CS68**: `WORKBOARD.md:31` CS60 row title `Post CS54 Observability Followup — daily cost-watch backfill` doesn't match CS60 H1 (rule promoted to error in `--strict` by CS65-2 PR [#318](https://github.com/henrik-me/guesswhatisnext/pull/318)). That row + file are owned by yoga-gwn-c3; per WORKBOARD ownership rules yoga-gwn cannot fix. Waiting for c3 (their own CS60-1c/2c/2d PR will hit the same wall and force a fix), or operator-approved `--admin` merge per [OPERATIONS.md § Long-running PRs](OPERATIONS.md#long-running-prs-in-fast-churning-main)._ |  |  |  |  |

> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
