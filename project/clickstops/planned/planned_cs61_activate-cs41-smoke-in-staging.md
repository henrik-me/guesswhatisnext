# CS61 — Activate CS41 smoke + DB migration validation in staging

**Status:** ⬜ Planned
**Origin:** CS41 close-out (2026-04-26) surfaced two related staging gaps:
1. Staging silently skips the entire CS41 validation chain (CS41-1 smoke, CS41-3 AI verify, CS41-12 old-rev smoke, CS41-5 rollback smoke) because staging uses container-local SQLite at `/tmp/game.db` ([staging-deploy.yml:476-477](../../../.github/workflows/staging-deploy.yml)) — every revision gets a fresh ephemeral DB, so `gwn-smoke-bot` (the user CS41-1''s smoke logs in as) cannot be pre-seeded once via `scripts/setup-smoke-user.js` the way it''s done for prod.
2. The DB migration framework (`server/db/migrations/`, 8 migrations, called by [`server/app.js:46-49`](../../../server/app.js)) **runs against staging''s SQLite on every server startup, but no deploy gate validates that the migrations actually applied successfully.** A migration that throws would crash server startup → `/healthz` returns 5xx → smoke would catch it indirectly, BUT the failure mode "migration applied partially" or "tracker out of sync" is only detectable by inspecting the migration tracker state explicitly.

**User direction (2026-04-26 conversation):** "I assume staging runs all the database creation steps? one by one? it sounds like it would be possible to monitor and validate the database creation using those steps and that is what staging should do for sqlite? sounds like option A; we need smoke testing! and we need to validate the db creation migration steps in staging."

**Filed by:** yoga-gwn-c2 during CS41 close-out.

## Goal

Make staging deploys actually exercise (a) the full CS41 smoke + AI verify + ingest summary chain AND (b) explicit validation that all 8 DB migrations applied cleanly. Both run on every staging deploy. Failures abort the deploy before traffic shift. The cheapest viable approach so this lands fast and unblocks real staging validation today.

**Out of scope:** moving staging to managed MSSQL (separate, larger CS — relates to CS59).

## Investigated repository state (verified during CS61 plan, 2026-04-26T21:30Z)

| What | Where | Implication |
|---|---|---|
| Migration framework call | [`server/app.js:46-49`](../../../server/app.js) `await db.migrate(migrations)` runs on `initializeDatabase()` startup | Migrations run on EVERY server boot in staging (because SQLite is recreated). On startup failure, server doesn''t start, /healthz fails, smoke catches it indirectly. |
| Migration framework | [`server/db/migrations/`](../../../server/db/migrations/) (8 migrations + `_tracker.js` + `index.js`) | `_tracker.js` records which migrations applied. The tracker state is queryable but no current API exposes it. |
| `/api/health` route | [`server/app.js:399-462`](../../../server/app.js), `requireSystem` (system-key auth) | Today reports `database`, `websocket`, `storage`, `uptime` checks. **Does NOT report migration tracker state.** CS61 extends this. |
| `/healthz` route | [`server/app.js:465`](../../../server/app.js), unauthenticated | Boot-quiet sentinel; doesn''t touch DB. CS41-1 polls this first. |
| Staging GWN_DB_PATH | [`staging-deploy.yml:476-477`](../../../.github/workflows/staging-deploy.yml): `/tmp/game.db` | SQLite, ephemeral. Recreated every revision deploy. |
| Migration step in staging-deploy | [`staging-deploy.yml:531-542`](../../../.github/workflows/staging-deploy.yml): graceful skip when `STAGING_DATABASE_URL` unset | Correct for SQLite (no external DB to migrate); but means there''s no pre-deploy validation either. |
| Smoke-bot user `gwn-smoke-bot` | Created in prod DB by `scripts/setup-smoke-user.js` (operator one-time per env) | In staging: the SQLite is fresh per revision, so the user MUST be created at deploy time per revision, OR the smoke must use a different auth strategy. |
| `/api/auth/register` rate limit | [`server/routes/auth.js:21-26`](../../../server/routes/auth.js): 5 per minute per IP | Rate limit doesn''t apply across separate deploys. |
| `gwn-smoke-` prefix reservation | [`server/routes/auth.js`](../../../server/routes/auth.js) (CS41-0): registration rejects `gwn-smoke-*` | **Conflict:** the CS41-0 reservation rejects the very username CS61 needs to register. CS61 must use a different mechanism — either a system-key registration bypass for the reserved prefix, or a new system-key endpoint. |

**The CS41-0 reservation is the biggest design question for CS61.** See § Design decisions.

## Design decisions

### D1. Smoke-bot user creation in staging — three options

The CS41-0 reservation rejects `gwn-smoke-*` at the public `POST /api/auth/register` endpoint. Three viable paths:

