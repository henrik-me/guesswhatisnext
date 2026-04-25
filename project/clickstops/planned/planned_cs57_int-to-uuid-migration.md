# CS57 — Migrate int identifiers to UUIDs

**Status:** ⬜ Planned
**Owner:** unassigned (planning by yoga-gwn-c2; not yet claimed for implementation)
**Origin:** User request (2026-04-25) for cross-system ID stability (analytics, federation, future migrations). Plan reviewed by rubber-duck pass `cs57-plan-review` — 12 findings (6 blockers, 4 serious, 2 minor), all adopted before this file landed. Session-source plan: `~/.copilot/session-state/.../plan.md` (yoga-gwn-c2).

> Provisional CS number **CS57** verified free against `planned/`, `active/`, `done/`, and WORKBOARD.md as of commit ae51146 (highest existing was CS56).

## Problem

Several core tables use `INTEGER PRIMARY KEY AUTOINCREMENT` (SQLite) / `INT IDENTITY(1,1)` (MSSQL):

- `users.id`
- `scores.id` + `scores.user_id` (FK)
- `puzzle_submissions.id` + `puzzle_submissions.user_id` (FK)
- `notifications.id` + `notifications.user_id` (FK) *(migration 007)*

FKs to `users.id` also exist on: `matches.created_by`, `matches.host_user_id` (named MSSQL constraint `FK_matches_host_user_id`), `match_players.user_id` (composite PK), `user_achievements.user_id` (composite PK).

Goal: cross-system ID stability via UUID v4. Tables already on TEXT IDs (`matches`, `match_rounds`, `achievements`, `puzzles`) are unaffected.

## Approach — dual-key transition

Multi-PR. At every intermediate state the system is fully functional; rollback-safe through CS57-7. CS57-8 and CS57-9 are forward-only (DB-restore territory).

### Generation

- **Application-generated** (`crypto.randomUUID()`, Node 22 native, no dep): `users.uuid`, JWT-bound values, anywhere the app needs the value before INSERT. OpenSSL-backed.
- **Database-generated** (engine-native, lowest compute): child rows where the app does not need the value pre-INSERT. `NEWID()` on MSSQL; in-migration JS `crypto.randomUUID()` for SQLite (no first-class UUID function — cost difference is negligible). App reads back via the new "insert-and-return" adapter API (CS57-1b) where downstream code needs the value.

### Storage

- MSSQL: `UNIQUEIDENTIFIER` (16 bytes, native indexable).
- SQLite: `TEXT` (36-char canonical lowercase).
- Adapter abstracts type via a single `uuidColumn()` helper.
- Normalize to lowercase canonical at adapter boundary on read.

### Nullability discipline (revised after rubber-duck)

All new uuid columns ship **NULLABLE** in CS57-2/CS57-3 schema migrations. NOT NULL constraints are added in CS57-5 only after dual-write (CS57-4) has shipped to production and a backfill sweep has confirmed no NULLs remain. This ensures every intermediate state is safe for fresh-DB bootstrap (system user seed, registration, tests).

### Column naming after cutover

Post-CS57-7, column names are **unchanged** — only the storage type changes. So `users.id`, `scores.user_id`, `match_players.user_id`, `matches.created_by`, `matches.host_user_id`, `user_achievements.user_id`, `puzzle_submissions.user_id`, `notifications.user_id` keep their names. The shadow `*_uuid` columns are dropped and the original columns are repurposed in CS57-7's PK swap. This avoids a rename storm across the codebase.

### JWT compatibility window

JWT TTL is **7 days** (`server/middleware/auth.js:69-73`).

