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
| CS11 | Database Migration | 🔄 Active | see below | — |
| CS12 | Test Infrastructure | ✅ Complete | 3/3 | [details](project/clickstops/done_cs12_test-infrastructure.md) |
| CS13 | Observability & Logging | ✅ Complete | 7/7 | [details](project/clickstops/done_cs13_observability-logging.md) |
| CS14 | Community Puzzle Submission UX | ⬜ Planned | see below | — |
| CS15 | Dev Tooling & Log Assertions | 🔄 Active | see below | — |

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

**Current workflow (pre-branch-protection):** Agent pushes branch → merges to main on remote → pushes main.
**Future workflow (post-branch-protection):** Agent pushes branch → creates PR → CI + review → merge via GH UI.

**PR Review Comment Resolution:**
Every Copilot review comment thread must be replied to with a meaningful message (fix commit reference, acknowledgment, or explanation) and then resolved via the GraphQL API. See the Copilot review policy in INSTRUCTIONS.md under Git workflow for API commands and reply conventions. Threads are never left unresolved — even "by design" decisions get an explicit reply before resolution.

---

## Known Issues

- On Node >= 22.13, when the optional `artillery` install is present, `npm ci` may emit OpenTelemetry peer-dependency warnings. These warnings come from optional load-testing dependencies that still pull older OTel metrics/exporter packages, while the application runtime telemetry path uses newer OTel packages.
- This is currently treated as non-blocking install noise for optional load-testing tooling. It does not affect the validated runtime telemetry path, and no dependency changes are planned right now.

---

## Clickstop CS11 — Database Abstraction + Azure SQL Migration

### Goal
Replace the tightly-coupled SQLite layer with a clean database abstraction that supports both SQLite (local dev, staging, tests) and Azure SQL (production). Eliminates SMB issues permanently, enables persistent production data, and supports proper schema migrations.

### CS11a — Azure Files Cleanup (Quick Win)

Remove all dead Azure Files / SMB volume mount references. Nothing uses them anymore.

| File | Change |
|------|--------|
| `staging-deploy.yml` | Remove `volumes`, `volumeMounts`, `data-volume` blocks |
| `prod-deploy.yml` | Same — deploy + rollback paths (4 blocks) |
| `infra/deploy.sh` | Remove storage account/share creation, mount YAML |
| `infra/deploy.ps1` | Same |
| `infra/README.md` | Remove Azure Files documentation |
| `Dockerfile` | Remove `RUN mkdir -p /app/data` |
| `docker-compose.yml` | Remove `./data:/app/data` volume |
| `server/db/connection.js` | Remove stale WAL/SHM cleanup, simplify comments |
| `server/app.js` | Remove SMB lock release comments |

**Azure resources to delete:** `gwn-storage-staging` and `gwn-storage-production` file shares, container app env storage links, and the storage account (if only used for these shares).

### CS11b — Database Abstraction Layer

#### Architecture: Repository Pattern with Adapter Interface

```
server/db/
  index.js              — createDb(config) factory → returns adapter
  base-adapter.js       — shared interface + parameter translation
  sqlite-adapter.js     — SQLite implementation (sync → promisified)
  mssql-adapter.js      — Azure SQL implementation (native async)
  migrations/
    _tracker.js         — migration version table + runner
    001-initial.js      — full schema creation
    002-add-role.js     — users.role column
    003-add-max-players.js — matches.max_players, host_user_id
  seed.js               — achievements, puzzles, system user
```

#### Adapter Interface (what routes use)

```javascript
const db = await createDb(config);

await db.get(sql, params)          // single row or null
await db.all(sql, params)          // array of rows
await db.run(sql, params)          // { changes, lastId }
await db.exec(rawSql)              // DDL (migrations)
await db.transaction(async (tx) => { ... })
await db.migrate()                 // run pending migrations
await db.isHealthy()               // SELECT 1
await db.close()
```

