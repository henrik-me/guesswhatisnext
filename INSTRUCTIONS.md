# Development Instructions

This document defines architecture decisions, coding standards, testing strategy, and git workflow for the **Guess What's Next** project.

---

## 1. Architecture Principles

### Software Architecture

```
guesswhatisnext/
├── public/                         # Client (served as static files)
│   ├── index.html                  # Game shell — all screens (SPA)
│   ├── css/style.css               # Styling, responsive, animations, themes
│   ├── js/
│   │   ├── app.js                  # Entry point, screen nav, multiplayer UI, auth
│   │   ├── game.js                 # Core game engine (scoring, timer, rounds)
│   │   ├── puzzles.js              # Client-side puzzle data (22 puzzles)
│   │   ├── daily.js                # Date-seeded daily challenge logic
│   │   └── storage.js              # LocalStorage persistence
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
│   ├── ws/matchHandler.js          # WebSocket head-to-head match engine
│   ├── db/
│   │   ├── schema.sql              # SQLite table definitions
│   │   └── connection.js           # DB init + query helpers
│   └── middleware/auth.js          # JWT + API key verification middleware
├── data/                           # SQLite database (auto-created, git-ignored)
├── Dockerfile                      # Production container image (Phase 3)
├── docker-compose.yml              # Local container dev environment (Phase 3)
├── .github/workflows/              # CI/CD + health monitor (Phase 3)
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

Tests **must pass** before any merge to `main`. CI/CD pipeline runs the full suite on every push.

### Test Framework & Tools

```
test/
├── unit/
│   ├── scoring.test.js       # Score calculation, speed bonus, streak multiplier
│   ├── daily.test.js         # Date-seed determinism, puzzle selection
│   ├── puzzles.test.js       # Puzzle data validation (schema, uniqueness)
│   └── auth.test.js          # JWT generation/verification, API key auth, role checks
├── integration/
│   ├── auth.api.test.js      # Register, login, rate limiting, token refresh
│   ├── scores.api.test.js    # Score submission, leaderboard queries, auth enforcement
│   ├── matches.api.test.js   # Room create/join, match status, history
│   ├── health.api.test.js    # Health endpoint (system auth required, deep checks)
│   └── websocket.test.js     # Match flow: join → rounds → answer → result → gameOver
├── e2e/
│   ├── singleplayer.spec.js  # Free play + daily challenge full flows
│   ├── multiplayer.spec.js   # Create room → join → play match → result
│   ├── leaderboard.spec.js   # Register → play → check leaderboard
│   └── auth-flow.spec.js     # Register → login → access protected routes
└── helpers/
    ├── setup.js              # Test DB initialization, cleanup
    ├── fixtures.js           # Test users, puzzles, scores
    └── ws-client.js          # WebSocket test client helper
```

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
  "test:all": "vitest run --coverage && playwright test"
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
- Forfeit: one player disconnects → opponent wins
- Reconnection: disconnect + reconnect within 30s → resume match
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
   - Register 2 users → User A creates room → User B joins room → both play rounds → match result displayed

5. **Leaderboard flow:**
   - Register → play free play → submit score → navigate to leaderboard → verify score appears

6. **Keyboard navigation:**
   - Navigate entire game using only keyboard (Tab, Enter, 1-4 number keys)

### Phase 1 — Manual + Lightweight Unit Tests
Since there's no build system, testing is pragmatic:

1. **Unit tests for pure logic** — Create a `test/` folder with simple test files that import game engine functions and assert expected outputs. Run in the browser via a `test/index.html` page.
   ```
   test/
   ├── index.html          # Test runner page
   ├── test-scoring.js     # Score calculation tests
   ├── test-daily.js       # Date-seed determinism tests
   └── test-puzzles.js     # Puzzle data validation
   ```

2. **What to test:**
   - Scoring: correct/wrong answers, speed bonus at various times, streak multipliers
   - Daily challenge: same date always yields same puzzle, different dates yield different puzzles
   - Puzzle validation: all puzzles have required fields, answer is in options, no duplicates
   - Timer: countdown starts, pauses, resets correctly

3. **Manual testing checklist:**
   - All screens navigate correctly
   - Timer visual matches actual countdown
   - Score displays update in real-time
   - LocalStorage persists across page reload
   - Daily challenge locks after one attempt
   - Works on mobile viewport (Chrome DevTools responsive mode)
   - Keyboard navigation works for all interactive elements

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
- Tests use an **isolated in-memory SQLite database** (`:memory:`) — never the real `data/game.db`
- `helpers/setup.js` creates the schema and seeds test data before each test suite
- `helpers/fixtures.js` exports reusable test users, puzzles, and scores
- Each test suite cleans up after itself — no cross-test contamination
- E2E tests use a separate server instance on a random port

---

## 4. Git Workflow

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
- **Do not** commit broken/half-done work to `main`

### Branch Strategy
- Phase 1: Work directly on `main` (single developer, rapid iteration)
- Phase 2: Feature branches (`feat/leaderboard`, `feat/websocket`) with PR merges
- Phase 3: Feature branches with CI/CD pipeline — push to `main` auto-deploys to staging, manual approval promotes to production

### Deployment Environments
| Environment | Trigger | Approval | Infrastructure | Rollback |
|---|---|---|---|---|
| **Local** | `docker compose up` or `npm start` | None | Developer machine | N/A |
| **Staging** | Push to `main` | Automatic | Azure Container Apps (Consumption) — gwn-staging | Redeploy previous SHA-tagged image |
| **Production** | After staging smoke tests pass | Manual (GitHub Environment reviewers) | Azure Container Apps (Consumption) — gwn-prod | Auto-rollback to previous SHA-tagged image |

### Rollback Policy
- Docker images are tagged with git SHA (`ghcr.io/henrik-me/guesswhatisnext:<sha>`) — every version is recoverable
- Post-deploy verification runs health check + smoke tests against production
- On failure: auto-rollback to previous image tag + GitHub issue created with `deployment-failure` label
- Manual rollback available via `az containerapp update --image <previous-tag>`
- **Database migrations must be backward-compatible** (additive only: new columns with defaults, new tables) to ensure rollback safety

---

## 5. Puzzle Authoring Guide

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

## 6. Performance & Accessibility

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

## 7. Tools & Frameworks Evaluated

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
