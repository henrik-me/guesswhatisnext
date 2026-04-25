# CS54 — Enable Azure Application Insights in production

**Status:** 🔄 In Progress
**Owner:** yoga-gwn-c2 (claimed 2026-04-25T17:07Z)
**Origin:** Discovered during CS53-1 (2026-04-23). When pulling logs to investigate the cold-start retry hiccup, we found that the production Container App has no `APPLICATIONINSIGHTS_CONNECTION_STRING` env var set. The OTel SDK is wired and ready ([`server/telemetry.js`](../../../server/telemetry.js)) — it just falls back to no-export. As a result, neither `traces` nor `requests` tables exist for the prod resource in Application Insights; we can only query Container Apps console stdout via Log Analytics (`ContainerAppConsoleLogs_CL`).

## Goal

Enable Application Insights in production (and staging, for parity) so future investigations have access to:

- Structured `requests` table (HTTP req/resp pairs with duration, status, name, id)
- Distributed tracing via OTel `trace_id`/`span_id` already injected by [`server/logger.js`](../../../server/logger.js) — usable to **correlate** the `requests` table with stdout Pino logs in `ContainerAppConsoleLogs_CL`

This eliminates the need for ad-hoc `parse_json(Log_s)` extraction over Container App console logs *for HTTP request shape*, and lays the groundwork for richer instrumentation in a future clickstop.

**Explicitly out of scope (now in CS58 — see "Will not be done"):** the `dependencies` table (requires mssql auto-instrumentation, which is currently disabled in [`server/telemetry.js`](../../../server/telemetry.js)), the `exceptions` table (requires either an intentional error probe or uncaught-exception traffic), and the `traces` table populated by Pino logs (requires a log-export path; today Pino writes to stdout only and `AzureMonitorTraceExporter` exports spans, not logs). CS54 narrows to "request spans only" so the wiring story stays small and verifiable.

## Investigation summary (already known — no rediscovery needed)

| Component | State | Notes |
|---|---|---|
| `server/telemetry.js` | ✅ Ready *(but limited)* | Instantiates `AzureMonitorTraceExporter` when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set. **Auto-instrumentation is filtered to HTTP + Express only** (lines 12-27, 64-81); mssql instrumentation is NOT enabled, and there is no log exporter. This bounds CS54 acceptance to the `requests` table. |
| `server/config.js:25` | ✅ Ready | `APPLICATIONINSIGHTS_CONNECTION_STRING` already declared (defaults to `''`). |
| `tests/opentelemetry.test.js` | ✅ Exists | Already covers enabled/disabled bootstrap paths. CS54 must not regress these. |
| `prod-deploy.yml` | ❌ Missing | Env-var enumeration in deploy template (~L186) AND rollback template (~L280); plus `env:` blocks (~L211, ~L322). |
| `staging-deploy.yml` | ❌ Missing | Env-var enumeration (~L464) plus `env:` block (~L496). |
| `infra/deploy.sh` / `deploy.ps1` | ❌ Missing | One-shot provisioning; if re-run, would not set the env var. Update for completeness. |
| AI resource in Azure | ❌ Does not exist | Verified: no `APPLICATIONINSIGHTS_CONNECTION_STRING` reference anywhere in `infra/`. CS54-1 must provision. |
| Existing Log Analytics workspace | 🔍 Unknown — TBD in CS54-1 | Container Apps writes to a workspace already; AI should be workspace-based against the same one. |

## Design decisions

