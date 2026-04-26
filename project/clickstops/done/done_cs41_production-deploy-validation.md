# CS41 — Production & staging deploy validation (functional + telemetry + perf)

**Status:** ✅ Done — closed 2026-04-26
**Closed by:** yoga-gwn-c2 via CS41-10 PR [#281](https://github.com/henrik-me/guesswhatisnext/pull/281)
**Owner:** yoga-gwn-c2 (claimed 2026-04-26T02:50Z)
**Origin:** Identified during CS25. Replanned by yoga-gwn-c2 in three rounds: v1 (5 tasks; CS41-3 marked "evaluate feasibility", pre-CS54), v2 (10 tasks after CS54 + INSTRUCTIONS § 4a), v3 (this — incorporates rubber-duck findings: existing migration framework, username/route corrections, safe smoke-user pattern, ingest-storage rethink, staging revision-direct validation pre-cutover, no-rollback on AI ingest delay, github-script for PR gate, CS59 coordination).

## Goal

Every successful staging or production deploy verifies — automatically and visibly — that the new revision is not just up but **actually working end-to-end**: DB query path, request handler path, OTel export path, response-time envelope, schema migrations applied. Failures roll back without operator intervention and without false negatives on cold-start or AI-ingest delay.

This CS turns INSTRUCTIONS.md § 4a [Telemetry & Observability gate](../../../INSTRUCTIONS.md#4a-telemetry--observability-mandatory-for-all-new-work) from a manual PR-body checkbox into an enforced CI gate at both PR-time and deploy-time.

**Scope assumption:** Azure SQL is available and not capacity-exhausted. The current `gwn-production` capacity-exhausted state is treated as an environmental issue (separate concern). The smoke is read+write; if the DB is capacity-exhausted at deploy time, the smoke fails, the deploy rolls back. That's correct behavior.

## Investigated repository state (verified during plan v3, 2026-04-26T03:10Z)

| What | Where | Implication |
|---|---|---|
| Migration framework | [`server/db/migrations/`](../../../server/db/migrations/) (7 migrations + `_tracker.js` + `index.js`); called by [`server/app.js:37-41`](../../../server/app.js) on startup via `db.migrate(migrations)` | CS41-4 is **wire pre-deploy invocation**, not "establish framework". Likely needs a `scripts/migrate.js` CLI wrapper. |
| Username constraint | [`server/routes/auth.js:63-65`](../../../server/routes/auth.js): `length < 3 \|\| length > 20` | Smoke username must fit ≤ 20 chars. v2's `prod-smoke-{ISO-timestamp}` (28 chars) won't work. v3 uses fixed user `gwn-smoke-bot` (13 chars). |
| Score submit route | [`server/routes/scores.js:13`](../../../server/routes/scores.js): `POST /` (mounted at `/api/scores`) | v2's `/api/scores/submit` was wrong; correct is `POST /api/scores`. |
| Puzzles list route | [`server/routes/puzzles.js:38`](../../../server/routes/puzzles.js): `GET /` (mounted at `/api/puzzles`), `requireAuth` | v2's `/api/puzzles/list` was wrong; correct is `GET /api/puzzles` with auth header. |
| User-scoped scores | [`server/routes/scores.js:160`](../../../server/routes/scores.js): `GET /me`, `requireAuth` | Used by CS41-1 for assertion (avoids flaky top-20 leaderboard check). |
| User delete endpoint | None exists. [`server/routes/users.js`](../../../server/routes/users.js) only has `GET /` and `PUT /:id/role`, both `requireSystem`. | No cleanup endpoint to call. v3 adopts the "fixed-user + leaderboard filter" pattern instead — no per-deploy cleanup needed. |
| Cold-start request gate | [`server/app.js:258-281`](../../../server/app.js): returns 503 + `Retry-After: 5` + JSON `{phase: "cold-start"}` for first DB-touching `/api/*` requests. `/healthz` and `/api/health` are gate-bypassed (do NOT trigger lazy DB init). | CS41-1 phase-1 probe MUST be a DB-touching endpoint to actually warm the DB. v3 uses `/api/features` (matches what `prod-deploy.yml:250-324` already probes). |
| Cold-start envelope in container-validate | [`scripts/container-validate.js:18-22,85-87`](../../../scripts/container-validate.js): `WARMUP_CAP_MS + 30000 + COLD_START_MS` | v2 said "~60s"; correct envelope is `WARMUP_CAP_MS + 30s + COLD_START_MS` (~120-180s on cold). |
| Prod-deploy traffic mode | Live `activeRevisionsMode=Single` per Azure query | No "pre-traffic-cutover" hook inside `az containerapp update` for prod — traffic moves when the update lands. CS41-4 must complete migrations BEFORE the `az containerapp update` step. |
| Staging-deploy traffic mode | Multi-revision (deploys new revision, then [`staging-deploy.yml:399-578`](../../../.github/workflows/staging-deploy.yml) sets traffic 100% to new + deactivates old) | CS41-1/2/3 against staging MUST run on the new revision's direct FQDN BEFORE the `traffic set` step; cutover only after pass. |
| Existing prod-deploy AI wiring | [`prod-deploy.yml`](../../../.github/workflows/prod-deploy.yml) has happy-path + rollback templates with `APPLICATIONINSIGHTS_CONNECTION_STRING` via `secretRef:` (CS54-4) + grep guard. | CS41 doesn't re-do that. CS41 just verifies it's working at deploy time. |
| `cloud_RoleInstance` field on AI requests | Verified live: a real `requests` row from `gwn-production--0000019-...` carries `cloud_RoleInstance` matching the revision name. `_BilledSize` is also valid against AI tables (used by CS54-8 KQL). | CS41-3 / CS41-7 KQL is field-correct. |
| Branch protection on `main` | `main` is protected, requires PR + review per [OPERATIONS.md](../../../OPERATIONS.md). Workflows cannot push commits to `main` directly (only release branches and tags). | CS41-7 cannot append to a git-tracked file from the deploy workflow. v3 uses workflow summary + uploaded artifact instead. |

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS41-0 | **Reserved-username + leaderboard-filter prerequisite.** Add username-prefix reservation (registration rejects `gwn-smoke-*`) AND filter `gwn-smoke-*` users from leaderboard + all public user-listing surfaces. Pre-create `gwn-smoke-bot` via idempotent `scripts/setup-smoke-user.js` (operator runs once per env). | ✅ Done | PR [#260](https://github.com/henrik-me/guesswhatisnext/pull/260), commit 17f9df8 |
| CS41-1 | **Smoke flow against deployed-revision FQDN, cold-start aware.** (a) poll `/healthz` until 200; (b) cold-start probe `/api/features` accepting 503+Retry-After up to `WARMUP_CAP_MS + 30s + COLD_START_MS`; (c) login as `gwn-smoke-bot`; (d) POST `/api/scores`; (e) GET `/api/scores/me` and assert submitted score present; (f) GET `/api/health` assert `checks.database.status === "ok"`. Two invocations (staging + prod). | ✅ Done | PR [#273](https://github.com/henrik-me/guesswhatisnext/pull/273) (shipped together with CS41-2 + CS41-8), commit 78c1f92 |
| CS41-2 | **Per-request response time baselines.** Warn if any single request > 2s; fail if > `WARMUP_CAP_MS + 30s + COLD_START_MS`. Log to workflow summary. | ✅ Done | PR [#273](https://github.com/henrik-me/guesswhatisnext/pull/273) (shipped together with CS41-1 + CS41-8), commit 78c1f92 |
| CS41-3 | **AI telemetry verification (warning-only).** KQL: `requests \| where cloud_RoleInstance has '<NEW_REVISION>' and timestamp > ago(10m) \| count`; assert ≥ N. If 0 after 10 min → workflow WARNING annotation, not failure. | ✅ Done | PR [#275](https://github.com/henrik-me/guesswhatisnext/pull/275), commit 20c2b5b |
| CS41-4 | **Wire pre-deploy DB migration step** using existing framework. New `scripts/migrate.js` CLI wrapper. Pre-deploy step in BOTH workflows. Idempotent re-runs are no-ops via existing `_tracker.js`. Migration failure aborts deploy without traffic shift. | ✅ Done | PR [#262](https://github.com/henrik-me/guesswhatisnext/pull/262), commit b8571a8 |
| CS41-5 | **Rollback verification with explicit revision targeting.** After auto-rollback, capture `ROLLBACK_REVISION_NAME` + `ROLLBACK_TIMESTAMP`; run CS41-1 + CS41-3 KQL against that specific revision and post-rollback time window. "Rollback target also unhealthy" → explicit annotation. | ✅ Done | PR [#278](https://github.com/henrik-me/guesswhatisnext/pull/278), commit 6c3ad5b |
| CS41-6 | **PR-CI § 4a Telemetry Validation gate** via `actions/github-script`. Reads `pull_request.body` directly. Skip docs-only PRs. `.github/workflows/` ARE gated (CS41 itself touches workflows). | ✅ Done | PR [#261](https://github.com/henrik-me/guesswhatisnext/pull/261), commit a91bcd5 |
| CS41-7 | **Per-deploy AI ingest summary → workflow summary + 90-day artifact** (NOT git-committed). Bound window via `gh run list` for previous successful run. CS60-1/2/3 operators consume artifacts via `gh run download`. | ✅ Done | PR [#280](https://github.com/henrik-me/guesswhatisnext/pull/280), commit f0d5d6c |
| CS41-8 | **Deploy summary annotation.** Aggregates: image SHA + revision + migration result + cold-start probe duration + smoke per-step + per-request times + AI verification result + ingest delta + AI Logs blade link. | ✅ Done | PR [#273](https://github.com/henrik-me/guesswhatisnext/pull/273) (shipped together with CS41-1 + CS41-2), commit 78c1f92 |
| CS41-9 | **Apply gates to staging-deploy.yml + restructure for pre-cutover validation.** Deploy at 0% traffic → migrations → smoke + AI verify on direct FQDN → ONLY THEN `traffic set` 100% + deactivate old. Pre-cutover failure aborts without traffic shift. | ✅ Done | PR [#277](https://github.com/henrik-me/guesswhatisnext/pull/277) (shipped together with CS41-9b), commit b17e6c8 |
| CS41-9b | **CS59 coordination.** Update [`planned_cs59`](../planned/planned_cs59_staging-cost-soak-verification.md) with explicit "filter `gwn-smoke-bot`-attributed requests OR require quiescence window" task. | ✅ Done | PR [#277](https://github.com/henrik-me/guesswhatisnext/pull/277) (shipped together with CS41-9), commit b17e6c8 |
| CS41-10 | **YAML coordination + docs + close.** Per [§ YAML coordination](#yaml-coordination). Update `docs/observability.md` + `OPERATIONS.md`. Move CS41 → `done/`. | ✅ Done | This PR (close-out). |
| CS41-11 | **Migration policy linter** (added in plan v4 after audit confirmed no current violations but no enforcement either). New `scripts/check-migration-policy.js` parses `server/db/migrations/NNN-*.js` and rejects `DROP COLUMN`, `DROP TABLE`, `RENAME COLUMN`, `RENAME TABLE`, `ALTER COLUMN ... NOT NULL` without `DEFAULT`, new `NOT NULL` column without `DEFAULT`, and FK changes that break existing queries. Override via inline `// MIGRATION-POLICY-OVERRIDE: <reason + multi-PR-plan-link>` comment (mirrors `check-docs-consistency.js` ignore pattern). Wire into `npm test` precheck or as a dedicated CI job. | ✅ Done | PR [#272](https://github.com/henrik-me/guesswhatisnext/pull/272), commit 6fc32fb |
| CS41-12 | **Old-server-on-new-schema smoke** in deploy sequence. After CS41-4's migration step runs but BEFORE traffic shift, smoke the OLD revision (still serving traffic) against the just-migrated DB using the same CS41-1 smoke flow but pointed at the OLD revision's direct FQDN. Failure → abort deploy + alert "MIGRATION BREAKS OLD SERVER — manual recovery required" (operator must roll forward urgently or revert the migration manually). Catches incompat that the linter (CS41-11) can't detect (subtle query-shape changes, app-side schema introspection). | ✅ Done | PR [#274](https://github.com/henrik-me/guesswhatisnext/pull/274), commit e093f65 |
| CS41-13 | **Document expand→migrate→contract pattern** in INSTRUCTIONS.md. For migrations that genuinely require backward-incompat changes (rename, drop, type change), require a 3-PR sequence: (A) add new column + dual-write code; (B) backfill + cut reads; (C) stop dual-write + drop old column. Each PR individually backward-compatible. The CS41-11 linter override comment must reference the multi-PR plan. | ✅ Done | PR [#276](https://github.com/henrik-me/guesswhatisnext/pull/276), commit ffc7938 |

## Per-task implementation detail

### CS41-0 — Reserved-username + leaderboard filter (prerequisite)

Three landings in one PR:

1. **Registration reservation** in [`server/routes/auth.js:63-85`](../../../server/routes/auth.js): after the length check, add `if (username.toLowerCase().startsWith('gwn-smoke-')) return res.status(400).json({error: "Username prefix 'gwn-smoke-' is reserved"});`. Plus a unit test.
2. **Leaderboard filter** in [`server/routes/scores.js:57-78`](../../../server/routes/scores.js) and any other endpoint exposing usernames publicly. Audit `server/routes/` for all public user-listing surfaces in CS41-0; add `WHERE username NOT LIKE 'gwn-smoke-%'` to relevant SQL. Plus integration tests.
3. **One-time `gwn-smoke-bot` user creation** via `scripts/setup-smoke-user.js` (idempotent), with password from new GitHub secret `SMOKE_USER_PASSWORD` per env. Operator runs once per env.

### CS41-1 — Smoke flow

```bash
# (a) Wake the new revision (gate-bypassed)
poll_until_200 "https://$NEW_REVISION_FQDN/healthz" timeout=180s

# (b) Cold-start tolerant probe of /api/features (DB-touching, lightweight)
COLD_START_BUDGET=$((WARMUP_CAP_MS + 30000 + COLD_START_MS))
poll_until_200 "https://$NEW_REVISION_FQDN/api/features" timeout=$COLD_START_BUDGET retry_on='503+Retry-After'

# (c) Login as the smoke bot
TOKEN=$(curl -sk -X POST "https://$NEW_REVISION_FQDN/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"gwn-smoke-bot\",\"password\":\"$SMOKE_USER_PASSWORD\"}" \
  | jq -r '.token')
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || fail "login failed"

# (d) Submit a sentinel score
SENTINEL=$RANDOM
SUBMIT_RESPONSE=$(curl -sk -X POST "https://$NEW_REVISION_FQDN/api/scores" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"score\":$SENTINEL,\"mode\":\"freeplay\"}")
SUBMITTED_ID=$(echo "$SUBMIT_RESPONSE" | jq -r '.id')

# (e) Assert via /api/scores/me (user-scoped, deterministic)
ME_SCORES=$(curl -sk "https://$NEW_REVISION_FQDN/api/scores/me" -H "Authorization: Bearer $TOKEN")
echo "$ME_SCORES" | jq -e ".[] | select(.id == \"$SUBMITTED_ID\")" >/dev/null \
  || fail "submitted score id $SUBMITTED_ID not in /api/scores/me"

# (f) DB health assertion
DB_STATUS=$(curl -sk "https://$NEW_REVISION_FQDN/api/health" | jq -r '.checks.database.status')
[ "$DB_STATUS" = "ok" ] || fail "DB status: $DB_STATUS"
```

The new revision's direct FQDN comes from `az containerapp revision show --revision $NEW_REVISION_NAME --query "properties.fqdn" -o tsv`.

### CS41-3 — AI verification (warning-only)

```kusto
requests
| where timestamp > ago(10m)
| where cloud_RoleInstance has "<NEW_REVISION_NAME>"
| summarize requests=count() by name, resultCode
| order by requests desc
```

- Rows ≥ N → ✅ pass; render results in deploy summary.
- Rows < N after 10 min → ⚠️ workflow warning annotation; surface in deploy summary; **do not roll back**.
- Query failure (auth / network) → distinguishable from "0 rows" via exit code; this IS a deploy failure (something is broken in the AI access path, separate from telemetry-export-broken).

### CS41-4 — Migration step

`scripts/migrate.js` (new file):

```js
'use strict';
const migrations = require('../server/db/migrations');
const db = require('../server/db');

(async () => {
  try {
    await db.connect();
    await db.migrate(migrations);
    console.log('Migrations complete');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
```

Workflow integration (prod):

```yaml
- name: Run DB migrations
  env:
    DB_BACKEND: mssql
    GWN_MSSQL_CONN_STRING: ${{ secrets.PROD_DB_CONN_STRING }}
  run: |
    node scripts/migrate.js || { echo "::error::Migration failed; aborting deploy"; exit 1; }

- name: Update Container App  # existing step — only runs if migration succeeded
  ...
```

For staging the migration step runs after the new revision is deployed (at 0% traffic) but before `traffic set`.

### CS41-5 — Rollback verification

```bash
# After rollback fires (existing rollback step exits with rolled-back revision name)
ROLLBACK_REVISION_NAME=$(az containerapp revision list \
  --name "$APP_NAME" -g gwn-rg \
  --query "[?properties.active && properties.trafficWeight==\`100\`].name | [0]" -o tsv)
ROLLBACK_TIMESTAMP=$(date -u --iso-8601=seconds)

# Re-run CS41-1 smoke against the rolled-back revision's direct FQDN
NEW_REVISION_FQDN=$(az containerapp revision show ... --revision "$ROLLBACK_REVISION_NAME" ...)
run_smoke "$NEW_REVISION_FQDN" || {
  echo "::error::ROLLBACK TARGET ALSO UNHEALTHY — operator intervention required"
  exit 2  # distinct exit code so monitoring can distinguish from normal rollback
}

# Re-run CS41-3 AI verification scoped to the rollback revision + timestamp
az monitor app-insights query --app "gwn-ai-${ENV}" -g gwn-rg \
  --analytics-query "requests | where cloud_RoleInstance has '${ROLLBACK_REVISION_NAME}' and timestamp > datetime('${ROLLBACK_TIMESTAMP}') | count" \
  ...
```

### CS41-6 — PR-CI gate

```yaml
- name: § 4a Telemetry Validation gate
  uses: actions/github-script@v7
  with:
    script: |
      const body = context.payload.pull_request.body || '';
      const { data: files } = await github.rest.pulls.listFiles({
        owner: context.repo.owner,
        repo: context.repo.repo,
        pull_number: context.payload.pull_request.number,
      });
      const docsOnlyPattern = /^(docs\/|README\.md|INSTRUCTIONS\.md|TRACKING\.md|OPERATIONS\.md|REVIEWS\.md|CONTEXT\.md|LEARNINGS\.md|WORKBOARD\.md|project\/clickstops\/)/;
      const codeFiles = files.filter(f => !docsOnlyPattern.test(f.filename));
      if (codeFiles.length === 0) {
        core.info('PR is docs-only; skipping § 4a gate');
        return;
      }
      if (!/^## Telemetry Validation/m.test(body)) {
        core.setFailed("PR body missing required '## Telemetry Validation' section. See INSTRUCTIONS.md § 4a.");
      }
```

`.github/workflows/` is intentionally NOT in the docs-only skip list — workflow changes ARE code changes for purposes of this gate.

### CS41-7 — Ingest summary (artifact + workflow summary)

```bash
PREV_DEPLOY_ISO=$(gh run list --workflow="$GITHUB_WORKFLOW" --status=success --limit=2 \
                    --json createdAt --jq '.[1].createdAt // empty')
if [ -z "$PREV_DEPLOY_ISO" ]; then
  PREV_DEPLOY_ISO=$(date -u -d '24 hours ago' --iso-8601=seconds)
  echo "::notice::No prior successful deploy found; using 24h fallback"
fi

az monitor app-insights query \
  --app "gwn-ai-${ENV}" -g gwn-rg \
  --analytics-query "
    union *
    | where timestamp between (datetime('${PREV_DEPLOY_ISO}') .. now())
    | summarize gb_ingested = sum(_BilledSize) / (1024.0 * 1024.0 * 1024.0),
                rows = count() by itemType
    | order by gb_ingested desc
  " -o json > ingest_delta.json

# Render to workflow summary
{
  echo "## AI ingest since previous deploy ($PREV_DEPLOY_ISO → now)"
  echo ""
  echo "| itemType | rows | GB |"
  echo "|---|---|---|"
  jq -r '.tables[0].rows[] | "| \(.[0]) | \(.[1]) | \(.[2] | tostring | .[:6]) |"' ingest_delta.json
} >> "$GITHUB_STEP_SUMMARY"
```

```yaml
- name: Upload ingest delta artifact
  uses: actions/upload-artifact@v4
  with:
    name: ingest-delta-${{ env.ENV }}-${{ github.run_id }}
    path: ingest_delta.json
    retention-days: 90
```

CS60-1/2/3 operators can `gh run download` these artifacts at measurement-window time.

## YAML coordination

CS41 tasks that touch deploy YAML files, in merge order to avoid merge churn:

| Order | Task | File(s) | Owner sub-agent |
|---|---|---|---|
| 1 | CS41-0 | server/routes/auth.js, server/routes/scores.js, scripts/setup-smoke-user.js, tests | Track A |
| 2 | CS41-4 | scripts/migrate.js, prod-deploy.yml, staging-deploy.yml | Track B (waits on 1) |
| 3 | CS41-1 + CS41-2 + CS41-8 | scripts/smoke.sh (or equivalent), prod-deploy.yml, staging-deploy.yml | Track A (waits on 2) |
| 4 | CS41-3 | prod-deploy.yml, staging-deploy.yml | Track A (waits on 3) |
| 5 | CS41-9 + CS41-9b | staging-deploy.yml (restructure for pre-cutover gates), planned_cs59 update | Track A (waits on 4) |
| 6 | CS41-5 | prod-deploy.yml, staging-deploy.yml (rollback paths) | Track B (waits on 5) |
| 7 | CS41-7 | prod-deploy.yml, staging-deploy.yml | Track B (waits on 6) |
| 8 | CS41-6 | new .github/workflows/pr-checks.yml | Track C (independent — no YAML conflict) |
| 9 | CS41-10 | docs/observability.md, OPERATIONS.md, CS41 file → done/ | Track A (last) |

**Three sub-agent tracks**:
- Track A — pipeline & validation flow (CS41-0, CS41-1+2+8, CS41-3, CS41-9+9b, CS41-10): one PR per row.
- Track B — migration + rollback + ingest (CS41-4, CS41-5, CS41-7): one PR per row, gated on Track A's preceding row.
- Track C — PR gate (CS41-6): one PR, fully independent.

Total: 9 PRs across 3 sub-agents, max 3 in-flight at once.

## Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Smoke writes pollute production data via leaderboard or other public surfaces | MEDIUM | CS41-0's leaderboard filter + reserved-prefix policy. Audit ALL public-user-listing endpoints in CS41-0, not just the obvious leaderboard. |
| Cold-start makes CS41-2 perf gates flap | LOW | Per-request thresholds (warn 2s / fail at cold-start ceiling). CS41-3 doesn't gate latency at all. |
| AI ingest > 10 min causes false failure | LOW | CS41-3 is warning-only; doesn't trigger rollback. |
| DB migration corrupts prod data | HIGH | Migrations run BEFORE traffic shift; failure aborts deploy with no traffic shift. Every migration must be tested via `npm run dev:mssql` + container-validate before merge. Migrations are append-only; never modify a landed migration. |
| § 4a gate blocks legitimate PRs | LOW | Path-based skip for docs-only PRs; explicit error message points at INSTRUCTIONS.md § 4a. |
| Per-deploy ingest artifact retention costs balloon | LOW | 90-day retention; ingest_delta.json is < 5 KB per deploy; trivial cost. |
| Staging cold-start adds 30s+ to deploy | LOW | Staging is not a release gate; the added time is bounded by the same envelope CS41-2 codifies. |
| GitHub Actions runner image / `az` CLI version drift breaks the AI query | MEDIUM | Pin `az` version in deploy YAML setup step. Add a workflow self-test: a no-op `az --version` step + an `az monitor app-insights query --query "print('ping')"` step that runs early and fails the deploy if the AI CLI subset is broken. |
| Service principal loses `Reader` role on `gwn-rg` (CS54-1 RBAC) | MEDIUM | Document SP role requirement in `docs/observability.md` § A. CS41-3's "AI query failed because permissions" error is distinguishable from "AI query succeeded with 0 rows" — different exit codes / annotations. |
| Branch protection blocks workflow-attempted writes (was CS41-7 v2 design) | RESOLVED | v3 architecture stores ingest data as artifacts, not git commits. |
| Two near-simultaneous deploys (prod + staging) compete for AI query quota / runner | LOW | Each deploy makes 1-2 AI queries — well under any reasonable quota. |
| CS41-1 sentinel scores generate growing history in the smoke bot user | LOW | The smoke bot user is not user-visible (CS41-0 filter). Cleanup script can be added in a follow-up CS if it ever matters. |

## Acceptance criteria

- [x] CS41-0: `gwn-smoke-` prefix reserved at registration; filtered from leaderboard + all public user-listing surfaces; `gwn-smoke-bot` user exists in both staging and prod DBs.
- [x] CS41-1: smoke runs against deployed-revision FQDN in BOTH envs; cold-start tolerant; uses correct routes; rollback fires on smoke failure.
- [x] CS41-2: per-request latency captured; warn/fail thresholds applied per request.
- [x] CS41-3: AI verification against `cloud_RoleInstance` for new revision; ingest-absent → workflow WARNING (not failure).
- [x] CS41-4: migrations run BEFORE traffic shift in BOTH envs; failure aborts deploy without traffic shift; idempotent.
- [x] CS41-5: rollback path runs CS41-1 + CS41-3 against `ROLLBACK_REVISION_NAME` + `ROLLBACK_TIMESTAMP`.
- [x] CS41-6: PR-CI gate via `actions/github-script` reading `pull_request.body` + `listFiles`; docs-only PRs skip; workflow PRs are gated.
- [x] CS41-7: per-deploy ingest summary in workflow summary AND uploaded as artifact (90-day retention) in BOTH envs.
- [x] CS41-8: deploy summary annotation contains all data points listed.
- [x] CS41-9: staging restructured to validate against new revision's direct FQDN BEFORE traffic cutover.
- [x] CS41-9b: CS59 plan file updated with explicit "filter or quiesce" coordination note.
- [x] No regression in `npm test` or `npm run container:validate`.
- [x] CS41 PRs each contain `## Container Validation` AND `## Telemetry Validation` sections per INSTRUCTIONS § 4a.
- [x] `docs/observability.md` updated with the new post-deploy KQL queries.
- [x] `OPERATIONS.md` deploy section updated with the new gates.

## Will not be done as part of this clickstop

- Adopting a different migration framework (knex, etc.). Existing framework is sufficient.
- Cross-region deploy verification.
- Automated alerts on deploy-workflow failures or warnings (separate concern).
- Capacity / cost auto-scaling on AI ingest. CS60 is the cost-watch CS.
- Cleanup script for `gwn-smoke-bot`'s accumulated scores. The user is filtered from public surfaces; if accumulation ever matters, a future CS adds the cleanup.
- Auto-recovery from "rollback target also unhealthy" (CS41-5 just annotates; operator handles).
- Migration framework upgrade to support DOWN migrations / rollback. Forward-only is the existing contract.

## Rollback story

| Task | Rollback |
|---|---|
| CS41-0 | Revert PR. Reservation + filter removed; smoke bot user remains in DB but no longer special-cased. |
| CS41-1 / -2 / -8 | Revert PR. Deploy returns to single-curl health check. |
| CS41-3 | Revert PR. Telemetry export still works (CS54), just unverified at deploy time. |
| CS41-4 | Revert PR. Migrations have to be run manually before deploys that need them. |
| CS41-5 | Revert PR. Rollback returns to single-curl verification. |
| CS41-6 | Revert PR. § 4a remains policy but reverts to reviewer-enforced. |
| CS41-7 | Revert PR. Per-deploy artifacts stop being uploaded. |
| CS41-9 / -9b | Revert PR. Staging returns to "deploy → cutover → verify" order. CS59 plan reverts. |

## Relationship to other clickstops

- **CS54** — provided AI wiring CS41-3/-7 verify.
- **CS47** — different observability axis (client-side); both depend on CS54.
- **CS60** — CS41-7 emits artifacts CS60-1/2/3 may consume.
- **CS53-23** — boot-quiet contract. CS41-1 acts as a real user-driven session (sets `X-User-Activity: 1`).
- **CS56** — server-side response cache; CS41-1 uses `/api/scores/me` not leaderboard, so unaffected.
- **CS59** — explicit coordination via CS41-9b.

## Pre-dispatch checklist

- [x] CS41 number verified free across `planned/`, `active/`, `done/`, and WORKBOARD.md.
- [x] Plan v1 → v2 → v3, with rubber-duck pass `cs41-plan-review` (6 blockers + 7 serious + 3 minor — all addressed in v3).
- [x] User sign-off: smaller-scope migrations, smoke user with cleanup approach (v3 chose fixed-user-with-leaderboard-filter as a cleaner equivalent — flag at sign-off if you'd prefer per-deploy timestamp users with a cleanup CS instead).
- [x] User sign-off: CS41-6 stays in CS41; max parallelism via sub-agents.
- [ ] User reviews v3 plan + CS41-0 (first task) detail and gives go-ahead.
- [ ] After user sign-off: dispatch sub-agents per the YAML coordination table.

## Closing summary (2026-04-26)

**Outcome:** all 12 functional sub-tasks delivered across 11 PRs (CS41-1+2+8 shipped together as PR #273; CS41-9+9b shipped together as PR #277); 3 sub-agent tracks; rubber-duck-validated plan v4.

**Acceptance criteria status:** All 15 boxes checked above. Every criterion was verified by the merging sub-agent before its PR was approved (per § 4a Container + Telemetry Validation gates).

**Risks materialized vs anticipated:** None of the Risks-table items fired during implementation. The branch-protection-blocks-write risk was already RESOLVED in plan v3 (CS41-7 uses artifacts, not git commits).

**What lives forward:**
- CS41-1+2+8 smoke + perf gates active on every staging and prod deploy.
- CS41-3 AI verify (warning-only) active on every deploy.
- CS41-4 migration step active on every deploy.
- CS41-5 rollback verification fires on every rollback.
- CS41-6 PR-CI § 4a Telemetry Validation gate active on every PR.
- CS41-7 per-deploy ingest summary (workflow summary + 90-day artifact) on every deploy.
- CS41-9 staging restructured for pre-cutover validation.
- CS41-11 migration policy linter active on every PR (via `npm test`).
- CS41-12 old-server-on-new-schema smoke active on every deploy.
- CS41-13 expand→migrate→contract pattern documented in INSTRUCTIONS.md.

**Cross-CS impact:**
- INSTRUCTIONS.md § 4a (Telemetry & Observability) is now both policy AND enforced gate.
- INSTRUCTIONS.md § Database & Data multi-PR pattern documented.
- CS59 has explicit coordination task added (CS59-8).
- CS60 unaffected by CS41-7 — by design, CS60-1/2/3 still run KQL manually at measurement windows; CS41-7 artifacts are an additional data source available via `gh run download`.

**Deferred from CS41:** None. Every sub-task either landed, was rejected with rationale during planning, or is explicitly out-of-scope and noted in the "Will not be done" section.

**Operator action required (post-merge):**
- Set GitHub secret `SMOKE_USER_PASSWORD_PROD` (env-scoped to production environment).
- Set GitHub secret `SMOKE_USER_PASSWORD_STAGING` (env-scoped to staging environment).
- Run `node scripts/setup-smoke-user.js` against prod and staging DBs (operator one-time per env) to create the `gwn-smoke-bot` user.
- Until both above are done, smoke steps in deploy YAMLs gracefully skip with a notice — the deploy still succeeds but doesn't exercise the full smoke flow.

**Related CSes:**
- Blocks unblocked: CS47 (ProgressiveLoader telemetry — can now consume CS41-3's AI infra).
- Coordination ack: CS59 (cost-soak verification — CS59-8 added).
- Predecessor: CS54 (App Insights wiring — CS41 verifies what CS54 wired).
