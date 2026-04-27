# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-04-27T00:25Z

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
| CS61 | Activate CS41 smoke + DB migration validation in staging | implementing | yoga-gwn-c2 | C:\src\guesswhatisnext_copilot2 | yoga-gwn-c2/cs61-3-staging-wiring | #289 | 2026-04-27T00:25Z | CS61-0 MERGED (PR #284). CS61-1 MERGED (PR #287). CS61-2 MERGED (PR #285). **CS61-3 PR #289 OPEN** (`yoga-gwn-c2/cs61-3-staging-wiring`) — wires preflight + seed (CS61-1) + migration assertion (CS61-2) into `staging-deploy.yml` per plan v3 D2/D4. Step ordering: preflight first (before any az containerapp mutation); seed after deploy + npm ci, before CS41-12 (with /healthz wait + 10× retry to absorb lazy DB self-init); migration assertion (`/api/admin/migrations.status === 'ok'`) after seed, before traffic-set. CS41-1/CS41-12/CS41-5 skip-on-secret-missing branches retained as safety net (removed in CS61-4). Full suite 982/982; 13 new structural assertions (42/42 in cs41-12-deploy-yaml-structure.test.js); check:docs + check:migration-policy + container:validate all PASSED; Copilot review requested. Awaiting orchestrator merge → CS61-4 + CS61-5 (parallel). | -- |
| CS52-10 | CS52 — staging deploy + validation | claimed | yoga-gwn-c5 | C:\src\gwn-worktrees\wt-cs52-10 | yoga-gwn-c5/cs52-10-impl | -- | 2026-04-27T00:50Z | CS52-9 attestation green (Ready for CS52-10 staging deploy). About to dispatch sub-agent to: (1) trigger staging-deploy.yml, (2) wake gwn-staging cold (per CS58 minReplicas=0), (3) run CS52-9's validate scripts against staging, (4) verify Azure SQL has both new UNIQUE indexes + legacy backfill count + admin route gated by SYSTEM_API_KEY, (5) confirm App Insights requests rows for new endpoints. Captures pass/fail per scenario in PR body. Gate before CS52-11 prod deploy. | -- |
> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
