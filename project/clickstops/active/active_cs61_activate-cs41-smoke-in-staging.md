# CS61 — Activate CS41 smoke + DB migration validation in staging

**Status:** 🔄 In Progress — v3 (post-rubber-duck)
**Owner:** yoga-gwn-c2 (claimed 2026-04-26T23:35Z)
**Origin:** CS41 close-out (2026-04-26) surfaced two related staging gaps:
1. Staging silently skips the entire CS41 validation chain (CS41-1 smoke, CS41-3 AI verify, CS41-12 old-rev smoke, CS41-5 rollback smoke) because staging uses container-local SQLite at `/tmp/game.db` ([staging-deploy.yml:476-477](../../../.github/workflows/staging-deploy.yml)) — every revision gets a fresh ephemeral DB, so `gwn-smoke-bot` (the user CS41-1''s smoke logs in as) cannot be pre-seeded once via `scripts/setup-smoke-user.js` the way it''s done for prod.
2. The DB migration framework (`server/db/migrations/`, 8 migrations, called by [`server/app.js:46-49`](../../../server/app.js)) **runs against staging''s SQLite on every server startup, but no deploy gate validates that the migrations actually applied successfully.**

**User direction (2026-04-26):** smoke testing AND DB migration step validation in staging.

**Plan revision history:**
- v1: inline-seed-via-API only (Option α: bypass on `/api/auth/register`).
- v2: added DB migration validation by extending `/api/health` with a `migrations` check.
- **v3 (this — post-GPT-5.4 rubber-duck):** addresses 3 blockers + 6 serious findings. Pivots from Option α → **Option β** (dedicated admin endpoint — narrower auth surface). Migration check moves OFF `/api/health.status` rollup to a NEW dedicated endpoint that does NOT affect existing health-check consumers. Adds `getMigrationState()` adapter API as a precondition. Strengthens CS41-12 transition signal to a positive marker rather than 401-detection. Adds early secret preflight + explicit rollback coupling.

## Goal

Staging deploys actually exercise (a) the full CS41 smoke + AI verify + ingest summary chain AND (b) explicit validation that all DB migrations applied cleanly. Failures abort the deploy before traffic shift. Cheapest viable approach so it lands fast.

**Out of scope:** moving staging to managed MSSQL (separate, larger CS — relates to CS59).

## Investigated repository state (verified during plan v3, 2026-04-26)

| What | Where | Implication |
|---|---|---|
| Migration framework call | [`server/app.js:46-49`](../../../server/app.js) | Migrations run on every server boot in staging. |
| Migration tracker API | [`_tracker.js`](../../../server/db/migrations/_tracker.js) — exposes `ensureMigrationsTable`, `getAppliedVersions`, `runMigrations` only. **Header explicitly says "should not be imported directly by routes."** | CS61 must add a public adapter-level wrapper (`db.getMigrationState()`) before any route can read tracker state. |
| `/api/health` route | [`server/app.js:399-462`](../../../server/app.js) — `requireSystem` | Top-level `status` is rolled from all checks. Existing consumers ([`tests/health.test.js`](../../../tests/health.test.js), [`scripts/health-check.sh`](../../../scripts/health-check.sh), [`tests/e2e/health-api.spec.mjs`](../../../tests/e2e/health-api.spec.mjs)) assume `status: 'ok'` on healthy systems. **Adding migrations to the rollup risks breaking these — DO NOT do that.** |
| `/api/auth/register` duplicate response | [`server/routes/auth.js:76-79`](../../../server/routes/auth.js): returns **HTTP 409 + `{error: "Username already taken"}`** | Idempotency contract for the seed script: 409 is success-on-rerun, NOT 400. |
| `gwn-smoke-` reservation | CS41-0 in [`auth.js`](../../../server/routes/auth.js) — public registration rejects `gwn-smoke-*` | Bypass needed for staging seed; see Design D1. |
| Existing admin route pattern | [`server/routes/admin.js`](../../../server/routes/admin.js) + [`server/middleware/auth.js`](../../../server/middleware/auth.js) (`requireSystem`) | Established pattern for narrow admin endpoints; CS61 reuses it. |
| `setup-smoke-user.js` (prod-tested) | [`scripts/setup-smoke-user.js`](../../../scripts/setup-smoke-user.js) — direct DB insert | Sibling pattern for `seed-smoke-user-via-api.js` but works against MSSQL via direct connection. CS61''s API-based approach is needed for staging where the DB is inside the container. |
| Workflow SP RBAC | [`infra/deploy.sh:265-278`](../../../infra/deploy.sh): SP gets **Contributor** on resource scope | Likely covers `Microsoft.App/containerApps/exec/action` — Option γ is technically viable, but Option β still wins on testability + auditability. |
| Staging AI wiring | Live — [`staging-deploy.yml:478-479`](../../../.github/workflows/staging-deploy.yml) + CS54-3 done | CS41-3 AI verify in staging will work once smoke is producing requests. |
| Existing CS41-12 staging skip | [`staging-deploy.yml:596-598`](../../../.github/workflows/staging-deploy.yml) — graceful-skip on `SMOKE_USER_PASSWORD_STAGING` unset | CS61 replaces this with hard-fail (post-secret-set) + a positive transition marker (see Design D3). |