Routes never import `better-sqlite3` or `mssql` directly. They only use this interface.

#### Parameter Translation (automatic)

Routes write `?` placeholders everywhere. The adapter translates:
- **SQLite**: passes through as-is
- **Azure SQL**: rewrites `?` → `@p1, @p2, ...` and binds accordingly

#### Versioned Migration System

Replaces the current try/catch ALTER TABLE approach:
- `_migrations` table tracks applied migrations: `(version, name, applied_at)`
- Each migration file exports `async up(db)` and `async down(db)`
- `up()` checks `db.dialect` for SQLite vs T-SQL differences
- Migrations run on startup via `db.migrate()`; each wrapped in a transaction
- New schema changes = new migration file → PR → deploy → auto-applied

```javascript
// migrations/001-initial.js
module.exports = {
  async up(db) {
    if (db.dialect === 'sqlite') {
      await db.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, ...)');
    } else {
      await db.exec("IF OBJECT_ID('users') IS NULL CREATE TABLE users (id INT IDENTITY(1,1) PRIMARY KEY, ...)");
    }
  }
};
```

#### SQL Dialect Differences (only in DDL / migrations)

| Feature | SQLite | Azure SQL |
|---------|--------|-----------|
| Auto-increment | `INTEGER PRIMARY KEY AUTOINCREMENT` | `INT IDENTITY(1,1) PRIMARY KEY` |
| Create if not exists | `CREATE TABLE IF NOT EXISTS` | `IF OBJECT_ID(...) IS NULL` |
| Upsert | `INSERT OR REPLACE` | `MERGE` or `IF NOT EXISTS INSERT` |
| Timestamps | `CURRENT_TIMESTAMP` | `GETDATE()` |
| Text types | `TEXT` | `NVARCHAR(255)` / `NVARCHAR(MAX)` |

Queries in routes (SELECT, INSERT, UPDATE) use standard SQL — work in both without changes.

#### Config-Driven Backend Selection

```javascript
DB_BACKEND: process.env.DATABASE_URL ? 'mssql' : 'sqlite',
DATABASE_URL: process.env.DATABASE_URL || null,
GWN_DB_PATH: process.env.GWN_DB_PATH || 'data/game.db',
```

- `DATABASE_URL` present → Azure SQL (production)
- `DATABASE_URL` absent → SQLite (local dev, staging, tests)

### CS11c — Azure SQL Provisioning + Production Deploy

| Step | Description |
|------|-------------|
| Provision | Azure SQL logical server + free-tier serverless DB (gwn-production). Firewall rules for Container Apps. Connection string as GitHub secret. |
| Deploy workflow | `prod-deploy.yml`: add `DATABASE_URL` env var, remove volume mounts, add `GWN_DB_PATH=/tmp/game.db` fallback. |
| First deploy | Trigger with staging-validated image tag. Verify health + DB connectivity. |

**Azure SQL Free Tier Specs:**
- 100,000 vCore-seconds/month (~28h compute)
- 32 GB storage
- Serverless auto-pause when idle → $0 cost
- 1 free DB per subscription → use for production; staging stays ephemeral SQLite

