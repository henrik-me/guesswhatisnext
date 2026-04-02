# Project Context — Guess What's Next

This file tracks the current state of the project: what's been done, what's next, and any active decisions or blockers.

> **Last updated:** 2026-04-01

---

## Project Status: ✅ Phases 1–5, 12–13, 15 (partial) Complete, Phase 6/8/10 Done — Phase 11 Active (Azure SQL Migration)

### Development Workflow

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
Every Copilot review comment thread must be replied to with a meaningful message (fix commit reference, acknowledgment, or explanation) and then resolved via the GraphQL API. See INSTRUCTIONS.md §10 for API commands and reply conventions. Threads are never left unresolved — even "by design" decisions get an explicit reply before resolution.

---

## Phase 1 — Client-Side Game

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 1 | Project setup | ✅ Done | — | File structure, index.html, link CSS/JS |
| 2 | Puzzle data | ✅ Done | 1 | 20 puzzles across 5 categories |
| 3 | UI screens & CSS | ✅ Done | 1 | Accessibility, aria, visual polish |
| 4 | Game engine | ✅ Done | 2, 3 | Full game loop, scoring, timer, answer handling |
| 5 | Timer & scoring | ✅ Done | 4 | Score breakdown, speed bonus, streak multiplier |
| 6 | Free-play mode | ✅ Done | 4 | Category select, random order, 10 rounds |
| 7 | Daily challenge | ✅ Done | 4 | Date-seeded, one attempt, Wordle-style share |
| 8 | LocalStorage | ✅ Done | 6, 7 | High scores, daily state, stats persisted |
| 9 | Polish | ✅ Done | 8 | Animations, keyboard, mobile, reduced-motion |
| 10 | Image puzzles | ✅ Done | 4 | 12 SVGs, 2 image-type puzzles |

**Parallelism:** 2 & 3 parallel → 4 → 5, 6, 7, 10 parallel → 8 → 9

## Phase 2 — Backend & Multiplayer

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 11 | Backend setup | ✅ Done | 10 | Express + SQLite + WS, files moved to public/ |
| 12 | Database schema | ✅ Done | 11 | users, scores, matches tables with indexes |
| 13 | Auth system | ✅ Done | 12 | Register/login, JWT, bcrypt, middleware |
| 14 | Score API | ✅ Done | 13 | Submit scores, leaderboard (all/weekly/daily) |
| 15 | Leaderboard UI | ✅ Done | 14 | Rankings display integrated into leaderboard screen |
| 16 | Matchmaking | ✅ Done | 13 | Room codes, create/join endpoints |
| 17 | WebSocket server | ✅ Done | 11 | Room-based WS connections on /ws |
| 18 | Head-to-head engine | ✅ Done | 16, 17 | Server match logic, scoring, puzzle sync |
| 19 | Multiplayer UI | ✅ Done | 18 | Auth, lobby, live match, result screens |
| 20 | Multiplayer polish | ✅ Done | 15, 19 | Reconnect, rematch, match history, forfeit |

**Parallelism:** 14 & 16 parallel; 16 & 17 parallel → 18; 15 & 19 → 20

## Phase 3 — Security & Game Features

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 21 | Auth hardening | ✅ Done | — | System account, API key auth, rate limiting, all endpoints auth'd |
| 22 | Enhanced health endpoint | ✅ Done | 21 | Deep checks (DB, WS, disk, uptime), version, environment |
| 23 | Local container dev | ✅ Done | — | Dockerfile, docker-compose.yml, .dockerignore, local dev in container |
| 27 | Puzzles to DB | ✅ Done | 21 | Puzzles table, auto-seed 22 puzzles, API with filters, client fetch with fallback |
| 28 | Puzzle expansion | ✅ Done | 27 | 287 puzzles across 16 categories (was 22 across 5) |
| 29 | Achievements | ✅ Done | 21 | 12 achievements, unlock logic, API, frontend grid, toast notifications |
| 30 | Player profiles | ✅ Done | 29 | Unified profile screen with stats, achievements, match history |
| 31 | Settings & audio | ✅ Done | — | Web Audio API sounds, light/dark theme, timer duration, settings screen |
| 32 | Game enhancements | ✅ Done | 27 | Difficulty selector, skip button, confetti celebration |

**Parallelism:** All Phase 3 work complete.

## Phase 4 — Infrastructure & Deployment

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 24 | Azure infrastructure | ✅ Done | 23 | CI/CD pipeline, GHCR, staging + prod Container Apps |
| 25 | CI/CD pipeline | ✅ Done | 24 | ESLint, CODEOWNERS, PR template, path filters |
| 26 | Health monitor | ✅ Done | 22, 25 | Retry logic, deep checks, local health-check scripts |

**Parallelism:** All Phase 4 work complete.

