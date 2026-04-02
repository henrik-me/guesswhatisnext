# Development Instructions

This document defines architecture decisions, coding standards, testing strategy, and git workflow for the **Guess What's Next** project.

---

## 1. Architecture Principles

### Software Architecture

```
guesswhatisnext/
├── public/                         # Client (served as static files)
│   ├── index.html                  # Game shell — 16 screens (SPA)
│   ├── css/style.css               # Styling, responsive, animations, themes
│   ├── js/
│   │   ├── app.js                  # Entry point, screen nav, auth, multiplayer UI
│   │   ├── game.js                 # Core game engine (scoring, timer, rounds)
│   │   ├── puzzles.js              # Client-side puzzle data (85 puzzles, 12 categories — server has 200+)
│   │   ├── daily.js                # Date-seeded daily challenge logic
│   │   ├── storage.js              # LocalStorage persistence
│   │   └── audio.js                # Web Audio API sound effects
│   └── img/                        # SVG image assets for puzzles
│       ├── shapes/                 # Triangle, square, pentagon, hexagon, etc.
│       └── colors/                 # Color circles (red → purple)
├── server/
│   ├── index.js                    # Express app + HTTP + WebSocket bootstrap
│   ├── puzzleData.js               # Server-side puzzle pool (multiplayer)
│   ├── routes/
│   │   ├── auth.js                 # Register, login, JWT tokens
│   │   ├── scores.js               # Score submission + leaderboards
│   │   ├── matches.js              # Room create/join + match history
│   │   └── puzzles.js              # Puzzle API
│   ├── ws/matchHandler.js          # WebSocket match engine (2–10 players)
│   ├── db/
│   │   ├── schema.sql              # SQLite table definitions
│   │   └── connection.js           # DB init + query helpers
│   └── middleware/auth.js          # JWT + API key verification middleware
├── data/                           # SQLite database (auto-created, git-ignored)
├── Dockerfile                      # Production container image (Phase 3)
├── docker-compose.yml              # Local container dev environment (Phase 3)
├── .github/workflows/              # ci-cd.yml + health-monitor.yml
├── scripts/                        # Local health-check scripts (sh + ps1)
├── infra/                          # Azure deployment (deploy.sh + README)
├── eslint.config.mjs              # ESLint flat config
├── package.json
├── INSTRUCTIONS.md                 # This file
├── CONTEXT.md                      # Project plan & status tracker
└── README.md                       # User & developer documentation
```

### System Architecture (Current — Phase 2)

```
  Browser (Client)                     Server (Node.js)
 ┌─────────────────┐               ┌──────────────────────┐
 │  index.html     │               │  Express (port 3000)  │
 │  ┌───────────┐  │   HTTP/REST   │  ┌────────────────┐  │
 │  │  app.js   │──┼──────────────▶│  │ Routes (API)   │  │
 │  │  game.js  │  │               │  │ auth, scores,  │  │
 │  │  daily.js │  │   WebSocket   │  │ matches, puzzles│  │
 │  │ puzzles.js│  │◀─────────────▶│  └───────┬────────┘  │
 │  │ storage.js│  │               │          │           │
 │  └───────────┘  │               │  ┌───────▼────────┐  │
 │  LocalStorage   │               │  │ SQLite (WAL)   │  │
 └─────────────────┘               │  │ data/game.db   │  │
                                   │  └────────────────┘  │
                                   │  ┌────────────────┐  │
                                   │  │ WebSocket (ws)  │  │
                                   │  │ matchHandler.js │  │
                                   │  └────────────────┘  │
                                   └──────────────────────┘
```

### Deployment Architecture (Phase 3)

```
  Developer                    GitHub                              Azure
 ┌─────────┐              ┌───────────────┐
 │ git push│──────────────▶│ GitHub Actions │
 │ to main │              │               │
 └─────────┘              │ ┌───────────┐ │
                          │ │ Lint+Test  │ │
                          │ └─────┬─────┘ │
                          │       │       │
                          │ ┌─────▼─────┐ │
                          │ │ Build     │ │  push to GHCR (SHA-tagged)
                          │ │ Docker    │─┼──────────┐
                          │ └─────┬─────┘ │          │
                          │       │       │          │
                          │ ┌─────▼─────┐ │        ┌─▼────────────────┐
                          │ │ Deploy    │─┼───────▶│ STAGING           │
                          │ │ Staging   │ │        │ gwn-staging       │
                          │ └─────┬─────┘ │        │ Container Apps    │
                          │       │       │        └──────────────────┘
                          │ ┌─────▼─────┐ │
                          │ │ Smoke     │ │
                          │ │ Tests     │ │
                          │ └─────┬─────┘ │
                          │       │       │
                          │ ┌─────▼─────┐ │
                          │ │ ⏸️ Manual  │ │  (GitHub Environment protection)
                          │ │ Approval  │ │
                          │ └─────┬─────┘ │
                          │       │       │        ┌──────────────────┐
                          │ ┌─────▼─────┐ │        │ PRODUCTION       │
                          │ │ Deploy    │─┼───────▶│ gwn-prod         │
                          │ │ Prod      │ │  same  │ Container Apps   │
                          │ └─────┬─────┘ │  image │ Scale-to-zero    │
                          │       │       │        └──────────────────┘
                          │ ┌─────▼─────┐ │               ▲
                          │ │ Prod      │─┼───────────────┘
                          │ │ Verify    │ │  health + smoke tests
                          │ └─────┬─────┘ │
                          │       │       │
                          │   ❌ fail?    │
                          │ ┌─────▼─────┐ │        ┌──────────────────┐
                          │ │ Rollback  │─┼───────▶│ Redeploy prev    │
                          │ │ + Issue   │ │        │ SHA-tagged image  │
                          │ └───────────┘ │        └──────────────────┘
                          │               │
                          │ ┌───────────┐ │               ▲
                          │ │ Health    │─┼───────────────┘
                          │ │ Monitor   │ │  every 5 min
                          │ │ (cron)    │ │  on failure → GH Issue
                          │ └───────────┘ │
                          └───────────────┘
```

