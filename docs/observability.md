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

### B.11 Achievement gating invariant (CS52-7)

Per CS52-7 / Decision #7, server achievements unlock **only** from
server-validated outcomes. Two log events are emitted around the gate
(see `server/routes/sessions.js` `/finish`, `server/ws/matchHandler.js`,
and `server/routes/scores.js`):

- `achievement_evaluation` — fields: `user_id`, `source ∈ {ranked_finish,
  mp_match_end}`, `achievements_unlocked` (array of achievement ids).
- `achievement_evaluation_skipped` — emitted by paths that deliberately
  do NOT evaluate (legacy `POST /api/scores`; `POST /api/sync` skips
  silently per its module header). Fields: `user_id`, `source` (e.g.
  `legacy_scores_post`), `mode`.

**Invariant query — should always return zero rows:**

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(7d)
| extend pino = parse_json(Log_s)
| where tostring(pino.event) == "achievement_evaluation"
| extend source = tostring(pino.source)
| where source !in ("ranked_finish", "mp_match_end")
| project TimeGenerated, container = ContainerName_s, source,
          user_id = tostring(pino.user_id),
          achievements_unlocked = pino.achievements_unlocked
| order by TimeGenerated desc
```

Any row from this query is a CS52-7 regression — a write path is calling
`checkAndUnlockAchievements` with an unsanctioned `source`. The fix is to
remove the call (the path is self-reported) or to widen the allowed-source
list here only after a code review confirms the new path is genuinely
server-validated (server-held answer key + server-derived timing).

**Daily volume sanity check (which sources are unlocking what):**

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(7d)
| extend pino = parse_json(Log_s)
| where tostring(pino.event) == "achievement_evaluation"
| extend source = tostring(pino.source),
         unlocked_count = array_length(pino.achievements_unlocked)
| summarize evaluations = count(),
            with_unlocks = countif(unlocked_count > 0)
        by bin(TimeGenerated, 1d), source
| order by TimeGenerated desc, source asc
```

Use this to confirm both expected sources keep firing post-deploy. If
`mp_match_end` drops to zero unexpectedly, suspect the WS handler; if
`ranked_finish` drops, suspect the `/finish` route.

### B.12 Multiplayer matches per config shape (CS52-7b)

`server/ws/matchHandler.js` emits one Pino INFO line per match start with the structured fields `{event: "multiplayer_match_started", match_id, room_code, config: {rounds, round_timer_ms, inter_round_delay_ms}, source}` (the human message is `"multiplayer match started"`). We key the query off `event` rather than `msg` because Pino's string-message argument always overwrites any object-level `msg` field. `source = "game_configs"` means a `game_configs.multiplayer` row supplied the values; `source = "code_default"` means the loader fell back to [`gameConfigDefaults.js`](../server/services/gameConfigDefaults.js).

Use this query to verify a config rollout (e.g., after `PUT /api/admin/game-configs/multiplayer` flips `rounds` to 7) — within seconds you should see new matches starting with the new shape:

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(24h)
| extend pino = parse_json(Log_s)
| where tostring(pino.event) == "multiplayer_match_started"
| extend rounds = toint(pino.config.rounds),
         round_timer_ms = toint(pino.config.round_timer_ms),
         inter_round_delay_ms = toint(pino.config.inter_round_delay_ms),
         source = tostring(pino.source)
| summarize matches = count(),
            first = min(TimeGenerated),
            last = max(TimeGenerated)
            by rounds, round_timer_ms, inter_round_delay_ms, source
