# Project Context — Guess What's Next

This file tracks clickstops (deliverables), active tasks, and current project state.

- **Live work coordination:** [WORKBOARD.md](WORKBOARD.md)
- **Architecture decisions & learnings:** [LEARNINGS.md](LEARNINGS.md)
- **Completed clickstop archives:** [project/clickstops/](project/clickstops/)
- **Development guidelines:** [INSTRUCTIONS.md](INSTRUCTIONS.md)

> **Last updated:** 2026-04-09

---

## Clickstop Summary

| ID | Name | Status | Tasks | Archive |
|----|------|--------|-------|---------|
| CS1 | Client-Side Game | ✅ Complete | 10/10 | [details](project/clickstops/done_cs1_client-side-game.md) |
| CS2 | Backend & Multiplayer | ✅ Complete | 10/10 | [details](project/clickstops/done_cs2_backend-multiplayer.md) |
| CS3 | Security & Game Features | ✅ Complete | 10/10 | [details](project/clickstops/done_cs3_security-game-features.md) |
| CS4 | Infrastructure & Deployment | ✅ Complete | 3/3 | [details](project/clickstops/done_cs4_infrastructure.md) |
| CS5 | Multi-Player Expansion | ✅ Complete | 7/7 | [details](project/clickstops/done_cs5_multiplayer-expansion.md) |
| CS6 | Production Hardening | ✅ Complete | 3/3 | [details](project/clickstops/done_cs6_production-hardening.md) |
| CS7 | Quality & Testing | ✅ Complete | 2/2 | [details](project/clickstops/done_cs7_quality-testing.md) |
| CS8 | User Experience | ✅ Complete | 4/4 | [details](project/clickstops/done_cs8_user-experience.md) |
| CS9 | Content & Growth | ✅ Complete | 2/2 | [details](project/clickstops/done_cs9_content-growth.md) |
| CS10 | CI/CD Pipeline | ✅ Complete* | 5/6 | [details](project/clickstops/done_cs10_cicd-pipeline.md) |
| CS11 | Database Migration | 🔄 Active | 8/18 | [details](project/clickstops/active_cs11_database-migration.md) |
| CS12 | Test Infrastructure | ✅ Complete | 3/3 | [details](project/clickstops/done_cs12_test-infrastructure.md) |
| CS13 | Observability & Logging | ✅ Complete | 7/7 | [details](project/clickstops/done_cs13_observability-logging.md) |
| CS14 | Community Puzzle Submission UX | ⬜ Planned | 0/8 | [details](project/clickstops/planned_cs14_community-puzzle-ux.md) |
| CS15 | Dev Tooling & Log Assertions | 🔄 Active | 1/5 | [details](project/clickstops/active_cs15_dev-tooling-log-assertions.md) |

*CS10: task CS10-56 (unified infra script) still pending.

---

## Development Workflow

Parallel work uses **fixed worktree slots** (`wt-1` through `wt-4`) with task-specific branch names.
Each agent pushes its branch to origin and merges to main remotely. The main agent pulls after each merge.

Worktree root folders are named `gwn<suffix>-worktrees` where `<suffix>` is the remaining text
after removing the repo name from the clone folder (see INSTRUCTIONS.md § Parallel Agent Workflow).

| Slot | Path | Port | Status |
|---|---|---|---|
| main | `C:\src\guesswhatisnext<suffix>` | 3000 | Orchestration, sequential work |
| wt-1 | `C:\src\gwn<suffix>-worktrees\wt-1` | 3001 | Available |
| wt-2 | `C:\src\gwn<suffix>-worktrees\wt-2` | 3002 | Available |
| wt-3 | `C:\src\gwn<suffix>-worktrees\wt-3` | 3003 | Available |
| wt-4 | `C:\src\gwn<suffix>-worktrees\wt-4` | 3004 | Available |

**All implementation work runs as background task agents — the main session only orchestrates.** The orchestrating agent dispatches tasks to background agents in worktree slots, monitors progress via notifications, and merges approved PRs. It never directly edits code, runs tests, or creates PRs itself. The orchestrating agent actively relays background task progress to the user — status checks, milestone updates, and completion notifications rather than dispatching silently.

**Current workflow (pre-branch-protection):** Agent pushes branch → creates PR → Copilot review → merges PR via GitHub (no direct pushes to main).
**Future workflow (post-branch-protection):** Agent pushes branch → creates PR → CI + Copilot review → merge via GH UI.

**PR Review Comment Resolution:**
Every Copilot review comment thread must be replied to with a meaningful message (fix commit reference, acknowledgment, or explanation) and then resolved via the GraphQL API. See the Copilot review policy in INSTRUCTIONS.md under Git workflow for API commands and reply conventions. Threads are never left unresolved — even "by design" decisions get an explicit reply before resolution.

