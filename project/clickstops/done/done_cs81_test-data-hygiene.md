# CS81 — Test data hygiene

**Status:** ✅ Done
**Closed:** yoga-gwn 2026-05-10T14:18Z — empirically validated by prod-deploy run 25630828772 (image `ffccb0f` → revision `gwn-production--0000025`). Smoke chain passed end-to-end: CS73 wake (1s — DB was warm) → CS41-12 OLD smoke ✅ → CS41-1 NEW smoke ✅ (features ok, score POST ok, scores/me ok, cleanup ok). All four CSes (CS73, CS79, CS80, CS81) closed by this single deploy.
**Claimed:** yoga-gwn 2026-05-10T06:05Z (branch `cs81-test-data-hygiene`)
**Depends on:** none
**Parallel-safe with:** CS55, CS56, CS57, CS59, CS63, CS69, CS70, CS71, CS72, CS75
**Blocks:** [CS80](done_cs80_scores-avg-int-overflow.md) closure (no prod deploy can succeed at CS41-12 until smoke-bot's accumulated score rows are removed from prod). [CS73](../done/done_cs73_prod-deploy-cold-db-handling.md) and [CS79](done_cs79_api-features-cold-init-gate.md) empirical closure also pending the same prod deploy.

## Origin

User direction 2026-05-09T22:59 PT after CS80 prod deploy halted at CS41-12: *"it's acceptable to delete the test users data, no other data can be deleted. test data should in general be removed part of the smoke validation and e2e validation."*

This addresses both:
- **Immediate unblock** of CS80 deploy ceremony (CS81-1 below).
- **Durable hygiene** so accumulated test-bot data never re-blocks a deploy (CS81-2, CS81-3).

Without this fix, every smoke run accumulates one more row in `gwn-smoke-bot`'s scores, eventually re-overflowing `AVG(score)` even with the CS80 BIGINT cast (the cast moves the threshold from ~3 rows to ~30 billion rows × 99M each, but the bot grows by 1 row per CI run — at one run/day that's 30B days, so practically never. Still, hygiene is the right principle).

## Goal

1. Unblock the CS80 prod deploy by removing `gwn-smoke-bot`'s accumulated score rows from prod.
2. Make smoke and e2e self-cleaning so test data never accumulates in any environment again.

## Constraints

- **Only `gwn-smoke-bot`'s data may be touched.** Per user direction: "no other data can be deleted." Every cleanup query must filter on `user_id = (SELECT id FROM users WHERE username = 'gwn-smoke-bot')` (parameterized; never a wildcard).
- **Operator approval required** on prod environment for the one-off cleanup workflow. The standard `production` GitHub Environment gate covers this — same approval-click pattern as prod-deploy.yml.
- **Idempotent** — running cleanup twice in a row must be safe (second run deletes 0 rows).

## Approach

### CS81-1: One-off cleanup workflow + script (immediate unblock)

Add `scripts/cleanup-test-data.js` (~40 lines, mirrors `scripts/wake-db.js` shape):
- Requires `mssql` directly (not the adapter — same boundary as wake-db).
- Reads `DATABASE_URL` from env.
- Asserts the resolved `gwn-smoke-bot` user_id is non-null (refuses to run otherwise).
- Counts rows before, runs `DELETE FROM scores WHERE user_id = ?`, counts rows after, asserts after == 0.
- Logs the row count delta to GitHub Actions output (no PII; just integers).
- Exits 0 on success, non-zero on any error.
- Optional `DRY_RUN=1` env var to count + log without deleting.

Add `.github/workflows/ops-cleanup-test-data.yml`:
- `on: workflow_dispatch` with inputs `target` (production|staging) and `confirm` (must equal `target`).
- `environment: ${{ inputs.target }}` — inherits the environment's required-reviewers gate (operator approval click required for prod).
- Step 1: confirm input matches target (defense against fat-fingering).
- Step 2: install dev-omitted deps (`npm ci --omit=dev`).
- Step 3: run `node scripts/cleanup-test-data.js` with `DATABASE_URL: ${{ secrets.DATABASE_URL }}` (or `STAGING_DATABASE_URL` for staging — but staging is SQLite-backed so this is largely a no-op; keep the param symmetric for future-proofing).
- Step 4: post-run verification — re-count and assert 0.

After merge, trigger this workflow against production (operator approves), then re-trigger `prod-deploy.yml` against `image-tag=ffccb0f` (operator approves again). Two clicks, both auditable, environment-gated.

### CS81-2: Self-cleaning smoke probe (test cleanup task — no new app surface)

Add a final cleanup step to `scripts/smoke.js` that runs **after the smoke chain finishes successfully** (or on early-exit) and removes ONLY the rows the smoke probe just inserted. Implementation:

- Smoke captures the `id` returned from step (d) POST `/api/scores`.
- After step (e) succeeds, run a cleanup that opens its own `mssql` connection via `process.env.DATABASE_URL` (same env var the CI step already provides), `DELETE FROM scores WHERE id = ?` parameterized to the captured id.
- Mirror the `scripts/wake-db.js` pattern — direct mssql, NOT through the runtime adapter, fail-soft (cleanup failure logs a warning but doesn't fail the smoke step itself).
- For local invocation without `DATABASE_URL`, skip cleanup with a one-line note (smoke against local SQLite via dev workflow is rare and the data dies with the container anyway).

This is "leave-no-trace" for the specific rows this smoke run created — no new app endpoint, no auth surface widened, no permanent backdoor.

### CS81-3: Self-cleaning container-validate / Playwright e2e (test cleanup tasks)

`scripts/container-validate.js`:
- After each cycle that runs smoke, the smoke's CS81-2 self-cleanup handles its own row. The container itself is torn down at end of validate, so no additional cleanup needed.
- Document in the script header that smoke owns its own data lifecycle.

Playwright e2e (`tests/e2e/*.spec.mjs`):
- Tests that insert score rows must use the same own-id-cleanup pattern in `afterEach` / `afterAll`.
- For tests that use the dev MSSQL stack (`test:e2e:mssql`), connect via `mssql` directly (test files already have access to the docker stack's credentials per `scripts/test-e2e-mssql.js`).
- For tests that run against in-memory mode, the data dies with the process — no cleanup needed.

Documentation: add a short subsection to OPERATIONS.md (or CONVENTIONS.md § testing) stating the **test data hygiene principle**: every smoke / e2e / load test must own its data lifecycle and clean up before exiting. Reference CS81 + the user direction.

## Tasks

| # | Task | Notes |
|---|------|-------|
| CS81-1 | ✅ Done — One-off cleanup workflow + script. PR (link added below). After merge: orchestrator triggers workflow against production, surfaces approval link, dispatches watcher. | Immediate unblock for CS80 deploy. |
| CS81-2 | ✅ Done — Smoke self-cleanup using direct DB access (`DATABASE_URL`) — NO new app endpoint. Mirrors `scripts/wake-db.js` pattern: own mssql connection, parameterized DELETE WHERE id = (captured id), fail-soft. | Test cleanup task — lives in test infrastructure, not app surface. |
| CS81-3 | ✅ Done — Audited Playwright e2e tests + container-validate for test-data hygiene. e2e specs run against in-memory dev or ephemeral docker MSSQL stack (torn down with `down -v`); leaderboard.spec.mjs carries a header comment documenting this. OPERATIONS.md "Test data hygiene" subsection added. | Test cleanup tasks + docs. |
| CS81-4 | ⬜ Planned — After CS81-1 cleanup workflow runs successfully against prod: trigger `prod-deploy.yml -f image-tag=ffccb0f -f confirm=production`. This is the deploy that closes CS73, CS79, CS80, AND validates CS81-1 end-to-end. | Orchestrator deploy ceremony. |

## Acceptance

CS81 closure-blocking criteria:
1. `scripts/cleanup-test-data.js` exists and is idempotent + scoped to `gwn-smoke-bot` user only.
2. `.github/workflows/ops-cleanup-test-data.yml` exists and runs cleanly against prod with environment-gated operator approval.
3. After CS81-1 runs against prod: `SELECT COUNT(*) FROM scores WHERE user_id = (SELECT id FROM users WHERE username='gwn-smoke-bot')` returns 0.
4. CS81-2 ships: smoke.js cleans up its own newly-inserted score row via direct DB access (no new app endpoint).
5. CS81-3 ships: e2e tests + container-validate clean up test data via direct DB access; OPERATIONS.md documents the hygiene principle.
6. After all of the above, a fresh prod deploy of an arbitrary main image succeeds without CS41-12 regression. Smoke-bot's row count never exceeds N+1 (where N is the bot's seeded baseline = 0).

## Will not be done as part of this clickstop

- **Adding any new app endpoint for test cleanup purposes.** Test cleanup is test-infrastructure work — owned by `scripts/smoke.js`, `scripts/container-validate.js`, and Playwright e2e specs. They have CI-side access to `DATABASE_URL` already; no need to widen app surface for test concerns.
- Adding a generic admin "delete scores" endpoint for any user. Out of scope.
- Migrating existing prod data beyond the smoke-bot. Per user constraint: "no other data can be deleted."
- Modifying CS80's BIGINT cast. CS81 is additive.

## Risks & rollback

- **Risk: deletion query targets wrong rows.** Mitigation: every cleanup query is parameterized to a specific id (CS81-2/3) or scoped to the smoke-bot user via subquery (CS81-1) — never a wildcard, never a free-form delete. Scripts assert non-null binding before deleting.
- **Risk: cleanup workflow is mistakenly run against the wrong target.** Mitigation: required `confirm` input must equal `target`; environment gate adds human approval; `DRY_RUN=1` mode supported.
- **Risk: smoke cleanup failure silently leaves a row behind.** Mitigation: cleanup is fail-soft (logs warning, doesn't fail the smoke step) so a transient cleanup failure doesn't block deploys; the BIGINT cast handles accumulation safely; periodic ops cleanup workflow can run on demand.
- **Rollback for CS81-1:** the deleted rows are smoke-bot test data; no need to restore. If somehow a real user's row was deleted (cannot happen with the scope guard), the row would need to be reconstructed from logs — not feasible.
- **Rollback for CS81-2/3:** revert the PR. Smoke / e2e returns to current (accumulating) behavior.

## Cross-references

- Origin: user direction 2026-05-09T22:59 PT after CS80 deploy halted at CS41-12.
- [active_cs80](done_cs80_scores-avg-int-overflow.md) — CS80-3 is now CS81-1 (the one-off cleanup); CS80-3 in the CS80 plan can be marked "superseded by CS81-1".
- [done_cs73](../done/done_cs73_prod-deploy-cold-db-handling.md), [active_cs79](done_cs79_api-features-cold-init-gate.md) — both pending empirical prod validation as side effect of CS81-4 deploy.
- Smoke runner: [`scripts/smoke.js`](../../../scripts/smoke.js).
- Existing seed script (auth + user creation pattern): [`server/routes/admin-seed-smoke-user.js`](../../../server/routes/admin-seed-smoke-user.js).
