# Project Context — Guess What's Next

This file tracks clickstops (deliverables), active tasks, and current project state.

- **Live work coordination:** [WORKBOARD.md](WORKBOARD.md)
- **Architecture decisions & learnings:** [LEARNINGS.md](LEARNINGS.md)
- **Completed clickstop archives:** [project/clickstops/](project/clickstops/)
- **Development guidelines:** [INSTRUCTIONS.md](INSTRUCTIONS.md)

> **Last updated:** 2026-04-15

---

## Clickstop Summary

| ID | Name | Status | Tasks | Archive |
|----|------|--------|-------|---------|
| CS1 | Client-Side Game | ✅ Complete | 10/10 | [details](project/clickstops/done/done_cs1_client-side-game.md) |
| CS2 | Backend & Multiplayer | ✅ Complete | 10/10 | [details](project/clickstops/done/done_cs2_backend-multiplayer.md) |
| CS3 | Security & Game Features | ✅ Complete | 10/10 | [details](project/clickstops/done/done_cs3_security-game-features.md) |
| CS4 | Infrastructure & Deployment | ✅ Complete | 3/3 | [details](project/clickstops/done/done_cs4_infrastructure.md) |
| CS5 | Multi-Player Expansion | ✅ Complete | 7/7 | [details](project/clickstops/done/done_cs5_multiplayer-expansion.md) |
| CS6 | Production Hardening | ✅ Complete | 3/3 | [details](project/clickstops/done/done_cs6_production-hardening.md) |
| CS7 | Quality & Testing | ✅ Complete | 2/2 | [details](project/clickstops/done/done_cs7_quality-testing.md) |
| CS8 | User Experience | ✅ Complete | 4/4 | [details](project/clickstops/done/done_cs8_user-experience.md) |
| CS9 | Content & Growth | ✅ Complete | 2/2 | [details](project/clickstops/done/done_cs9_content-growth.md) |
| CS10 | CI/CD Pipeline | ✅ Complete | 6/6 | [details](project/clickstops/done/done_cs10_cicd-pipeline.md) |
| CS11 | Database Migration | ✅ Complete | 18/18 | [details](project/clickstops/done/done_cs11_database-migration.md) |
| CS12 | Test Infrastructure | ✅ Complete | 3/3 | [details](project/clickstops/done/done_cs12_test-infrastructure.md) |
| CS13 | Observability & Logging | ✅ Complete | 7/7 | [details](project/clickstops/done/done_cs13_observability-logging.md) |
| CS14 | Community Puzzle Submission UX | ✅ Complete | 8/8 | [details](project/clickstops/done/done_cs14_community-puzzle-ux.md) |
| CS15 | Dev Tooling & Log Assertions | ✅ Complete | 5/5 | [details](project/clickstops/done/done_cs15_dev-tooling-log-assertions.md) |
| CS16 | Docs Optimization & Cleanup | ✅ Complete | 4/4 | [details](project/clickstops/done/done_cs16_docs-optimization.md) |
| CS17 | Process Documentation Improvement | ✅ Complete | 4/8 | [details](project/clickstops/done/done_cs17_process-docs-improvement.md) |
| CS18 | Address MSSQL Issues in Production | ✅ Complete | 10/10 | [details](project/clickstops/done/done_cs18_mssql-production-fixes.md) |
| CS19 | Community Puzzle Navigation & Testing | ✅ Complete | 4/5 | [details](project/clickstops/done/done_cs19_community-puzzle-navigation.md) |
| CS20 | Authentication UX Overhaul | ✅ Complete | 6/6 | [details](project/clickstops/done/done_cs20_auth-ux-overhaul.md) |
| CS21 | Leaderboard Personal Bests | ✅ Complete | 4/4 | [details](project/clickstops/done/done_cs21_leaderboard-personal-bests.md) |
| CS22 | Answer Randomization Fix | ✅ Complete | 5/5 | [details](project/clickstops/done/done_cs22_answer-randomization.md) |
| CS23 | Documentation Review | ✅ Complete | 4/4 | [details](project/clickstops/done/done_cs23_docs-review.md) |
| CS24 | Custom Domain (gwn.metzger.dk) | ✅ Complete | 5/5 | [details](project/clickstops/done/done_cs24_custom-domain.md) |
| CS25 | MSSQL E2E Testing | 🔄 Active | 27/34 | [details](project/clickstops/active_cs25_mssql-e2e-testing.md) |
| CS26 | Public Repository Transition | ✅ Complete | 11/11 | [details](project/clickstops/done/done_cs26_public-repo-transition.md) |
| CS27 | Feature Flag Gating | ✅ Complete | 4/4 | [details](project/clickstops/done/done_cs27_feature-flag-gating.md) |
| CS28 | Staging Deployment & Validation | ✅ Complete | 5/5 | [details](project/clickstops/done/done_cs28_staging-deployment.md) |
| CS29 | Production Deployment & Verification | ✅ Complete | 5/5 | [details](project/clickstops/done/done_cs29_production-deployment.md) |
| CS34 | Fix Deprecated Node.js 20 Actions | ✅ Complete | 3/3 | [details](project/clickstops/done/done_cs34_fix-deprecated-actions.md) |
| CS30 | Local Review Loop | ✅ Complete | 5/5 | [details](project/clickstops/done/done_cs30_local-review-loop.md) |
| CS31 | Instructions Optimization | ✅ Complete | 4/4 | [details](project/clickstops/done/done_cs31_instructions-optimization.md) |
| CS33 | Auth Header Polish | ✅ Complete | 5/5 | [details](project/clickstops/done/done_cs33_auth-header-polish.md) |
| CS35 | Clickstop File Cleanup | ✅ Complete | 5/5 | [details](project/clickstops/done/done_cs35_clickstop-cleanup.md) |
| CS36 | Instructions Lifecycle Clarity | ✅ Complete | 4/4 | [details](project/clickstops/done/done_cs36_instructions-lifecycle.md) |
| CS37 | Health Monitor Investigation | 🔄 Active | 0/3 | [details](project/clickstops/active_cs37_health-monitor-investigation.md) |
| CS38 | DB Cold Start UX | ✅ Complete | 11/11 | [details](project/clickstops/done/done_cs38_db-cold-start-ux.md) |
| CS39 | CI E2E Chromium Crashes | ✅ Complete | 4/4 | [details](project/clickstops/done/done_cs39_ci-e2e-chromium-crashes.md) |
| CS40 | Feature Flag Testing Infrastructure | ⬜ Planned | 0/5 | [details](project/clickstops/planned_cs40_feature-flag-testing.md) |

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

