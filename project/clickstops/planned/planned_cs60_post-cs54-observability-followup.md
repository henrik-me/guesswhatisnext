# CS60 — Post-CS54 observability follow-up (cost watch + deferred-gap decisions)

**Status:** ⬜ Planned
**Origin:** CS54 closed cleanly with verification green, but left four pieces of work that were not actionable on close-out day:
- 3 cost-measurement windows that depend on calendar dates (+24h / +7d / +30d after enable).
- 3 qualitative observability gaps (`dependencies` / `traces` / `exceptions` tables) where the right answer depends on what the +30d cost measurement says about ingest headroom.

CS60 carries all of that forward as discoverable, claimable tasks. CS60 was filed 2026-04-25T23:35Z by yoga-gwn-c2 in response to the policy clarification that **all deferred items must be in a CS — not in an appendix in a done file** — so a future operator browsing `project/clickstops/planned/` sees this work without having to know to read CS54''s done file.

**Predecessor:** [CS54 (done)](../done/done_cs54_enable-app-insights-in-prod.md). The qualitative analysis for CS60-4/5/6 lives in [§ CS54-9 Deferred Work Evaluation appendix](../done/done_cs54_enable-app-insights-in-prod.md#cs54-9--deferred-work-evaluation-appendix) — read it before claiming any of those tasks; it documents the options + recommendations that CS60 implements (or rejects, with rationale).

## Goal

Resolve every piece of observability follow-up from CS54 to either ✅ done, ✅ no-action-needed (with rationale), or ✅ split-into-new-CS (with link). Nothing that was deferred from CS54 may end CS60 in an "unaddressed" state.

## Tasks

| # | Task | Status | Date / trigger | Notes |
|---|------|--------|---------------|-------|
| CS60-1 | +24h cost measurement: run KQL below against `gwn-ai-staging` AND `gwn-ai-production`. Append result to "Measurements" table below. | ⬜ | 2026-04-26T22:39Z | Replaces CS54-8 first window. |
| CS60-2 | +7d cost measurement | ⬜ | 2026-05-02T22:39Z | Replaces CS54-8 second window. |
| CS60-3 | +30d cost measurement. **Decision point**: record headroom-vs-5GB-free-tier conclusion. This is the input that CS60-4 / CS60-5 / CS60-6 wait on. | ⬜ | 2026-05-25T22:39Z | Replaces CS54-8 third window. |
| CS60-4 | **Gap 1 — `dependencies` table investigation.** The CS54 done file (Gap 1 + the post-close finding) shows the local OTLP collector receives `execSql gwn` (kind=CLIENT) spans from the `tedious` driver, but `gwn-ai-staging`''s `dependencies` table was empty during CS54-6 verification. Investigate the exporter edge: (a) probe `gwn-ai-staging` with ≥ 20 leaderboard requests; (b) re-run `dependencies | where timestamp > ago(1h)`; (c) if still empty, inspect `instrumentationLibrary.name` on the local `execSql` spans to confirm whether the filter in [`server/telemetry.js:23-27`](../../../server/telemetry.js) drops them on the way to AzMonitorTraceExporter; (d) if filter widening is needed, ship it gated behind container:validate. **Decide-then-do**: if CS60-3 shows headroom > 4GB/month, implement; if headroom ≤ 1GB/month, defer to a future CS and close this task with rationale; if 1-4GB, sample the exporter rather than full-export. | ⬜ | After CS60-3 | Reads from CS54-9 Gap 1 + the post-close finding. |
| CS60-5 | **Gap 2 — `traces` table (Pino → AI log forwarding).** CS54-9 Gap 2 recommendation was "stay on cross-table KQL bridge until an incident proves it inadequate." Re-evaluate that recommendation in light of: (a) CS60-3 headroom data; (b) any incident-investigation sessions that ran the bridge query between 2026-04-25 and CS60-3 close. If no incidents proved the bridge inadequate, close as "decided not to do — bridge query in `docs/observability.md` § B.5 is sufficient." If even one incident hit the bridge wall, file a follow-up CS for one of the two implementation options (Pino transport vs OTel logs SDK) — pick based on whichever option the incident artifact most clearly supports. | ⬜ | After CS60-3 | Reads from CS54-9 Gap 2. |
| CS60-6 | **Gap 3 — `exceptions` table (typed stack traces).** CS54-9 Gap 3 explicitly depends on the Gap 2 (CS60-5) decision. If CS60-5 implements log forwarding via Option A (Pino transport) and Pino''s `err` field flows through, this is mostly free → close as "decided not to do — covered by CS60-5." If CS60-5 closes as "no action," then this task implements Option A from Gap 3 (explicit `trackException` calls in the error-handler middleware at [`server/app.js:457`](../../../server/app.js) + a global `unhandledRejection` / `uncaughtException` handler). | ⬜ | After CS60-5 | Reads from CS54-9 Gap 3. |
| CS60-7 | Close CS60. Move file to `done/`. Closing summary records: cost-watch actuals; for each of CS60-4/5/6, the resolution (implemented / split-out / cancelled-with-reason); link back to CS54-9 appendix; update CONTEXT.md if any of the implementations affects architecture. | ⬜ | After CS60-4/5/6 all closed | Standard close-out. |

## KQL — cost measurement (CS60-1, CS60-2, CS60-3)

Run from Azure Portal → AI resource → Logs, or via CLI:

```powershell
az monitor app-insights query --app gwn-ai-staging    -g gwn-rg --analytics-query ''<below>''
az monitor app-insights query --app gwn-ai-production -g gwn-rg --analytics-query ''<below>''
```

```kusto
// Adjust the ago() window to match the row in the Tasks table (1d / 7d / 30d).
union *
| where timestamp > ago(1d)
| summarize gb = sum(_BilledSize) / (1024.0 * 1024.0 * 1024.0) by itemType
| order by gb desc
```

For CS60-3 (+30d) also run the per-day breakdown to see growth shape, not just total:

```kusto
union *
| where timestamp > ago(30d)
| summarize gb_per_day = sum(_BilledSize) / (1024.0 * 1024.0 * 1024.0) by bin(timestamp, 1d), itemType
| order by timestamp asc, gb_per_day desc
```

## KQL — Gap 1 investigation (CS60-4)

After hitting `gwn-ai-staging` with ≥ 20 `/api/scores/leaderboard` probes:

```kusto
// Did dependencies finally populate?
dependencies
| where timestamp > ago(15m)
| summarize count() by type, name
| order by count_ desc
```

If empty, pull the local span shape for comparison (run from a `dev:mssql` container):

```bash
docker cp <collector-container>:/data/traces.json /tmp/traces.json
# Then in Node or jq, look at resourceSpans[].scopeSpans[].scope.name on the execSql spans
# to see what instrumentationLibrary.name AzMonitorTraceExporter would filter on.
```

## Measurements

| Window | Date run | `gwn-ai-staging` (GB) | `gwn-ai-production` (GB) | Notes |
|--------|----------|----------------------|-------------------------|-------|
| +24h   | _pending_ | _pending_ | _pending_ | _pending_ |
| +7d    | _pending_ | _pending_ | _pending_ | _pending_ |
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
