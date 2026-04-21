# Quick Reference Checklist

Re-read this section after every `git pull`, even if INSTRUCTIONS.md didn't change.

- Claiming a clickstop → update WORKBOARD.md (commit+push), rename CS file to active_, update content, commit to main
- Closing a clickstop → rename CS file to done_, move to `project/clickstops/done/`, update content with results, update CONTEXT.md, remove from WORKBOARD.md
- Preferred model: Claude Opus 4.6 for sub-agents, Opus 4.6 (1M context) for orchestrators, GPT 5.4 for reviews
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
- Run local review loop (GPT 5.4) before Copilot review — skip Copilot for docs-only PRs
- Report progress to user after dispatching agents — never go silent
- Commit after each meaningful step — don't batch unrelated changes
- Record local review findings in PR description
- Do not remove task from WORKBOARD.md until PR is merged and task is fully complete
- When removing content from INSTRUCTIONS.md, ensure it lands in CONTEXT.md or README.md — no information loss
- Never skip any part of the process without asking the user first — no self-decided shortcuts
- The process applies to all changes regardless of size — there is no "too small for a PR" threshold

---

# Development Instructions

This document defines architecture decisions, coding standards, testing strategy, and git workflow for the **Guess What's Next** project.

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

### Agent Progress Reporting

All implementation work happens in background agents on worktrees — never in the main session. Non-worktree tasks (research, investigation, planning) may also run as background agents without a worktree slot (see § Parallel Agent Workflow). Worktree agents handle the full implementation lifecycle autonomously: code changes → validation → PR creation → local review loop → Copilot review (code/config PRs only). The orchestrating agent only intervenes to merge approved PRs.

Background agents **must** report progress to the orchestrating agent:
- **On start:** "Starting CS11-64 in wt-1 on branch yoga-gwn/cs11-64-provision-azure-sql"
- **On milestone:** "CS11-64: completed \<step\>, running validation..."
- **On validation pass:** "CS11-64: lint ✓ test ✓ e2e ✓ — creating PR"
- **On validation fail:** "CS11-64: validation FAILED — \<error summary\>. Fixing..."
- **On abort:** "CS11-64: BLOCKED — \<reason\>. Needs orchestrator intervention."
- **On PR created:** "CS11-64: PR #\<N\> created, running local review"
- **On review loop:** "CS11-64: local review clean — requesting Copilot review" (code/config PRs) or "CS11-64: local review clean — docs-only, skipping Copilot" (docs-only PRs)
- **On ready:** "CS11-64: PR #\<N\> ready for merge (reviews complete, CI green)"
- **On deployment approval gate:** When monitoring a staging or production deploy, the monitoring agent must immediately report when an approval gate is reached — do not wait for the full workflow to complete. The orchestrator must immediately notify the user with the approval URL. Approval gates are:
  - **Staging:** After "Fast-Forward release/staging" job completes → "Deploy to Azure Staging" waits for `environment: staging` approval
  - **Production:** After "Validate Deployment Inputs" job completes → "Deploy to Azure Production" waits for `environment: production` approval
  The monitoring agent should poll job status and when the predecessor job shows `completed` and the deploy job shows `status: waiting`, alert immediately.

**Deployment monitoring agent prompts must include:**
- The specific approval gate to watch for (which job triggers the gate)
- Instruction to report the approval gate immediately when reached, with the approval URL
- Instruction to NOT wait for full workflow completion before reporting approval gates

The orchestrating agent **must actively relay progress to the user** — never dispatch tasks and wait silently. When multiple tasks run in parallel, provide a summary table of all task statuses.

**Milestone timing table:** Sub-agents must include a timing table in their final completion report. This tracks elapsed time from session start for each major milestone (e.g., "npm install", "implementation", "validation", "PR created", "review clean"). This was identified as a process improvement during CS25 to help identify workflow bottlenecks.

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
1. Run `git pull` to ensure the latest changes from all agents
2. Read INSTRUCTIONS.md in the repository root
3. Read WORKBOARD.md for current active work and task assignments
4. Read CONTEXT.md for project state and available clickstops
5. Determine agent ID from hostname + repo suffix (see § Agent Identification)
6. Update WORKBOARD.md to register the session (update Orchestrators table), then commit and push immediately
7. Once a task is claimed, prompt user to rename the session: `/rename [{agent-id}]-{task-id}: {clickstop name}`

