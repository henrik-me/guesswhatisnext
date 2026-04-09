# Extracted from INSTRUCTIONS.md — Phase/Status Content

> These sections were identified as project state, phase-specific work, status snapshots,
> or decision logs rather than timeless development guidelines. They belong in CONTEXT.md.

---

## Architecture Phase Labels

The following headings in INSTRUCTIONS.md § 1 carry phase labels that should be removed
when these sections are cleaned up (the diagrams themselves are valid architecture docs):

- `### System Architecture (Current — Phase 2)` → should be `### System Architecture`
- `### Deployment Architecture (Phase 3)` → should be `### Deployment Architecture`

---

## Multiplayer Architecture (Phase 4)

*(INSTRUCTIONS.md lines 137–154)*

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

---

## Multiplayer-Ready Design (Phase 1 prep)

*(INSTRUCTIONS.md lines 156–163)*

These rules apply even during Phase 1 to ensure a smooth Phase 2 transition:

1. **Puzzle data as plain objects** — The game engine receives puzzle data as arguments, never imports it directly. This allows swapping from a local JS file to a `fetch()` call without changing the engine.
2. **Serializable score/result objects** — All game results are plain JSON-serializable objects. No DOM references, no circular structures. This enables POSTing to a server later.
3. **Callback-based answer submission** — The game engine accepts an `onAnswer` callback rather than directly writing to the DOM. This lets multiplayer hook in alongside the single-player UI.
4. **Extensible screen navigation** — The screen router must support adding new screens (leaderboard, lobby, match) without refactoring existing ones.
5. **No global mutable state** — Game state lives in a single state object passed through functions. No top-level `let` variables tracking game progress.

---

## Current Test Structure Snapshot

*(INSTRUCTIONS.md lines 245–262)*

**Current test structure (implemented):**
```
tests/
├── helper.js                 # Test utilities: setup/teardown, getAgent, connectWS
├── auth.test.js              # Register, login, token, auth enforcement (10 tests)
├── health.test.js            # Health endpoint: system auth, deep checks (3 tests)
├── puzzles.test.js           # Puzzle API: filtering, auth, shape validation (6 tests)
├── scores.test.js            # Score submission, leaderboard, multiplayer LB (8 tests)
├── achievements.test.js      # Achievement list, unlock triggers (4 tests)
├── matches.test.js           # Match create, join, capacity, history, get by ID (9 tests)
├── e2e-singleplayer.test.js  # Free play + daily challenge full flows (4 tests)
├── e2e-multiplayer.test.js   # Room create → join → play → result → rematch (10 tests)
├── nplayer.test.js           # 3-player match, disconnect, ties (4 tests)
├── reconnection.test.js      # Reconnect, host transfer, notifications (4 tests)
└── rematch.test.js           # Rematch ready-up, host start, partial rematch (4 tests)
```

**Total: 66 tests across 11 suites — all passing.**

---

## Phase-Specific Testing Plans

*(INSTRUCTIONS.md lines 387–401)*

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

---

## Phase References in Branch Strategy

*(INSTRUCTIONS.md lines 455–456)*

- Phase 1–2: Work directly on `main` (single developer, rapid iteration)
- Phase 3+: All changes via **pull requests** to `main` — no direct commits to main

---

## Lessons Learned from Parallel Execution

*(INSTRUCTIONS.md lines 676–685)*

| Issue | Cause | Prevention |
|---|---|---|
| Agents commit each other's changes | Shared worktree, agents run `git add -A` | Use worktrees — each has its own filesystem |
| Health endpoint bundled into wrong commit | Both modified `server/index.js` | Separate worktrees eliminate this entirely |
| Agents compete for port 3000 | Each agent starts server to verify | Assign unique ports per worktree (300X) |
| Schema migrations conflict | Multiple agents add columns/tables | Review combined schema after all merges |
| Test file merge conflicts | Multiple agents add test files | Tests are additive — auto-merge usually works |
| Folder permissions re-prompted | Task-named worktree folders change each time | Use fixed slots (wt-1..wt-4), recycle with new branches |

---

## CI/CD Pipeline Status Items

*(INSTRUCTIONS.md lines 699, 701, 705)*

