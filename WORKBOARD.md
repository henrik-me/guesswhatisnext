# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-05-02T19:25Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-30T03:30Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active | 2026-05-02T18:38Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-30T03:20Z |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | ⚪ Offline | 2026-04-27T04:36Z |
| yoga-gwn-c5 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot5 | 🟢 Active | 2026-04-30T03:38Z |
| omni-gwn | HENRIKM-OMNI| C:\src\guesswhatisnext | 🟢 Active | 2026-04-29T16:52Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |
| omni-gwn-c3 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-29T16:48Z |

## Active Work

| CS-Task ID | Title | State | Owner | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------------|----------------|
| CS52-11 | **Server Authoritative Scoring**<br>WT: _(none — task is operator-driven)_<br>B:&nbsp; _(no PR yet)_ | implementing | yoga-gwn-c5 | 2026-05-02T19:25Z | _(none)_ |
|  | _**Final CS52 task.** Resumed 2026-05-02T19:25Z by yoga-gwn-c5 under explicit user direction ("yes, pls. proceed"). Plan: (1) compare prod / staging / main SHAs and confirm what is actually live vs expected; (2) re-run staging deploy from latest main (last successful staging = `1f690e3` 2026-04-27, main now 70 commits ahead); (3) re-run staging probe; (4) dispatch `prod-deploy.yml` with prominent approval surfaced to user (last successful prod = `a436b06` 2026-04-25, **main 275 commits ahead — all of CS52-2..CS52-10 not yet in prod**); (5) 60-min App Insights soak; (6) closeout (move CS file to `done/`, comment on issue [#198](https://github.com/henrik-me/guesswhatisnext/issues/198), update CONTEXT.md). All prior tasks merged: CS52-1 (design) → CS52-2 (schema) → CS52-3 (sessions API) → CS52-4 (mode picker) → CS52-5 (/api/sync) → CS52-6 (LB) → CS52-7 (achievements) → CS52-7b (MP config) → CS52-7c (game_configs) → CS52-7d (MP storage unification) → CS52-7e (pending_writes) → CS52-8 (E2E coverage) → CS52-9 (local MSSQL+HTTPS+OTLP validation) → CS52-polish [#296](https://github.com/henrik-me/guesswhatisnext/pull/296) (UX iteration) → CS52-followup [#303](https://github.com/henrik-me/guesswhatisnext/pull/303) (admin seed-ranked-puzzles endpoint) → CS52-10 [#291](https://github.com/henrik-me/guesswhatisnext/pull/291) (staging deploy + 5/6 PASS probe attestation, ea4aaac merged 2026-04-27T05:38Z). One unrelated finding from CS52-10 staging probe filed as [planned CS63](project/clickstops/planned/planned_cs63_game-configs-boot-race.md) (game_configs boot-race window — bounded, self-heals, doesn't block prod)._ |  |  |  |  |
| CS60 | **Post CS54 Observability Followup**<br>WT: _(none — between daily ticks)_<br>B:&nbsp; _(no PR yet — next tick CS60-3i)_ | blocked | _unassigned_ | 2026-05-02T19:05Z | **Unassigned by yoga-gwn 2026-05-02T19:05Z** after closing CS60-2 (PR [#325](https://github.com/henrik-me/guesswhatisnext/pull/325) merged) — next actionable item is in the future. **Next pickup: CS60-3i (Day 8 = 2026-05-03)**, claimable from approximately **2026-05-04T01:00Z UTC** (once Cost Management closes the 2026-05-03 UTC day; daily cadence thereafter through CS60-3{Day30} on 2026-05-25). Day 6/7 cost rows from CS60-2 are partial and will retro-fill at CS60-3i. Any orchestrator may claim. |
|  | _CS60-2 close-out merged via PR [#325](https://github.com/henrik-me/guesswhatisnext/pull/325) (`669fe4e`, 2026-05-02T18:54Z): Days 5/6/7 recorded, +7d close-out written, CS60-3 first-pass extrapolation added (worst-case 30-day workspace ingest 111 MB = 2.17% of 5GB free tier; steady-state 30-day cost ~65 DKK ≈$9.30 USD). CS60-4 Gap 1 disposition tightened to "provisional: prod auto-resolved; staging parity still unverified" — `gwn-ai-production` AppDependencies populating every day Days 4-7 (17.32 MB / 64% of 8-day workspace ingest); deliberate ≥20-leaderboard staging probe still owed. Earlier rollups: Day 0 staging 2.13 DKK + 0.77 MB AI / prod 2.09 DKK + 0.09 MB; Day 1 staging $0 (CS58 ✓) + 0.11 MB / prod 1.36 DKK + 0.78 MB; Day 2/3/4/5/6/7 detail in [`cs60-data-appendix.md`](project/clickstops/active/cs60-data-appendix.md)._ |  |  |  |  |

> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