**Orchestrator responsiveness:** The orchestrator must never block on work it can delegate. All delegatable work — code changes in worktrees; investigation, research, and analysis as non-worktree background agents — must run as background agents. The orchestrator's sole purpose is to stay available for user input and sub-agent coordination. The only synchronous work the orchestrator does is: reading/re-reading docs, lightweight planning and task decomposition, git operations on main (`git pull`, `git worktree add/remove`), updating WORKBOARD.md, creating and committing clickstop plan files, merging approved PRs, and communicating with the user. After dispatching a background agent, do not continue working on that task — report dispatch status to the user and wait for the next user message or agent completion notification.

**Deployment monitoring:** When a staging or production deploy is triggered, the orchestrator must not rely solely on the monitoring agent to report approval gates. The orchestrator should proactively check deploy status after the expected predecessor step completes (staging: ~5-10 min for fast-forward; production: ~1-2 min for input validation) and notify the user immediately if approval is pending. Never let an approval gate sit unnotified.

**Deployment approval policy:**
- **Staging:** Orchestrator may approve via API after verifying smoke tests passed
- **Production:** Orchestrator must notify the user and wait for explicit approval — never auto-approve production deploys

**No-shortcut policy:** Agents must never skip any part of the defined workflow (worktree, PR, review loop, workboard updates) without explicit user approval. The process applies equally to all changes regardless of perceived size or complexity — there is no "too small" threshold. If an agent believes a shortcut is warranted, it must ask the user before proceeding.

**Stale instructions guard:** After every `git pull` on main, check if INSTRUCTIONS.md was updated (e.g., `git --no-pager diff ORIG_HEAD..HEAD -- INSTRUCTIONS.md`). If it changed, re-read it before continuing work. This ensures the orchestrator always operates under the latest guidelines, especially when other agents' PRs update process documentation. Additionally, re-read the Quick Reference Checklist at the top of this file after every `git pull`, regardless of whether the file changed.

**Copilot CLI commands (reference):** The user has access to CLI commands that the orchestrator should be aware of:
- `/rename <name>` — rename the current session (orchestrator should prompt for this after claiming a task)
- `/remote` — start a remote cloud session
- `/tasks` — view running background tasks

**Sub-agents in worktrees** — handle all implementation work. Each sub-agent gets a worktree slot with a meaningful branch name (e.g., `yoga-gwn/cs0-lean-instructions`, `yoga-gwn/cs5-37-ws-reconnect`).

Sub-agents are responsible for:
- All implementation file changes (code, docs, config) and all commits/pushes in worktrees
- PR creation (`gh pr create`)
- Copilot review loop (code/config PRs: reply to comments, resolve threads, re-request review; docs-only PRs: skip Copilot review)
- Merge conflict resolution (rebase/merge `origin/main` into the feature branch)

This keeps `main` clean and ensures implementation changes flow through PRs. (Clickstop plan files and WORKBOARD.md are the exceptions — those are committed directly on `main` by the orchestrator.)