| order by last desc
```

A healthy steady state shows one row (the canonical shape) with `source = "game_configs"` (or `"code_default"` if no row has been written for this environment). Two rows during a rollout — old shape then new shape — is the expected transitional pattern; both should disappear in favour of the new shape within a single TTL window. A persistent split with `source = "code_default"` after an admin write is the signal that the cache-bust didn't reach this revision (cross-reference § B.9 + § B.10 / Decision #10 operator caveat).

### B.12 Boot-quiet contract: unread-count cache outcomes (CS53-23)

Observes the `/api/notifications/count` endpoint's compliance with the [boot-quiet contract](../INSTRUCTIONS.md#database--data) — every authorized request that reaches the route handler and completes successfully emits a structured Pino line with `gate="boot-quiet"` and `cacheOutcome` ∈ {`HIT`, `MISS`, `MISS-NO-ACTIVITY`, `STALE-DROP`}. Requests that fail earlier in the middleware stack (401 from `requireAuth`, 503 from the cold-start init gate in `server/app.js`) never reach the handler. Requests that throw inside the handler before the log line emits (e.g. a DB error on the MISS / STALE-DROP path) are also absent here — they show up as 5xx rows in the AI `requests` table and as Pino error lines from the Express error middleware. To investigate failures, cross-reference the AI `requests` table for the same time window. Use this query to confirm:

- Boot/focus/poller traffic stays in `MISS-NO-ACTIVITY` or `HIT` (never `MISS`) — that's the "no DB wake on stale-tab traffic" guarantee.
- A spike in `MISS-NO-ACTIVITY` after a deploy means many users are loading the SPA without yet taking a real action that would seed the cache (expected on cold starts; should drop as users interact).
- Any `STALE-DROP` rows indicate the cache rejected a read's value during `setIfFresh` (concurrent-writer race OR the user's gen entry was evicted between `beginRead` and `setIfFresh`). Both outcomes are correctness-preserving; sustained STALE-DROP volume warrants looking at writer paths or eviction churn.

Runs in the **workspace** scope (uses `ContainerAppConsoleLogs_CL` directly — Pino's structured stdout). Equivalent CLI: `az monitor log-analytics query --workspace <customer-id> --analytics-query '<below>'`.

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1h)
| extend pino = parse_json(Log_s)
| where tostring(pino.gate) == "boot-quiet"
  and tostring(pino.route) == "/api/notifications/count"
| summarize count() by cacheOutcome=tostring(pino.cacheOutcome), bin(TimeGenerated, 5m)
| order by TimeGenerated desc, cacheOutcome asc
```

Healthy steady state: predominantly `HIT` (warm cache) and `MISS-NO-ACTIVITY` (cold tabs); occasional `MISS` after writers invalidate; `STALE-DROP` should be rare (single-digit per hour at most under normal user load). Empty result for >15 min on a busy environment means the route stopped being hit — investigate whether SPA is making the call at all.

To drill into a specific request, grab `trace_id` from the Pino row and feed into § B.5 to bridge to the matching AI `requests` row. Code path: [`server/routes/notifications.js`](../server/routes/notifications.js) (the `router.get('/count', ...)` handler).
### B.13 Multiplayer match persistence path (CS52-7d)

When a multiplayer match completes, [`server/ws/matchHandler.js`](../server/ws/matchHandler.js) emits one Pino INFO line with `{event: "multiplayer_match_persisted", match_id, room_code, participant_count, persistence_path}`. `persistence_path` is `"live"` for the normal (single-transaction) write of `ranked_sessions` + `ranked_session_events`, or `"pending_writes_variant_c"` when the DB was unavailable at match-end and the rows were enqueued to the durable queue (CS52-7e Variant C). The matching drain handler in [`server/services/pending-writes-replay.js`](../server/services/pending-writes-replay.js) emits `{event: "multiplayer_match_replayed", match_id, drain_request_id, participant_count}` once the queued file is replayed successfully.

Use this query to confirm that completed matches are being persisted (live path) and to spot any sustained Variant C fallback (which signals a real DB outage rather than a single cold-start blip):

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(24h)
| extend pino = parse_json(Log_s)
| where tostring(pino.event) in ("multiplayer_match_persisted", "multiplayer_match_replayed")
| extend evt = tostring(pino.event),
         path = iff(evt == "multiplayer_match_replayed", "replay", tostring(pino.persistence_path)),
         match_id = tostring(pino.match_id)
