# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main — no PR required.

> **Last updated:** 2026-04-21T15:12Z

## Orchestrators

| Agent ID | Machine | Repo Folder | Status |
|----------|---------|-------------|--------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | ⚪ Offline |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | ⚪ Offline |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | ⚪ Offline |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | ⚪ Offline |
| omni-gwn | HENRIKM-OMNI | C:\src\guesswhatisnext | 🟢 Active |

## Active Work

| Task ID | Clickstop | Description | Agent ID | Worktree | Branch | PR | Started |
|---------|-----------|-------------|----------|----------|--------|----|---------|
| CS42-1 | CS42 | Investigate: progressive messages missing in production cold start | yoga-gwn | — | — | — | 2026-04-19T22:20Z |
| CS43-1 | CS43 | Codify "link, don't restate" principle in INSTRUCTIONS.md | omni-gwn | wt-1 | yoga-gwn/cs43-1-link-dont-restate-principle | — | 2026-04-21T15:05Z |

> **Note:** For queued or in-flight clickstops, check files with `planned_` or `active_` prefixes in `project/clickstops/`. For completed clickstops, check files with `done_` prefix. See the task tables inside those files for task-level status.
