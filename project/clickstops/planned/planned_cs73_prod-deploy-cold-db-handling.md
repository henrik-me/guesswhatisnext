# CS73 — Prod-Deploy Cold DB Handling

**Status:** ⬜ Planned
**Depends on:** none
**Parallel-safe with:** CS55, CS56, CS57, CS59, CS63, CS69, CS70, CS71, CS72
**Origin:** CS52-11 prod deploy ceremony (yoga-gwn-c5, 2026-05-03). Recurring failure observed; promoted to a dedicated CS at user direction (*"the deployment should be fixed to properly handle a cold db, this shouldn't be on the operator to handle"*).

## Symptom

The "Run DB migrations" step in [`.github/workflows/prod-deploy.yml`](../../../.github/workflows/prod-deploy.yml) (currently around line 246) invokes `node scripts/migrate.js`. The `mssql` Node.js library has a **default connect timeout of 5 seconds**. Production runs on `gwn-production` (Azure SQL `GP_S_Gen5` serverless, `autoPauseDelay=60min`).

When the DB has been auto-paused, the connect attempt **does** trigger the resume — but the resume takes ~30–60s, far longer than the 5s timeout. The migration step aborts with:

```
Migration failed: ConnectionError: Failed to connect to gwn-sqldb.database.windows.net:1433 in 5000ms
::error::Migration failed; aborting deploy before traffic shift
```

