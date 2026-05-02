# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-05-02T18:38Z

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
| CS52-11 | **Server Authoritative Scoring**<br>WT: _(none — task is operator-driven)_<br>B:&nbsp; _(no PR yet)_ | blocked | yoga-gwn-c5 | 2026-04-27T06:15Z | Awaiting explicit user approval before dispatching prod-deploy.yml (per [INSTRUCTIONS.md § Production deploys](INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user)) |
|  | _**Final CS52 task.** Prod deploy + 60-min App Insights soak + closeout (move CS file to `done/`, comment on issue [#198](https://github.com/henrik-me/guesswhatisnext/issues/198), update CONTEXT.md). All prior tasks merged: CS52-1 (design) → CS52-2 (schema) → CS52-3 (sessions API) → CS52-4 (mode picker) → CS52-5 (/api/sync) → CS52-6 (LB) → CS52-7 (achievements) → CS52-7b (MP config) → CS52-7c (game_configs) → CS52-7d (MP storage unification) → CS52-7e (pending_writes) → CS52-8 (E2E coverage) → CS52-9 (local MSSQL+HTTPS+OTLP validation) → CS52-polish [#296](https://github.com/henrik-me/guesswhatisnext/pull/296) (UX iteration) → CS52-followup [#303](https://github.com/henrik-me/guesswhatisnext/pull/303) (admin seed-ranked-puzzles endpoint) → CS52-10 [#291](https://github.com/henrik-me/guesswhatisnext/pull/291) (staging deploy + 5/6 PASS probe attestation, ea4aaac merged 2026-04-27T05:38Z). One unrelated finding from CS52-10 staging probe filed as [planned CS63](project/clickstops/planned/planned_cs63_game-configs-boot-race.md) (game_configs boot-race window — bounded, self-heals, doesn't block prod). **Coordination note:** c1 + c2 are still actively validating staging deploys; user has not yet asked for prod dispatch. Will not autonomously dispatch prod._ |  |  |  |  |
| CS60 | **Post CS54 Observability Followup**<br>WT: _(none — main checkout, docs-only branch)_<br>B:&nbsp; `cs60-2-7d-closeout-and-cs60-3-firstpass` _(no PR yet — drafting close-out)_ | implementing | yoga-gwn | 2026-05-02T18:30Z | _(none)_ |
|  | _Ownership transferred from yoga-gwn-c3 (idle since 2026-04-30T03:20Z) to yoga-gwn on 2026-05-02T18:30Z under explicit user direction to close out CS60-2 and run a CS60-3 first-pass extrapolation from the now-7-day trend. This branch lands Days 5/6/7 to the data appendix, replaces the CS60-2h preview with a real close-out, and adds the partial CS60-3 extrapolation; CS60-3 +30d daily ticks (CS60-3i..) still owed through 2026-05-25 and will be re-claimed after this PR merges. Day 0..Day 4 backfilled in PR [#320](https://github.com/henrik-me/guesswhatisnext/pull/320) (`4ed25ee`, 2026-04-30T03:17Z); detail in [`cs60-data-appendix.md`](project/clickstops/active/cs60-data-appendix.md)._ |  |  |  |  |
| OPS-cs54-9-pr254-cleanup | **Cherry-pick PR #254 net-new content + close stale PR**<br>WT: wt-2 (`C:\src\gwn_copilot2-worktrees\wt-2`)<br>B:&nbsp; `yoga-gwn-c2/cs54-9-cherry-pick` | implementing | yoga-gwn-c2 | 2026-05-02T18:38Z |  |
|  | _Stale PR [#254](https://github.com/henrik-me/guesswhatisnext/pull/254) (open 6+ days, branch targets the now-moved `active_cs54_*.md` path) reviewed against the on-main done CS54 § CS54-9 appendix. ~40% net-new content (instrumentation-tedious@0.34.0 verification, pino-applicationinsights staleness warning, Gap-3 supervisor-conflict analysis, cross-gap summary table, headroom-flip thresholds, OTel SDK pinned-version preamble) being folded into [done_cs54](project/clickstops/done/done_cs54_enable-app-insights-in-prod.md) § CS54-9 as a "Refinement notes (2026-05-02)" subsection. PR #254 will be closed with comment linking to the merged commit; ~25% of PR #254's Gap-1 framing is superseded by the post-close `execSql` finding already on main, so the PR cannot be merged as-is. Docs-only change; Copilot review skipped per REVIEWS.md docs-only rule. Coordinates with parallel CS60 close-out (yoga-gwn) — no file overlap (CS60 edits `cs60-data-appendix.md` + active CS60 plan; this edits `done/done_cs54_*.md`)._ |  |  |  |  |

> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
