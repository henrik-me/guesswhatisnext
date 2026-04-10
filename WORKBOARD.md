# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main — no PR required.

> **Last updated:** 2026-04-10T17:15Z

## Orchestrators

| Agent ID | Machine | Repo Folder | Status |
|----------|---------|-------------|--------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active |

## Active Work

| Task ID | Clickstop | Description | Agent ID | Worktree | Branch | PR | Started |
|---------|-----------|-------------|----------|----------|--------|----|---------|
| CS18 | MSSQL Production Fixes | Adapter SQL rewriting + Docker MSSQL validation | yoga-gwn | — | main | #131 (merged) | 2026-04-10 |
| CS17 | Process Docs Improvement | Workboard row ownership rule fix | yoga-gwn-c2 | wt-1 | yoga-gwn-c2/cs17-fix-workboard-ownership | — | 2026-04-10 |
| CS19-22-plan | CS19–CS22 | Plan clickstops: Puzzle Nav, Auth UX, High Score Sync, Answer Randomization | yoga-gwn-c3 | — | — | — | 2026-04-10 |

> **Note:** For queued or in-flight clickstops, check files with `planned_` or `active_` prefixes in `project/clickstops/`. For completed clickstops, check files with `done_` prefix. See the task tables inside those files for task-level status.
