# Quick Reference Checklist

Re-read this section after every `git pull`, even if INSTRUCTIONS.md didn't change.

- Claiming a clickstop → update WORKBOARD.md (commit+push), rename CS file to active_, update content, commit to main
- Closing a clickstop → rename CS file to done_, move to `project/clickstops/done/`, update content with results, remove from WORKBOARD.md
- Preferred model: Claude Opus (4.7 or higher, 1M context variant when available) for both orchestrators and sub-agents, GPT (5.5 or higher) for reviews
- CS number conflicts → check done_, active_, AND planned_ files before picking a new number
- After claiming a task → prompt user to rename session: `/rename [{agent-id}]-{task-id}: {clickstop name}`
- When planning a CS, favor structures that allow parallel work. Use `<phase><letter>` (e.g. `CS65-1a`, `CS65-1b`) for parallel-safe siblings; use sequential numbers (`CS65-1`, `CS65-2`) only when a true ordering dependency exists. State `**Depends on:**` and `**Parallel-safe with:**` in the plan-file frontmatter so other orchestrators can pick up work without re-reading prose. See [§ Naming Conventions in TRACKING.md](TRACKING.md#naming-conventions) for the canonical format.
- These planning conventions apply to clickstop CS work only. Ad-hoc orchestrator work (deploys, quick fixes, investigations not yet a CS) continues to use the `OPS-<short-name>` WORKBOARD placeholder pattern with no plan file and no frontmatter — see [§ WORKBOARD.md — Live Coordination in TRACKING.md](TRACKING.md#workboardmd--live-coordination).
- Session start → `git pull`, then **derive your agent ID from `hostname`** as `{first-meaningful-hostname-segment-lowercase}-gwn[-c<N> if folder is `guesswhatisnext_copilot<N>`]` per [§ Agent Identification in TRACKING.md](TRACKING.md#agent-identification). Examples: `HENRIKM-YOGA` → `yoga-gwn`, `HENRIKM-OMNI` (in `…\guesswhatisnext_copilot3`) → `omni-gwn-c3`. NEVER infer agent ID from cwd path alone — multiple machines share identical folder layouts. (The first-response requirement is in the next bullet, alongside the reread receipt.)
- Session-start full reread (mandatory baseline) → at the start of every orchestrator run — including brand-new sessions, fresh repo clones, and any restored or resumed session (treat resume as session start for this rule) — view the entire `INSTRUCTIONS.md` (use multiple `view_range` calls if it exceeds the 50KB single-read cap) and, in your first response, explicitly state both your derived agent ID and `INSTRUCTIONS.md re-read complete @ <SHA>` before doing other work. Do this even if the session-start `git pull` was a no-op. The pull-driven re-read (next bullet) is incremental on top of this baseline. "I read it carefully" is not a substitute for the verifiable receipt.
- After every `git pull` → re-read this checklist (always, even on a no-op pull). Additionally, if the pull was non-empty AND its diff touches `INSTRUCTIONS.md`, repeat the full-file reread + receipt for the new SHA per the previous bullet. A no-op pull does NOT trigger the full-file reread on its own; the session-start reread already covered that.
- Never do implementation work in main checkout — dispatch to worktree sub-agents
- Never modify files related to another agent's active task — check WORKBOARD.md first
- Maximize parallelism — dispatch independent tasks simultaneously
- Update WORKBOARD.md Active Work when starting ANY work, not just clickstop tasks — use a non-empty `CS-Task ID` placeholder (e.g. `OPS-…`) for non-CS work; see [§ WORKBOARD entry template in TRACKING.md](TRACKING.md#workboard-entry-template) for the canonical 6-column / 2-row-per-entry shape
- Update WORKBOARD.md immediately on task claim/complete — commit AND push (use ISO datetime: `2026-04-12T18:27Z`)
- Only modify your own rows in WORKBOARD.md Active Work (both the status row and its description-continuation row count as your row)
- Check CS number conflicts before creating new clickstops
- Commit clickstop plan file to main BEFORE starting implementation work
- Deferred items → must land in a CS via one of four dispositions (add to current CS / file new `planned_` CS / add to existing planned-or-active CS / cancel with reason). Appendix-in-done-file alone is INSUFFICIENT — see [§ Deferred work policy in TRACKING.md](TRACKING.md#clickstop-completion-checklist). Never silently drop.
- Sub-agent prompts must include full Sub-Agent Checklist verbatim
- Sub-agent checklist canonical source: [docs/sub-agent-checklist.md](docs/sub-agent-checklist.md). OPERATIONS.md § Sub-Agent Checklist is the policy framing; the file is the verbatim list.
- Run local review loop (GPT 5.5 or higher) before Copilot review — skip Copilot for docs-only PRs
- Report progress to user after dispatching agents — never go silent; relay every sub-agent turn/state transition the same turn it lands, post a heartbeat update at least every ~10 min if nothing has transitioned, and on each heartbeat check the fallback progress signals (branch commits, PR state, file mtimes, `tool_calls_completed`) before claiming the agent is idle (see [§ Agent Progress Reporting in OPERATIONS.md](OPERATIONS.md#agent-progress-reporting) and [§ Fallback progress signals in OPERATIONS.md](OPERATIONS.md#fallback-progress-signals-when-sub-agent-is-silent))
- Commit after each meaningful step — don't batch unrelated changes
- Record local review findings in PR description
- Do not remove task from WORKBOARD.md until PR is merged and task is fully complete
- When removing content from INSTRUCTIONS.md, ensure it lands in CONTEXT.md or README.md — no information loss
- Never skip any part of the process without asking the user first — no self-decided shortcuts
- The process applies to all changes regardless of size — there is no "too small for a PR" threshold
- **No DB-waking background work**: no timer/watchdog/scheduler/poller may issue a DB query (incl. `SELECT 1`) on its own — the DB is touched only in response to real user requests, operator curl, or operator-invoked batch jobs (see [§ Database & Data in INSTRUCTIONS.md](#database--data))
- **Cold-start container validation gates check-in**: any PR touching server/client runtime or DB-touching code must run `npm run container:validate` (full restart + smoke probe) before each review request and after each fix push, and record the result in `## Container Validation` in the PR body (see [§ Cold-start container validation in OPERATIONS.md](OPERATIONS.md#cold-start-container-validation))
- **Telemetry & observability gate (mandatory)**: any PR adding/changing a code path, error path, dependency call, or background activity MUST add the matching telemetry signal AND a documented KQL query in [`docs/observability.md`](docs/observability.md) AND validate the signal across local container + staging + production. Record results in `## Telemetry Validation` in the PR body (see [§ 4a Telemetry & Observability in INSTRUCTIONS.md](INSTRUCTIONS.md#4a-telemetry--observability-mandatory-for-all-new-work)). No "too small for telemetry" exemption.
- **Pre-prod validation gate is in CI, not Azure staging**: the enforced gate before a production deploy is the Ephemeral Smoke Test job in [`.github/workflows/staging-deploy.yml`](.github/workflows/staging-deploy.yml) plus local `npm run container:validate` cycles per [§ Database & Data](#database--data). The Azure `gwn-staging` Container App is being moved to scale-to-zero (live state tracks [CS58-1/CS58-2](project/clickstops/done/done_cs58_scale-staging-to-zero.md)) and exists only for ad-hoc operator probing — it is not a release gate. See [§ Waking staging for ad-hoc validation in OPERATIONS.md](OPERATIONS.md#waking-staging-for-ad-hoc-validation).
- **Investigation artifacts → `shots/`** (gitignored): screenshots, repro captures, HAR-supplementary images go in top-level `shots/` named `[<orchestrator-id>][<CS-ID>-<TASK-ID>] <desc>.<ext>` (see [§ Investigation artifacts](#investigation-artifacts))
- **Never rename a branch with an open PR.** GitHub's branch-rename API does NOT migrate the open PR's `head.ref` — the PR auto-closes and a fresh PR must be opened from the renamed branch (with body + cross-link reproduced manually). Hit on PR #241 → #255 in CS53-23. If a branch needs renaming, close the PR first, then rename, then open a new PR with the cross-link.
- **PR descriptions with non-ASCII (em-dashes, §, ✅, etc.) — use `gh pr edit --body-file <utf8.md>`, NOT `--body "$here_string"`.** PowerShell here-strings mangle UTF-8 when piped to `gh pr edit --body` (— → `╬ô├ç├╢`, § → `Γö¼┬║`). Always write the body to a UTF-8 file and pass `--body-file` (also avoids shell-quoting headaches on multi-line bodies). Hit twice on PR #255.
- **Long-running PR + churning main: owner-approved `--admin` squash merge is the escape hatch from infinite-rebase loops** — repository owner / delegated admin only, and only after explicit user approval. Branch protection requires up-to-date branches and `gh pr merge --auto` is disabled in this repo, so a normal orchestrator cannot bypass on its own. See [§ Long-running PRs in fast-churning main in OPERATIONS.md](OPERATIONS.md#long-running-prs-in-fast-churning-main) for the full procedure (CI-green threshold, merge-tree sanity check, audit-trail comment) and [§ WORKBOARD.md — Live Coordination in TRACKING.md](TRACKING.md#workboardmd--live-coordination) for the broader owner-only-bypass framing.

---

---

# Development Instructions

This file contains durable policy (architecture, coding standards, testing, logging, performance). For procedural documentation, see:

- [OPERATIONS.md](OPERATIONS.md) — agent workflow, parallelism, deployment, branch/merge model
- [REVIEWS.md](REVIEWS.md) — local review loop, Copilot PR review policy, review comment handling
- [TRACKING.md](TRACKING.md) — clickstop lifecycle, WORKBOARD state machine, CONTEXT update protocol

For current project state and codebase architecture, see **CONTEXT.md**. For active/planned/done clickstops, browse `project/clickstops/{active,planned,done}/` (run `git pull` first). For live work coordination, see **WORKBOARD.md**. For architecture decisions and learnings, see **LEARNINGS.md**.

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

#### Feature flag testing across environments (CS40)

Where request overrides (`?ff_<key>=true` query param or `X-Gwn-Feature-<Key>` header) are accepted at runtime:

| Context | NODE_ENV | Override accepted? | How |
|---|---|---|---|
| Local dev (`npm run dev`) | `development` | ✅ default-on | No env var needed |
| Vitest unit suite (`npm test`) | `test` | ✅ default-on | No env var needed |
| Local Docker SQLite | `development` | ✅ default-on | No env var needed |
| Local Docker MSSQL (`npm run dev:mssql`) | `production` | ✅ via opt-in | `FEATURE_FLAG_ALLOW_OVERRIDE=true` set in `docker-compose.mssql.yml` |
| Staging-deploy in-CI smoke service (`.github/workflows/staging-deploy.yml`) | `staging` | ✅ via opt-in | `FEATURE_FLAG_ALLOW_OVERRIDE=true` set on the in-CI ephemeral service container only |
| **Live `gwn-staging` ACA app** | `staging` | ❌ never | Env var deliberately absent (verified by CS40-1 audit) |
| **Production (`prod-deploy.yml`, `gwn-prod`)** | `production` | ❌ never | Env var deliberately absent; enforced by `npm run check:feature-flag-policy` |

**E2E test pattern.** Browser specs use `await page.goto('/?ff_<key>=true')`; backend integration tests use the matching `X-Gwn-Feature-<Key>` header on supertest requests. The client (`public/js/app.js`) propagates `ff_*` query params into subsequent API calls so a single navigation toggles the feature for the whole session.

**Forbidden pattern: `FEATURE_<KEY>_PERCENTAGE=100` as an E2E workaround.** It enables the flag for every user — too blunt for per-test control and prevents tests that need flag-OFF behavior in the same run. Use the override mechanism above instead. `npm run check:feature-flag-policy` (chained into `npm test`) flags this pattern in `tests/`, `docker-compose*.yml`, and `.github/workflows/`. Legitimate non-zero rollout values in live-deploy assets (e.g. `prod-deploy.yml` for a real staged rollout) are **not** flagged.

**Production override exposure is locked down by policy:** `npm run check:feature-flag-policy` fails CI if `FEATURE_FLAG_ALLOW_OVERRIDE` is set to a truthy value in `prod-deploy.yml`, `infra/deploy.{sh,ps1}`, or any `infra/**/*.{bicep,json}` Container App template.

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

### Wire-based assertions over host-side log scraping (learning from PR #292 → #300)

E2E tests that verify server behavior **must** assert via the wire (response headers, status codes, JSON body) rather than reading server stdout from a host-mounted file. The reason: Playwright's local `webServer` config tees stdout to `.playwright/server.log` so log scraping appears to work locally, but in CI the app is typically a Docker `services:` container — its stdout goes to container logs, no host-side file is created, and the test fails on something orthogonal to the behavior under test.

**Pattern:** if the assertion needs server-side state that isn't naturally on the wire, surface it as a response header from a shared helper. Example: `server/services/boot-quiet.js` sets `X-Boot-Quiet-DB-Touched`/`-User-Activity`/`-Is-System` so `tests/e2e/boot-quiet.spec.mjs` can assert via `res.headers()` without scraping any file. Same telemetry, just exposed at the wire.

**Anti-pattern:** `fs.readFileSync('.playwright/server.log')` followed by regex matching. Works locally, breaks in CI's Docker-services flow.

### Container Validation

Sub-agents should validate changes in Docker containers before merging. The `docker-compose.yml` supports port isolation via `HOST_PORT` env var.

### HTTP probes inside CI service containers (learning from PR #305 → #308)

Any HTTP probe — service-container `--health-cmd`, the assertion bash loops in smoke jobs, or a sub-agent curl — that targets the app inside a CI service container running with `NODE_ENV=staging` (or `production`) **must** include `X-Forwarded-Proto: https`. Without it, the `httpsRedirect` middleware (`server/middleware/security.js`) returns a 301 to the canonical HTTPS host, the probe sees a non-200, and the container is marked unhealthy or the assertion fails on a status it never expected. This applies to **every** endpoint, including `/healthz` and `/api/db-status` — the bypass list in the request gate is independent from the HTTPS-redirect middleware.

The existing `Ephemeral Smoke Test` job's healthcheck happens to send the header because it probes `/api/health` which already requires it (for the X-API-Key path) — this is incidental, not a property of `/api/health` itself. New jobs probing other endpoints must add the header explicitly. See `.github/workflows/staging-deploy.yml` `Cold-start assertion smoke (CS53-20)` for the canonical pattern.

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

**Cold-start MSSQL connect simulation (`GWN_SIMULATE_COLD_START_MS`):** Used by `npm run container:validate` (CS53 / Policy 2). When set to a positive integer (ms), the FIRST `mssql-adapter._connect()` after process start sleeps that many ms before contacting the server, then proceeds normally. Subsequent connects are not delayed (process-lifetime one-shot). Off by default; only for local container validation — never set in real staging/production deployments (the local validation stack runs with `NODE_ENV=production` by design, so the gate is "not in real prod", not "not in production-mode locally"). Combined with the lazy request-driven init in `server/app.js`, this exercises the warmup/retry path on every container restart so cold-start behavior is regression-protected.

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

## 4a. Telemetry & Observability (mandatory for all new work)

**All new work MUST include relevant telemetry.** "Relevant" is judged at design-review and code-review time, not negotiated after merge. There is no "this change is too small for telemetry" exemption — if a change introduces a new code path, a new failure mode, a new latency-sensitive operation, or a new user-visible behavior, the matching observability must land in the same PR.

This rule exists because every incident-investigation session that has cited [`docs/observability.md`](docs/observability.md) in the past has hit the same wall: the relevant signal was never emitted, so the only recovery was post-incident code archaeology + a follow-up CS to add the missing instrumentation. Catching it at PR time is roughly an order of magnitude cheaper.

### What "relevant telemetry" means

Pick the signals that match what's changing. Most PRs need at least one row from the table below; some need more.

| If the PR adds / changes... | Then the PR must also add... |
|---|---|
| A new HTTP route or significant changes to an existing one | Confirm the request span name, status code, and `operation_Id` propagation work — the auto-instrumentation does this for you, but a one-off probe locally + a documented KQL query for the new route is required. |
| A new outbound dependency (DB query path, HTTP call to another service, file I/O hot path) | A span that covers the operation (or confirmation that auto-instrumentation already covers it — verify by inspecting `traces.json` from the local OTLP collector, not by assuming). The span must carry attributes that let an investigator filter on the failure case (e.g. `db.statement` excerpt for queries, `http.url` for outbound calls). |
| A new error path or guarded fallback (early-return on capacity exhaustion, rate-limit denial, feature-flag short-circuit, etc.) | A structured Pino log line at the appropriate level (`warn` for guarded fallbacks, `error` for unhandled failures), with a context object that names the gate (`{ gate: 'capacity-exhausted', userId, route }`). Plus a KQL query that surfaces it (`requests | where customDimensions.gate == "..."` or `traces | where ...` once the traces table is wired). |
| A new background activity that is permitted (operator-invoked batch jobs only — DB-waking timers/watchdogs/pollers remain forbidden per [§ Database & Data](#database--data)) | A start/end log pair plus a `runId` correlation field, and a KQL query that reports the most recent run's outcome. |
| A new metric-shaped concern (success rate, latency budget, error budget, capacity headroom) | A KQL query that materializes the metric. If the metric needs alerting, the alert is filed as a follow-up CS — but the query must exist before the PR merges. |

### What "outline relevant queries" means

For every signal added, the PR must add (or update) at least one entry in [`docs/observability.md`](docs/observability.md) under § B (or a new sub-section if a new domain warrants it). The query entry must include:

1. The KQL query itself, runnable as-is in App Insights' Logs blade with no edits.
2. Which AI resource(s) it applies to (staging, prod, or both — and if both, why filtering by environment is not needed in the query body).
3. What the investigator is supposed to see when the system is healthy vs unhealthy ("expect ≥1 row per minute under normal load; an empty result for >15 min means X is broken").
4. Cross-links to the code path the query is observing (so future readers can navigate from query → code without grep).

If the change exposes a workflow that needs a different query shape against the staging-vs-prod split (per [`docs/observability.md` § C](docs/observability.md)), document both.

### What "validate across local, staging, and production" means

Each new telemetry signal must be confirmed working in three environments before the PR is considered complete:

1. **Local container (`npm run dev:mssql`).** Spans flow to the local `otel-collector` and land in `/data/traces.json` inside that container. Pull the file out (`docker cp <collector-container>:/data/traces.json <local-path>`) and confirm the new span name (or the new attribute) appears. This is the cheapest validation and catches "exporter not loaded", "auto-instrumentation filtered out", and "span name typo'd" regressions immediately.
2. **Staging (`gwn-ai-staging`).** Wake `gwn-staging` if scale-to-zero (per [CS58](project/clickstops/done/done_cs58_scale-staging-to-zero.md) the live state is `minReplicas=0`), hit the new code path with at least one real request, wait ~5 min, run the documented KQL query, confirm rows appear with the expected shape. Use `az monitor app-insights query --app gwn-ai-staging -g gwn-rg --analytics-query '<kql>'` for scripted runs.
3. **Production (`gwn-ai-production`).** Same as staging, against `gwn-ai-production`. Production validation can lag the PR merge if the change is gated behind a feature flag — but it must happen before the change is enabled in prod, and the validation result must be recorded somewhere durable (PR description follow-up comment, or a workboard note that points back to the PR).

Capture the validation in the PR body under a `## Telemetry Validation` section that mirrors the existing `## Container Validation` section. Format:

```markdown
## Telemetry Validation

- [x] Local (`npm run dev:mssql` + traces.json inspection): saw N spans for `<span-name>`, expected attrs present.
- [x] Staging (`gwn-ai-staging`): KQL `<one-liner or link to docs/observability.md anchor>` returned N rows within 5 min of probe.
- [x] Production (`gwn-ai-production`): same query returned N rows within 5 min of probe. (Or: deferred to feature-flag enablement; tracking in <CS-link or PR comment>.)
```

If any of the three is "not applicable" (e.g. a backend-only change with no client-facing trigger means production validation has to wait for real user traffic), say so explicitly and explain — the empty checkbox is the point. Skipping the section entirely fails the PR review gate.

### How this interacts with existing rules

- The cold-start container validation gate ([§ Database & Data](#database--data)) and this telemetry gate are independent — both must pass for code-touching PRs. `npm run container:validate` does NOT exercise the telemetry path beyond confirming the bootstrap doesn't crash; a separate `dev:mssql` cycle with `traces.json` inspection is required for the telemetry side.
- For docs-only PRs (no server/client/DB code touched), this section is N/A — the review gate is the existing docs-consistency check (`npm run check:docs`).
- For PRs that ONLY add telemetry (no behavior change), the local validation is sufficient if the PR body explains why staging/prod validation is deferred to the next normal deploy.
- Telemetry changes count as code changes for purposes of the cold-start container validation gate even when they're just `server/telemetry.js` edits — the failure mode of "broke OTel SDK init" is exactly what `npm run container:validate` catches, so the gate applies.

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

**Automated check:** `npm run check:docs` (script: [`scripts/check-docs-consistency.js`](scripts/check-docs-consistency.js)) enforces the mechanical half of this rule on every PR via the `Docs Consistency` workflow. The check runs in **warn-only** mode today (CS43-2) and will be flipped to a hard gate by CS43-7 once the baseline is cleaned up. Rule names: `link-resolves`, `clickstop-link-resolves`, `prefix-matches-status`, `unique-cs-state`, `done-task-count`, `no-orphan-active-work`, `workboard-stamp-fresh`, `clickstop-h1-matches-filename` (warn-only, CS62-2), `workboard-title-matches-h1` (warn-only, CS62-3). For a legitimate exception, add an `<!-- check:ignore <rule-name> -->` HTML comment either inline on the offending line or on its own line directly above the affected markdown block. Use sparingly — every escape-hatch comment is an admission that the principle is not being upheld.

---

**Database migrations must be backward-compatible** (additive only: new columns with defaults, new tables) to ensure rollback safety.

### Database & Data

- **No DB-waking background work.** The database must only be touched in response to actual application usage: real user requests, operator-initiated health probes (curl), or batch jobs explicitly invoked by an operator. **Forbidden**: any timer, watchdog, scheduler, polling loop, or recurring mechanism that issues a DB query (including `SELECT 1`) on its own. This applies equally to pool health watchdogs, periodic warm-up pings, SPA pollers that hit DB-backed endpoints, and recovery loops that re-attempt initialization on a timer. If you need to detect a dead pool, do it lazily on the next real request. If you need a `/api/db-status` endpoint, it must read in-memory state ONLY (`dbInitialized` flag, init-guard `isInFlight()`, `getDbUnavailability` cached last-error) and never issue a DB query. Rationale: an idle DB (e.g. Azure SQL serverless on its way to auto-pause, or Free Tier with a finite monthly compute allowance) must be allowed to stay idle so it can pause cleanly; background DB-keepalive activity has historically caused both unnecessary cost and stuck-state failure modes (CS53).
- **Test/debug env vars that affect production behavior require an explicit arming gate, never `NODE_ENV` alone (CS53-10 PR #301 R1 finding).** Local container validation runs the app with `NODE_ENV=production` by design (CS53 Policy 2 — "not in real prod" is the gate, not "not in production-mode locally"), so `NODE_ENV` is *not* a safe predicate for "are we really in real prod?". Any env-driven hook that could turn a healthy live DB into a fake-failure surface (or otherwise alter request handling) MUST require a separate arming env var (e.g. `GWN_ENABLE_DB_CONNECT_SIMULATORS=1`) AND emit a structured Pino warn whenever the env vars are set — armed or not — so a misconfigured deploy that copies the SIMULATE_* var without the gate is still surfaced via KQL (e.g. § B.16 in `docs/observability.md`). Pattern: see `server/db/mssql-adapter.js` `_simulatorsArmed()` helper.
- **Boot-quiet rule (CS53-23 / CS53-19).** No browser-driven boot, focus, refresh, bfcache-restore, or service-worker-lifecycle code path may fire a request that touches the DB. The mechanism is the **`X-User-Activity: 1` request header**: SPA code sets it on requests originating from a real user gesture (click, screen-open, mark-read, etc.); for any read endpoint that participates in the boot-quiet contract, the server route handler MUST NOT issue a DB query in response to a request that lacks the header (or carries any other value). The contract applies only to endpoints explicitly enrolled in it (today: `/api/notifications/count`; CS53-19 will enroll the rest of the boot/focus set). It does **not** apply to operator/system-key requests, write endpoints, or `/healthz`-style probes — those have their own rules. **Cold-start caveat (CS53-19.D scope):** the global `/api/*` request gate in `server/app.js` currently calls `runInit()` for any header-less request when `!dbInitialized`, which can touch the DB before an enrolled handler runs. The route-level guarantee above holds once the DB is initialized; CS53-19.D will gate the init path on `X-User-Activity: 1` to close this gap end-to-end. On cache miss without the header on an enrolled endpoint (post-init), the server returns the cached value if any, else the empty default for that endpoint (`{ unread_count: 0 }` for `/api/notifications/count`, `204 No Content` where no body shape is meaningful). The header is the boot-quiet contract that lets the server act as the guard against untrusted or stale clients without heuristics. Cross-link: `project/clickstops/active/active_cs53_prod-cold-start-retry-investigation.md` row CS53-23 (contract foundation, fully wired today only on `/api/notifications/count`) and CS53-19 (apply contract to every other boot/focus endpoint, plus close the cold-start init-gate gap in CS53-19.D).
- **Cold-start container validation gates every check-in.** For any PR that changes server-side code, client-side runtime code, or DB-touching code (i.e., everything except docs/markdown/CI-config-only changes), the author must run a "cold-start container validation" cycle (`npm run container:validate`) before requesting local review, after local-review fixes are pushed, and after each Copilot review iteration's fixes are pushed. Capture pass/fail per cycle in the PR body under `## Container Validation`. The container restarts cleanly with `GWN_SIMULATE_COLD_START_MS=30000` so the warmup retry path is exercised on every restart, mimicking Azure SQL serverless cold-start behavior. See [§ Cold-start container validation in OPERATIONS.md](OPERATIONS.md#cold-start-container-validation) for the procedure.

### Multi-PR pattern for backward-incompatible migrations

**Principle.** The vast majority of schema changes can — and must — land as a single additive migration: new column with a `DEFAULT`, new table, new index. The migration framework is forward-only and the deploy sequence applies migrations *before* traffic shifts to the new image, so for a brief window the **old** server code runs against the **new** schema. An additive migration is invisible to the old code; a non-additive one is not.

For changes that genuinely cannot be expressed additively — column rename, column drop, type change, tightening NOT-NULL on an existing column, FK removal — split the work across **three PRs and three deploys** so that each individual PR is backward-compatible against the previous deploy's running code.

**The pattern.**

- **PR A — Expand.** Add the new column / table / shape, always nullable / with a safe default. Update application code to **dual-write**: every write path writes to BOTH the old and the new shape, keeping them in sync row-by-row going forward. Reads still go to the old shape. Deploy. After this deploy, every newly-written row has the new shape populated; pre-existing rows do not.
- **PR B — Migrate (data + reads).** Backfill the new shape from the old shape for any rows that pre-date PR A's dual-write (a one-shot operator-invoked script, or an idempotent migration step that updates `WHERE new_col IS NULL`). Cut READ paths to the new shape. The dual-write from PR A stays in place — old replicas during the rolling deploy are still reading the old shape, and the next PR will tear that down. Deploy.
- **PR C — Contract.** Remove the dual-write so writes only go to the new shape. Drop the old column / table / constraint. By this point no live code reads or writes the old shape, so the drop is backward-compatible against the previous deploy (which was running PR B's image). Deploy.

**Worked example: rename `users.username` to `users.handle`.**

- **PR A (expand).** Migration: `ALTER TABLE users ADD handle NVARCHAR(50) NULL` (additive, passes the linter). Code: every `INSERT INTO users` and every `UPDATE users SET username = ?` is changed to also set `handle` to the same value. Reads still use `username`. Deploy → all newly-created users have `handle = username`; older users have `handle IS NULL`.
- **PR B (migrate).** Migration: `UPDATE users SET handle = username WHERE handle IS NULL` (idempotent backfill, additive in linter terms — no schema change, just data). Code: read paths switch from `username` to `handle` (with `COALESCE(handle, username)` during the deploy window if you want belt-and-braces). Dual-write from PR A is retained. Deploy → all rows have `handle` populated; live code reads `handle`.
- **PR C (contract).** Code: drop the dual-write — only `handle` is written. Migration: `ALTER TABLE users DROP COLUMN username`. This is the only PR in the sequence that trips the migration-policy linter ([`scripts/check-migration-policy.js`](scripts/check-migration-policy.js), CS41-11), and that's by design — it's safe **here** because PRs A and B already removed every code path that touches `username`. Deploy.

**Linter override on the contract PR.** The `DROP COLUMN` in PR C is rejected by default; the override comment must reference the multi-PR plan so a future reviewer can verify the safety argument:

```js
// MIGRATION-POLICY-OVERRIDE: 3-PR rename sequence (A: PR #NNN expand, B: PR #NNN migrate-data, C: this PR contract). See CS41-13 docs and the PR description for the full plan.
await db.exec('ALTER TABLE users DROP COLUMN username');
```

The linter requires the reason to be ≥ 20 characters AND contain either a URL or a CS-link (e.g. `CS41-13`); a properly-worded multi-PR-plan reference satisfies both. Override comments may sit inline on the offending line or on the line directly above. Use the override only on the contract PR — never to bypass the pattern itself.

**When NOT to use this pattern.** Cosmetic schema improvements that don't affect correctness should be deferred indefinitely: a slightly-misnamed column or a redundant index that nothing depends on isn't worth three PRs and three deploys. Reserve the pattern for changes that genuinely **must** happen (semantics changing, integrity tightening, removing a column the new code truly cannot live with) but cannot be expressed in one additive shot.

**Out of scope for this pattern.** Primary-key changes, splitting a table, or changing a column's storage type in a way that requires a copy + swap are substantially more involved than rename/drop and are not safely covered by the recipe above. Treat those as their own dedicated clickstop with explicit per-step rollback plans; do not try to shoehorn them into a 3-PR sequence.

**Cross-references — the two enforcement layers that catch what this pattern protects against:**

1. [`scripts/check-migration-policy.js`](scripts/check-migration-policy.js) (CS41-11) is the static gate: it rejects `DROP COLUMN`, `DROP TABLE` without `IF EXISTS`, `RENAME COLUMN`, non-rebuild `RENAME TO`, `ALTER COLUMN ... NOT NULL`, `ADD … NOT NULL` without `DEFAULT`, and FK drops — exactly the patterns that break old code. The override comment exists so the contract PR of a 3-PR plan can land legitimately.
2. The **old-revision smoke** in the deploy YAMLs (CS41-12, in `.github/workflows/prod-deploy.yml` and the staging equivalent) is the runtime gate: after migrations apply but BEFORE traffic shifts to the new image, the still-serving OLD revision is smoked against the just-migrated DB. If a non-additive change slipped past the linter (e.g. a subtle query-shape mismatch the regex didn't catch), the smoke fails and the deploy aborts. The 3-PR pattern is the design discipline that ensures both gates stay green.

### Achievement gating (CS52-7)

Server achievements unlock **only from server-validated outcomes**:

- `POST /api/sessions/:id/finish` — single-player ranked sessions per CS52-3.
  Server holds the puzzle answer; `elapsed_ms` is server-derived; the score
  the evaluator sees is computed by `services/scoringService.js` from
  per-answer events, not accepted from the client. Logged with
  `source: 'ranked_finish'`.
- WebSocket multiplayer match-end (`server/ws/matchHandler.js`) — score is
  derived from the server-driven round/answer state machine. Logged with
  `source: 'mp_match_end'`.

Achievement evaluation is **explicitly skipped** for:

- `POST /api/sync` — offline-source records are self-reported and never
  validated. The handler must not call `checkAndUnlockAchievements`.
- `POST /api/scores` — legacy / offline submission path. Returns
  `newAchievements: []` and emits an `achievement_evaluation_skipped`
  log line so an operator can confirm the gate is holding.

Rationale: achievements must be tied to outcomes the server can independently
verify (server-held puzzle answers, server-derived timing). Self-reported
offline scores cannot meet that bar — surfacing them as achievement unlocks
would re-open the original F2 integrity gap.

Cumulative-counting rules (e.g. `games_played`, `daily_count`,
`categories_played`) inside `server/achievements.js` filter the `scores`
table to `source = 'ranked'` so that pre-loaded offline history cannot be
used to graduate a single ranked finish into a high-threshold server
achievement (e.g. 2 offline daily rows + 1 ranked finish ≠ `daily-3`).
Multiplayer-win counting (`mp_wins`) reads from `match_players` directly,
which is server-validated by construction.

Operationally: any future write path that persists a `scores` row should
either (a) be a server-validated outcome and call `checkAndUnlockAchievements`
with `source: '<descriptor>_finish'`, or (b) skip evaluation explicitly. The
KQL invariant in `docs/observability.md` (`achievement_evaluation` events
with `source ∉ {ranked_finish, mp_match_end}` should always return zero
rows) is the production check that this rule is holding.

---

## Investigation artifacts

Transient visual artifacts produced while investigating bugs or validating clickstops — screenshots, repro captures, HAR-supplementary images, container-state snapshots — live in a top-level `shots/` directory.

**Location:** `shots/` at the repo root. Gitignored (see [`.gitignore`](.gitignore)). These files routinely contain JWTs in URLs, user PII visible in UI screenshots, and internal/staging URLs — they must never be committed. They are working artifacts, not source.

**Naming convention:** `[<orchestrator-id>][<CS-ID>-<TASK-ID>] <short-description>.<ext>`

Examples:
- `[yoga-gwn][CS53-11] 01-loaded.png`
- `[yoga-gwn-c2][CS53-5] profile-direct.png`
- `[yoga-gwn][CS53-19] warm-boot-network.har`

The `<orchestrator-id>` matches the `<machine>-gwn[-cN]` format in [WORKBOARD.md](WORKBOARD.md)'s Orchestrators table. The `[CS-ID-TASK-ID]` prefix mirrors how clickstop+task IDs already prefix branches and PRs, so artifacts are searchable and attributable in cross-agent worktree setups.

**Lifecycle:** delete shots once the underlying CS task is closed, unless they're cited from a doc that needs them. They are working artifacts — do not let them accumulate indefinitely.

---

## Production deploys — approval gate is on the user

`prod-deploy.yml` uses GitHub Environment `production` with required reviewers. After `gh workflow run prod-deploy.yml ...` is dispatched, the run sits in **`waiting`** state until a human reviewer clicks **Approve** in the GitHub Actions UI. The workflow does **not** progress on its own.

**Orchestrator rule when triggering a prod deploy:** the response that triggers the deploy MUST surface the approval state prominently. Recommended template:

> ⚠️ **Production deploy `<run-id>` is now waiting on YOUR approval.**
> Approve here: `https://github.com/<owner>/<repo>/actions/runs/<run-id>`
> Image: `<sha>`. Replaces: `<previous-sha>`. Watcher will resume once you click Approve.

Do not bury the approval link inside a status table. Do not assume the user is watching the Actions tab. The deploy is blocked on them, and the orchestrator's job is to make that blocking state unmissable.

Staging deploys have no such gate (they auto-run when `vars.STAGING_AUTO_DEPLOY == 'true'` *or* when triggered via `workflow_dispatch`), so this rule is production-only. Note that Azure `gwn-staging` is being moved to `minReplicas: 0` (scale-to-zero, live state tracks [CS58-1/CS58-2](project/clickstops/done/done_cs58_scale-staging-to-zero.md)) and is not a pre-prod release gate — the enforced gate is the in-CI Ephemeral Smoke Test job in [`.github/workflows/staging-deploy.yml`](.github/workflows/staging-deploy.yml) plus local `npm run container:validate` cycles. See [§ Waking staging for ad-hoc validation in OPERATIONS.md](OPERATIONS.md#waking-staging-for-ad-hoc-validation) for the operator probe procedure.

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

