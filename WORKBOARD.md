# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main — no PR required.

> **Last updated:** 2026-04-21T20:42Z

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
| CS44-5a | CS44 | Extend consistency checker with state-vocabulary validation | omni-gwn | wt-2 | omni-gwn/cs44-5a-state-validation | — | 2026-04-21T20:30Z |
| CS44-5b | CS44 | Extend consistency checker with stale/reclaimable threshold validation | omni-gwn | wt-3 | omni-gwn/cs44-5b-stale-thresholds | — | 2026-04-21T20:30Z |

> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status.
