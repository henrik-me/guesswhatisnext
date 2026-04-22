# Quick Reference Checklist

Re-read this section after every `git pull`, even if INSTRUCTIONS.md didn't change.

- Claiming a clickstop → update WORKBOARD.md (commit+push), rename CS file to active_, update content, commit to main
- Closing a clickstop → rename CS file to done_, move to `project/clickstops/done/`, update content with results, update CONTEXT.md, remove from WORKBOARD.md
- Preferred model: Claude Opus (4.7 or higher, 1M context variant when available) for both orchestrators and sub-agents, GPT (5.4 or higher) for reviews
- CS number conflicts → check done_, active_, AND planned_ files before picking a new number
- After claiming a task → prompt user to rename session: `/rename [{agent-id}]-{task-id}: {clickstop name}`
- Session start → `git pull` before reading project files
- After every `git pull` → re-read this checklist; if INSTRUCTIONS.md changed, re-read fully
- Never do implementation work in main checkout — dispatch to worktree sub-agents
- Never modify files related to another agent's active task — check WORKBOARD.md first
- Maximize parallelism — dispatch independent tasks simultaneously
- Update WORKBOARD.md Active Work when starting ANY work, not just clickstop tasks — use "—" for Task ID/Clickstop on non-CS work
- Update WORKBOARD.md immediately on task claim/complete — commit AND push (use ISO datetime: `2026-04-12T18:27Z`)
- Only modify your own rows in WORKBOARD.md Active Work
- Check CS number conflicts before creating new clickstops
- Commit clickstop plan file to main BEFORE starting implementation work
- Deferred tasks → must create new `planned_` clickstop (never silently drop)
- Sub-agent prompts must include full Sub-Agent Checklist verbatim
- Run local review loop (GPT 5.4 or higher) before Copilot review — skip Copilot for docs-only PRs
- Report progress to user after dispatching agents — never go silent; relay every sub-agent turn/state transition the same turn it lands, and post a heartbeat update at least every ~10 min if nothing has transitioned (see [§ Agent Progress Reporting in OPERATIONS.md](OPERATIONS.md#agent-progress-reporting))
- Commit after each meaningful step — don't batch unrelated changes
- Record local review findings in PR description
- Do not remove task from WORKBOARD.md until PR is merged and task is fully complete
- When removing content from INSTRUCTIONS.md, ensure it lands in CONTEXT.md or README.md — no information loss
- Never skip any part of the process without asking the user first — no self-decided shortcuts
- The process applies to all changes regardless of size — there is no "too small for a PR" threshold

---

---

# Development Instructions

This file contains durable policy (architecture, coding standards, testing, logging, performance). For procedural documentation, see:

- [OPERATIONS.md](OPERATIONS.md) — agent workflow, parallelism, deployment, branch/merge model
- [REVIEWS.md](REVIEWS.md) — local review loop, Copilot PR review policy, review comment handling
- [TRACKING.md](TRACKING.md) — clickstop lifecycle, WORKBOARD state machine, CONTEXT update protocol

For clickstops, task plans, detailed test specifications, tool evaluations, and current project state, see **CONTEXT.md**. For live work coordination, see **WORKBOARD.md**. For architecture decisions and learnings, see **LEARNINGS.md**.

---

## 1. Architecture Principles

For architecture diagrams and codebase structure, see [README.md](README.md) and [CONTEXT.md](CONTEXT.md).

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
- Use JSDoc for public function signatures (see existing code for examples)

---

## 3. Testing Strategy

Tests **must pass** before any merge to `main`. The **full validation suite** is:

```bash
npm run lint && npm test && npm run test:e2e
```

All three must pass. CI runs the same checks for PRs that change application code; docs-only changes may be skipped.

### Test Data Management
- Tests use an **isolated temp-directory SQLite database** via `GWN_DB_PATH` — never the real `data/game.db`
- `tests/helper.js` creates the schema and seeds test data before each test suite
- Each test suite cleans up after itself — no cross-test contamination
- E2E tests use a separate server instance on a random port

### Container Validation

Sub-agents should validate changes in Docker containers before merging. The `docker-compose.yml` supports port isolation via `HOST_PORT` env var.

**Port isolation for multi-agent/multi-worktree usage:**

Each agent/worktree can run its own isolated container using a unique `HOST_PORT` and Docker Compose project name (`-p`):

```powershell
cd <worktree-path>
$env:HOST_PORT = "<port>"
docker compose -p <project-name> build
docker compose -p <project-name> up -d
# Validate: curl http://localhost:<port>/healthz
# E2E: $env:BASE_URL = "http://localhost:<port>"; npx playwright test
docker compose -p <project-name> down
```

**Port scheme:**

| Agent | wt-1 | wt-2 | wt-3 | wt-4 |
|-------|------|------|------|------|
| Main (no suffix) | 4011 | 4012 | 4013 | 4014 |
| _copilot2 | 4021 | 4022 | 4023 | 4024 |
| _copilot3 | 4031 | 4032 | 4033 | 4034 |
| _copilot4 | 4041 | 4042 | 4043 | 4044 |

Project name format: `gwn-<suffix>-wt<N>` (e.g., `gwn-c4-wt1`). Default port (no HOST_PORT) is 3000.

**Note:** Container E2E tests use the same `SYSTEM_API_KEY` value as playwright.config.mjs (`test-system-api-key`). If adding a new docker-compose file, ensure it uses the same key.

**Cold start simulation:** Test the ProgressiveLoader UX with simulated delays:
```powershell
$env:GWN_DB_DELAY_PATTERN = "45000,15000,0,0,0,0"  # cycling: cold → warm → instant ×4 → repeat
# or
$env:GWN_DB_DELAY_MS = "20000"               # fixed 20s delay
```

### MSSQL Local Development

Run the full stack (SQL Server 2022 + app + Caddy HTTPS proxy + OTLP collector) for production-like local validation:

```powershell
# Start the MSSQL stack (first run pulls ~1.5GB MSSQL image)
npm run dev:mssql

# Run E2E tests against the MSSQL stack
npm run test:e2e:mssql

# Enable cold start simulation (delay overlay)
npm run dev:mssql:coldstart

# Tear down all containers
npm run dev:mssql:down
```

**Notes:**
- First-time MSSQL image pull is ~1.5GB — allow several minutes on slow connections.
- The stack requires Docker Compose v2+ (verified automatically by `scripts/check-compose-v2.js`).
- MSSQL image is pinned to `2022-CU17-ubuntu-22.04` for reproducibility. CI will pull directly from MCR (mcr.microsoft.com) — no GHCR mirror needed (Phase 6 planned).
- **OTel packages must be updated together.** The `@opentelemetry/exporter-trace-otlp-http` dependency is pinned to a version compatible with `@opentelemetry/sdk-node`. When updating any OTel package, verify compatibility across all OTel deps (see CS25-4c).

---

## 4. Logging Conventions

The project uses **Pino** for structured JSON logging (`server/logger.js` singleton). All server code must use the logger — never `console.*` (except in `config.js` and the early bootstrap path in `telemetry.js`, where the logger is not yet available due to load order).

**Defaults per environment:**
- **development:** `debug` (with pino-pretty for human-readable output)
- **test:** `silent` (suppress all output during test runs)
- **production / staging:** `info` (JSON, machine-parseable)
- Override with `LOG_LEVEL` env var (validated: `fatal | error | warn | info | debug | trace | silent`)

### Structured Context Guidelines

Always pass a context object as the **first** argument to log methods, followed by a human-readable message:

```js
logger.info({ userId, matchId, rounds: 5 }, 'Match created');
logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled request error');
```

### Sensitive Data Handling

**Never log these manually:**
- Passwords, password hashes, JWT secrets, or full JWT tokens
- Database connection strings
- Raw request bodies that may contain user credentials
- PII beyond username (no email, no IP addresses persisted to database, etc.)

Pino `redact` config automatically removes `authorization`, `cookie`, `x-api-key`, `x-access-token`, and `set-cookie` headers from logs.

---

## 5. Git Workflow

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


---

## Documentation Conventions

**Link, don't restate.** A documentation file either *is* the source of truth for a fact, or it *links to* the source of truth — it never paraphrases. When a value lives authoritatively in a workflow file, script, schema file, config file, or the filesystem itself, docs that need to refer to that value must link to the authoritative source rather than repeat the value inline. Restated values silently rot the moment the source changes, and every cross-doc factual conflict we have hit to date has been a restatement-drift symptom.

**Acceptable techniques:**
- Direct relative file link to the authoritative source: `[deploy.sh](infra/deploy.sh)`, `[prod-deploy.yml](.github/workflows/prod-deploy.yml)`
- Anchor link to a specific heading in another doc: `[CONTEXT.md § Blockers / Open Questions](CONTEXT.md#blockers--open-questions)`
- Embedded codeblock with an `<!-- include: path#anchor -->` marker (forward-looking — the consistency checker added in CS43-2 will eventually validate these are kept in sync with their source)
- Linking at the GitHub-rendered file/folder listing rather than maintaining a hand-curated table: `[the workflows directory](.github/workflows/)`, `[completed clickstops](project/clickstops/done/)`

**Anti-pattern — do not do this:** restating a value inline that lives authoritatively in a workflow, script, schema, or config file. Concrete drift symptoms this rule guards against (all live on `main` at the time of writing):
- `infra/README.md` claiming production runs on "container-local SQLite" when production actually runs on Azure SQL (the truth lives in `prod-deploy.yml` and `deploy.sh`).
- `CONTEXT.md` listing CS17 as ✅ Complete with task count 4/8 while the clickstop file in `project/clickstops/done/` says otherwise.
- The same health-monitor cadence described as "every 5 minutes" in one doc and "every 6 hours" in another, when the workflow file is the only authoritative source.

**Rationale:** removing the surface where paraphrase can occur eliminates the only place where two docs can disagree about a fact that has a single owner. See [LEARNINGS.md § Doc currency](LEARNINGS.md) for the full origin story and the drift symptoms that motivated the rule.

**Scope:** this rule applies to all `.md` files in the repository, including `README.md`, `CONTEXT.md`, `WORKBOARD.md`, `LEARNINGS.md`, `infra/README.md`, every file under `project/`, and every clickstop file. It does *not* apply to source-code comments, where local restatement is often the clearest option.

**Transitional note:** today's `CONTEXT.md` summary table and per-clickstop blocks restate status and task counts that live authoritatively in the clickstop files — a known violation of this rule. CS43-3 restructures `CONTEXT.md` to comply. Until that lands, the existing instructions for updating `CONTEXT.md` (in [§ CONTEXT.md — Project State Updates in `TRACKING.md`](TRACKING.md#contextmd--project-state-updates) and [§ Clickstop File Lifecycle in `TRACKING.md`](TRACKING.md#clickstop-file-lifecycle)) still apply; the principle is the target state, not a license to leave `CONTEXT.md` half-updated in the meantime.

**Automated check:** `npm run check:docs` (script: [`scripts/check-docs-consistency.js`](scripts/check-docs-consistency.js)) enforces the mechanical half of this rule on every PR via the `Docs Consistency` workflow. The check runs in **warn-only** mode today (CS43-2) and will be flipped to a hard gate by CS43-7 once the baseline is cleaned up. Rule names: `link-resolves`, `clickstop-link-resolves`, `prefix-matches-status`, `unique-cs-state`, `done-task-count`, `no-orphan-active-work`, `workboard-stamp-fresh`. For a legitimate exception, add an `<!-- check:ignore <rule-name> -->` HTML comment either inline on the offending line or on its own line directly above the affected markdown block. Use sparingly — every escape-hatch comment is an admission that the principle is not being upheld.

---

**Database migrations must be backward-compatible** (additive only: new columns with defaults, new tables) to ensure rollback safety.

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

