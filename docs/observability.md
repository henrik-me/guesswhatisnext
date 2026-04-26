# Observability — App Insights query examples (HTTP request shape)

This doc covers two things:

1. **How to access logs** — operator runbook for getting at App Insights / Log Analytics from the portal and the `az` CLI.
2. **What to look for** — a starter KQL bundle for the most common incident-investigation patterns: requests-by-route sanity check, error rate, latency percentiles, slow-request hunting, distributed-trace bridge to Pino logs in `ContainerAppConsoleLogs_CL`, and cold-start mssql connect latency.

Scope is intentionally narrow: **HTTP request shape only**. The `dependencies`, `traces`, and `exceptions` tables are not populated yet — that's [CS54-9's deferred work evaluation](../project/clickstops/done/done_cs54_enable-app-insights-in-prod.md#cs54-9--deferred-work-evaluation-appendix). Most of the queries below work around those gaps.

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

### A.2 Azure CLI alternative (`az monitor app-insights query` / `az monitor log-analytics query`)

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

`APPLICATIONINSIGHTS_CONNECTION_STRING` lives in deploy-time configuration only (Container Apps `secret` referenced via `secretRef:` in the deploy workflows — see [CS54 design decision #3](../project/clickstops/done/done_cs54_enable-app-insights-in-prod.md#design-decisions)). **Do not** export it in your local shell when running the real server (`npm start`, `npm run dev:mssql`, etc.) — your local dev traffic will appear in the **staging** AI resource and contaminate real-traffic verification queries.

`tests/opentelemetry.test.js` already saves and restores the env var per test, so unit tests are unaffected. The risk is purely from interactive shells that have the var exported (e.g., `$env:APPLICATIONINSIGHTS_CONNECTION_STRING = "..."` left in a profile, or sourced from a `.env` file by accident).

## B. Common KQL queries

All queries below run against either AI resource (pick the right one for your environment — see § C). They assume the `requests` table is populated; if it isn't, walk back through [CS54-6's verification queries](../project/clickstops/done/done_cs54_enable-app-insights-in-prod.md#cs54-6--verification-record-2026-04-25t2239z) first.

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

Until [CS54-9](../project/clickstops/done/done_cs54_enable-app-insights-in-prod.md#cs54-9--deferred-work-evaluation-appendix) lands a Pino → AI log forwarder, the `traces` table is empty. To correlate a request span with the Pino log lines it produced, bridge the AI `requests` table to the workspace's `ContainerAppConsoleLogs_CL` via `operation_Id` ↔ `trace_id` (Pino logger injects `trace_id` from the active OTel span — see [`server/logger.js`](../server/logger.js)).

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

The `dependencies` table is not populated — mssql auto-instrumentation is intentionally disabled in [`server/telemetry.js`](../server/telemetry.js) (CS54 scope decision). Until [CS54-9 option #1](../project/clickstops/done/done_cs54_enable-app-insights-in-prod.md#cs54-9--deferred-work-evaluation-appendix) lands, fall back to grepping Pino's structured stdout in `ContainerAppConsoleLogs_CL`. The query below is a **template** — adjust the `where` clause to match whatever string the cold-start retry path actually emits (today the relevant lines come out of the `mssql-adapter` connect/retry code in [`server/db/`](../server/db/); see CS53 for the working queries used during the original investigation):

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1h)
| extend pino = parse_json(Log_s)
| where tostring(pino.msg) has "mssql" or tostring(pino.module) == "mssql-adapter"
| project TimeGenerated, container=ContainerName_s, level=pino.level, msg=pino.msg, elapsedMs=pino.elapsedMs
| order by TimeGenerated desc
```

Field availability depends on what the server actually logs — `elapsedMs` only shows up on log lines where the adapter measured and emitted it. Treat the `project` list as a starting set and prune to whatever fields are populated for the runs you're investigating. This whole query lives in the workspace, not the AI app — run it from `workspace-gwnrg6bXt`'s Logs blade, or via `az monitor log-analytics query --workspace <customer-id>`.

### B.7 Schema migration applied (CS52-2)

Each successful migration emits one Pino INFO line via `server/db/migrations/_tracker.js` with the structured fields `{version, name, msg: "Migration applied"}`. The query below confirms migration 008 (`cs52-ranked-schema`) ran cleanly on a given environment after a release. Useful as a deploy gate after CS52-2's schema change ships, and reusable for any future migration by changing the `version` filter.

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(24h)
| extend pino = parse_json(Log_s)
| where tostring(pino.msg) == "Migration applied"
| extend version = toint(pino.version), name = tostring(pino.name)
| where version == 8           // CS52-2; change to filter other migrations
| project TimeGenerated, container = ContainerName_s, version, name, trace_id = tostring(pino.trace_id)
| order by TimeGenerated desc
```

A non-empty result confirms migration 008 was applied during the most recent boot/restart in that environment. An empty result on a freshly-deployed revision means either (a) the runner short-circuited because the migration was already applied in a prior revision (expected on rolling re-deploys) or (b) the runner errored before logging — in which case the boot would also have failed and would surface as an `app-startup` error in `requests`. Cross-check against `_migrations` table contents via the regular DB connection if uncertain.

### B.8 Ranked session lifecycle (CS52-3)

The ranked session API (`POST /api/sessions`, `/answer`, `/next-round`, `/finish`) emits structured Pino lines for every state transition + every anti-cheat rejection. All lines carry `sessionId`; anti-cheat rejections additionally carry `reason` (`out-of-order` | `puzzle-mismatch` | `timing-impossible` | `expired` | `not-in-progress` | `no-current-round` | `duplicate-answer` | `concurrent-active-session` | `already-played-daily` | `daily-already-finished`). The five queries below cover the most common Ranked investigations. All queries apply to both `gwn-ai-staging` and `gwn-ai-production` — pick the resource matching the environment under investigation.

**Code path observed:** [`server/routes/sessions.js`](../server/routes/sessions.js) and [`server/services/scoringService.js`](../server/services/scoringService.js).

**B.8.1 Session created — rate by mode (last hour):**

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1h)
| extend pino = parse_json(Log_s)
| where tostring(pino.msg) == "ranked-session created"
| extend mode = tostring(pino.mode), sessionId = tostring(pino.sessionId)
| summarize sessions = count() by bin(TimeGenerated, 5m), mode
| order by TimeGenerated desc
```

Healthy: ≥1 row per 5-minute bucket per active mode under normal traffic. An empty result for `mode == "ranked_freeplay"` for >15 min means the Ranked entry point is broken (or no users are playing — cross-check with `requests | where name has "/api/sessions"` for raw POST volume).

**B.8.2 Session finished — score distribution (last 24h):**

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(24h)
| extend pino = parse_json(Log_s)
| where tostring(pino.msg) == "ranked-session finished"
| extend score = toint(pino.score), correctCount = toint(pino.correctCount)
| summarize sessions = count(),
            p50_score = percentile(score, 50),
            p90_score = percentile(score, 90),
            avg_correct = avg(correctCount)
  by bin(TimeGenerated, 1h)
| order by TimeGenerated desc
```

Use this to spot regressions in the scoring service (sudden drop in `p50_score` while `avg_correct` stays the same → multiplier bug; both drop together → users hitting a UI/timing regression).

**B.8.3 Anti-cheat rejections — rate by reason (last 1h):**

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1h)
| extend pino = parse_json(Log_s)
| where tostring(pino.msg) == "ranked-session anti-cheat-rejection"
| extend reason = tostring(pino.reason), sessionId = tostring(pino.sessionId)
| summarize rejections = count() by bin(TimeGenerated, 5m), reason
| order by TimeGenerated desc
```

Healthy: low background rate on `out-of-order` / `timing-impossible` (real users do occasionally race themselves). A sudden spike on `concurrent-active-session` typically means a client retry loop is hammering `POST /api/sessions` — investigate the client `connectivity.state` machine. Spikes on `already-played-daily` correlate with the start of a new UTC day (expected) but should taper within minutes.

**B.8.4 Forged client_time_ms detection (defence-in-depth telemetry):**

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(24h)
| extend pino = parse_json(Log_s)
| where tostring(pino.msg) == "ranked-session answer-received"
| extend elapsedMs = toint(pino.elapsedMs),
         clientTimeMs = toint(pino.clientTimeMs),
         clientDiff = toint(pino.clientTimeMsDiff),
         sessionId = tostring(pino.sessionId)
| where isnotnull(clientTimeMs) and abs(clientDiff) > 5000
| project TimeGenerated, sessionId, elapsedMs, clientTimeMs, clientDiff
| order by abs(clientDiff) desc
| take 50
```

`clientTimeMsDiff = client_time_ms − elapsed_ms` (server-derived). Per CS52 Decision #7 the score is computed from `elapsedMs` regardless, so this query is for **detection only** — large diffs flag clients that are misreporting (broken clocks, intentional cheat attempts, or a client-bug regression). A consistently high background rate is fine if it correlates with a known clock-skew client; sudden spikes are interesting.

**B.8.5 In-band reconciliation activity (cleanup of stale in_progress rows):**

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(24h)
| extend pino = parse_json(Log_s)
| where tostring(pino.msg) == "ranked-session reconciled-by-request"
| extend reconciledCount = toint(pino.reconciledCount), userId = toint(pino.userId)
| summarize total_reconciled = sum(reconciledCount), users_reconciling = dcount(userId)
  by bin(TimeGenerated, 1h)
| order by TimeGenerated desc
```


### B.9 `game_configs` cache miss frequency (CS52-7c)

The loader in [`server/services/gameConfigLoader.js`](../server/services/gameConfigLoader.js) emits one Pino INFO line per cache fill with the structured fields `{msg: "game-configs cache miss", mode, source, updated_at?}`. Under steady state with a 24h TTL, expected volume is **at most one line per mode per revision per 24h** — a single revision serving traffic for 24h should emit roughly 3 lines (one per server-authoritative mode: `ranked_freeplay`, `ranked_daily`, `multiplayer`). A spike means either (a) a deploy/restart cycled the in-process cache, or (b) the admin route was used to bust a mode (cross-check with § B.10). Sustained high volume would indicate the cache is not surviving requests, e.g. a bug that re-instantiates the loader per request.

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(24h)
| extend pino = parse_json(Log_s)
| where tostring(pino.msg) == "game-configs cache miss"
| extend mode = tostring(pino.mode), source = tostring(pino.source), updated_at = tostring(pino.updated_at)
| summarize fills = count(), latest = max(TimeGenerated) by mode, source
| order by fills desc
```

`source = "db"` means a `game_configs` row was found and applied; `source = "defaults"` means the code-level fallback in [`server/services/gameConfigDefaults.js`](../server/services/gameConfigDefaults.js) was used (the row is absent for that mode). A persistent `defaults` line for a mode that operators believe should be DB-overridden is the signal that the row was deleted, never inserted, or the admin write went to a different revision (see § Decision #10 operator caveat about revision overlap).

### B.10 `game_configs` admin updates (CS52-7c audit trail)

Every successful `PUT /api/admin/game-configs/:mode` emits `{msg: "game-configs updated", mode, rounds, round_timer_ms, inter_round_delay_ms, actor: "admin-route"}`. Use this as the audit trail for "who changed what when" and to correlate post-change behaviour shifts against the timeline.

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(7d)
| extend pino = parse_json(Log_s)
| where tostring(pino.msg) == "game-configs updated"
| extend mode = tostring(pino.mode),
         rounds = toint(pino.rounds),
         round_timer_ms = toint(pino.round_timer_ms),
         inter_round_delay_ms = toint(pino.inter_round_delay_ms),
         container = ContainerName_s,
         trace_id = tostring(pino.trace_id)
| project TimeGenerated, container, mode, rounds, round_timer_ms, inter_round_delay_ms, trace_id
| order by TimeGenerated desc
```

If multiple revisions are running side-by-side during a deploy, the same admin write lands on only one — the others will keep their cached values until their own TTL expires (per § Decision #10 operator caveat). Cross-reference with § B.9: a `game-configs updated` line should be followed within seconds by a `game-configs cache miss` line on the same `container` (the route busts the local cache), and within ≤24h by similar misses on every other live `container`.

## C. Staging vs prod filtering

There is **no cross-environment filter inside a single KQL query** — staging and production are deliberately separate AI resources ([CS54 design decision #2](../project/clickstops/done/done_cs54_enable-app-insights-in-prod.md#design-decisions)). The "filter" is which resource you point the portal/CLI at:

- **Staging:** `gwn-ai-staging` (portal) or `--app gwn-ai-staging` (CLI).
- **Production:** `gwn-ai-production` (portal) or `--app gwn-ai-production` (CLI).

Cross-environment investigations (e.g., "did this regression also reach prod?") are intentionally awkward — re-run the query in the other resource and diff manually. The trade-off was accepted to avoid `cloud_RoleName` heuristics that fall apart because both environments share `serviceName` from `package.json`.

## D. Cross-links

- **Why the deferred-work workarounds exist:** [CS54-9 Deferred Work Evaluation](../project/clickstops/done/done_cs54_enable-app-insights-in-prod.md#cs54-9--deferred-work-evaluation-appendix) — three gaps (mssql instrumentation, Pino → AI log forwarding, exceptions table) that this doc works around with cross-workspace bridges and Pino-log fallbacks. The recommendations there are what would let us delete § B.5 and § B.6 in favor of `dependencies` / `traces` queries.
- **Cold-start investigation flavor:** [CS53 — prod cold-start retry investigation](../project/clickstops/active/active_cs53_prod-cold-start-retry-investigation.md) is the original incident that motivated CS54. The `ContainerAppConsoleLogs_CL`-only queries used during that investigation become much shorter once the AI `requests` table is in play (compare § B.4 above to the `parse_json(Log_s)` heuristics CS53 had to rely on).
- **Logger / trace-id injection:** [`server/logger.js`](../server/logger.js) is what makes § B.5's bridge work — Pino log lines carry `trace_id` and `span_id` extracted from the active OTel span.
- **Telemetry wiring:** [`server/telemetry.js`](../server/telemetry.js) is the AI export path; see CS54 for what it does and doesn't instrument.