## Phase 5 — Multi-Player Expansion (2→10 Players)

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 33 | Room & lobby protocol | ✅ Done | — | maxPlayers (2-10), host start-match, lobby-state, host transfer |
| 34 | N-player game logic | ✅ Done | 33 | Rankings, disconnect handling, last-player-standing, ties |
| 35 | Lobby UI for N players | ✅ Done | 33 | Host controls (max players, rounds), player roster, start button |
| 36 | N-player match UI | ✅ Done | 34, 35 | Dynamic scoreboard, medals, N-player round results |
| 37 | Reconnection & edge cases | ✅ Done | 34, 36 | Reconnect state restore, host transfer, toast notifications |
| 38 | N-player rematch | ✅ Done | 37 | N-player rematch with host control, ready-up flow, 4 tests |
| 39 | Testing & polish | ✅ Done | 38 | Integration tests, CSS cleanup, doc updates |

**Parallelism:** All Phase 5 work complete.

## Phase 6 — Production Hardening

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 40 | Remove debug logging | ✅ Done | — | Stripped debug console.log from client code (PR #14) |
| 41 | Environment variables | ✅ Done | — | server/config.js centralizes env vars with startup validation (PR #14) |
| 42 | HTTPS & secure headers | ✅ Done | 41 | Helmet headers, HTTPS redirect, HSTS, CSP with wss:, dev-https.js. JWT auth (no cookies). |

## Phase 7 — Quality & Testing

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 43 | Browser E2E tests | ✅ Done | 40 | Playwright tests for full UI flows |
| 44 | Load testing | ✅ Done | 41 | Artillery for concurrent WS + API stress |

## Phase 8 — User Experience

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 45 | Mobile PWA | ✅ Done | — | manifest.json, service worker, offline fallback (PR #15) |
| 46 | Share links | ✅ Done | — | Deep link ?room=CODE, copy-link button (PR #15) |
| 47 | Multiplayer sound effects | ✅ Done | — | Opponent answered, countdown, win/loss fanfare (PR #15) |
| 48 | Spectator mode | ✅ Done | 42 | Read-only WS, spectator count in lobby, spectator badge, dedicated tests |

## Phase 9 — Content & Growth

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 49 | Puzzle expansion (200+) | ✅ Done | — | AI-assisted generation, broader categories. 504 puzzles in DB. |
| 50 | Community puzzle submissions | ✅ Done | 49 | Submit form, moderation queue, attribution |

**Parallelism:** Phase 6 sequential (42 now done). Phase 7 done. Phase 8 all done. Phase 9 done. In Phase 10, the only remaining item is task 56.

## Phase 10 — CI/CD Pipeline Rework

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 51 | Simplify Dockerfile | ✅ Done | — | Single-stage node:22-slim; better-sqlite3 has prebuilds, no build tools needed |
| 52 | Slim down PR CI checks | ✅ Done | 51 | New ci.yml with parallel lint + test only; no Docker build in PR checks |
| 53 | Remove push-to-main deploy pipeline | ✅ Done | 52 | ci-cd.yml gutted to disabled placeholder; push to main no longer triggers any deployment |
| 54 | Staging deploy on merge | ✅ Done | 53 | New staging-deploy.yml: triggers on push to main, builds Docker image, pushes to GHCR, runs ephemeral smoke tests, fast-forwards release/staging, then (with manual approval) deploys to Azure staging |
| 55 | Manual production deploy workflow | ✅ Done | 54 | prod-deploy.yml: manual workflow_dispatch with image tag + confirmation, validates image exists in GHCR, deploys to production environment (with approval gate), runs health verification, auto-rollback on failure (PR #21) |
| 56 | Unified infra setup script | ⬜ Pending | 55 | Merge deploy.sh + setup-github.sh into one script: auto-generates secrets, creates Azure service principal, sets all GitHub secrets/variables, runs verification health check |

### Phase 10b — SQLite on Azure Files SMB Fix (COMPLETE)

During staging deployment testing, we discovered that **SQLite on Azure Files (SMB) is fundamentally broken** — the SMB mount does not support POSIX file locking (`fcntl`). Every lock attempt returns `SQLITE_BUSY` regardless of contention, even with a single process writing to a fresh empty file. This was confirmed via manual testing inside the container.

**Approaches tried and failed:**
- PRs #37-40: revision mode, deactivation ordering, az exec init-db, direct curl
- PR #41: EXCLUSIVE locking mode — still fails because SMB byte-range locks are unreliable
- URI filenames with `unix-none` VFS — better-sqlite3 doesn't support URI filenames
- WAL artifact cleanup, close/reopen avoidance — none helped

**Solution (PR #46): Use local filesystem for SQLite DB**
- Set `GWN_DB_PATH=/tmp/game.db` in the container env
- SQLite operates on the container's local filesystem where locking works
- Azure Files mount at `/app/data` retained but unused (pending cleanup)
- Trade-off: DB is ephemeral (lost on container restart) — acceptable for staging

**Other fixes applied during staging deployment debugging:**
- `az containerapp start` doesn't exist → use REST API (`az rest --method POST .../start`)
- Azure reports `RunningAtMaxScale` not `Running` → grep `^Running` to match both
- Concurrency group kills manual dispatch → `cancel-in-progress: ${{ github.event_name != 'workflow_dispatch' }}`
- `STAGING_AUTO_DEPLOY` repo variable gates auto-deploy (set to `false`, opt-in with `true`)

**Staging status:** ✅ Deployed and working (2026-04-01). CANONICAL_HOST fix (PR #72) resolved deploy failures caused by missing env var after HTTPS enablement (PR #59).

| # | Task | Status | Notes |
|---|---|---|---|
| 57 | EXCLUSIVE locking + self-init DB | ✅ Done | PR #41 merged. Self-init retry loop, WS readiness gate, draining guards. |
| 58 | Simplified deploy workflow | ✅ Done | PR #46 merged. Local filesystem fix. Deploy verification via revision state + az logs grep. |
| 59 | Validate staging | ✅ Done | Staging deployed successfully. Self-init creates DB on local filesystem. |

**Parallelism:** Phase 10b complete. Phase 11 (Azure SQL) is next.

## Phase 11 — Database Abstraction + Azure SQL Migration

### Goal
Replace the tightly-coupled SQLite layer with a clean database abstraction that supports both SQLite (local dev, staging, tests) and Azure SQL (production). Eliminates SMB issues permanently, enables persistent production data, and supports proper schema migrations.

### Phase 11a — Azure Files Cleanup (Quick Win)

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

### Phase 11b — Database Abstraction Layer

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

### Phase 11c — Azure SQL Provisioning + Production Deploy

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

### Phase 11 Task Summary

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 60 | Azure Files cleanup | ✅ Done | 59 | Remove dead SMB references from all files. PR #49 merged. |
| 60v | Validate staging (post-cleanup) | ✅ Done | 60 | Staging deploy + smoke tests all passed. DB self-init, user reg, score submit, puzzles all working. Run #23809714266. |
| 61a | Adapter interface + factory | ✅ Done | 60v | `base-adapter.js`, `index.js` factory, config changes. PR #52 merged. |
| 61b | SQLite adapter + migrations | ✅ Done | 61a | `sqlite-adapter.js`, migration system (`_tracker.js`, `001–004`), `seed.js`. PR #55 merged. |
| 61c | mssql adapter | ✅ Done | 61a | `mssql-adapter.js`. PR #56 merged. Not used until Task 64. |
| 62 | Convert routes to async | ✅ Done | 61a | All DB-touching handlers use `await db.get/all/run()`. PR #57 merged. |
| 63 | Update tests for async | ✅ Done | 61b, 62 | Async test helpers. All 173 tests pass with SQLite adapter. PR #57 merged (combined with 62). |
| 63v | Validate staging (post-async) | ✅ Done | 63 | Staging deploy + smoke tests + E2E all passed. 4 migrations applied, 504 puzzles seeded, async routes working. Run #23833160313. |
| 64 | Provision Azure SQL | ⬜ Pending | 63v | Free-tier serverless DB. Firewall. GitHub secret. |
| 65 | Production deploy | ⬜ Pending | 64 | Update prod-deploy.yml. First deploy + verify. |

**Parallelism:** After 61a merges, three parallel tracks start:
```
Main: 61a → merge → signal workers → orchestrate merges → 63v → 64 → 65
  wt-1: 61b (SQLite adapter + migrations)
  wt-2: 61c (mssql adapter)
  wt-3: 62 (route conversion) → pull 61b when merged → 63 (test updates)
```

## Phase 12 — Test Infrastructure Integration

Integrate E2E and load tests into CI/CD pipelines so they run automatically, not just locally.

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 65 | E2E tests in PR CI | ✅ Done | 43 | Playwright job in ci.yml with Chromium, runs in parallel with lint+test |
| 66 | E2E tests in staging validation | ✅ Done | 65 | Playwright runs in staging-deploy.yml after smoke tests |
| 67 | Load test integration | ✅ Done | 44 | load-test.yml: workflow_dispatch + weekly schedule, Artillery API + WS tests, HTML report artifact |

**Parallelism:** All Phase 12 work complete.

## Phase 13 — Production-Grade Observability & Logging

Add structured logging, request tracing, client-side error reporting, and Azure Monitor integration via OpenTelemetry. Environment-appropriate log levels: debug+pretty in dev, info+JSON+OTel in staging/prod.

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 70 | Logger foundation + request logging | ✅ Complete | — | Install Pino + pino-http + pino-pretty (dev). Create `server/logger.js` singleton, add `LOG_LEVEL` to config.js, add pino-http middleware before routes. JSON in staging/prod, pretty-print in dev. |
| 71 | Centralized error handler + replace console.* | ✅ Complete | 70 | Add Express error-handling middleware at end of chain. Replace all 22 `console.*` calls with structured `logger.*` at appropriate levels. |
| 72 | Auth & user activity logging | ✅ Complete | 70 | Log login/logout/registration at info, rate limits and auth failures at warn. Log WS connection/disconnection events. Add userId context to log entries. |
| 73 | Client-side error reporting | ✅ Complete | 70 | Create `POST /api/telemetry/errors` endpoint (rate-limited, no auth). Add `window.onerror` and `unhandledrejection` handlers in client JS. Batch/debounce (max 10/min per client). |
| 74 | OpenTelemetry SDK + Azure Monitor | ✅ Complete | 73 | Install `@opentelemetry/sdk-node` + `@azure/monitor-opentelemetry-exporter`. Create `server/telemetry.js` bootstrap. Auto-instrument HTTP/Express/DB. Provision App Insights (staging + prod). |
| 75 | Environment-specific log configuration | ✅ Complete | 74 | Dev: debug + pretty-print + no OTel. Staging: info + JSON + OTel → Azure Monitor. Prod: info + JSON + OTel + sensitive data redaction + trace ID correlation. |
| 76 | Logging tests + documentation | ✅ Complete | 75 | Unit tests for logger config, client error endpoint, error middleware. Update INSTRUCTIONS.md with logging conventions (when to use each level, structured context, correlation). |

**Parallelism:** All Phase 13 work complete.

**Log Levels:** trace (ultra-verbose) → debug (dev diagnostics) → info (normal operations) → warn (handled anomalies) → error (failures) → fatal (process crash).

## Phase 14 — Community Puzzle Submission UX

Improve the community puzzle submission experience for both submitters and admins. The backend API and basic UI exist but the feature feels hidden and incomplete — submit button only visible when logged in with no discovery path, no submission history, no public browsing, and minimal authoring tools.

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 80 | Submission discovery & onboarding | ⬜ Pending | — | Add visible "Community" or "Create" entry point on home screen for all users (logged-out users see CTA to log in). Add brief explainer of how submissions work (submit → review → goes live). |
| 81 | My Submissions dashboard | ⬜ Pending | 80 | New screen showing user's own submissions with status (pending/approved/rejected), reviewer notes, and timestamps. Uses existing `GET /api/submissions` endpoint. |
| 82 | Enhanced puzzle authoring form | ⬜ Pending | 80 | Puzzle type selector (emoji/text/image). Custom options editor (4 options, must include answer). Live preview of how the puzzle will look to players. Validation feedback before submit. |
| 83 | Public community gallery | ⬜ Pending | 81 | Browse approved community puzzles with attribution (submitted by username). Filter by category/difficulty. New API endpoint `GET /api/puzzles/community`. |
| 84 | Admin moderation improvements | ⬜ Pending | 82 | Live puzzle preview in moderation screen. Bulk approve/reject. Edit puzzle before approval (fix typos, adjust options). Submission stats (total pending, approved, rejected). |
| 85 | Submission editing & deletion | ⬜ Pending | 81 | Users can edit pending submissions and delete their own submissions. API endpoints `PUT /api/submissions/:id` and `DELETE /api/submissions/:id` with ownership checks. |
| 86 | Submission notifications | ⬜ Pending | 84 | Notify submitters when their puzzle is approved/rejected (in-app notification or badge on submissions screen). Track unread review results. |
| 87 | Image puzzle submissions | ⬜ Pending | 82 | Image upload support for image-type puzzles. Server-side validation (size, format). Storage (local in dev, Azure Blob in prod). Preview in authoring form and moderation. |

**Parallelism:** Tasks 81 and 82 can run in parallel after 80. Tasks 83, 84, 85 can run in parallel after their dependencies. Task 87 is independent of 83–86 but requires 82.

## Phase 15 — Dev Tooling & Log Assertions

Consolidate dev server scripts, integrate log capture into e2e tests, and add CI log assertion tests.

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 90 | Unified dev server script | ✅ Done | — | `scripts/dev-server.js`: HTTPS + log capture by default. Replaces standalone `log-wrapper.js`. npm scripts: `dev:full`, `dev:log`. |
| 91 | E2e log capture integration | ⬜ Pending | 90 | Playwright webServer uses dev-server.js to capture logs during test runs. Log file path configurable via env. |
| 92 | Log assertion tests | ⬜ Pending | 91 | Post-test assertion: no ERROR-level entries during clean e2e run. Catches silent failures and unexpected error paths. |
| 93 | CI log artifact upload | ⬜ Pending | 92 | On e2e failure in CI, upload captured log file as GitHub Actions artifact for debugging. |
| 94 | Production log format validation | ⬜ Pending | 91 | Assert JSON structure in NODE_ENV=production mode: required fields (level, time, msg, req.id), no pretty-print leaking. |

**Parallelism:** 91 first, then 92+93+94 can run in parallel.

### Deployment Architecture

```
  Developer pushes to main
         │
         ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  PR checks (ci.yml)                                         │
  │  [Lint] + [Test]  (parallel)                                │
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
  └──────────────────────────────────────────┬──────────────────────────┘
                                             │
                                             ▼
                                  ┌───────────────────────┐
                                  │  PRODUCTION           │
                                  │  gwn-production       │
                                  │  Container Apps       │
                                  │  Auto-rollback on fail│
                                  └───────────────────────┘
                                             ▲
  GitHub Actions Health Monitor (every 5 min)┘
         │ on failure → GitHub Issue
```

### Key Design Decisions (Phase 3 — Security & Game Features)

| Decision | Choice | Rationale |
|---|---|---|
| System auth | API key (X-API-Key header) | Simple, no JWT expiry concerns for automated clients |

### Key Design Decisions (Phase 4 — Infrastructure & Deployment)

| Decision | Choice | Rationale |
|---|---|---|
| Staging host | Container Apps (Consumption) | Environment parity with prod, scale-to-zero, full WebSocket support |
| Production host | Container Apps (Consumption) | Pay-per-use, scale-to-zero, WebSocket support |
| Container registry | GitHub Container Registry | Free for private repos, integrated with GH Actions |
| Staging→Prod gate | GH Environment manual approval | Prevents untested code reaching production |
| Health monitoring | GitHub Actions cron | No extra infra, creates issues in same repo |

### Key Design Decisions (Phase 5 — Multi-Player Expansion)

| Decision | Choice | Rationale |
|---|---|---|
| Max players per room | 2–10 (host configurable) | Flexible; 2 preserves current behavior, 10 caps complexity |
| Room host model | Creator is host, controls start | Clean UX; host decides when enough players have joined |
| Host disconnect (lobby) | Auto-transfer to next player | Prevents room death from host leaving |
| Player disconnect (active) | 30s reconnect → drop (score frozen) | Match continues for remaining players (≥2) |
| Winner logic | Full ranking with tie handling | Placements (1st/2nd/3rd…) instead of binary win/lose |
| Spectator mode | Deferred | Not needed for initial N-player support; add later |
| Rematch flow | Host "New Match" → auto-join lobby | Simpler than N-player ready-up counting |

### Key Design Decisions (Phase 10 — CI/CD Pipeline Rework)

| Decision | Choice | Rationale |
|---|---|---|
| Docker base image | node:22-slim (single-stage) | better-sqlite3 ships prebuilt binaries; no python3/make/g++ needed. Simpler Dockerfile at cost of ~200MB vs ~100MB image |
| PR CI checks | Lint + test + E2E (no Docker build) | Docker build is slow, hits Docker Hub rate limits, and isn't needed for PR validation. E2E (Playwright) added in Phase 12. |
| Push to main | No auto-deployment (disabled) | Auto-deploy temporarily disabled in PR #41 to avoid unintended deploys. Manual workflow_dispatch only for now. |
| Staging branch strategy | Fast-forward release/staging to main HEAD | Simpler than cherry-picking; no history divergence; staging always matches main |
| Staging trigger | Manual workflow_dispatch only | Auto-deploy gated by STAGING_AUTO_DEPLOY repo variable (default false). Manual dispatch is the standard workflow; auto-deploy available when needed. |
| Ephemeral staging | Docker container in GitHub Actions | $0 infra cost; sufficient for automated smoke tests (health, auth, scores) |
| Azure staging | Behind manual approval after ephemeral passes | Persistent environment for manual QA; only promoted after automated validation |
| Production deploy | Manual workflow_dispatch from release/staging | Production only deploys code that has been validated in staging; never directly from main |
| Production gate | Requires staging environment green | Cannot trigger prod deploy unless the latest staging deployment succeeded |

### Key Design Decisions (Phase 15 — Dev Tooling)

| Decision | Choice | Rationale |
|---|---|---|
| Dev server default | HTTPS + log capture | Production-like by default ensures security headers and logging are always validated during manual testing |
| Log capture method | Child process with piped stdio | pino-pretty's ThreadStream bypasses shell pipelines; spawning as child with pipe is the only reliable capture method |
| Script architecture | Wrapper spawns dev-https.js or server/index.js | Keeps HTTPS logic separate (monkey-patches http.createServer), log capture is orthogonal |
| Watch mode | Only for --no-https | dev-https.js monkey-patches http.createServer once; --watch restart would re-patch incorrectly |

---

## Key Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Frontend stack | Vanilla HTML/CSS/JS | No build tools, fast iteration, lightweight |
| Backend stack | Node.js + Express | Same language as frontend, easy WebSocket support |
| Database | SQLite → Azure SQL | Start simple (SQLite for dev/staging), Azure SQL free tier for production. Adapter pattern supports both. |
| Multiplayer | Both async + real-time | Leaderboards for casual, head-to-head for competitive |
| Multi-player rooms | 2–10 players, host-controlled | Host creates room, configures settings, starts when ready |
| Multi-player disconnect | Drop after 30s, match continues | Avoids ending match for all when one player leaves |
| Multi-player rankings | Full placement with ties | More meaningful than binary win/lose for N players |
| Puzzle format | Emoji/text + images | Start with emoji, layer in images |
| Timing | Timed rounds, speed bonus | Adds excitement and skill differentiation |
| Staging infra | Container Apps (not F1) | Environment parity with prod, same Dockerfile + deploy method |
| Production infra | Container Apps (Consumption) | Pay-per-use, scale-to-zero, WebSocket support |
| Container registry | GitHub Container Registry | Free for private repos, integrated with GH Actions |
| CI/CD promotion | Build once, promote image | Same image bytes in staging and prod — no rebuild, no drift |
| Staging→Prod gate | GH Environment manual approval | Prevents untested code reaching production |
| SQLite on Azure Files | **Broken — use local filesystem** | Azure Files (SMB) does not support POSIX file locking (fcntl). Every lock attempt returns SQLITE_BUSY. EXCLUSIVE locking, unix-none VFS, and URI filenames all failed. Solution: `GWN_DB_PATH=/tmp/game.db` for local filesystem. |
| DB initialization | Self-init on startup | GitHub Actions can't reach Azure Container App URLs. az exec requires TTY. Self-init retry loop eliminates cross-network dependency. |
| Deploy verification | Revision state + az logs grep | Direct HTTP (curl) times out from GH Actions. az containerapp exec needs TTY. Use az CLI for all verification. |
| Database abstraction | Adapter pattern (SQLite + Azure SQL) | Routes use `await db.get/all/run()` with `?` params. Adapters handle dialect. Versioned migrations replace try/catch ALTER TABLE. |
| Production database | Azure SQL free tier | Persistent, reliable, no SMB issues. Auto-pause when idle → $0 cost. Staging stays on ephemeral SQLite. |
| AI orchestration | Copilot CLI (not Squad) | Squad evaluated but deferred — see below |

## Tools Evaluated

### Squad (bradygaster/squad) — Evaluated 2026-03-25, Deferred

[Squad](https://github.com/bradygaster/squad) is a multi-agent AI orchestration framework for GitHub Copilot. It defines a team of AI agent specialists (Lead, Frontend, Backend, Tester, etc.) that persist in the repo as `.squad/` files, accumulate knowledge across sessions, run in parallel, and route tasks automatically.

**Why not now:**
- **Alpha software** — APIs and CLI commands may change between releases
- **Overhead for project size** — Single developer, 12 well-defined remaining tasks with clear dependency chains. Squad is designed for larger teams/projects with many parallel workstreams
- **Existing documentation overlap** — INSTRUCTIONS.md, CONTEXT.md, and plan.md already serve the role of Squad's `decisions.md` + agent `history.md`
- **Limited parallelism benefit** — Most of our tasks have dependency chains; few are truly independent
- **Setup cost** — Defining agents, routing rules, and casting configuration takes time better spent implementing

**Where it could help (future):**
- Puzzle content expansion — a "Content Creator" agent that learns puzzle schema
- If the project goes open-source with multiple contributors
- Long-running maintenance phase with many parallel feature tracks

**Revisit criteria:**
- Squad reaches beta/stable release
- Project gains multiple active contributors
- We enter an open-ended feature development phase without clear dependency chains

## Active Design Notes

These should be kept in mind throughout Phase 1 development:

- [x] Game engine accepts puzzles as arguments (not hardcoded imports)
- [x] Score/result objects are plain JSON-serializable
- [x] Answer submission uses callbacks (not direct DOM writes)
- [x] Screen navigation supports adding new screens without refactoring
- [x] No global mutable state — single state object pattern

---

## Blockers / Open Questions

- **Azure Files storage cleanup**: ✅ Done (PR #49). Azure storage resources (`gwn-storage-staging`, `gwn-storage-production`) still exist in Azure and should be deleted manually.
- **Staging auto-deploy disabled**: Must manually trigger `workflow_dispatch` after merging to main. Re-enable once Phase 11 is stable.
- **Production not yet deployed**: Depends on Azure SQL migration (Phase 11b-c) since Azure Files SMB is broken for SQLite.
- **Azure SQL free tier limit**: 1 free DB per subscription. Production gets the free DB; staging uses ephemeral local SQLite.
- **Sync→async migration risk**: Converting all DB calls from sync (better-sqlite3) to async (mssql) touches every route file. Need thorough test coverage before and after.

## Additional Considerations for Phase 11

### Auto-Pause Latency — Graceful UI Strategy

Azure SQL serverless auto-pauses after ~1 hour of inactivity. Cold-start resume takes 10-30 seconds. **No keep-alive pings** — accept the latency and make it delightful.

#### Why This Is Manageable
- **Home screen + single-player game need zero DB calls.** Puzzles are bundled locally, high scores in localStorage. A returning user can immediately play without waiting.
- **Only DB-backed features are affected:** profile, leaderboard, achievements, multiplayer lobby, score submission.
- **The app already has loading states** for profile ("Loading profile..."), leaderboard ("Loading"), achievements ("Loading achievements..."), and lobby (spinner + "Waiting for opponent..."). These just need personality.

#### Pattern: Progressive Friendly Messages
Replace static "Loading..." text with a timed escalation sequence:

| Elapsed | Message style | Example (profile) |
|---|---|---|
| 0-2s | Normal loading | "Loading profile..." |
| 3-5s | Casual reassurance | "Still loading — gathering your stats..." |
| 6-10s | Warm + engaging | "This is taking a moment. How about counting to 5? 🎲" |
| 11-20s | Interactive / playful | "Almost there! While you wait — what's the next number: 2, 4, 8, ...?" |
| 20-30s | Honest + encouraging | "The database was napping 😴 — waking it up now. Should be just a moment!" |
| 30s+ | Graceful degradation | Show cached data if available, or "Taking longer than expected — [Retry]" |

Each page/feature gets its own message set appropriate to context:
- **Profile:** "Looking up your stats...", "Digging through your game history...", "Your profile data is warming up ☕"
- **Leaderboard:** "Fetching the rankings...", "Tallying up everyone's scores...", "The leaderboard keeper is on a coffee break ☕"
- **Achievements:** "Checking your trophy case...", "Polishing your badges... ✨"
- **Multiplayer lobby (creating):** "Setting up your game room...", "Arranging the puzzle table...", "Almost ready to play!"
- **Score submission:** Store results in localStorage immediately, push to server in background. If server is cold, queue and retry. User never waits for score persistence.

#### Pattern: Local-First for Score Submission
After a game ends (single-player or multiplayer):
1. Save score to `localStorage` immediately → user sees their result with zero latency
2. Queue a background `POST /api/scores` — if it fails (503, timeout), retry with exponential backoff
3. Show a subtle indicator ("Score saved ✓" → "Syncing to leaderboard..." → "Synced ✓")
4. If user navigates to leaderboard before sync completes, show local scores alongside server data

#### Pattern: Multiplayer — Deferred Persistence
During an active multiplayer match:
- **All game state lives in-memory** (the `rooms` Map) — no DB call blocks gameplay
- Score updates, round results, and game-over are broadcast via WebSocket from in-memory state
- DB persistence (match status, player scores, achievements) happens **after** broadcasting results
- If DB is cold/slow, the game proceeds normally — persistence catches up in the background
- On game-over, show results immediately from WS data, then "Saving to leaderboard..." indicator

#### Implementation: `ProgressiveLoader` Component
A reusable JS module that wraps any async fetch with timed message escalation:
```javascript
// Usage: progressiveLoad(fetchFn, containerEl, messageSet)
// messageSet = [{ after: 0, msg: '...' }, { after: 5000, msg: '...' }, ...]
// Returns the fetch result; messages auto-clear on completion
```
This keeps the pattern consistent across all pages without duplicating timer logic.

---

### WebSocket Handler — Architecture Analysis & Decisions

#### Current State (server/ws/matchHandler.js)
The WS handler is a 1000-line file with **4 pieces of in-memory state** (`rooms`, `disconnected`, `rematchRequests`, `finishedRooms`) and **~15 DB call sites**. The critical insight:

**In-memory state is already the source of truth for live games. DB is best-effort persistence.**

| DB Call | When | Classification | Can Fail Silently? |
|---|---|---|---|
| `selectRandomPuzzles()` | Match start | **Critical path** | ❌ No puzzles = no game |
| `SELECT match metadata` | Player joins | Read-only | ✅ Falls back to defaults |
| `UPDATE matches SET status='active'` | Match start | Fire-and-forget | ✅ Game proceeds in memory |
| `SELECT match id` + `INSERT match_round` | Round start | Fire-and-forget | ✅ Round plays without DB |
| `UPDATE matches SET status='finished'` | Match end | Fire-and-forget | ✅ Results already broadcast |
| `UPDATE match_players SET score=...` | Match end | Fire-and-forget | ✅ Scores already shown via WS |
| `checkAndUnlockAchievements()` | Match end | Fire-and-forget | ✅ Can retry later |
| `UPDATE matches SET host_user_id=...` | Disconnect/transfer | Fire-and-forget | ✅ In-memory host is authoritative |
| `INSERT matches` + `INSERT match_players` | Rematch | Fire-and-forget | ✅ Game starts in memory regardless |

**Only 1 out of ~15 DB calls is critical-path.** Everything else can be queued.

#### Risk Areas

**Risk 1: Puzzle Selection Is the Only Blocking DB Call**
`selectRandomPuzzles(count)` runs `SELECT ... FROM puzzles ORDER BY RANDOM() LIMIT ?`. If DB is cold, this blocks match start for 10-30s.

**Decision: Pre-warm puzzle cache on startup.**
- Load all puzzles into memory at boot (same as client-side already does)
- `selectRandomPuzzles()` draws from the in-memory cache, zero DB latency
- Refresh cache periodically (e.g., every hour) or on admin signal
- This eliminates the ONLY critical-path DB call from the WS handler

**Risk 2: No Transactions Around Multi-Step Writes**
`endMatch()` does 3 separate DB writes (update match, update each player's score). `handleRematchStartConfirm()` does INSERT match + INSERT players without a transaction. Partial writes are possible.

**Decision: Wrap multi-step writes in transactions.**
- `endMatch()`: single transaction for match status + all player scores
- `handleRematchStartConfirm()`: single transaction for match + players
- In the async adapter, transactions use `BEGIN`/`COMMIT`/`ROLLBACK` with proper error handling
- Since these are fire-and-forget, a failed transaction just means the match isn't persisted — game already happened

**Risk 3: Sync→Async Conversion of WS Message Handlers**
Currently, WS `message` handlers are synchronous. With async DB, every handler that touches DB becomes `async`. The risk: unhandled promise rejections crashing the process, or race conditions from concurrent async operations on the same room.

**Decision: Write queue per room.**
- Each room gets a serial write queue (simple promise chain)
- Game logic stays synchronous (in-memory state mutations) — no `await` in the hot path
- DB writes are enqueued as fire-and-forget async tasks that execute serially per room
- This prevents: interleaved writes, unhandled rejections, and async race conditions
- Pattern: `room.persistQueue = room.persistQueue.then(() => persistMatchEnd(roomCode)).catch(log)`

**Risk 4: Reconnection Relies on In-Memory State**
`handleJoin()` on reconnect checks `rooms` Map and `disconnected` Map — both in-memory. If the container restarts (scale-to-zero, redeploy), all in-memory state is lost and active matches die.

**Decision: Accept this limitation (already the case today).**
- Container Apps scale-to-zero kills all WS connections and in-memory state
- Matches are ephemeral by nature — a 5-minute game lost to restart is acceptable
- Future enhancement (not Phase 11): optional match state checkpointing to DB for crash recovery
- Client already has reconnect logic with 5 retries — this handles transient disconnects

**Risk 5: Error Handling Is Silent**
Most DB calls in the WS handler have empty `catch` blocks or no error handling at all. Errors are swallowed silently.

**Decision: Add structured logging for failed persistence.**
- Fire-and-forget writes should log failures (room code, operation, error) but NOT crash the game
- Add a `/api/admin/persistence-health` endpoint that reports recent failures
- Track a counter of "unpersisted matches" — if it grows, investigate

#### Architectural Summary for WS Handler Migration

```
┌─────────────────────────────────────┐
│ WS Message Handler (synchronous)    │
│ - Validate message                  │
│ - Mutate in-memory room state       │
│ - Broadcast results to players      │
│ - Enqueue DB write (fire & forget)  │
└──────────────┬──────────────────────┘
               │ enqueue
               ▼
┌─────────────────────────────────────┐
│ Room Persist Queue (async, serial)  │
│ - Executes DB writes one at a time  │
│ - Logs failures, never throws       │
│ - Transactions for multi-step ops   │
└──────────────┬──────────────────────┘
               │ await db.run(...)
               ▼
┌─────────────────────────────────────┐
│ Database Adapter (async)            │
│ - SQLite or Azure SQL               │
│ - Connection pool management        │
│ - Parameter translation             │
└─────────────────────────────────────┘
```

**Key principle: The WS game engine has ZERO awaits. All DB interaction is post-broadcast, queued, and fault-tolerant.**

---

### Connection Pool Sizing (Azure SQL)
Azure SQL free tier has limited concurrent connections. The `mssql` package uses connection pooling — need to size appropriately: `min: 0, max: 10` is a safe default. Pool exhaustion would cause 503s, so need proper error handling and pool health monitoring.

### Prepared Statements / Query Caching
SQLite's `db.prepare()` compiles and caches SQL. The `mssql` package uses parameterized queries but doesn't have the same prepare/cache model. For hot paths (leaderboard, puzzle fetch), consider using `mssql`'s `PreparedStatement` class for performance.

### Transaction Semantics
SQLite's default transaction isolation is SERIALIZABLE. Azure SQL defaults to READ COMMITTED. The WS handler's fire-and-forget writes don't need SERIALIZABLE (they're append-only status updates). HTTP routes that read aggregated data (leaderboard, profile stats) work fine with READ COMMITTED. No isolation level override needed for current use cases.

### bcrypt in System User Seeding
The system user seed hashes the `SYSTEM_API_KEY` with bcrypt on every fresh DB init. This is CPU-intensive (~100ms). In the async world, use `bcrypt.hash()` (async) instead of `bcrypt.hashSync()`.

### No DELETE Statements in Codebase
The current codebase has no SQL DELETE statements. Data grows indefinitely. With Azure SQL's 32GB free tier limit, this could eventually be an issue. Consider adding a data retention policy (e.g., archive old matches after 90 days).

### Rollback Strategy for Schema Migrations
Each migration has `down()` but it's never auto-called. If a migration breaks production:
1. Deploy rolls back to previous image (previous code + new schema)
2. This only works if migrations are backward-compatible
3. **Rule**: migrations must be additive (add columns, not rename/remove). Destructive changes need a two-phase deploy.
