# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-04-26T23:48Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-25T18:15Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active | 2026-04-26T23:48Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-25T19:18Z |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | 🟢 Active | 2026-04-26T02:39Z |
| yoga-gwn-c5 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot5 | 🟢 Active | 2026-04-26T03:05Z |
| omni-gwn | HENRIKM-OMNI| C:\src\guesswhatisnext | ⚪ Offline | 2026-04-22T00:55Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |

## Active Work

| Task ID | Clickstop | State | Owner | Worktree | Branch | PR | Last Updated | Next Action | Blocked Reason |
|---------|-----------|-------|-------|----------|--------|----|--------------|-------------|----------------|
| CS53-14 + CS53-16 | CS53 — SW catch path + skipWaiting/clients.claim | implementing | yoga-gwn | C:\src\gwn-worktrees\wt-1 | yoga-gwn/cs53-14-16-sw-audit-and-fix | -- | 2026-04-26T23:50Z | Sub-agent dispatched. Pre-audit observation: CS53-16 (`skipWaiting` + `clients.claim`) already in `public/sw.js` since PR #15 — sub-agent should verify and mark Done. CS53-14 (catch path 503 propagation): current catch only fires on true network errors and synthesizes 503 without `Retry-After`; sub-agent must (a) determine whether the original bug still reproduces given CS53-16 is in place, (b) if yes, fix by either re-throwing the network error or synthesizing 503 with `Retry-After: 5`, (c) if no, ship a docs-only close. Tests + telemetry note (browser code, no server signal needed). | -- |
| CS52-8 | CS52 — comprehensive E2E tests | copilot_review | yoga-gwn-c5 | C:\src\gwn-worktrees\wt-cs52-8 | yoga-gwn-c5/cs52-8-impl | #283 | 2026-04-26T23:25Z | PR #283 open. 5 new tests added (cs52-8-cross-task.test.js — MP match-end achievements; cs52-8-claim-decline.test.js — decline=no-op + re-surface). Suite: 924 → 929 passing. Container validation PASSED (port 8443). 4 local GPT-5.4 review iterations resolved (R1: vacuous spy; R2: WS try/finally hoist; R3: connectWS terminate-on-timeout; R4: parallel gameOver wait). Coverage matrix in PR body maps every CS52-8 acceptance criterion to a pinning test. Awaiting Copilot + CI green. | -- |
| CS61 | Activate CS41 smoke + DB migration validation in staging | implementing | yoga-gwn-c2 | C:\src\guesswhatisnext_copilot2 | -- | -- | 2026-04-26T23:48Z | User-approved plan v3 (post-rubber-duck); 8 sub-tasks. **Wave 1 dispatched**: CS61-0 PR #284 OPEN (`yoga-gwn-c2/cs61-0-adapter-migration-state`) — adapter-level `getMigrationState()` + 8 unit tests against SQLite + MSSQL; full suite 932 passing; container:validate PASSED. Awaiting orchestrator merge → CS61-1 + CS61-2 in parallel. | -- |
> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
