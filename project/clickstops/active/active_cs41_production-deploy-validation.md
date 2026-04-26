# CS41 — Production & staging deploy validation (functional + telemetry + perf)

**Status:** 🔄 In Progress — rubber-duck review of plan
**Owner:** yoga-gwn-c2 (claimed 2026-04-26T02:50Z)
**Origin:** Identified during CS25 production deploy. Replanned 2026-04-26T01:30Z by yoga-gwn-c2 after CS54 (App Insights wiring) made telemetry verification concretely doable, and after the new INSTRUCTIONS.md § 4a Telemetry Validation gate established the policy this CS automates in CI. Earlier plan rev (5 tasks; CS41-3 marked "evaluate feasibility") superseded by this one.

## Goal

Every successful staging or production deploy verifies — automatically and visibly — that the new revision is not just up but **actually working end-to-end**: DB query path, request handler path, OTel export path, response-time envelope. Failures roll back without operator intervention and without false negatives on cold-start or first-deploy.

This CS turns the new INSTRUCTIONS.md § 4a [Telemetry & Observability gate](../../../INSTRUCTIONS.md#4a-telemetry--observability-mandatory-for-all-new-work) from a manual PR-body checkbox into an enforced CI gate at both PR-time and deploy-time, so the policy is defended by tooling rather than reviewer attention.

**Scope assumption:** Azure SQL is available and not capacity-exhausted for the duration of CS41 work. The current capacity-exhausted state on `gwn-production` is treated as an environmental issue (separate CS) — CS41 designs for the steady-state. The smoke test is read+write; if the DB is in capacity-exhausted state at deploy time, the smoke fails, the deploy rolls back, and the operator deals with capacity. That's the correct behavior.

## Current state

The production deploy pipeline ([`prod-deploy.yml`](../../../.github/workflows/prod-deploy.yml)) validates:
- ✅ Image exists in GHCR.
- ✅ Container App deploys and starts.
- ✅ `/api/health` returns HTTP 200 (8 attempts, 30s apart).
- ✅ Auto-rollback on health check failure.
- ✅ Wires `APPLICATIONINSIGHTS_CONNECTION_STRING` via `secretRef:` (CS54-4) — telemetry export path is live but unverified by the deploy itself.

Staging deploy pipeline ([`staging-deploy.yml`](../../../.github/workflows/staging-deploy.yml)) has an Ephemeral Smoke Test job that runs **before** deploy (in CI on a fresh container), which is good for catching ship-stoppers, but doesn't validate the **deployed** revision in the actual staging environment.

## Gaps targeted

| Gap | Risk |
|---|---|
| Health check doesn't verify `checks.database.status=ok` | Deploy succeeds with broken DB (e.g. wrong conn string after secret rotation) |
| No functional smoke against the deployed revision | Auth / scores / puzzles regression goes live undetected |
| No response-time measurement | Perf regression undetected until users hit it |
| No telemetry verification | Silent Azure Monitor breakage (e.g. exporter init failure post-deploy) — the same failure mode CS54 introduced the wiring for |
| No DB-migration step in deploy pipeline | Schema-change PRs require a manual migration step; easy to forget |
| Rollback doesn't verify rolled-back version is healthy | Double-failure possible: bad deploy rolls back to a sibling-bad revision |
| § 4a Telemetry Validation policy is reviewer-enforced only | Drift inevitable — any PR can ship without the section if the reviewer misses it |
| No per-deploy AI ingest summary | CS60-1/2/3 windowed measurements have to reconstruct from scratch instead of incrementing |

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS41-1 | **Read+write functional smoke test, deployed-revision-targeted, cold-start aware.** Add a job that runs against the LIVE deployed revision (staging AND prod) and exercises the full stack: register `prod-smoke-{ISO-timestamp}` user → submit a freeplay score → fetch `/api/scores/leaderboard` and assert the new score is in the response → DELETE the test user (clean up). Honor 503/Retry-After per [`server/app.js:258-281`](../../../server/app.js) (poll up to `WARMUP_CAP_MS + COLD_START_MS` mirroring `scripts/container-validate.js`). Same job, two invocations (one per env). | ⬜ Pending | Read+write per user direction (assumes Azure SQL not capacity-exhausted). Cold-start tolerance avoids false-negatives on first request after auto-pause. |
| CS41-2 | **Response time baselines.** During CS41-1's smoke, measure p50/p95 for `/api/health`, `/api/puzzles/list`, `/api/scores/leaderboard`. Warn if p95 > 2s (cold path expected), fail if any single request > 30s (something is broken). Log times to workflow output for later trending. | ⬜ Pending | The 30s ceiling matches the existing cold-start envelope (`COLD_START_MS=30000` in `container-validate.js`). |
| CS41-3 | **AI telemetry verification (post-deploy).** After deploy + CS41-1 smoke, run `az monitor app-insights query --app gwn-ai-{staging,production} -g gwn-rg --analytics-query "requests \| where cloud_RoleInstance has '<new-revision-name>' and timestamp > ago(5m) \| count"` and assert ≥ N rows (where N = number of CS41-1 probe requests). If 0 → telemetry export is broken on the new revision → fail + rollback. Reuses the same KQL shape from [`docs/observability.md` § B.1](../../../docs/observability.md). | ⬜ Pending | No conn string needed in workflow — AI resource name + RG via service principal is enough. CS54 already provisioned the SP access. |
| CS41-4 | **DB migration step.** Add a deploy-pipeline step that runs DB schema migrations BEFORE traffic is shifted to the new revision. Detect "no migrations needed" cleanly (idempotent re-runs must be no-ops). Migration step failure = rollback before any traffic hits the new revision. Include in both staging and production pipelines. | ⬜ Pending | Per user direction: "we may have db updates, etc. as well that needs to be included in the deployment." Investigation needed — the repo doesn't appear to have a migration framework today; CS41-4 may need to scope from "wire migrations into deploy" to "establish the migration framework AND wire it." Decide based on what `server/db/` already contains. |
| CS41-5 | **Improve rollback verification.** After auto-rollback, run the SAME health-check loop + CS41-1 smoke + CS41-3 AI verification against the rolled-back revision. If rollback target is also broken → page operator (workflow failure with explicit "ROLLBACK TARGET ALSO UNHEALTHY" annotation) instead of silently leaving the system in an unknown state. | ⬜ Pending | Mirrors current happy-path validation against the rollback path. |
| CS41-6 | **PR-CI Telemetry Validation gate (enforces § 4a).** Add a CI check that greps PR body for `## Telemetry Validation` section on PRs touching server/client runtime code. Same shape as the existing `## Container Validation` grep guard. Fail PR if section missing AND PR is not docs-only. Skip for docs-only / CI-config-only PRs. | ⬜ Pending | Mirrors enforcement pattern from CS54-4's `APPLICATIONINSIGHTS` grep guard in prod-deploy.yml. |
| CS41-7 | **Per-deploy AI ingest summary → CS60 data appendix.** At end of successful deploy, query AI for `union * \| where timestamp between (LAST_DEPLOY_TIMESTAMP .. now()) \| summarize gb=sum(_BilledSize)/1024^3 by itemType` and append a "Per-deploy ingest summary" section to [`cs60-data-appendix.md`](cs60-data-appendix.md) per the format documented there. Surface the same numbers in the GitHub Actions deploy summary annotation. | ⬜ Pending | Implements user direction: "good to include an ingest summary since last deploy if it's a simple operation." Uses `git log` on the previous deploy commit + the deploy step's own timestamp to bound the window. Single AI query per env per deploy — minimal cost. |
| CS41-8 | **Deployment summary annotation.** GitHub Actions summary at end of successful deploy: image SHA, revision name, all health-check timings, CS41-2 response times, CS41-1 smoke pass/fail per probe, CS41-3 AI verification result, CS41-7 ingest delta, link to the AI resource Logs blade for the new revision. | ⬜ Pending | Same data already collected by CS41-1..-3, -7 — this just renders it. |
| CS41-9 | **Apply same gates to staging-deploy.yml.** Mirror CS41-1 / -2 / -3 / -5 / -7 / -8 from prod-deploy into staging-deploy as a post-deploy job (in addition to the existing pre-deploy Ephemeral Smoke Test). Per user direction: "we should have the same validation for telemetry across staging and production." | ⬜ Pending | Some adaptation needed — staging is scale-to-zero (CS58), so a wake step is implicit. Cold-start tolerance from CS41-1 already handles this. |
| CS41-10 | **Documentation + close.** Update [`docs/observability.md`](../../../docs/observability.md) with the new "post-deploy verification" KQL queries that CS41-3 / -7 emit. Update [`OPERATIONS.md`](../../../OPERATIONS.md) deploy section to describe the new gates. Move CS41 file `active/` → `done/`. | ⬜ Pending | Standard close-out. |

## Per-task implementation detail

### CS41-1 — Read+write functional smoke test (deployed-revision-targeted)

The smoke test runs against the **live deployed revision** (i.e. the FQDN of the new revision specifically, NOT the apex traffic-weighted FQDN), so a smoke failure cannot accidentally validate an old revision that's still receiving traffic during the deploy cutover. Sequence:

```bash
# 1. Discover the new revision's direct FQDN (Azure assigns one when --revision-suffix is set)
NEW_REVISION_FQDN=$(az containerapp revision show \
  --name "$APP_NAME" --resource-group gwn-rg \
  --revision "$NEW_REVISION_NAME" \
  --query "properties.fqdn" -o tsv)

# 2. Cold-start tolerant probe of /healthz (gate-bypassed)
poll_until_200 "https://$NEW_REVISION_FQDN/healthz" timeout=180s

# 3. /api/health expecting checks.database.status == "ok" (NEW assertion)
db_status=$(curl -sk "https://$NEW_REVISION_FQDN/api/health" | jq -r '.checks.database.status')
[ "$db_status" = "ok" ] || fail "DB status: $db_status"

# 4. Functional smoke
USERNAME="prod-smoke-$(date -u +%Y%m%dT%H%M%SZ)"
TOKEN=$(register_user "$USERNAME") # POST /api/auth/register
SCORE_ID=$(submit_score "$TOKEN" 12345 freeplay) # POST /api/scores/submit
LB=$(curl -sk "https://$NEW_REVISION_FQDN/api/scores/leaderboard?mode=freeplay&period=alltime" | jq)
echo "$LB" | grep -q "$USERNAME" || fail "submitted score not in leaderboard"

# 5. Cleanup (best-effort; failure here annotated, not fatal)
delete_user "$TOKEN" || annotate_warning "test user $USERNAME not cleaned up"
```

Cold-start tolerance: poll-loop pattern from [`scripts/container-validate.js`](../../../scripts/container-validate.js) — accept 503/Retry-After up to `WARMUP_CAP_MS + COLD_START_MS` (~60s) before treating as failure.

**Test data hygiene:** `prod-smoke-*` username pattern is reserved (CS41-1 enforces this in the registration step — if a real user has that prefix already, refuse to register and fail the smoke; that's a separate operator concern). Cleanup endpoint either reuses an existing `DELETE /api/users/me` (if it exists) or is added in this task.

### CS41-3 — AI telemetry verification

```kusto
requests
| where timestamp > ago(5m)
| where cloud_RoleInstance has "<new-revision-name>"
| summarize requests=count() by name, resultCode
| order by requests desc
```

Assertion: `sum(requests) >= N` where N is the number of CS41-1 probe requests (typically 6: healthz + health + register + submit + leaderboard + delete). If < N → telemetry export broken or AI ingest delayed beyond 5 min.

The query runs via Azure CLI with the deploy workflow's existing service principal — already has `Reader` on `gwn-rg` from CS54-1. No new RBAC.

### CS41-4 — DB migration step

Investigation needed before locking the implementation:

- Does the repo have a migration framework today? Check `server/db/`, `server/db/mssql-adapter.js`, `package.json`, look for migrations directory.
- If yes: wire it into both deploy pipelines as a pre-traffic-cutover step.
- If no: smaller scope option — add a no-op migration runner that `console.log`s "no migrations defined" and exits 0, with a documented place to add real migrations (`server/db/migrations/`). Larger scope option — adopt a framework (knex migrations, node-pg-migrate equivalent for mssql, or hand-rolled SQL files with a `__migrations` table).

Recommend the smaller scope first (no-op runner + documented location) so CS41 doesn't balloon into a migration-framework adoption CS. The framework-adoption work would split off as its own CS if/when it becomes needed.

### CS41-5 — Rollback verification

The current rollback path in [`prod-deploy.yml`](../../../.github/workflows/prod-deploy.yml) (introduced/extended in CS54-4 for AI wiring) does a single `curl /api/health`. CS41-5 replaces that with the same health-check loop + CS41-1 smoke + CS41-3 AI verification used on the happy path. Failure escalates to an explicit annotation: the operator needs to know "rollback target is also unhealthy" within seconds, not by silently sitting at 99% deployed.

### CS41-6 — PR-CI Telemetry Validation gate

Implementation pattern (copy from CS54-4 grep guard):

```yaml
- name: Telemetry Validation gate
  if: github.event_name == 'pull_request'
  run: |
    # Skip docs-only / CI-config-only PRs
    if git diff --name-only origin/${{ github.base_ref }}..HEAD | grep -qvE '^(docs/|\.github/|README\.md|INSTRUCTIONS\.md|TRACKING\.md|OPERATIONS\.md|REVIEWS\.md|CONTEXT\.md|LEARNINGS\.md|WORKBOARD\.md|project/clickstops/)'; then
      echo "PR touches code — checking for ## Telemetry Validation section"
      gh pr view ${{ github.event.pull_request.number }} --json body -q .body | grep -q '^## Telemetry Validation' || {
        echo "::error::PR body missing required '## Telemetry Validation' section. See INSTRUCTIONS.md § 4a."
        exit 1
      }
    fi
```

(Refine the docs-only regex against the actual repo layout — the existing `check-docs-consistency.js` already encodes a similar exclusion list and may be the right place to centralize this.)

### CS41-7 — Per-deploy AI ingest summary

```bash
PREV_DEPLOY_TIME=$(git log -1 --format=%cI "tags/gwn-${ENV}--*" --skip=1) # second-most-recent deploy tag

az monitor app-insights query \
  --app "gwn-ai-${ENV}" -g gwn-rg \
  --analytics-query "
    union *
    | where timestamp between (datetime('${PREV_DEPLOY_TIME}') .. now())
    | summarize gb_ingested = sum(_BilledSize) / (1024.0 * 1024.0 * 1024.0),
                rows = count() by itemType
    | order by gb_ingested desc
  " -o json > ingest_delta.json
```

Then a small Node script appends the formatted section to `cs60-data-appendix.md` (located via `git ls-files 'project/clickstops/*/cs60-data-appendix.md'`), and emits the same data into `$GITHUB_STEP_SUMMARY` for the deploy summary annotation.

## Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Smoke test pollutes prod data | MEDIUM | `prod-smoke-{timestamp}` namespace + DELETE in step 5 of CS41-1; reserved-prefix enforcement prevents real users from colliding. |
| Cold-start makes CS41-2 perf gates flap | MEDIUM | Two-tier thresholds (warn 2s / fail 30s) match the cold-start envelope. CS41-3 doesn't gate on latency, only on row-count. |
| AI ingest > 5 min in CS41-3 query causes false negative | MEDIUM | Retry up to 10 min before failing; record observed AI ingest latency in the deploy summary so we can shrink the bound when it proves stable. |
| DB migration step (CS41-4) corrupts prod data | HIGH | Migrations run BEFORE traffic shift; rollback aborts the deploy entirely if migration fails. Test path: every migration must run cleanly in `npm run dev:mssql` + container-validate cycle before merge. |
| § 4a Telemetry Validation gate (CS41-6) blocks legitimate PRs | LOW | Docs-only / CI-config-only escape hatch via path-based skip; explicit error message points at INSTRUCTIONS.md § 4a so authors know what's missing. |
| AI ingest summary (CS41-7) appends to a file that's also being edited by CS60 measurements | LOW | `cs60-data-appendix.md` is append-only with a Manifest table; concurrent edits unlikely (CS60 windows are weeks apart, deploys are minutes apart). If conflict happens, normal git rebase resolves. |
| `gwn-staging` cold-start adds 30s+ to staging deploy | LOW | Acceptable — staging is not a release gate per [INSTRUCTIONS.md § Quick Reference](../../../INSTRUCTIONS.md#quick-reference-checklist). The added time is bounded by the same cold-start envelope CS41-2 codifies. |

## Acceptance criteria

- [ ] `prod-deploy.yml` runs CS41-1 smoke (read+write, deployed-revision-targeted, cold-start tolerant) on every deploy; rollback triggers on smoke failure.
- [ ] `staging-deploy.yml` runs the same CS41-1/-2/-3/-5/-7/-8 gates as a post-deploy job (in addition to the existing pre-deploy Ephemeral Smoke Test).
- [ ] CS41-3 AI telemetry verification asserts ≥ N rows in `requests` for the new revision within 10 min of deploy completion, in BOTH staging and prod.
- [ ] CS41-4 DB migration step runs before traffic shift; idempotent re-runs are no-ops; migration failure rolls back without traffic shift.
- [ ] CS41-5 rollback path runs the same gates as the happy path; "rollback target also unhealthy" surfaces as a workflow error annotation.
- [ ] CS41-6 PR-CI gate fails any code-touching PR whose body lacks `## Telemetry Validation` section; docs-only PRs skip cleanly.
- [ ] CS41-7 appends a per-deploy section to `cs60-data-appendix.md` on every successful deploy in BOTH envs; CS60-1/2/3 windowed measurements consume from this same file.
- [ ] CS41-8 deploy summary contains image SHA + revision + smoke pass/fail + perf timings + AI verification result + ingest delta + AI Logs blade link.
- [ ] No regression in `npm test` or `npm run container:validate`.
- [ ] Per [INSTRUCTIONS.md § 4a](../../../INSTRUCTIONS.md#4a-telemetry--observability-mandatory-for-all-new-work), this CS itself includes a `## Telemetry Validation` section in each PR (CS41 IS the telemetry-on-deploy work, so the validation is "the new deploy gate fired and recorded the expected signal").

## Will not be done as part of this clickstop

- Adopting a full migration framework (knex, node-pg-migrate equivalent for mssql). CS41-4 starts with the no-op runner pattern; framework adoption is a follow-up CS if/when needed.
- Cross-region deploy verification — single-region matches the rest of the deploy posture.
- Automated AI alerts on smoke failure (the workflow already fails the run; alerting on workflow failures is GitHub Actions config, separate concern).
- Capacity / cost auto-scaling on AI ingest. CS60 is the cost-watch CS; CS41 just feeds it data.

## Rollback story

| Task | Rollback |
|---|---|
| CS41-1 / -2 | Revert PR. Deploy returns to single-curl health check. |
| CS41-3 | Revert PR. Telemetry export still works (CS54), just unverified at deploy time. |
| CS41-4 | Revert PR. Migrations have to be run manually before deploys that need them — back to current state. **Note:** any migrations already applied to prod cannot be auto-reverted; the no-op runner pattern means this is only a concern once real migrations exist. |
| CS41-5 | Revert PR. Rollback returns to single-curl verification. |
| CS41-6 | Revert PR. § 4a remains policy but reverts to reviewer-enforced. |
| CS41-7 / -8 | Revert PR. CS60 data appendix stops getting per-deploy entries; CS60-1/2/3 fall back to from-scratch KQL. |
| CS41-9 | Revert PR. Staging keeps only its pre-deploy Ephemeral Smoke Test. |

## Relationship to other clickstops

- **CS54** — provided the App Insights wiring CS41-3 / -7 verify. CS41 is one of the two CSes that consume CS54's wiring (the other is CS47).
- **CS47** — ProgressiveLoader UX telemetry + alerting. Different observability axis (client-side), but both depend on CS54.
- **CS60** — CS41-7 writes to CS60's data appendix; CS60-1/2/3 read from it. Tight integration but distinct lifecycles (CS41 ships once and runs continuously; CS60 measures at three discrete windows).
- **CS53-23** — boot-quiet contract; CS41-1's smoke test runs as a real user-gesture-driven request (sets `X-User-Activity: 1`) so it does NOT trip the boot-quiet DB-skip rule.
- **CS56** — server-side response cache; if CS56 lands first, CS41-1's leaderboard read may hit cache instead of DB (not a CS41 problem; just a note for CS56's testing matrix).
- **CS59** — `gwn-staging` cost soak; CS41 deploys add to staging traffic in a measurable way, so CS59's analysis must account for "smoke-test-induced traffic" as a known signal.

## Parallelism

- CS41-1, CS41-2, CS41-3 are sequential (each builds on the prior step's output). One sub-agent.
- CS41-4 is independent (DB migration step). Can ship in parallel with CS41-1..-3 in a separate PR.
- CS41-5 depends on CS41-1 + CS41-3 (mirrors them on rollback path). Sequential after.
- CS41-6 is independent (PR-CI gate, no overlap with deploy YAML changes). Parallel.
- CS41-7 / -8 depend on CS41-3 (need AI verification to exist first). Sequential after.
- CS41-9 depends on CS41-1..-8 being merged (mirrors them onto staging). Last but-one.
- CS41-10 (close) is last.

Realistic worktree usage: 2 sub-agents in parallel — one for CS41-1..-3+-5+-7+-8 (deploy-pipeline track), one for CS41-4 (migration step) and CS41-6 (PR-CI gate). CS41-9 and CS41-10 single-tracked at the end.

## Pre-dispatch checklist

- [x] CS41 number verified free across `planned/`, `active/`, `done/`, and WORKBOARD.md.
- [x] Plan iterates the original 5-task plan in light of CS54 (telemetry) + § 4a (policy enforcement) + user direction (DB available, parity with staging, ingest summary, migration step, cold-start warmup).
- [ ] Plan reviewed by rubber-duck pass before dispatch (per project convention for non-trivial plans).
- [ ] After user sign-off: claim CS41 in WORKBOARD, `git mv` to `active_`, prompt user to `/rename`.
