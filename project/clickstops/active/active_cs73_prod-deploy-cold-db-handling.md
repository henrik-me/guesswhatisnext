# CS73 — Prod-Deploy Cold DB Handling

**Status:** 🔄 In Progress
**Claimed:** yoga-gwn 2026-05-09T23:55Z (branch `cs73-wake-db`)
**Depends on:** none
**Parallel-safe with:** CS55, CS56, CS57, CS59, CS63, CS69, CS70, CS71, CS72
**Origin:** CS52-11 prod deploy ceremony (yoga-gwn-c5, 2026-05-03). Recurring failure observed; promoted to a dedicated CS at user direction (*"the deployment should be fixed to properly handle a cold db, this shouldn't be on the operator to handle"*).

## Symptom

The "Run DB migrations" step in [`.github/workflows/prod-deploy.yml`](../../../.github/workflows/prod-deploy.yml) (currently around line 246) invokes `node scripts/migrate.js`. The connection goes through `server/db/mssql-adapter.js` which has `MssqlAdapter.CONNECT_TIMEOUT_MS = 5000` (5 seconds; **not** the mssql library default of 15s — see line 565 of the adapter and the comment block at lines 345-348 explaining the CS53 rationale). Production runs on `gwn-production` (Azure SQL `GP_S_Gen5` serverless, `autoPauseDelay=60min`).

When the DB has been auto-paused, the connect attempt **does** trigger the resume — but the resume takes ~30–60s, far longer than the 5s `MssqlAdapter.CONNECT_TIMEOUT_MS` constant set by CS53-3/CS53-6 in `server/db/mssql-adapter.js:565` (this is *not* the mssql library default of 15s; CS53 deliberately lowered it for the runtime warmup-retry path). The migration step aborts with:

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

- App-level cold-DB fallback for *user* requests — that's [CS56](../planned/planned_cs56_server-cache-and-cold-db-fallback.md)'s concern (cache + 503 Retry-After UX).
- Boot-init race for tables created by recent migrations — that's [CS63](../planned/planned_cs63_game-configs-boot-race.md)'s concern (in-process boot-quiet contract).
- The same hazard hypothetically applying to staging — staging uses container-local SQLite, no Azure SQL, so this CS is prod-only.
- Telemetry of cold-pause vs warm-deploy timing — informational, not blocking; could be a follow-up if anyone wants the data.

## Approach

### Option A — Explicit wake step in `prod-deploy.yml` (chosen)

Add a new step ahead of `Run DB migrations` that:

1. **Reports DB status** for visibility via `az sql db show --query "status" -o tsv` (no auth needed beyond the existing `azure/login` step; uses `--name gwn-production --resource-group gwn-rg --server gwn-sqldb`). This logs `Initial DB status: Online | AutoClosed | Resuming | …`. Pure visibility — does NOT trigger resume.
2. **Triggers + awaits the resume** by running a small dedicated script (`scripts/wake-db.js`) that opens an `mssql` connection to `process.env.DATABASE_URL` with a hard-coded `connectionTimeout: 90_000` (90s), runs `SELECT 1`, and exits 0. The script must NOT use the `server/db/mssql-adapter.js` adapter — that adapter's `CONNECT_TIMEOUT_MS=5000` constant is deliberate per CS53-3/CS53-6 and must not change. Instead, `wake-db.js` requires `mssql` directly and constructs its own short-lived connection with the long timeout, used only for the wake.
3. **Logs the elapsed time** so the deploy log shows whether this run paid the cold-pause cost or was already warm.

After this step succeeds, the existing `Run DB migrations` step runs against a warmed DB and completes in normal time.

```yaml
- name: Wake Azure SQL gwn-production (CS73)
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: |
    set -e
    if [ -z "$DATABASE_URL" ]; then
      echo "::error::secrets.DATABASE_URL is unset; cannot wake prod DB."
      exit 1
    fi
    DBSTATUS=$(az sql db show --name gwn-production --resource-group gwn-rg --server gwn-sqldb --query "status" -o tsv)
    echo "Initial DB status: $DBSTATUS"
    START=$(date +%s)
    node scripts/wake-db.js
    ELAPSED=$(( $(date +%s) - START ))
    echo "DB ready for migration step (wake took ${ELAPSED}s)"
```

The `azure/login` step (already present in `prod-deploy.yml`) provides the `az` CLI auth context. No new secret is needed.

