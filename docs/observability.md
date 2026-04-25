# Observability — App Insights query examples (HTTP request shape)

This doc covers two things:

1. **How to access logs** — operator runbook for getting at App Insights / Log Analytics from the portal and the `az` CLI.
2. **What to look for** — a starter KQL bundle for the most common incident-investigation patterns: requests-by-route sanity check, error rate, latency percentiles, slow-request hunting, distributed-trace bridge to Pino logs in `ContainerAppConsoleLogs_CL`, and cold-start mssql connect latency.

Scope is intentionally narrow: **HTTP request shape only**. The `dependencies`, `traces`, and `exceptions` tables are not populated yet — that's [CS54-9's deferred work evaluation](../project/clickstops/active/active_cs54_enable-app-insights-in-prod.md#cs54-9--evaluate-deferred-observability-gaps-no-new-cs-yet). Most of the queries below work around those gaps.

## Resources

| Environment | App Insights resource | Resource group | Region | Workspace binding |
|---|---|---|---|---|
| Staging | `gwn-ai-staging` | `gwn-rg` | `eastus` | `workspace-gwnrg6bXt` |
| Production | `gwn-ai-production` | `gwn-rg` | `eastus` | `workspace-gwnrg6bXt` |

Both AI resources are **workspace-bound** to the same Log Analytics workspace (`workspace-gwnrg6bXt`) that the Container Apps Environment uses for stdout. That binding is what makes the cross-table bridge query (§ B.5 below) work without a cross-workspace join — `requests` and `ContainerAppConsoleLogs_CL` live side by side in the same workspace.

## A. How to access logs

### A.1 Azure Portal (recommended for ad-hoc investigation)

1. Sign in to the [Azure Portal](https://portal.azure.com/).
2. Top search bar → type the AI resource name: `gwn-ai-staging` for staging, `gwn-ai-production` for prod.
3. Open the resource → left nav → **Logs**. The first time, dismiss the example-queries dialog.
4. Paste a query from § B and run it. The query scope is automatically the AI resource (and its bound workspace), so you don't need to specify a workspace.

### A.2 `az monitor log-analytics query` (CLI alternative)

For scripted use or when you don't want to leave the terminal. The CLI accepts either an App Insights `appId` (for AI tables: `requests`, `dependencies`, etc. — and for cross-table queries that bridge to `ContainerAppConsoleLogs_CL` via the `workspace(...)` function, see § B.5) or a Log Analytics `customer-id` (a GUID, for queries whose primary table is a workspace table such as `ContainerAppConsoleLogs_CL`).

```powershell
# Sanity check: 'requests' table in the staging AI resource
az monitor app-insights query `
  --app gwn-ai-staging --resource-group gwn-rg `
  --analytics-query 'requests | where timestamp > ago(15m) | take 5' `
  -o table

# Same query against prod
az monitor app-insights query `
  --app gwn-ai-production --resource-group gwn-rg `
  --analytics-query 'requests | where timestamp > ago(15m) | take 5' `
  -o table

# Cross-table query that bridges 'requests' (AI) with 'ContainerAppConsoleLogs_CL'
# (workspace) — runs in AI scope; the workspace(...) function reaches the bound workspace
az monitor app-insights query `
  --app gwn-ai-staging --resource-group gwn-rg `
  --analytics-query '<kql from § B.5>' `
  -o table
```

Discover the workspace customer-id (a GUID) and resource-id when you need them:

```powershell
az monitor log-analytics workspace list -g gwn-rg -o table
# Columns of interest: customerId (used by --workspace), id (used in workspace("...") KQL function)
```

App Insights' `appId` (used by the workspace bridge in § B.5) is also discoverable:

```powershell
az monitor app-insights component show --app gwn-ai-staging -g gwn-rg --query appId -o tsv
az monitor app-insights component show --app gwn-ai-production -g gwn-rg --query appId -o tsv
```

For the record at the time of writing: staging `appId` = `693575e0-d4e3-47a8-88a4-1012808b6358`, production `appId` = `405e1ae4-eff8-4073-8030-06d693b95a60`. Re-discover via the `az` command above if you suspect drift.

### A.3 Operator / dev note — do NOT export the connection string locally

`APPLICATIONINSIGHTS_CONNECTION_STRING` lives in deploy-time configuration only (Container Apps `secret` referenced via `secretRef:` in the deploy workflows — see [CS54 design decision #3](../project/clickstops/active/active_cs54_enable-app-insights-in-prod.md#design-decisions)). **Do not** export it in your local shell when running the real server (`npm start`, `npm run dev:mssql`, etc.) — your local dev traffic will appear in the **staging** AI resource and contaminate real-traffic verification queries.

`tests/opentelemetry.test.js` already saves and restores the env var per test, so unit tests are unaffected. The risk is purely from interactive shells that have the var exported (e.g., `$env:APPLICATIONINSIGHTS_CONNECTION_STRING = "..."` left in a profile, or sourced from a `.env` file by accident).

## B. Common KQL queries

All queries below run against either AI resource (pick the right one for your environment — see § C). They assume the `requests` table is populated; if it isn't, walk back through [CS54-6's verification queries](../project/clickstops/active/active_cs54_enable-app-insights-in-prod.md#cs54-6--end-to-end-verification-requests-only) first.

### B.1 Recent requests by route (sanity check)

Confirms AI is wired and receiving traffic. The first query to run after any deploy that touches the wiring.

```kusto
requests
| where timestamp > ago(15m)
| project timestamp, name, resultCode, duration, operation_Id
| order by timestamp desc
| take 20
```

### B.2 HTTP error rate by route (CS41 input)

Surfaces routes that are silently failing. `resultCode >= 500` is server-side only — 4xx is client behavior, not a server health signal.

```kusto
requests
| where timestamp > ago(1h)
| summarize errors=countif(resultCode >= 500), total=count() by name
| extend error_pct = round(100.0 * errors / total, 2)
| order by error_pct desc
```

### B.3 Latency percentiles by route (CS47 input)

p50/p95/p99 per route. p95 is usually the right SLO knob; p99 catches tail latency that real users notice but aggregates hide.

```kusto
requests
| where timestamp > ago(1h)
| summarize p50=percentile(duration, 50), p95=percentile(duration, 95), p99=percentile(duration, 99), cnt=count() by name
| order by p95 desc
```

### B.4 Recent slow requests (cold-start hunting)

Anything > 5s is interesting. In a healthy steady state this should return zero rows; non-zero rows after a deploy are usually the cold-start retry path (CS53 territory).

```kusto
requests
| where timestamp > ago(1h) and duration > 5000
| project timestamp, name, duration, resultCode, operation_Id
| order by duration desc
| take 20
```

Grab an `operation_Id` from this query and feed it into § B.5 to see what the server was doing during that slow request.

### B.5 Distributed-trace bridge to Pino logs

Until [CS54-9](../project/clickstops/active/active_cs54_enable-app-insights-in-prod.md#cs54-9--evaluate-deferred-observability-gaps-no-new-cs-yet) lands a Pino → AI log forwarder, the `traces` table is empty. To correlate a request span with the Pino log lines it produced, bridge the AI `requests` table to the workspace's `ContainerAppConsoleLogs_CL` via `operation_Id` ↔ `trace_id` (Pino logger injects `trace_id` from the active OTel span — see [`server/logger.js`](../server/logger.js)).

The query below runs **in AI scope** (against `gwn-ai-staging` or `gwn-ai-production`), so `requests` resolves natively. It uses the `workspace(...)` KQL function on the Pino branch to reach across to the bound Log Analytics workspace for `ContainerAppConsoleLogs_CL` — the same workspace both AI resources are bound to (see the resource table above). Equivalent CLI invocation: `az monitor app-insights query --app gwn-ai-{staging,production} --analytics-query '<below>'`.

```kusto
let opId = "<paste operation_Id from a requests row>";
union
  (requests | where operation_Id == opId | extend src="requests"),
  (workspace("/subscriptions/59fa8de9-d89c-42bc-8b8d-ee7bfab00270/resourceGroups/gwn-rg/providers/Microsoft.OperationalInsights/workspaces/workspace-gwnrg6bXt").ContainerAppConsoleLogs_CL
     | where parse_json(Log_s).trace_id == opId
     | extend src="pino", timestamp=TimeGenerated)
| order by timestamp asc
```

The `extend timestamp=TimeGenerated` step on the Pino branch normalizes the time column so the final `order by timestamp asc` sorts both halves of the union together (the AI `requests` table uses `timestamp`; the workspace `ContainerAppConsoleLogs_CL` table uses `TimeGenerated`).

Replace the workspace resource ID if it ever changes — re-discover via:

```powershell
az monitor log-analytics workspace list -g gwn-rg -o table
az monitor log-analytics workspace show --workspace-name workspace-gwnrg6bXt -g gwn-rg --query id -o tsv
```

Because both AI resources are bound to `workspace-gwnrg6bXt`, the same bridge query works for both staging and prod — only the AI side of the union changes implicitly based on which resource you're querying from.

### B.6 Cold-start mssql connect latency (until `dependencies` is wired)

The `dependencies` table is not populated — mssql auto-instrumentation is intentionally disabled in [`server/telemetry.js`](../server/telemetry.js) (CS54 scope decision). Until [CS54-9 option #1](../project/clickstops/active/active_cs54_enable-app-insights-in-prod.md#cs54-9--evaluate-deferred-observability-gaps-no-new-cs-yet) lands, fall back to grepping Pino's structured stdout in `ContainerAppConsoleLogs_CL`. The query below is a **template** — adjust the `where` clause to match whatever string the cold-start retry path actually emits (today the relevant lines come out of the `mssql-adapter` connect/retry code in [`server/db/`](../server/db/); see CS53 for the working queries used during the original investigation):

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1h)
| extend pino = parse_json(Log_s)
| where tostring(pino.msg) has "mssql" or tostring(pino.module) == "mssql-adapter"
| project TimeGenerated, container=ContainerName_s, level=pino.level, msg=pino.msg, elapsedMs=pino.elapsedMs
| order by TimeGenerated desc
```

Field availability depends on what the server actually logs — `elapsedMs` only shows up on log lines where the adapter measured and emitted it. Treat the `project` list as a starting set and prune to whatever fields are populated for the runs you're investigating. This whole query lives in the workspace, not the AI app — run it from `workspace-gwnrg6bXt`'s Logs blade, or via `az monitor log-analytics query --workspace <customer-id>`.

## C. Staging vs prod filtering

There is **no cross-environment filter inside a single KQL query** — staging and production are deliberately separate AI resources ([CS54 design decision #2](../project/clickstops/active/active_cs54_enable-app-insights-in-prod.md#design-decisions)). The "filter" is which resource you point the portal/CLI at:

- **Staging:** `gwn-ai-staging` (portal) or `--app gwn-ai-staging` (CLI).
- **Production:** `gwn-ai-production` (portal) or `--app gwn-ai-production` (CLI).

Cross-environment investigations (e.g., "did this regression also reach prod?") are intentionally awkward — re-run the query in the other resource and diff manually. The trade-off was accepted to avoid `cloud_RoleName` heuristics that fall apart because both environments share `serviceName` from `package.json`.

## D. Cross-links

- **Why the deferred-work workarounds exist:** [CS54-9 Deferred Work Evaluation](../project/clickstops/active/active_cs54_enable-app-insights-in-prod.md#cs54-9--evaluate-deferred-observability-gaps-no-new-cs-yet) — three gaps (mssql instrumentation, Pino → AI log forwarding, exceptions table) that this doc works around with cross-workspace bridges and Pino-log fallbacks. The recommendations there are what would let us delete § B.5 and § B.6 in favor of `dependencies` / `traces` queries.
- **Cold-start investigation flavor:** [CS53 — prod cold-start retry investigation](../project/clickstops/active/active_cs53_prod-cold-start-retry-investigation.md) is the original incident that motivated CS54. The `ContainerAppConsoleLogs_CL`-only queries used during that investigation become much shorter once the AI `requests` table is in play (compare § B.4 above to the `parse_json(Log_s)` heuristics CS53 had to rely on).
- **Logger / trace-id injection:** [`server/logger.js`](../server/logger.js) is what makes § B.5's bridge work — Pino log lines carry `trace_id` and `span_id` extracted from the active OTel span.
- **Telemetry wiring:** [`server/telemetry.js`](../server/telemetry.js) is the AI export path; see CS54 for what it does and doesn't instrument.
