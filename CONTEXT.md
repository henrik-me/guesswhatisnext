# Project Context — Guess What's Next

This file tracks active and planned clickstops and current project state.

- **Live work coordination:** [WORKBOARD.md](WORKBOARD.md)
- **Architecture decisions & learnings:** [LEARNINGS.md](LEARNINGS.md)
- **Completed clickstop archives:** [project/clickstops/done/](project/clickstops/done/)
- **Development guidelines:** [INSTRUCTIONS.md](INSTRUCTIONS.md)

> **Last updated:** 2026-04-21

---

## Clickstop Summary

Active and planned clickstops listed below. Completed clickstops live in [`project/clickstops/done/`](project/clickstops/done/) — browse the folder for the full archive.

| ID | Name | Status | Tasks | Detail |
|----|------|--------|-------|--------|
| CS40 | Feature Flag Testing Infrastructure | ⬜ Planned | 0/5 | [details](project/clickstops/planned/planned_cs40_feature-flag-testing.md) |
| CS41 | Production Deploy Validation | ⬜ Planned | 0/5 | [details](project/clickstops/planned/planned_cs41_production-deploy-validation.md) |
| CS42 | Production Cold Start Progressive Messages | 🔄 Active | 1/5 | [details](project/clickstops/active/active_cs42_production-cold-start-messages.md) |
| CS45 | INSTRUCTIONS.md Structural Split | 🔄 Active | 0/7 | [details](project/clickstops/active/active_cs45_instructions-split.md) |

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