### CS11 Task Summary

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS11-60 | Azure Files cleanup | ✅ Done | CS10-59 | Remove dead SMB references from all files. PR #49 merged. |
| CS11-60v | Validate staging (post-cleanup) | ✅ Done | CS11-60 | Staging deploy + smoke tests all passed. DB self-init, user reg, score submit, puzzles all working. Run #23809714266. |
| CS11-61a | Adapter interface + factory | ✅ Done | CS11-60v | `base-adapter.js`, `index.js` factory, config changes. PR #52 merged. |
| CS11-61b | SQLite adapter + migrations | ✅ Done | CS11-61a | `sqlite-adapter.js`, migration system (`_tracker.js`, `001–004`), `seed.js`. PR #55 merged. |
| CS11-61c | mssql adapter | ✅ Done | CS11-61a | `mssql-adapter.js`. PR #56 merged. Not used until CS11-64. |
| CS11-62 | Convert routes to async | ✅ Done | CS11-61a | All DB-touching handlers use `await db.get/all/run()`. PR #57 merged. |
| CS11-63 | Update tests for async | ✅ Done | CS11-61b, CS11-62 | Async test helpers. Test suite passes with SQLite adapter. PR #57 merged (combined with CS11-62). |
| CS11-63v | Validate staging (post-async) | ✅ Done | CS11-63 | Staging deploy + smoke tests + E2E all passed. 4 migrations applied, 504 puzzles seeded, async routes working. Run #23833160313. |
| CS11-64 | Provision Azure SQL | ⬜ Pending | CS11-63v | Rollup for 64a–64e: create prod Azure SQL, open access, define MSSQL init path, store GitHub secret. |
| CS11-64a | Create Azure SQL server | ⬜ Pending | CS11-63v | Create the production logical server in the chosen region/tier; capture admin + server details. |
| CS11-64b | Create serverless prod DB | ⬜ Pending | CS11-64a | Create the production DB on that server and capture the final DB name/connection parameters. |
| CS11-64c | Configure firewall access | ⬜ Pending | CS11-64a | Allow Azure-hosted app access plus operator IP(s) for setup/testing. Parallel with CS11-64b once server exists. |
| CS11-64d | Plan MSSQL schema bootstrap | ⬜ Pending | CS11-64b | Required before cutover: app startup still fails fast for MSSQL auto-init, so use manual migrations/seeding or enable an equivalent init path first. |
| CS11-64e | Add GitHub `DATABASE_URL` secret | ⬜ Pending | CS11-64b | Store the production connection string after the server + DB names are final. Parallel with CS11-64d. |
| CS11-65 | Production deploy | ⬜ Pending | CS11-64 | Rollup for 65a–65c: wire workflow/env, deploy, then verify production. |
| CS11-65a | Update `prod-deploy.yml` for MSSQL | ⬜ Pending | CS11-64 | Pass `DATABASE_URL` so production selects MSSQL; the workflow still uses `GWN_DB_PATH=/tmp/game.db` today. |
| CS11-65b | First production deploy | ⬜ Pending | CS11-65a | Run the first deploy with Azure SQL settings and the chosen MSSQL bootstrap process. |
| CS11-65c | Verify production | ⬜ Pending | CS11-65b | Smoke test startup, read paths, auth, submit flow, and DB-backed writes against Azure SQL. |

**Parallelism:** After CS11-64a, CS11-64b and CS11-64c can move in parallel. After CS11-64b, CS11-64d and CS11-64e can run in parallel. Task CS11-65 stays sequential: 65a → 65b → 65c.

**Suggested order:** CS11-63v → CS11-64a → (CS11-64b + CS11-64c) → (CS11-64d + CS11-64e) → CS11-64 → CS11-65a → CS11-65b → CS11-65c → CS11-65

**CS11a/CS11b parallelism history:** After CS11-61a merges, three parallel tracks start:
```
Main: CS11-61a → merge → signal workers → orchestrate merges → CS11-63v → CS11-64 → CS11-65
  wt-1: CS11-61b (SQLite adapter + migrations)
  wt-2: CS11-61c (mssql adapter)
  wt-3: CS11-62 (route conversion) → pull CS11-61b when merged → CS11-63 (test updates)
```

---

## Clickstop CS14 — Community Puzzle Submission UX

Improve the community puzzle submission experience for both submitters and admins. The backend API and basic UI exist but the feature feels hidden and incomplete — submit button only visible when logged in with no discovery path, no submission history, no public browsing, and minimal authoring tools.