### Separation of Concerns
- **Game engine** (`game.js`) handles logic only — no DOM manipulation
- **App layer** (`app.js`) handles screen navigation and DOM updates
- **Data layer** (`puzzles.js`) is pure data — exportable objects, no side effects
- **Storage layer** (`storage.js`) abstracts all persistence behind a clean API
- **Server routes** handle HTTP API, middleware handles auth, WebSocket handler manages real-time matches

### Feature Flag Rollouts

PR #91 introduces a central feature-flag module for staged rollouts of incomplete or limited-access features. This document records that design so the intended rollout path is clear in branches that include PR #91.

- **Source of truth:** server-side evaluation per request; in branches that include PR #91, the client mirrors flag state via `/api/features`, but guarded server routes still enforce the same flag
- **Evaluation order:** start from the feature's configured default state; then apply a feature-specific request override only when that feature opts in and the current environment allows it; otherwise apply explicit user targeting, then deterministic percentage rollout. If none of those change the result, the feature remains at its default state.
- **Supported controls:** feature default state, specific-user targeting, deterministic percentage rollout, and optional query-param/header overrides. Targeting and percentage rollout may enable a feature even when its default state is off.
- **Rollout stability:** percentage rollouts are deterministic per authenticated user so the same user consistently lands in or out of the rollout bucket across requests
- **Override policy:** overrides are never global; each feature must explicitly opt in and define its own override names

**`submitPuzzle` flag in branches that include PR #91**
- Default-off / hidden by default
- Can be enabled for explicit users and/or a rollout percentage
- Allows request overrides only outside `production` and `staging`
- Override names: query param `ff_submit_puzzle`, header `x-gwn-feature-submit-puzzle`

If your branch does not include PR #91 yet, it will not contain the shared module or `/api/features` route. In branches that do include it, prefer default-off, keep evaluation centralized, and document any override behavior explicitly so teammates can test safely without creating production bypasses.

### Multiplayer Architecture (Phase 4)

The multiplayer system supports 2–10 players per room with a host-controlled lobby:

1. **Room lifecycle:** CREATED → LOBBY (players joining) → ACTIVE (game running) → FINISHED
2. **Host model:** Room creator is host; configures max players (2–10) and rounds (3/5/7/10); clicks Start when ready
3. **Host transfer:** If host disconnects in lobby, next player becomes host automatically
4. **During gameplay:** All players answer the same puzzles simultaneously; round resolves when all answer or timer expires
5. **Disconnect handling:** 30s reconnect window → player "dropped" (score frozen, match continues if ≥2 players remain)
6. **Rankings:** Full placement with tie handling (not just winner/loser) — 🥇🥈🥉 for top 3
7. **Scoreboard:** Dynamic N-player scoreboard during match; dropped players shown dimmed

**Key WS messages (Phase 4 additions):**
- `lobby-state` — Full roster broadcast on every join/leave
- `start-match` — Host-initiated game start
- `player-disconnected` / `player-reconnected` — Replaces singular "opponent" messages
- `player-dropped` — Player eliminated after reconnect timeout
- `gameOver.results[].placement` — Full ranking for all players

### Multiplayer-Ready Design (Phase 1 prep)
These rules apply even during Phase 1 to ensure a smooth Phase 2 transition:

1. **Puzzle data as plain objects** — The game engine receives puzzle data as arguments, never imports it directly. This allows swapping from a local JS file to a `fetch()` call without changing the engine.
2. **Serializable score/result objects** — All game results are plain JSON-serializable objects. No DOM references, no circular structures. This enables POSTing to a server later.
3. **Callback-based answer submission** — The game engine accepts an `onAnswer` callback rather than directly writing to the DOM. This lets multiplayer hook in alongside the single-player UI.
4. **Extensible screen navigation** — The screen router must support adding new screens (leaderboard, lobby, match) without refactoring existing ones.
5. **No global mutable state** — Game state lives in a single state object passed through functions. No top-level `let` variables tracking game progress.

### File Organization
- One module per file, one responsibility per module
- Shared constants (timer duration, scoring multipliers, etc.) go in a `config` object at the top of the relevant file
- Image assets organized in `img/` by category: `img/nature/`, `img/math/`, etc.

---

## 2. Coding Guidelines

### Language & Style
- **Vanilla JavaScript** (ES6+ modules) — no frameworks, no transpilers in Phase 1
- Use `const` by default, `let` when reassignment is needed, never `var`
- Use arrow functions for callbacks, regular functions for top-level declarations
- Use template literals over string concatenation
- Use destructuring where it improves readability

### Naming Conventions
| Element | Convention | Example |
|---|---|---|
| Files | kebab-case | `game-engine.js` |
| Functions | camelCase | `calculateScore()` |
| Constants | UPPER_SNAKE | `MAX_ROUNDS` |
| CSS classes | kebab-case | `.game-screen` |
| CSS variables | kebab-case | `--color-primary` |
| DOM IDs | kebab-case | `#timer-bar` |
| Puzzle IDs | kebab-case | `moon-phases` |

### HTML
- Semantic elements (`<main>`, `<section>`, `<button>`, `<header>`)
- All screens are `<section>` elements toggled via CSS class `active`
- Accessibility: all interactive elements must be keyboard-navigable, images must have `alt` text
- Use `data-*` attributes for JS hooks, not classes

### CSS
- CSS custom properties (variables) for theming (colors, fonts, spacing)
- Mobile-first responsive design — base styles for mobile, `@media` queries for larger screens
- No `!important` except as a last resort
- Use `rem` for typography, `px` for borders/shadows, `%`/`vw`/`vh` for layout
- Animations via CSS transitions/keyframes (not JS) where possible

