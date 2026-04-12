# Guess What's Next

A browser-based puzzle game where you're shown a sequence of items — emoji, text, or images — that follow a pattern, and you must guess what comes next!

Features single-player (free play + daily challenge), global leaderboards, and real-time multiplayer (2–10 players).

## How to Play

### Single Player
1. Choose a game mode from the home screen:
   - **🎮 Free Play** — Pick a category (or random) and complete 10 rounds
   - **📅 Daily Challenge** — One puzzle per day, same for everyone. Share your result Wordle-style!
2. You'll see a sequence of items. Study the pattern.
3. Pick the correct next item from 4 choices.
4. Answer quickly — faster answers earn more points!
5. Use keyboard shortcuts **1–4** to select options.

### Multiplayer
1. Click **⚔️ Multiplayer** and log in (or register)
2. **Create Room** — get a room code to share with friends (2–10 players)
3. **Join Room** — enter a friend's room code
4. As host: configure max players and rounds, click **Start Game** when ready
5. All players answer the same puzzles simultaneously
6. After the match: view full rankings, request a rematch, or check match history

> **Note:** The host (room creator) controls when the game starts. Non-hosts see a "Waiting for host" message.

### Scoring

| Component | Points |
|---|---|
| Correct answer | 100 base points |
| Speed bonus | Up to +100 (faster = more) |
| Streak x1.5 | 3–5 correct in a row (single player) |
| Streak x2.0 | 6+ correct in a row (single player) |
| Wrong answer | 0 points, streak resets |

### Leaderboard
- View global rankings from the **🏆 Leaderboard** on the home screen
- Switch between **🎮 Free Play** and **⚔️ Multiplayer** leaderboards
- Filter by: All Time, Weekly, or Daily
- Multiplayer leaderboard shows wins, win rate, and average score
- Requires an account (register via Multiplayer)

### Achievements
- Unlock **🏅 12 badges** by playing: scoring milestones, streaks, daily challenges, multiplayer wins, speed
- View all achievements from the home screen — locked badges shown grayed out
- Toast notification when you unlock a new achievement

### Settings
- **🔊 Sound effects** — toggle on/off (synthesized via Web Audio API, no external files)
- **🎨 Theme** — Dark (default) or Light mode
- **⏱️ Timer duration** — 10s, 15s, or 20s for free play rounds

### Player Profile
- View your **👤 Profile** from the home screen
- See stats: games played, best score, best streak, match wins
- Recent achievements and match history at a glance
- Quick links to full achievements and match history screens

### Game Enhancements
- **Difficulty selector** — Easy, Medium, Hard, or All in free play
- **⏭️ Skip button** — skip a puzzle (counts as wrong answer)
- **🎊 Confetti celebration** on perfect games

---