- **CS57-4 onward:** `jwt.sign` writes both `id` (int) and `uuid` (string).
- **CS57-5 onward:** `jwt.verify` resolves canonical identity as `payload.uuid ?? payload.id` (still routes through user lookup); WS auth (`server/ws/matchHandler.js:78-88`) updated in the same step.
- **CS57-8:** `jwt.sign` stops writing `id`. `jwt.verify` **continues** accepting tokens with `id` only — for **at least one full TTL (7 days)** past the CS57-8 ship date — by looking up `users.legacy_int_id → users.id` (or rejecting cleanly if the lookup table has been dropped). Concretely, CS57-8 keeps a `users.legacy_id` mapping column; CS57-9 cleanup waits ≥ 7 days after CS57-8 ships to prod, then drops the mapping and the int-acceptance path.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS57-1 | UUID foundations — `server/lib/uuid.js` + `uuidColumn()` adapter helper + unit tests | ⬜ Planned | No schema. Container validation: N/A. |
| CS57-1b | Adapter `insertReturning(table,row)` — `RETURNING id` (SQLite) / `OUTPUT INSERTED.<col>` (MSSQL); legacy `lastId` shim until CS57-9 | ⬜ Planned | No schema. May parallel with CS57-1. |
| CS57-2 | Migration 008: add NULLABLE `users.uuid` UNIQUE + backfill + `cs57_users_uuid_null_count` health counter | ⬜ Planned | Validation: fresh empty DB. |
| CS57-3 | Migration 009: NULLABLE `*_uuid` PK + `*_user_uuid` shadow FKs on all child tables; backfill via JOIN; per-table NULL counters | ⬜ Planned | Validation: fresh empty DB. |
| CS57-4 | Dual-write inserts (every INSERT path); JWT signs both `id`+`uuid`; `cs57_dual_write_mismatch_total` counter | ⬜ Planned | Blocks CS57-5 until counter at 0 in prod for ≥24h. |
| CS57-4b | Codebase ID-usage inventory checklist `project/cs57-id-usage-inventory.md` | ⬜ Planned | Process gate for CS57-5/6/7. No runtime change. |
| CS57-5 | Read switch + NOT NULL enforce; `USE_UUID_READS` flag (default on); `cs57_int_read_fallback_total` counter | ⬜ Planned | Validation: fresh empty DB + cold-start. |
| CS57-6 | API + path-param flip; `legacyId` field (kept until CS57-9); `Number(req.params.id)` sites switch to `isUuid()`; `cs57_param_id_format` counter | ⬜ Planned | Validation: fresh empty DB + e2e. |
| CS57-6b | Test fixture migration — JWT factories, path IDs, admin-promotion fixtures, `expect.uuid()` matcher, `makeTestUser()` | ⬜ Planned | May ship with CS57-6. |
| CS57-7 | Migration 010: drop named MSSQL FKs; rebuild composite PKs (match_players, user_achievements); swap non-PK FK types in place; `cs57_orphan_fk_total` assertion | ⬜ Planned | **Forward-only.** Validation: fresh + populated DB. |
| CS57-8 | Migration 011: drop int PKs; promote `uuid` to PK; keep `users.legacy_id` mapping; `cs57_jwt_legacy_id_lookup_total` counter drives CS57-9 wait | ⬜ Planned | **Forward-only. Pre-merge backup gate.** Validation: fresh + populated + pre-CS57-8-token acceptance. |
| CS57-9 | Cleanup — wait ≥7d after CS57-8 prod ship AND `cs57_jwt_legacy_id_lookup_total` at 0 for 7d. Drop legacy_id, legacyId, USE_UUID_READS, dual-write, lastId shim, dual-emit telemetry | ⬜ Planned | Calendar wait, not work wait. |
| CS57-10 | Docs (CONTEXT.md, README, LEARNINGS.md) + close clickstop (move to `done/`) | ⬜ Planned | |

## Subtask details

