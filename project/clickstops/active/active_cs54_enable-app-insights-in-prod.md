# CS54 — Enable Azure Application Insights in production

**Status:** 🔄 In Progress
**Owner:** yoga-gwn-c2 (claimed 2026-04-25T17:07Z)
**Origin:** Discovered during CS53-1 (2026-04-23). When pulling logs to investigate the cold-start retry hiccup, we found that the production Container App has no `APPLICATIONINSIGHTS_CONNECTION_STRING` env var set. The OTel SDK is wired and ready ([`server/telemetry.js`](../../../server/telemetry.js)) — it just falls back to no-export. As a result, neither `traces` nor `requests` tables exist for the prod resource in Application Insights; we can only query Container Apps console stdout via Log Analytics (`ContainerAppConsoleLogs_CL`).

## Goal

Enable Application Insights in production (and staging, for parity) so future investigations have access to:

- Structured `requests` table (HTTP req/resp pairs with duration, status, name, id)
- Distributed tracing via OTel `trace_id`/`span_id` already injected by [`server/logger.js`](../../../server/logger.js) — usable to **correlate** the `requests` table with stdout Pino logs in `ContainerAppConsoleLogs_CL`

This eliminates the need for ad-hoc `parse_json(Log_s)` extraction over Container App console logs *for HTTP request shape*, and lays the groundwork for richer instrumentation in a future clickstop.

