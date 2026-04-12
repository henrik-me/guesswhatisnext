# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main — no PR required.

> **Last updated:** 2026-04-12T19:10Z

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
| CS24 | Custom Domain (gwn.metzger.dk) | DNS + Azure binding + TLS + deploy vars | yoga-gwn-c3 | — | — | — | 2026-04-12T19:10Z |
| CS28 | Staging Deployment| Deploy to staging and validate | yoga-gwn-c2 | — | — | — | 2026-04-12 |
| CS33 | Auth Header Polish | Refine auth header UX from CS20 | yoga-gwn-c4 | wt-1 | yoga-gwn-c4/cs33-auth-header-polish | — | 2026-04-12 |
| CS21 | Leaderboard Personal Bests | Remove home high score, add personal bests to leaderboard | yoga-gwn | wt-1 | yoga-gwn/cs21-leaderboard-personal-bests | — | 2026-04-12T19:52Z |

> **Note:** For queued or in-flight clickstops, check files with `planned_` or `active_` prefixes in `project/clickstops/`. For completed clickstops, check files with `done_` prefix. See the task tables inside those files for task-level status.
