# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main — no PR required.

> **Last updated:** 2026-04-24T00:30Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h–7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-23T15:30Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active | unknown |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active | unknown |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | 🟢 Active | unknown |
| omni-gwn | HENRIKM-OMNI | C:\src\guesswhatisnext | ⚪ Offline | 2026-04-22T00:55Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |

## Active Work

| Task ID | Clickstop | State | Owner | Worktree | Branch | PR | Last Updated | Next Action | Blocked Reason |
|---------|-----------|-------|-------|----------|--------|----|--------------|-------------|----------------|
| CS53-1b | CS53 #233 follow-up: admin-init draining + concurrency guard | dispatched | yoga-gwn | C:\src\gwn-worktrees\wt-1 (port 3001) | cs53-1-classifier-and-selfinit-resilience | #233 | 2026-04-24T00:30Z | Background sub-agent (Opus 4.7) addressing GPT-5.4 P2 findings; will push to existing PR #233 branch | — |
| CS53-2 | CS53 #234 rebase + integration test | blocked | yoga-gwn | (pending) | cs53-2-permanent-unavailable-and-poller | #234 | 2026-04-24T00:30Z | Wait for PR #233 to merge, then dispatch wt-2 to rebase #234 onto main and add the route-level 503-unavailable integration test | Depends on PR #233 merge |

> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
