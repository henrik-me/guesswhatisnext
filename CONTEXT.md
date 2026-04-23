# Project Context — Guess What's Next

This file describes the project's current codebase state and known blockers. **Clickstop status lives on disk** under `project/clickstops/{active,planned,done}/` — see the [Clickstops](#clickstops) section below.

- **Live work coordination:** [WORKBOARD.md](WORKBOARD.md)
- **Architecture decisions & learnings:** [LEARNINGS.md](LEARNINGS.md)
- **Development guidelines:** [INSTRUCTIONS.md](INSTRUCTIONS.md)

> **Last updated:** 2026-04-23

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

- **Azure Files storage cleanup**: ✅ Done (PR #49). Azure storage resources (`gwn-storage-staging`, `gwn-storage-production`) still exist in Azure and should be deleted manually.
- **Staging auto-deploy disabled**: Must manually trigger `workflow_dispatch` after merging to main. Re-enable once stable.
- **Production deployed**: ✅ Running on Azure SQL (serverless free tier) at [gwn.metzger.dk](https://gwn.metzger.dk). All migrations applied, 504 puzzles seeded.
- **Azure SQL free tier limit**: 1 free DB per subscription. Production gets the free DB; staging uses ephemeral local SQLite.
- **Artillery / OTel peer-dep warnings on Node ≥ 22.13**: `npm ci` emits OpenTelemetry peer-dependency warnings from the optional `artillery` load-testing dependency tree. Non-blocking install noise; does not affect the runtime telemetry path. No dependency changes planned.
