# Quick Reference Checklist

Re-read this section after every `git pull`, even if INSTRUCTIONS.md didn't change.

- After claiming a task → prompt user to rename session: `/rename [{agent-id}]-{task-id}: {clickstop name}`
- After every `git pull` → re-read this checklist; if INSTRUCTIONS.md changed, re-read fully
- Never do implementation work in main checkout — dispatch to worktree sub-agents
- Update WORKBOARD.md immediately on task claim/complete — commit AND push
- Only modify your own rows in WORKBOARD.md Active Work
- Check CS number conflicts before creating new clickstops
- Commit clickstop plan file to main BEFORE starting implementation work
- Deferred tasks → must create new `planned_` clickstop (never silently drop)
- Sub-agent prompts must include full Sub-Agent Checklist verbatim
- Poll for Copilot review — never assume empty reviews = approved
- Report progress to user after dispatching agents — never go silent
- Commit after each meaningful step — don't batch unrelated changes

---

# Development Instructions

This document defines architecture decisions, coding standards, testing strategy, and git workflow for the **Guess What's Next** project.

For clickstops, task plans, detailed test specifications, tool evaluations, and current project state, see **CONTEXT.md**. For live work coordination, see **WORKBOARD.md**. For architecture decisions and learnings, see **LEARNINGS.md**.

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
│   ├── puzzleData.js               # Server-side puzzle pool (multiplayer)
│   ├── routes/                      # Route modules
│   │   ├── achievements.js         # Achievement API routes
│   │   ├── auth.js                 # Register, login, JWT tokens
│   │   ├── features.js             # Feature flag status endpoint
│   │   ├── matches.js              # Room create/join + match history
│   │   ├── notifications.js        # Notifications API routes
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
│   └── middleware/auth.js          # JWT + API key verification middleware
├── data/                           # SQLite database (local dev, git-ignored)
├── Dockerfile                      # Production container image
├── docker-compose.yml              # Local container dev (SQLite)
├── docker-compose.mssql.yml        # MSSQL validation stack (SQL Server + HTTPS)
├── .github/workflows/              # CI, deploy, load-test, and health-monitor workflows
├── scripts/                        # Local health-check scripts (sh + ps1)
├── infra/                          # Azure deployment (deploy.sh + README)
├── eslint.config.mjs              # ESLint flat config
├── package.json
├── INSTRUCTIONS.md                 # This file
├── CONTEXT.md                      # Project plan & status tracker
└── README.md                       # User & developer documentation
```

### System Architecture

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
 │  LocalStorage   │               │  │ DB Adapter      │  │
 └─────────────────┘               │  │ SQLite / MSSQL  │  │
                                   │  └────────────────┘  │
                                   │  ┌────────────────┐  │
                                   │  │ WebSocket (ws)  │  │
                                   │  │ matchHandler.js │  │
                                   │  └────────────────┘  │
                                   └──────────────────────┘
```

### Deployment Architecture