| summarize matches = dcount(match_id) by evt, path, bin(TimeGenerated, 1h)
| order by TimeGenerated desc
```

A healthy environment shows almost all rows with `evt = "multiplayer_match_persisted"` / `path = "live"`. A `pending_writes_variant_c` spike that is not followed within minutes by a matching `multiplayer_match_replayed` count is the operational signal that the drain isn't keeping up — cross-reference § B.10 (DB unavailability state transitions) and the `pending-writes-*` log family.

### B.14 Boot-quiet matrix across enrolled endpoints (CS53-19)

CS53-19 extends the boot-quiet contract from a single endpoint (`/api/notifications/count`, see § B.12) to seven endpoints that the SPA touches during boot, refresh, refocus, and bfcache restore: `/api/auth/me`, `/api/features`, `/api/notifications`, `/api/notifications/count`, `/api/scores/me`, `/api/achievements`, `/api/matches/history`. Each emits a structured Pino line on every authorized request:

```json
{ "gate": "boot-quiet", "route": "/api/scores/me", "dbTouched": false,
  "userActivity": false, "isSystem": false, "userId": 42 }
```

`dbTouched` is the single field used to verify the contract: it must be `false` for any row where `userActivity == false` AND `isSystem == false`. The exception is `/api/notifications/count` cache HIT — that route also returns `dbTouched=false` *with* the activity header, but never `true` without it.

**Verify the contract holds in the last hour:**

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1h)
| extend pino = parse_json(Log_s)
| where tostring(pino.gate) == "boot-quiet"
| extend route = tostring(pino.route),
         dbTouched = tobool(pino.dbTouched),
         userActivity = tobool(pino.userActivity),
         isSystem = tobool(pino.isSystem)
| where dbTouched == true and userActivity == false and isSystem == false
| project TimeGenerated, route, userId = tostring(pino.userId), Log_s
| order by TimeGenerated desc
```

**Zero rows is the SLO.** Any row is a contract violation — the route is touching the DB on a header-less, non-system request and must be patched in the corresponding `server/routes/*.js` handler (re-check the `bootQuietContext(req).allowDb` branch).

**Per-endpoint coverage check (are we even seeing traffic?):**

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(1h)
| extend pino = parse_json(Log_s)
| where tostring(pino.gate) == "boot-quiet"
| summarize total = count(),
            db_touched = countif(tobool(pino.dbTouched) == true),
            with_activity = countif(tobool(pino.userActivity) == true)
            by route = tostring(pino.route)
| extend pct_db_touched = round(100.0 * db_touched / total, 1)
| order by route asc
```

A route with `total == 0` means the SPA isn't reaching it (or telemetry is stalled). A route with `pct_db_touched` close to `100` means almost every caller is sending `X-User-Activity: 1` (expected on click-through endpoints). A route with `pct_db_touched` close to `0` is the boot-quiet "happy path" — most traffic is silent header-less polling.

The container-side regression test (`scripts/container-validate.js --mode=boot-quiet`) builds the same matrix from local logs and asserts header-less rows have `dbTouched=false`; the e2e regression spec (`tests/e2e/boot-quiet.spec.mjs`) does the same against the dev server.

### B.15 Auth warmup deadline exhausted (CS53-13.A)

Counts how often the client-side auth retry loop in [`public/js/app.js`](../public/js/app.js) (search for `AUTH_WARMUP_DEADLINE_MS`) ran out of its 120 s warmup budget without ever receiving a 200 from `POST /api/auth/login` or `POST /api/auth/register`. The signal is a one-shot client beacon to [`POST /api/telemetry/auth-deadline-exhausted`](../server/routes/telemetry.js) which logs a structured Pino warn line `event=auth-warmup-deadline-exhausted` server-side. This is the prerequisite signal for [CS53-13](../project/clickstops/active/active_cs53_prod-cold-start-retry-investigation.md) — that clickstop's design decision (a/b/c retry-budget UX) is deferred until ≥1 week of post-deploy data is available here.

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(7d)
| extend pino = parse_json(Log_s)
| where tostring(pino.event) == "auth-warmup-deadline-exhausted"
| summarize incidents = count(),
            avg_attempts = round(avg(toint(pino.attempts)), 1),
            avg_elapsed_ms = round(avg(toint(pino.elapsedMs)), 0),
            distinct_ips = dcount(tostring(pino.ip))
            by bin(TimeGenerated, 1d), action = tostring(pino.action)
| order by TimeGenerated desc, action asc
```

