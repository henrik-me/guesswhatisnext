# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main — no PR required.

> **Last updated:** 2026-04-12T18:30Z

## Orchestrators

| Agent ID | Machine | Repo Folder | Status |
|----------|---------|-------------|--------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | 🟢 Active |

## Active Work

| Task ID | Clickstop | Description | Agent ID | Worktree | Branch | PR | Started |
|---------|-----------|-------------|----------|----------|--------|----|---------|
| CS31 | Instructions Optimization | Simplify, remove irrelevant, strengthen weak areas | yoga-gwn-c3 | — | — | — | 2026-04-12 |
| CS20 | Authentication UX Overhaul | Auth header, multiplayer gating, leaderboard anon | yoga-gwn-c4 | wt-1 | yoga-gwn-c4/cs20-auth-ux-overhaul | — | 2026-04-12 |
| CS28 | Staging Deployment | Deploy to staging and validate | yoga-gwn-c2 | — | — | — | 2026-04-12 |
| CS32 | Hide Community When Flag Off | Hide community entry point on home when submitPuzzle off | yoga-gwn | wt-1 | yoga-gwn/cs32-hide-community | — | 2026-04-12 |

> **Note:** For queued or in-flight clickstops, check files with `planned_` or `active_` prefixes in `project/clickstops/`. For completed clickstops, check files with `done_` prefix. See the task tables inside those files for task-level status.