### JavaScript
- Use `<script type="module">` for ES6 module support
- Each file exports its public API; private helpers stay unexported
- Error handling: wrap `localStorage` calls in try/catch, validate puzzle data on load
- No `document.write()`, no inline event handlers in HTML
- DOM queries cached in variables, not repeated

### Comments
- **Do** comment: non-obvious algorithms, scoring formulas, date-seed logic
- **Don't** comment: obvious code, getters/setters, self-describing function names
- Use JSDoc for public function signatures:
  ```js
  /**
   * Calculate the score for a round.
   * @param {boolean} correct - Whether the answer was correct
   * @param {number} timeMs - Time taken to answer in milliseconds
   * @param {number} streak - Current streak count
   * @returns {object} { points, speedBonus, multiplier, total }
   */
  function calculateScore(correct, timeMs, streak) { ... }
  ```

---

## 3. Testing Strategy

### Coverage Targets

| Category | Target | Measured By |
|---|---|---|
| **Unit tests** | ≥ 90% line coverage on game logic, scoring, auth, DB helpers | Vitest with `--coverage` |
| **API / integration tests** | 100% of endpoints with success + error cases | supertest |
| **WebSocket tests** | All message types (join, answer, roundResult, gameOver, reconnect) | ws client in tests |
| **E2E tests** | All critical user flows (see list below) | Playwright |
| **Overall** | ≥ 80% line coverage across the project | `npm run test:coverage` |

Tests **must pass** before any merge to `main`. The **full validation suite** is:

1. **Lint:** `npm run lint` — ESLint with zero errors (warnings capped at 50)
2. **Unit + integration tests:** `npm test` — Vitest, all must pass
3. **E2E tests:** `npm run test:e2e` — Playwright browser tests

CI runs all three in parallel on PRs that change application code (non-docs changes). Agents must run the full suite locally before pushing.

### Test Framework & Tools

**Current test structure (implemented):**

Tests cover unit, integration, WebSocket, and E2E layers. Run `npm test` for the full vitest suite.

```
tests/
├── helper.js                      # Test utilities: setup/teardown, getAgent, registerUser
│
│  # ── Unit tests ──
├── sqlite-adapter.test.js         # SQLite adapter: init, queries, migrations, transactions
├── mssql-adapter.test.js          # Azure SQL adapter: param rewriting, pool, transactions
├── wal-cleanup.test.js            # DB startup/cleanup, WAL artifacts, journal modes
│
│  # ── Integration / API tests ──
├── auth.test.js                   # Register, login, token, auth enforcement
├── health.test.js                 # Health endpoint: system auth, deep checks
├── puzzles.test.js                # Puzzle API: filtering, auth, shape validation
├── scores.test.js                 # Score submission, leaderboards (free play + multiplayer)
├── achievements.test.js           # Achievement list, unlock triggers
├── matches.test.js                # Match create, join, capacity, history
├── admin-endpoints.test.js        # System API admin: drain/init, role enforcement
├── promotion-and-roles.test.js    # Role changes, admin guardrails
├── submissions.test.js            # Community puzzle submit/review workflows
├── security.test.js               # Security headers, CSP, HTTPS redirect
├── e2e-singleplayer.test.js       # Full free-play + daily challenge API flows
│
│  # ── WebSocket tests ──
├── e2e-multiplayer.test.js        # Room lifecycle: create → join → play → result → rematch
├── nplayer.test.js                # N-player match, disconnect, last-player-standing, ties
├── reconnection.test.js           # Reconnect, host transfer, forfeit edge cases
├── rematch.test.js                # Rematch ready-up, host start, partial rematch
├── spectator.test.js              # Spectator join, blocking, live match updates
│
│  # ── E2E / Browser tests (Playwright) ──
├── e2e/
│   ├── auth.spec.mjs              # Browser auth/register/logout, persistence
│   ├── daily.spec.mjs             # Daily challenge playthrough + completed state
│   ├── freeplay.spec.mjs          # Free-play navigation + game-over flow
│   ├── keyboard.spec.mjs          # Keyboard shortcut navigation
│   ├── leaderboard.spec.mjs       # Leaderboard visibility after scoring
│   ├── helpers.mjs                # Playwright helper: playOneRound()
│   └── global-teardown.mjs        # Playwright global cleanup
│
│  # ── Load / performance tests ──
└── load/
    ├── api-stress.yml             # Artillery API stress test
    ├── websocket-stress.yml       # Artillery WebSocket stress test
    ├── helpers.js                 # Load test helpers
    ├── ws-helpers.js              # WS load test helpers
    └── README.md                  # Load test documentation
```

**Test isolation model:**
Each test file gets its own:
- **Temp directory** — created via `fs.mkdtempSync()`, cleaned up in `afterAll`
- **SQLite database** — via `GWN_DB_PATH` env var pointing to temp dir
- **Express server** — listening on port 0 (OS-assigned random port)
- **supertest agent** — bound to that server instance

This means tests can run in parallel with zero cross-contamination, and worktree
agents can each run `npm test` independently without port or DB conflicts.

**Tools:**
- **Vitest** — Unit + integration test runner (fast, native ESM, built-in coverage)
- **supertest** — HTTP API testing without starting the server
- **Playwright** — Browser-based E2E tests (cross-browser, headless)
- **@vitest/coverage-v8** — Coverage reporting

**npm scripts:**
```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "test:all": "vitest run --coverage && playwright test",
  "lint": "eslint . --max-warnings 50"
}
```

### Unit Tests — What to Cover

**Game engine (`game.js`):**
- Scoring: correct answer = 100 base points, wrong = 0
- Speed bonus: linear decay from 100 → 0 over timer duration
- Streak multiplier: x1 (0-2), x1.5 (3-5), x2 (6+)
- Streak resets on wrong answer
- Edge cases: answer at 0ms, answer at timeout, negative values

**Daily challenge (`daily.js`):**
- Same date always yields same puzzle (deterministic)
- Different dates yield different puzzles
- Date boundary behavior (midnight UTC)