**Option α — System-key bypass on `/api/auth/register`.** Modify [`server/routes/auth.js`](../../../server/routes/auth.js) so requests carrying a valid system-key header (`x-api-key: $SYSTEM_API_KEY`) skip the reserved-prefix check. Pros: minimal new code; uses existing auth infra; symmetrical with `requireSystem` usage elsewhere. Cons: widens the surface area of `/api/auth/register` — needs careful testing.

**Option β — New system-key-only endpoint `POST /api/admin/seed-smoke-user`.** Dedicated endpoint that the deploy step calls. Pros: clean separation; no impact on `/api/auth/register`. Cons: more new code; new route surface needs CS41-0-style protection.

**Option γ — Exec `setup-smoke-user.js` inside the live container.** Use `az containerapp exec` to run the existing script directly against the container''s filesystem. Pros: reuses existing prod-tested script; zero new server-side code. Cons: requires elevated RBAC for the workflow''s service principal (verify `Microsoft.App/containerApps/exec/action` permission); harder to test.

**Recommendation:** **Option α** — extend the existing reservation check in `auth.js` to bypass when a valid system key is presented. Smallest blast radius; testable as a unit; auth path is well-established. Rubber-duck this before locking.

### D2. Migration validation — extend `/api/health` vs. new endpoint

**Option a — Extend `/api/health` (system-key) to include `migrations` check.** Add a new check that queries `_tracker.js` schema to report `{ applied: N, expected: M, status: ''ok''/''mismatch''/''error'', names: [...] }`. CS41-1 already calls this; assert `migrations.status === ''ok''`. Pros: reuses existing endpoint; CS41-1 unchanged externally. Cons: makes /api/health do more work.

**Option b — New `/api/admin/migrations` endpoint.** Dedicated. Pros: separation. Cons: more new code.

**Recommendation:** **Option a** — extend `/api/health`. Smoke already calls it; adding one more check keeps the smoke flow shape unchanged.

### D3. CS41-12 old-rev smoke against staging — first-deploy transition

When CS61-1 lands, the OLD revision was deployed BEFORE CS61, so its SQLite has no smoke-bot. CS41-12''s smoke against the OLD revision fails with login → 401.

**Recommendation:** make CS41-12''s staging path graceful-skip on login-401 with a notice "OLD revision pre-dates CS61 smoke-bot seeding; smoke skipped — re-run after one transition deploy". After one full deploy cycle, BOTH revisions have smoke-bot, and CS41-12 starts working real-time.

### D4. Staging skip-on-secret-missing → hard-fail (parity with prod)

Today staging''s CS41-1/CS41-12/CS41-5 steps gracefully skip when `SMOKE_USER_PASSWORD_STAGING` is unset. CS61 makes them hard-fail (parity with prod). Once CS61 ships, the operator MUST set the secret for staging deploys to succeed.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS61-1 | **System-key registration bypass + smoke-bot inline seed** (per D1 Option α). Extend `server/routes/auth.js` so registration with a valid `x-api-key` header bypasses the reserved-prefix check. New `scripts/seed-smoke-user-via-api.js` POSTs to `/api/auth/register` with system key + smoke-bot password. Idempotent (treats "username already exists" 400 as success). Plus unit tests. | ⬜ Pending | Prerequisite for everything else. |
| CS61-2 | **Add `migrations` check to `/api/health`** (per D2 Option a). Query `_tracker.js` for applied count + names; compare against migrations array length; report `{ applied, expected, status, names }`. Plus unit tests. | ⬜ Pending | Independent of CS61-1; can ship in parallel. |
| CS61-3 | **Wire seed step + migration assertion into staging-deploy.yml.** After new revision deploys (at 0% traffic) and BEFORE CS41-12, run seed script. Hard-fail on seed failure. Extend CS41-1 smoke (or sibling step) to assert `/api/health` `migrations.status === ''ok''`. | ⬜ Pending | Depends on CS61-1 + CS61-2 merged. |
| CS61-4 | **Drop staging skip-on-secret-missing branches.** Remove `if [ -z "$SMOKE_USER_PASSWORD" ]` from CS41-1/CS41-12/CS41-5 staging paths. Replace with hard-fail. Seed step (CS61-3) is now the single point of failure when secret is missing. | ⬜ Pending | Depends on CS61-3 merged + verified working in staging. |
| CS61-5 | **CS41-12 graceful-skip on smoke-bot-not-found in OLD revision.** Detect login-401 from `scripts/smoke.js` against OLD revision; treat as transitional skip (notice + exit 0). Document expected one-deploy transition. | ⬜ Pending | Depends on CS61-3. |
| CS61-6 | **Verification deploy.** After CS61-1..-5 merged + operator sets `SMOKE_USER_PASSWORD_STAGING`: trigger staging deploy, confirm seed succeeds, CS41-12 graceful-skips (first deploy), CS41-1 smoke passes, /api/health migrations check is `ok`, CS41-3 AI verify finds probes. Then second deploy: confirm CS41-12 actually runs. | ⬜ Pending | Verification only; no code. |
| CS61-7 | **Documentation + close.** Update `OPERATIONS.md` "Deploy gates (CS41)" with staging inline-seed pattern + migration validation. Move CS61 to `done/`. | ⬜ Pending | Standard close-out. |