| ID | Title | Description |
|----|-------|-------------|
| CS57-1 | UUID foundations | Add `server/lib/uuid.js` (`newUuid()`, `isUuid()`, `normalizeUuid()`) and per-adapter `uuidColumn()` helper. Unit tests. No schema, no runtime change. **Container validation:** N/A. |
| CS57-1b | Adapter insert-and-return API | New explicit `insertReturning(table, row)` (or equivalent) on the adapter base. SQLite path uses `RETURNING id` (sqlite ≥ 3.35 — confirmed available in `better-sqlite3` shipped) or follow-up `last_insert_rowid()` for the int-PK case; new path uses `RETURNING <uuid-col>`. MSSQL path uses `OUTPUT INSERTED.<col>`. Replaces the auto-`SCOPE_IDENTITY()` append in `mssql-adapter.js:216-224` for any caller that opts into the new API; `lastId` semantics preserved as a back-compat shim until CS57-9. **Container validation:** N/A (no DB schema). |
| CS57-2 | Schema additive — users.uuid | Migration 008: add `users.uuid UNIQUEIDENTIFIER NULL UNIQUE` (MSSQL) / `TEXT NULL UNIQUE` (SQLite). Backfill all existing rows. Index. **Stays nullable** — NOT NULL deferred to CS57-5. App still reads/writes int `id`. **Validation:** include fresh-empty-DB cold-start scenario (`scripts/container-validate.js`). |
| CS57-3 | Schema additive — child uuids | Migration 009: add nullable `*_uuid` columns to `scores`, `puzzle_submissions`, `notifications`. Add nullable `*_user_uuid` shadow FKs to all child tables (`scores`, `puzzle_submissions`, `notifications`, `matches.created_by_uuid`, `matches.host_user_uuid`, `match_players.user_uuid`, `user_achievements.user_uuid`). Backfill via JOIN to `users.uuid`. Indexes. Verify zero NULLs after backfill (assert in migration). **Validation:** fresh empty DB. |
| CS57-4 | Dual-write inserts | All INSERT paths populate **both** legacy int columns and new uuid columns. JWT issuance (`server/middleware/auth.js:69`) writes both `id` and `uuid`. `req.user.uuid` populated by middleware. Test sweep: every INSERT path (`scores`, `submissions`, `notifications`, `users`, `matches`, `match_players`, `user_achievements`, `achievements` if applicable) asserts dual-write. **Validation:** fresh empty DB. |
| CS57-4b | Codebase ID-usage inventory | Mechanical sweep + checklist file (`project/cs57-id-usage-inventory.md`) of every `users.id`, `user_id`, `created_by`, `host_user_id`, `req.user.id`, `result.lastId`, `Number(req.params.id)`, `Number(rawId)` usage across `server/`, `public/`, and `tests/`. Includes `server/achievements.js`, `server/ws/matchHandler.js`, `server/routes/auth.js`, `server/routes/telemetry.js`, `server/feature-flags.js`, `server/app.js`. Output is a checklist that gates CS57-5/6/7. No code changes. **Validation:** N/A. |
| CS57-5 | Read switch + NOT NULL enforce | (a) Add NOT NULL + UNIQUE constraints to all uuid columns added in CS57-2/3 (now safe — dual-write has been live and inventory says backfill is clean). (b) Internal lookups (repository helpers / route SQL) switch WHERE clauses to `*_uuid`. Routes pass `req.user.uuid`. (c) Behind feature flag `USE_UUID_READS=true` (default on; off for instant rollback). Inventory checklist from CS57-4b drives the sweep. **Validation:** fresh empty DB + cold-start. |
| CS57-6 | API surface + path-param flip | (a) Public JSON responses return `id: <uuid>`, `userId: <uuid>`. Old int `id` retained in **`legacyId`** (kept until CS57-9 cleanup, matches feature-flag lifetime). (b) **Path-param/body-ID parsing migrates in this same step** — `Number(req.params.id)` / `Number(rawId)` sites in `server/routes/notifications.js:82`, `users.js:36`, `submissions.js:498/643/785/887/947` switch to UUID validation (`isUuid()`); endpoints accept either UUID or int (with int → UUID lookup) for the overlap window. (c) Update `public/js/app.js` to handle string IDs (audit `===`, localStorage keys, leaderboard render). (d) OpenAPI/README examples. **Validation:** fresh empty DB + e2e. |
| CS57-6b | Test fixture + helper migration | Rewrite numeric-only test fixtures: JWT factories (`tests/e2e-singleplayer.test.js:131-135`, `e2e-multiplayer.test.js:101-105`), numeric path IDs, admin-promotion by numeric user ID (`promotion-and-roles.test.js:22, 173`), bulk review IDs. Add shared `expect.uuid()` matcher and `makeTestUser()` helper that returns canonical-shape user. Numeric sentinel cases (`id: 0` for system) re-mapped to a fixed system UUID. **Validation:** N/A (test-only). May ship in same PR as CS57-6 if diff is small. |
| CS57-7 | FK + composite PK rebuild | Migration 010: per-table forward-only schema rebuild. (a) Drop named MSSQL FK constraints (`FK_matches_host_user_id` etc.) before dropping columns. (b) For composite-PK tables `match_players` and `user_achievements`: rebuild PK using `*_user_uuid` instead of `user_id` — SQLite path requires table-recreate (CREATE NEW with new PK, INSERT SELECT, DROP OLD, RENAME); MSSQL path: `DROP CONSTRAINT … ADD CONSTRAINT … PRIMARY KEY (match_id, user_id)` after the underlying column type swap. (c) For non-PK FKs (`scores.user_id`, `puzzle_submissions.user_id`, `notifications.user_id`, `matches.created_by`, `matches.host_user_id`): swap the storage type in place — drop legacy int column, rename `*_user_uuid`/`*_uuid` to the original name (`user_id`, `created_by`, `host_user_id`). Promote indexes. (d) **Forward-only on both adapters.** PR body must include explicit per-table drop/rebuild order and rollback runbook. **Validation:** fresh empty DB + populated-DB cold-start. |
| CS57-8 | PK cutover + JWT mapping table | Migration 011: drop integer PK on `users`, `scores`, `puzzle_submissions`, `notifications`. Promote `uuid` to PK and rename to `id`. SQLite path: table-recreate per CS57-7 pattern. MSSQL path: `DROP CONSTRAINT … ADD CONSTRAINT … PRIMARY KEY (id)`. (b) Keep `users.legacy_id INT NULL UNIQUE` mapping column for the JWT compatibility window. `jwt.verify` accepts old int-only tokens by looking up `users.legacy_id → users.id`; new tokens carry `uuid` only. (c) **Pre-merge gate:** verify Azure SQL automatic backup window covers the deploy or take a manual export to blob; document restore command in PR body. **Forward-only.** **Validation:** fresh empty DB + populated-DB cold-start + token-from-pre-CS57-8 acceptance test. |
| CS57-9 | Cleanup (≥ 7 days after CS57-8 ships to prod) | Wait one full JWT TTL after CS57-8 production deploy. Then: drop `users.legacy_id`, drop `legacyId` API field, drop `USE_UUID_READS` feature flag, remove dual-write code, remove `lastId` back-compat shim from CS57-1b, remove deprecated helpers, remove dual-emit telemetry/log fields. Update logger context (`userId` is now uuid string), OTel trace attributes, fixtures. **Validation:** fresh empty DB + populated. |
| CS57-10 | Docs + clickstop close | Update `CONTEXT.md` (Database Tables section), `README.md` if user-facing, `LEARNINGS.md` (record dual-key strategy + pitfalls + the rubber-duck findings). Move clickstop file to `done/`. |

