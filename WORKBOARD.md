# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-04-27T05:30Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-25T18:15Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-27T05:31Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | ⚪ Offline | 2026-04-27T04:36Z |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | ⚪ Offline | 2026-04-27T04:36Z |
| yoga-gwn-c5 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot5 | 🟢 Active | 2026-04-26T03:05Z |
| yoga-gwn-c5 (sub-agent) | HENRIKM-YOGA | C:\src\gwn-worktrees\wt-cs52-seed-route | 🟢 Active | 2026-04-27T04:30Z |
| omni-gwn | HENRIKM-OMNI| C:\src\guesswhatisnext | ⚪ Offline | 2026-04-22T00:55Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |

## Active Work

| CS-Task ID | Title | State | Owner | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------------|----------------|
| CS52-10 | **Server-Authoritative Scoring with Offline-First Local Mode**<br>WT: `C:\src\gwn-worktrees\wt-cs52-10`<br>B:&nbsp; `yoga-gwn-c5/cs52-10-impl` | ready_to_merge | yoga-gwn-c5 | 2026-04-27T05:05Z | — |
|  | _**ready_to_merge — staging probe 5/6 PASS + 1 SKIP.** Staging successfully deployed to image `50951bb` at 100% traffic on revision `gwn-staging--deploy-1777265555` (includes all CS52-2..CS52-7e + CS52-polish #296 + seed-admin #303). Seeded `ranked_puzzles` via the new admin endpoint (54 inserted). Probe results: **(a) PASS** Ranked FP+Daily complete (FP score=594; Daily 409 on second attempt) · **(b) PASS** concurrent active-session race (1×201 + 1×409 via DB UNIQUE INDEX) · **(c) PASS** /api/sync 200 happy · **(d) PASS** admin route flip+revert+auth+validation · **(e) SKIP→DONE** App Insights confirmed all new endpoints have requests rows (p95 < 30ms) · **(f) PASS** Azure SQL schema 8/8 incl. cs52-ranked-schema + both UNIQUE INDEXes. **No further staging activity from c5** — c1 + c2 actively validating. Awaiting orchestrator merge of PR #291 + user approval for CS52-11 prod deploy._ |  |  |  |  |
| CS60 | **Post-CS54 observability follow-up (cost watch + deferred-gap decisions)**<br>WT: `C:\src\gwn-c3-worktrees\wt-cs60-1a-corrective`<br>B:&nbsp; `yoga-gwn-c3/cs60-1a-corrective` | copilot_review | yoga-gwn-c3 | 2026-04-27T04:50Z | — |
|  | _**6 Copilot comments on PR [#293](https://github.com/henrik-me/guesswhatisnext/pull/293) addressed** in `b561f38` (rebased on main): 4× workspace name typo `workspace-gwnrg6bxt` → `workspace-gwnrg6bXt` in cs60-data-appendix.md (lines 121/127/176/182); 1× MiB unit comment fix (`1MB` → `1024*1024`); 1× Gap-1 KQL note reworded to align with staging-only AI-scope asymmetry finding (workspace-direct AppDependencies is the safe pattern for both envs). `check:docs` clean. Docs-only PR → container-validate + telemetry-validate gates N/A. Re-review requested. **After PR #293 merges** the CS will go back to ⏸ Waiting 24h state for next daily cost-watch tick (CS60-1c, earliest pickup ~2026-04-27T19:00Z once Day 2 lands in Cost Management) — daily ticks continue through CS60-2h on 2026-05-02. Day 0/Day 1 already recorded; gwn-staging cost = $0 (CS58 scale-to-zero); prod 1.36 DKK; AI ~25 MB/month each env (~0.5% of 5GB cap)._ |  |  |  |  |
| CS53-20 | **CD-side cold-start *assertion* smoke (validates CS53-10 simulator end-to-end)**<br>WT: (merged)<br>B:&nbsp; (merged) | validating | yoga-gwn | 2026-04-27T04:57Z | — |
|  | _**PR [#305](https://github.com/henrik-me/guesswhatisnext/pull/305) MERGED** (squash `6515bc4`, 2026-04-27T04:55Z). Dispatched staging-deploy.yml run [24977291152](https://github.com/henrik-me/guesswhatisnext/actions/runs/24977291152) to exercise the new `Cold-start assertion smoke (CS53-20)` job end-to-end (push events skip due to STAGING_AUTO_DEPLOY=false). This run is the live validation that CS53-10's simulator (PR #301) wires through the published image: probes /api/scores/leaderboard with cold-start-fails=3, asserts ≥1× 503+Retry-After then 200, asserts exactly 3 `mode=cold-start-fails` audit lines (no unarmed:* matches). Watcher running. After validation passes, mark CS53-20 ✅ Done._ |  |  |  |  |

> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
