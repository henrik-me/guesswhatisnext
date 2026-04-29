# Learnings & Decisions

This file captures accumulated knowledge, architecture decisions, risk analyses, and tool evaluations across all clickstops.

> **Last updated:** 2026-04-26

---

## Operational Learnings

### Lessons Learned from Parallel Execution

| Issue | Cause | Prevention |
|---|---|---|
| Agents commit each other's changes | Shared worktree, agents run `git add -A` | Use worktrees — each has its own filesystem |
| Health endpoint bundled into wrong commit | Both modified `server/index.js` | Separate worktrees eliminate this entirely |
| Agents compete for port 3000 | Each agent starts server to verify | Assign unique ports per worktree (300X) |
| Schema migrations conflict | Multiple agents add columns/tables | Review combined schema after all merges |
| Test file merge conflicts | Multiple agents add test files | Tests are additive — auto-merge usually works |
| Folder permissions re-prompted | Task-named worktree folders change each time | Use fixed slots (wt-1..wt-4), recycle with new branches |

### High-Conflict Files

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

## Architecture Decisions

### Key Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Frontend stack | Vanilla HTML/CSS/JS | No build tools, fast iteration, lightweight |
| Backend stack | Node.js + Express | Same language as frontend, easy WebSocket support |
| Database | SQLite → Azure SQL | Start simple (SQLite for dev/staging), Azure SQL free tier for production. Adapter pattern supports both. |
| Multiplayer | Both async + real-time | Leaderboards for casual, head-to-head for competitive |
| Multi-player rooms | 2–10 players, host-controlled | Host creates room, configures settings, starts when ready |
| Multi-player disconnect | Drop after 30s, match continues | Avoids ending match for all when one player leaves |
| Multi-player rankings | Full placement with ties | More meaningful than binary win/lose for N players |
| Puzzle format | Emoji/text + images | Start with emoji, layer in images |
| Timing | Timed rounds, speed bonus | Adds excitement and skill differentiation |
| Staging infra | Container Apps (not F1) | Environment parity with prod, same Dockerfile + deploy method |
| Production infra | Container Apps (Consumption) | Pay-per-use, scale-to-zero, WebSocket support |
| Container registry | GitHub Container Registry | Free for private repos, integrated with GH Actions |
| CI/CD promotion | Build once, promote image | Same image bytes in staging and prod — no rebuild, no drift |
| Staging→Prod gate | GH Environment manual approval | Prevents untested code reaching production |
| SQLite on Azure Files | **Broken — use local filesystem** | Azure Files (SMB) does not support POSIX file locking (fcntl). Every lock attempt returns SQLITE_BUSY. EXCLUSIVE locking, unix-none VFS, and URI filenames all failed. Solution: `GWN_DB_PATH=/tmp/game.db` for local filesystem. |
| DB initialization | Self-init on startup | GitHub Actions can't reach Azure Container App URLs. az exec requires TTY. Self-init retry loop eliminates cross-network dependency. |
| Deploy verification | Revision state + az logs grep | Direct HTTP (curl) times out from GH Actions. az containerapp exec needs TTY. Use az CLI for all verification. |
| Database abstraction | Adapter pattern (SQLite + Azure SQL) | Routes use `await db.get/all/run()` with `?` params. Adapters handle dialect. Versioned migrations replace try/catch ALTER TABLE. |
| Production database | Azure SQL free tier | Persistent, reliable, no SMB issues. Auto-pause when idle → $0 cost. Staging stays on ephemeral SQLite. |
| AI orchestration | Copilot CLI (not Squad) | Squad evaluated but deferred — see Tools Evaluated below |

### CS3 — Security & Game Features

| Decision | Choice | Rationale |
|---|---|---|
| System auth | API key (X-API-Key header) | Simple, no JWT expiry concerns for automated clients |

### CS4 — Infrastructure & Deployment

| Decision | Choice | Rationale |
|---|---|---|
| Staging host | Container Apps (Consumption) | Environment parity with prod, scale-to-zero, full WebSocket support |
| Production host | Container Apps (Consumption) | Pay-per-use, scale-to-zero, WebSocket support |
| Container registry | GitHub Container Registry | Free for private repos, integrated with GH Actions |
| Staging→Prod gate | GH Environment manual approval | Prevents untested code reaching production |
| Health monitoring | GitHub Actions cron | No extra infra, creates issues in same repo |

### CS5 — Multi-Player Expansion