See the deployment architecture diagram in [CONTEXT.md § Deployment Architecture](CONTEXT.md#deployment-architecture).

### Separation of Concerns
- **Game engine** (`game.js`) handles logic only — no DOM manipulation
- **App layer** (`app.js`) handles screen navigation and DOM updates
- **Data layer** (`puzzles.js`) is pure data — exportable objects, no side effects
- **Storage layer** (`storage.js`) abstracts all persistence behind a clean API
- **Server routes** handle HTTP API, middleware handles auth, WebSocket handler manages real-time matches

### Feature Flag Rollouts

The project uses a central feature-flag module for staged rollouts. The client mirrors flag state via `/api/features`, but guarded server routes still enforce the same flag server-side.

- **Evaluation order:** feature-specific request override (if opted in and environment allows) → default state (`defaultEnabled`) → explicit user targeting → deterministic percentage rollout
- **Rollout stability:** percentage rollouts are deterministic per authenticated user
- **Override policy:** each feature must explicitly opt in and define its own override names; overrides are never global

### File Organization
- One module per file, one responsibility per module
- Shared constants (timer duration, scoring multipliers, etc.) go in a `config` object at the top of the relevant file
- Image assets organized in `img/` by category: `img/nature/`, `img/math/`, etc.

---

## 2. Coding Guidelines

### Language & Style
- **Vanilla JavaScript** (ES6+ modules) — no frameworks, no transpilers
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
| **E2E tests** | All critical user flows | Playwright |
| **Overall** | ≥ 80% line coverage across the project | `npm run test:coverage` |

Tests **must pass** before any merge to `main`. The **full validation suite** is:

1. **Lint:** `npm run lint` — ESLint with zero errors (warnings capped at 50)
2. **Unit + integration tests:** `npm test` — Vitest, all must pass
3. **E2E tests:** `npm run test:e2e` — Playwright browser tests

CI runs all three in parallel on PRs that change application code (non-docs changes). Agents must run the full suite locally before pushing.

### Test Framework & Tools


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
  "test:all": "vitest run && playwright test",
  "lint": "eslint . --max-warnings 50"
}
```

### Test Runner

Tests use Vitest with supertest for API and ws for WebSocket testing. Run with `npm test`. Each suite gets an isolated temp database and random port. Tests are safe to run in parallel across worktrees.

### Validation Before Pushing

Run the full validation sequence before pushing a branch:

```bash
npm run lint && npm test && npm run test:e2e
```

All three must pass. CI runs the same checks for PRs that trigger the workflow; docs-only changes may be skipped.

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
| `workboard` | WORKBOARD.md coordination updates (direct-commit on main) |

**Examples:**
```
feat: add timer countdown with visual progress bar
fix: prevent daily challenge replay after page refresh
refactor: extract scoring logic into pure functions
docs: add puzzle data format to INSTRUCTIONS.md
chore: initialize npm project with express and dependencies
```

### When to Commit
Commit locally after every meaningful, working change — each commit should be a self-contained unit that explains *what* changed and *why*. This creates a clear trail of reasoning on the feature branch.

**Commit on the feature branch after:**
- Each logical step (e.g., "extract phase content to CONTEXT.md", then "remove extracted content from INSTRUCTIONS.md")
- Adding or updating a feature, fixing a bug, adding tests, refactoring
- Each round of PR review fixes

**Commit messages must be descriptive** — they are the audit trail for what happened and why. Use conventional commit format (see above).

**Do not** batch unrelated changes into one commit. Two distinct actions = two commits.

### Agent Progress Reporting

All implementation work happens in background agents on worktrees — never in the main session. Non-worktree tasks (research, investigation, planning) may also run as background agents without a worktree slot (see § Parallel Agent Workflow). Worktree agents handle the full implementation lifecycle autonomously: code changes → validation → PR creation → Copilot review loop. The orchestrating agent only intervenes to merge approved PRs.

Background agents **must** report progress to the orchestrating agent:
- **On start:** "Starting CS11-64 in wt-1 on branch yoga-gwn/cs11-64-provision-azure-sql"
- **On milestone:** "CS11-64: completed \<step\>, running validation..."
- **On validation pass:** "CS11-64: lint ✓ test ✓ e2e ✓ — creating PR"
- **On validation fail:** "CS11-64: validation FAILED — \<error summary\>. Fixing..."
- **On abort:** "CS11-64: BLOCKED — \<reason\>. Needs orchestrator intervention."
- **On PR created:** "CS11-64: PR #\<N\> created, requesting Copilot review"
- **On review loop:** "CS11-64: Copilot review round \<N\> — fixing \<count\> issues"
- **On ready:** "CS11-64: PR #\<N\> ready for merge (Copilot approved, CI green)"

The orchestrating agent **must actively relay progress to the user** — never dispatch tasks and wait silently. When multiple tasks run in parallel, provide a summary table of all task statuses.

### Branch Strategy & Merge Model
- **No direct commits to `main`** — all code changes go through pull requests, except `WORKBOARD.md` updates and clickstop plan files committed directly on `main` by orchestrating agents. (CONTEXT.md summary rows may optionally be bundled with plan file commits.)
- Feature branches: `{agent-id}/{task-id}-{description}` (e.g., `yoga-gwn/cs11-64-provision-azure-sql`, `yoga-gwn/cs14-82-authoring-form`)
- Every PR must pass the **full validation suite** before merge:
  1. **Lint:** `npm run lint`
  2. **Unit + integration tests:** `npm test` (vitest)
  3. **E2E tests:** `npm run test:e2e`
- **PRs are squash-merged** into `main` — the many granular feature-branch commits collapse into one clean commit on main. The squash commit message summarizes the overall change.
- Branch protection rules on `main`:
  - Require PR with review before merging
  - Require CI status checks to pass (`lint`, `test`, `e2e`) — CI uses `paths-ignore` for docs-only PRs

  - No force pushes
  - No direct commits (except WORKBOARD.md and clickstop plan files by orchestrating agents)

### Agent Work Model

**Main agent (orchestration only)** — operates on the main checkout (`C:\src\guesswhatisnext<suffix>`).

Allowed on main checkout:
- `git pull` to sync after merges
- `git worktree add/remove` to manage worktree slots
- `gh pr merge --squash` to merge approved PRs
- Communication with the user (clarifying requirements, reporting progress)
- Planning, decomposing, and delegating work to sub-agents

NOT allowed on main checkout:
- No file edits, no commits, no branch creation (other than implicit via `git worktree add -b`) — **exception:** WORKBOARD.md updates and clickstop plan files (optionally with CONTEXT.md summary rows) are committed and pushed directly from main
- No `git push` from main (except WORKBOARD.md and clickstop plan file updates)
- No merge conflict resolution on main, **except for conflicts confined to `WORKBOARD.md` and handled per the WORKBOARD.md conflict-handling guidance** — if `git pull` conflicts on anything else, abort (`git merge --abort` or `git rebase --abort` depending on pull strategy) and have a sub-agent handle the sync in the worktree

**Orchestrator Startup Checklist** (first actions in every new session):
1. Read INSTRUCTIONS.md in the repository root
2. Read WORKBOARD.md for current active work and task assignments
3. Read CONTEXT.md for project state and available clickstops
4. Determine agent ID from hostname + repo suffix (see § Agent Identification)
5. Update WORKBOARD.md to register the session (update Orchestrators table), then commit and push immediately
6. Once a task is claimed, prompt user to rename the session: `/rename [{agent-id}]-{task-id}: {clickstop name}`

**Orchestrator responsiveness:** The orchestrator must never block on work it can delegate. All delegatable work — code changes in worktrees; investigation, research, and analysis as non-worktree background agents — must run as background agents. The orchestrator's sole purpose is to stay available for user input and sub-agent coordination. The only synchronous work the orchestrator does is: reading/re-reading docs, lightweight planning and task decomposition, git operations on main (`git pull`, `git worktree add/remove`), updating WORKBOARD.md, merging approved PRs, and communicating with the user. After dispatching a background agent, do not continue working on that task — report dispatch status to the user and wait for the next user message or agent completion notification.

**Stale instructions guard:** After every `git pull` on main, check if INSTRUCTIONS.md was updated (e.g., `git --no-pager diff ORIG_HEAD..HEAD -- INSTRUCTIONS.md`). If it changed, re-read it before continuing work. This ensures the orchestrator always operates under the latest guidelines, especially when other agents' PRs update process documentation. Additionally, re-read the Quick Reference Checklist at the top of this file after every `git pull`, regardless of whether the file changed.

**Copilot CLI commands (reference):** The user has access to CLI commands that the orchestrator should be aware of:
- `/rename <name>` — rename the current session (orchestrator should prompt for this after claiming a task)
- `/remote` — start a remote cloud session
- `/tasks` — view running background tasks

**Sub-agents in worktrees** — handle all implementation work. Each sub-agent gets a worktree slot with a meaningful branch name (e.g., `yoga-gwn/cs0-lean-instructions`, `yoga-gwn/cs5-37-ws-reconnect`).

Sub-agents are responsible for:
- All file changes (code, docs, config) and all commits/pushes
- PR creation (`gh pr create`)
- Copilot review loop (reply to comments, resolve threads, re-request review)
- Merge conflict resolution (rebase/merge `origin/main` into the feature branch)

This keeps `main` clean and ensures every change flows through a PR.

**Sub-Agent Briefing Requirements:**

When the orchestrator launches a sub-agent, the prompt **MUST** include all of the following:

1. **Read instructions first:** Every sub-agent prompt must start with: "Read INSTRUCTIONS.md in the repository root before starting any work."
2. **Task description:** Clear, complete description including task ID (e.g., CS11-64), acceptance criteria, affected files, and edge cases.
3. **Worktree context:** Which slot (`wt-N`), branch name using `{agent-id}/{task-id}-{description}` format, and port number (`300N`).
4. **Validation command:** `npm run lint && npm test && npm run test:e2e`
5. **PR workflow:** Create PR with task ID in title (e.g., `cs11-64: description`), include agent metadata block in description, request Copilot review, complete full review loop.
6. **Commit conventions:** Use `Agent:` trailer and `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer in all commits. Conventional commit format with task scope (e.g., `feat(cs11-64): description`).
7. **Review loop reminder:** Reference the "Waiting for Copilot Review (CRITICAL)" section — sub-agents must poll for Copilot's review before concluding there are no comments.
8. **Failure handling:** If validation fails, fix and re-run (up to 3 attempts). If stuck, report failure details to the orchestrator and stop.
9. **Merge conflicts:** Before pushing, rebase onto `origin/main`. Resolve conflicts in the worktree branch and re-run validation.