### Why Option B (bump global mssql connection timeout) was rejected

Originally this CS proposed raising `connectionTimeout` in `scripts/migrate.js`. Investigation (2026-05-09) showed the timeout is actually a class constant in `server/db/mssql-adapter.js:565` (`MssqlAdapter.CONNECT_TIMEOUT_MS = 5000`), set deliberately by CS53-3/CS53-6 so the runtime warmup-retry path can exercise more attempts inside the user's budget. Bumping that constant to 90s would break the CS53 warmup design for live user requests. Bumping it just for `migrate.js` would require either an env-var override hook in the adapter (new public surface, larger blast radius) or having `migrate.js` skip the adapter (harder — the adapter encapsulates several CS53 simulators / counters that the migration framework reuses transitively).

The dedicated `scripts/wake-db.js` (chosen) is strictly additive: a new file, a new workflow step, zero changes to runtime adapter behavior, zero risk to the CS53 warmup contract.

## Tasks

| # | Task | Notes |
|---|------|-------|
| CS73-1 | Create `scripts/wake-db.js` (~40-70 lines) with **bounded retry/backoff** semantics (Azure SQL serverless can return error 40613 "Database not currently available" on the first connection while resume is mid-flight; clients are expected to retry). Design:<br><br>**Module shape (DI-friendly, mirroring `scripts/migrate.js`):** export `wakeDb({ sql, connectionString, perAttemptTimeoutMs, totalBudgetMs, sleep, log })` + a `main()` CLI wrapper. Use `mssql` directly, NOT `server/db/mssql-adapter.js`. Parse the connection string with `sql.ConnectionPool.parseConnectionString(connectionString)` (mirroring `mssql-adapter.js:354`); override `config.connectionTimeout = perAttemptTimeoutMs` and `config.options = { ...config.options, connectTimeout: perAttemptTimeoutMs }`.<br><br>**Defaults:** `perAttemptTimeoutMs=30_000`, `totalBudgetMs=150_000` (so up to ~5 attempts; budget chosen to comfortably exceed the documented 30-60s resume window with headroom for one retry on transient TLS/login errors).<br><br>**Retry policy:** treat connection errors, request errors, and SQL errors with `number in [40613, 40197, 40501, 49918, 49919, 49920]` (Azure SQL transient codes) as retryable. After each failure, log `[CS73 wake-db] attempt N failed: <error code/message>; retrying in <Ns>` and sleep with simple linear backoff (5s, 10s, 15s capped). Stop when total budget exhausted; exit 1 with a clear summary line.<br><br>**Cleanup:** `try { await pool.connect(); await pool.request().query('SELECT 1'); } finally { await pool?.close().catch(()=>{}); }` so the pool is always closed even if `SELECT 1` fails. Same for the outer `sql.close()` if used at module level.<br><br>Add a top-of-file comment explaining why this exists separately from the adapter (CS73 + CS53 boundary). | New file. ~40-70 LOC. Standalone — no app code reuse. |
| CS73-2 | Add the new "Wake Azure SQL gwn-production (CS73)" step to `.github/workflows/prod-deploy.yml`, immediately before the existing "Run DB migrations" step (currently around line 238). Use the YAML body from § Approach above. Validate the workflow file lints clean (`actionlint` if available, otherwise just YAML parse via `npm run lint` if it covers .github/workflows, else `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/prod-deploy.yml','utf8'))"`). | Workflow-only addition; no `Run DB migrations` step changes. |
| CS73-3 | Add unit tests for `scripts/wake-db.js` in `tests/wake-db-script.test.js` (matching the existing naming pattern of `tests/migrate-script.test.js`). Mock `mssql` via the DI seam from CS73-1. Required cases: (a) success on first attempt — exits 0, `SELECT 1` invoked once, pool closed; (b) success on retry — first attempt throws transient (e.g. `{ number: 40613 }`), second attempt succeeds, total elapsed < budget; (c) total budget exhausted — all attempts throw; exits 1 with a stderr summary; (d) connection config carries `connectionTimeout: 30_000` (proves the override took effect even when the adapter's 5s constant is left untouched); (e) pool is closed in the failure path. | Confirms the wake mechanism is robust without needing a live DB. |
| CS73-4 | Update [LEARNINGS.md § Azure SQL serverless cold-pause vs prod-deploy migration timeout (CS52-11)](../../../LEARNINGS.md) with a "Resolved by CS73 (PR #NNN)" note. The "operator workaround" block in that section can be deleted (no longer needed). | Docs cleanup at PR time. |

### Validation strategy for the runtime cold-pause path

The PR validates the **code path** via CS73-3 (unit tests). Validating the **runtime behavior** against a real paused Azure SQL DB requires waiting for natural cold pause, because:

- **Azure SQL `GP_S_Gen5` serverless does NOT support manual pause.** The `az sql db pause` command exists but only applies to Synapse / DataWarehouse SKUs, not serverless General Purpose. There is no operator-issuable pause for `gwn-production`.
- **`autoPauseDelay=60min` is the only way the DB transitions to AutoClosed.** So the validation is necessarily on the deploy timeline, not on demand.

**Closure validation procedure:**

1. After PR merge, on the next prod deploy that organically follows ≥60min of DB idleness (typical: a deploy after an overnight quiet period), watch the `Wake Azure SQL gwn-production (CS73)` step's log output.
2. Confirm the log shows `Initial DB status: AutoClosed` (or `Resuming`) AND `wake took ~30-60s` AND the subsequent `Run DB migrations` step succeeds on the first attempt.
3. Record the deploy run ID + log excerpt in this CS file under § Validation evidence (added at close-out time).
4. If the deploy happens to hit a warm DB (`Initial DB status: Online`, wake takes <2s), that's also a successful run but does not satisfy the cold-pause-validation criterion — keep the CS open and watch the next deploy.

If after 30 days post-merge no deploy has organically hit a cold DB, the CS may be closed anyway (the unit tests + code review already prove the path; we simply lacked the empirical confirmation), with a note.

## Acceptance

PR-merge-blocking criteria:

1. `scripts/wake-db.js` exists and uses `mssql` directly (does NOT import or use `server/db/mssql-adapter.js`); explicit `connectionTimeout: 90_000` set on the config.
2. CS73-3 unit tests pass (success path + failure path + timeout-config-applied assertion).
3. The new "Wake Azure SQL gwn-production (CS73)" step is present in `prod-deploy.yml` immediately before "Run DB migrations".
4. CS41-12 + CS41-1+2 smoke jobs continue to pass against the same image (regression check that the wake step doesn't introduce side effects on warm DBs).
5. LEARNINGS.md cold-pause section is updated to note the resolution; the operator workaround block is removed.
6. Full validation suite (`npm run lint && npm test && npm run test:e2e`) passes.
7. `npm run container:validate` passes (regression check on the runtime adapter — proves CS73 didn't accidentally touch the CS53 5s-timeout contract).

Closure (move to `done/`) requires both PR merge AND the runtime validation evidence per § Validation strategy above (either natural-pause or operator-pause path; record run ID + log excerpt in this CS file).

## Will not be done (deliberate)

- **Generalize to all Azure SQL deploy steps in any other workflow** — CS73 fixes the prod-deploy migration step only. If another workflow opens an Azure SQL connection cold (e.g. a future nightly verification job), it should reuse the wake step pattern but a generic library / reusable workflow is overkill until there's a second consumer.
- **Wake before *every* DB-touching step in prod-deploy.yml** — once the migration succeeds, the DB is warm for the rest of the deploy chain (CS41-12 smoke, CS41-1+2 smoke, etc.). The wake step belongs at the migration boundary only.
- **Auto-disable `autoPauseDelay`** — the auto-pause is an intentional cost-saving feature for the free tier (per [CS58](../done/done_cs58_scale-staging-to-zero.md)'s scale-to-zero rationale). Treat it as a property of the environment, not a bug.

## Cross-references

- Origin: [CS52-11 closeout outcome section](../done/done_cs52_server-authoritative-scoring.md) (manual workaround applied during the deploy).
- Related learning: [LEARNINGS.md § Azure SQL serverless cold-pause vs prod-deploy migration timeout (CS52-11)](../../../LEARNINGS.md).
- Workflow: [`.github/workflows/prod-deploy.yml`](../../../.github/workflows/prod-deploy.yml) (Run DB migrations step).
- Migration runner: [`scripts/migrate.js`](../../../scripts/migrate.js).
- Adjacent (no overlap): [CS56](../planned/planned_cs56_server-cache-and-cold-db-fallback.md) (app-level cold-DB fallback for user requests), [CS63](../planned/planned_cs63_game-configs-boot-race.md) (boot-init race for newly-created tables).