**Puzzle validation (`puzzles.js`):**
- All puzzles have required fields: id, category, difficulty, type, sequence, answer, options, explanation
- Answer is always in options array
- Options has exactly 4 items
- Sequence has 3-6 items
- No duplicate puzzle IDs
- Difficulty is 1, 2, or 3

**Auth middleware (`auth.js`):**
- Valid JWT token → sets req.user with id, username, role
- Expired JWT → 401
- Malformed JWT → 401
- Valid API key → sets req.user as system
- Invalid API key → 401
- No auth header → 401
- requireSystem rejects non-system users with 403
- optionalAuth continues without user when no token provided

### Integration Tests — API Endpoints

Every endpoint must have tests for:
1. **Happy path** — correct request returns expected response
2. **Auth enforcement** — request without auth returns 401
3. **Validation** — bad input returns 400 with meaningful error
4. **Edge cases** — empty body, missing fields, boundary values

**Specific coverage:**

| Endpoint | Tests |
|---|---|
| `POST /api/auth/register` | Success, duplicate username (409), short password (400), rate limit (429) |
| `POST /api/auth/login` | Success, wrong password (401), non-existent user (401), rate limit (429) |
| `GET /api/auth/me` | Valid token, expired token, no token |
| `POST /api/scores` | Submit score, invalid mode (400), no auth (401) |
| `GET /api/scores/leaderboard` | All/weekly/daily periods, requires auth, limit capping |
| `GET /api/scores/me` | User's scores + stats, no auth (401) |
| `POST /api/matches` | Create room, no auth (401) |
| `POST /api/matches/join` | Join room, invalid code (404), no auth (401) |
| `GET /api/matches/:id` | Match status, no auth (401) |
| `GET /api/matches/history` | Match history, no auth (401) |
| `GET /api/health` | System API key → deep health JSON, JWT user → 403, no auth → 401 |

**WebSocket tests:**
- Connect with valid JWT token
- Reject connection with invalid token
- Join room flow: join → matched event
- Full match: both players answer all rounds → gameOver
- N-player match: 4 players join → host starts → all answer → full rankings
- Forfeit: one player disconnects → dropped after 30s → match continues with remaining
- Last player standing: all but one disconnect → match ends, last player wins
- Reconnection: disconnect + reconnect within 30s → resume match with full state restore
- Host transfer: host disconnects in lobby → next player becomes host
- Full room: join when room at max_players → error response
- Invalid message types → error response

### E2E Tests — Critical User Flows

Run with Playwright against a live server instance (started in test setup):

1. **Free play flow:**
   - Load home screen → click Free Play → select category → play 10 rounds → see game over → verify score displayed