## Cross-cutting concerns

- **Feature-flag rollout bucketing.** `server/feature-flags.js:72-85, 135-145` hashes `user.id` for deterministic percentage rollouts. Switching the bucket key from int to UUID would silently reshuffle every active rollout cohort. **Mitigation:** during the dual-key window, freeze bucket key on `legacyId` (int) or `username`. Only after CS57-9, decide whether to migrate cohort keys intentionally (likely a one-time controlled re-bucket).
- **Telemetry/logger continuity.** `server/routes/telemetry.js:48-57` and assorted log sites pass `userId: <int>`. **Mitigation:** during CS57-4 → CS57-9 overlap, emit **both** `userId` (int legacy) and `userUuid` (string canonical) in log/telemetry context. Drop the int field in CS57-9. This preserves observability time-series across the migration.
- **Adapter `lastId` semantics.** `mssql-adapter.js:204-224` auto-appends `SELECT SCOPE_IDENTITY() AS lastId`; `sqlite-adapter.js:62` returns `Number(result.lastInsertRowid)`. Both become meaningless once the PK is uuid. CS57-1b introduces the new `insertReturning(...)` API; legacy `lastId` continues to work for tables not yet migrated and for the `legacy_id` int auto column on `users` (until CS57-9). Every migrated INSERT call site moves to the new API in CS57-4 / CS57-5.
- **Empty-DB bootstrap.** Staging uses ephemeral SQLite; tests use temp-dir SQLite; both run migrations lazily on first request via `db-init-guard.js` and `server/app.js:37-50` immediately seeds the system user. Every CS57 migration must work against an empty DB and the first-request bootstrap path. Container validation includes a fresh-DB scenario for CS57-2/3/4/7/8.
- **No DB-waking background work.** Migrations stay request-driven via `db-init-guard.js`. No timers added.
- **Container validation.** `npm run container:validate` mandatory pre/post each review round for CS57-2, CS57-3, CS57-4, CS57-5, CS57-6, CS57-7, CS57-8, CS57-9 per [§ Cold-start container validation in OPERATIONS.md](../../OPERATIONS.md#cold-start-container-validation). Doc-only / inventory-only / test-only PRs (CS57-1, CS57-1b adapter-only if no schema, CS57-4b, CS57-6b, CS57-10) follow the docs-or-CI exemption.
- **Production data backfill.** CS57-2 backfill is small (hundreds of users → ms). CS57-3 is proportional to scores/submissions/notifications counts — verify on a staging snapshot before production. Backfills run inside transactions; each backfill migration asserts post-state (zero NULLs) before committing.

## Observability — logging, tracking & telemetry for the rollout

Each phase of a multi-PR data-model migration is high-risk; the only way to ship safely is to *see* what's happening in production at every step. This section is a hard requirement, not a nice-to-have — every subtask listed below has explicit observability deliverables called out, and CS57 cannot close until the dashboards/alerts described here are wired up and seen working.

### Principles

- **Every uuid-touching code path emits both `userId` (legacy int, when available) and `userUuid` (canonical) until CS57-9.** This applies to logger context (`server/logger.js` mixin), OTel span attributes, and `routes/telemetry.js` errors. No path may emit only one — splits in observability time-series during a migration are how silent regressions hide.
- **Counters, not just logs.** Every divergence (dual-write mismatch, read fell through to int path, JWT verified via legacy mapping) increments a named counter so it's queryable as an aggregate, not just a log search.
- **One App Insights / OTel custom dimension per phase signal** — `cs57.phase`, `cs57.path` (`uuid`/`int`/`dual`), `cs57.fallback` (e.g. `jwt-legacy-id-lookup`). Filterable in Kusto without parsing message strings.
- **Default-on, low-cardinality.** No high-cardinality fields in counters (no per-user uuid in metric tags — only in logs).

### Per-subtask observability deliverables

| Subtask | New observability work | Signal it produces |
|---------|-----------------------|---------------------|
| CS57-1, CS57-1b | `server/logger.js` extended to accept `userUuid` alongside `userId` (no-op until populated). Adapter `insertReturning(...)` emits OTel span `db.insert` with `db.return_path` = `last-id`/`returning-uuid`. | Baseline; future spans tagged. |
| CS57-2 | Migration logs `users.uuid` backfill row count + duration. New counter `cs57_users_uuid_null_count` (= count of `users` rows with `uuid IS NULL`) exposed via `/api/health` extension and logged at boot. | Should flat-line at 0 immediately after migration. Any drift = alert. |
| CS57-3 | Same backfill counters for each child table: `cs57_<table>_user_uuid_null_count`. Migration emits a per-table report. | Track that each NULL-count goes 0 and stays 0. |
| CS57-4 | **Dual-write divergence counter** — `cs57_dual_write_mismatch_total{table=...}`: incremented when an INSERT path produced an int row but no uuid (or vice versa). Logged at `error` level with full context. JWT issuance logs `cs57.jwt_payload_keys` once per minute (sampled) so we can confirm both `id` and `uuid` are being signed. | Mismatch should always be 0. Non-zero blocks CS57-5. |
| CS57-4b | Inventory checklist itself becomes a queryable artifact (`project/cs57-id-usage-inventory.md`); CS57-5 PR cannot merge until checklist is 100% ✅ ticked. No runtime signal. | Process gate. |
| CS57-5 | **Read-path telemetry** — every migrated repository helper emits OTel span attribute `cs57.read_key` = `uuid` or `int-fallback`. Counter `cs57_int_read_fallback_total{route=...}` increments on every legacy int read (means a route was missed by the inventory). Feature flag `USE_UUID_READS` evaluations counted via existing feature-flag telemetry. | `cs57_int_read_fallback_total` should be 0 in steady state. Non-zero = a route missed in CS57-4b → fix before CS57-6. |
| CS57-6 | **API-shape telemetry** — `cs57_api_response_shape{endpoint=...}` = `uuid-canonical`/`uuid-with-legacy`/`int-only` so we can see who's still on the old shape. **Path-param telemetry** — counter `cs57_param_id_format{route=...}` = `uuid`/`int-coerced` tracks how many clients send int IDs back (informs how soon CS57-9 can drop int-acceptance). Add structured event `cs57.legacy_id_used` whenever `legacyId` is read by client (server can't see this directly — fold into a client-side heartbeat in `public/js/app.js` posting to `/api/telemetry`). | `int-coerced` rate trends to 0 over time; CS57-9 cannot start until it's < some agreed threshold (e.g. < 0.1% of requests for 7 days). |
| CS57-6b | Test fixtures emit `cs57.test_fixture_version` so coverage tools can confirm new-shape fixtures are exercised. | Pure CI signal. |
| CS57-7 | Migration emits per-table row-count delta (before/after) + per-FK constraint name dropped/added. Counter `cs57_orphan_fk_total` checks for any rows where the child's `*_uuid` (now `*_id`) doesn't resolve in `users.uuid` — should be 0. | Migration aborts if non-zero. |
| CS57-8 | **JWT legacy-acceptance counter** — `cs57_jwt_legacy_id_lookup_total`: increments every time `jwt.verify` accepts a token via `users.legacy_id → users.id` lookup. **This is the single most important rollout signal.** When this counter has been at 0 for ≥ 7 consecutive days post-CS57-8 prod ship, CS57-9 cleanup is safe to start. Surface in App Insights workbook. | Drives the calendar wait between CS57-8 and CS57-9. |
| CS57-9 | Migration removes counters that targeted dropped code paths; remaining counters become `cs57_legacy_*_removed = 1` historical markers. | Closes out dashboards. |