| Decision | Choice | Rationale |
|---|---|---|
| Max players per room | 2–10 (host configurable) | Flexible; 2 preserves current behavior, 10 caps complexity |
| Room host model | Creator is host, controls start | Clean UX; host decides when enough players have joined |
| Host disconnect (lobby) | Auto-transfer to next player | Prevents room death from host leaving |
| Player disconnect (active) | 30s reconnect → drop (score frozen) | Match continues for remaining players (≥2) |
| Winner logic | Full ranking with tie handling | Placements (1st/2nd/3rd…) instead of binary win/lose |
| Spectator mode | ✅ Done (Phase 8) | Read-only WS, spectator count in lobby, spectator badge, dedicated tests |
| Rematch flow | Host "New Match" → auto-join lobby | Simpler than N-player ready-up counting |

### CS10 — CI/CD Pipeline Rework

| Decision | Choice | Rationale |
|---|---|---|
| Docker base image | node:22-slim (single-stage) | better-sqlite3 ships prebuilt binaries; no python3/make/g++ needed. Simpler Dockerfile at cost of ~200MB vs ~100MB image |
| PR CI checks | Lint + test + E2E (no Docker build) | Docker build is slow, hits Docker Hub rate limits, and isn't needed for PR validation. E2E (Playwright) added in Phase 12. |
| Push to main | No auto-deployment (disabled) | Auto-deploy temporarily disabled in PR #41 to avoid unintended deploys. Manual workflow_dispatch only for now. |
| Staging branch strategy | Fast-forward release/staging to main HEAD | Simpler than cherry-picking; no history divergence; staging always matches main |
| Staging trigger | Manual workflow_dispatch only | Auto-deploy gated by STAGING_AUTO_DEPLOY repo variable (default false). Manual dispatch is the standard workflow; auto-deploy available when needed. |
| Ephemeral staging | Docker container in GitHub Actions | $0 infra cost; sufficient for automated smoke tests (health, auth, scores) |
| Azure staging | Behind manual approval after ephemeral passes | Persistent environment for manual QA; only promoted after automated validation |
| Production deploy | Manual workflow_dispatch from release/staging | Production only deploys code that has been validated in staging; never directly from main |
| Production gate | Requires staging environment green | Cannot trigger prod deploy unless the latest staging deployment succeeded |

### CS15 — Dev Tooling

| Decision | Choice | Rationale |
|---|---|---|
| Dev server default | HTTPS + log capture | Production-like by default ensures security headers and logging are always validated during manual testing |
| Log capture method | Child process with piped stdio | pino-pretty's ThreadStream bypasses shell pipelines; spawning as child with pipe is the only reliable capture method |
| Script architecture | Wrapper spawns dev-https.js or server/index.js | Keeps HTTPS logic separate (monkey-patches http.createServer), log capture is orthogonal |
| Watch mode | Only for --no-https | dev-https.js monkey-patches http.createServer once; --watch restart would re-patch incorrectly |

---

## Risk Analysis

### WebSocket Handler — Architecture Analysis & Decisions

#### Current State (server/ws/matchHandler.js)
The WS handler is a 1000-line file with **4 pieces of in-memory state** (`rooms`, `disconnected`, `rematchRequests`, `finishedRooms`) and **~15 DB call sites**. The critical insight:

**In-memory state is already the source of truth for live games. DB is best-effort persistence.**

| DB Call | When | Classification | Can Fail Silently? |
|---|---|---|---|
| `selectRandomPuzzles()` | Match start | **Critical path** | ❌ No puzzles = no game |
| `SELECT match metadata` | Player joins | Read-only | ✅ Falls back to defaults |
| `UPDATE matches SET status='active'` | Match start | Fire-and-forget | ✅ Game proceeds in memory |
| `SELECT match id` + `INSERT match_round` | Round start | Fire-and-forget | ✅ Round plays without DB |
| `UPDATE matches SET status='finished'` | Match end | Fire-and-forget | ✅ Results already broadcast |
| `UPDATE match_players SET score=...` | Match end | Fire-and-forget | ✅ Scores already shown via WS |
| `checkAndUnlockAchievements()` | Match end | Fire-and-forget | ✅ Can retry later |
| `UPDATE matches SET host_user_id=...` | Disconnect/transfer | Fire-and-forget | ✅ In-memory host is authoritative |
| `INSERT matches` + `INSERT match_players` | Rematch | Fire-and-forget | ✅ Game starts in memory regardless |

**Only 1 out of ~15 DB calls is critical-path.** Everything else can be queued.

