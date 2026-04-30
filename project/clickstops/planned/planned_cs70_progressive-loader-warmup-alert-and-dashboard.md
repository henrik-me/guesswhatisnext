# CS70 — Progressive Loader Warmup Alert And Dashboard

**Status:** ⬜ Planned
**Depends on:** CS47 (telemetry pipeline shipped + validated end-to-end against staging AI), AND a healthy Azure SQL state for ≥1 week to gather baseline prod data
**Parallel-safe with:** any CS not touching `infra/`, `docs/observability.md`, or the same telemetry route
**Earliest claim date:** 7 days after CS47 merges AND Azure SQL has been out of capacity-exhausted state for ≥7 days. If both conditions are not met, claiming early produces threshold values that will either page constantly or never fire.
**Origin:** Carved out of CS47 on 2026-04-29 by `yoga-gwn-c5`. CS47 originally bundled the alert (was CS47-4) and dashboard (was CS47-5) with the telemetry pipeline. Both depend on a baseline week of real prod data to make any threshold or panel decisions meaningful — and that data cannot be gathered while Azure SQL is in capacity-exhausted state. Splitting CS70 out lets CS47 ship the pipeline now (DB-independent, validated locally + against staging AI) and defers alert/dashboard work to when the data exists.

## Goal

Once ≥1 week of `progressiveLoader.warmupExhausted` events have accumulated in the production Application Insights resource (`gwn-ai-production`) with a healthy Azure SQL backend, design and provision:

1. An Azure Monitor scheduled query rule that pages a human when the cap-exhaustion rate exceeds an empirically-set threshold.
2. An Azure Monitor workbook that surfaces warmup-retry volume, latency percentiles, cap-exhaustion rate, and per-screen breakdown.

## Pre-flight (do this before claiming)

1. **CS47 merged?** Confirm `project/clickstops/done/done_cs47_*.md` exists. If CS47 is still active or planned, do not claim CS70.
2. **≥1 week of data?** Run the CS47-5 KQL against `gwn-ai-production`'s `customEvents` (or `ContainerAppConsoleLogs_CL`) for the last 7 days. If row count < ~20 events OR if all events are from one revision (suggesting a deploy artifact, not steady traffic), wait longer.
3. **Azure SQL healthy?** Confirm Azure SQL Free Tier is not in `paused for the remainder of the month` state — see CS53 § Azure SQL Free Tier capacity exhaustion. If unhealthy, the warmup path's behavior is dominated by capacity exhaustion (not real cold-start), and threshold tuning will be wrong.
4. **WORKBOARD check:** confirm no other agent claimed CS70 or has an open row touching `infra/` alert provisioning.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS70-1 | Baseline data analysis | ⬜ Pending | Pull 7 days of `progressiveLoader.warmupExhausted` events from `gwn-ai-production`. Compute per-day count, per-screen breakdown, p50/p95/p99 of `totalWaitMs`, cap-exhaustion rate. Capture the table in this CS file as the "baseline" appendix. |
| CS70-2 | Threshold decision | ⬜ Pending | Based on CS70-1, choose: (a) the alert window (proposed: 15 min rolling) and (b) the threshold N for cap-exhaustion count that constitutes "page a human". Rule of thumb: 3× the observed p99 per-window count. Document the choice + reasoning so future tuning has context. |
| CS70-3 | Provision Action Group | ⬜ Pending | Create or reuse an Azure Monitor Action Group with at minimum an email recipient. SMS / Slack webhook / Teams optional — needs operator decision (ask user). Document the AG name + recipient in `infra/` (link, don't restate the email address — pull it from `az monitor action-group show`). |
| CS70-4 | Provision scheduled query rule (alert) | ⬜ Pending | Create the Azure Monitor scheduled query rule with the threshold from CS70-2 and the AG from CS70-3. KQL filters `customDimensions.environment in ('staging','production')` so dev/local-container traffic never trips it. **Initial state: non-required / sev 3 (informational)** for ≥1 week soak before promoting to sev 2. Document the rule + KQL + threshold in `infra/` and link from `docs/observability.md`. |
| CS70-5 | Workbook / dashboard | ⬜ Pending | Azure Monitor workbook with panels: (a) warmup volume over time (1h bins, by outcome); (b) p50/p95 of `totalWaitMs` (1h bins); (c) cap-exhaustion rate (1h bins); (d) per-screen breakdown (table); (e) deploy-correlation overlay if cheap to add. Pin to the resource group's portal dashboard. Link from `docs/observability.md`. |
| CS70-6 | Soak ≥1 week as sev 3 | ⬜ Pending | Watch the alert. Catalog false positives. Tighten threshold or KQL filters as needed. |
| CS70-7 | Promote to sev 2 + close | ⬜ Pending | Once soak is clean, promote alert severity. Move CS70 to `done/`. Remove from WORKBOARD. |

## Cost

| Component | Monthly est. (East US PAYG, current pricing) |
|---|---|
| Log ingestion (CS47 events) | ≪ $0.20 (already counted in CS47) |
| Scheduled query rule (1 rule, 5-min eval) | ~$1.50 |
| Action Group: email | $0 |
| Action Group: SMS | $0.05–$0.30 per message (only if alert fires) |
| Workbook | $0 (queries on view, ingestion already paid) |
| **Total CS70 marginal cost** | **~$1.50–$2/month** |

Budget is negligible; the threshold for caring about Azure Monitor cost in this app is ~$10/month.

## Acceptance

- A scheduled query rule exists in `gwn-ai-production` (or its parent workspace) with the documented KQL and threshold.
- The rule's KQL filters out `environment` ∉ {`staging`, `production`} so local-container and dev traffic never trip it.
- An Action Group with at least one human-routed recipient is wired to the rule.
- A workbook exists and is pinned to a portal dashboard.
- `docs/observability.md` § B.x carries the alert KQL + workbook link + healthy/unhealthy interpretation paragraphs.
- A ≥1 week clean soak at sev 3 has been recorded before promotion to sev 2.

## Will not be done as part of this clickstop

- Any change to the CS47 telemetry pipeline (route, client emission, schema) — that's a CS47 follow-up if found broken during baseline analysis.
- Alerts on other ProgressiveLoader signals (e.g. abort outcome) — file separately if they prove valuable.
- Cross-app dashboards spanning prod + staging — the existing per-resource investigation pattern in `docs/observability.md` § C is intentional; do not reverse it here.

## Cross-references

- [CS47 (active → soon done) — Progressive Loader Telemetry](../active/active_cs47_progressive-loader-telemetry.md) (will be in `done/` by the time CS70 is claimed)
- CS54-9 (deferred) — Pino → AI log forwarding gap; if that closes, CS70's KQL may unify Pino + OTel paths.
- `docs/observability.md` § B.15 — auth-warmup-deadline-exhausted is the closest existing precedent for the alert design.