### Feature-flag rollout monitoring

`server/feature-flags.js` hashes a bucket key for deterministic rollouts. During CS57-4 → CS57-9 the bucket key is **frozen on `legacyId`** (or `username`). Add a counter `cs57_feature_flag_bucket_key{key=...}` so we can prove (a) no flag is currently using `user.uuid` for bucketing during the overlap, and (b) when the eventual one-time re-bucket happens (post-CS57-9), we can quantify cohort movement. Alert if any flag flips its bucket key inside the overlap window without an explicit human-approved migration.

### Dashboards & alerts

Single Azure App Insights workbook `CS57 Migration Health` with these panels (Kusto sketches — refine during CS57-4):

```kusto
// Dual-write divergence — must be 0
customMetrics
| where name == "cs57_dual_write_mismatch_total"
| summarize sum(value) by bin(timestamp, 5m), tostring(customDimensions.table)
| render timechart

// Reads still going through int fallback — must be 0 after CS57-5
customMetrics
| where name == "cs57_int_read_fallback_total"
| summarize sum(value) by bin(timestamp, 5m), tostring(customDimensions.route)

// JWT legacy-id acceptance — drives CS57-9 calendar
customMetrics
| where name == "cs57_jwt_legacy_id_lookup_total"
| summarize sum(value) by bin(timestamp, 1h)
| render timechart

// API shape mix — int-coerced trend
customMetrics
| where name == "cs57_param_id_format"
| summarize sum(value) by bin(timestamp, 1h), tostring(customDimensions.format)
| render areachart
```

