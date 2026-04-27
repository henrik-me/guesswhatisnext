# CS60 — Data Appendix (cost & telemetry actuals)

**Status:** companion to [`active_cs60_post-cs54-observability-followup.md`](active_cs60_post-cs54-observability-followup.md). Travels with CS60 through its lifecycle (planned → active → done).
**Purpose:** durable, append-only record of empirical observability data captured by CS41 deploys and CS60 measurement windows. Keeping it as a separate file (rather than inline in CS60) keeps CS60's plan readable while allowing this file to grow large over time without bloating the planning doc.

**Read order:** check the [Manifest](#manifest) below to find the most recent measurement, then jump to the relevant section. The Manifest is the single source of truth for what's recorded; sections may be appended out of strict chronological order.

---

## Manifest

| Window / event | Date (UTC) | Captured by | Section |
|---|---|---|---|
| _baseline_ | 2026-04-25T22:39Z (CS54-6 verification) | yoga-gwn-c2 | [§ Baseline (CS54-6)](#baseline-cs54-6) |
| Day 0 — 2026-04-25 (CS60-1a, backfill) | captured 2026-04-26T23:50Z | yoga-gwn-c3 | [§ Day 0 — 2026-04-25 (CS60-1a)](#day-0--2026-04-25-cs60-1a) |
| Day 1 — 2026-04-26 (CS60-1b, +24h) | captured 2026-04-26T23:50Z | yoga-gwn-c3 | [§ Day 1 — 2026-04-26 (CS60-1b)](#day-1--2026-04-26-cs60-1b) |
| +7d cost measurement | 2026-05-02T22:39Z | _pending — CS60-2_ | _to be appended (daily ticks via CS60-2c..2h)_ |
| +30d cost measurement | 2026-05-25T22:39Z | _pending — CS60-3_ | _to be appended (daily ticks via CS60-3i..)_ |
| Per-deploy ingest summary (rolling) | continuous from CS41 land | _pending — CS41 deploy summary_ | [§ Per-deploy ingest summary](#per-deploy-ingest-summary) |

---

## Baseline (CS54-6)

Captured during the CS54-6 end-to-end verification on 2026-04-25T22:39Z. This is the "first traffic" baseline — the first 5 probes after each environment had its AI wiring activated.

| Environment | Probes | `requests` rows captured | First-row latency from probe → AI |
|---|---|---|---|
| `gwn-ai-staging` | 5 (1 healthz + 1 health + 3 leaderboard) | 5 | < 5 min (within first KQL window) |
| `gwn-ai-production` | 5 (1 healthz + 1 health + 3 leaderboard) | 5 | < 5 min (within first KQL window) |

Span shape (from local validation, expected to match prod): 76 spans per 5-probe set in the local OTLP collector, broken down as 30 middleware-patched + 8 middleware-anonymous + 6 request-handler + 4 execSql (kind=CLIENT) + 4 misc middleware + 4 result middleware + 2 healthz handler + 2 health handler + 2 router + 2 GET-leaderboard server spans + service-info spans.

The local `execSql` count (4 per leaderboard request) is the unverified-in-prod data point that CS60-4 investigates.

---

## Per-deploy ingest summary

> **Correction (CS60-1a, 2026-04-26):** the original wording in this section claimed CS41-7 (now landed in `done_cs41_*`) "appends a section here" automatically from the deploy workflow. That is incorrect. Per [`done_cs41_production-deploy-validation.md`](../done/done_cs41_production-deploy-validation.md) and [`scripts/compute-ingest-delta.js`](../../../scripts/compute-ingest-delta.js), CS41-7 emits the per-deploy ingest delta as a **GitHub Actions workflow summary + 90-day workflow artifact** — branch protection prevents workflows from writing to `main`, so nothing auto-commits to this file. Operators may manually transcribe selected artifact summaries here if a particular deploy's data is useful for cross-window cost analysis (e.g. the CS60-3 +30d decision).

Recommended format if transcribing manually:

```markdown
### Deploy <ISO-timestamp> — <revision-name>

| Field | Value |
|---|---|
| Environment | `gwn-staging` or `gwn-production` |
| Image SHA | `<40-char-sha>` |
| Workflow run | <link to actions run> |
| AI ingest since previous deploy | `<X.Y MB requests + W.Z MB other>` |
| `requests` rows since previous deploy | `<N>` |
| Source artifact | <link to workflow run artifact> |
```

The first such transcription, if anyone makes one, will be a deploy after CS41 landed; everything before it is captured in the Baseline section above.

---

## CS60 windowed measurements

CS60-1, CS60-2, CS60-3 each append a section here with:

```markdown
### +<window> measurement — <date> — captured by <agent-id>

#### gwn-ai-staging
| Metric | Value |
|---|---|
| `union * | summarize gb = sum(_BilledSize) / (1024^3) by itemType` | (table) |
| Total ingest in window | `<X.Y> GB` |
| Daily run-rate | `<X.Y> GB/day` |
| Projected monthly | `<X.Y> GB/month` |
| Free-tier headroom (5 GB) | `<remaining>` |

#### gwn-ai-production
(same shape)

**Decision (CS60-3 only):** _to be filled at +30d window_
```

CS60-1/2/3 task descriptions in [`active_cs60_post-cs54-observability-followup.md`](active_cs60_post-cs54-observability-followup.md#tasks) point here for the actual recording of values.

---

### Day 0 — 2026-04-25 (CS60-1a)

**Captured:** 2026-04-26T23:50Z by yoga-gwn-c3 (backfill).
**Window:** UTC day 2026-04-25 (partial — AI activation occurred mid-day, baseline marker 2026-04-25T22:39Z per CS54-6).
**KQL bug (refined finding):** the original CS60 plan KQL (`union * | … _BilledSize` against the AI scope) returned 0 rows when run against `gwn-ai-staging`. Initial hypothesis was "workspace-mode breaks classic AI-scope queries", but follow-up testing showed the same classic `requests | take 5` query **works fine against `gwn-ai-production`** even though both AI components are workspace-mode (`ingestionMode: LogAnalytics`) and both point at the same workspace `workspace-gwnrg6bXt` (customerId `ca1b90db-504b-4771-bfeb-5e4a6bb62422`). So the real situation is: **staging-only AI-scope query asymmetry, root cause unknown** (tracked under CS60-4 Gap-1 investigation). The operational workaround is to query the workspace directly via `az monitor log-analytics query` against the workspace customerId — that pattern works reliably for both envs and is what CS60's corrected KQL uses.

#### App Insights tables — Day 0

| env | Table | rows | MB billed |
|---|---|---:|---:|
| staging | AppDependencies | 892 | 0.66 |
| staging | AppRequests | 73 | 0.06 |
| staging | AppMetrics | 56 | 0.05 |
| prod | AppDependencies | 110 | 0.08 |
| prod | AppRequests | 8 | 0.01 |
| prod | AppMetrics | 3 | 0.00 |

| env | Day 0 AI total (MB) |
|---|---:|
| staging | **0.77** |
| prod | **0.09** |

**Notes**
- Day-0 staging dominates because CS54-6 verification + CS58 scale-to-zero work both happened on staging that day. Prod was barely touched until late 22:28Z.
- No `AppExceptions`, `AppTraces`, `AppPageViews`, `AppBrowserTimings`, `AppAvailabilityResults`, or `AppSystemEvents` rows on Day 0.

---

### Day 1 — 2026-04-26 (CS60-1b)

**Captured:** 2026-04-26T23:50Z by yoga-gwn-c3 (canonical "+24h" window per original CS60-1 trigger).
**Window:** UTC day 2026-04-26 (partial — captured at ~T23:50Z, ~10 min before day end).

#### App Insights tables — Day 1

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 943 | 0.70 |
| prod | AppRequests | 81 | 0.07 |
| prod | AppMetrics | 15 | 0.01 |
| staging | AppDependencies | 137 | 0.10 |
| staging | AppRequests | 9 | 0.01 |
| staging | AppMetrics | 2 | 0.00 |

| env | Day 1 AI total (MB) |
|---|---:|
| prod | **0.78** |
| staging | **0.11** |

**Cumulative since baseline (Day 0 + Day 1)**

Window basis: baseline marker `2026-04-25T22:39Z` → capture `2026-04-26T23:50Z` = **25.18 hours elapsed**. Run-rate uses `MB / 25.18 × 24`; monthly uses `run-rate × 30`. Both are best-effort point estimates from a partial-window sample — refine at CS60-1c (full Day 2) and revisit at CS60-2h (+7d).

| env | rows | MB | Run-rate (MB/day) | Projected monthly (MB) |
|---|---:|---:|---:|---:|
| staging | 1003 | 0.88 | ≈0.84 | ≈25 |
| prod    | 1160 | 0.87 | ≈0.83 | ≈25 |

**Free-tier headroom (5 GB / month workspace cap, AI tables only):** ≫ 4 GB headroom in both envs at current run-rate (~0.5% of cap).

#### ⚠️ Operational finding — staging exception storm

40 `SQLITE_ERROR: no such table: users` exceptions in `AppExceptions` against `gwn-ai-staging`, all between **2026-04-27T00:51:00Z** and **2026-04-27T00:51:47Z** (47-second burst). Exact root cause not investigated yet, but this is precisely the failure-mode that planned **CS61** (activate CS41 smoke + DB migration validation in staging) is designed to catch — staging spun up a fresh container with an empty SQLite at `/tmp/game.db` and migrations apparently did not run before the first request hit. Logged here as evidence; full investigation belongs in the active CS61 work or a follow-up CS, not in CS60 (CS60 is observability follow-up, not staging-deploy fix).

#### Whole-workspace cost context (cumulative since baseline)

The 5 GB free tier is **per workspace**, not per AI component. AI tables are dwarfed by container logs:

| Tbl | rows | MB billed |
|---|---:|---:|
| ContainerAppSystemLogs_CL | 131,058 | **36.12** |
| ContainerAppConsoleLogs_CL | 10,441 | **13.77** |
| AppDependencies | 2,360 | 1.75 |
| AppRequests | 187 | 0.16 |
| Usage | 363 | 0.14 |
| AppMetrics | 89 | 0.08 |
| AppExceptions | 40 | 0.04 |

So total workspace ingest (~52 MB cumulative for the ~25.18h since baseline) projects to ≈1.49 GB/month at current rate (`52 / 25.18 × 24 × 30`) — still well inside the 5 GB free tier (~30% of cap), but ~60× the AI-tables-only projection. CS60-3 free-tier-headroom decision must use this whole-workspace number, not just the AI-component slice.

**Caveat on these projections.** Both AI- and workspace-level run-rates are extrapolated from a 25h sample that includes one-off CS54-6 verification traffic on Day 0 staging and the CS61-1 deploy-failure exception storm on Day 1 staging. Treat these numbers as upper-bound estimates until CS60-2h (+7d) provides a steadier baseline.

---

## CS60 deferred-gap dispositions

When CS60-4 (mssql exporter-edge investigation), CS60-5 (Pino → AI traces forwarding), and CS60-6 (exceptions table) each reach a disposition, append a section here documenting the empirical evidence used to make the call (KQL outputs, span shape comparisons, ingest projections, etc.). This data outlives CS60's close and is what a future orchestrator referencing the dispositions will need.

```markdown
### CS60-4 disposition — <date> — <agent-id>

**Disposition:** {implemented | sampled | deferred-to-CS<N> | decided-not-to-do}
**Evidence:**
- KQL `dependencies | where ago(1h)` after 20-probe burst against gwn-ai-staging: `<N>` rows
- Local OTLP collector instrumentationLibrary.name on execSql spans: `<value>`
- CS60-3 +30d headroom number: `<X.Y> GB/month vs 5 GB cap`
**Rationale:** _one paragraph_
```

(Same pattern for CS60-5, CS60-6.)

---

## How this file moves with CS60

This file lives next to CS60 across all lifecycle states:

- While CS60 is in `planned/`: this file is at `project/clickstops/planned/cs60-data-appendix.md`.
- When CS60 is claimed and renamed `active_cs60_*`: `git mv` this file to `project/clickstops/active/cs60-data-appendix.md`.
- When CS60 closes and renames to `done_cs60_*`: `git mv` this file to `project/clickstops/done/cs60-data-appendix.md`.

CS41's deploy-summary script (CS41-7) discovers this file by globbing `project/clickstops/{planned,active,done}/cs60-data-appendix.md` so it works regardless of CS60's current lifecycle state.