**Planned release control (PR #91):** `submitPuzzle` is gated by a small central feature-flag system on the PR #91 branch so the feature can stay hidden by default while rollout and UX work continue. Evaluation order there is: feature-specific request override (only when that feature allows it in the current environment) → default state → explicit user targeting → deterministic percentage rollout → disabled.

**Planned `submitPuzzle` configuration (PR #91):** hidden/disabled by default; can be enabled for explicit users and/or a rollout percentage; request overrides are allowed only outside `production` and `staging`; override names are query param `ff_submit_puzzle` and header `x-gwn-feature-submit-puzzle`. Overrides are opt-in per feature, not a global bypass. `main` does not have that central flag path until PR #91 merges.

> **Note:** Puzzle authoring format reference is in the [CS9 archive](project/clickstops/done_cs9_content-growth.md).

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS14-80 | Submission discovery & onboarding | ⬜ Pending | — | Add visible "Community" or "Create" entry point on home screen for all users (logged-out users see CTA to log in). Add brief explainer of how submissions work (submit → review → goes live). |
| CS14-81 | My Submissions dashboard | ⬜ Pending | CS14-80 | New screen showing user's own submissions with status (pending/approved/rejected), reviewer notes, and timestamps. Uses existing `GET /api/submissions` endpoint. |
| CS14-82 | Enhanced puzzle authoring form | ⬜ Pending | CS14-80 | Puzzle type selector (emoji/text/image). Custom options editor (4 options, must include answer). Live preview of how the puzzle will look to players. Validation feedback before submit. |
| CS14-83 | Public community gallery | ⬜ Pending | CS14-81 | Browse approved community puzzles with attribution (submitted by username). Filter by category/difficulty. New API endpoint `GET /api/puzzles/community`. |
| CS14-84 | Admin moderation improvements | ⬜ Pending | CS14-82 | Live puzzle preview in moderation screen. Bulk approve/reject. Edit puzzle before approval (fix typos, adjust options). Submission stats (total pending, approved, rejected). |
| CS14-85 | Submission editing & deletion | ⬜ Pending | CS14-81 | Users can edit pending submissions and delete their own submissions. API endpoints `PUT /api/submissions/:id` and `DELETE /api/submissions/:id` with ownership checks. |
| CS14-86 | Submission notifications | ⬜ Pending | CS14-84 | Notify submitters when their puzzle is approved/rejected (in-app notification or badge on submissions screen). Track unread review results. |
| CS14-87 | Image puzzle submissions | ⬜ Pending | CS14-82 | Image upload support for image-type puzzles. Server-side validation (size, format). Storage (local in dev, Azure Blob in prod). Preview in authoring form and moderation. |

**Parallelism:** Tasks CS14-81 and CS14-82 can run in parallel after CS14-80. Tasks CS14-83, CS14-84, CS14-85 can run in parallel after their dependencies. Task CS14-87 is independent of CS14-83–86 but requires CS14-82.

---

## Clickstop CS15 — Dev Tooling & Log Assertions

Consolidate dev server scripts, integrate log capture into e2e tests, and add CI log assertion tests.

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS15-90 | Unified dev server script | ✅ Done | — | `scripts/dev-server.js`: HTTPS + log capture by default. Replaces standalone `log-wrapper.js`. npm scripts: `dev:full`, `dev:log`. |
| CS15-91 | E2e log capture integration | ⬜ Pending | CS15-90 | Playwright webServer uses dev-server.js to capture logs during test runs. Log file path configurable via env. |
| CS15-92 | Log assertion tests | ⬜ Pending | CS15-91 | Post-test assertion: no ERROR-level entries during clean e2e run. Catches silent failures and unexpected error paths. |
| CS15-93 | CI log artifact upload | ⬜ Pending | CS15-92 | On e2e failure in CI, upload captured log file as GitHub Actions artifact for debugging. |
| CS15-94 | Production log format validation | ⬜ Pending | CS15-91 | Assert JSON structure in NODE_ENV=production mode: required fields (level, time, msg, req.id), no pretty-print leaking. |

**Parallelism:** CS15-91 first, then CS15-92+CS15-93+CS15-94 can run in parallel.

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