**Current workflow:** Agent pushes branch → creates PR → local review loop (GPT 5.4) → Copilot review (code/config PRs only; docs-only PRs skip) → merge via GH UI (branch protection enforced since CS26).
**Direct pushes to main:** Only the repository owner (henrik-me) can bypass branch protection, for WORKBOARD.md coordination updates and clickstop plan file commits (see INSTRUCTIONS.md § Clickstop File Lifecycle).

**PR Review Comment Resolution:**
Every Copilot review comment thread must be replied to with a meaningful message (fix commit reference, acknowledgment, or explanation) and then resolved via the GraphQL API. See the Copilot review policy in INSTRUCTIONS.md under Git workflow for API commands and reply conventions. Threads are never left unresolved — even "by design" decisions get an explicit reply before resolution.

---

## Known Issues

- On Node >= 22.13, when the optional `artillery` install is present, `npm ci` may emit OpenTelemetry peer-dependency warnings. These warnings come from optional load-testing dependencies that still pull older OTel metrics/exporter packages, while the application runtime telemetry path uses newer OTel packages.
- This is currently treated as non-blocking install noise for optional load-testing tooling. It does not affect the validated runtime telemetry path, and no dependency changes are planned right now.

---

## Clickstop CS11 — Database Migration

✅ Complete. Database abstraction layer (SQLite + Azure SQL) with repository pattern, versioned migrations, and config-driven backend selection. Azure Files cleanup, async route conversion, Azure SQL provisioning, and production deployment all done. Production running on Azure SQL (serverless free tier, centralus). See [archive](project/clickstops/done/done_cs11_database-migration.md).