**Alerts (App Insights / GitHub Issues via existing health-monitor pattern):**

| Alert | Trigger | Severity | Action |
|-------|---------|----------|--------|
| Dual-write mismatch | `cs57_dual_write_mismatch_total > 0` over 5 min | P1 | Page; pause CS57-5 dispatch |
| Int read fallback | `cs57_int_read_fallback_total > 0` over 15 min after CS57-5 ships | P2 | Open issue; add route to inventory |
| Backfill NULL drift | `cs57_<table>_uuid_null_count > 0` after migration completed | P1 | Page; rollback migration |
| JWT legacy lookup spike | Sudden jump in `cs57_jwt_legacy_id_lookup_total` (e.g. > 2× rolling 7d baseline) post CS57-8 | P3 | Investigate — may indicate token-issuance regression |
| Feature flag bucket-key drift | `cs57_feature_flag_bucket_key{key="uuid"} > 0` during overlap | P2 | Open issue; revert offending flag config |

Re-use the existing `.github/workflows/health-monitor.yml` pattern: a scheduled workflow polls App Insights via REST and opens a GitHub issue if any of the above thresholds breach. Issue title prefix: `[CS57]`.

### Logging conventions during the migration

- All log lines that today carry `userId: <int>` add `userUuid: <string>` from CS57-4 onward (sourced from `req.user.uuid`).
- Logger context binding (`server/logger.js` mixin) auto-includes both fields when `req.user` is set; route handlers should not need explicit changes other than the middleware update in CS57-4.
- Pino redact list unchanged (uuids are not sensitive on their own; they replace ints in the same fields).
- Structured search query in CONTEXT.md / LEARNINGS.md (added in CS57-10) shows how to correlate a user across the migration: `userId == 42 OR userUuid == "<uuid-from-users-table>"`.