## Design decisions (v3)

### D1. Smoke-bot user creation in staging — Option β (NEW admin endpoint)

**Pivot from v2''s Option α to Option β** per rubber-duck Serious finding #4.

**Why β over α:** the `/api/auth/register` route does multiple things (validation, role assignment, JWT issuance, registration logging). Bypassing the reserved-prefix check there widens the attack surface of a public, rate-limited endpoint to allow privileged-user creation. A dedicated narrow endpoint (`POST /api/admin/seed-smoke-user`) with `requireSystem` auth and a HARD-CODED username (no arbitrary input from the caller) is a smaller, more auditable surface.

**Why β over γ (`az containerapp exec`):** even though SP RBAC likely covers exec, Option β is unit-testable (Option γ is integration-only); Option β has a clear log trail in the application (Option γ leaves only Azure platform logs); and Option β''s endpoint is reusable for other one-time-seed workflows.

**Endpoint contract (locked):**
- `POST /api/admin/seed-smoke-user`
- Auth: `requireSystem` (existing `x-api-key` middleware).
- Body: `{ password: string }`.
- Behavior: idempotent. If user `gwn-smoke-bot` already exists, return **200 + `{status: "exists", username: "gwn-smoke-bot"}`**. If not, create and return **201 + `{status: "created", username: "gwn-smoke-bot"}`**. Hard-coded username; no other inputs accepted.
- Audit: emits `audit.seed-smoke-user` log line with `actor: 'system-api-key'`, `result: 'created'|'exists'`.

### D2. Migration validation — NEW dedicated endpoint (not /api/health)

**Pivot from v2''s "extend /api/health"** per rubber-duck Blocker #2.

**Why NOT /api/health:** rolling migration check into the existing `status` field would break existing consumers (`tests/health.test.js`, `scripts/health-check.sh`, `tests/e2e/health-api.spec.mjs`) that assert `status: 'ok'`. Adding it as a non-rolled-up check still requires consumers to opt in.

**New endpoint contract (locked):**
- `GET /api/admin/migrations`
- Auth: `requireSystem`.
- Response: `{ applied: number, expected: number, status: 'ok' | 'pending' | 'ahead' | 'error', names: string[], lastError: string|null }`.
- `status` taxonomy:
  - `ok`: `applied === expected`.
  - `pending`: `applied < expected` — server boot did not finish migrations (likely transient during cold-start; legit failure if persistent).
  - `ahead`: `applied > expected` — code is older than the DB (rolled-back deploy after newer code applied newer migrations); LEGITIMATE during rollback windows. NOT a failure.
  - `error`: tracker query itself failed.