**Sub-Agent Checklist** (include verbatim in every sub-agent prompt — this is the execution plan the sub-agent follows, complementing the Briefing Requirements above which define what context the orchestrator must provide):
1. Read INSTRUCTIONS.md in the repository root before starting any work
2. Read WORKBOARD.md for current project context and active work
3. Run `npm install` in worktree
4. Set `$env:PORT = "300N"` for the assigned slot
5. Implement the task (commit after each meaningful step with `Agent:` trailer and `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer)
6. Run full validation: `npm run lint && npm test && npm run test:e2e`
   - If validation fails, fix the issue and re-run. Repeat until all checks pass. If stuck after 3 attempts, report the failure to the orchestrator with error details and stop.
7. Rebase onto latest main before pushing: `git fetch origin && git rebase origin/main`. If conflicts arise, resolve them and re-run validation.
8. Push branch and create PR with task ID in title and agent metadata in description
9. Request Copilot review: `gh pr edit <PR#> --add-reviewer "@copilot"`
10. Wait for review (poll per "Waiting for Copilot Review" section — do NOT skip this)
11. Address all review comments (reply + fix + resolve threads)
12. Re-request review and repeat until clean
13. Report completion with PR number and summary

**Model selection:** GPT models require more explicit procedural prompting for workflow steps (e.g., review loop polling). Always include the full Sub-Agent Checklist when dispatching GPT-based sub-agents. Claude models better internalize workflow instructions from high-level descriptions. See LEARNINGS.md for detailed model evaluation results and task-specific recommendations.

### Parallel Agent Workflow

All worktree work runs as background tasks. The orchestrating agent launches each task agent in the background and is notified when each completes. Use **fixed-name worktree slots** (`wt-1` through `wt-4`) with task-specific branch names.
The branch name carries the task meaning — the folder name is just a stable slot.

**Worktree root naming:** `gwn<suffix>-worktrees` where `<suffix>` is the text after the
repo name in the clone folder (e.g., clone `guesswhatisnext_copilot2` → suffix `_copilot2`
→ root `gwn_copilot2-worktrees`). If clone matches repo name exactly, suffix is empty.

| Clone folder | Suffix | Worktree root |
|---|---|---|
| `guesswhatisnext` | *(empty)* | `gwn-worktrees` |
| `guesswhatisnext_copilot2` | `_copilot2` | `gwn_copilot2-worktrees` |

| Slot | Path | Port | Purpose |
|---|---|---|---|
| main | `C:\src\guesswhatisnext<suffix>` | 3000 | Orchestration only — no code changes |
| wt-1 | `C:\src\gwn<suffix>-worktrees\wt-1` | 3001 | Sub-agent slot 1 |
| wt-2 | `C:\src\gwn<suffix>-worktrees\wt-2` | 3002 | Sub-agent slot 2 |
| wt-3 | `C:\src\gwn<suffix>-worktrees\wt-3` | 3003 | Sub-agent slot 3 |
| wt-4 | `C:\src\gwn<suffix>-worktrees\wt-4` | 3004 | Sub-agent slot 4 |

**Task parallelism:**
- **Worktree tasks** (code changes, tests, PRs): bounded by worktree slots wt-1 through wt-4. Each needs a git worktree, a unique port, and `npm install`.
- **Non-worktree tasks** (research, investigation, session queries, planning, analysis): not bounded by worktree slots. These run as non-worktree background agents without consuming a worktree slot. No port or npm install needed.

The orchestrator should maximize parallelism by running non-worktree tasks concurrently with worktree tasks. There is no fixed limit on non-worktree background tasks.

**Agent setup:** Each worktree needs `npm install` and `$env:PORT = "300X"`. Database auto-creates at `data/game.db`. Each worktree gets its own independent database.

**Branch lifecycle:**
1. Work on `{agent-id}/{task-id}-{description}` branch in slot
2. **Commit after each meaningful step** with a descriptive message — don't wait until the end
3. Run full validation before pushing: `npm run lint && npm test && npm run test:e2e`
4. Push branch to origin
5. Create PR: `gh pr create --base main --head {agent-id}/{task-id}-{description}`
6. Request Copilot review: `gh pr edit <PR#> --add-reviewer "@copilot"`
7. Address review feedback — commit each round of fixes separately and answer each comment meaningfully and close comment when changes are committed.
8. After CI passes and review approved, **squash-merge** via GitHub UI or `gh pr merge --squash`
9. Main orchestrating agent pulls after each merge: `git pull`

**Recycling slots:** `git worktree remove <path> --force` → `git branch -d old-branch` → `git worktree add -b new-branch <path> main`

### Clickstop & Task Management

**Clickstops** are the unit of deliverable work — each represents a feature, capability, or related set of changes. **Tasks** are the breakdown within a clickstop.

#### Task IDs
Format: `CS<clickstop#>-<task#>` (e.g., `CS11-64`, `CS14-82`). Used in branch names, commit messages, PR titles, and WORKBOARD.md.

**CS number allocation:** Before assigning a new clickstop number, verify the number is not already taken by checking all three sources:
1. **Existing clickstop files:** `ls project/clickstops/` — check all `planned_`, `active_`, and `done_` files for the highest CS number
2. **WORKBOARD.md Active Work:** Another agent may have just claimed a CS number but not yet committed the plan file — check Active Work for any CS numbers in use
3. **CONTEXT.md clickstop summary table:** Cross-reference the summary table for any CS numbers added by other agents

Use the next number after the highest found across all three sources. If in doubt, use a higher number — gaps in CS numbering are harmless, collisions cause real problems.

#### Task Statuses
- ⬜ Pending — not started, may have unmet dependencies
- 🔜 Ready — dependencies met, can be picked up
- 🔄 In Progress — claimed by an agent (see WORKBOARD.md)
- ✅ Done — merged to main
- 🚫 Blocked — explain why in Notes column

#### Agent Identification
Every orchestrating agent has a unique ID: `{machine-short}-{repo-suffix}`
- **Machine short**: lowercase, first meaningful segment of hostname (e.g., `HENRIKM-YOGA` → `yoga`)
- **Repo suffix**: derived from clone folder (e.g., `guesswhatisnext` → `gwn`, `guesswhatisnext_copilot2` → `gwn-c2`)
- Override via `GWN_AGENT_MACHINE` env var if hostname is unhelpful

#### Naming Conventions

Task IDs use uppercase in documentation and tables (`CS11-64`) but are normalized to **lowercase** in branches and commit scopes (`cs11-64`).

**Branches:** `{agent-id}/{task-id}-{description}`
```
yoga-gwn/cs11-64-provision-azure-sql
yoga-gwn-c2/cs14-82-authoring-form
```

**Commits:** Include `Agent:` and `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailers
```
feat(cs11-64): provision Azure SQL server

Agent: yoga-gwn/wt-1
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

**PR titles:** `cs{N}-{task#}: description`
**PR descriptions:** Include agent metadata block:
```
## Task: CS11-64 — Provision Azure SQL
**Clickstop:** CS11 — Database Migration
**Agent:** yoga-gwn/wt-1
```

#### Clickstop Completion Checklist

Every clickstop must satisfy ALL of these before marking complete:
- [ ] All tasks done and merged (or deferred — see Deferred work policy below)
- [ ] README updated (if user-facing changes)
- [ ] INSTRUCTIONS.md updated (if architectural/workflow changes)
- [ ] CONTEXT.md updated with final state
- [ ] Tests added/updated, coverage measured
- [ ] Performance/load test evaluation (if applicable)
- [ ] Data structure changes documented
- [ ] Staging deployed and verified
- [ ] Production deployed and verified (or N/A with documented reason)

Filled-in checklists are recorded in the clickstop's archive file upon completion.

**Deferred work policy:** When completing a clickstop with deferred tasks, the orchestrator must:
1. Create a new `planned_` clickstop file for the deferred work, including: what was deferred, why it was deferred, and a link back to the originating clickstop
2. Add the new clickstop to the CONTEXT.md summary table
3. Inform the user that deferred work has been placed in a new clickstop, with a link and summary

A clickstop may be marked complete with deferred tasks only if the deferred work has been captured in a new clickstop. Never silently drop deferred tasks.

#### WORKBOARD.md — Live Coordination

WORKBOARD.md is the real-time coordination file for multi-agent work. It tracks who is working on what, right now.

**Direct commit on main (no PR required):**
Unlike most project files, WORKBOARD.md is updated by orchestrating agents directly on main via commit + push. **The push is critical** — a local-only commit provides zero coordination value to other agents. Always commit and push together (see the multi-line commit format with `Agent:` trailer in § Commit Convention for workboard updates below). This enables fast task assignment without PR review overhead. Clickstop plan files are the other direct-on-main exception (see § Clickstop File Lifecycle). The workboard must be updated immediately when:
- An orchestrator claims a task (add to Active Work)
- A task completes (remove from Active Work)
- A task becomes blocked (keep in Active Work with a note indicating blocked status)
- An orchestrator starts or stops a session (update Orchestrators table)

**Session naming:** After updating the workboard to claim a task, prompt the user to rename the session so it's identifiable at a glance. Format: `[{agent-id}]-{task-id}: {clickstop name}`. Example:
```
/rename [yoga-gwn-c2]-CS17-1: Process Documentation Improvement
```

**Update frequency:** Orchestrators should update WORKBOARD.md often — at minimum on task start, task complete, and session start/end. Between those events, update whenever meaningful progress occurs (e.g., PR created, review round complete).

**Task locking:** When a task appears in Active Work assigned to an agent ID, no other orchestrator may pick up that task. The assignment is a lock. If an orchestrator crashes or stops working:
- The task remains assigned in WORKBOARD.md
- When that orchestrator restarts, it reads WORKBOARD.md, finds its assigned tasks, and resumes work
- There is no automated process for reassigning stalled tasks — a human must manually update WORKBOARD.md to release the lock if an orchestrator is permanently unavailable

**Row ownership:** Each orchestrator may only modify its own rows in Active Work. When completing a task, remove only your own row — never edit or remove another agent's entries. When adding a task, append a new row without altering existing rows.

**Clickstop assignment:** An entire clickstop can be assigned to one orchestrator. When a clickstop is assigned, all tasks within it belong to that orchestrator. Other orchestrators must not pick up individual tasks from an assigned clickstop unless explicitly released.

**Commit convention for workboard updates:**
```
workboard: <brief description of change>

Agent: {agent-id}
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

**Conflict handling:** Since multiple orchestrators may update WORKBOARD.md concurrently, conflicts are possible. Orchestrators should `git pull` before updating. If a conflict occurs **only in `WORKBOARD.md`**, this is the one exception to the general "do not resolve merge conflicts in the main checkout" rule: resolve it by keeping both agents' entries (additive merge), then complete the workboard-only update. If the pull produces conflicts in any other file, abort the merge and follow the normal abort + worktree workflow instead.

**Public repository note:** When branch protection is enabled with required reviews, the repository owner (henrik-me) uses a repository ruleset bypass to allow direct WORKBOARD.md and clickstop plan file pushes. This bypass is configured in Settings → Rules → Rulesets and applies only to the owner role. Non-owner orchestrating agents (if any) would need to use PR-based updates instead.

#### CONTEXT.md — Project State Updates

CONTEXT.md tracks clickstop summaries and current project state. Updates to CONTEXT.md **require PR review** because:
- It defines the project's roadmap and task dependencies
- Multiple agents reference it for planning decisions
- Errors in CONTEXT.md can cause agents to work on wrong tasks or miss dependencies

**When to update CONTEXT.md:**
- Clickstop status changes (planned → active → done)
- Task count changes (new tasks added, tasks completed)
- Codebase state section updates (new routes, test counts, workflows)
- Blocker/known issue changes

CONTEXT.md updates are typically bundled into the PR that completes the relevant task. Stand-alone CONTEXT.md updates (e.g., adding a new clickstop) go through their own PR. **Exception:** when committing a clickstop plan file directly to main, the CONTEXT.md summary row may be bundled in the same commit or deferred to the implementation PR.

#### Clickstop File Lifecycle

Each clickstop gets a detail file in `project/clickstops/` with a status prefix:

| Prefix | Meaning | Example |
|--------|---------|---------|
| `planned_` | Defined but no tasks started | `planned_cs19_community-puzzle-navigation.md` |
| `active_` | Has work in progress | `active_cs11_database-migration.md` |
| `done_` | Fully complete | `done_cs10_cicd-pipeline.md` |

**File format:** Each file contains the clickstop title, status, goal, full task table (with CS-prefixed IDs), design decisions, and notes (parallelism, architecture details).

**Lifecycle transitions:**

1. **New clickstop defined** → create `planned_{cs-id}_{kebab-name}.md` with task table and design notes. **Commit and push the plan file to main before starting any implementation work.** The plan must exist on main before a sub-agent begins coding in a worktree. Add a summary row to the CONTEXT.md clickstop summary table linking to the file (can be bundled with the plan commit or the implementation PR).
2. **First task starts** → rename file from `planned_` to `active_` (use `git mv`). Update the CONTEXT.md summary row status and link.
3. **All tasks complete** → rename file from `active_` to `done_` (use `git mv`). Update the CONTEXT.md summary row. Fill in the completion checklist inside the file. Replace the CONTEXT.md section with a 2-4 line summary linking to the archive.

CONTEXT.md always contains only a short summary (2-4 lines) per clickstop with a link to the detail file. Full task tables, design decisions, and architecture details live in the clickstop files.

Legacy archives from before CS0 may omit the completion checklist.

**Copilot PR Review Policy:**
- Every PR must be reviewed by Copilot before merging
- Categorize comments as **Fix** (real bugs, security, correctness), **Skip** (cosmetic, by-design), or **Accept suggestion** (correct code improvement)
- Fix valid issues, reply with rationale on each thread, resolve all threads
- If Copilot re-reviews after fixes, repeat the cycle

**Copilot Review — Detailed Workflow:**

Requesting review (requires gh CLI ≥ 2.88.0): `gh pr edit <PR#> --add-reviewer "@copilot"`

**Review loop (repeat until clean):**
1. Read all review comments and suggestions
2. Categorize each as **Fix** (real bugs, security, correctness), **Skip** (cosmetic, by-design), or **Accept suggestion** (correct code improvement)
3. Reply to each comment with disposition and rationale, then fix valid issues
4. Resolve all threads (fixed or acknowledged) — always reply BEFORE resolving
5. Re-request Copilot review: `gh pr edit <PR#> --add-reviewer "@copilot"`
6. Repeat from step 1 until Copilot approves with no new comments

**Waiting for Copilot Review (CRITICAL):**

After requesting review with `gh pr edit <PR#> --add-reviewer "@copilot"`, Copilot takes **2–5 minutes** to post its review. You **MUST** wait for the review to appear before proceeding. Do not assume an empty review list means approval — it means Copilot hasn't responded yet.

Polling procedure:
1. Record the current review count before requesting (re-)review:
   ```powershell
   $reviewCountBefore = gh api repos/henrik-me/guesswhatisnext/pulls/<PR#>/reviews --jq '[.[] | select(.user.login == "copilot-pull-request-reviewer")] | length'
   ```
2. Request review: `gh pr edit <PR#> --add-reviewer "@copilot"`
3. Wait 60 seconds: `Start-Sleep -Seconds 60`
4. Check if a new review has been posted:
   ```powershell
   $reviewCountAfter = gh api repos/henrik-me/guesswhatisnext/pulls/<PR#>/reviews --jq '[.[] | select(.user.login == "copilot-pull-request-reviewer")] | length'
   ```
5. If `$reviewCountAfter` is greater than `$reviewCountBefore`, a new review exists — proceed to read comments
6. If the count has not incremented, repeat from step 3 (up to **10 times** — 10 minutes total)
7. After 10 attempts, report a timeout to the orchestrating agent

Check the latest review state:
```powershell
gh api repos/henrik-me/guesswhatisnext/pulls/<PR#>/reviews --jq '[.[] | select(.user.login == "copilot-pull-request-reviewer")] | last | .state'
```
- `APPROVED` — Copilot is satisfied, PR is ready to merge
- `CHANGES_REQUESTED` — read the review comments and address them
- `COMMENTED` — informational feedback, review the comments

**DO NOT** conclude "no review comments" without first confirming a new Copilot review has been posted after your most recent push. A missing review means Copilot hasn't responded yet — not that there are no comments.

**Replying to review comments (REST API):**
```powershell
gh api repos/henrik-me/guesswhatisnext/pulls/comments/<COMMENT_ID>/replies --method POST -f "body=YOUR_REPLY"
```

**Reply conventions:** Fixed → reference commit hash. Acknowledged (by design) → explain rationale. Not applicable → note why observation is incorrect. Duplicate → reference original thread.

**Resolving review threads (GraphQL API):**
```powershell
# Get unresolved thread IDs
gh api graphql -f query='{ repository(owner: "henrik-me", name: "guesswhatisnext") { pullRequest(number: {PR#}) { reviewThreads(first: 100) { nodes { id isResolved comments(first: 1) { nodes { databaseId path } } } } } } }'

# Resolve a thread
gh api graphql -f query='mutation { resolveReviewThread(input: { threadId: "THREAD_ID" }) { thread { isResolved } } }'
```

**Large-diff PR behavior:** On large diffs, Copilot may re-post comments on unchanged lines. When comments reference already-fixed code, reply with the fix commit hash and resolve.

**Merge conflict guidelines:**
- Merge zero-conflict branches first (e.g., new-files-only tasks)
- For shared files: merge one at a time, run `npm test` after each
- Resolve conflicts manually if needed (typically additive — HTML sections, CSS rules, route registrations)
- **Never run in parallel**: tasks that modify the same function body

**Parallel grouping rules:**
- ✅ Backend-only tasks (different route files) can safely parallelize
- ✅ Tasks creating only new files (infra, new routes) are always safe
- ⚠️ Tasks that both add HTML screens will conflict in `index.html`
- ⚠️ Tasks that both modify `matchHandler.js` should be sequential
- ❌ Never parallelize two tasks that both rewrite the same function

### Deployment Environments
| Environment | Trigger | Approval | Infrastructure | Rollback |
|---|---|---|---|---|
| **Local (SQLite)** | `npm start` or `docker compose up` | None | Developer machine | N/A |
| **Local (MSSQL)** | `npm run docker:mssql` | None | Docker (SQL Server 2022 + Caddy HTTPS) | N/A |
| **Ephemeral staging** | Push to main + workflow_dispatch (gated by `STAGING_AUTO_DEPLOY`) | Automatic | GitHub Actions (container in workflow) | N/A (ephemeral) |
| **Azure staging** | After ephemeral validation passes | Manual (GitHub Environment reviewers) | Azure Container Apps (Consumption) — gwn-staging | Redeploy previous SHA-tagged image |
| **Production** | After Azure staging smoke tests pass | Manual (GitHub Environment reviewers) | Azure Container Apps + Azure SQL | Auto-rollback to previous SHA-tagged image |

### CI/CD Pipeline Overview

**PR checks (ci.yml):** Lint, test, and E2E checks run on every pull request. No Docker build — fast feedback.

**Push to `main`:** Does **not** trigger any deployment. All deployments flow through the staging pipeline first.

### Rollback Policy
- Docker images are tagged with git SHA (`ghcr.io/henrik-me/guesswhatisnext:<sha>`) — every version is recoverable
- Post-deploy verification runs health check + smoke tests against production
- On failure: auto-rollback to previous image tag + GitHub issue created with `deployment-failure` label
- Manual rollback available via `az containerapp update --image <previous-tag>`
- **Database migrations must be backward-compatible** (additive only: new columns with defaults, new tables) to ensure rollback safety

---

## 6. Performance & Accessibility

### Performance
- No heavy libraries — total JS payload should stay under 50KB
- Images: use compressed formats (WebP preferred, PNG fallback), max 200KB each
- Preload next puzzle's images while current round is active

### Accessibility
- Minimum contrast ratio: 4.5:1 for text
- All buttons/options have visible focus indicators
- Screen reader support: ARIA labels on game state changes
- Reduced motion: respect `prefers-reduced-motion` media query
- Emoji sequences: include `aria-label` describing the item for screen readers

