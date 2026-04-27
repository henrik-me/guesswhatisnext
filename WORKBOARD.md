# Work Board

Live coordination file for multi-agent work. Only orchestrating agents update this file.
Orchestrators update this file directly on main -- no PR required.

> **Last updated:** 2026-04-27T00:42Z

## Orchestrators

Status vocabulary: `🟢 Active` (Last Seen within 24h), `🟡 Idle` (24h-7d), `⚪ Offline` (>7d).
`Last Seen` is best-effort; it may show `unknown` for agents that have not reported since the
CS44-3 schema upgrade.

| Agent ID | Machine | Repo Folder | Status | Last Seen |
|----------|---------|-------------|--------|-----------|
| yoga-gwn | HENRIKM-YOGA | C:\src\guesswhatisnext | 🟢 Active | 2026-04-25T18:15Z |
| yoga-gwn-c2 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot2 | 🟢 Active | 2026-04-26T23:48Z |
| yoga-gwn-c3 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot3 | 🟢 Active | 2026-04-25T19:18Z |
| yoga-gwn-c4 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot4 | 🟢 Active | 2026-04-27T00:42Z |
| yoga-gwn-c5 | HENRIKM-YOGA | C:\src\guesswhatisnext_copilot5 | 🟢 Active | 2026-04-26T03:05Z |
| omni-gwn | HENRIKM-OMNI| C:\src\guesswhatisnext | ⚪ Offline | 2026-04-22T00:55Z |
| omni-gwn-c2 | HENRIKM-OMNI | C:\src\guesswhatisnext_copilot2 | ⚪ Offline | 2026-04-21T22:38Z |

## Active Work

| Task ID | Clickstop | State | Owner | Worktree | Branch | PR | Last Updated | Next Action | Blocked Reason |
|---------|-----------|-------|-------|----------|--------|----|--------------|-------------|----------------|
| CS53-19 | CS53 — boot-quiet enforcement across every boot/focus endpoint (telemetry-first) | implementing | yoga-gwn | C:\src\gwn-worktrees\wt-1 | yoga-gwn/cs53-19-boot-quiet-rollout | -- | 2026-04-27T00:40Z | Sub-agent dispatched (Opus 4.7). Telemetry-first restructure (per user direction): step 1 add `{ gate: 'boot-quiet', route, dbTouched, userActivity, isSystem, userId }` Pino lines + KQL to all candidate endpoints (`/api/auth/me`, `/api/features`, `/api/notifications` list, `/api/scores/me`, `/api/achievements`, `/api/matches/history`); step 2 extend `container-validate` with `--mode=boot-quiet` Playwright harness; step 3 baseline run identifies violations; step 4 fix per-endpoint + close cold-start init-gate gap (`server/app.js:258-280`); step 5 wrap harness as CI Playwright spec. Replaces manual HAR capture with quantitative reproducible measurement. Auto-satisfies CS41-6 telemetry gate. | -- |
| CS61 | Activate CS41 smoke + DB migration validation in staging | implementing | yoga-gwn-c2 | C:\src\guesswhatisnext_copilot2 | yoga-gwn-c2/cs61-3-staging-wiring + yoga-gwn-c2/cs61-5-transition-marker | #289 + #290 | 2026-04-27T00:30Z | CS61-0 MERGED (PR #284). CS61-1 MERGED (PR #287). CS61-2 MERGED (PR #285). **CS61-3 PR #289 OPEN** (`yoga-gwn-c2/cs61-3-staging-wiring`) — wires preflight + seed (CS61-1) + migration assertion (CS61-2) into `staging-deploy.yml` per plan v3 D2/D4. Step ordering: preflight first (before any az containerapp mutation); seed after deploy + npm ci, before CS41-12 (with /healthz wait + 10× retry to absorb lazy DB self-init); migration assertion (`/api/admin/migrations.status === 'ok'`) after seed, before traffic-set. CS41-1/CS41-12/CS41-5 skip-on-secret-missing branches retained as safety net (removed in CS61-4). Full suite 982/982; 13 new structural assertions (42/42 in cs41-12-deploy-yaml-structure.test.js); check:docs + check:migration-policy + container:validate all PASSED; Copilot review requested. Awaiting orchestrator merge → CS61-4 + CS61-5 (parallel). **CS61-5 PR #290 OPEN** (`yoga-gwn-c2/cs61-5-transition-marker`) — adds positive transition marker step probing `/api/admin/migrations` on OLD revision before CS41-12 OLD smoke runs (HTTP 200/401/403 → proceed; 404 → graceful-skip; other → fail). Existing CS41-12 step gated on `steps.cs41-12-marker.outputs.skip-old-smoke != 'true'`. 6 new structural assertions in `cs41-12-deploy-yaml-structure.test.js` (48/48 in file); full suite 994/994; check:docs + check:migration-policy + container:validate all PASSED; Copilot review requested. | -- |
| CS52-10 | CS52 — staging deploy + validation | blocked | yoga-gwn-c5 | C:\src\gwn-worktrees\wt-cs52-10 | yoga-gwn-c5/cs52-10-impl | #291 | 2026-04-27T01:00Z | **BLOCKED on CS61-1 staging-deploy regression.** PR #291 OPEN with the staging-pointing probe driver (`scripts/cs52-10-staging-probe.js`) but all 6 validation scenarios are 🚫 BLOCKED — both staging-deploy.yml dispatches (runs 24970777175, 24971160848) failed in the new `Seed gwn-smoke-bot via API (CS61-1)` step with HTTP 500 (App Insights `exceptions`: `SQLITE_ERROR: no such table: users` ×30+) because the seed loop's 10×5s retry budget expires before CS53-9 lazy DB self-init completes. CS41-5 rolled back; live revision `gwn-staging--deploy-1777143570` (image `6b368de`) predates CS52, so even ad-hoc probing has no CS52 surface to hit. **Not CS52 code** — filed for CS61 orchestrator. Probe script got local GPT-5.4 review (4 findings, all addressed); requires Copilot review; awaiting deploy-fix from yoga-gwn-c2. Suggested CS61 follow-up: prime DB self-init via `/api/features` GET before first seed POST, OR widen retry budget to span `WARMUP_CAP_MS+COLD_START_MS`. | -- |
| CS62 | WORKBOARD readability restructure (and H1 ↔ filename consistency) | claimed | yoga-gwn-c4 | C:\src\gwn_copilot4-worktrees\wt-cs62 | yoga-gwn-c4/cs62-impl | -- | 2026-04-27T00:42Z | Plan committed (`active_cs62_workboard-readability-restructure.md`). Restructure `## Active Work` to 6 columns + per-entry 2-row form (status + italic description); fold worktree+branch into Title cell; drop standalone Worktree/Branch/PR columns; PR refs inline in description. New warn-only docs-consistency rules: `clickstop-h1-matches-filename` + `workboard-title-matches-h1`. Cleanup stale CS44-3 comments (already landed PR #211). Sub-agent dispatch pending; worktree being created. **Active orchestrators (yoga-gwn, yoga-gwn-c2, yoga-gwn-c5) will need to `git pull` and re-read OPERATIONS/TRACKING for the new entry template once this lands.** | -- |
> **Note:** Clickstop files live under lifecycle subdirectories: `project/clickstops/planned/` (queued), `project/clickstops/active/` (in flight), `project/clickstops/done/` (completed). See the task tables inside those files for task-level status. Completion history is recoverable via `git log --diff-filter=A -- project/clickstops/done/`.