#### Risk 1: Puzzle Selection Is the Only Blocking DB Call
`selectRandomPuzzles(count)` runs `SELECT ... FROM puzzles ORDER BY RANDOM() LIMIT ?`. If DB is cold, this blocks match start for 10-30s.

**Decision: Pre-warm puzzle cache on startup.**
- Load all puzzles into memory at boot (same as client-side already does)
- `selectRandomPuzzles()` draws from the in-memory cache, zero DB latency
- Refresh cache periodically (e.g., every hour) or on admin signal
- This eliminates the ONLY critical-path DB call from the WS handler

#### Risk 2: No Transactions Around Multi-Step Writes
`endMatch()` does 3 separate DB writes (update match, update each player's score). `handleRematchStartConfirm()` does INSERT match + INSERT players without a transaction. Partial writes are possible.

**Decision: Wrap multi-step writes in transactions.**
- `endMatch()`: single transaction for match status + all player scores
- `handleRematchStartConfirm()`: single transaction for match + players
- In the async adapter, transactions use `BEGIN`/`COMMIT`/`ROLLBACK` with proper error handling
- Since these are fire-and-forget, a failed transaction just means the match isn't persisted — game already happened

#### Risk 3: Sync→Async Conversion of WS Message Handlers
Currently, WS `message` handlers are synchronous. With async DB, every handler that touches DB becomes `async`. The risk: unhandled promise rejections crashing the process, or race conditions from concurrent async operations on the same room.

**Decision: Write queue per room.**
- Each room gets a serial write queue (simple promise chain)
- Game logic stays synchronous (in-memory state mutations) — no `await` in the hot path
- DB writes are enqueued as fire-and-forget async tasks that execute serially per room
- This prevents: interleaved writes, unhandled rejections, and async race conditions
- Pattern: `room.persistQueue = room.persistQueue.then(() => persistMatchEnd(roomCode)).catch(log)`

#### Risk 4: Reconnection Relies on In-Memory State
`handleJoin()` on reconnect checks `rooms` Map and `disconnected` Map — both in-memory. If the container restarts (scale-to-zero, redeploy), all in-memory state is lost and active matches die.

**Decision: Accept this limitation (already the case today).**
- Container Apps scale-to-zero kills all WS connections and in-memory state
- Matches are ephemeral by nature — a 5-minute game lost to restart is acceptable
- Future enhancement (not Phase 11): optional match state checkpointing to DB for crash recovery
- Client already has reconnect logic with 5 retries — this handles transient disconnects

#### Risk 5: Error Handling Is Silent
Most DB calls in the WS handler have empty `catch` blocks or no error handling at all. Errors are swallowed silently.

**Decision: Add structured logging for failed persistence.**
- Fire-and-forget writes should log failures (room code, operation, error) but NOT crash the game
- Add a `/api/admin/persistence-health` endpoint that reports recent failures
- Track a counter of "unpersisted matches" — if it grows, investigate

#### Architectural Summary for WS Handler Migration

```
┌─────────────────────────────────────┐
│ WS Message Handler (synchronous)    │
│ - Validate message                  │
│ - Mutate in-memory room state       │
│ - Broadcast results to players      │
│ - Enqueue DB write (fire & forget)  │
└──────────────┬──────────────────────┘
               │ enqueue
               ▼
┌─────────────────────────────────────┐
│ Room Persist Queue (async, serial)  │
│ - Executes DB writes one at a time  │
│ - Logs failures, never throws       │
│ - Transactions for multi-step ops   │
└──────────────┬──────────────────────┘
               │ await db.run(...)
               ▼
┌─────────────────────────────────────┐
│ Database Adapter (async)            │
│ - SQLite or Azure SQL               │
│ - Connection pool management        │
│ - Parameter translation             │
└─────────────────────────────────────┘
```

**Key principle: The WS game engine has ZERO awaits. All DB interaction is post-broadcast, queued, and fault-tolerant.**

---

## Azure SQL Considerations

### Connection Pool Sizing
Azure SQL free tier has limited concurrent connections. The `mssql` package uses connection pooling — need to size appropriately: `min: 0, max: 10` is a safe default. Pool exhaustion would cause 503s, so need proper error handling and pool health monitoring.

### Prepared Statements / Query Caching
SQLite's `db.prepare()` compiles and caches SQL. The `mssql` package uses parameterized queries but doesn't have the same prepare/cache model. For hot paths (leaderboard, puzzle fetch), consider using `mssql`'s `PreparedStatement` class for performance.

### Transaction Semantics
SQLite's default transaction isolation is SERIALIZABLE. Azure SQL defaults to READ COMMITTED. The WS handler's fire-and-forget writes don't need SERIALIZABLE (they're append-only status updates). HTTP routes that read aggregated data (leaderboard, profile stats) work fine with READ COMMITTED. No isolation level override needed for current use cases.