- Smoke-side assertion (staging-only, NEW revision only): `status === 'ok'` (after seed step ensures cold-start is past).
- Old-rev smoke (CS41-12) and rollback smoke (CS41-5) explicitly do NOT assert this — they would legitimately see `ahead` or `pending` and that''s fine.

### D2a. New adapter-level API (precondition for D2)

Per rubber-duck Blocker #3, add `getMigrationState()` to the adapter interface (both SQLite and MSSQL implementations). Internally calls `_tracker.getAppliedVersions()`. Routes call `db.getMigrationState()` — never import `_tracker.js` directly.

### D3. CS41-12 old-rev transition — positive marker, not 401-detection

Per rubber-duck Serious finding #5: "skip on 401" masks both "old revision pre-dates CS61" AND "old revision auth is broken."

**v3 transition signal:** probe `GET /api/admin/migrations` against the OLD revision (it''s `requireSystem`, accepts the same `x-api-key` the workflow already uses for /api/health):
- HTTP **404** (route not registered) → OLD revision pre-dates CS61-2 → **graceful-skip** CS41-12 with notice "OLD revision pre-dates CS61; CS41-12 skipped — re-run after one transition deploy".
- HTTP **200/401/403** (route exists, regardless of auth result) → OLD revision is post-CS61 → **proceed with full CS41-12 smoke**.
- HTTP anything else → unexpected; fail loudly.

This is a positive marker (route presence) rather than a behavior detection (login result). Cannot be fooled by a broken auth path.

### D4. Staging skip-on-secret-missing → hard-fail (parity with prod) + early preflight

Per rubber-duck Serious finding #6: add a workflow step that fires EARLY (before `az containerapp update`) and fails the deploy if `SMOKE_USER_PASSWORD_STAGING` is unset. Operator gets the failure in seconds, not after wasted work.

```yaml
- name: Preflight — required secrets present
  run: |
    if [ -z "${{ secrets.SMOKE_USER_PASSWORD_STAGING }}" ]; then
      echo "::error::SMOKE_USER_PASSWORD_STAGING is unset. Set it before staging deploys can proceed. See OPERATIONS.md § Deploy gates (CS41)."
      exit 1
    fi
```

This step lands in the SAME PR as CS61-4 to keep the contract atomic.

### D5. Rollback coupling (new section per rubber-duck Serious #7)

| If you revert... | You also MUST revert... | Why |
|---|---|---|
| CS61-1 (admin endpoint + script) | CS61-3 (workflow seed step) | Without endpoint, seed step always fails → ALL staging deploys broken |
| CS61-2 (migration check + adapter API) | CS61-3 (smoke assertion of migrations.status) | Smoke would call non-existent endpoint |
| CS61-3 (workflow integration) | CS61-4 (skip removal) + CS61-5 (transition marker) | Without seed in workflow, hard-fail = always-broken staging |

