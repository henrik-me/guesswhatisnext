# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main — no PR required.

> **Last updated:** 2026-04-21T16:05Z

## Orchestrators

| Agent ID | Machine | Repo Folder | Status |
|----------|---------|-------------|--------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | 🟢 Active |
| omni-gwn | HENRIKM-OMNI | C:\src\guesswhatisnext | 🟢 Active |

## Active Work

| Task ID | Clickstop | Description | Agent ID | Worktree | Branch | PR | Started |
|---------|-----------|-------------|----------|----------|--------|----|---------|
| CS42-1 | CS42 | Investigate: progressive messages missing in production cold start | yoga-gwn | — | — | — | 2026-04-19T22:20Z |
| CS43-2 | CS43 | Add docs consistency checker (warn-only) + CI integration | omni-gwn | wt-1 | omni-gwn/cs43-2-docs-consistency-check | — | 2026-04-21T15:30Z |
| CS43-3 | CS43 | Restructure CONTEXT.md to documented shape | omni-gwn | wt-3 | omni-gwn/cs43-3-context-restructure | — | 2026-04-21T15:50Z |

> **Note:** For queued or in-flight clickstops, check files with `planned_` or `active_` prefixes in `project/clickstops/`. For completed clickstops, check files with `done_` prefix. See the task tables inside those files for task-level status.