### Definition of "rollout healthy"

CS57-N is considered **healthy in production** and the next subtask may be dispatched only when **all** of the following hold for ≥ 24 hours after the deploy:

1. No new alerts above P3 in the `CS57 Migration Health` workbook.
2. Counters specific to the just-shipped phase are at expected steady-state values (zero for divergence/fallback/orphan; non-zero-and-growing for dual-write/issuance counters).
3. Container validation cycle on the next subtask's PR passes against a fresh DB.
4. No regressions in pre-existing health monitor signals (`/healthz`, `/api/health`).

This is gate criteria, not advisory — captured in the CS57 clickstop file's task table as "Healthy Soak ≥ 24h" column.

## Rollback story

| Phase | Rollback |
|-------|----------|
| CS57-1, CS57-1b | Revert PR; pure adapter helper additions. |
| CS57-2, CS57-3 | Drop the new column(s); backward-compat preserved. Rollback migration 008b/009b. |
| CS57-4 | Revert dual-write commits; ints still authoritative. |
| CS57-4b | N/A (inventory doc). |
| CS57-5 | Flip `USE_UUID_READS=false`; NOT NULL constraints stay (harmless because dual-write fills them). |
| CS57-6, CS57-6b | Revert response shape; clients reading `legacyId` keep working. |
| CS57-7 | **Forward-only** (DB restore). PR includes runbook. |
| CS57-8 | **Forward-only** (DB restore). Pre-merge backup gate. |
| CS57-9 | Forward-only; trivial because everything migrated cleanly. |

## Parallelism

- CS57-1 and CS57-1b can run in parallel.
- CS57-2 → CS57-3 sequential (CS57-3 depends on `users.uuid`).
- CS57-4b can start as soon as CS57-3 is in flight (independent inventory work).
- CS57-4 must follow CS57-1b + CS57-3.
- CS57-5 follows CS57-4 + CS57-4b checklist.
- CS57-6 + CS57-6b can land together.
- CS57-7 → CS57-8 → wait 7d → CS57-9 → CS57-10 strictly sequential.

Realistic worktree usage: 1 sub-agent per PR; the bottleneck is migration ordering and container-validation cycles, not slot count.

## Open questions — resolved

- [x] **Generation method:** `crypto.randomUUID()` for app/tokens; engine-native for child rows. *(User answered.)*
- [x] **`legacyId` lifetime:** kept until CS57-9 cleanup. *(User answered.)*
- [x] **Q3 reframed as pre-merge gate on CS57-8:** verify Azure SQL automatic-backup window or take a manual export before the forward-only PR ships. Documented in CS57-8 row.

## Pre-dispatch checklist

- [x] CS57 number verified free across `planned/`, `active/`, `done/`, and WORKBOARD.md (highest pre-existing: CS56).
- [x] Rubber-duck plan review completed; all 12 findings adopted.
- [x] User-resolved open questions (UUID generation method, `legacyId` lifetime).
- [ ] Move WORKBOARD row from `—/—` to `CS57-1` once first PR is dispatched.
- [ ] `git mv planned/ → active/` and update Status to `🔄 In Progress` at first dispatch.
- [ ] Prompt user for `/rename [yoga-gwn-c2]-CS57-1: int-to-uuid migration` at first dispatch.

## Notes

- This plan does **not** touch tables already keyed by TEXT (matches/match_rounds/achievements/puzzles, plus puzzle IDs themselves) — they're already external-stable.
- The 7-day wait between CS57-8 production ship and CS57-9 cleanup is calendar time, not work time. CS57-9 should be slot-released during the wait.