**Operationally:** a single revert PR for CS61-1 must include the corresponding workflow revert. The CS61-7 closing summary documents this explicitly.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS61-0 | **Adapter-level `getMigrationState()` API** (precondition per D2a). Add public method on the DB adapter interface; implement for SQLite + MSSQL. Wraps `_tracker.getAppliedVersions()`. Plus unit tests for both backends. | ⬜ Pending | Lands FIRST. Other tasks depend on this API existing. |
| CS61-1 | **`POST /api/admin/seed-smoke-user` endpoint + seed script** (per D1 Option β). New endpoint in `server/routes/admin.js`; idempotent (200 on exists, 201 on created); audit-logged. New `scripts/seed-smoke-user-via-api.js` POSTs to it with system key + smoke-bot password from env. **Idempotency contract: existing-user response is HTTP 409 from `/api/auth/register` — but our NEW endpoint owns the contract and can return 200/exists directly without going through register''s 409 path.** Plus unit tests covering: wrong API key rejected; correct key creates; correct key on existing returns 200; missing password rejected; reserved-prefix bypass scoped to ONLY this endpoint. | ⬜ Pending | Independent of CS61-2; can ship in parallel. |
| CS61-2 | **`GET /api/admin/migrations` endpoint** (per D2). Add to `server/routes/admin.js`; uses adapter `getMigrationState()` from CS61-0. Plus unit tests covering ok/pending/ahead/error/not-initialized paths. | ⬜ Pending | Depends on CS61-0 merged. |
| CS61-3 | **Wire seed step + migration assertion into staging-deploy.yml.** Add: (a) early secret preflight per D4; (b) seed step after new-revision deploy, before CS41-12; (c) NEW staging smoke-side assertion of `/api/admin/migrations.status === 'ok'` against the new revision (NOT shared `scripts/smoke.js` — a separate inline step). All steps fail-fast. | ⬜ Pending | Depends on CS61-1 + CS61-2 merged. |
| CS61-4 | **Drop staging skip-on-secret-missing branches.** Remove `if [ -z "$SMOKE_USER_PASSWORD" ]` from CS41-1/CS41-12/CS41-5 staging paths. Replace with hard-fail. Preflight step (CS61-3 (a)) is now the single point of failure when secret is missing. | ⬜ Pending | Depends on CS61-3 merged + CS61-6 verified working. |
| CS61-5 | **CS41-12 staging transition marker** (per D3). Probe `GET /api/admin/migrations` against OLD revision''s FQDN; HTTP 404 → graceful-skip with notice (OLD pre-dates CS61); HTTP 200/401/403 → proceed with full CS41-12 smoke; other → fail. | ⬜ Pending | Depends on CS61-3 merged. |
| CS61-6 | **Verification deploy.** After CS61-1..-5 merged + operator sets `SMOKE_USER_PASSWORD_STAGING`: trigger staging deploy, confirm preflight + seed + migration check + CS41-1 smoke + CS41-3 AI verify all pass. CS41-12 graceful-skips on first deploy (OLD pre-dates CS61). Trigger SECOND deploy: CS41-12 actually runs (OLD now is post-CS61). | ⬜ Pending | Verification only; no code. |
| CS61-7 | **Documentation + close.** Update OPERATIONS.md "Deploy gates (CS41)" section: staging inline-seed pattern, migration validation endpoint, transition marker, rollback coupling table from D5. Move CS61 to `done/`. | ⬜ Pending | Standard close-out. |

## Validation gates per PR (mandatory per INSTRUCTIONS § 4a + LIVE PR-CI gate)

Every CS61 PR includes:
- ✅ `npm test` (with new tests).
- ✅ `npm run check:docs`.
- ✅ `npm run check:migration-policy`.
- ✅ `npm run container:validate`.
- ✅ `## Container Validation` + `## Telemetry Validation` sections.

## Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| New admin endpoint expands attack surface | LOW | `requireSystem` auth (same as existing `/api/admin/*`); HARD-CODED username (no input); rate limit not needed since system-key callers are trusted; audit log on every call. |
| `getMigrationState()` query latency | LOW | Single-row tracker count; sub-millisecond. |
| `/api/admin/migrations` reports `ahead` during rollback windows — operator misreads as failure | MEDIUM | Documented in D2 status taxonomy. Smoke does NOT assert ahead/pending/error from rollback or old-rev smoke. Only NEW-revision-only assertion is `=== 'ok'`. |
| First-deploy-after-CS61 transition is invisible to operator | LOW | CS61-5''s graceful-skip emits explicit notice; CS61-7 docs flag this. |
| Operator forgets to set secret before CS61-4 lands → staging breaks | MEDIUM | Early preflight (D4) fails in seconds with a clear message pointing at OPERATIONS.md. CS61-4 lands AFTER CS61-6 verification confirms the secret is set. |
| Rollback of CS61-1 alone leaves staging broken | MEDIUM | D5 rollback coupling table documents the required atomic-revert. CS61-7 docs reinforce. |
| Staging AI wiring (CS54-3) was reverted/never applied | LOW (not currently — verified live) | If CS61-6 finds AI verify failing, root-cause to CS54 wiring before assuming CS61 issue. |
| `requireSystem` auth in CS61-1/CS61-2 differs from `/api/auth/register`''s public path — could expose a header-injection vector | LOW | Use the existing `requireSystem` middleware unchanged; do not handcraft auth. |