- **Staging pipeline (staging-deploy.yml — planned):** Runs hourly via cron. Checks if `main` has new commits since last run. If yes: fast-forwards `release/staging` branch to main HEAD, builds Docker image, pushes to GHCR, runs ephemeral smoke tests in GitHub Actions container. With manual approval, deploys to Azure staging.
- **Production pipeline (prod-deploy.yml — planned):** Manually triggered (`workflow_dispatch`) from `release/staging` branch. Can only run when the staging environment is green. Deploys the same image already validated in staging to production. Verifies health, auto-rolls back on failure.
- **Legacy pipeline (ci-cd.yml):** Will be gutted — deploy/staging/production jobs removed. Push-to-main no longer deploys anywhere.

---

## Evaluated & Deferred — Squad

*(INSTRUCTIONS.md lines 768–789)*

### Squad (bradygaster/squad) — Multi-Agent AI Orchestration

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

---

## Detailed Test Specifications

*(INSTRUCTIONS.md lines 292–381 — implementation requirements for specific modules/endpoints)*

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

---

## Verbose Worktree Command Examples

*(INSTRUCTIONS.md lines 499–601 — detailed PowerShell commands for worktree operations)*

**One-time setup:**
```powershell
mkdir C:\src\gwn<suffix>-worktrees

git worktree add -b feat/puzzle-expansion C:\src\gwn<suffix>-worktrees\wt-1 main
git worktree add -b feat/azure-infra      C:\src\gwn<suffix>-worktrees\wt-2 main
git worktree add -b feat/mp-game-logic    C:\src\gwn<suffix>-worktrees\wt-3 main
git worktree add -b feat/mp-lobby-ui      C:\src\gwn<suffix>-worktrees\wt-4 main

git worktree list
```

**Recycling a slot:**
```powershell
cd C:\src\guesswhatisnext<suffix>
git worktree remove C:\src\gwn<suffix>-worktrees\wt-1 --force
git branch -d feat/old-task
git worktree add -b feat/new-task C:\src\gwn<suffix>-worktrees\wt-1 main
```

**Agent environment setup:**
```powershell
cd C:\src\gwn<suffix>-worktrees\wt-X
npm install
$env:PORT = "300X"   # wt-1 → 3001, wt-2 → 3002, etc.
```

**Testing in worktrees:**
- Unit/integration: `npm test` — temp DB via `GWN_DB_PATH`, random port via supertest
- Manual: `$env:PORT=300X; node server/index.js`
- DB isolation: test helper creates temp dir per suite with own SQLite DB

**Test helper details:**
```
tests/helper.js
├── setup()     → creates temp dir, sets GWN_DB_PATH, boots server on port 0
├── teardown()  → closes DB, stops server, removes temp dir
├── getAgent()  → returns supertest agent bound to test server
└── registerUser() → helper to create auth'd test user
```

**Commit, push, and merge (pre-branch-protection):**
```
Agent in wt-X:
  1. Work on feat/<task-name> branch
  2. Run npm test → all pass
  3. git add -A && git commit
  4. git push -u origin feat/<task-name>
  5. Merge to main on remote:
     git fetch origin main
     git checkout main
     git merge feat/<task-name> --no-edit
     npm test                     # verify merged state
     git push origin main
  6. If merge conflicts: resolve locally, re-run npm test, then push
```

**Main orchestrating agent:**
```
Main agent (after notification that wt-X pushed):
  cd C:\src\guesswhatisnext
  git pull                       # get latest main with merged changes
```

**Merge ordering:** First-done merges first. Each subsequent agent may need to rebase/merge main into their branch before pushing.

**Worktree cleanup:**
```powershell
git worktree remove C:\src\gwn<suffix>-worktrees\wt-1 --force
git worktree remove C:\src\gwn<suffix>-worktrees\wt-2 --force
git branch -d feat/puzzle-expansion feat/azure-infra
git worktree prune
```

---

## High-Conflict Files

*(INSTRUCTIONS.md lines 657–666 — project state, changes as architecture evolves)*

These files are modified by almost every feature — expect merge work:
- `server/index.js` — route registration, middleware setup
- `server/app.js` — app factory, route wiring
- `server/db/schema.sql` — table definitions
- `server/db/connection.js` — migrations, seeding
- `public/index.html` — new screens, buttons
- `public/js/app.js` — event handlers, screen navigation
- `public/css/style.css` — new component styles
- `server/ws/matchHandler.js` — multiplayer logic

---

## Adopted Tools & Versions

*(INSTRUCTIONS.md lines 753–766 — version pins go stale; tool choices documented here)*

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

---

## Phase: Puzzle Authoring Guide

*(INSTRUCTIONS.md lines 716–729)*

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