1. **Workspace-based App Insights, derived from the Container Apps Environment.** Bind the new AI resource to the Log Analytics workspace that backs the Container Apps Environment (`gwn-env` or whatever the env is actually named). **Do not** pick `[0].id` from the RG-level workspace list — that is fragile if the RG ever has more than one workspace. Discovery: query the Container Apps Environment's `properties.appLogsConfiguration.logAnalyticsConfiguration.customerId`, resolve to the workspace resource ID, then bind. Region: derive from the Container App itself; fail closed if Container App / workspace / AI resource regions don't all match.
2. **Two AI resources, not one.** Separate AI resources for staging and production. Mixing them defeats the purpose of having staging in the first place — incident KQL must filter to a known environment without `cloud_RoleName` heuristics. Naming: `gwn-ai-production`, `gwn-ai-staging`. Same `gwn-rg` resource group.
3. **Connection string stored as Container App `secret`, referenced via `secretRef:` (not literal `value:`).** Rationale: with `value:`, the connection string is plaintext in `properties.template.containers[].env` and visible to anyone with read access on the Container App resource via `az containerapp show` or the portal. With `secretRef:`, the value lives in `properties.configuration.secrets[]` (encrypted at rest) and the env entry references it by name. The cost is one extra provisioning step (`az containerapp secret set`) per environment per deploy. Adopt this even though existing env vars in this repo use `value:` — connection strings warrant the upgrade. (Existing `JWT_SECRET` etc. as `value:` is a separate pre-existing finding, not in scope here.)
4. **Enable both staging and prod in the same clickstop.** The cost of doing only prod is that staging stays observability-blind, which keeps CS47 partially blocked and means CS54 verifies AI in production for the first time. Staging-first lets us verify the wiring on a non-customer environment before prod ever sees it.
5. **No app code changes.** Strictly infra/CI work. `tests/opentelemetry.test.js` already saves/restores the env var (lines 19-35) — no test rewrite required. The only operator-side test note: do not export `APPLICATIONINSIGHTS_CONNECTION_STRING` in your local shell when running the real server, or your local dev traffic will appear in staging AI.
6. **No custom metrics or alerts in this CS.** That's CS47's scope. CS54's success criterion is "the `requests` table populates"; alerting on contents is a follow-up.
7. **Infra scripts (`infra/deploy.{sh,ps1}`) ship in the same rollout phase as the workflow YAMLs, not as deferred completeness.** Rationale: a future operator running the bootstrap script to recreate the Container App would silently revert the AI wiring otherwise. Pulling `infra/` into the rollout closes that drift window. (Per rubber-duck finding #5.)
8. **Do not wire AI into the ephemeral smoke-test container.** The smoke-test job in `staging-deploy.yml` runs the container in CI from GitHub-hosted runners; sending that traffic to the real `gwn-ai-staging` resource would muddy real-traffic verification. Smoke tests stay no-export. (Per rubber-duck finding #6.)

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS54-1 | Provision AI resources (staging + prod) in `gwn-rg`, workspace-based against the existing Container Apps Log Analytics workspace. Capture both connection strings. | ⬜ Pending | Manual `az` commands documented in PR body; no Bicep/Terraform in this repo today, so we don't introduce IaC just for this. |
| CS54-2 | Add `APPLICATIONINSIGHTS_CONNECTION_STRING_STAGING` + `APPLICATIONINSIGHTS_CONNECTION_STRING_PROD` GitHub secrets (via `gh secret set`). Verify each is masked in workflow logs. | ⬜ Pending | Operator-only step (requires repo admin). Must be done before CS54-3. |
| CS54-3 | Wire `APPLICATIONINSIGHTS_CONNECTION_STRING` into `staging-deploy.yml`: deploy template env enumeration (~L464) + workflow `env:` block (~L496). | ⬜ Pending | First — we want staging to prove the wiring. PR includes container-validation cycle (env-only change to runtime path is borderline; treat as runtime-affecting and validate). |
| CS54-4 | Wire `APPLICATIONINSIGHTS_CONNECTION_STRING` into `prod-deploy.yml`: deploy template env enumeration (~L186) + rollback template env enumeration (~L280) + workflow `env:` blocks (~L211 + ~L322). **Both happy and rollback paths must be updated identically — easy to miss the rollback.** | ⬜ Pending | Depends on CS54-3 verified in staging. |
| CS54-5 | Update `infra/deploy.sh` and `infra/deploy.ps1` to set the env var when (re-)provisioning the container app, so the wiring isn't only in the GH Actions path. Also update `infra/setup-github.sh` / `setup-github.ps1` to register the new secret name in their checklists. | ⬜ Pending | Completeness — these scripts are the documented provisioning path. Pure docs/CI per REVIEWS.md (no app code change). |
| CS54-6 | Deploy + verify end-to-end: trigger staging deploy, hit `/api/health` then `/api/scores/leaderboard?mode=freeplay&period=alltime`, confirm a `requests` row + a `traces` row + an mssql `dependencies` row appear in `gwn-ai-staging` within 5 min. Then trigger prod deploy and repeat. Capture KQL+screenshots in PR body. | ⬜ Pending | This is the CS gate — if any table doesn't populate, troubleshoot before closing. |
| CS54-7 | Document common KQL queries in `OPERATIONS.md` (or a new `docs/observability.md`): cold-start dependency latency, request error rate, exception aggregation, log search by `trace_id`. Include staging-vs-prod filtering note. | ⬜ Pending | Replaces the ad-hoc `parse_json(Log_s)` queries used during CS53. |
| CS54-8 | Close clickstop: move file to `done/`, update WORKBOARD, summarize CS54 + link to first prod KQL screenshot in CONTEXT.md if relevant. | ⬜ Pending | Standard close-out. |

## Per-task implementation detail

### CS54-1 — Provision AI resources (workspace-discovery hardened)

```bash
# Discover the Container Apps Environment that owns gwn-{staging,production}
ENV_ID=$(az containerapp show --name gwn-production --resource-group gwn-rg \
  --query "properties.managedEnvironmentId" -o tsv)
echo "Container Apps Environment: $ENV_ID"

# Resolve the Log Analytics workspace bound to that environment
CUSTOMER_ID=$(az containerapp env show --ids "$ENV_ID" \
  --query "properties.appLogsConfiguration.logAnalyticsConfiguration.customerId" -o tsv)
echo "Workspace customerId: $CUSTOMER_ID"

# Convert customerId (a GUID) to the full resource ID
WORKSPACE_ID=$(az monitor log-analytics workspace list \
  --query "[?customerId=='$CUSTOMER_ID'].id | [0]" -o tsv)
if [ -z "$WORKSPACE_ID" ]; then
  echo "FATAL: Could not resolve Log Analytics workspace for customerId $CUSTOMER_ID" >&2
  exit 1
fi
echo "Workspace resource ID: $WORKSPACE_ID"

# Region must match the Container App
APP_REGION=$(az containerapp show --name gwn-production --resource-group gwn-rg --query "location" -o tsv)
WS_REGION=$(az monitor log-analytics workspace show --ids "$WORKSPACE_ID" --query "location" -o tsv)
if [ "$APP_REGION" != "$WS_REGION" ]; then
  echo "FATAL: region mismatch — Container App is in $APP_REGION, workspace is in $WS_REGION" >&2
  exit 1
fi

# Provision staging AI in the same region, bound to the same workspace
az monitor app-insights component create \
  --app gwn-ai-staging \
  --location "$APP_REGION" \
  --resource-group gwn-rg \
  --workspace "$WORKSPACE_ID" \
  --kind web --application-type web

az monitor app-insights component show \
  --app gwn-ai-staging --resource-group gwn-rg \
  --query connectionString -o tsv

# Same for prod (re-run env discovery against gwn-staging if it lives in a different env)
az monitor app-insights component create \
  --app gwn-ai-production \
  --location "$APP_REGION" \
  --resource-group gwn-rg \
  --workspace "$WORKSPACE_ID" \
  --kind web --application-type web

az monitor app-insights component show \
  --app gwn-ai-production --resource-group gwn-rg \
  --query connectionString -o tsv
```

Document both connection strings in a private operator note (1Password / Azure Key Vault style) for the operator before CS54-2. Do not paste them in PR descriptions, commits, or chat.

### CS54-2 — Register Container App secrets

```bash
# Pull conn string into a local var (do not echo)
STAGING_CS=$(az monitor app-insights component show \
  --app gwn-ai-staging --resource-group gwn-rg --query connectionString -o tsv)

az containerapp secret set \
  --name gwn-staging --resource-group gwn-rg \
  --secrets appinsights-connection-string="$STAGING_CS"

PROD_CS=$(az monitor app-insights component show \
  --app gwn-ai-production --resource-group gwn-rg --query connectionString -o tsv)

az containerapp secret set \
  --name gwn-production --resource-group gwn-rg \
  --secrets appinsights-connection-string="$PROD_CS"

# Verify the secret is registered (lists names only — values not returned)
az containerapp secret list --name gwn-production --resource-group gwn-rg -o table
az containerapp secret list --name gwn-staging --resource-group gwn-rg -o table

# Clear local vars when done
unset STAGING_CS PROD_CS
```

No GitHub secrets needed — the value lives in ACA, the workflow only references it by `secretRef:` name.

### CS54-3 — Staging deploy wiring (`secretRef:`)

In `.github/workflows/staging-deploy.yml`, deploy template (~L464), append after `GWN_DB_PATH`:

```yaml
                    - name: APPLICATIONINSIGHTS_CONNECTION_STRING
                      secretRef: appinsights-connection-string
```

No change to the workflow `env:` block at L496 — there's no GitHub secret to interpolate.

**Defense in depth** (per rubber-duck finding #7): do NOT add `set -x` to inlineScripts; do NOT print rendered YAML; do NOT use `az containerapp show ...env` in any post-deploy verification step (use `--query "properties.template.containers[].env[].name"` to list names only). The explicit `::add-mask::` from the original plan is removed — `${{ secrets.* }}` interpolation is no longer involved.

### CS54-4 — Prod deploy wiring (`secretRef:`, both paths)

Apply the same `secretRef:` entry to `.github/workflows/prod-deploy.yml`:

- **Happy-path deploy template** (~L186): add the `secretRef:` env entry.
- **Rollback deploy template** (~L280): add the same entry — easy to forget, breaks rollback otherwise.

Add a CI guard (e.g. a tiny grep step in `ci.yml` or as a step inside `prod-deploy.yml` itself):

```bash
COUNT=$(grep -c "APPLICATIONINSIGHTS_CONNECTION_STRING" .github/workflows/prod-deploy.yml || true)
if [ "$COUNT" -lt 2 ]; then
  echo "::error::APPLICATIONINSIGHTS_CONNECTION_STRING must appear in BOTH happy-path and rollback templates"
  exit 1
fi
```

### CS54-5 — Provisioning scripts (folded into rollout)

`infra/deploy.sh` / `deploy.ps1`: the `az containerapp create`/`update` invocation must include the secret and the secretRef env entry. Either:

- Have the script read `APPLICATIONINSIGHTS_CONNECTION_STRING` from operator env and call `az containerapp secret set` before `az containerapp update`, OR
- Document a manual pre-step ("operator runs CS54-1 + CS54-2 first; then this script") and fail the script with a clear error if `appinsights-connection-string` secret is not present on the target Container App.

Update `infra/README.md` with the operator runbook for AI provisioning.

`infra/setup-github.sh` / `setup-github.ps1`: **remove** any references the prior plan added for GitHub secrets `APPLICATIONINSIGHTS_CONNECTION_STRING_*` — those are no longer used (we shifted to ACA secrets). If those references were never landed (likely), nothing to remove; just don't add them.

### CS54-6 — End-to-end verification (`requests` only)

After staging deploy succeeds:

```kusto
// In Azure Portal: AI resource gwn-ai-staging → Logs

// 1. Confirm requests table populates and reflects the smoke probes
requests
| where timestamp > ago(15m)
| project timestamp, name, resultCode, duration, operation_Id
| order by timestamp desc
| take 20

// 2. Aggregate health: count + p95 duration in the last 15m by route
requests
| where timestamp > ago(15m)
| summarize cnt=count(), p95=percentile(duration, 95), errors=countif(resultCode >= 500) by name
| order by cnt desc
```

Acceptance: query (1) returns ≥ 1 row matching each smoke probe within 5 min of running it; query (2) shows `errors == 0` for the smoke-probed routes.

Capture results in the PR body. Repeat the entire verification for `gwn-ai-production` after the prod deploy.

### CS54-7 — KQL examples in OPERATIONS.md

Add a `## Observability — App Insights query examples (HTTP request shape)` subsection. At minimum:

- HTTP error rate by route (`requests | summarize errors=countif(resultCode >= 500), total=count() by name`)
- p50/p95/p99 latency by route (`requests | summarize percentiles(duration, 50, 95, 99) by name`)
- Distributed-trace lookup bridging spans + Pino logs until CS58:

  ```kusto
  let opId = "<operation_Id from requests>";
  union
    (requests | where operation_Id == opId | extend src="requests"),
    (workspace("<workspace-id>").ContainerAppConsoleLogs_CL
       | where parse_json(Log_s).trace_id == opId
       | extend src="pino")
  | order by timestamp asc
  ```

- Recent slow requests (`requests | where duration > 5000 | order by duration desc | take 20`)
- Note the staging-vs-prod filter: pick the right AI resource in the portal (resources are not joined cross-environment).
- Operator/dev note: do NOT export `APPLICATIONINSIGHTS_CONNECTION_STRING` in your local shell when running the real server, or your local dev traffic will appear in the staging AI resource. The variable belongs in deploy-time only.

Cross-link CS58 (when filed in CS54-9) for full-coverage queries that need `dependencies`, `exceptions`, and `traces`.

### CS54-8 — Post-enable measurement (replaces up-front cost guess)

At +24h, +7d, +30d after each AI resource starts receiving traffic, the operator captures:

```kusto
// AI resource → Logs → Usage panel (or via REST), per resource
SystemEvents
| where Type == "Usage"
| where TimeGenerated > ago(7d)
| summarize total_gb=sum(Quantity)/1000 by bin(TimeGenerated, 1d), DataType
| order by TimeGenerated desc
```

Record actuals in the CS54 closing note (CS54-10). If actuals approach the 5GB/month free-tier ceiling for either resource, file a follow-up to add sampling or daily cap. Don't pre-set a cap — measure first.

### CS54-9 — File CS58 (deferred-work clickstop)

Create `project/clickstops/planned/planned_cs58_full-app-insights-instrumentation.md` covering:

- Enable mssql auto-instrumentation in `server/telemetry.js` (extend `ENABLED_INSTRUMENTATIONS`); verify `dependencies` table populates on the next deploy.
- Add a Pino → AI log forwarder so `traces` table populates with structured Pino output (e.g. `pino-applicationinsights` transport, or a thin Pino destination that calls `appInsights.defaultClient.trackTrace`). Decide between Pino transport vs OTel logs SDK.
- Add an intentional error probe so `exceptions` table is exercised on every deploy.
- Update `OPERATIONS.md` KQL examples to include the new tables.

Per TRACKING.md "Deferred work policy" — must be filed before CS54 can close.

## Risks & mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Connection string leaked via Container App revision template (`value:` would expose plaintext to anyone with read access) | HIGH | Use `secretRef:` + `az containerapp secret set` (design decision #3). |
| Connection string leaked in workflow logs | LOW | No longer applies — value never enters the workflow process; ACA reads it from its own `secrets[]`. Defense in depth: do not echo rendered YAML, do not use `az containerapp show ...env` for verification. |
| Rollback path missed in `prod-deploy.yml` | MEDIUM | CI grep guard (CS54-4) fails if `APPLICATIONINSIGHTS_CONNECTION_STRING` appears only once in `prod-deploy.yml`. |
| Workspace mis-bound (wrong Log Analytics workspace selected by `[0].id` heuristic) | MEDIUM | CS54-1 derives workspace from Container Apps Environment's `appLogsConfiguration.logAnalyticsConfiguration.customerId`; fails closed if not resolvable or region-mismatched. |
| Future bootstrap script silently reverts AI wiring | MEDIUM | `infra/deploy.{sh,ps1}` updated in same rollout (CS54-5); script fails closed if the ACA secret is not present. |
| Cost overrun on AI ingestion | LOW-MEDIUM | App Insights free tier: 5GB/month per resource. Up-front estimate is unreliable (request spans scale with traffic, not stdout volume); CS54-8 measures actuals at +24h/+7d/+30d and triggers sampling/daily cap if needed. |
| AI receives ephemeral CI smoke-test traffic and pollutes prod-shaped data | LOW | Explicit non-goal: do NOT add the env var to `staging-deploy.yml`'s smoke-test container env block (~L60–L100). Smoke tests stay no-export. |
| Adding env var breaks the existing health probe | LOW | `tests/opentelemetry.test.js` already covers both code paths; container-validation cycle (`npm run container:validate`) on each PR catches lazy-init regressions. |
| Local dev / tests now see a populated env var if operators export it locally | LOW | Documented in CS54-7 operator note; `tests/opentelemetry.test.js:19-35` already saves/restores the env var per test (no test rewrite needed). |
| Two separate AI resources double the operational surface | LOW | Trade-off accepted in design decision #2; the alternative (single AI with `cloud_RoleName` filtering) is fragile because both environments use the same `serviceName` from `package.json`. |

## Acceptance criteria

- [ ] `appinsights-connection-string` ACA secret is set on the prod Container App and the staging Container App.
- [ ] `requests` table exists and populates continuously in `gwn-ai-production` and `gwn-ai-staging` (verified by CS54-6 KQL queries).
- [ ] `OPERATIONS.md` (or `docs/observability.md`) contains a documented KQL example bundle for the `requests` table, including the workspace bridge to Pino logs in `ContainerAppConsoleLogs_CL`.
- [ ] No regression in `npm test` (especially `tests/opentelemetry.test.js`).
- [ ] No regression in `npm run container:validate` cold-start cycle.
- [ ] Both happy-path and rollback paths in `prod-deploy.yml` reference the ACA secret identically; CI grep guard active.
- [ ] CS58 plan filed in `project/clickstops/planned/planned_cs58_*.md` capturing the deferred mssql/log/exceptions work.
- [ ] Post-enable measurement (CS54-8) recorded in the CS54 closing note for at least +24h.

**Explicitly NOT in acceptance** (deferred to CS58): `dependencies` table populating, `traces` table populating with Pino logs, `exceptions` table populating.

## Will not be done as part of this clickstop

- **`dependencies` table population** — requires enabling mssql auto-instrumentation in [`server/telemetry.js`](../../../server/telemetry.js); deferred to CS58.
- **`traces` table population from Pino logs** — requires a log-export path (Pino transport or OTel logs SDK); deferred to CS58.
- **`exceptions` table population** — requires either an intentional error probe or uncaught-exception traffic; deferred to CS58.
- Custom metrics or alerts beyond what the request-span exporter provides — that's CS47's scope (ProgressiveLoader telemetry & alerting).
- Reworking [`server/telemetry.js`](../../../server/telemetry.js) — it already supports App Insights export via the connection string; only env-var wiring is missing for spans.
- Backfilling historical incident data — App Insights only sees forward from when it's enabled.
- Migrating to Bicep/Terraform IaC for the AI resource — out of scope; current infra is operator scripts.
- Cross-region failover for AI — single-region matches the rest of the deploy posture.
- Test rewrites in `tests/opentelemetry.test.js` — existing save/restore of `APPLICATIONINSIGHTS_CONNECTION_STRING` already handles the new state correctly.

## Rollback story

Each task is independently revertable:

| Task | Rollback |
|------|----------|
| CS54-1 | `az monitor app-insights component delete --app gwn-ai-{staging,production} -g gwn-rg`. Free; no data loss for the rest of the system. |
| CS54-2 | `az containerapp secret remove --name gwn-{staging,production} -g gwn-rg --secret-names appinsights-connection-string`. |
| CS54-3, CS54-4 | Revert PR; redeploy. The container will revert to no-export (current behavior). No data lost; AI tables stop receiving new rows. |
| CS54-5 | Revert PR. Provisioning scripts return to current state. |
| CS54-6, CS54-7, CS54-8 | Pure verification / docs / measurement — nothing to roll back. |
| CS54-9, CS54-10 | Revert PR; CS58 plan file goes away (or stays, harmlessly). |

## Observability deliverables (meta — for the CS itself)

Even though CS54 *is* the observability work, the rollout has its own signals:

- **Per deploy verification:** the verification queries from CS54-6 are re-runnable; if they ever stop returning rows, AI is mis-wired.
- **Workflow log audit:** a one-time grep through the post-CS54-3 staging run's logs to confirm no raw connection string is ever printed.
- **Cost watch:** check Azure cost panel for `gwn-ai-*` resources at +7 days and +30 days post-CS54-6; record both in the closing note.

## Relationship to other clickstops

- **CS53** — discovered this gap during cold-start investigation. CS53 finishes with Container Apps stdout-only logging.
- **CS47 (planned)** — ProgressiveLoader UX telemetry + alerting. CS47 is *much* easier with App Insights in place; CS54 is effectively a prerequisite.
- **CS41 (planned)** — Production deploy validation. CS41's "telemetry verified" check becomes implementable once CS54 lands.

## Parallelism

- CS54-1, CS54-2 are operator-only (Azure + GitHub admin). Sequential, but lightweight (~15 min total).
- CS54-3 must complete and verify in staging before CS54-4 ships. Sequential.
- CS54-5 can run in parallel with CS54-3 (different files; no conflict).
- CS54-6 is verification — sequential after CS54-3 / CS54-4.
- CS54-7 can be drafted in parallel with CS54-6 (KQL examples reuse the verification queries).
- CS54-8 follows everything.

Realistic worktree usage: 1 sub-agent for CS54-3+CS54-4+CS54-6 (one PR each, sequential) plus 1 in parallel for CS54-5+CS54-7. Or all in one slot sequentially — total work is small.

## Pre-dispatch checklist

- [x] CS54 number verified free across `planned/`, `active/`, `done/`, and WORKBOARD.md.
- [x] Investigation complete (telemetry.js, config.js, both deploy YAMLs, infra/ scripts, tests).
- [x] Plan reviewed by rubber-duck pass `cs54-plan-review` (10 findings, all adopted — narrowed scope to `requests` only; switched to `secretRef:`; hardened workspace discovery; pulled `infra/` updates into rollout).
- [ ] After dispatch decision: move file to `active/`, claim CS54-1 in WORKBOARD, prompt user `/rename`.
- [ ] CS54-1 + CS54-2 are operator-driven (Azure CLI); confirm operator has Azure subscription contributor access on `gwn-rg` before claiming.
- [ ] CS58 number reserved for the deferred-work clickstop (next free number — verify before CS54-9).

## Open questions (to resolve during CS54-1 or before dispatch)

- [x] Confirm AI free-tier 5GB/month is sufficient — replaced by post-enable measurement (CS54-8).
- [ ] Decide whether `OPERATIONS.md` is the right home for KQL examples or whether a new `docs/observability.md` warrants its own file (lean: append to OPERATIONS.md unless the section grows beyond ~100 lines).