## Developer Guide

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Git](https://git-scm.com/)
- [Docker](https://www.docker.com/) (optional, for container-based dev)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/henrik-me/guesswhatisnext.git
cd guesswhatisnext

# Install dependencies
npm install

# Start the server
npm start
# → http://localhost:3000
```

For development with auto-reload:
```bash
npm run dev
```

For production-like local testing (HTTPS + log capture):
```bash
npm run dev:full
# → https://localhost:3443 (accept self-signed cert warning)
```

### Admin Bootstrapping

The first admin user must be bootstrapped. Two options:

1. **Environment variable (recommended):** Set both `SYSTEM_API_KEY` (to a non-default value) and `ADMIN_USERNAME` to auto-promote a registered user to admin on server startup:
   ```bash
   SYSTEM_API_KEY=my-secret-key ADMIN_USERNAME=myuser npm start
   ```
2. **API key:** Use the system API key to promote a user via the admin API:
   ```bash
   # Find the user's ID
   curl -H "X-API-Key: $SYSTEM_API_KEY" http://localhost:3000/api/users

   # Promote to admin
   curl -X PUT -H "X-API-Key: $SYSTEM_API_KEY" -H "Content-Type: application/json" \
     -d '{"role":"admin"}' http://localhost:3000/api/users/<USER_ID>/role
   ```

Once promoted, admin users can manage other users' roles from the **🛡️ Moderation** screen in the UI. Note: after a role change, the user must log out and log back in for the new role to take effect (the role is stored in their JWT token).

### Feature Flags

This section documents the small central **server-side feature-flag system** introduced in PR #91, which safely ships incomplete or limited-access features without exposing them to everyone at once.

- **Evaluation order:** start from the feature's configured default state; then apply a feature-specific request override only when that feature allows overrides in the current environment; otherwise apply explicit user targeting, then deterministic percentage rollout. If none of those change the result, the feature remains at its default state.
- **Supported controls:** feature default state, specific-user targeting, deterministic percentage rollout, and optional query-param/header overrides for features that explicitly opt in. Targeting and percentage rollout may enable a feature even when its default state is off.
- **Client/server model:** in branches that include PR #91, the client reads `/api/features` to hide or show gated UI, but server routes must still enforce the same flag

**`submitPuzzle` feature-flag setup on PR #91**
- Canonical feature-flag key: `submitPuzzle`
- Hidden/disabled by default
- Can be enabled for specific users and/or a rollout percentage
- Request overrides are allowed for this feature only outside `production` and `staging`
- Override identifiers for `submitPuzzle`: query param `ff_submit_puzzle`, header `x-gwn-feature-submit-puzzle`

> Overrides are feature-specific and opt-in, not a global bypass. Only use them for features that explicitly define override support.
>
> `submitPuzzle` is the feature-flag key. The override names above are request identifiers, not alternate flag keys or UI route names.
>
> If your branch does not include PR #91 yet, `/api/features` and the documented `submitPuzzle` overrides will not be available there.

### Running with Docker

**SQLite (default, local dev):**
```bash
docker compose up --build
# → http://localhost:3000
```

**MSSQL (production-like validation):**

Runs the full stack against SQL Server 2022 with HTTPS via Caddy reverse proxy — mirrors the production Azure SQL environment:
```bash
# Start MSSQL + app + HTTPS proxy
npm run docker:mssql
# → https://localhost (accept self-signed cert warning once)

# View pretty-printed live logs
npm run docker:mssql:logs

# Errors only
docker compose -f docker-compose.mssql.yml logs app --no-log-prefix | npx pino-pretty -L error

# Export raw JSON logs for analysis
docker compose -f docker-compose.mssql.yml logs app --no-log-prefix > app-logs.json

# Stop everything
npm run docker:mssql:down
```

The Docker MSSQL stack produces **production-identical structured JSON logs** (Pino) — every HTTP request, WebSocket event, migration, auth event, and error is captured with the same schema as production.

### Testing

```bash
# Run unit + integration tests (vitest)
npm test

# Run E2E browser tests (Playwright)
npm run test:e2e

# Run everything (vitest + Playwright)
npm run test:all

# Watch mode (re-run on changes)
npm run test:watch

# With coverage report
npm run test:coverage

# Lint
npm run lint
```

Tests are fully isolated — each suite gets its own temp database and random port. Safe to run in parallel across worktrees.

### Known Issues

- On Node >= 22.13, `npm ci` may install the optional `artillery` load-testing dependency and emit OpenTelemetry peer-dependency warnings. Those warnings come from optional load-testing dependencies that still pull older OTel metrics/exporter packages, while the application's runtime telemetry path uses newer OTel packages.
- This is currently treated as non-blocking install noise for optional load-testing tooling. It does not affect the validated runtime telemetry path, and no dependency changes are planned right now. If you do not need load testing, `npm ci --omit=optional` avoids the warning by skipping optional dependencies such as `artillery`.

### Parallel Development (Worktrees)

For parallel work, the project uses **fixed git worktree slots** with task-specific branches:

```bash
# Worktrees live in C:\src\gwn-worktrees\wt-1 through wt-4
git worktree list    # see which branch is in which slot
```

Each worktree agent pushes its branch and merges to main remotely. See [INSTRUCTIONS.md](INSTRUCTIONS.md) for full workflow details.

**Current workflow:** Push branch → create PR → Copilot review → squash-merge to main.

### Architecture

**Software Structure:**
```
guesswhatisnext/
├── public/                         # Client (served as static files)
│   ├── index.html                  # Game shell — SPA
│   ├── css/style.css               # Styling, responsive, animations, themes
│   ├── js/
│   │   ├── app.js                  # Entry point, screen nav, auth, multiplayer UI
│   │   ├── game.js                 # Core game engine (scoring, timer, rounds)
│   │   ├── puzzles.js              # Client-side puzzle data
│   │   ├── daily.js                # Date-seeded daily challenge logic
│   │   ├── storage.js              # LocalStorage persistence
│   │   └── audio.js                # Web Audio API sound effects
│   └── img/                        # SVG image assets for puzzles
│       ├── shapes/                 # Triangle, square, pentagon, hexagon, etc.
│       └── colors/                 # Color circles (red → purple)
├── server/
│   ├── index.js                    # Entry point: telemetry init, config, server bootstrap
│   ├── app.js                      # Express app factory, middleware, route wiring
│   ├── config.js                   # Centralized env vars with startup validation
│   ├── logger.js                   # Pino structured logging, OTel trace mixin
│   ├── telemetry.js                # OpenTelemetry SDK, Azure Monitor exporter
│   ├── achievements.js             # Achievement unlock logic
│   ├── categories.js               # Puzzle category definitions
│   ├── feature-flags.js            # Feature flag evaluation (submitPuzzle)
│   ├── puzzleData.js               # Server-side puzzle pool (multiplayer)
│   ├── routes/
│   │   ├── achievements.js         # Achievement API routes
│   │   ├── auth.js                 # Register, login, JWT tokens
│   │   ├── features.js             # Feature flag status endpoint
│   │   ├── matches.js              # Room create/join + match history
│   │   ├── notifications.js       # Notifications API routes
│   │   ├── puzzles.js              # Puzzle API
│   │   ├── scores.js               # Score submission + leaderboards
│   │   ├── submissions.js          # User-submitted puzzles
│   │   ├── telemetry.js            # Client telemetry ingestion
│   │   └── users.js                # User profiles + management
│   ├── ws/matchHandler.js          # WebSocket match engine (2–10 players)
│   ├── db/
│   │   ├── index.js                # DB factory (auto-selects SQLite or MSSQL via DATABASE_URL)
│   │   ├── base-adapter.js         # Abstract async adapter interface
│   │   ├── sqlite-adapter.js       # SQLite adapter (local dev, tests)
│   │   ├── mssql-adapter.js        # MSSQL/Azure SQL adapter with SQL rewriting
│   │   ├── migrations/             # Versioned schema migrations (dialect-aware)
│   │   └── connection.js           # DB init + seeding
│   └── middleware/
│       ├── auth.js                 # JWT + API key verification middleware
│       └── security.js             # Helmet headers, HTTPS redirect, HSTS, CSP
├── data/                           # SQLite database (local dev, git-ignored)
├── Dockerfile                      # Production container image
├── docker-compose.yml              # Local container dev (SQLite)
├── docker-compose.mssql.yml        # MSSQL validation stack (SQL Server + HTTPS)
├── .github/workflows/              # CI, deploy, load-test, and health-monitor workflows
├── scripts/                        # Local health-check scripts (sh + ps1)
├── infra/                          # Azure deployment (deploy.sh + README)
├── eslint.config.mjs               # ESLint flat config
├── package.json
├── INSTRUCTIONS.md                 # Architecture & coding guidelines
├── CONTEXT.md                      # Project plan & status tracker
└── README.md                       # This file
```

**System Architecture:**
```
  Browser (Client)                     Server (Node.js)
 ┌─────────────────┐               ┌──────────────────────┐
 │  index.html     │               │  Express (port 3000)  │
 │  ┌───────────┐  │   HTTP/REST   │  ┌────────────────┐  │
 │  │  app.js   │──┼──────────────▶│  │ Routes (API)   │  │
 │  │  game.js  │  │               │  │ /api/auth      │  │
 │  │  daily.js │  │   WebSocket   │  │ /api/scores    │  │
 │  │ puzzles.js│  │◀─────────────▶│  │ /api/matches   │  │
 │  │ storage.js│  │               │  │ /api/health    │  │
 │  └───────────┘  │               │  └───────┬────────┘  │
 │  LocalStorage   │               │          │           │
 └─────────────────┘               │  ┌───────▼────────┐  │
                                   │  │ DB Adapter      │  │
                                   │  │ (auto-selects)  │  │
                                   │  │ ┌────────────┐  │  │
                                   │  │ │ SQLite     │  │  │
                                   │  │ │ (local dev)│  │  │
                                   │  │ ├────────────┤  │  │
                                   │  │ │ Azure SQL  │  │  │
                                   │  │ │ (prod)     │  │  │
                                   │  │ └────────────┘  │  │
                                   │  └────────────────┘  │
                                   │  ┌────────────────┐  │
                                   │  │ WebSocket (ws)  │  │
                                   │  │ matchHandler.js │  │
                                   │  └────────────────┘  │
                                   └──────────────────────┘

  DB backend auto-selects:
    DATABASE_URL set → Azure SQL / MSSQL (production)
    DATABASE_URL absent → SQLite (local dev, tests)

  Routes use `?` placeholders. The adapter layer handles:
    SQLite: pass-through
    MSSQL:  ? → @p1, LIMIT → OFFSET/FETCH, dates, RANDOM, etc.
```

**Deployment Pipeline:**
```
  PR to main
       │
  ┌────▼─────┐
  │ Lint +   │  (parallel, ci.yml)
  │ Test     │
  └──────────┘

  Push to main or manual trigger (staging-deploy.yml — gated by STAGING_AUTO_DEPLOY repo variable)
       │
  ┌────▼──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐
  │ workflow_     │─▶│ Build &  │─▶│ Ephemeral │─▶│ ⏸️ Manual │─▶│ Deploy to │
  │ dispatch or   │  │ Push to  │  │ Staging   │  │ Approval │  │ Azure     │
  │ push to main  │  │ GHCR     │  │ (in CI)   │  │          │  │ Staging   │
  └───────────────┘  └──────────┘  └───────────┘  └──────────┘  └───────────┘

  Manual trigger (prod-deploy.yml)
       │  (requires staging green)
  ┌────▼─────┐  ┌──────────┐
  │ Deploy   │─▶│ Verify   │─▶ ❌ fail → Auto-rollback + GitHub Issue
  │ to Prod  │  │ Health   │─▶ ✅ pass → Done
  │(same img)│  │          │
  └──────────┘  └──────────┘

  Health Monitor (every 6 hours) ──────────────────────────────────▶ gwn-prod
       │ on failure → GitHub Issue
```

> **Note:** Push to `main` does **not** deploy by default. Deployment runs when triggered
> manually via `workflow_dispatch`, or automatically on push when `STAGING_AUTO_DEPLOY` is enabled.
> All code reaches production through the staging pipeline: staging validation → manual prod deploy.

| Environment | Cost | Trigger | Approval | Rollback |
|---|---|---|---|---|
| Local (SQLite) | Free | `npm start` / `docker compose up` | None | N/A |
| Local (MSSQL) | Free | `npm run docker:mssql` | None | N/A |
| Ephemeral staging | $0 (GitHub Actions) | Manual `workflow_dispatch`, or `push` to `main` when `STAGING_AUTO_DEPLOY` is enabled | Automatic | N/A (ephemeral) |
| Azure staging | $0 (scale-to-zero) | After ephemeral validation | Manual | Redeploy previous SHA tag |
| Production | $0+ (pay-per-use, Azure SQL) | Manual trigger (staging must be green) | Manual | Auto-rollback to previous SHA tag |

### API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | System (API key) | Health check with deep diagnostics |
| `POST` | `/api/auth/register` | No (rate-limited) | Register (username, password) |
| `POST` | `/api/auth/login` | No (rate-limited) | Login → JWT token |
| `GET` | `/api/auth/me` | Yes (JWT) | Current user info |
| `POST` | `/api/scores` | Yes (JWT) | Submit a game score |
| `GET` | `/api/scores/leaderboard` | Yes (JWT/API key) | Leaderboard (mode, period, limit) |
| `GET` | `/api/scores/me` | Yes (JWT) | User's score history |
| `POST` | `/api/matches` | Yes (JWT) | Create a match room (accepts maxPlayers, totalRounds) |
| `POST` | `/api/matches/join` | Yes (JWT) | Join by room code (validates capacity) |
| `GET` | `/api/matches/:id` | Yes (JWT) | Match status + players |
| `GET` | `/api/matches/history` | Yes (JWT) | User's match history |
| `GET` | `/api/scores/leaderboard/multiplayer` | Yes (JWT/API key) | Multiplayer leaderboard (wins, win rate) |
| `GET` | `/api/puzzles` | Yes (JWT) | Get puzzles (supports category, difficulty filters) |
| `GET` | `/api/achievements` | Yes (JWT) | All achievement definitions |
| `GET` | `/api/achievements/me` | Yes (JWT) | User's unlocked achievements |

> **Auth types:** `JWT` = Bearer token from login; `API key` = `X-API-Key` header (system account); `rate-limited` = IP-based rate limiting

### WebSocket

Connect to `ws://localhost:3000/ws?token=JWT_TOKEN` for real-time multiplayer.

**Key WS message types:**
| Direction | Type | Description |
|---|---|---|
| Client→Server | `join` | Join a room by code |
| Client→Server | `start-match` | Host starts the match |
| Client→Server | `answer` | Submit answer with timing |
| Client→Server | `rematch-request` | Request a rematch after game ends |
| Client→Server | `rematch-start-confirm` | Host confirms rematch start |
| Server→Client | `connected` | Connection confirmed |
| Server→Client | `lobby-state` | Full player roster + host info |
| Server→Client | `match-start` | Match is starting |
| Server→Client | `round` | New round puzzle |
| Server→Client | `roundResult` | Round scores for all players |
| Server→Client | `gameOver` | Final rankings with placements |
| Server→Client | `player-disconnected` | Player left, reconnect window |
| Server→Client | `player-dropped` | Player eliminated (timeout) |
| Server→Client | `player-reconnected` | Player reconnected to match |
| Server→Client | `host-transferred` | New host assigned |
| Server→Client | `player-forfeited` | Player forfeited (disconnect timeout) |
| Server→Client | `achievements-unlocked` | New achievements earned |
| Server→Client | `rematch-ready` | Player ready for rematch (broadcast) |
| Server→Client | `rematch-start` | Rematch is starting (new room) |

### Useful Commands

| Command | Description |
|---|---|
| `npm start` | Start the server on port 3000 |
| `npm run dev` | Start with auto-reload (--watch) |
| `npm run dev:full` | HTTPS + log capture (recommended for testing) |
| `npm run dev:log` | HTTP + log capture (plain HTTP with logging) |
| `npm test` | Run unit + integration tests (vitest) |
| `npm run test:e2e` | Run E2E browser tests (Playwright) |
| `npm run test:mssql` | Run tests against local MSSQL container |
| `npm run lint` | Run ESLint (0 warnings target) |
| `npm run docker:mssql` | Start full MSSQL stack (SQL Server + app + HTTPS) |
| `npm run docker:mssql:logs` | Pretty-printed live log tail from MSSQL stack |
| `npm run docker:mssql:down` | Stop MSSQL Docker stack |

### Development Server Modes

| Mode | Command | URL | Use Case |
|---|---|---|---|
| Quick iteration | `npm run dev` | http://localhost:3000 | Code changes with auto-reload |
| Full local testing | `npm run dev:full` | https://localhost:3443 | Production-like: HTTPS, security headers, log capture |
| HTTP + logging | `npm run dev:log` | http://localhost:3000 | Log analysis without HTTPS overhead |

**`dev:full` (recommended for manual testing)** starts an HTTPS server with self-signed certificates, security headers active (including CSP, HSTS, and Permissions-Policy), and captures structured logs to `telemetry.log`. An HTTP server on port 3080 redirects to HTTPS, verifying the redirect middleware.

All modes except `dev` capture logs to `telemetry.log` by default. Use `--no-log-file` to disable:
```bash
node scripts/dev-server.js --no-log-file
```

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute, coding standards, and the pull request process.

## License

This project is licensed under the [MIT License](LICENSE).
