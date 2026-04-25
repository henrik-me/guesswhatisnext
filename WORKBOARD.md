# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-04-25T22:13Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-25T18:15Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active | 2026-04-25T18:25Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-25T19:18Z |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | 🟢 Active | 2026-04-25T22:13Z |
| yoga-gwn-c5 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot5 | 🟢 Active | 2026-04-25T18:13Z |
| omni-gwn | HENRIKM-OMNI| C:\src\guesswhatisnext | ⚪ Offline | 2026-04-22T00:55Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |

## Active Work

| Task ID | Clickstop | State | Owner | Worktree | Branch | PR | Last Updated | Next Action | Blocked Reason |
|---------|-----------|-------|-------|----------|--------|----|--------------|-------------|----------------|
| CS54-4+5 | CS54 | implementing | yoga-gwn-c2 | wt-1 | yoga-gwn-c2/cs54-4-5-prod-deploy-wiring | -- | 2026-04-25T18:25Z | Wire prod-deploy.yml (both happy + rollback) via secretRef + add CS54-5 infra/deploy.{sh,ps1} updates + CI grep guard. PR drafted in parallel; merge gated on CS54-6 staging verification. | -- |
| CS54-6 | CS54 | implementing | yoga-gwn-c2 | -- | -- | -- | 2026-04-25T18:25Z | Staging deploy triggered (gh workflow run staging-deploy.yml); verify requests row in gwn-ai-staging within 5 min after deploy completes. | -- |
| CS53-23 | Boot-quiet contract foundation (absorbed from CS55-2 v2) | implementing | yoga-gwn | C:\src\guesswhatisnext | cs55-2-unread-count-cache | #241 | 2026-04-25T22:10Z | Full ownership consolidated under yoga-gwn (was split with c4). PR #241 status: 7 commits (head a20606c); R1-R3 Copilot addressed; container-validate ✅ ×5. **Open work:** (1) PR is mergeStateStatus DIRTY — conflicts with main on `.gitignore` + `INSTRUCTIONS.md` (rebase/merge needed). (2) Copilot R4 (19:23Z) has 3 unaddressed inline findings: (a) `tests/unread-count-cache.test.js:28` real-setTimeout "long sleep" → replace with fake timers or drop; (b) `server/routes/notifications.js:89` system-key auth path blocked by header-gate but INSTRUCTIONS says system-key is excluded — reconcile (special-case OR tighten docs); (c) `server/routes/notifications.js:105` `_coerceCount` duplicated between route + cache service → consolidate. Then: container-validate cycle 6, re-request Copilot R5, merge. Unblocks CS53-19 + all of CS55. | -- |
| CS53-19 | CS53 | blocked | yoga-gwn | C:\src\guesswhatisnext | -- | -- | 2026-04-25T22:10Z | Phase A (boot/focus/refresh HAR inventory) can start now in parallel; Phases C-G now depend on CS53-23 (was CS55-2.G/H/J before the absorption). | Waiting on CS53-23 (boot-quiet contract foundation) |

| CS52-1 | CS52 | designing | yoga-gwn-c5 | C:\src\guesswhatisnext_copilot5 | -- | -- | 2026-04-25T18:45Z | Design lock-down session with user. Adding guest/disconnected-auth offline play unified design (localStorage-only while not connected; user-action-triggered single-flight background sync; ack-driven local cache update). Walking open questions one-by-one with user. No code in this task. | -- |
> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
