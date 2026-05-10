# Project Context — Guess What's Next

This file describes the project's current codebase state and known blockers. **Clickstop status lives on disk** under `project/clickstops/{active,planned,done}/` — see the [Clickstops](#clickstops) section below.

- **Live work coordination:** [WORKBOARD.md](WORKBOARD.md)
- **Architecture decisions & learnings:** [LEARNINGS.md](LEARNINGS.md)
- **Development guidelines:** [INSTRUCTIONS.md](INSTRUCTIONS.md)

> **Last updated:** 2026-05-03

---

## Clickstops

The **filesystem is the source of truth** for clickstop status — there is no per-clickstop summary table here anymore (it kept drifting from disk). Run `git pull` first, then browse the three folders directly:

- Active: [`project/clickstops/active/`](project/clickstops/active/)
- Planned: [`project/clickstops/planned/`](project/clickstops/planned/)
- Done: [`project/clickstops/done/`](project/clickstops/done/)

---

## Current Codebase State

**GitHub Actions workflows:** see [.github/workflows/](.github/workflows/) for the authoritative inventory (triggers and purposes live in each workflow's `on:` block and header comments).

**Test inventory:** `npm test` output is the source of truth; see the test scripts in [package.json](package.json).

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

---

## Blockers / Open Questions

- **Staging is being moved to scale-to-zero, on-demand cold-start**: Azure `gwn-staging` is being rolled to `minReplicas: 0` (live state tracks [CS58-1/CS58-2](project/clickstops/done/done_cs58_scale-staging-to-zero.md)). First request after idle pays a cold-start (~10–30s replica + ~30s DB lazy init); a few minutes of zero traffic returns it to $0. It is not a pre-prod release gate — that role belongs to the Ephemeral Smoke Test job in [`.github/workflows/staging-deploy.yml`](.github/workflows/staging-deploy.yml) plus local `npm run container:validate`. See the CS file for cost figures and rationale, and [§ Waking staging for ad-hoc validation in OPERATIONS.md](OPERATIONS.md#waking-staging-for-ad-hoc-validation) for the operator probe procedure.
- **Production is being moved to scale-to-zero, on-demand cold-start**: Azure `gwn-production` is being rolled to `minReplicas: 0` (live state tracks [CS75](project/clickstops/active/active_cs75_scale-prod-to-zero.md), mirroring CS58 on staging). First user request after a quiet period pays a cold-start (~10–30s replica + ~30–60s Azure SQL serverless resume = up to ~90s); active traffic keeps the replica warm. See the CS file for cost figures, the user-visible cold-start trade-off (explicitly accepted during planning 2026-05-08), and rollback procedure, and [§ Waking production for ad-hoc validation in OPERATIONS.md](OPERATIONS.md#waking-production-for-ad-hoc-validation) for the operator probe procedure.
- **Azure Files storage cleanup**: ✅ Done (PR #49). Azure storage resources (`gwn-storage-staging`, `gwn-storage-production`) still exist in Azure and should be deleted manually.
- **Staging auto-deploy disabled**: Must manually trigger `workflow_dispatch` after merging to main. Re-enable once stable.
- **Production deployed**: ✅ Running on Azure SQL (serverless free tier) at [gwn.metzger.dk](https://gwn.metzger.dk). All migrations applied (8/8 including CS52 ranked schema), 504 puzzles + 54 ranked puzzles seeded. CS52 server-authoritative scoring (Ranked Free Play + Ranked Daily + multiplayer unification + `/api/sync` + `pending_writes` cold-DB queue + `game_configs` admin route) live as of 2026-05-03 on image `76f5705` (revision `gwn-production--0000020`). See [done_cs52](project/clickstops/done/done_cs52_server-authoritative-scoring.md) for the full closeout.
- **Azure SQL free tier limit**: 1 free DB per subscription. Production gets the free DB; staging uses ephemeral local SQLite.
- **Artillery / OTel peer-dep warnings**: `npm install` emits OpenTelemetry peer-dependency warnings from the `artillery` load-testing dev dependency tree on any Node version that installs dev deps. (Node ≥ 22.13 is required to *run* artillery, but the install-time warnings can appear on any Node version.) Non-blocking install noise; does not affect the runtime telemetry path. Production installs (`npm ci --omit=dev`, used by the Docker image) skip artillery entirely. No dependency changes planned. _(CS78 (2026-05-09) moved artillery from `optionalDependencies` → `devDependencies` to remove the `fast-xml-builder` chain from the production install set; this did not change the warning surface for contributors who run a default `npm install`.)_