## Acceptance criteria

- [ ] Adapter-level `getMigrationState()` API exists; SQLite + MSSQL implementations have unit tests.
- [ ] `POST /api/admin/seed-smoke-user` exists; idempotent; system-key auth; reserved-prefix bypass scoped to this endpoint only.
- [ ] `GET /api/admin/migrations` exists; reports `applied/expected/status/names/lastError`; status taxonomy matches D2.
- [ ] `scripts/seed-smoke-user-via-api.js` is idempotent (200/201 = success).
- [ ] Staging deploy seeds smoke-bot before any CS41 smoke step.
- [ ] Staging deploy asserts `/api/admin/migrations.status === 'ok'` on new revision (NEW staging-only step, NOT in shared `scripts/smoke.js`).
- [ ] Existing prod `/api/health` contract is unchanged (no migration field, no rollup change). Verified by existing tests still passing.
- [ ] Staging CS41-12 graceful-skips when OLD revision returns 404 from `/api/admin/migrations`; runs smoke when route exists.
- [ ] Staging CS41-1 + CS41-3 + CS41-7 all run end-to-end (verified via CS61-6).
- [ ] Staging skip-on-secret-missing branches removed; replaced with early preflight.
- [ ] OPERATIONS.md documents staging inline-seed pattern + migration validation + rollback coupling table.
- [ ] No regression in `npm test` or `npm run container:validate`.

## Will not be done as part of this clickstop

- Moving staging to managed MSSQL.
- Changing prod''s persistent-user pattern.
- Smoke-bot data cleanup in staging.
- Per-migration timing telemetry.
- Auto-rollback on migration mismatch.
- Adding migration check to `/api/health` rollup (explicitly REJECTED per D2).

## Rollback story (per D5)

| Task | Rollback | Coupling |
|---|---|---|
| CS61-0 | Revert PR. Adapter API removed. | Must precede revert of CS61-2. |
| CS61-1 | Revert PR. Admin endpoint + script removed. | Must couple with CS61-3 revert. |
| CS61-2 | Revert PR. Migration endpoint removed. | Must couple with CS61-3 + CS61-5 reverts. |
| CS61-3 | Revert PR. Staging deploy returns to skipping smoke. | Standalone. |
| CS61-4 | Revert PR. Staging skip-on-secret-missing returns. | Standalone. |
| CS61-5 | Revert PR. CS41-12 staging path returns to prior. | Standalone. |
| CS61-6 / CS61-7 | Pure verification + docs. | Standalone. |

## Relationship to other clickstops

- **CS41** — predecessor; established the smoke + verify chain CS61 makes runnable in staging.
- **CS41-0** — reservation that CS61-1''s narrow admin endpoint bypasses (with audit + system-key auth).
- **CS54** — App Insights wiring; CS41-3 AI verify in staging produces real `gwn-ai-staging.requests` rows once CS61 lands.
- **CS59** — staging cost-soak; inline-seed traffic counted by CS59-8.
- **Future managed-MSSQL-staging CS** (unfiled) — would supersede CS61''s inline-seed approach.

## Parallelism

- CS61-0 lands FIRST (precondition).
- CS61-1 and CS61-2 are independent after CS61-0; two sub-agents in parallel.
- CS61-3 depends on CS61-1 + CS61-2 merged.
- CS61-4 depends on CS61-3 merged + CS61-6 verified.
- CS61-5 depends on CS61-3 merged.
- CS61-6 depends on CS61-3 + CS61-5 merged + operator-set secret.
- CS61-7 depends on CS61-6.

Total: 8 PRs across max 2 sub-agents at a time.

## Pre-dispatch checklist

- [x] CS61 number verified free.
- [x] Plan v3 reflects user direction + GPT-5.4 rubber-duck (3 blockers + 6 serious + 3 minor adopted).
- [ ] User reviews v3 plan → approves before dispatch.