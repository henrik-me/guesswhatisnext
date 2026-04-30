# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-04-30T03:38Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-30T03:30Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-27T05:31Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-30T03:20Z |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | ⚪ Offline | 2026-04-27T04:36Z |
| yoga-gwn-c5 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot5 | 🟢 Active | 2026-04-30T03:38Z |
| omni-gwn | HENRIKM-OMNI| C:\src\guesswhatisnext | 🟢 Active | 2026-04-29T16:52Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |
| omni-gwn-c3 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-29T16:48Z |

## Active Work

| CS-Task ID | Title | State | Owner | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------------|----------------|
| CS52-11 | **Server Authoritative Scoring**<br>WT: _(none — task is operator-driven)_<br>B:&nbsp; _(no PR yet)_ | blocked | yoga-gwn-c5 | 2026-04-27T06:15Z | Awaiting explicit user approval before dispatching prod-deploy.yml (per [INSTRUCTIONS.md § Production deploys](INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user)) |
|  | _**Final CS52 task.** Prod deploy + 60-min App Insights soak + closeout (move CS file to `done/`, comment on issue [#198](https://github.com/henrik-me/guesswhatisnext/issues/198), update CONTEXT.md). All prior tasks merged: CS52-1 (design) → CS52-2 (schema) → CS52-3 (sessions API) → CS52-4 (mode picker) → CS52-5 (/api/sync) → CS52-6 (LB) → CS52-7 (achievements) → CS52-7b (MP config) → CS52-7c (game_configs) → CS52-7d (MP storage unification) → CS52-7e (pending_writes) → CS52-8 (E2E coverage) → CS52-9 (local MSSQL+HTTPS+OTLP validation) → CS52-polish [#296](https://github.com/henrik-me/guesswhatisnext/pull/296) (UX iteration) → CS52-followup [#303](https://github.com/henrik-me/guesswhatisnext/pull/303) (admin seed-ranked-puzzles endpoint) → CS52-10 [#291](https://github.com/henrik-me/guesswhatisnext/pull/291) (staging deploy + 5/6 PASS probe attestation, ea4aaac merged 2026-04-27T05:38Z). One unrelated finding from CS52-10 staging probe filed as [planned CS63](project/clickstops/planned/planned_cs63_game-configs-boot-race.md) (game_configs boot-race window — bounded, self-heals, doesn't block prod). **Coordination note:** c1 + c2 are still actively validating staging deploys; user has not yet asked for prod dispatch. Will not autonomously dispatch prod._ |  |  |  |  |
| CS60 | **Post CS54 Observability Followup**<br>WT: _(none — between daily ticks)_<br>B:&nbsp; _(no PR yet — next tick CS60-2e)_ | blocked | yoga-gwn-c3 | 2026-04-30T03:20Z | Awaiting next daily cost-watch tick — CS60-2e (Day 5 = 2026-04-30, earliest pickup ~2026-05-01T01:00Z UTC once Cost Management closes the day) |
|  | _Day 0..Day 4 backfilled. Latest PR [#320](https://github.com/henrik-me/guesswhatisnext/pull/320) (CS60-1c/2c/2d backfill) merged 2026-04-30T03:17Z (`4ed25ee`). Remaining +7d daily ticks: CS60-2e (Day 5 = 2026-04-30) → CS60-2f (Day 6 = 2026-05-01) → CS60-2h (Day 7 = 2026-05-02, canonical "+7d" interpretation point and CS60-2 close). Then CS60-3 +30d daily ticks through 2026-05-25. Earlier rollups: Day 0 staging 2.13 DKK + 0.77 MB AI / prod 2.09 DKK + 0.09 MB; Day 1 staging $0 (CS58 ✓) + 0.11 MB / prod 1.36 DKK + 0.78 MB; Day 2/3/4 detail in [`cs60-data-appendix.md`](project/clickstops/active/cs60-data-appendix.md)._ |  |  |  |  |
| CS47 | **Progressive Loader Telemetry**<br>WT: _(to be created — wt-cs47)_<br>B:&nbsp; _(no PR yet)_ | claimed | yoga-gwn-c5 | 2026-04-30T03:38Z | — |
|  | _Phase A only: ship the dual-emit telemetry pipeline (Pino warn + OTel customEvent with server-attached `environment` tag), validate via `npm run container:validate --mode=transient` for the Pino path, and end-to-end against staging AI from a local container for the OTel path. Carved out the alert + dashboard work into [planned CS70](project/clickstops/planned/planned_cs70_progressive-loader-warmup-alert-and-dashboard.md) — those need ≥1 week of post-deploy baseline data on a healthy Azure SQL, which is currently in capacity-exhausted state. CS47 itself does NOT touch the locked DB (uses CS53-10 simulators)._ |  |  |  |  |

> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