---

## Known Issues

- On Node >= 22.13, when the optional `artillery` install is present, `npm ci` may emit OpenTelemetry peer-dependency warnings. These warnings come from optional load-testing dependencies that still pull older OTel metrics/exporter packages, while the application runtime telemetry path uses newer OTel packages.
- This is currently treated as non-blocking install noise for optional load-testing tooling. It does not affect the validated runtime telemetry path, and no dependency changes are planned right now.

---

## Clickstop CS11 — Database Migration

Database abstraction layer (SQLite + Azure SQL) with repository pattern, versioned migrations, and config-driven backend selection. Azure Files cleanup complete; async route conversion complete; Azure SQL provisioning and production deploy remaining. See [full details](project/clickstops/active_cs11_database-migration.md).

---

## Clickstop CS14 — Community Puzzle Submission UX

Improve puzzle submission discovery, authoring, moderation, and notifications. Feature-flagged via `submitPuzzle` (PR #91). Not started. See [full details](project/clickstops/planned_cs14_community-puzzle-ux.md).

---

## Clickstop CS15 — Dev Tooling & Log Assertions

Unified dev server script done (CS15-90). Remaining: e2e log capture, log assertion tests, CI artifact upload, production log format validation. See [full details](project/clickstops/active_cs15_dev-tooling-log-assertions.md).

---

## Blockers / Open Questions

- **Azure Files storage cleanup**: ✅ Done (PR #49). Azure storage resources (`gwn-storage-staging`, `gwn-storage-production`) still exist in Azure and should be deleted manually.
- **Staging auto-deploy disabled**: Must manually trigger `workflow_dispatch` after merging to main. Re-enable once CS11 is stable.
- **Production not yet deployed**: Depends on Azure SQL migration (CS11c) since Azure Files SMB is broken for SQLite.
- **Azure SQL free tier limit**: 1 free DB per subscription. Production gets the free DB; staging uses ephemeral local SQLite.
- **Sync→async migration risk**: ✅ Done. All DB calls converted from sync (better-sqlite3) to async. 241 tests pass.

---

## Current Codebase State

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | PR to main | Lint + test + E2E (parallel) |
| `staging-deploy.yml` | Push to main + workflow_dispatch | Build, push GHCR, smoke tests, deploy Azure staging |
| `prod-deploy.yml` | workflow_dispatch only | Deploy validated image to production with approval gate |
| `load-test.yml` | workflow_dispatch + weekly schedule | Artillery API + WS stress tests |
| `health-monitor.yml` | Every 6 hours + workflow_dispatch | Azure API health checks, creates issues on failure |

Note: `ci-cd.yml` has been removed from the tree.

### Test Inventory

**Vitest (26 suites, 241 tests):**

| Suite | Tests | Suite | Tests |
|---|---|---|---|
| achievements | 4 | mssql-adapter | 34 |
| admin-endpoints | 10 | nplayer | 4 |
| auth | 11 | opentelemetry | 7 |
| e2e-multiplayer | 10 | promotion-and-roles | 14 |
| e2e-singleplayer | 4 | puzzles | 6 |
| error-handler | 9 | reconnection | 4 |
| feature-flags | 4 | rematch | 4 |
| features | 4 | scores | 8 |
| health | 3 | security | 8 |
| log-format | 4 | spectator | 10 |
| logger | 21 | sqlite-adapter | 24 |
| matches | 9 | submissions | 21 |
| | | telemetry | 14 |
| | | wal-cleanup | 5 |

**Playwright E2E (6 specs, 21 tests):**

| Spec | Tests |
|---|---|
| auth | 5 |
| daily | 2 |
| freeplay | 2 |
| keyboard | 2 |
| leaderboard | 1 |
| telemetry | 9 |

### Server Architecture

```
server/
├── index.js              # Entry point, server startup
├── app.js                # Express app factory, route wiring, middleware
├── config.js             # Centralized env vars with startup validation
├── logger.js             # Pino structured logging, OTel trace mixin
├── telemetry.js          # OpenTelemetry SDK, Azure Monitor exporter
├── achievements.js       # Achievement unlock logic
├── categories.js         # Puzzle category definitions
├── feature-flags.js      # Feature flag evaluation (submitPuzzle)
├── puzzleData.js         # Bundled puzzle data
├── routes/
│   ├── auth.js           # /api/auth (register, login, me)
│   ├── scores.js         # /api/scores (submit, leaderboard, multiplayer-lb, me)
│   ├── matches.js        # /api/matches (create, join, history, get)
│   ├── puzzles.js        # /api/puzzles (list)
│   ├── achievements.js   # /api/achievements (list, me)
│   ├── features.js       # /api/features (list)
│   ├── submissions.js    # /api/submissions (submit, list, pending, review)
│   ├── users.js          # /api/users (list, update-role)
│   └── telemetry.js      # /api/telemetry (errors)
├── middleware/
│   ├── auth.js           # JWT + API key auth, optionalAuth, requireSystem
│   └── security.js       # Helmet headers, HTTPS redirect, HSTS, CSP
├── db/
│   ├── index.js          # createDb() factory → returns adapter
│   ├── base-adapter.js   # Shared interface + parameter translation
│   ├── sqlite-adapter.js # SQLite implementation (sync → promisified)
│   ├── mssql-adapter.js  # Azure SQL implementation (native async)
│   ├── connection.js     # Legacy connection module
│   ├── schema.sql        # Reference schema
│   ├── seed-puzzles.js   # Puzzle seeding
│   └── migrations/
│       ├── _tracker.js   # Migration version table + runner
│       ├── index.js      # Migration loader
│       ├── 001-initial.js
│       ├── 002-add-role.js
│       ├── 003-add-max-players.js
│       └── 004-add-submitted-by.js
└── ws/
    └── matchHandler.js   # WebSocket multiplayer logic
```

**Additional endpoints:** `/api/health`, `/healthz`, `/api/admin/drain`, `/api/admin/init-db`

### Database Tables

`users`, `scores`, `matches`, `match_players`, `match_rounds`, `achievements`, `user_achievements`, `puzzles`, `puzzle_submissions`

### Client Architecture

```
public/
├── index.html            # SPA shell
├── manifest.json         # PWA manifest
├── offline.html          # Offline fallback page
├── sw.js                 # Service worker (offline support)
├── js/
│   ├── app.js            # Event handlers, screen navigation
│   ├── game.js           # Game engine
│   ├── daily.js          # Daily challenge logic
│   ├── puzzles.js        # Client-side puzzle data
│   ├── audio.js          # Web Audio API sounds
│   ├── storage.js        # LocalStorage helpers
│   └── sw-register.js    # Service worker registration
├── css/                  # Stylesheets
└── img/                  # Image assets (SVG puzzles)
```

### Feature Flags

- `submitPuzzle`: default-off, percentage rollout, user targeting, overrides disabled in prod/staging

### Dev Scripts

| Script | Purpose |
|---|---|
| `scripts/dev-server.js` | Unified dev server with HTTPS + log capture |
| `scripts/dev-https.js` | HTTPS monkey-patch for local dev |
| `scripts/health-check.ps1` | Windows health check script |
| `scripts/health-check.sh` | Unix health check script |

### GitHub Configuration

- `.github/CODEOWNERS` — code ownership rules
- `.github/copilot-instructions.md` — Copilot context
- `.github/pull_request_template.md` — PR template

### Infrastructure

- `infra/deploy.sh` / `infra/deploy.ps1` — Azure deployment scripts
- `infra/setup-github.sh` / `infra/setup-github.ps1` — GitHub secrets/variables setup
- `infra/README.md` — Infrastructure documentation

### Deployment Architecture

```
  Developer opens PR targeting main
         │
         ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  PR checks (ci.yml)                                         │
  │  [Lint] + [Test] + [E2E]  (parallel)                        │
  └──────────────────────────────────────────────────────────────┘

  Manual trigger (staging-deploy.yml — auto-deploy disabled in PR #41)
         │  (concurrency: cancel superseded)
         ▼
  ┌──────────────────────────────────────────────────────────────────────────────────┐
  │  Staging Pipeline                                                                │
  │                                                                                  │
  │  [Build+Push to GHCR] → [Ephemeral smoke tests] → [ff release/staging]          │
  │                           (container in CI)              │                       │
  │                                                   [⏸️ Approval]                  │
  │                                                          │                       │
  │                                                [Deploy Azure staging → Verify]   │
  └──────────────────────────────────────────────────────────────┬───────────────────┘
                                                                 │
                                                                 ▼
                                                      ┌───────────────────────┐
                                                      │  STAGING              │
                                                      │  gwn-staging          │
                                                      │  Container Apps       │
                                                      │  Scale-to-zero ($0)   │
                                                      └───────────────────────┘

  Manual trigger (prod-deploy.yml)
         │  (convention: only deploy images validated in staging)
         ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Production Pipeline                                                │
  │                                                                     │
  │  [Deploy same image to prod] → [Verify] → [Auto-rollback on fail]  │
  └──────────────────────────────────────┬──────────────────────────────┘
                                         │
                                         ▼
                              ┌───────────────────────┐
                              │  PRODUCTION           │
                              │  gwn-production       │
                              │  Container Apps       │
                              │  Auto-rollback on fail│
                              └───────────────────────┘
                                         ▲
  GitHub Actions Health Monitor (every 6 hours)┘
         │ on failure → GitHub Issue
```