**Healthy interpretation:** <1 incident per 100 successful logins (use § B.2 to derive the login-success denominator). Sub-10 incidents/day at our current traffic level is noise — most likely a user closing the tab mid-warmup or a genuinely paused-then-resumed Free-tier DB hitting the 120 s ceiling exactly once.

**Unhealthy interpretation (investigate):**
- **Spike >5/day within 24h of a deploy** → cold-start regression; check whether `dependencies` mssql connect latency (§ B.6) crossed the 90 s mark, or whether the cold-start gate (`server/middleware/coldStartGate.js`) started returning 503 for longer than `AUTH_WARMUP_DEADLINE_MS`.
- **Sustained >10/day with no recent deploy** → Free-tier DB pause cadence may have shifted, or upstream gateway (Caddy/Azure FD) is dropping `Retry-After` headers and forcing the client into the 5 s default (see § B.4 for slow-request hunting).
- **`avg_attempts` < 3** → the loop is bailing very early — the per-attempt timeout (`AUTH_TIMEOUT_MS`) may be misconfigured, since 120 s should normally allow ≥4 attempts.
- **`action == "register"` skewed high** → register has a stricter retry policy (502/504 + AbortError don't auto-retry for idempotency) so a register-heavy distribution may indicate a different failure class than login.

**Cross-link:** the beacon is best-effort observability — IP can be spoofed and `navigator.sendBeacon` is fire-and-forget, so use this as a trend signal, not for alerting on individual incidents.

### B.16 CS53-10 simulator activation audit (must be 0 outside local validation)

The CS53-10 connect-time simulators in [`server/db/mssql-adapter.js`](../server/db/mssql-adapter.js) emit a structured Pino warn `gate=simulated-unavailable` whenever `GWN_SIMULATE_DB_UNAVAILABLE=*` or `GWN_SIMULATE_COLD_START_FAILS=N` is set in the environment. Real staging/prod must never set those env vars (they would convert the live DB into a fake-failure surface), so this query is a tripwire: if it ever returns a non-zero count for a staging or prod resource, an operator misconfigured a deployment and the corresponding revision should be rolled back immediately.

```kusto
ContainerAppConsoleLogs_CL
| where TimeGenerated > ago(7d)
| extend pino = parse_json(Log_s)
| where tostring(pino.gate) == "simulated-unavailable"
| summarize fires = count(),
            modes = make_set(tostring(pino.mode)),
            first_seen = min(TimeGenerated),
            last_seen = max(TimeGenerated)
            by bin(TimeGenerated, 1d)
| order by TimeGenerated desc
```

**Healthy interpretation (staging + prod):** zero rows. The simulators are only meant to fire under `npm run container:validate --mode={cold-start-fails,capacity-exhausted,transient}` on a developer machine.

**Unhealthy interpretation:** any non-zero count on the prod or staging AI resource → the env var was set in a real deployment. Roll back the latest revision and audit how the env var leaked in (likely a misconfigured `containerapp create/update` or compose file copy).

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


### D.1 CS52-5 unified sync (POST /api/sync)

CS52-5 emits structured pino logs at three points (see [`server/routes/sync.js`](../server/routes/sync.js)):

- `sync_request_received` — one per request, with `user_id`, `queued_count`, `revalidate_keys`.
- `sync_record_acked` — one per accepted record, with `client_game_id` and `user_id`.
- `sync_record_rejected` — one per rejected record, with `client_game_id`, `user_id`, and `reason` (`conflict_with_existing` for payload-hash mismatch on an existing `client_game_id`, `invalid_payload` for malformed `completed_at` or missing `client_game_id`).

Plus client-side `connectivity_state_transition` log lines (in browser console; visible in the App Insights `customEvents` table once CS54-9 wires the browser SDK).

The event name is carried in the structured `log.event` field (Pino's `msg` is a human-readable string like `"POST /api/sync received"`), so KQL queries below filter on `tostring(log.event)`.

#### Sync activity by user (last 24h)

```kusto
ContainerAppConsoleLogs_CL
| extend log = parse_json(Log_s)
| where tostring(log.event) == 'sync_request_received'
| where TimeGenerated > ago(24h)
| summarize requests = count(), total_queued = sum(toint(log.queued_count)), avg_queued = avg(toint(log.queued_count)) by tostring(log.user_id)
| order by requests desc
```

#### Rejected records — potential cheaters / clock-skew / corruption

```kusto
ContainerAppConsoleLogs_CL
| extend log = parse_json(Log_s)
| where tostring(log.event) == 'sync_record_rejected'
| where TimeGenerated > ago(7d)
| summarize n = count() by tostring(log.reason), tostring(log.user_id)
| order by n desc
```

#### Connectivity-state transition trends (db-unavailable spikes ⇒ Free Tier capacity issues)

Once CS54-9 wires the browser App Insights SDK, `connectivity_state_transition` events will land in `customEvents`. Until then, this query is documented for future use:

```kusto
customEvents
| where name == 'connectivity_state_transition'
| where timestamp > ago(24h)
| extend to_state = tostring(customDimensions.to), trigger = tostring(customDimensions.trigger)
| summarize n = count() by bin(timestamp, 15m), to_state
| render timechart
```

### D.2 CS52-7e `pending_writes` durable queue

CS52-7e emits four structured pino events as the queue moves through enqueue → drain → replay (or dead-letter). The signal is what tells operators the DB went unavailable, how much traffic the queue absorbed, how long replay took once the DB came back, and whether anything got stuck.

- `pending-writes: enqueued` — every `/api/sync` 202 response (Variant B) and every `/api/sessions/:id/finish` 202 response (Variant A); also CS52-7d's WS Variant C path. Carries `request_id`, `endpoint`, `user_id`, `queued_at`, `file_path`.
- `pending-writes: drain started` — once per drain pass (post-response hook on a successful API request, or the unavailability-state-cleared listener). Carries `file_count`.
- `pending-writes: replayed` — one per successfully replayed file. Carries `request_id`, `endpoint`, `replay_duration_ms`.
- `pending-writes: dead-letter` — one per file moved to `<DATA_DIR>/pending-writes/dead/`. Carries `request_id`, `endpoint`, `error_class`. **This is the alarming signal**: any non-zero rate means a queue file's replay failed in a way the drain considers non-retryable (corrupt JSON, schema mismatch, etc.).

Pino's `msg` is the human-readable form (`"pending-writes: enqueued"`), so the KQL queries below pivot on `tostring(log.event)` (e.g. `pending-writes-enqueued`).

#### Queue depth over time (enqueue vs. replay rate)

```kusto
ContainerAppConsoleLogs_CL
| extend log = parse_json(Log_s)
| where tostring(log.event) in ('pending-writes-enqueued', 'pending-writes-replayed', 'pending-writes-dead-letter')
| where TimeGenerated > ago(24h)
| summarize
    enqueued = countif(tostring(log.event) == 'pending-writes-enqueued'),
    replayed = countif(tostring(log.event) == 'pending-writes-replayed'),
    dead     = countif(tostring(log.event) == 'pending-writes-dead-letter')
  by bin(TimeGenerated, 5m)
| extend backlog_delta = enqueued - replayed - dead
| render timechart
```

Interpretation: `backlog_delta` is the per-bin change in queue depth — positive means the DB is unavailable and traffic is being absorbed; negative means a drain pass is catching up. Cumulative `sum(backlog_delta)` tracks live queue depth.

#### Drain latency distribution (per-file replay duration)

```kusto
ContainerAppConsoleLogs_CL
| extend log = parse_json(Log_s)
| where tostring(log.event) == 'pending-writes-replayed'
| where TimeGenerated > ago(24h)
| extend replay_ms = toint(log.replay_duration_ms),
         endpoint = tostring(log.endpoint)
| summarize
    p50 = percentile(replay_ms, 50),
    p95 = percentile(replay_ms, 95),
    p99 = percentile(replay_ms, 99),
    n   = count()
  by endpoint
| order by n desc
```

Interpretation: `replay_duration_ms` is the per-file work (DB transaction + I/O). Healthy values are sub-100ms; sustained >1000ms suggests the DB is in a slow-recovery state and operators should consider explicit warm-up via `POST /api/admin/init-db`.

#### Dead-letter rate (alarming)

```kusto
ContainerAppConsoleLogs_CL
| extend log = parse_json(Log_s)
| where tostring(log.event) == 'pending-writes-dead-letter'
| where TimeGenerated > ago(7d)
| summarize n = count() by tostring(log.endpoint), tostring(log.error_class), bin(TimeGenerated, 1h)
| order by TimeGenerated desc
```

Any non-zero rate is worth investigating: it means a queue file's replay failed in a way the drain decided not to retry (corrupt JSON, FK violation, missing handler). Files are preserved under `<DATA_DIR>/pending-writes/dead/<request_id>.json` for operator inspection — pull the file and replay it manually after triage.

### D.3 CS52-6 leaderboard source filter + provenance UI

CS52-6 emits structured pino logs from [`server/routes/scores.js`](../server/routes/scores.js):

- `lb_request` — one per `GET /api/scores/leaderboard*` with fields
  `{variant, source, period, row_count, user_id}`. Lets you watch source-filter
  popularity and Daily-vs-Free-Play traffic split.

The client emits `lb_filter_change` to `console.info` (JSON) when the user
flips the segmented control. Once CS54-9 wires the browser App Insights SDK,
this will land in `customEvents`.

#### Source-filter popularity (last 24h)

```kusto
ContainerAppConsoleLogs_CL
| extend log = parse_json(Log_s)
| where tostring(log.event) == 'lb_request'
| where TimeGenerated > ago(24h)
| summarize requests = count() by tostring(log.variant), tostring(log.source)
| order by requests desc
```

#### Daily vs Free Play LB traffic split

```kusto
ContainerAppConsoleLogs_CL
| extend log = parse_json(Log_s)
| where tostring(log.event) == 'lb_request'
| where TimeGenerated > ago(7d)
| where tostring(log.variant) in ('freeplay', 'daily')
| summarize n = count() by bin(TimeGenerated, 1h), tostring(log.variant)
| render timechart
```

#### Empty-result rate (signals seed/backfill issues)

```kusto
ContainerAppConsoleLogs_CL
| extend log = parse_json(Log_s)
| where tostring(log.event) == 'lb_request'
| where TimeGenerated > ago(24h)
| extend empty = toint(log.row_count) == 0
| summarize total = count(), empties = countif(empty) by tostring(log.variant), tostring(log.source)
| extend empty_pct = round(100.0 * empties / total, 1)
| order by empty_pct desc
```

#### Filter-change behaviour (post-CS54-9)

```kusto
customEvents
| where name == 'lb_filter_change'
| where timestamp > ago(7d)
| extend from_s = tostring(customDimensions.from), to_s = tostring(customDimensions.to)
| summarize n = count() by from_s, to_s
| order by n desc
```


## E. Post-deploy verification (CS41)

Every successful staging or production deploy now emits two queryable artifacts that operators can re-run after the fact:

1. **CS41-3 — AI verification (warning-only):** confirms the new revision started exporting telemetry within 10 minutes of cutover.
2. **CS41-7 — Per-deploy ingest delta:** captures total AI ingest (rows + GB) since the previous successful deploy, by `itemType`. Rendered in the deploy workflow summary AND uploaded as a 90-day artifact (`ingest-delta-<env>-<run_id>.json`).

Cross-reference: full task / acceptance-criteria detail in [`done_cs41_production-deploy-validation.md`](../project/clickstops/done/done_cs41_production-deploy-validation.md).

### E.1 CS41-3 post-deploy AI verification

This is the same query the deploy workflow runs against the just-deployed revision. To re-run it manually for a specific revision:

```kusto
requests
| where timestamp > ago(10m)
| where cloud_RoleInstance has "<NEW_REVISION_NAME>"
| summarize requests=count() by name, resultCode
| order by requests desc
```

Replace `<NEW_REVISION_NAME>` with the value from `az containerapp revision list --name gwn-production -g gwn-rg --query "[?properties.active].name" -o tsv` (or the staging app name).

**Interpreting the deploy summary annotation:**

- ✅ `AI verification: <N> requests across <M> routes` — the new revision is exporting telemetry; deploy is fully verified.
- ⚠️ `AI verification: 0 rows after 10 min wait — telemetry may be delayed; not blocking deploy` — the revision is healthy by smoke (CS41-1) and DB (CS41-4) but AI ingest hasn't caught up. This is **not a failure** per CS41-3's design (warning-only). Re-run the KQL above 5–15 min later; if still 0 rows after 30 minutes, escalate as a CS54 telemetry-export regression.
- ❌ `AI verification: query failed (<error>)` — distinct from "0 rows": the AI access path itself is broken (RBAC, network, az CLI). This DOES fail the deploy. Check the service-principal `Reader` role on `gwn-rg` (CS54-1) and the `az` CLI version pinned in the deploy YAML.

### E.2 CS41-7 per-deploy ingest delta

Rendered in `$GITHUB_STEP_SUMMARY` of every deploy workflow run AND uploaded as `ingest-delta-<env>-<run_id>.json` (90-day retention). Operators retrieve historical artifacts with:

```powershell
gh run download <run-id> --name ingest-delta-production-<run-id>
```

The underlying query, scoped to the window between the previous successful deploy and the current one:

```kusto
union *
| where timestamp between (datetime('<PREV_DEPLOY_ISO>') .. now())
| summarize gb_ingested = sum(_BilledSize) / (1024.0 * 1024.0 * 1024.0),
            rows = count() by itemType
| order by gb_ingested desc
```

Where `<PREV_DEPLOY_ISO>` is auto-derived by the workflow via `gh run list --workflow=<deploy-yaml> --status=success --limit=2 --json createdAt --jq '.[1].createdAt'` (the second-most-recent success — i.e., the deploy before this one). If no prior successful run is found, the workflow falls back to a 24-hour window and emits a `::notice::` annotation.

**Interpreting the deploy summary annotation:**

- A row per `itemType` (`requests`, `customEvents`, `dependencies`, `traces`, `exceptions`, `pageViews`, etc.) with `rows` and `gb_ingested`.
- A sudden 10×+ jump in any single `itemType` between consecutive deploys is the signal CS60 watches for ingest cost regressions; correlate against the diff between the two deploys (`git log <prev-sha>..<this-sha>`).
- Empty / missing rows for an `itemType` that is normally non-zero (e.g., `requests`) indicates a telemetry-export regression — check CS54 wiring and § E.1 above.

CS60-1/2/3 operators consume these artifacts at measurement-window time via `gh run download` rather than re-running the KQL — the artifacts are the historical record.

---

## F. CS52-4 — Client telemetry signals (Ranked + claim prompt)

CS52-4 emits structured `console.info(...)` lines from the browser. These are
not (yet) forwarded to App Insights — see § D.1 for the AI client SDK gap
(tracked under CS54-9). The signal names are stable so the queries below will
work once the bridge ships.

Signals emitted from `public/js/app.js`, `public/js/game.js`, and
`public/js/claim-modal.js`:

| Signal | Where | Payload |
| --- | --- | --- |
| `ranked_session_started` | game.js | `{ mode, sessionId }` |
| `ranked_session_abandoned_due_to_disconnect` | app.js | `{ mode, sessionId, connectivityState }` |
| `claim_prompt_shown` | claim-modal.js | `{ unattachedCount, mismatchedCount }` |
| `claim_prompt_accepted` | claim-modal.js | `{ claimedCount }` |
| `claim_prompt_declined` | claim-modal.js | `{ pendingCount }` |

### Ranked-session abandonment rate (mid-session disconnect frequency)

Once browser AI is wired, this trend reveals how often Ranked sessions die
mid-stream — a high rate suggests Free Tier connectivity instability or
auth-token expiry tuning needs revisiting.

```kusto
customEvents
| where timestamp > ago(7d)
| where name in ('ranked_session_started', 'ranked_session_abandoned_due_to_disconnect')
| summarize n = count() by bin(timestamp, 1h), name
| evaluate pivot(name, sum(n))
| extend rate = todouble(ranked_session_abandoned_due_to_disconnect) / todouble(ranked_session_started)
| render timechart
```

### Claim-prompt accept rate

```kusto
customEvents
| where timestamp > ago(30d)
| where name in ('claim_prompt_shown', 'claim_prompt_accepted', 'claim_prompt_declined')
| summarize n = count() by name
```
