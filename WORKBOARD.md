# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-04-26T18:50Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-25T18:15Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active | 2026-04-26T02:50Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-25T19:18Z |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | 🟢 Active | 2026-04-26T18:50Z |
| yoga-gwn-c5 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot5 | 🟢 Active | 2026-04-26T18:25Z |
| omni-gwn | HENRIKM-OMNI| C:\src\guesswhatisnext | ⚪ Offline | 2026-04-22T00:55Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |

## Active Work

| Task ID | Clickstop | State | Owner | Worktree | Branch | PR | Last Updated | Next Action | Blocked Reason |
|---------|-----------|-------|-------|----------|--------|----|--------------|-------------|----------------|
| CS53-23 | Boot-quiet contract foundation (absorbed from CS55-2 v2) | ready_to_merge | yoga-gwn | C:\src\gwn-worktrees\wt-cs53-23 | cs53-23-boot-quiet-contract | #255 | 2026-04-26T03:30Z | **Converged.** Head `c15d8b3`. 11 Copilot review rounds; **R11 returned 0 findings ("generated no new comments")**. R5–R10 iteration log: R5 security (JWT-id null-not-zero); R6 scope-precision wording; R7 telemetry-test → all 4 outcomes; R8 bounded FIFO eviction; R9 eviction-race correctness (lazy-seed gen + currentGen-undefined-rejects); R10 skip beginRead on no-seed paths + STALE-DROP dropReason. All 5 CI checks SUCCESS, docs-strict 0 findings, 587 tests pass, container-validate ✅ cycle 12. mergeable=MERGEABLE, blocked=REVIEW_REQUIRED only (waiting on human approval click). Merge unblocks CS53-19 + all of CS55. | -- |
| CS53-19 | CS53 | blocked | yoga-gwn | C:\src\guesswhatisnext | -- | -- | 2026-04-25T22:10Z | Phase A (boot/focus/refresh HAR inventory) can start now in parallel; Phases C-G now depend on CS53-23 (was CS55-2.G/H/J before the absorption). | Waiting on CS53-23 (boot-quiet contract foundation) |
| CS41 | Production & staging deploy validation (functional + telemetry + perf) | implementing | yoga-gwn-c2 | C:\src\guesswhatisnext_copilot2 | -- | -- | 2026-04-26T04:35Z | Plan v3 (12 tasks, 3 sub-agent tracks). **All three initial PRs in copilot_review:** Track A CS41-0 PR [#260](https://github.com/henrik-me/guesswhatisnext/pull/260) (DIRTY — needs rebase); Track B CS41-4 PR [#262](https://github.com/henrik-me/guesswhatisnext/pull/262) (BEHIND — needs rebase; 569 tests passed, container-validate ✅, MSSQL idempotency confirmed); Track C CS41-6 PR [#261](https://github.com/henrik-me/guesswhatisnext/pull/261) (PR-CI gate live + self-passing). BG watcher running on PR #260. | -- |
| CS52-4 | CS52 | implementing | yoga-gwn-c5 | C:\src\gwn-worktrees\wt-cs52-4 | yoga-gwn-c5/cs52-4-impl | -- | 2026-04-26T19:05Z | Implementation in progress. Refactoring game.js for streaming Ranked sessions, adding Practice/Ranked mode picker on home, connectivity banner UI (4 states), claim modal replacing window.confirm shim, mid-Ranked-disconnect overlay. Depends on CS52-3 + CS52-5 (both merged). | -- |
| CS52-6 | CS52 | claimed | yoga-gwn-c5 | C:\src\gwn-worktrees\wt-cs52-6 | yoga-gwn-c5/cs52-6-impl | -- | 2026-04-26T18:30Z | Sub-agent dispatched (background, claude-opus-4.7). Building: GET /api/scores/leaderboard?variant=freeplay\|daily&source=ranked\|offline\|all (variant required); 3-way LB toggle UI; provenance badges (Ranked/Offline/Legacy in profile only); 4 cache key shapes for /api/sync revalidate. Depends on CS52-2 + CS52-5 (both merged). | -- |
| CS52-7 | CS52 | claimed | yoga-gwn-c5 | C:\src\gwn-worktrees\wt-cs52-7 | yoga-gwn-c5/cs52-7-impl | -- | 2026-04-26T18:30Z | Sub-agent dispatched (background, claude-opus-4.7). Building: server achievement gating — unlock only from POST /api/sessions/:id/finish (ranked) and existing MP match-end. /api/sync (offline path) explicitly skips achievement evaluation. Documents in INSTRUCTIONS.md or LEARNINGS.md. **Closes the original F2 integrity gap.** Depends on CS52-3 (merged). | -- |
| CS52-7b | CS52 | claimed | yoga-gwn-c5 | C:\src\gwn-worktrees\wt-cs52-7b | yoga-gwn-c5/cs52-7b-impl | -- | 2026-04-26T18:30Z | Sub-agent dispatched (background, claude-opus-4.7). Building: matchHandler.js / matchService.js sources rounds/roundTimerMs/interRoundDelayMs from game_configs (CS52-7c loader); rejects client overrides; removes host-picks-rounds dropdown; test asserts client cannot influence config. Depends on CS52-7c (merged). Unblocks CS52-7d. | -- |
| CS52-7e | CS52 | claimed | yoga-gwn-c5 | C:\src\gwn-worktrees\wt-cs52-7e | yoga-gwn-c5/cs52-7e-impl | -- | 2026-04-26T18:30Z | Sub-agent dispatched (background, claude-opus-4.7). Building: pending_writes durable queue (3 variants per CS52 schema sketch — /finish, /sync, INTERNAL multiplayer-match-completion); drain on next successful DB write or self-init success (no timer); idempotent replay via (user_id, client_game_id) upsert / ranked_sessions.id check. Closes the cold-DB / free-tier UX gap. Depends on CS52-3 + CS52-5 (both merged). | -- |> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
