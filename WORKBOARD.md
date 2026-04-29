# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-04-29T16:48Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | ⚪ Offline | 2026-04-27T06:18Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-27T05:31Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | ⚪ Offline | 2026-04-27T04:36Z |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | ⚪ Offline | 2026-04-27T04:36Z |
| yoga-gwn-c5 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot5 | ⚪ Offline | 2026-04-27T06:20Z |
| omni-gwn | HENRIKM-OMNI| C:\src\guesswhatisnext | 🟢 Active | 2026-04-29T16:52Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |
| omni-gwn-c3 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-29T16:48Z |

## Active Work

| CS-Task ID | Title | State | Owner | Last Updated | Blocked Reason |
|------------|-------|-------|-------|--------------|----------------|
| CS52-11 | **Server-Authoritative Scoring with Offline-First Local Mode**<br>WT: _(none — task is operator-driven)_<br>B:&nbsp; _(no PR yet)_ | blocked | yoga-gwn-c5 | 2026-04-27T06:15Z | Awaiting explicit user approval before dispatching prod-deploy.yml (per [INSTRUCTIONS.md § Production deploys](INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user)) |
|  | _**Final CS52 task.** Prod deploy + 60-min App Insights soak + closeout (move CS file to `done/`, comment on issue [#198](https://github.com/henrik-me/guesswhatisnext/issues/198), update CONTEXT.md). All prior tasks merged: CS52-1 (design) → CS52-2 (schema) → CS52-3 (sessions API) → CS52-4 (mode picker) → CS52-5 (/api/sync) → CS52-6 (LB) → CS52-7 (achievements) → CS52-7b (MP config) → CS52-7c (game_configs) → CS52-7d (MP storage unification) → CS52-7e (pending_writes) → CS52-8 (E2E coverage) → CS52-9 (local MSSQL+HTTPS+OTLP validation) → CS52-polish [#296](https://github.com/henrik-me/guesswhatisnext/pull/296) (UX iteration) → CS52-followup [#303](https://github.com/henrik-me/guesswhatisnext/pull/303) (admin seed-ranked-puzzles endpoint) → CS52-10 [#291](https://github.com/henrik-me/guesswhatisnext/pull/291) (staging deploy + 5/6 PASS probe attestation, ea4aaac merged 2026-04-27T05:38Z). One unrelated finding from CS52-10 staging probe filed as [planned CS63](project/clickstops/planned/planned_cs63_game-configs-boot-race.md) (game_configs boot-race window — bounded, self-heals, doesn't block prod). **Coordination note:** c1 + c2 are still actively validating staging deploys; user has not yet asked for prod dispatch. Will not autonomously dispatch prod._ |  |  |  |  |
| CS60 | **Post-CS54 observability follow-up (cost watch + deferred-gap decisions)**<br>WT: `C:\src\gwn-c3-worktrees\wt-cs60-1a-corrective`<br>B:&nbsp; `yoga-gwn-c3/cs60-1a-corrective` | copilot_review | yoga-gwn-c3 | 2026-04-27T04:50Z | — |
|  | _**6 Copilot comments on PR [#293](https://github.com/henrik-me/guesswhatisnext/pull/293) addressed** in `b561f38` (rebased on main): 4× workspace name typo `workspace-gwnrg6bxt` → `workspace-gwnrg6bXt` in cs60-data-appendix.md (lines 121/127/176/182); 1× MiB unit comment fix (`1MB` → `1024*1024`); 1× Gap-1 KQL note reworded to align with staging-only AI-scope asymmetry finding (workspace-direct AppDependencies is the safe pattern for both envs). `check:docs` clean. Docs-only PR → container-validate + telemetry-validate gates N/A. Re-review requested. **After PR #293 merges** the CS will go back to ⏸ Waiting 24h state for next daily cost-watch tick (CS60-1c, earliest pickup ~2026-04-27T19:00Z once Day 2 lands in Cost Management) — daily ticks continue through CS60-2h on 2026-05-02. Day 0/Day 1 already recorded; gwn-staging cost = $0 (CS58 scale-to-zero); prod 1.36 DKK; AI ~25 MB/month each env (~0.5% of 5GB cap)._ |  |  |  |  |
| CS67-2 | **CS67 Phase 2 — Extract CONVENTIONS.md from INSTRUCTIONS.md**<br>WT: _(deferred — wt-4 reused for OPS clarification)_<br>B:&nbsp; _(deferred)_ | blocked | omni-gwn | 2026-04-29T20:14Z | Awaiting OPS-clarify-copilot-review-merge-gate to land first (avoids INSTRUCTIONS.md merge collision; the clarification belongs in INSTRUCTIONS.md/REVIEWS.md/OPERATIONS.md and Phase 2 restructures INSTRUCTIONS.md heavily). |
|  | _CS67 Phase 1 (canonical sub-agent checklist + drift rule) merged via PR #313 / commit `9472757`. Phase 2 will dispatch on a fresh worktree once OPS-clarify-* merges so the new policy text lands cleanly in INSTRUCTIONS.md before being moved/copied to CONVENTIONS.md._ |  |  |  |  |
| OPS-clarify-copilot-review-merge-gate | **Clarify: Copilot "clean / no new comments" = effective APPROVAL; Copilot review is MANDATORY for code/config/CI PRs**<br>WT: `C:\src\gwn-worktrees\wt-4`<br>B:&nbsp; `omni-gwn/ops-clarify-copilot-review-merge-gate` | claimed | omni-gwn | 2026-04-29T20:14Z | — |
|  | _User direction 2026-04-29T20:02Z: "as an orchestrator you need to keep things going. if copilot leaves a comment saying there are no more comments (clean) then you should see that as approved. However it's unacceptable to merge a PR that doesn't have copilot review (with the doc exceptions we already have in place). Update instructions to be clear on this." Re-characterizes the OPERATIONS.md § Review state on the --admin exception path criteria (Copilot COMMENTED + threads resolved + CI green + local review clean) from "exception" to "normal merge gate" so orchestrators don't block waiting for an APPROVED state Copilot bot rarely issues. Reaffirms code/config/CI PRs MUST have Copilot review (only docs-only carve-out per REVIEWS.md table is allowed). Touches INSTRUCTIONS.md Quick Reference + REVIEWS.md merge-gate section + OPERATIONS.md § Review state. Docs-only PR; local GPT-5.5 review only._ |  |  |  |  |

> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
