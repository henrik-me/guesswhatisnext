# Development Instructions

This document defines architecture decisions, coding standards, testing strategy, and git workflow for the **Guess What's Next** project.

For project phases, task plans, detailed test specifications, tool evaluations, and current status, see **CONTEXT.md**.

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
│   │   ├── index.js                # DB factory / primary database entry point
│   │   └── connection.js           # Legacy DB module
│   └── middleware/auth.js          # JWT + API key verification middleware
├── data/                           # SQLite database (auto-created, git-ignored)
├── Dockerfile                      # Production container image
├── docker-compose.yml              # Local container dev environment
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
 │  LocalStorage   │               │  │ SQLite (WAL)   │  │
 └─────────────────┘               │  │ data/game.db   │  │
                                   │  └────────────────┘  │
                                   │  ┌────────────────┐  │
                                   │  │ WebSocket (ws)  │  │
                                   │  │ matchHandler.js │  │
                                   │  └────────────────┘  │
                                   └──────────────────────┘
```

### Deployment Architecture

```
  Developer                    GitHub                              Azure
 ┌─────────┐              ┌───────────────┐
 │ git push│──────────────▶│ GitHub Actions │
 │ to main │              │               │
 └─────────┘              │ ┌───────────┐ │
                          │ │Lint+Test+E2E│ │
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
                          │ │ Monitor   │ │  every 6 hours
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

The project uses a central feature-flag module for staged rollouts. The client mirrors flag state via `/api/features`, but guarded server routes still enforce the same flag server-side.

- **Evaluation order:** default state → feature-specific request override (if opted in and environment allows) → explicit user targeting → deterministic percentage rollout
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
- Each logical step (e.g., "extract phase content to context2.md", then "remove extracted content from INSTRUCTIONS.md")
- Adding or updating a feature, fixing a bug, adding tests, refactoring
- Each round of PR review fixes

**Commit messages must be descriptive** — they are the audit trail for what happened and why. Use conventional commit format (see above).

**Do not** batch unrelated changes into one commit. Two distinct actions = two commits.

### Agent Progress Reporting

All task work happens in background agents on worktrees — never in the main session. Background agents handle the full lifecycle autonomously: code changes → validation → PR creation → Copilot review loop. The orchestrating agent only intervenes to merge approved PRs.

Background agents **must** report progress to the orchestrating agent:
- **On start:** "Starting task X in wt-N on branch feat/\<name\>"
- **On milestone:** "Task X: completed \<step\>, running validation..."
- **On validation pass:** "Task X: lint ✓ test ✓ e2e ✓ — creating PR"
- **On PR created:** "Task X: PR #\<N\> created, requesting Copilot review"
- **On review loop:** "Task X: Copilot review round \<N\> — fixing \<count\> issues"
- **On ready:** "Task X: PR #\<N\> ready for merge (Copilot approved, CI green)"

The orchestrating agent **must actively relay progress to the user** — never dispatch tasks and wait silently. When multiple tasks run in parallel, provide a summary table of all task statuses.

### Branch Strategy & Merge Model
- **No direct commits to `main`** — all code changes go through pull requests, no exceptions
- Feature branches: `feat/<step-id>` (e.g., `feat/puzzle-expansion`, `feat/mp-game-logic`)
- Every PR must pass the **full validation suite** before merge:
  1. **Lint:** `npm run lint`
  2. **Unit + integration tests:** `npm test` (vitest)
  3. **E2E tests:** `npm run test:e2e`
- **PRs are squash-merged** into `main` — the many granular feature-branch commits collapse into one clean commit on main. The squash commit message summarizes the overall change.
- Branch protection rules on `main`:
  - Require PR with review before merging
  - Require CI status checks to pass (`lint`, `test`, `e2e`) — CI uses `paths-ignore` for docs-only PRs

  - No force pushes
  - No direct commits

### Agent Work Model

The **main agent** works in the main checkout (`C:\src\guesswhatisnext<suffix>`) but **does not make code changes there**. Its role is:
- Communicating with the human user (clarifying requirements, reporting progress)
- Planning and decomposing work into tasks
- Delegating implementation to sub-agents working in worktree slots
- Orchestrating: tracking sub-agent progress, pulling merged changes, resolving cross-task issues

**All code changes** — features, fixes, tests, docs, refactoring — are done by **sub-agents in worktree slots**. Each sub-agent gets a worktree with a meaningful branch name (e.g., `feat/lean-instructions`, `fix/ws-reconnect`). This keeps `main` clean and ensures every change flows through a PR.

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

**Agent setup:** Each worktree needs `npm install` and `$env:PORT = "300X"`. Database auto-creates at `data/game.db`. Each worktree gets its own independent database.

**Branch lifecycle:**
1. Work on `feat/<task-name>` branch in slot
2. **Commit after each meaningful step** with a descriptive message — don't wait until the end
3. Run full validation before pushing: `npm run lint && npm test && npm run test:e2e`
4. Push branch to origin
5. Create PR: `gh pr create --base main --head feat/<task-name>`
6. Request Copilot review: `gh pr edit <PR#> --add-reviewer "@copilot"`
7. Address review feedback — commit each round of fixes separately and answer each comment meaningfully and close comment when changes are committed.
8. After CI passes and review approved, **squash-merge** via GitHub UI or `gh pr merge --squash`
9. Main orchestrating agent pulls after each merge: `git pull`

**Recycling slots:** `git worktree remove <path> --force` → `git branch -d feat/old-task` → `git worktree add -b feat/new-task <path> main`

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

**Replying to review comments (REST API):**
```powershell
gh api repos/henrik-me/guesswhatisnext/pulls/{PR#}/comments/{COMMENT_ID}/replies --method POST -f "body=YOUR_REPLY"
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
| **Local** | `docker compose up` or `npm start` | None | Developer machine | N/A |
| **Ephemeral staging** | Push to main + workflow_dispatch (gated by `STAGING_AUTO_DEPLOY`) | Automatic | GitHub Actions (container in workflow) | N/A (ephemeral) |
| **Azure staging** | After ephemeral validation passes | Manual (GitHub Environment reviewers) | Azure Container Apps (Consumption) — gwn-staging | Redeploy previous SHA-tagged image |
| **Production** | After Azure staging smoke tests pass | Manual (GitHub Environment reviewers) | Azure Container Apps (Consumption) — gwn-prod | Auto-rollback to previous SHA-tagged image |

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