---

## Clickstop CS14 — Community Puzzle Submission UX

✅ Complete. Puzzle submission discovery, authoring, moderation, and notifications. Feature-flagged via `submitPuzzle` (PR #91). All task PRs merged. Note: CS14-87 (image submissions) added client-side UI and server-side handling/sanitization code, but the `VALID_TYPES` gate in `server/routes/submissions.js` still excludes `image` — opening the gate is deferred to CS19. See [archive](project/clickstops/done/done_cs14_community-puzzle-ux.md).

---

## Clickstop CS15 — Dev Tooling & Log Assertions

✅ Complete. Unified dev server script (`scripts/dev-server.js`), e2e log capture via Playwright, log assertion tests (`tests/e2e/global-teardown.mjs`), CI artifact upload, and production log format validation (`tests/log-format.test.js`). Merged in PRs #88, #93, #94. See [archive](project/clickstops/done/done_cs15_dev-tooling-log-assertions.md).

---

## Clickstop CS18 — Address MSSQL Issues in Production

✅ Complete. Adapter-level SQL rewriting (LIMIT→OFFSET/FETCH, dates, RANDOM→NEWID, INSERT OR IGNORE, SCOPE_IDENTITY for lastId). Multiplayer leaderboard query rewritten for MSSQL compat (LEFT JOIN instead of aggregate subquery). Docker MSSQL validation stack with Caddy HTTPS. Deployed to production, verified. See [archive](project/clickstops/done/done_cs18_mssql-production-fixes.md).

---

## Clickstop CS19 — Community Puzzle Navigation & Testing

✅ Complete. Community puzzle submission moved to dedicated sub-page, feature-flag gating applied, E2E tests updated for new navigation, home screen cleaned up. CS19-4 (Docker MSSQL E2E) deferred to CS25. Merged in PR [#139](https://github.com/henrik-me/guesswhatisnext/pull/139). See [archive](project/clickstops/done/done_cs19_community-puzzle-navigation.md).

---

## Clickstop CS20 — Authentication UX Overhaul

Restructure auth UI: move controls to top header, simplify login/logout states, hide multiplayer until logged in, make leaderboard accessible without login, add "to keep score, sign in" prompts. See [full details](project/clickstops/planned_cs20_auth-ux-overhaul.md).

---

## Clickstop CS21 — High Score Synchronization

Fix high-score display to sync from backend on login (not just localStorage). Reposition to top header alongside auth info. See [full details](project/clickstops/planned_cs21_highscore-sync.md).

---

## Clickstop CS22 — Answer Randomization Fix

Fix bias where 75% of puzzles have correct answer as first option. Add Fisher-Yates shuffle before display, fix submission form bias. See [full details](project/clickstops/planned_cs22_answer-randomization.md).

---

## Clickstop CS25 — MSSQL E2E Testing

MSSQL Docker stack stabilized (Phase 0), full E2E suite validated against MSSQL (Phase 1), HTTPS/security header tests added (Phase 2), per-test server log capture with error flagging (Phase 3), OTel trace verification with OTLP collector (Phase 4), cold start UX testing with real server delays (Phase 5). Phases 0-5 complete in PRs #183-#188. Phase 6 (CI integration — staging deploy with MCR images) and Phase 7 (documentation) remain. See [full details](project/clickstops/active_cs25_mssql-e2e-testing.md).

---

## Clickstop CS24 — Custom Domain (gwn.metzger.dk)

Production custom domain `gwn.metzger.dk` configured with DNS (CNAME + TXT), Azure hostname binding, managed TLS certificate (auto-renewing), and deploy variable updates. All 5 tasks complete — verified via `https://gwn.metzger.dk/healthz` (200 OK). See [full details](project/clickstops/done/done_cs24_custom-domain.md).

---

## Clickstop CS26 — Public Repository Transition

Repository secured and made public. Branch protection, environment protection (staging + production), SHA-pinned actions, CODEOWNERS enforcement, fork PR security, MIT license, and CONTRIBUTING.md all configured. WORKBOARD.md bypass via ruleset. All 11 tasks complete — code changes in PR #145, settings via GitHub API. See [full details](project/clickstops/done/done_cs26_public-repo-transition.md).

---

## Clickstop CS30 — Local Review Loop

Add GPT 5.4 local review as a fast pre-review step (~60s vs 10+ min Copilot polling). Docs-only PRs skip Copilot review; code PRs use both. See [full details](project/clickstops/done/done_cs30_local-review-loop.md).

---

## Blockers / Open Questions

- **Azure Files storage cleanup**: ✅ Done (PR #49). Azure storage resources (`gwn-storage-staging`, `gwn-storage-production`) still exist in Azure and should be deleted manually.
- **Staging auto-deploy disabled**: Must manually trigger `workflow_dispatch` after merging to main. Re-enable once stable.
- **Production deployed**: ✅ Running on Azure SQL (serverless free tier) at [gwn.metzger.dk](https://gwn.metzger.dk). All migrations applied, 504 puzzles seeded.
- **Azure SQL free tier limit**: 1 free DB per subscription. Production gets the free DB; staging uses ephemeral local SQLite.

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

**Vitest (31 suites, 397 tests):**

| Suite | Tests | Suite | Tests |
|---|---|---|---|
| achievements | 4 | mssql-adapter | 60 |
| admin-endpoints | 10 | notifications | 14 |
| auth | 11 | nplayer | 4 |
| community-gallery | 14 | opentelemetry | 9 |
| delay-middleware | 21 | progressive-loader | 21 |
| e2e-multiplayer | 10 | promotion-and-roles | 14 |
| e2e-singleplayer | 4 | puzzles | 6 |
| error-handler | 9 | reconnection | 4 |
| feature-flags | 5 | rematch | 4 |
| features | 4 | scores | 12 |
| health | 3 | security | 8 |
| log-format | 4 | shuffle | 8 |
| logger | 21 | spectator | 10 |
| matches | 9 | sqlite-adapter | 24 |
| | | submissions | 51 |
| | | telemetry | 14 |
| | | wal-cleanup | 5 |

**Playwright E2E (13 specs, 79 tests):**

| Spec | Tests |
|---|---|
| auth | 17 |
| coldstart-real | 3 |
| community | 15 |
| container-logs | 2 |
| daily | 2 |
| freeplay | 2 |
| https-security | 6 |
| keyboard | 2 |
| leaderboard | 3 |
| moderation | 2 |
| my-submissions | 11 |
| progressive-loading | 5 |
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
│   ├── notifications.js  # /api/notifications (list, mark-read)
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
| `scripts/check-compose-v2.js` | Docker Compose v2 version check (used by `dev:mssql` scripts) |
| `scripts/test-e2e-mssql.js` | MSSQL E2E test runner (health wait, Playwright, teardown) |
| `scripts/health-check.ps1` | Windows health check script |
| `scripts/health-check.sh` | Unix health check script |

### Docker Compose Files

| File | Purpose |
|---|---|
| `docker-compose.yml` | Local container dev (SQLite, default) |
| `docker-compose.mssql.yml` | MSSQL stack: SQL Server 2022 + Caddy HTTPS + OTLP collector |
| `docker-compose.mssql.delay.yml` | Cold start overlay: enables delay middleware for cold start UX testing |

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

  Push to main (non-docs paths) or manual workflow_dispatch
         │  (staging-deploy.yml — gated by STAGING_AUTO_DEPLOY; concurrency: cancel superseded)
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