2. **Daily challenge flow:**
   - Load home → click Daily Challenge → answer → see result → verify share text → reload → verify locked (can't replay)

3. **Auth flow:**
   - Register new user → verify logged in → reload page → verify still logged in (token persisted) → log out

4. **Multiplayer flow:**
   - Register 2+ users → User A creates room (configures max players, rounds) → Users B-D join → Host starts → all play rounds → full rankings displayed with placements

5. **Leaderboard flow:**
   - Register → play free play → submit score → navigate to leaderboard → verify score appears

6. **Keyboard navigation:**
   - Navigate entire game using only keyboard (Tab, Enter, 1-4 number keys)

### Test Runner

Tests use Vitest with supertest for API and ws for WebSocket testing. Run with `npm test`. Each suite gets an isolated temp database and random port. Tests are safe to run in parallel across worktrees.

### Phase 2 — Automated Tests
- Use Vitest as the test framework (fast, ESM-native, built-in coverage)
- API endpoint tests with `supertest`
- WebSocket integration tests with `ws` client
- `npm test` runs the full unit + integration suite
- `npm run test:coverage` reports line/branch/function coverage
- Tests must pass before merging any PR

### Phase 3 — Container & Deployment Tests
- **Container tests:** `docker compose up` → verify health endpoint responds, game loads, WebSocket connects
- **Staging smoke tests:** Automated in CI/CD after staging deploy — hit key endpoints, verify 200 responses
- **Prod verification tests:** After production deploy — health check + smoke tests, auto-rollback on failure
- **Approval gate:** Manual approval required before promoting staging → production (GitHub Environment protection rules)
- **Health monitor:** GitHub Actions cron job every 5 minutes validates production health, creates issues on failure

### Test Data Management
- Tests use an **isolated temp-directory SQLite database** via `GWN_DB_PATH` — never the real `data/game.db`
- `tests/helper.js` creates the schema and seeds test data before each test suite
- Each test suite cleans up after itself — no cross-test contamination
- E2E tests use a separate server instance on a random port

---

## 4. Logging Conventions

The project uses **Pino** for structured JSON logging (`server/logger.js` singleton). All server code must use the logger — never `console.*` (except in `config.js` and the early bootstrap path in `telemetry.js`, where the logger is not yet available due to load order).

### Log Levels

| Level | When to use | Example |
|---|---|---|
| `fatal` | Process is about to crash — unrecoverable errors | Uncaught exception handler, out-of-memory |
| `error` | Operation failed and could not be recovered | 5xx response, DB write failure, WebSocket crash |
| `warn` | Handled anomaly that deserves attention | 4xx client error, rate limit hit, auth failure, deprecated usage |
| `info` | Normal operational events worth recording | Server start, DB initialized, user registered, match created |
| `debug` | Diagnostic detail useful during development | Route handler entry/exit, cache hit/miss, query timing |
| `trace` | Ultra-verbose, rarely enabled | Full request/response bodies, internal state dumps |

**Defaults per environment:**
- **development:** `debug` (with pino-pretty for human-readable output)
- **test:** `silent` (suppress all output during test runs)
- **production / staging:** `info` (JSON, machine-parseable)
- Override with `LOG_LEVEL` env var (validated: `fatal | error | warn | info | debug | trace | silent`)

### Structured Context Guidelines

Always pass a context object as the **first** argument to log methods, followed by a human-readable message:

```js
logger.info({ userId, matchId, rounds: 5 }, 'Match created');
logger.warn({ err, status: 429, ip: req.ip }, 'Rate limit exceeded');
logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled request error');
```

**What to include in context objects:**
- `err` — the Error instance (Pino serialises it with message + stack automatically)
- `userId` / `username` — who triggered the event
- `matchId` / `roomCode` — relevant entity identifiers
- `method`, `url`, `status` — HTTP request context
- `requestId` — from `req.id` (assigned by pino-http)
- `remoteAddress` — `req.ip` for rate-limiting / abuse tracking (logged per-request, not stored long-term)
- Duration/timing values for performance-sensitive operations

### Sensitive Data Handling

**Redacted automatically** (via Pino `redact` config with `remove: true`):
- `req.headers.authorization`
- `req.headers.cookie`
- `req.headers["x-api-key"]`
- `req.headers["x-access-token"]`
- `res.headers["set-cookie"]`

**Never log these manually:**
- Passwords, password hashes, or JWT secrets
- Full JWT tokens (log a truncated prefix if needed for debugging)
- Database connection strings
- Raw request bodies that may contain user credentials
- PII beyond username (no email, no IP addresses persisted to database, etc.)

### Trace ID Correlation

When OpenTelemetry is active (staging/production), the Pino mixin automatically attaches `trace_id` and `span_id` (snake_case) to each log entry via the OTel context. This allows correlating logs with distributed traces in Azure Monitor / Application Insights.

- In development: no trace IDs by default (OTel SDK only activates when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set)
- In staging/production: trace IDs appear automatically on every request-scoped log line (connection string is always set)
- Manual log calls outside request scope won't have trace IDs unless you explicitly propagate context
- The bootstrap only enables the HTTP and Express instrumentations; startup/shutdown failures are reported via the early console bootstrap path instead of surfacing as unhandled promise rejections

### Client Error Reporting

The `POST /api/telemetry/errors` endpoint accepts client-side errors (no auth required):
- Rate limited: 10 requests/minute per IP
- Required field: `message` (string)
- Optional fields: `type`, `source`, `lineno`, `colno`, `stack`
- Missing, empty, or non-JSON bodies return `400` with a validation error instead of throwing
- Logged at `warn` level with `{ component: 'client' }` context
- Authenticated requests include `userId` in the log entry
- Client JS hooks: `window.onerror` and `unhandledrejection` handlers report errors (max 10 per minute, sliding window)

### Request Logging

Pino-http middleware logs every request/response automatically, with these exceptions (auto-logging ignore list):
- `/api/health` and `/healthz` — health probes (too noisy)
- `/api/telemetry/*` — telemetry endpoints (avoid recursion)
- Static file extensions (`.css`, `.js`, `.map`, `.ico`, `.png`, etc.)

In test mode, auto-logging is fully disabled to keep test output clean.

---

## 5. Git Workflow

### Repository Setup
- Initialize with `git init` at project root
- `.gitignore` configured for Node.js, OS files, and database files
- Main branch: `main`

### Commit Conventions
Use **conventional commits** for clear, parseable history:

```
<type>: <short description>

[optional body with more detail]
```

**Types:**
| Type | When to use |
|---|---|
| `feat` | New feature or functionality |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior change |
| `style` | CSS/formatting changes (no logic change) |
| `test` | Adding or updating tests |
| `docs` | Documentation changes |
| `chore` | Config, dependencies, tooling |

**Examples:**
```
feat: add timer countdown with visual progress bar
fix: prevent daily challenge replay after page refresh
refactor: extract scoring logic into pure functions
docs: add puzzle data format to INSTRUCTIONS.md
chore: initialize npm project with express and dependencies
```

### When to Commit
Commit after every meaningful, working change. Specifically:
- After completing each todo/step in the plan
- After adding a new screen or feature
- After fixing a bug
- After adding tests
- **Do not** commit broken/half-done work
- **All commits go on feature branches** — never directly on `main`

### Agent Progress Reporting

**All task work happens in background agents on worktrees — never in the main session.** The orchestrating agent dispatches work to background task agents, each running in its own worktree slot. Background agents handle the full lifecycle autonomously: code changes → validation → PR creation → Copilot review loop. The orchestrating agent only intervenes to merge approved PRs.

Background agents **must** report progress to the orchestrating agent:
- **On start:** "Starting task X in wt-N on branch feat/<name>"
- **On milestone:** "Task X: completed <step>, running validation..."
- **On validation pass:** "Task X: lint ✓ test ✓ e2e ✓ — creating PR"
- **On PR created:** "Task X: PR #<N> created, requesting Copilot review"
- **On review loop:** "Task X: Copilot review round <N> — fixing <count> issues"
- **On ready:** "Task X: PR #<N> ready for merge (Copilot approved, CI green)"

The orchestrating agent **must actively relay progress to the user** — never dispatch tasks and wait silently:
- Poll background agents periodically and report milestone updates
- Relay key status changes: validation passed, PR created, review in progress, ready for merge
- When multiple tasks run in parallel, provide a summary table of all task statuses
- On completion, report the result and ask for next steps (e.g., "Shall I merge?")

The orchestrating agent **waits for "ready for merge"** before merging and must not proceed with dependent work until the PR is merged and `main` is pulled.

### Branch Strategy

**All changes go through pull requests. No exceptions. No direct commits to `main`.**

- Feature branches: `feat/<step-id>` (e.g., `feat/puzzle-expansion`, `feat/mp-game-logic`)
- Every PR must pass the **full validation suite** before merge:
  1. **Lint:** `npm run lint`
  2. **Unit + integration tests:** `npm test` (vitest)
  3. **E2E tests:** `npm run test:e2e`
- Branch protection rules on `main`:
  - Require PR with review before merging
  - Require CI status checks to pass (`lint`, `test`, `e2e`) — CI uses `paths-ignore` for docs-only PRs; if branch protection requires these checks, a separate always-on workflow or conditional job approach may be needed
  - No force pushes
  - No direct commits

### Parallel Agent Workflow

**All worktree work runs as background tasks.** The orchestrating agent launches each task agent in the background, continues with other work or launches additional parallel tasks, and is notified when each completes. The orchestrating agent never blocks waiting for a worktree agent — it monitors progress via notifications and acts on "ready for merge" signals.

When running multiple AI agents in parallel to implement independent tasks:

**1. Worktree slots (fixed folders, reusable across tasks):**

Use **fixed-name worktree slots** (`wt-1` through `wt-4`) to avoid filesystem permission
re-approval every time a new task starts. The branch name carries the task meaning —
the folder name is just a stable slot.

**Worktree root folder naming convention:**

The worktree root folder is derived from the clone folder name to ensure
multiple clones of the same repo can coexist without collisions:

```
gwn<suffix>-worktrees
```

Where `<suffix>` is the remaining text after removing the repo name from the clone
folder name (including any separator like `_`). If the clone folder name matches
the repo name exactly, `<suffix>` is empty.

| Clone folder | Repo name | Suffix | Worktree root |
|---|---|---|---|
| `guesswhatisnext` | `guesswhatisnext` | *(empty)* | `gwn-worktrees` |
| `guesswhatisnext_copilot2` | `guesswhatisnext` | `_copilot2` | `gwn_copilot2-worktrees` |
| `guesswhatisnext_test` | `guesswhatisnext` | `_test` | `gwn_test-worktrees` |

This keeps each agent's worktrees isolated even when multiple Copilot sessions
work on the same repo simultaneously.

```powershell
# One-time setup: create worktree directory alongside the main repo
# (replace <suffix> per the naming convention above)
mkdir C:\src\gwn<suffix>-worktrees

# Create fixed slots with task-specific branches
git worktree add -b feat/puzzle-expansion C:\src\gwn<suffix>-worktrees\wt-1 main
git worktree add -b feat/azure-infra      C:\src\gwn<suffix>-worktrees\wt-2 main
git worktree add -b feat/mp-game-logic    C:\src\gwn<suffix>-worktrees\wt-3 main
git worktree add -b feat/mp-lobby-ui      C:\src\gwn<suffix>-worktrees\wt-4 main

# Check which slot has which branch
git worktree list
```

**Recycling a slot for a new task:**
```powershell
cd C:\src\guesswhatisnext<suffix>

# Remove the old branch from the slot (keeps the folder)
git worktree remove C:\src\gwn<suffix>-worktrees\wt-1 --force
git branch -d feat/old-task

# Reassign the slot to a new branch
git worktree add -b feat/new-task C:\src\gwn<suffix>-worktrees\wt-1 main
```

| Slot | Path | Port | Purpose |
|---|---|---|---|
| main | `C:\src\guesswhatisnext<suffix>` | 3000 | Primary repo, sequential work |
| wt-1 | `C:\src\gwn<suffix>-worktrees\wt-1` | 3001 | Parallel agent slot 1 |
| wt-2 | `C:\src\gwn<suffix>-worktrees\wt-2` | 3002 | Parallel agent slot 2 |
| wt-3 | `C:\src\gwn<suffix>-worktrees\wt-3` | 3003 | Parallel agent slot 3 |
| wt-4 | `C:\src\gwn<suffix>-worktrees\wt-4` | 3004 | Parallel agent slot 4 |

**2. Agent environment setup (each worktree):**

Every worktree is a full code checkout but lacks `node_modules/` and `data/`.
Agents must bootstrap their worktree before working:

```powershell
cd C:\src\gwn<suffix>-worktrees\wt-X

# Install dependencies
npm install

# Set unique port (avoid port 3000 conflicts between agents)
$env:PORT = "300X"   # wt-1 → 3001, wt-2 → 3002, etc.

# Database is auto-created on first server start at data/game.db
# Each worktree gets its own independent database — full isolation
```

**3. Testing in worktrees:**

Each worktree is fully self-contained for testing:
- **Unit/integration tests**: `npm test` — uses temp DB via `GWN_DB_PATH` env var, random port via `supertest` (port 0). Tests run in complete isolation with no shared state.
- **Manual verification**: `$env:PORT=300X; node server/index.js` — each worktree uses its own port and database.
- **DB isolation**: The test helper (`tests/helper.js`) creates a temp directory per test suite with its own SQLite database. No cross-test or cross-worktree contamination.

Test helper details:
```
tests/helper.js
├── setup()     → creates temp dir, sets GWN_DB_PATH, boots server on port 0
├── teardown()  → closes DB, stops server, removes temp dir
├── getAgent()  → returns supertest agent bound to test server
└── registerUser() → helper to create auth'd test user
```

**4. Commit, push, and PR workflow:**

All work happens in worktree branches. Agents **never** merge to main directly.

```
Agent in wt-X:
  1. Work on feat/<task-name> branch
  2. Run full validation suite:
     npm run lint && npm test && npm run test:e2e
  3. git add -A && git commit
  4. git push -u origin feat/<task-name>
  5. Create PR:
     gh pr create --base main --head feat/<task-name> --title "<title>" --body "<description>"
  6. Request Copilot review:
     gh pr edit <PR#> --add-reviewer "@copilot"
  7. Enter Copilot review loop (see below)
  8. Report to orchestrating agent: "PR #<N> ready for merge"
```

The **main orchestrating agent** merges PRs and pulls:
```
Main agent (after wt-X reports PR ready):
  gh pr merge <PR#> --squash --delete-branch
  cd C:\src\guesswhatisnext
  git pull
```

**Merge ordering:** First-done merges first. Each subsequent agent may need to
rebase or merge main before pushing:
```
Agent in wt-Y (if main has moved since branch creation):
  git fetch origin main

  # Option A: merge (preserves history, normal push)
  git merge origin/main --no-edit
  npm run lint && npm test && npm run test:e2e
  git push

  # Option B: rebase (linear history, requires force-push)
  git rebase origin/main
  npm run lint && npm test && npm run test:e2e
  git push --force-with-lease
```

**10. Copilot PR Review Policy:**

Every PR **must** be reviewed by GitHub Copilot. The review loop continues until Copilot reports **zero issues**. No PR is merged with unresolved Copilot feedback.

**Requesting review (requires gh CLI ≥ 2.88.0):**
```powershell
gh pr edit <PR#> --add-reviewer "@copilot"
```

**Review loop (mandatory — repeat until clean):**
1. Read all review comments and suggestions
2. Assess each comment — categorize as **Fix**, **Skip**, or **Accept suggestion**
3. For each comment, reply with the decision and rationale
4. Fix valid issues, commit, and push
5. Resolve all threads (fixed or acknowledged)
6. Re-request Copilot review: `gh pr edit <PR#> --add-reviewer "@copilot"`
7. **Repeat from step 1** until Copilot approves with no new comments
8. Only then report PR as ready for merge

**Assessment criteria:**
- **Fix**: Real bugs, security issues, correctness problems, missing error handling that could cause silent failures
- **Skip**: Cosmetic concerns, extremely unlikely edge cases (e.g., port 0), style preferences already covered by lint, or by-design decisions
- **Accept suggestion**: When Copilot provides a complete code suggestion that is correct and improves the code

**Replying to review comments (REST API):**
```powershell
# Reply to a specific review comment thread
gh api repos/henrik-me/guesswhatisnext/pulls/{PR#}/comments/{COMMENT_ID}/replies --method POST -f "body=YOUR_REPLY"
```

**Reply message conventions:**
- **Fixed**: Reference the commit hash and describe what changed. Example: "Fixed in commit abc1234: replaced req.connection with req.socket throughout."
- **Acknowledged (by design)**: Explain why the current approach is intentional. Example: "Acknowledged — telemetry.js must load before logger.js, so console.* is intentional. Comment on line 47 explains this."
- **Not applicable**: When the reviewer's observation is factually incorrect about the current code. Example: "Verified: @opentelemetry/api IS listed in package.json dependencies."
- **Duplicate**: Reference the original thread. Example: "Duplicate of thread on line 187 — see that thread for the full rationale."

**Resolving review threads (GraphQL API):**
```powershell
# Get all unresolved thread IDs
gh api graphql -f query='{ repository(owner: "henrik-me", name: "guesswhatisnext") { pullRequest(number: {PR#}) { reviewThreads(first: 100) { nodes { id isResolved comments(first: 1) { nodes { databaseId path } } } } } } }'

# Resolve a single thread
gh api graphql -f query='mutation { resolveReviewThread(input: { threadId: "THREAD_ID" }) { thread { isResolved } } }'
```

**Important:** Always reply BEFORE resolving. A resolved thread without a reply looks like the comment was dismissed without consideration. Every thread must have a reply explaining the disposition (fixed, acknowledged, or not applicable) before being resolved.

**Large-diff PR behavior:** On PRs with large diffs, Copilot may re-post comments on unchanged lines across multiple review rounds. When comments reference code that was already fixed in a previous commit, reply with the fix commit hash and resolve. Do not keep iterating — resolve stale threads after verifying the fix is in the current code.

**Agents creating PRs must request Copilot review as part of their PR creation step.**

**5. Merge order and conflict resolution:**
- Merge zero-conflict branches first (e.g., new-files-only tasks like infra)
- For branches that touch shared files (`index.html`, `app.js`, `style.css`):
  - Merge one at a time
  - After each merge, run `npm test` to verify
  - Resolve conflicts manually if needed (typically additive — HTML sections, CSS rules, route registrations)
- **Never run in parallel**: tasks that modify the same function body

**6. Worktree slot cleanup (between task batches):**
```powershell
# Remove all worktrees but keep the folder structure for reuse
git worktree remove C:\src\gwn<suffix>-worktrees\wt-1 --force
git worktree remove C:\src\gwn<suffix>-worktrees\wt-2 --force
# ... etc

# Delete merged branches
git branch -d feat/puzzle-expansion feat/azure-infra

# Prune stale worktree references
git worktree prune
```

**7. High-conflict files to watch:**
These files are modified by almost every feature — expect merge work:
- `server/index.js` — route registration, middleware setup
- `server/app.js` — app factory, route wiring
- `server/db/schema.sql` — table definitions
- `server/db/connection.js` — migrations, seeding
- `public/index.html` — new screens, buttons
- `public/js/app.js` — event handlers, screen navigation
- `public/css/style.css` — new component styles
- `server/ws/matchHandler.js` — multiplayer logic

**8. Ideal parallel grouping:**
Group tasks to minimize file overlap:
- ✅ Backend-only tasks (different route files) can safely parallelize
- ✅ Tasks creating only new files (infra, new routes) are always safe
- ⚠️ Tasks that both add HTML screens will conflict in `index.html`
- ⚠️ Tasks that both modify `matchHandler.js` should be sequential
- ❌ Never parallelize two tasks that both rewrite the same function

**9. Lessons learned from parallel execution:**

| Issue | Cause | Prevention |
|---|---|---|
| Agents commit each other's changes | Shared worktree, agents run `git add -A` | Use worktrees — each has its own filesystem |
| Health endpoint bundled into wrong commit | Both modified `server/index.js` | Separate worktrees eliminate this entirely |
| Agents compete for port 3000 | Each agent starts server to verify | Assign unique ports per worktree (300X) |
| Schema migrations conflict | Multiple agents add columns/tables | Review combined schema after all merges |
| Test file merge conflicts | Multiple agents add test files | Tests are additive — auto-merge usually works |
| Folder permissions re-prompted | Task-named worktree folders change each time | Use fixed slots (wt-1..wt-4), recycle with new branches |

### Deployment Environments
| Environment | Trigger | Approval | Infrastructure | Rollback |
|---|---|---|---|---|
| **Local** | `docker compose up` or `npm start` | None | Developer machine | N/A |
| **Ephemeral staging** | Hourly cron (if main has new commits) | Automatic | GitHub Actions (container in workflow) | N/A (ephemeral) |
| **Azure staging** | After ephemeral validation passes | Manual (GitHub Environment reviewers) | Azure Container Apps (Consumption) — gwn-staging | Redeploy previous SHA-tagged image |
| **Production** | After Azure staging smoke tests pass | Manual (GitHub Environment reviewers) | Azure Container Apps (Consumption) — gwn-prod | Auto-rollback to previous SHA-tagged image |

### CI/CD Pipeline Overview

**PR checks (ci.yml):** Lint and test run in parallel on every pull request. No Docker build — fast feedback.

**Staging pipeline (staging-deploy.yml — planned):** Runs hourly via cron. Checks if `main` has new commits since last run. If yes: fast-forwards `release/staging` branch to main HEAD, builds Docker image, pushes to GHCR, runs ephemeral smoke tests in GitHub Actions container. With manual approval, deploys to Azure staging.

**Production pipeline (prod-deploy.yml — planned):** Manually triggered (`workflow_dispatch`) from `release/staging` branch. Can only run when the staging environment is green. Deploys the same image already validated in staging to production. Verifies health, auto-rolls back on failure.

**Push to `main`:** Does **not** trigger any deployment. All deployments flow through the staging pipeline first.

**Legacy pipeline (ci-cd.yml):** Will be gutted — deploy/staging/production jobs removed. Push-to-main no longer deploys anywhere.

### Rollback Policy
- Docker images are tagged with git SHA (`ghcr.io/henrik-me/guesswhatisnext:<sha>`) — every version is recoverable
- Post-deploy verification runs health check + smoke tests against production
- On failure: auto-rollback to previous image tag + GitHub issue created with `deployment-failure` label
- Manual rollback available via `az containerapp update --image <previous-tag>`
- **Database migrations must be backward-compatible** (additive only: new columns with defaults, new tables) to ensure rollback safety

---

## 6. Puzzle Authoring Guide

When adding new puzzles to `puzzles.js`:

1. Every puzzle must have: `id`, `category`, `difficulty` (1–3), `type`, `sequence`, `answer`, `options`, `explanation`
2. `answer` must appear exactly once in `options`
3. `options` must have exactly 4 items
4. `sequence` must have 3–6 items
5. `difficulty` guide:
   - **1**: Obvious patterns (counting, colors, alphabet)
   - **2**: Requires domain knowledge (moon phases, music scales)
   - **3**: Lateral thinking or obscure patterns
6. For image puzzles: paths are relative to `img/` directory
7. Write a clear `explanation` — players see it after answering

---

## 7. Performance & Accessibility

### Performance
- No heavy libraries — total JS payload should stay under 50KB (Phase 1)
- Images: use compressed formats (WebP preferred, PNG fallback), max 200KB each
- Preload next puzzle's images while current round is active

### Accessibility
- Minimum contrast ratio: 4.5:1 for text
- All buttons/options have visible focus indicators
- Screen reader support: ARIA labels on game state changes
- Reduced motion: respect `prefers-reduced-motion` media query
- Emoji sequences: include `aria-label` describing the item for screen readers

---

## 8. Tools & Frameworks Evaluated

This section documents tools and frameworks that were evaluated for the project, including those adopted and those deferred.

### Adopted

| Tool | Purpose | Notes |
|---|---|---|
| Express 5 | HTTP server + API routes | v5.2.1 — note `/{*path}` wildcard syntax (not `*`) |
| better-sqlite3 | SQLite driver | WAL mode, synchronous API, good for single-server |
| ws | WebSocket server | Lightweight, no socket.io overhead |
| bcryptjs | Password hashing | Pure JS, 10 rounds |
| jsonwebtoken | JWT auth tokens | 7-day expiry, secret from env var |
| Docker | Containerization | Same Dockerfile for local dev, staging, and production |
| GitHub Container Registry | Image storage | Free, integrated with GitHub Actions |
| Azure Container Apps | Hosting (staging + prod) | Consumption plan, scale-to-zero, WebSocket support |
| GitHub Actions | CI/CD + health monitoring | Build, deploy, smoke tests, cron-based health checks |
| ESLint | Linting | Flat config (`eslint.config.mjs`), `@eslint/js` recommended + custom rules |

### Evaluated & Deferred

#### Squad (bradygaster/squad) — Multi-Agent AI Orchestration

**What it is:** An AI development team orchestration framework for GitHub Copilot. Defines specialist agents (Lead, Frontend, Backend, Tester) that persist in the repo as `.squad/` files, accumulate knowledge across sessions, run tasks in parallel, and route work automatically.

**Repository:** https://github.com/bradygaster/squad

**Status:** Alpha (v0.9.1 as of 2026-03-25). APIs and CLI commands may change between releases.

**Why deferred:**
1. **Project scale** — Single developer with well-defined tasks and clear dependency chains. Squad is designed for larger teams with many parallel workstreams.
2. **Alpha stability** — Breaking changes expected between releases.
3. **Documentation overlap** — INSTRUCTIONS.md, CONTEXT.md, and plan.md already serve the purpose of Squad's decision logging and agent knowledge persistence.
4. **Setup cost vs. benefit** — Configuring agents, routing rules, and casting takes time that doesn't proportionally accelerate a 12-task backlog.

**Revisit when:**
- Squad reaches beta/stable
- Project gains multiple active contributors
- We enter an open-ended feature phase without clear dependency chains
- Puzzle content expansion (step 28) could benefit from a specialized "Content Creator" agent
