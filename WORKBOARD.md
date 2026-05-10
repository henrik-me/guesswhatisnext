# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required. **Run `npm run check:docs:strict` locally before every direct-to-main push** (WORKBOARD or clickstop plan files) — direct push admin-bypasses ALL required status checks alongside the PR requirement, so the linter never runs server-side. [CS77](project/clickstops/active/active_cs77_pre-push-docs-lint-hook.md) provides a husky `pre-push` hook that runs the linter automatically; activate per-clone with `npm install` (verify via `npm run check:hook`).

> **Last updated:** 2026-05-10T16:30Z


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
| _unassigned_ | — | — | 🟡 Placeholder | n/a |

## Active Work

| CS-Task ID | Title | State | Owner | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------------|----------------|
| CS60 | **Post CS54 Observability Followup**<br>WT: `..\guesswhatisnext_cs60-3` (yoga-gwn)<br>B:&nbsp; `yoga-gwn/cs60-3-backfill` (PR pending) | implementing | yoga-gwn | 2026-05-10T16:30Z | **Claimed by yoga-gwn 2026-05-10T16:30Z** for CS60-3 backfill — expanded scope per operator direction: **re-fetch ALL Days 0-14 (2026-04-25..2026-05-09)** because earlier days were captured before their UTC day had closed in Cost Management (Days 6/7 explicitly partial; Days 0-5 captured end-of-day, also suspect for partial CM compute meters / lag-fill). Now all 15 UTC days have been closed long enough for CM to be authoritative. Adds Days 8-14 as new sections (CS60-3i..CS60-3o), updates Days 0-7 in place with corrected numbers (preserving original capture timestamp + adding re-capture note), refreshes the +7d cost-watch close-out roll-up, adds a +14d midpoint roll-up, and refreshes the CS60-3 first-pass extrapolation with 14 days of actuals. Out of scope: CS60-4 staging probe. PR: docs-only, GPT-5.5 review path. CS60 stays open after merge (umbrella runs through CS60-3{Day30} on 2026-05-25 → CS60-4/5/6 → CS60-7 close-out). |
|  | _CS60-2 close-out merged via PR [#325](https://github.com/henrik-me/guesswhatisnext/pull/325) (`669fe4e`, 2026-05-02T18:54Z): Days 5/6/7 recorded, +7d close-out written, CS60-3 first-pass extrapolation added (worst-case 30-day workspace ingest 111 MB = 2.17% of 5GB free tier; steady-state 30-day cost ~65 DKK ≈$9.30 USD). CS60-4 Gap 1 disposition tightened to "provisional: prod auto-resolved; staging parity still unverified" — `gwn-ai-production` AppDependencies populating every day Days 4-7 (17.32 MB / 64% of 8-day workspace ingest); deliberate ≥20-leaderboard staging probe still owed. Earlier rollups: Day 0 staging 2.13 DKK + 0.77 MB AI / prod 2.09 DKK + 0.09 MB; Day 1 staging $0 (CS58 ✓) + 0.11 MB / prod 1.36 DKK + 0.78 MB; Day 2/3/4/5/6/7 detail in [`cs60-data-appendix.md`](project/clickstops/active/cs60-data-appendix.md)._ |  |  |  |  |
> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.