**Sub-Agent Checklist** (include verbatim in every sub-agent prompt — the orchestrator must provide: task ID, acceptance criteria, worktree slot, branch name, port, and edge cases):
1. Read INSTRUCTIONS.md in the repository root before starting any work
2. Read WORKBOARD.md for current project context and active work
3. Run `npm install` in worktree
4. Set `$env:PORT = "300N"` for the assigned slot
5. Implement the task (commit after each meaningful step with `Agent:` trailer and `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer)
6. Rebase onto latest main before pushing: `git fetch origin && git rebase origin/main`. If conflicts arise, resolve them and re-run validation.
7. Run full validation: `npm run lint && npm test && npm run test:e2e` (skip for docs-only PRs). If validation fails, fix and re-run (up to 3 attempts). If stuck, report failure details to the orchestrator and stop.
8. Push branch and create PR with task ID in title and agent metadata in description
9. Run local review loop (see § Local Review Loop): launch `code-review` agent with `model=gpt-5.4`, fix issues, push fixes, repeat until clean
10. **Document local review findings in PR description** (see § Local Review Loop for format)
11. **For code/config PRs:** Request Copilot review: `gh pr edit <PR#> --add-reviewer "@copilot"` — wait for review per § Waiting for Copilot Review
12. **For docs-only PRs:** Skip Copilot review — local review is sufficient
13. Address all review comments (reply + fix + resolve threads)
14. Re-request review and repeat until clean (code PRs only)
15. Report completion with PR number and summary
16. **Include a milestone timing table** in the final report (step name + elapsed time from session start). This helps identify bottlenecks in the agent workflow.

**Model selection:** The preferred model for all sub-agent implementation work is `claude-opus-4.6` (Opus). Orchestrator agents should use `claude-opus-4.6-1m` (1M context variant) to maintain full session context across long orchestration sessions. `gpt-5.4` is used for the local review loop (`code-review` agent) — it provides fast, high-signal code review at lower cost. Do not use GPT models for implementation work. See LEARNINGS.md for detailed model evaluation results.

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

The orchestrator must maximize parallelism by running non-worktree tasks concurrently with worktree tasks. There is no fixed limit on non-worktree background tasks.

**Agent setup:** Each worktree needs `npm install` and `$env:PORT = "300X"`. Database auto-creates at `data/game.db`. Each worktree gets its own independent database.

**Branch lifecycle:**
1. Work on `{agent-id}/{task-id}-{description}` branch in slot
2. **Commit after each meaningful step** with a descriptive message — don't wait until the end
3. Run full validation before pushing: `npm run lint && npm test && npm run test:e2e`
4. Push branch to origin
5. Create PR: `gh pr create --base main --head {agent-id}/{task-id}-{description}`
6. Run local review loop (see § Local Review Loop) — fix issues, push fixes, repeat until clean
7. **Code/config PRs:** Request Copilot review: `gh pr edit <PR#> --add-reviewer "@copilot"` | **Docs-only PRs:** Skip Copilot review
8. Address review feedback — commit each round of fixes separately and answer each comment meaningfully and close comment when changes are committed.
9. After CI passes and reviews are complete (Copilot approval for code/config PRs; local review clean for docs-only PRs), **squash-merge** via GitHub UI or `gh pr merge --squash`
10. Main orchestrating agent pulls after each merge: `git pull`

**Recycling slots:** `git worktree remove <path> --force` → `git branch -d old-branch` → `git worktree add -b new-branch <path> main`

### Documentation Conventions

**Link, don't restate.** A documentation file either *is* the source of truth for a fact, or it *links to* the source of truth — it never paraphrases. When a value lives authoritatively in a workflow file, script, schema file, config file, or the filesystem itself, docs that need to refer to that value must link to the authoritative source rather than repeat the value inline. Restated values silently rot the moment the source changes, and every cross-doc factual conflict we have hit to date has been a restatement-drift symptom.

**Acceptable techniques:**
- Direct relative file link to the authoritative source: `[deploy.sh](infra/deploy.sh)`, `[prod-deploy.yml](.github/workflows/prod-deploy.yml)`
- Anchor link to a specific heading in another doc: `[CONTEXT.md § Known Issues](CONTEXT.md#known-issues)`
- Embedded codeblock with an `<!-- include: path#anchor -->` marker (forward-looking — the consistency checker added in CS43-2 will eventually validate these are kept in sync with their source)
- Linking at the GitHub-rendered file/folder listing rather than maintaining a hand-curated table: `[the workflows directory](.github/workflows/)`, `[completed clickstops](project/clickstops/done/)`

**Anti-pattern — do not do this:** restating a value inline that lives authoritatively in a workflow, script, schema, or config file. Concrete drift symptoms this rule guards against (all live on `main` at the time of writing):
- `infra/README.md` claiming production runs on "container-local SQLite" when production actually runs on Azure SQL (the truth lives in `prod-deploy.yml` and `deploy.sh`).
- `CONTEXT.md` listing CS17 as ✅ Complete with task count 4/8 while the clickstop file in `project/clickstops/done/` says otherwise.
- The same health-monitor cadence described as "every 5 minutes" in one doc and "every 6 hours" in another, when the workflow file is the only authoritative source.

**Rationale:** removing the surface where paraphrase can occur eliminates the only place where two docs can disagree about a fact that has a single owner. See [LEARNINGS.md § Doc currency](LEARNINGS.md) for the full origin story and the drift symptoms that motivated the rule.

**Scope:** this rule applies to all `.md` files in the repository, including `README.md`, `CONTEXT.md`, `WORKBOARD.md`, `LEARNINGS.md`, `infra/README.md`, every file under `project/`, and every clickstop file. It does *not* apply to source-code comments, where local restatement is often the clearest option.

**Transitional note:** today's `CONTEXT.md` summary table and per-clickstop blocks restate status and task counts that live authoritatively in the clickstop files — a known violation of this rule. CS43-3 restructures `CONTEXT.md` to comply. Until that lands, the existing instructions for updating `CONTEXT.md` (in the [§ CONTEXT.md — Project State Updates](#contextmd--project-state-updates) and [§ Clickstop File Lifecycle](#clickstop-file-lifecycle) sections below) still apply; the principle is the target state, not a license to leave `CONTEXT.md` half-updated in the meantime.

**Automated check:** `npm run check:docs` (script: [`scripts/check-docs-consistency.js`](scripts/check-docs-consistency.js)) enforces the mechanical half of this rule on every PR via the `Docs Consistency` workflow. The check runs in **warn-only** mode today (CS43-2) and will be flipped to a hard gate by CS43-7 once the baseline is cleaned up. Rule names: `link-resolves`, `clickstop-link-resolves`, `prefix-matches-status`, `unique-cs-state`, `done-task-count`, `no-orphan-active-work`, `workboard-stamp-fresh`. For a legitimate exception, add an `<!-- check:ignore <rule-name> -->` HTML comment either inline on the offending line or on its own line directly above the affected markdown block. Use sparingly — every escape-hatch comment is an admission that the principle is not being upheld.

### Clickstop & Task Management

**Clickstops** are the unit of deliverable work — each represents a feature, capability, or related set of changes. **Tasks** are the breakdown within a clickstop.

#### Task IDs
Format: `CS<clickstop#>-<task#>` (e.g., `CS11-64`, `CS14-82`). Used in branch names, commit messages, PR titles, and WORKBOARD.md.

**CS number allocation:** Before assigning a new clickstop number, verify the number is not already taken by checking all three sources:
1. **Existing clickstop files:** `ls project/clickstops/` and `ls project/clickstops/done/` — check all `planned_`, `active_`, and `done_` files for the highest CS number
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
- An orchestrator starts any work — including non-clickstop tasks (ad-hoc requests, deployments, investigations). Use empty Task ID and Clickstop columns ("—") for non-CS work.
- A task completes (remove from Active Work)
- A task becomes blocked (keep in Active Work with a note indicating blocked status)
- An orchestrator starts or stops a session (update Orchestrators table)

**Session naming:** After updating the workboard to claim a task, prompt the user to rename the session so it's identifiable at a glance. Format: `[{agent-id}]-{task-id}: {clickstop name}`. Example:
```
/rename [yoga-gwn-c2]-CS17-1: Process Documentation Improvement
```

**Update frequency:** Orchestrators should update WORKBOARD.md often — at minimum on task start, task complete, and session start/end. Between those events, update whenever meaningful progress occurs (e.g., PR created, review round complete).

**Timestamps:** Use ISO 8601 format with time in the "Started" column and "Last updated" header: `2026-04-12T18:27Z` (not just `2026-04-12`). Time precision matters when multiple agents claim tasks on the same day.

**Task locking:** When a task appears in Active Work assigned to an agent ID, no other orchestrator may pick up that task. The assignment is a lock. If an orchestrator crashes or stops working:
- The task remains assigned in WORKBOARD.md
- When that orchestrator restarts, it reads WORKBOARD.md, finds its assigned tasks, and resumes work
- There is no automated process for reassigning stalled tasks — a human must manually update WORKBOARD.md to release the lock if an orchestrator is permanently unavailable

**Row ownership:** Each orchestrator may only modify its own rows in Active Work. When completing a task, remove only your own row — never edit or remove another agent's entries. When adding a task, append a new row without altering existing rows.

**Task ownership extends to files:** Never modify, rename, or interact with files related to another agent's active task. Before making changes, check WORKBOARD.md Active Work to ensure no other agent owns that clickstop or file. If a merge conflict involves another agent's files, keep their content unchanged (additive merge).

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

Each clickstop gets a detail file with a status prefix. Active and planned files live in `project/clickstops/`; completed files are archived in `project/clickstops/done/`:

| Prefix | Location | Meaning | Example |
|--------|----------|---------|---------|
| `planned_` | `project/clickstops/` | Defined but no tasks started | `planned_cs19_community-puzzle-navigation.md` |
| `active_` | `project/clickstops/` | Has work in progress | `active_cs11_database-migration.md` |
| `done_` | `project/clickstops/done/` | Fully complete | `done_cs10_cicd-pipeline.md` |

**File format:** Each file contains the clickstop title, status, goal, full task table (with CS-prefixed IDs), design decisions, and notes (parallelism, architecture details).

**Claiming a clickstop (step-by-step):**

1. Update WORKBOARD.md Active Work table — add your row with task ID, description, agent ID, worktree, branch. Commit and push immediately.
2. Create or update the CS file in `project/clickstops/`:
   - If the clickstop is new: create `planned_{cs-id}_{kebab-name}.md` with task table and design notes
   - If work is starting immediately: rename from `planned_` to `active_` (`git mv`), update Status field to 🔄 In Progress
3. Commit the CS file to main before dispatching any sub-agents (prevents untracked file conflicts on `git pull`)
4. Prompt user to rename session: `/rename [{agent-id}]-{task-id}: {clickstop name}`

**Closing a clickstop (step-by-step):**

1. Rename CS file from `active_` (or `planned_`) to `done_` and move from `project/clickstops/` to `project/clickstops/done/` using `git mv`
2. Update the CS file content:
   - Status → ✅ Complete
   - All tasks marked ✅ Done in the task table
   - Add PR references (number + link) and merge dates
   - Fill in the completion checklist
3. Update CONTEXT.md: set status to ✅ Complete in the summary table, update task counts (e.g., 6/6), and update ALL archive links (both in the summary table and in the clickstop detail sections) to point to the `done_` file in `project/clickstops/done/`
4. Remove your row from WORKBOARD.md Active Work, commit and push immediately

**Important:** Steps 1-3 of closing are typically done in the implementation PR (bundled with the last code change). Step 4 (workboard update) is done by the orchestrator on main after merging.

CONTEXT.md always contains only a short summary (2-4 lines) per clickstop with a link to the detail file. Full task tables, design decisions, and architecture details live in the clickstop files.

Legacy archives from before CS0 may omit the completion checklist.

**CS number conflicts:** Before creating a new clickstop, check ALL existing files in `project/clickstops/` (`planned_`, `active_`) and `project/clickstops/done/` (`done_`). Pick the next unused number. Multiple agents creating clickstops concurrently can cause number collisions if they only check one prefix.

### Local Review Loop (GPT 5.4)

Before requesting Copilot PR review, sub-agents **must** run a local review loop using the `code-review` agent with model `gpt-5.4`. This catches issues in ~60 seconds vs the 2-10 minute Copilot polling cycle.

**Local review procedure:**
1. After pushing changes and creating the PR, launch a local review:
   ```
   task agent_type=code-review model=gpt-5.4:
     "Review changes on branch <branch-name> in <worktree-path>.
      Run `git --no-pager diff main...HEAD` to see changes.
      Focus on: bugs, security, correctness, broken links, factual accuracy.
      Only flag issues that genuinely matter."
   ```
2. Address all issues found by the local review — commit fixes
3. Re-run the local review until clean (no issues found)
4. **Then** proceed to Copilot review or skip, based on PR type:

**Documenting review findings:**
After each local review round, update the PR description with a log of findings and fixes:
```
### Local Review Log
| Round | Finding | Fix |
|-------|---------|-----|
| 1 | CONTEXT.md workflow text still says "pre-branch-protection" | Fixed in [`abc1234`](commit-url) |
| 2 | CS26-8 references WORKBOARD.md instead of INSTRUCTIONS.md | Fixed in [`def5678`](commit-url) |
| 3 | Clean — no issues found | — |
```
This preserves the review audit trail in the PR for future reference.

**PR type determines Copilot review requirement:**

| PR Type | Local Review | Copilot Review | Rationale |
|---------|-------------|----------------|-----------|
| **Code changes** (features, fixes, refactors) | ✅ Required | ✅ Required | Code needs both fast local + thorough Copilot review |
| **Docs-only** (clickstop files, CONTEXT.md, README, INSTRUCTIONS.md) | ✅ Required | ⏭️ Skip | Local review is sufficient; Copilot review adds 10+ min overhead for no additional value |
| **Config/CI changes** (workflows, Dockerfile, docker-compose) | ✅ Required | ✅ Required | Security-sensitive changes need Copilot review |

**Docs-only PR definition:** A PR is docs-only if it modifies ONLY files with extensions `.md`, or files in `project/clickstops/` or `project/clickstops/done/`. If ANY non-docs file is changed, treat it as a code PR.

**Copilot PR Review Policy:**
- Every code/config PR must be reviewed by Copilot before merging (docs-only PRs may skip — see Local Review Loop above)
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

After requesting review, Copilot takes **2–5 minutes** to post its review. **DO NOT** assume an empty review list means approval — it means Copilot hasn't responded yet. Poll every 60 seconds, up to 10 times (10 minutes total). After 10 attempts, report a timeout to the orchestrating agent. Compare Copilot review count before/after using:
```powershell
gh api repos/henrik-me/guesswhatisnext/pulls/<PR#>/reviews --jq '[.[] | select(.user.login == "copilot-pull-request-reviewer")] | length'
```
Check latest review state (`APPROVED`, `CHANGES_REQUESTED`, or `COMMENTED`):
```powershell
gh api repos/henrik-me/guesswhatisnext/pulls/<PR#>/reviews --jq '[.[] | select(.user.login == "copilot-pull-request-reviewer")] | last | .state'
```

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

For deployment environments, CI/CD pipeline, and rollback policy, see [CONTEXT.md](CONTEXT.md) and [README.md](README.md).

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

