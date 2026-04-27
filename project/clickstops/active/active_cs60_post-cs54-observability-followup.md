# CS60 — Post-CS54 observability follow-up (cost watch + deferred-gap decisions)

**Status:** 🟡 Active — claimed by yoga-gwn-c3 on 2026-04-26T23:50Z. Long-lived CS (open through ~2026-05-25 for CS60-3 +30d window).
**Origin:** CS54 closed cleanly with verification green, but left four pieces of work that were not actionable on close-out day:
- 3 cost-measurement windows that depend on calendar dates (+24h / +7d / +30d after enable).
- 3 qualitative observability gaps (`dependencies` / `traces` / `exceptions` tables) where the right answer depends on what the +30d cost measurement says about ingest headroom.

CS60 carries all of that forward as discoverable, claimable tasks. CS60 was filed 2026-04-25T23:35Z by yoga-gwn-c2 in response to the policy clarification that **all deferred items must be in a CS — not in an appendix in a done file** — so a future operator browsing `project/clickstops/planned/` sees this work without having to know to read CS54''s done file.

**Predecessor:** [CS54 (done)](../done/done_cs54_enable-app-insights-in-prod.md). The qualitative analysis for CS60-4/5/6 lives in [§ CS54-9 Deferred Work Evaluation appendix](../done/done_cs54_enable-app-insights-in-prod.md#cs54-9--deferred-work-evaluation-appendix) — read it before claiming any of those tasks; it documents the options + recommendations that CS60 implements (or rejects, with rationale).

**Companion data file:** [`cs60-data-appendix.md`](cs60-data-appendix.md) is the durable, append-only record of empirical observability data — baseline from CS54-6, per-deploy ingest summaries appended by CS41 deploys, the windowed measurements for CS60-1/2/3, and CS60-4/5/6 disposition evidence. CS60's task descriptions point at sections of that file for actual recording of values; CS60 itself stays a planning doc.

## Goal

Resolve every piece of observability follow-up from CS54 to either ✅ done, ✅ no-action-needed (with rationale), or ✅ split-into-new-CS (with link). Nothing that was deferred from CS54 may end CS60 in an "unaddressed" state.

## Tasks

| # | Task | Status | Date / trigger | Notes |
|---|------|--------|---------------|-------|
| CS60-1 | (umbrella) +24h cost-watch window. Split into daily sub-tasks CS60-1a..CS60-1n, one per UTC day from baseline (2026-04-25) through the +24h marker. | 🟡 In progress | 2026-04-26T22:39Z | Replaces CS54-8 first window. Per-day split lets each day's measurement land independently and survives noisy/active days without blocking the next. |
| CS60-1a | Day 0 — 2026-04-25 (baseline + activation day). Run [§ Daily KQL](#kql--cost-measurement-cs60-1-cs60-2-cs60-3) against `gwn-ai-staging` + `gwn-ai-production`. Append daily row to data appendix. Compare to CS54-6 baseline. | ⬜ | After CS60 claim | Backfill — captured retroactively on CS60-1a-execution day. |
| CS60-1b | Day 1 — 2026-04-26 (today, +24h). Same KQL pattern as CS60-1a. **Cost comparison vs Day 0 + cumulative since baseline.** | ⬜ | 2026-04-26T22:39Z | Original CS60-1 trigger — this is the canonical "+24h" measurement. |
| CS60-2 | (umbrella) +7d cost-watch window. Daily sub-tasks CS60-2c..CS60-2h (Day 2 = 2026-04-27 through Day 7 = 2026-05-02). Same daily KQL; CS60-2h carries the canonical "+7d" interpretation. | ⬜ | 2026-04-27T22:39Z..2026-05-02T22:39Z | Replaces CS54-8 second window. |
| CS60-3 | (umbrella) +30d cost-watch window. Daily sub-tasks CS60-3i..CS60-3{?} for Day 8..Day 30 (2026-05-03..2026-05-25). CS60-3{Day30} is the **decision point**: record headroom-vs-5GB-free-tier conclusion. This is the input that CS60-4 / CS60-5 / CS60-6 wait on. | ⬜ | 2026-05-03T22:39Z..2026-05-25T22:39Z | Replaces CS54-8 third window. Daily cadence avoids the "skip 23 days then panic" failure mode. |
| CS60-4 | **Gap 1 — `dependencies` table investigation.** The CS54 done file (Gap 1 + the post-close finding) shows the local OTLP collector receives `execSql gwn` (kind=CLIENT) spans from the `tedious` driver, but `gwn-ai-staging`''s `dependencies` table was empty during CS54-6 verification. Investigate the exporter edge: (a) probe `gwn-ai-staging` with ≥ 20 leaderboard requests; (b) re-run `dependencies | where timestamp > ago(1h)`; (c) if still empty, inspect `instrumentationLibrary.name` on the local `execSql` spans to confirm whether the filter in [`server/telemetry.js:23-27`](../../../server/telemetry.js) drops them on the way to AzMonitorTraceExporter; (d) if filter widening is needed, ship it gated behind container:validate. **Decide-then-do**: if CS60-3 shows headroom > 4GB/month, implement; if headroom ≤ 1GB/month, defer to a future CS and close this task with rationale; if 1-4GB, sample the exporter rather than full-export. | ⬜ | After CS60-3 | Reads from CS54-9 Gap 1 + the post-close finding. |
| CS60-5 | **Gap 2 — `traces` table (Pino → AI log forwarding).** CS54-9 Gap 2 recommendation was "stay on cross-table KQL bridge until an incident proves it inadequate." Re-evaluate that recommendation in light of: (a) CS60-3 headroom data; (b) any incident-investigation sessions that ran the bridge query between 2026-04-25 and CS60-3 close. If no incidents proved the bridge inadequate, close as "decided not to do — bridge query in `docs/observability.md` § B.5 is sufficient." If even one incident hit the bridge wall, file a follow-up CS for one of the two implementation options (Pino transport vs OTel logs SDK) — pick based on whichever option the incident artifact most clearly supports. | ⬜ | After CS60-3 | Reads from CS54-9 Gap 2. |
| CS60-6 | **Gap 3 — `exceptions` table (typed stack traces).** CS54-9 Gap 3 explicitly depends on the Gap 2 (CS60-5) decision. If CS60-5 implements log forwarding via Option A (Pino transport) and Pino''s `err` field flows through, this is mostly free → close as "decided not to do — covered by CS60-5." If CS60-5 closes as "no action," then this task implements Option A from Gap 3 (explicit `trackException` calls in the error-handler middleware at [`server/app.js:457`](../../../server/app.js) + a global `unhandledRejection` / `uncaughtException` handler). | ⬜ | After CS60-5 | Reads from CS54-9 Gap 3. |
| CS60-7 | Close CS60. Move file to `done/`. Closing summary records: cost-watch actuals; for each of CS60-4/5/6, the resolution (implemented / split-out / cancelled-with-reason); link back to CS54-9 appendix; update CONTEXT.md if any of the implementations affects architecture. | ⬜ | After CS60-4/5/6 all closed | Standard close-out. |

## KQL — cost measurement (CS60-1, CS60-2, CS60-3)

> **CS60-1a finding (2026-04-26):** Both `gwn-ai-staging` and `gwn-ai-production` are **workspace-mode** App Insights components (`ingestionMode: LogAnalytics`, both pointing at `workspace-gwnrg6bXt`). The original CS60 KQL using `union *` and the classic `requests` / `dependencies` / `_BilledSize` table names returns **0 rows** in this mode — workspace-based AI re-homes data into `AppRequests` / `AppDependencies` / `AppTraces` / `AppExceptions` / `AppMetrics` / `AppPageViews` / `AppBrowserTimings` / `AppAvailabilityResults` / `AppSystemEvents` in the linked Log Analytics workspace, and `union *` over the AI scope does not reach them. Query the workspace directly via `az monitor log-analytics query`. KQL below is the corrected form.

### Per-day daily measurement (CS60-1a..CS60-3{Day30})

Resolve the workspace customerId once, then run the daily query. Replace `<workspace-customer-id>` with the result.

```powershell
az monitor log-analytics workspace show `
  --ids /subscriptions/<sub>/resourceGroups/gwn-rg/providers/Microsoft.OperationalInsights/workspaces/workspace-gwnrg6bXt `
  --query customerId -o tsv

$cust = '<workspace-customer-id>'
$kql = 'union withsource=Tbl AppRequests, AppDependencies, AppTraces, AppExceptions, AppPerformanceCounters, AppMetrics, AppPageViews, AppBrowserTimings, AppAvailabilityResults, AppSystemEvents | where TimeGenerated > ago(2d) | summarize bytes = sum(_BilledSize), rows = count() by _ResourceId, day = bin(TimeGenerated, 1d), Tbl | order by day asc, _ResourceId asc, bytes desc'
az monitor log-analytics query --workspace $cust --analytics-query $kql -o json
```

The `2d` window is enough overlap for daily ingestion to be complete (Azure ingestion lag is typically < 5 min, can spike to ~15 min). For CS60-3 +30d, change to `30d`.

### Whole-workspace cost (CS60-3 final decision)

The 5 GB free tier is **per workspace**, not per AI component. App Insights tables are usually a small slice of total ingest — `ContainerAppSystemLogs_CL` and `ContainerAppConsoleLogs_CL` typically dominate. Run this against the workspace at +30d before drawing free-tier-headroom conclusions:

```powershell
az monitor log-analytics query --workspace $cust --analytics-query 'union withsource=Tbl * | where TimeGenerated > ago(30d) | summarize bytes = sum(_BilledSize), rows = count() by Tbl | order by bytes desc' -o json
```

### Per-day shape (CS60-3 growth-trend look)

```powershell
az monitor log-analytics query --workspace $cust --analytics-query 'union withsource=Tbl * | where TimeGenerated > ago(30d) | summarize bytes = sum(_BilledSize) by Tbl, day = bin(TimeGenerated, 1d) | order by day asc, bytes desc' -o json
```

## KQL — Gap 1 investigation (CS60-4)

> **Note:** because both AI components are workspace-mode (see § KQL — cost measurement), Gap 1 must be queried via the workspace `AppDependencies` table — the classic `dependencies` table on the AI scope returns 0 rows in workspace mode and would produce a false-empty result that drives an incorrect CS60-4 disposition.

After hitting `gwn-ai-staging` with ≥ 20 `/api/scores/leaderboard` probes, run against the workspace:

```powershell
$cust = '<workspace-customer-id>'   # see § KQL — cost measurement for how to resolve
az monitor log-analytics query --workspace $cust --analytics-query 'AppDependencies | where TimeGenerated > ago(15m) and _ResourceId has "gwn-ai-staging" | summarize n = count() by Type, Name | order by n desc' -o json
```

If empty, pull the local span shape for comparison (run from a `dev:mssql` container):

```bash
docker cp <collector-container>:/data/traces.json /tmp/traces.json
# Then in Node or jq, look at resourceSpans[].scopeSpans[].scope.name on the execSql spans
# to see what instrumentationLibrary.name AzMonitorTraceExporter would filter on.
```

## Measurements

Daily detail lives in [`cs60-data-appendix.md`](cs60-data-appendix.md). Roll-up summary:

| Window | Date run | `gwn-ai-staging` (MB) | `gwn-ai-production` (MB) | Notes |
|--------|----------|----------------------|-------------------------|-------|
| +24h   | 2026-04-26 (CS60-1a/1b) | _see appendix_ | _see appendix_ | KQL bug fixed mid-execution; appendix has corrected workspace-tables data. |
| +7d    | _pending_ | _pending_ | _pending_ | _pending — daily ticks via CS60-2c..2h_ |
| +30d   | _pending_ | _pending_ | _pending_ | Decision recorded here. Drives CS60-4/5/6. |

## Acceptance criteria

- [ ] All three measurement windows (CS60-1/2/3) executed and recorded in the Measurements table.
- [ ] CS60-3 +30d decision recorded (free-tier headroom: ≤ 1GB / 1-4GB / > 4GB).
- [ ] CS60-4 (`dependencies` investigation): closed as one of {implemented, sampled, deferred-with-rationale, no-op-with-rationale}. Local + staging + prod telemetry validation per [INSTRUCTIONS.md § 4a](../../../INSTRUCTIONS.md#4a-telemetry--observability-mandatory-for-all-new-work) if implemented.
- [ ] CS60-5 (`traces` table): closed as one of {implemented-via-PinoTransport, implemented-via-OTelLogs, deferred-to-new-CS-with-link, decided-not-to-do-with-rationale}.
- [ ] CS60-6 (`exceptions` table): closed as one of {free-from-CS60-5, implemented-via-trackException, deferred, decided-not-to-do-with-rationale}.
- [ ] No CS54-9 deferred item ends CS60 in an unaddressed state.

## Why CS60 covers all four work items rather than splitting them

Per the project rule that **all deferred items must be in a CS** (current / new / another existing — or explicitly cancelled), the CS54-9 appendix-in-done-file pattern was insufficient because it hid the work from `project/clickstops/planned/` browse. CS60 folds everything together because the four items have a shared decision dependency: CS60-3''s ingest headroom number is what makes CS60-4/5/6 actionable. Splitting them into four separate `planned_` files would create the same lost-context risk in reverse — a future orchestrator picking up "Gap 2 traces" would have to manually correlate it with the cost-watch CS to know whether to implement.

If CS60-4 / CS60-5 / CS60-6 turn out to need significant implementation rather than a "decide and close" disposition, each splits off into its own dedicated CS at that point — recorded in CS60-7''s closing summary and linked from there.
