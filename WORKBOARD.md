# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-04-25T18:32Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-25T18:15Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active | 2026-04-25T18:25Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-25T18:30Z |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | 🟢 Active | 2026-04-25T18:32Z |
| yoga-gwn-c5 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot5 | 🟢 Active | 2026-04-25T18:13Z |
| omni-gwn | HENRIKM-OMNI| C:\src\guesswhatisnext | ⚪ Offline | 2026-04-22T00:55Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |

## Active Work

| Task ID | Clickstop | State | Owner | Worktree | Branch | PR | Last Updated | Next Action | Blocked Reason |
|---------|-----------|-------|-------|----------|--------|----|--------------|-------------|----------------|
| CS54-4+5 | CS54 | implementing | yoga-gwn-c2 | wt-1 | yoga-gwn-c2/cs54-4-5-prod-deploy-wiring | -- | 2026-04-25T18:25Z | Wire prod-deploy.yml (both happy + rollback) via secretRef + add CS54-5 infra/deploy.{sh,ps1} updates + CI grep guard. PR drafted in parallel; merge gated on CS54-6 staging verification. | -- |
| CS54-6 | CS54 | implementing | yoga-gwn-c2 | -- | -- | -- | 2026-04-25T18:25Z | Staging deploy triggered (gh workflow run staging-deploy.yml); verify requests row in gwn-ai-staging within 5 min after deploy completes. | -- |
| CS53-23 | Boot-quiet contract foundation (absorbed from CS55-2 v2) | implementing | yoga-gwn-c4 | wt-2 | cs55-2-unread-count-cache | #241 | 2026-04-25T11:30Z | Rework PR #241 v1 (5-min TTL violates Policy 1) → v2: cache lifetime = process lifetime, X-User-Activity header contract, cold-cache miss returns 0 without DB | — |
| CS53-23 | CS53 | claimed | yoga-gwn | -- | cs55-2-unread-count-cache | #241 | 2026-04-25T18:15Z | Boot-quiet contract foundation (absorbed from CS55-2 v2). P0. About to dispatch sub-agent to a fresh worktree under c4 to take over PR #241 and rework v1 (5-min TTL, violates Policy 1) into v2 per CS53-23.A-L sub-tasks. Unblocks CS53-19 + all of CS55. | -- |
| CS53-19 | CS53 | blocked | yoga-gwn | C:\src\guesswhatisnext | -- | -- | 2026-04-25T18:15Z | Phase A (boot/focus/refresh HAR inventory) can start now in parallel; Phases C-G now depend on CS53-23 (was CS55-2.G/H/J before the absorption). | Waiting on CS53-23 (boot-quiet contract foundation) |
| CS58-4 | CS58 | blocked | yoga-gwn-c3 | -- | -- | -- | 2026-04-25T18:30Z | CS58-1 merged (#248), CS58-2 done (live `az` update applied — minReplicas=0 on revision `gwn-staging--0000025`, traffic switched, old revision deactivated), CS58-3 merged (#249). Soak in progress: re-run cost meter query in ~7 days (≈ 2026-05-02) to verify idle-meter quantities dropped >95%, then close CS58. | Waiting on 7-day cost soak. |

> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.