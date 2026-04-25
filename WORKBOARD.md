# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-04-25T17:59Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-25T17:30Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active | 2026-04-25T17:58Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-25T17:54Z |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | 🟢 Active | 2026-04-25T17:59Z |
| omni-gwn | HENRIKM-OMNI | C:\src\guesswhatisnext | ⚪ Offline | 2026-04-22T00:55Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |

## Active Work

| Task ID | Clickstop | State | Owner | Worktree | Branch | PR | Last Updated | Next Action | Blocked Reason |
|---------|-----------|-------|-------|----------|--------|----|--------------|-------------|----------------|
| CS53-19 | CS53 | blocked | yoga-gwn | C:\src\guesswhatisnext | -- | -- | 2026-04-25T17:30Z | Phase A (boot/focus/refresh HAR inventory) can start now in parallel; Phases C-G need CS55-2.G/H/J | Waiting on CS55-2.G (X-User-Activity header contract), CS55-2.H (server helper), CS55-2.J (no-header response shape) |
| CS54-3 | CS54 | implementing | yoga-gwn-c2 | wt-1 | yoga-gwn-c2/cs54-3-staging-deploy-wiring | -- | 2026-04-25T17:58Z | Wire APPLICATIONINSIGHTS_CONNECTION_STRING into staging-deploy.yml via secretRef. CS54-1+CS54-2 done (operator log in CS54 file). | -- |
| CS54-7 | CS54 | implementing | yoga-gwn-c2 | wt-2 | yoga-gwn-c2/cs54-7-observability-docs | -- | 2026-04-25T17:58Z | Document KQL queries for AI requests table + Pino bridge to ContainerAppConsoleLogs_CL; covers user-prioritized "how to get / what to look for in logs". Parallel with CS54-3. | -- |
| CS58-1 | CS58 | copilot_review | yoga-gwn-c3 | wt-1 | yoga-gwn-c3/cs58-1-min-replicas-zero | #248 | 2026-04-25T17:54Z | PR #248 open with one-line YAML change (minReplicas: 1 → 0). Local review (GPT-5.4): no issues. Awaiting Copilot review. CS58-2 (live az containerapp update) gated on merge. | -- |
| CS58-3 | CS58 | implementing | yoga-gwn-c3 | wt-2 | yoga-gwn-c3/cs58-3-docs | -- | 2026-04-25T17:54Z | Sub-agent in flight: docs-only PR updating INSTRUCTIONS/OPERATIONS/CONTEXT/infra README + prod-deploy.yml comments + GH staging-secrets and health-monitor audits. Skip Copilot review (docs-only). | -- |
| --      | --   | claimed | yoga-gwn-c4 | -- | -- | -- | 2026-04-25T17:59Z | Triage 3 open Dependabot security alerts (postcss #9, uuid #8, fast-xml-parser #7). PR #237 already CI-green for fast-xml-parser. Decide bundling vs. per-alert PRs, then dispatch to wt-1. | -- |

> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.