This was observed on the first prod-deploy attempt during CS52-11 (run [25263941898](https://github.com/henrik-me/guesswhatisnext/actions/runs/25263941898), 2026-05-03T01:02Z). A second attempt ~10 minutes later succeeded *because the failed first attempt had warmed the DB*.

## Why this matters

Every prod deploy after the DB has been idle ≥60min will hit this on the **first** attempt. Deploys are infrequent (manual `workflow_dispatch`, gated on user approval) and the steady-state DB traffic during off-hours doesn't keep the DB warm, so this is the expected case for most prod deploys, not the exception.

Each occurrence costs:

- **One wasted prod-deploy run** (compute + workflow noise).
- **One extra production-environment approval click** for the operator (the rerun re-arms the gate per [INSTRUCTIONS.md § Production deploys](../../../INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user)).
- **An incident-style failure annotation** (`Migration failed; aborting deploy before traffic shift`) that looks alarming and triggers reading deploy logs to confirm it's the cold-pause and not a real outage.
- **An accidental "first attempt warms the DB" pattern** that hides intent — future operators may not realize the retry is "the same image, the second time, after the DB is warm" and treat the rerun as a normal recovery.

This pattern is also documented in [LEARNINGS.md § Azure SQL serverless cold-pause vs prod-deploy migration timeout (CS52-11)](../../../LEARNINGS.md). CS73 promotes that learning into an actionable workflow change.

## Goal

Eliminate the cold-pause failure mode from `prod-deploy.yml` so a routine prod deploy after long idle succeeds on the **first** attempt without operator intervention or DB-wake workarounds.

## Out of scope

- App-level cold-DB fallback for *user* requests — that's [CS56](planned_cs56_server-cache-and-cold-db-fallback.md)'s concern (cache + 503 Retry-After UX).
- Boot-init race for tables created by recent migrations — that's [CS63](planned_cs63_game-configs-boot-race.md)'s concern (in-process boot-quiet contract).
- The same hazard hypothetically applying to staging — staging uses container-local SQLite, no Azure SQL, so this CS is prod-only.
- Telemetry of cold-pause vs warm-deploy timing — informational, not blocking; could be a follow-up if anyone wants the data.

## Approach (two candidates; either suffices, both is the belt-and-braces)

### Option A — Wake DB explicitly before migration (recommended)

Add a new step in `prod-deploy.yml` ahead of `Run DB migrations`:

```yaml
- name: Wake Azure SQL gwn-production (CS73)
  uses: azure/cli@<pinned-sha>
  with:
    inlineScript: |
      # Issue a tolerant SELECT 1 against gwn-production.
      # Uses sqlcmd (already available in azure/cli image) with retry loop.
      # Tolerant of "Resuming"/"AutoClosed" → "Online" transition.
      # Budget: 90s (covers the documented Azure SQL serverless resume window).
      DBSTATUS=$(az sql db show --name gwn-production --resource-group gwn-rg \
        --server gwn-sqldb --query "status" -o tsv)
      echo "Initial DB status: $DBSTATUS"
      if [ "$DBSTATUS" != "Online" ]; then
        echo "DB is paused/resuming — issuing wake query (budget 90s)"
        # ... retry SELECT 1 with backoff up to 90s ...
      fi
      echo "DB ready for migration step"
```

**Pros:** explicit; deploy log clearly shows "DB was paused / DB was online"; no behavior change to the migration step itself.

**Cons:** adds 30–60s to first-deploy-after-idle (acceptable — that's the actual time required for the resume).

### Option B — Raise the connect timeout in `scripts/migrate.js`

Pass `connectionTimeout: 90000` (90s) to the `mssql` config in [`scripts/migrate.js`](../../../scripts/migrate.js) so the connect attempt itself waits long enough for the cold-pause resume.

**Pros:** simpler change; no workflow modification.

**Cons:** masks real connectivity problems for 90s; the deploy log shows "Connecting…" silently for up to 90s with no signal that it's a cold-pause vs a real outage.

### Recommended: do both

Option A surfaces the wake intent in the deploy log (good for incident review) and Option B makes the migration runner robust to any residual race. Either alone fixes the bug; both together make the failure mode genuinely impossible.

## Tasks

| # | Task | Notes |
|---|------|-------|
| CS73-1 | Implement Option A (wake step in `prod-deploy.yml`) with a 90s budget, exponential backoff, and clear `echo` log lines. Validate the workflow YAML lints clean. | Workflow-only change. No app code touched. |
| CS73-2 | Implement Option B: bump `connectionTimeout` in `scripts/migrate.js` to 90000. Update the inline comment to explain the choice. | One-line change; cite this CS in the comment. |
| CS73-3 | Test by paused-state simulation: pause `gwn-production` via `az sql db pause`, dispatch `prod-deploy.yml` against the same image, confirm first attempt succeeds. Capture the wake-step log output as evidence in the PR body. | One-time manual operator validation; no automated test. |
| CS73-4 | Update [LEARNINGS.md § Azure SQL serverless cold-pause vs prod-deploy migration timeout (CS52-11)](../../../LEARNINGS.md) with a "Resolved by CS73" note pointing at the merged PR. The "operator workaround" block in that section can be deleted (no longer needed). | Docs cleanup at merge time. |

## Acceptance

1. A `prod-deploy.yml` dispatch against a paused `gwn-production` Azure SQL DB succeeds on the first attempt without operator pre-wake or rerun.
2. The deploy log clearly indicates whether the DB was paused at the start of the migration step (so incident review can distinguish "cold pause, recovered automatically" from "real connectivity issue").
3. The migration step's connect timeout is documented in `scripts/migrate.js` with a comment referencing CS73 and the cold-pause rationale.
4. LEARNINGS.md cold-pause section is updated to note the resolution; the operator workaround block is removed.
5. CS41-12 + CS41-1+2 smoke jobs continue to pass against the same image (regression check that the wake step doesn't introduce side effects).

## Will not be done (deliberate)

- **Generalize to all Azure SQL deploy steps in any other workflow** — CS73 fixes the prod-deploy migration step only. If another workflow opens an Azure SQL connection cold (e.g. a future nightly verification job), it should reuse the wake step pattern but a generic library / reusable workflow is overkill until there's a second consumer.
- **Wake before *every* DB-touching step in prod-deploy.yml** — once the migration succeeds, the DB is warm for the rest of the deploy chain (CS41-12 smoke, CS41-1+2 smoke, etc.). The wake step belongs at the migration boundary only.
- **Auto-disable `autoPauseDelay`** — the auto-pause is an intentional cost-saving feature for the free tier (per [CS58](../done/done_cs58_scale-staging-to-zero.md)'s scale-to-zero rationale). Treat it as a property of the environment, not a bug.

## Cross-references

- Origin: [CS52-11 closeout outcome section](../done/done_cs52_server-authoritative-scoring.md) (manual workaround applied during the deploy).
- Related learning: [LEARNINGS.md § Azure SQL serverless cold-pause vs prod-deploy migration timeout (CS52-11)](../../../LEARNINGS.md).
- Workflow: [`.github/workflows/prod-deploy.yml`](../../../.github/workflows/prod-deploy.yml) (Run DB migrations step).
- Migration runner: [`scripts/migrate.js`](../../../scripts/migrate.js).
- Adjacent (no overlap): [CS56](planned_cs56_server-cache-and-cold-db-fallback.md) (app-level cold-DB fallback for user requests), [CS63](planned_cs63_game-configs-boot-race.md) (boot-init race for newly-created tables).
