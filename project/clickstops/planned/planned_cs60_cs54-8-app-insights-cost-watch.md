# CS60 — CS54-8 App Insights cost watch (post-enable measurement)

**Status:** ⬜ Planned
**Origin:** CS54-8. Filed 2026-04-25T23:25Z by yoga-gwn-c2 to make the post-enable cost-watch windows discoverable from `project/clickstops/planned/` rather than hidden inside the closed CS54 done file.
**Predecessor:** [CS54 (done)](../done/done_cs54_enable-app-insights-in-prod.md) — see [§ CS54-8 Cost watch schedule](../done/done_cs54_enable-app-insights-in-prod.md#cs54-8--cost-watch-schedule) for the original pinned schedule and KQL.

## Goal

Capture App Insights ingest volume per resource at three windows after CS54 enabled the wiring (2026-04-25), so a future operator can decide whether sampling, daily caps, or no-op is the right next move. Replaces the up-front cost guess that CS54's plan deliberately did not commit to.

## Tasks

| # | Task | Status | Date | Notes |
|---|------|--------|------|-------|
| CS60-1 | +24h measurement | ⬜ | 2026-04-26T22:39Z | Run KQL below against `gwn-ai-staging` AND `gwn-ai-production`. Append result to this file's "Measurements" table. |
| CS60-2 | +7d measurement | ⬜ | 2026-05-02T22:39Z | Same. |
| CS60-3 | +30d measurement | ⬜ | 2026-05-25T22:39Z | Same. **Decision point**: if either resource projects > 5GB/month (free-tier ceiling), file a follow-up CS for sampling and/or daily-cap configuration. If both are well under (≤ 1GB/month), close CS60 with "no action needed" and revisit CS54-9 Gap 1 (mssql exporter-edge investigation) which becomes nearly-free. |
| CS60-4 | Close CS60 | ⬜ | After CS60-3 | Move file to `done/`. Closing summary records: actuals, decision, link to any follow-up CS filed (or "none needed"). |

## KQL to run at each window

Run from Azure Portal → AI resource → Logs, or via `az monitor app-insights query --app gwn-ai-{staging,production} -g gwn-rg --analytics-query '<below>'`.

```kusto
// Adjust the ago() window to match the row in the Tasks table
union *
| where timestamp > ago(1d)
| summarize gb = sum(_BilledSize) / (1024.0 * 1024.0 * 1024.0) by itemType
| order by gb desc
```

Also useful for the +30d window (per-day breakdown to see growth shape, not just total):

```kusto
union *
| where timestamp > ago(30d)
| summarize gb_per_day = sum(_BilledSize) / (1024.0 * 1024.0 * 1024.0) by bin(timestamp, 1d), itemType
| order by timestamp asc, gb_per_day desc
```

## Measurements

| Window | Date run | `gwn-ai-staging` (GB) | `gwn-ai-production` (GB) | Notes |
|--------|----------|----------------------|-------------------------|-------|
| +24h   | _pending_ | _pending_ | _pending_ | _pending_ |
| +7d    | _pending_ | _pending_ | _pending_ | _pending_ |
| +30d   | _pending_ | _pending_ | _pending_ | Decision recorded here. |

## Acceptance criteria

- [ ] All three measurement windows executed and recorded in the table above.
- [ ] +30d decision recorded: either "no action — under free-tier" OR a link to the follow-up CS filed for sampling / daily-cap.
- [ ] If a follow-up CS is filed, CS54-9 Gap 1 (mssql exporter-edge investigation) status note is updated in the CS54 done file to reflect the new headroom data.

## Why this is a separate CS rather than staying in the CS54 done appendix

CS54 closed cleanly with verification green; the measurement work has hard date dependencies that span a full month and will be picked up by an arbitrary future orchestrator. A `planned_` file makes that work discoverable via `project/clickstops/planned/` browse and via WORKBOARD claim — the appendix-in-done pattern was chosen for the *qualitative* deferred work (CS54-9 Gaps 1-3), where the "options + recommendation" shape doesn't fit the CS task-list model. Cost measurement, by contrast, has a concrete schedule, concrete KQL, and a concrete decision point — exactly what a `planned_` clickstop is for.

CS54-9 Gaps 1, 2, 3 (mssql exporter-edge, Pino→AI traces, exceptions) intentionally remain in the [CS54 done file's Deferred Work Evaluation appendix](../done/done_cs54_enable-app-insights-in-prod.md#cs54-9--deferred-work-evaluation-appendix) per the evaluate-first deferral pattern: filing a follow-up for them today would speculate on shape (one CS vs many, fold into CS47 vs standalone) before the CS60-3 ingest data is in. Once CS60-3 lands, that decision becomes evidence-based.