**Explicitly out of scope (evaluated, not delivered, in CS54-9 — see "Will not be done"):** the `dependencies` table (requires mssql auto-instrumentation, which is currently disabled in [`server/telemetry.js`](../../../server/telemetry.js)), the `exceptions` table (requires either an intentional error probe or uncaught-exception traffic), and the `traces` table populated by Pino logs (requires a log-export path; today Pino writes to stdout only and `AzureMonitorTraceExporter` exports spans, not logs). CS54 narrows to "request spans only" so the wiring story stays small and verifiable.

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
| CS54-1 | Provision AI resources (staging + prod) in `gwn-rg`, workspace-bound to the workspace backing the Container Apps Environment (resolved via `appLogsConfiguration.logAnalyticsConfiguration.customerId`, NOT `[0].id` of the RG-level list). Capture both connection strings. Region must match the Container App's region; fail closed otherwise. | ✅ Done (2026-04-25T17:55Z) | `gwn-ai-staging` (appId `693575e0-d4e3-47a8-88a4-1012808b6358`) + `gwn-ai-production` (appId `405e1ae4-eff8-4073-8030-06d693b95a60`); both in `gwn-rg`/`eastus`, workspace-bound to `workspace-gwnrg6bXt`. |
| CS54-2 | For each Container App, register the connection string as a Container App `secret` via `az containerapp secret set` (`appinsights-connection-string`). Must be done before CS54-3 / CS54-4 redeploy with `secretRef:`. | ✅ Done (2026-04-25T17:55Z) | Both `gwn-staging` and `gwn-production` now list `appinsights-connection-string` in `az containerapp secret list`. Apps must restart for changes to take effect (happens automatically on next deploy). |
| CS54-3 | Wire `APPLICATIONINSIGHTS_CONNECTION_STRING` into `staging-deploy.yml` via `secretRef:`: deploy template env enumeration (~L464) only. **Do NOT** add the var to the ephemeral smoke-test container env block (~L60–L100). | ✅ Done | wt-1, branch `yoga-gwn-c2/cs54-3-staging-deploy-wiring`. PR [#251](https://github.com/henrik-me/guesswhatisnext/pull/251). |
| CS54-4 | Wire `APPLICATIONINSIGHTS_CONNECTION_STRING` into `prod-deploy.yml` via `secretRef:`: deploy template env enumeration (~L186) AND rollback template env enumeration (~L280). Add a CI grep guard that fails if `APPLICATIONINSIGHTS` appears only once in `prod-deploy.yml`. | ✅ Done | wt-1, branch `yoga-gwn-c2/cs54-4-5-prod-deploy-wiring`. PR [#253](https://github.com/henrik-me/guesswhatisnext/pull/253). |
| CS54-5 | Update `infra/deploy.sh` and `infra/deploy.ps1` to set the secret + secretRef env wiring. **Ships in the same PR as CS54-4** so a later bootstrap re-run cannot silently revert the wiring. | ✅ Done | Shipped with CS54-4 in PR [#253](https://github.com/henrik-me/guesswhatisnext/pull/253). Fail-closed precondition added; `infra/README.md` links to CS54-1+CS54-2 operator runbook. |
| CS54-6 | Deploy + verify end-to-end: trigger staging deploy, hit `/api/health` then `/api/scores/leaderboard?mode=freeplay&period=alltime` ≥3 times, confirm a `requests` row appears in `gwn-ai-staging` within 5 min. Then trigger prod deploy and repeat. **Do NOT assert on `dependencies`, `traces`, or `exceptions` tables — those are evaluated in CS54-9.** | ⬜ Pending | This is the CS gate. |
| CS54-7 | Document common KQL queries in `OPERATIONS.md` (or `docs/observability.md`): error rate by route, p50/p95/p99 latency, distributed-trace bridge to `ContainerAppConsoleLogs_CL` via `operation_Id`. Include the dev/operator note about not exporting the conn string locally. | ✅ Done | Landed as [`docs/observability.md`](../../../docs/observability.md) (linked from [`OPERATIONS.md`](../../../OPERATIONS.md)) — PR #250. Replaces ad-hoc `parse_json(Log_s)` queries from CS53 — for HTTP shape only. |
| CS54-8 | Post-enable measurement at +24h, +7d, +30d: capture App Insights ingest volume per resource. Record actuals in CS54 closing note. **Replaces up-front cost guess.** | ⬜ Pending | Per rubber-duck finding #9. |
| CS54-9 | Evaluate deferred observability gaps — append a "Deferred Work Evaluation" appendix to this CS54 file. For each gap (mssql instrumentation, Pino→AI log forwarding, exceptions table), document: what's needed, ≥2 implementation options with trade-offs, dependencies, rough effort, recommended approach, and what data from CS54-6/CS54-8 would change the recommendation. **Do NOT file a follow-up CS yet** — defer that decision until production measurement data is in hand and a future orchestrator has full context to decide one-CS-vs-many, priority, and possible folding into adjacent clickstops (CS47, CS56). | ✅ Done | wt-1, branch `yoga-gwn-c2/cs54-9-deferred-work-eval`. Evaluate-first deferral pattern. PR [#254](https://github.com/henrik-me/guesswhatisnext/pull/254). |
| CS54-10 | Close clickstop: move file to `done/`, update WORKBOARD, summarize CS54 + reference the Deferred Work Evaluation appendix in the closing note so future orchestrators can find it. | ⬜ Pending | Standard close-out. |

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
- Distributed-trace lookup bridging spans + Pino logs (until the gaps in CS54-9 are addressed by future follow-up):

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

Cross-link the CS54-9 Deferred Work Evaluation appendix (added below) for full-coverage queries that need `dependencies`, `exceptions`, and `traces` — those are explicitly out of CS54 scope and are evaluated, not delivered, in CS54-9.

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

### CS54-9 — Evaluate deferred observability gaps (no new CS yet)

Append a `## Deferred Work Evaluation` section to this CS54 file (kept in `active/` until CS54-10 closes it; then it travels to `done/` with the rest of the audit trail). For each of the three gaps the rubber-duck pass (`cs54-plan-review`, findings #1 and #2) carved out, document the following structure:

```
### Gap N: <name>
**What's missing.** <one paragraph — what user-facing capability or KQL query is unavailable>
**Why CS54 does not deliver it.** <link to telemetry.js line range / explanation>
**Options considered.**
  Option A: <approach> — pros / cons / rough effort
  Option B: <approach> — pros / cons / rough effort
  (≥ 2 options; prefer "do nothing" / "defer further" as one of them where realistic)
**Recommendation.** <one of the options, or "decide later — needs CS54-8 data to choose">
**Dependencies / blockers.** <other CS, infra, decisions>
**What data from CS54-6 / CS54-8 would change this.** <specific signal that would shift the recommendation>
**Suggested follow-up shape.** <"file dedicated CS" / "fold into CS47" / "fold into CS56" / "no follow-up needed">
```

The three gaps to evaluate:

1. **`dependencies` table — mssql auto-instrumentation.** Today `server/telemetry.js:12-15` filters to `instrumentation-http` + `instrumentation-express`. Options include enabling `@opentelemetry/instrumentation-mssql` (or whatever the current OTel mssql package is named — verify availability and version compatibility with the pinned `@opentelemetry/sdk-node`).
2. **`traces` table — Pino → App Insights log forwarding.** Today Pino → stdout → `ContainerAppConsoleLogs_CL`. Options include a Pino transport (`pino-applicationinsights` or similar), the OTel logs SDK + Azure Monitor logs exporter, or accepting the cross-table KQL bridge added in CS54-7 as the long-term answer.
3. **`exceptions` table — typed stack traces.** Today only failed `requests` (with `success: false`) appear, not full stack traces. Options include explicit `appInsights.defaultClient.trackException` calls in `server/error-handler.js`, an `unhandledRejection`/`uncaughtException` global handler that calls into the AI SDK directly, or accepting that error correlation via Pino's `err` field in the new `traces` table (option #2 above) is sufficient.

**Explicit non-goal of CS54-9:** do not create a new `planned_csN_*.md` file. The decision on whether the follow-up is one CS, many CSs, or folded into an adjacent clickstop is deferred to a future orchestrator working with measured production data from CS54-6 and CS54-8. The evaluation appendix in this CS54 file is the durable record of what was deferred and why — that satisfies "never silently drop" without committing to a CS shape prematurely.

When CS54 moves to `done/`, the evaluation appendix moves with it; future orchestrators discover it via `git log --diff-filter=A -- project/clickstops/done/done_cs54_*.md` or by browsing `done/`.

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
- [ ] Deferred Work Evaluation appendix added to this CS54 file with ≥2 options + recommendation per gap (mssql instrumentation, Pino→AI log forwarding, exceptions). **No new clickstop file is required by CS54** — see CS54-9 for the rationale. Future CS-creation decision lives with whoever next picks this up after CS54-8 measurements are in.
- [ ] Post-enable measurement (CS54-8) recorded in the CS54 closing note for at least +24h.

**Explicitly NOT in acceptance** (evaluated in CS54-9; not delivered by CS54): `dependencies` table populating, `traces` table populating with Pino logs, `exceptions` table populating.

## Will not be done as part of this clickstop

- **`dependencies` table population** — requires enabling mssql auto-instrumentation in [`server/telemetry.js`](../../../server/telemetry.js); deferred — CS54-9 evaluates options and records a recommendation, but does not file a follow-up clickstop. Decision on whether/when/how to follow up is left to a future orchestrator with CS54-8 data in hand.
- **`traces` table population from Pino logs** — requires a log-export path (Pino transport or OTel logs SDK); deferred — see CS54-9.
- **`exceptions` table population** — requires either an intentional error probe or uncaught-exception traffic with stack-trace forwarding; deferred — see CS54-9.
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
| CS54-9, CS54-10 | Pure docs (evaluation appendix appended in-file). Revert PR if needed; no Azure or DB state to undo. |

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
- [x] Plan revised again (2026-04-25) to use evaluate-first deferral pattern (CS54-9 documents options and a recommendation per gap; does not file a stub follow-up CS). Prevents speculative CS proliferation; CS-creation decision waits for measured rollout data.
- [ ] After dispatch decision: move file to `active/`, claim CS54-1 in WORKBOARD, prompt user `/rename`.
- [ ] CS54-1 + CS54-2 are operator-driven (Azure CLI); confirm operator has Azure subscription contributor access on `gwn-rg` before claiming.

## Open questions (to resolve during CS54-1 or before dispatch)

- [x] Confirm AI free-tier 5GB/month is sufficient — replaced by post-enable measurement (CS54-8).
- [ ] Decide whether `OPERATIONS.md` is the right home for KQL examples or whether a new `docs/observability.md` warrants its own file (lean: append to OPERATIONS.md unless the section grows beyond ~100 lines).

## Deferred Work Evaluation

Per CS54-9 (evaluate-first deferral pattern). For each of the three observability gaps that CS54 explicitly narrowed away from, this section captures: ≥2 implementation options with trade-offs, dependencies, rough effort, an explicit recommendation, and what measured data from CS54-6 / CS54-8 would shift that recommendation. **No follow-up clickstop is filed by CS54-9** — that decision is deferred to a future orchestrator working with rollout data in hand.

Package availability was checked against the npm registry on 2026-04-25 to keep the recommendations grounded in the current ecosystem rather than guesses. Pinned versions in [`package.json`](../../../package.json) at the time of writing: `@opentelemetry/sdk-node@^0.214.0`, `@opentelemetry/auto-instrumentations-node@^0.72.0`, `@opentelemetry/api@^1.9.1`, `@azure/monitor-opentelemetry-exporter@^1.0.0-beta.32`.

### Gap 1: `dependencies` table — mssql auto-instrumentation

**What's missing.** The `dependencies` table in `gwn-ai-{staging,production}` is empty. KQL queries that should "just work" today — per-query MSSQL latency (`dependencies | where type == "SQL" | summarize percentiles(duration, 50, 95, 99) by name`), failure rate of specific stored procedures, end-to-end waterfall from incoming `requests` row down through the SQL roundtrip via `operation_Id` — return zero rows. Cold-start MSSQL connect investigations (CS53) still have to be done by `parse_json(Log_s)` over `ContainerAppConsoleLogs_CL`, the same workaround CS54 was meant to retire for the HTTP-shape half of the problem.

**Why CS54 does not deliver it.** [`server/telemetry.js:12-15`](../../../server/telemetry.js) hard-codes `ENABLED_INSTRUMENTATIONS` to the HTTP and Express auto-instrumentations only, then [filters](../../../server/telemetry.js) the result of `getNodeAutoInstrumentations(...)` (lines 23-28) so any other instrumentation that ships in the auto-instrumentations bundle is dropped on the floor. This was an intentional CS54 design decision — keep the wiring surface small and verifiable around the `requests` table — and it bounds CS54 acceptance accordingly.

**Options considered.**

- **Option A: Enable `@opentelemetry/instrumentation-tedious`.** `mssql` (the npm package used by [`server/mssql-adapter.js`](../../../server/db/mssql-adapter.js)) is implemented on top of `tedious`, so instrumenting `tedious` is the canonical path — there is no `@opentelemetry/instrumentation-mssql` package in the npm registry (verified: `npm view @opentelemetry/instrumentation-mssql` returns 404), only `instrumentation-tedious` exists. Latest published version is `0.34.0` (2026-04-17), Apache-2.0, actively maintained under the OTel JS contrib repo. **Pros:** zero application-code changes; all queries — including the cold-start connect that CS53 spent weeks reverse-engineering — light up in the `dependencies` table with `operation_Id` correlation to incoming `requests`. **Cons:** adds one dependency; needs a peer-version compat check against the pinned `@opentelemetry/sdk-node@^0.214.0` (likely fine — both are tracked in lockstep by the OTel JS release train, but a `npm install --dry-run` is mandatory before committing); needs an explicit allow-list addition to `ENABLED_INSTRUMENTATIONS` and a corresponding update to [`tests/opentelemetry.test.js`](../../../tests/opentelemetry.test.js). **Effort:** small — ~half day including the compat check, test update, and a manual KQL verification probe in staging.
- **Option B: Manual span emission from [`server/mssql-adapter.js`](../../../server/db/mssql-adapter.js).** Wrap `_connect()` and the query entry points with explicit `tracer.startActiveSpan(...)`/`endSpan()` calls. **Pros:** no new dependency; full control over span attributes (we could attach the cold-start retry count, pool state, etc. — richer than what auto-instrumentation captures). **Cons:** every query path needs to be wrapped manually and stays wrapped forever — easy to miss a code path on future adapter changes; reinvents what the upstream instrumentation already does correctly; couples observability shape to our adapter rather than the OTel ecosystem; we lose drift-protection from upstream improvements. **Effort:** medium — ~1-2 days including ensuring no query path is missed, plus ongoing maintenance tax.
- **Option C: Defer indefinitely.** Continue using the CS54-7 KQL bridge to `ContainerAppConsoleLogs_CL` for cold-start MSSQL diagnostics; tolerate that ad-hoc `parse_json(Log_s)` queries are the answer for SQL-shape investigation. **Pros:** zero work, zero risk, zero new dependencies. **Cons:** CS47 (ProgressiveLoader telemetry & alerting) wants per-query latency data to set sensible thresholds — without `dependencies`, CS47 has to either ship without that signal or duplicate Option B inside its own scope; CS53-style cold-start investigations stay manual.

**Recommendation.** **Option A.** This is the cheapest, most idiomatic path; the upstream package is current and maintained; the existing `ENABLED_INSTRUMENTATIONS` allow-list architecture is exactly the seam this kind of expansion was designed for. Option B's "richer attributes" advantage can be layered on top of Option A later via span processors if it ever matters — Option A does not foreclose anything. Option C is only the right answer if CS54-8 measurements show that AI ingestion is already brushing the 5GB/month free-tier ceiling on `requests` alone, in which case adding `dependencies` (high-cardinality SQL spans) would push us into paid tier without justification.

**Dependencies / blockers.** None. Self-contained code change in `server/telemetry.js` + dependency add. Does not require new Azure resources, infra changes, or operator action.

**What data from CS54-6 / CS54-8 would change this.** Two specific signals would flip the recommendation toward Option C: (1) CS54-8 +30d measurement showing `gwn-ai-production` ingest volume already > 3 GB/month from `requests` alone (`dependencies` typically 3-5× the row count of `requests` for an MSSQL-backed app, so this would imply >10 GB/month total — paid tier territory); (2) CS54-6 verification surfacing unexpectedly noisy `requests` (e.g., health-probe span explosion not yet sampled out) that needs to be suppressed before adding more cardinality. Conversely, if CS47 work begins before CS54-8 measurements are in, that pulls Option A's urgency forward — CS47's alerting story is materially weaker without per-query latency.

**Suggested follow-up shape.** **File a dedicated CS** (small — single PR, ~half day). The work is too narrowly scoped to fold cleanly into CS47 (which is about ProgressiveLoader UX telemetry, a different feature axis) and too specific to fold into CS56. Naming suggestion for the future orchestrator: `csNN_enable-mssql-tracing.md`. Ship it before CS47 starts so CS47 can assume per-query spans exist.

### Gap 2: `traces` table — Pino → App Insights log forwarding

**What's missing.** The App Insights `traces` table (which is where structured log lines land — confusingly, *not* distributed traces; those go to `requests` + `dependencies`) is empty for both AI resources. Pino logs are written to stdout and captured by the Container Apps log driver into `ContainerAppConsoleLogs_CL` in the bound Log Analytics workspace. To correlate an HTTP request span with the structured log lines emitted while handling it, an operator has to run the cross-table KQL bridge documented as query #5 in [`docs/observability.md`](../../../docs/observability.md) — joining `requests.operation_Id` against `parse_json(Log_s).trace_id` from the workspace. This works but is awkward, slow on large windows, and requires the operator to remember the workspace ID for every query.

**Why CS54 does not deliver it.** [`server/telemetry.js`](../../../server/telemetry.js) wires only the `AzureMonitorTraceExporter` (lines 42-44, 72) — there is no logs exporter, and Pino writes to stdout via its default destination ([`server/logger.js`](../../../server/logger.js)), not through any OTel/AI sink. CS54 explicitly scoped this out (see "Explicitly out of scope" preamble) so the wiring story stayed small.

**Options considered.**

- **Option A: `pino-applicationinsights` transport.** Stream Pino log records via the AI Node SDK's `trackTrace` API as a Pino transport. **Pros:** smallest code change — a transport entry in [`server/logger.js`](../../../server/logger.js)'s `buildLoggerOptions(...)`, behind the same env-var gate that controls the trace exporter; no application-code changes; preserves Pino's structured log shape into AI custom dimensions; `trace_id`/`span_id` from the existing OTel mixin (`server/logger.js:26-32`) flow through naturally so cross-table joins become single-table joins on `customDimensions.trace_id`. **Cons:** package maintenance is the worry — `pino-applicationinsights@2.1.0` was last published 2022-05-12 (~4 years stale at time of writing). It still installs and works against current Pino major versions, but a stale upstream is a long-tail risk for security patches and Node-version compat. License is MIT, no concern there. Pino transports run in a worker thread by default, so they apply backpressure to Pino's own queue rather than to the request-handling event loop — a stuck/throttled AI ingestion would build a worker-thread queue and eventually drop log records, *not* block requests. That backpressure model is acceptable but worth verifying with a load probe before prod.
- **Option B: OTel Logs SDK + Azure Monitor logs exporter** (via `@azure/monitor-opentelemetry`, the unified distro at `1.16.0`, currently maintained — last published 2026-03-19). Replace the per-signal exporter wiring in `telemetry.js` with the unified distro and route Pino through `@opentelemetry/instrumentation-pino` (or a logs-bridge shim) so log records become OTel `LogRecord`s that the unified distro exports to AI alongside spans. **Pros:** architecturally consistent — one SDK, one exporter, one set of upgrade decisions; the unified distro is the direction Microsoft is steering customers (the standalone `@azure/monitor-opentelemetry-exporter` we use today is technically a beta package, `1.0.0-beta.32`); future signals (metrics, eventually) come "for free" once the unified distro is in place. **Cons:** much heavier change — replacing `AzureMonitorTraceExporter` with the distro is a `telemetry.js` rewrite, not a tweak; affects [`tests/opentelemetry.test.js`](../../../tests/opentelemetry.test.js) substantially; introduces a new instrumentation (`instrumentation-pino`) which mutates Pino at require-time and must be ordered correctly relative to `server/logger.js` — exactly the kind of load-order subtlety that has bitten this project before (see the comment in `telemetry.js:90-92` about why `console.log` is used during bootstrap). Effort 2-3× Option A.
- **Option C: Defer — accept the cross-table KQL bridge as the long-term answer.** [`docs/observability.md`](../../../docs/observability.md) query #5 already does this. **Pros:** zero work, zero risk, zero ingest-cost addition (logs stay in the cheaper Container Apps console pipeline); the workspace-bridge query is already documented. **Cons:** every cross-cutting investigation — "show me everything we logged for `operation_Id X`" — is a multi-line KQL with a `union` and a parameterized workspace name, which is error-prone for time-pressured incident response. Also leaves the `traces` table permanently empty, which is unintuitive to anyone who expects the standard AI experience.

**Recommendation.** **Option A**, but only if CS54-8 ingest data shows headroom (see signals below). The maintenance staleness of `pino-applicationinsights` is the real cost — recommend pairing the rollout PR with a forked-or-vendored fallback plan (the package is small; vendoring is feasible if upstream dies). Option B is the architecturally right answer but the wrong sequencing — wait until the standalone exporter actually deprecates before paying that migration cost. Option C is acceptable only if CS54-8 shows we are tight against the free-tier ceiling.

**Dependencies / blockers.** Strongly coupled to Gap 3 — see the cross-reference there. Also weakly coupled to CS47 (alerting): if CS47 wants to alert on log patterns rather than HTTP-status patterns, Gap 2 is a prerequisite.

**What data from CS54-6 / CS54-8 would change this.** (1) CS54-8 +30d measurement showing >3 GB/month ingest from `requests` alone → flip to Option C and tolerate the KQL bridge; logs are typically 10-20× the volume of request spans and would blow the free-tier budget out of the water. (2) CS54-6 surfacing log lines that contain large blobs (game state dumps, full request bodies) → Option A becomes risky without a Pino-side filter first. (3) Microsoft announcing GA-with-deprecation of `@azure/monitor-opentelemetry-exporter` in favor of the unified distro → Option B's sequencing argument flips; bundle the migration with this gap.

**Suggested follow-up shape.** **File a dedicated CS** (small-medium — single PR, ~1-2 days including a load-probe verification of the worker-thread backpressure behavior). Should NOT be folded into CS47; CS47 wants this as a prerequisite, not as part of its scope. Naming suggestion: `csNN_pino-app-insights-log-forwarding.md`. Ship after CS54-8 +24h measurement at minimum, ideally after +7d.

### Gap 3: `exceptions` table — typed stack traces

**What's missing.** The `exceptions` table is empty. Failed HTTP requests show up as rows in `requests` with `success == false` and `resultCode >= 500`, but there is no associated stack trace, no exception type, no aggregation panel in the AI portal grouping recurring failures by exception class. KQL queries like `exceptions | summarize count() by type, outerMessage` (the canonical "what is breaking most often" query) return nothing. Background failures — anything that throws outside an Express request handler, e.g. an unhandled rejection in a setTimeout callback or a DB pool error from a non-request-driven code path — are completely invisible to AI; they show up only as `console.error` lines in `ContainerAppConsoleLogs_CL`, if at all.

**Why CS54 does not deliver it.** Nothing in CS54's scope writes to AI's exception channel. The centralized Express error handler at [`server/app.js:457`](../../../server/app.js) currently logs via Pino (`logger.error({ err, ... }, '...')`) and returns an HTTP response — it does not call any AI SDK method. There are also no `process.on('unhandledRejection', ...)` / `process.on('uncaughtException', ...)` handlers in the server bootstrap path, by design (the project relies on the container supervisor — Container Apps' restart policy — to handle process-killing exceptions; see [§ Database & Data in INSTRUCTIONS.md](../../../INSTRUCTIONS.md#database--data) on the "no DB-waking background work" principle for related supervisor-trust posture).

**Options considered.**

- **Option A: Explicit `trackException` calls in `server/app.js:457`-ish error middleware** (using either `applicationinsights` SDK directly or, more consistently with the rest of CS54, the OTel `recordException` API on the active span — `server/telemetry.js`'s tracer is already wired). **Pros:** tightly scoped change — one file, one `app.use` block; deterministic — every error that flows through the centralized handler becomes an exception row; preserves the existing Pino logging (additive, not replacing). **Cons:** does not catch background failures (anything outside the Express handler chain — timer callbacks, pool error events, websocket handlers if/when added) — those stay invisible; introduces a dependency on the AI SDK in application code, which CS54 was careful to keep confined to `telemetry.js`. **Effort:** small — ~2-4 hours including a test that verifies the exception is recorded (the OTel SDK has in-memory exporters suitable for this).
- **Option B: Global `unhandledRejection`/`uncaughtException` handlers calling into the AI SDK.** Catches everything Option A misses. **Pros:** total coverage; particularly valuable for background failures that today disappear silently. **Cons:** **conflicts with the existing process-supervisor trust model** — installing an `uncaughtException` handler that does not exit the process turns a fail-fast crash into a zombie process; installing one that *does* exit duplicates what Container Apps already does for free, but adds a window where the crashing process tries to flush AI buffers (typically a few seconds) before exit, potentially racing the supervisor's kill signal. Either variant changes the operational shape of the service in ways that need their own evaluation. Also: `unhandledRejection` is per-Node-version subtle (`unhandledRejections` mode default has shifted across Node versions) and easy to get wrong.
- **Option C: Accept Pino → `traces` (Gap 2 Option A) as sufficient.** Pino's `err` serializer captures stack traces into the `err.stack` field, and once Gap 2 ships those land in `traces.customDimensions.err.stack`. KQL: `traces | where customDimensions.err != "" | summarize count() by tostring(customDimensions.err.type)` — not as ergonomic as the native `exceptions` table experience in the portal, but functionally equivalent. **Pros:** zero work *if* Gap 2 ships; consolidates "where do errors live in AI" to a single answer (traces); removes the AI SDK from application code. **Cons:** loses the AI portal's first-class exception-grouping UI (Failures blade groups exceptions by type/method/outerMessage automatically; doing this in KQL on `traces` requires a hand-rolled aggregation); still does not help with background failures unless those also go through the logger (most do, by convention).

**Recommendation.** **Option C, contingent on Gap 2 shipping.** The relationship between this gap and Gap 2 is the dominant consideration: if Gap 2 lands as Option A (Pino → AI), then 90% of the value of Option A here is already delivered, and the remaining 10% (the portal's Failures blade) is not worth introducing an AI-SDK dependency in application code for. If Gap 2 instead lands as Option C (defer indefinitely), then Gap 3 should also be Option A — pick up the slack. **Decide later — explicitly waits on the Gap 2 decision.** Option B should be deferred regardless of how Gaps 2 settles; the supervisor-conflict trade-off needs its own dedicated thinking and is not the right thing to fold into this work.

**Dependencies / blockers.** Sequenced after Gap 2 — Gap 2's decision determines whether Gap 3 is "no-op" or "small targeted change". Also weakly coupled to a future operator-grade audit of background-failure paths in the codebase (does `mssql-adapter.js` emit pool errors anywhere that bypasses the request middleware? if so, do those need explicit `trackException`?).

**What data from CS54-6 / CS54-8 would change this.** (1) CS54-6 / CS54-8 surfacing recurring 5xx from a small number of root causes that are hard to triage without grouped stack traces → Option A's portal-Failures-blade value goes up; flip the recommendation to Option A even if Gap 2 ships. (2) CS54-6 surfacing background failures (process restarts in Container Apps without a corresponding `requests` row showing 5xx) → Option B's coverage advantage starts to look worth its operational cost; revisit Option B specifically. (3) If neither CS54-6 nor CS54-8 surfaces anything alarming on the error axis, Option C remains the right call.

**Suggested follow-up shape.** **No dedicated follow-up CS yet — fold the eventual decision into the same CS that resolves Gap 2.** Whichever of Gap 2's options is chosen, that CS naturally encompasses Gap 3's resolution (either by delivering it via the trace pipeline, or by adding the targeted `recordException` call in the same PR). Writing a separate CS for Gap 3 in isolation would force premature commitment to one of Options A/B/C before the Gap 2 decision is made.

### Cross-gap summary

| Gap | Recommendation | Sequencing | Follow-up shape |
|---|---|---|---|
| 1 — `dependencies` (mssql) | Option A — enable `instrumentation-tedious` | Independent; ship before CS47 if possible | Dedicated CS, small |
| 2 — `traces` (Pino → AI) | Option A — `pino-applicationinsights` transport | After CS54-8 +7d ingest measurement | Dedicated CS, small-medium |
| 3 — `exceptions` | Option C, contingent on Gap 2 | Folded into Gap 2's CS | No separate CS |

Future orchestrators: re-read this section *after* CS54-8's +30d data is captured in the CS54 closing note. The recommendations above are best-current-knowledge as of 2026-04-25 with no production AI data available; the listed "what data would change this" signals are explicit so the re-evaluation is mechanical, not subjective.
