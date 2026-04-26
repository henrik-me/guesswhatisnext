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
| CS52-9 | CS52 — local production-shape validation (MSSQL + Caddy HTTPS + OTLP) | implementing | yoga-gwn-c5 | C:\src\gwn-worktrees\wt-cs52-9 | yoga-gwn-c5/cs52-9-impl | -- | 2026-04-26T23:55Z | All 11 CS52 implementation/test PRs merged (CS52-2/3/4/5/6/7/7b/7c/7d/7e/8). About to dispatch sub-agent for CS52-9: exercise full CS52 surface end-to-end via `npm run dev:mssql` stack (MSSQL 2022 + Caddy HTTPS + OTLP collector) — streaming dispatch over TLS, cold-start → 202 queue → drain replay all 3 pending_writes variants, MP I-β shape under MSSQL, admin route survives container restart, schema migration on empty + legacy-seeded MSSQL, OTLP collector receives spans for all new endpoints. Pass/fail per scenario captured in PR body. Gate before CS52-10 staging deploy. | -- |
| CS61 | Activate CS41 smoke + DB migration validation in staging | implementing | yoga-gwn-c2 | C:\src\guesswhatisnext_copilot2 | -- | -- | 2026-04-26T23:56Z | User-approved plan v3 (post-rubber-duck); 8 sub-tasks. CS61-0 MERGED (PR #284). **Wave 2 in flight**: CS61-2 PR #285 OPEN (`yoga-gwn-c2/cs61-2-migrations-endpoint`) — `GET /api/admin/migrations` endpoint + 10 integration tests (auth + full ok/pending/ahead/error/throw taxonomy); full suite 942 passing; check:docs + check:migration-policy + container:validate all PASSED; Copilot review requested. CS61-1 (parallel sub-agent) tracking separately. Awaiting orchestrator merge of CS61-1 + CS61-2 → CS61-3. | -- |
> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