## Validation gates per PR (mandatory per INSTRUCTIONS § 4a + LIVE PR-CI gate)

Every CS61 PR includes:
- ✅ `npm test` (with new tests).
- ✅ `npm run check:docs`.
- ✅ `npm run check:migration-policy`.
- ✅ `npm run container:validate`.
- ✅ `## Telemetry Validation` section per § 4a.

## Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| System-key bypass on `/api/auth/register` (CS61-1) widens auth surface | MEDIUM | Explicit unit test: request WITHOUT system key still gets reserved-prefix rejection. Limit bypass to ONLY the reserved-prefix check — other validations (length, etc.) still apply. Rubber-duck this carefully. |
| `_tracker.js` schema query coupling (CS61-2) | LOW | Use `_tracker.js` public API rather than raw SQL queries. |
| First-deploy-after-CS61 transition is invisible to operator | LOW | CS61-5''s graceful-skip emits explicit notice; CS61-7 docs flag this. |
| `_tracker.js` may not have `applied count` query API | LOW | CS61-2 adds the API method if missing — small additive change. |
| Migration check queries DB on every /api/health call | LOW | Single-row tracker query; sub-millisecond. Cache for ~5s if profiling shows up. |
| Staging deploys break for operators without secret (CS61-4) | MEDIUM | CS61-4 lands LAST; CS61-1..-3 verified via CS61-6 BEFORE CS61-4 ships. PR description has explicit operator action callout. |

## Acceptance criteria

- [ ] System-key bypass allows `gwn-smoke-*` registration; non-system-key requests still rejected.
- [ ] `scripts/seed-smoke-user-via-api.js` exists, idempotent.
- [ ] `/api/health` includes `migrations` check.
- [ ] Staging deploy seeds smoke-bot before any CS41 smoke step.
- [ ] Staging CS41-1 + CS41-3 + CS41-7 all run end-to-end (verified via CS61-6).
- [ ] Staging CS41-12 graceful-skips on first post-CS61 deploy + actually runs on subsequent deploys.
- [ ] Staging skip-on-secret-missing branches removed.
- [ ] OPERATIONS.md documents staging inline-seed pattern + migration validation.
- [ ] No regression in `npm test` or `npm run container:validate`.
- [ ] Each CS61 PR contains `## Container Validation` AND `## Telemetry Validation` sections.

## Will not be done as part of this clickstop

- Moving staging to managed MSSQL (separate larger CS — relates to CS59).
- Changing prod''s persistent-user pattern.
- Smoke-bot data cleanup in staging (recreated every revision anyway).
- Per-migration timing telemetry (covered implicitly by CS41-3 AI verify).
- Auto-rollback on migration mismatch (operator handles).

## Rollback story

| Task | Rollback |
|---|---|
| CS61-1 | Revert PR. Reservation enforcement returns; staging cannot seed smoke-bot. |
| CS61-2 | Revert PR. /api/health returns to current shape; migration validation no longer surfaced. |
| CS61-3 | Revert PR. Staging deploy returns to skipping smoke entirely. |
| CS61-4 | Revert PR. Staging skip-on-secret-missing returns; deploys keep working without smoke. |
| CS61-5 | Revert PR. CS41-12 staging path returns to prior behavior. |
| CS61-6/7 | Pure verification + docs. |

## Relationship to other clickstops

- **CS41** — predecessor; established the smoke + verify chain CS61 makes runnable in staging.
- **CS41-0** — reservation check that CS61-1 extends with system-key bypass.
- **CS54** — App Insights wiring; CS41-3 AI verify in staging produces real `gwn-ai-staging.requests` rows once CS61 lands.
- **CS59** — staging cost-soak verification; inline-seed adds known small deterministic traffic per deploy that CS59-8 accounts for.
- **Future CS for managed-MSSQL staging** (unfiled) — would supersede CS61''s inline-seed approach.

## Parallelism

- CS61-1 and CS61-2 are independent. Two sub-agents in parallel.
- CS61-3 depends on CS61-1 + CS61-2 merged.
- CS61-4 depends on CS61-3 merged + CS61-6 verified.
- CS61-5 depends on CS61-3 merged.
- CS61-6 depends on CS61-3 + CS61-5 merged + operator-set secret.
- CS61-7 depends on CS61-6.

Total: 7 PRs across max 2 sub-agents at a time.

## Pre-dispatch checklist

- [x] CS61 number verified free.
- [x] Plan reflects user direction: smoke testing + DB migration validation in staging.
- [ ] Rubber-duck pass via GPT-5.4 — findings to be addressed before dispatch.
- [ ] User reviews plan after rubber-duck → approves before dispatch.