### bcrypt in System User Seeding
The system user seed hashes the `SYSTEM_API_KEY` with bcrypt on every fresh DB init. This is CPU-intensive (~100ms). In the async world, use `bcrypt.hash()` (async) instead of `bcrypt.hashSync()`.

### No DELETE Statements in Application Code
The current application/server code does not issue SQL `DELETE` statements, so production data grows indefinitely. Test code may still use `DELETE FROM ...` for cleanup. With Azure SQL's 32GB free tier limit, this could eventually be an issue. Consider adding a data retention policy (e.g., archive old matches after 90 days).

### Rollback Strategy for Schema Migrations
Each migration has `down()` but it's never auto-called. If a migration breaks production:
1. Deploy rolls back to previous image (previous code + new schema)
2. This only works if migrations are backward-compatible
3. **Rule**: migrations must be additive (add columns, not rename/remove). Destructive changes need a two-phase deploy.

---

## Auto-Pause UX Strategy

**Status: ✅ Implemented** (CS38, PRs #163, #164, #167). ProgressiveLoader module with timed message escalation, auto-retry with backoff, local-first score submission, auth form progressive feedback, and delay simulation middleware for testing.

### Auto-Pause Latency — Graceful UI Strategy

Azure SQL serverless auto-pauses after ~1 hour of inactivity. Cold-start resume takes 10-30 seconds. **No keep-alive pings** — accept the latency and make it delightful.

#### Why This Is Manageable
- **Home screen + single-player game need zero DB calls.** Puzzles are bundled locally, high scores in localStorage. A returning user can immediately play without waiting.
- **Only DB-backed features are affected:** profile, leaderboard, achievements, multiplayer lobby, score submission.
- **The app already has loading states** for profile ("Loading profile..."), leaderboard ("Loading"), achievements ("Loading achievements..."), and lobby (spinner + "Waiting for opponent..."). These just need personality.

#### Pattern: Progressive Friendly Messages
Replace static "Loading..." text with a timed escalation sequence:

| Elapsed | Message style | Example (profile) |
|---|---|---|
| 0-2s | Normal loading | "Loading profile..." |
| 3-5s | Casual reassurance | "Still loading — gathering your stats..." |
| 6-10s | Warm + engaging | "This is taking a moment. How about counting to 5? 🎲" |
| 11-20s | Interactive / playful | "Almost there! While you wait — what's the next number: 2, 4, 8, ...?" |
| 20-30s | Honest + encouraging | "The database was napping 😴 — waking it up now. Should be just a moment!" |
| 30s+ | Graceful degradation | Show cached data if available, or "Taking longer than expected — [Retry]" |

Each page/feature gets its own message set appropriate to context:
- **Profile:** "Looking up your stats...", "Digging through your game history...", "Your profile data is warming up ☕"
- **Leaderboard:** "Fetching the rankings...", "Tallying up everyone's scores...", "The leaderboard keeper is on a coffee break ☕"
- **Achievements:** "Checking your trophy case...", "Polishing your badges... ✨"
- **Multiplayer lobby (creating):** "Setting up your game room...", "Arranging the puzzle table...", "Almost ready to play!"
- **Score submission:** Store results in localStorage immediately, push to server in background. If server is cold, queue and retry. User never waits for score persistence.

#### Pattern: Local-First for Score Submission
After a game ends (single-player or multiplayer):
1. Save score to `localStorage` immediately → user sees their result with zero latency
2. Queue a background `POST /api/scores` — if it fails (503, timeout), retry with exponential backoff
3. Show a subtle indicator ("Score saved ✓" → "Syncing to leaderboard..." → "Synced ✓")
4. If user navigates to leaderboard before sync completes, show local scores alongside server data

#### Pattern: Multiplayer — Deferred Persistence
During an active multiplayer match:
- **All game state lives in-memory** (the `rooms` Map) — no DB call blocks gameplay
- Score updates, round results, and game-over are broadcast via WebSocket from in-memory state
- DB persistence (match status, player scores, achievements) happens **after** broadcasting results
- If DB is cold/slow, the game proceeds normally — persistence catches up in the background
- On game-over, show results immediately from WS data, then "Saving to leaderboard..." indicator

#### Implementation: `ProgressiveLoader` Component
A reusable JS module that wraps any async fetch with timed message escalation:
```javascript
// Usage: progressiveLoad(fetchFn, containerEl, messageSet)
// messageSet = [{ after: 0, msg: '...' }, { after: 5000, msg: '...' }, ...]
// Returns the fetch result; messages auto-clear on completion
```
This keeps the pattern consistent across all pages without duplicating timer logic.

---

## Documentation Currency

### Link, don't restate — documentation drift prevention

**Date:** 2026-04-21

#### Context

Issue [#198](https://github.com/henrik-me/guesswhatisnext/issues/198) and an internal operating-model review (`review.md`, finding 2 / improvement 6) independently surfaced the same root cause for a growing pile of cross-doc factual conflicts: docs were paraphrasing values that lived authoritatively in workflow files, scripts, schema files, or the filesystem itself. The paraphrase silently rotted the moment the source changed, and reviewers couldn't reliably catch it by eye.

Concrete drift symptoms that were live on `main` when CS43 was opened:

- `infra/README.md` claimed production runs on container-local SQLite — production actually runs on Azure SQL (the truth lives in `prod-deploy.yml` and `deploy.sh`).
- `CONTEXT.md` listed CS17 as ✅ Complete with task count 4/8, while the clickstop file in `project/clickstops/done/` told a different story.
- The health-monitor cadence was described as "every 5 minutes" in one doc and "every 6 hours" in another, when the workflow file was the only authoritative source.
- A handful of clickstop links in `CONTEXT.md` resolved to `planned_*` files that had already been renamed to `done_*` or never existed at all.

Each one of these is the same shape of bug: a fact owned by file A was paraphrased into file B, and file B was not updated when file A changed.

#### The principle

A documentation file either *is* the source of truth for a fact, or it *links to* the source of truth — it never paraphrases. Acceptable techniques are direct relative file links, anchor links into another doc, or embedded codeblocks with an `<!-- include: -->` marker; the anti-pattern is restating a value inline that already lives authoritatively somewhere else. See [CONVENTIONS.md § Documentation Conventions](CONVENTIONS.md#documentation-conventions) for the rule as written, the full list of acceptable techniques, and the scope (all `.md` files in the repository; the rule does *not* apply to source-code comments, where local restatement is often the clearest option).

#### Mechanism that makes it stick

Writing the rule down is necessary but not sufficient — the same review surface that missed the original drift will miss future drift. CS43-2 adds a consistency checker (`npm run check:docs`) that validates relative links, clickstop-prefix-vs-status agreement, CS-number uniqueness, WORKBOARD freshness, and a small set of cross-doc invariants. It ships warn-only so authors can see violations without breaking PRs, then CS43-7 flips it to a hard gate in `ci.yml` once `main` is clean. The checker is what prevents recurrence at PR time; the written rule is what tells contributors why the checker exists and how to fix what it flags.

The two-step rollout is deliberate. Flipping a checker to a hard gate while violations exist trains people to ignore CI; warn-only → baseline cleanup → hard gate is the only sequence that keeps the signal trustworthy.

#### Pitfalls observed

- Restatement *feels like* good documentation when you are paraphrasing for readability — it reads more naturally inline than "see [prod-deploy.yml](.github/workflows/prod-deploy.yml)" — so the failure mode is intrinsically attractive to careful writers.
- Restatement looks correct in PR review because the reviewer rarely cross-checks the source file; the paraphrase is internally consistent and the diff is small.
- Restated values become invisibly stale on the *next* workflow / schema / config change, because the doc that mirrors the value is not required reading for that change and nobody thinks to update it.
- Onboarding sections and "quickstart" prose are the highest-risk places — they paraphrase aggressively in the name of being friendly to new readers, and they are read least often by people who would notice drift.
- "I'll just keep the docs in sync manually" has been the historical strategy and is exactly what produced the symptoms listed above; it does not scale past one or two docs and one or two contributors.

#### Cross-references

- [CS43 — Documentation Currency & Drift Prevention](project/clickstops/done/done_cs43_doc-currency-and-drift-prevention.md) — the clickstop that codifies this principle and tracks the follow-on work to restructure `CONTEXT.md`, slim `infra/README.md`, and land the consistency checker as a hard gate.
- [CS44 — WORKBOARD State Machine](project/clickstops/done/done_cs44_workboard-state-machine.md) — separate effort to harden the workboard's lifecycle and stale-lock handling (review.md findings 1, 3, 5).
- [CS45 — INSTRUCTIONS.md Split](project/clickstops/done/done_cs45_instructions-split.md) — split `INSTRUCTIONS.md` into four files (INSTRUCTIONS / OPERATIONS / REVIEWS / TRACKING) addressing review.md finding 4.

---

### Expand → migrate → contract — codifying multi-PR migrations

**Date:** 2026-04-26

During CS41 (production deploy validation) the user surfaced that the migration framework is forward-only and the deploy sequence applies migrations *before* traffic shifts to the new image — so for a brief window the **old** server runs against the **new** schema. An additive migration is invisible to the old code; a non-additive one is not, and historically that was the unwritten rule rather than an enforced one. CS41-11 added the static linter (`scripts/check-migration-policy.js`) to reject `DROP COLUMN` / `RENAME` / `NOT NULL` tightening, and CS41-12 added the runtime old-revision smoke against the just-migrated DB. CS41-13 then codified the **expand → migrate → contract** pattern in [CONVENTIONS.md § Multi-PR pattern for backward-incompatible migrations](CONVENTIONS.md#multi-pr-pattern-for-backward-incompatible-migrations) so that backward-incompat changes (rename, drop, type change) land as three individually-additive PRs rather than one unsafe one. The linter override comment on the contract PR must reference the multi-PR plan, which is what makes the safety argument auditable later.

---

### Race-safe in-process cache eviction (CS53-23)

**Date:** 2026-04-26

The unread-count cache landed in CS53-23 ([`server/services/unread-count-cache.js`](server/services/unread-count-cache.js), shipped via PR #255 squash commit `819e3e1`) uses a per-user generation counter for race-safety: writers `_bumpGen(userId)`, readers capture the gen as a token via `beginRead(userId)` before the DB read, and `setIfFresh(userId, count, token)` stores the result only if the gen still matches at commit time. A concurrent writer between `beginRead` and `setIfFresh` bumps the gen and the stale store is rejected. Standard generation-counter pattern.

Bounded FIFO eviction was added under Copilot R8 to prevent unbounded growth in fan-out workloads (many users invalidated, never re-read; gen counters for never-re-read users accumulating forever). Copilot R9 then caught a real correctness bug the eviction had introduced:

1. Reader `beginRead(N)` returned `0` for a never-seen user (default fallback for a missing key in the gen Map). Token captured = 0.
2. Concurrent writer fired `invalidate(N)` → `_bumpGen` set `gen[N] = 1`.
3. `_evictIfFull` ran (orphan-gen pass — entry for N had been deleted, gen counter was now an orphan) and deleted `gen[N]`.
4. Reader's `setIfFresh(N, value, 0)` looked up `currentGen = gen[N] || 0 = 0`. Token (0) matched currentGen (0). Stale value committed.

The reader had been right to be rejected — a writer fired between its `beginRead` and `setIfFresh` — but eviction restoring the default-0 lookup state collided with the pre-bump token of 0. **The general pattern: in a generation-counter race-protocol, eviction must NOT allow `currentGen` to coincide with previously-issued reader tokens.**

Two minimal changes close the hole:

- `beginRead` lazily seeds the gen from a globally-monotonic `_nextGen++` counter, so issued tokens are NEVER `0`. The default-0 fallback that survives eviction can no longer match any in-flight token.
- `setIfFresh` rejects when `currentGen === undefined` (entry evicted), not just on token mismatch. A reader whose gen was evicted between `beginRead` and `setIfFresh` is now always rejected.

Tests in [`tests/unread-count-cache.test.js`](tests/unread-count-cache.test.js) (the "R9 — eviction does NOT silently accept stale stores from in-flight readers" test) lock the contract.

**Reusable lesson for future cache work** (CS53-19, CS55, anything else extending this pattern to other endpoints): if you bound a generation-counter cache via eviction, ensure that the *default value returned for an evicted key* cannot equal *any token a reader could have captured before eviction*. The simplest way to guarantee that is to issue tokens from a monotonic counter and treat "key absent" as a distinct rejected state in the commit path — never as a default that legitimately equals something.

---

### JWT-id coercion at the auth-middleware boundary (CS53-23)

**Date:** 2026-04-26 — landed via PR #255, squash commit `819e3e1`

Copilot R5 on PR #255 caught a defense-in-depth gap:a previous draft of `_coerceUserId` in [`server/middleware/auth.js`](server/middleware/auth.js) collapsed any non-finite or non-positive id to `0`, then `requireAuth` would set `req.user = { id: 0, ... }` and proceed. Because **`id = 0` is the system pseudo-user** (set on the `X-API-Key` system-key path), a malformed JWT (id `'abc'`, `null`, `0`, negative, non-integer) would silently alias the request to the system pseudo-user's sentinel id, risking corruption of any downstream logic keyed only by user id (ownership checks, DB writes, in-memory caches like `unread-count-cache`). It would NOT by itself grant `role: 'system'` — `requireAuth` derives role from `payload.role || 'user'`, and `requireSystem` checks role rather than id — so a successful escalation to system privilege would also require a separately-forged role claim. The risk is sentinel-id aliasing, not an automatic `requireSystem` bypass.

In practice today JWT ids are always numbers (DB-issued integers serialized through `jsonwebtoken`'s JSON round-trip), so no live exploit exists — but the contract was implicit and the next contributor adding (say) a UUID-id user or an OAuth integration could re-introduce the vulnerability.

The fix codifies the pattern: **coerce at the middleware boundary, return `null` for any non-coercible value, respond `401` on `null` (do NOT collapse to `0`).** `optionalAuth` follows the same rule — it ignores the token and continues without setting `req.user`. New tests in [`tests/auth.test.js`](tests/auth.test.js) hand-craft JWTs with each malformed-id shape (string, `0`, `-1`, `null`, `1.5`) and assert all five return 401, locking the regression surface.

**Reusable lesson:** any "pseudo-user" sentinel id (in this codebase: `0` for system) is a security trap if user-id coercion has a fallback path that produces the same sentinel. Either:

1. Make the coercion fail loudly (return `null` / throw / 401) — the path taken in CS53-23.
2. Use a sentinel value that is structurally impossible for a real id (e.g. `-1` or a UUID with a reserved prefix).

Option 1 is preferable because it preserves the simple integer model; option 2 is appropriate when the auth boundary needs to keep failing-open semantics for some reason. **Never** default to the sentinel on parse failure.

---

### `docs/observability.md § B.x` section conflicts under parallel-PR churn (CS53-23)

**Date:** 2026-04-26 — landed via PR #255, squash commit `819e3e1`

The telemetry & observability gate (mandatory for any new code path — see [CONVENTIONS.md § 4a](CONVENTIONS.md#4a-telemetry--observability-mandatory-for-all-new-work)) creates a structural pressure point in [`docs/observability.md`](docs/observability.md): every new code path landing on `main` must add at least one new `### B.<n>` section under the "Common queries" group. When 3–5 orchestrators are landing telemetry-gated PRs in parallel during a CS-wave, the `B.<n>` numbering becomes a contention surface.

Concrete: the boot-quiet contract section in PR #255 was numbered `### B.7` initially, then `### B.11` after CS52-2 / CS52-3 / CS52-7c claimed `B.7..B.10`, then `### B.12` after CS52-7b claimed `B.11`. Each rebase forced a manual section-renumber and re-resolution of the `### B.<n>` header conflict.

**Mitigation:** treat the section number as **non-load-bearing** — append at the end of § B, accept renumbering during rebase, do not put the number in cross-references from outside the file. Cross-reference by section title or by code path, not by `§ B.<n>`. The rebase pattern is mechanical:

1. Take `HEAD`'s version of the conflict block (main's new sections stay where they are).
2. Append your section at the end of § B with the next available number.
3. If your section is referenced elsewhere by number, update those references.

Long-term, if the contention becomes painful enough, candidates to consider: per-domain sub-files under `docs/observability/` (one file per CS feature, no shared numbering), or a stable-anchor convention (`### Boot-quiet contract` rather than `### B.12 Boot-quiet contract`). Neither change made in CS53-23 — the renumber-on-rebase pattern was tractable enough for the current parallel volume.

---

## Tools & Versions

### Adopted Tools & Minimum Versions

> Versions below are minimum versions matching the semver ranges in `package.json`.

| Tool | Purpose | Notes |
|---|---|---|
| Express 5 | HTTP server + API routes | v5.2.1 — note `/{*path}` wildcard syntax (not `*`) |
| better-sqlite3 | SQLite driver | v12.8.0 — WAL mode, synchronous API, good for single-server |
| ws | WebSocket server | v8.20.0 — Lightweight, no socket.io overhead |
| bcryptjs | Password hashing | v3.0.3 — Pure JS, 10 rounds |
| jsonwebtoken | JWT auth tokens | v9.0.3 — 7-day expiry, secret from env var |
| mssql | Azure SQL driver | v12.2.1 — connection pooling, parameterized queries |
| pino | Structured logging | v10.3.1 — JSON in prod, pretty-print in dev |
| pino-http | HTTP request logging | v11.0.0 — auto-logs requests, ignores health/telemetry/static |
| @opentelemetry/sdk-node | Distributed tracing | v0.214.0 — auto-instruments HTTP/Express/DB |
| @azure/monitor-opentelemetry-exporter | Azure Monitor export | v1.0.0-beta.32 — sends traces to App Insights |
| helmet | Security headers | v8.1.0 — HSTS, CSP with wss:, HTTPS redirect |
| express-rate-limit | Rate limiting | v8.3.1 — auth endpoints, telemetry, submissions |
| Docker | Containerization | Same Dockerfile for local dev, staging, and production |
| GitHub Container Registry | Image storage | Free, integrated with GitHub Actions |
| Azure Container Apps | Hosting (staging + prod) | Consumption plan, scale-to-zero, WebSocket support |
| GitHub Actions | CI/CD + health monitoring | Build, deploy, smoke tests, cron-based health checks |
| ESLint | Linting | v10.1.0 — flat config (`eslint.config.mjs`), `@eslint/js` recommended + custom rules |
| Vitest | Unit/integration tests | v4.1.2 — fast, ESM-native, built-in coverage |
| Playwright | Browser E2E tests | v1.58.2 — Chromium, full UI flow testing |
| supertest | HTTP test agent | v7.2.2 — Express endpoint testing |

---

## Tools Evaluated

### Squad (bradygaster/squad) — Evaluated 2026-03-25, Deferred

[Squad](https://github.com/bradygaster/squad) is a multi-agent AI orchestration framework for GitHub Copilot. It defines a team of AI agent specialists (Lead, Frontend, Backend, Tester, etc.) that persist in the repo as `.squad/` files, accumulate knowledge across sessions, run in parallel, and route tasks automatically.

**Why not now:**
- **Alpha software** — APIs and CLI commands may change between releases
- **Overhead for project size** — Single developer, 12 well-defined remaining tasks with clear dependency chains. Squad is designed for larger teams/projects with many parallel workstreams
- **Existing documentation overlap** — INSTRUCTIONS.md, CONTEXT.md, and LEARNINGS.md already serve the role of Squad's `decisions.md` + agent `history.md`
- **Limited parallelism benefit** — Most of our tasks have dependency chains; few are truly independent
- **Setup cost** — Defining agents, routing rules, and casting configuration takes time better spent implementing

**Where it could help (future):**
- Puzzle content expansion — a "Content Creator" agent that learns puzzle schema
- If the project goes open-source with multiple contributors
- Long-running maintenance phase with many parallel feature tracks

**Revisit criteria:**
- Squad reaches beta/stable release
- Project gains multiple active contributors
- We enter an open-ended feature development phase without clear dependency chains

---

## Model Evaluation

Recommendations based on benchmark results comparing claude-opus-4.6, claude-sonnet-4.6, gpt-5.4, and gpt-5.3-codex on identical coding tasks (claude-haiku-4.5 included for exploration based on separate cost/speed evaluation):

| Task Type | Recommended Model | Rationale |
|---|---|---|
| **Orchestration / planning** | Claude Opus 4.7 or higher (1M context variant when available) | Best instruction following, fastest, manages complex workflows without extra prompting. 1M context for full session visibility. |
| **Quick iteration / convention-heavy coding** | Claude Opus 4.7 or higher (1M context variant when available) | 2x speed advantage, fewest review comments, strong convention compliance. 1M context preferred for all sub-agent work. |
| **Deep refactoring / architecture** | GPT 5.4 or higher | Bolder design choices (immutable patterns, DRY helpers, proactive cleanup), more thorough |
| **Test authoring** | GPT 5.4 or higher | More thorough coverage (reason verification, hermetic env vars, DRY test factories, edge cases) |
| **Exploration / research** | claude-haiku-4.5 | Cost-effective for read-only codebase analysis |

**Key observations:**
- GPT models require more explicit procedural prompting for workflow steps (e.g., review loop polling). Always include the full Sub-Agent Checklist when dispatching GPT-based sub-agents.
- Claude models better internalize workflow instructions from high-level descriptions.
- These recommendations are based on benchmark results from April 2026 and should be re-evaluated periodically as models improve.
