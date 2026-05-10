# CS60 — Data Appendix (cost & telemetry actuals)

**Status:** companion to [`active_cs60_post-cs54-observability-followup.md`](active_cs60_post-cs54-observability-followup.md). Travels with CS60 through its lifecycle (planned → active → done).
**Purpose:** durable, append-only record of empirical observability data captured by CS41 deploys and CS60 measurement windows. Keeping it as a separate file (rather than inline in CS60) keeps CS60's plan readable while allowing this file to grow large over time without bloating the planning doc.

**Read order:** check the [Manifest](#manifest) below to find the most recent measurement, then jump to the relevant section. The Manifest is the single source of truth for what's recorded; sections may be appended out of strict chronological order.

---

## Manifest

| Window / event | Date (UTC) | Captured by | Section |
|---|---|---|---|
| _baseline_ | 2026-04-25T22:39Z (CS54-6 verification) | yoga-gwn-c2 | [§ Baseline (CS54-6)](#baseline-cs54-6) |
| Day 0 — 2026-04-25 (CS60-1a, backfill) | captured 2026-04-26T23:50Z; re-captured 2026-05-10T16:40Z | yoga-gwn-c3 (orig); yoga-gwn (sub-agent, re-capture) | [§ Day 0 — 2026-04-25 (CS60-1a)](#day-0--2026-04-25-cs60-1a) |
| Day 1 — 2026-04-26 (CS60-1b, +24h) | captured 2026-04-26T23:50Z; re-captured 2026-05-10T16:40Z | yoga-gwn-c3 (orig); yoga-gwn (sub-agent, re-capture) | [§ Day 1 — 2026-04-26 (CS60-1b)](#day-1--2026-04-26-cs60-1b) |
| Day 2 — 2026-04-27 (CS60-1c, backfill) | captured 2026-04-30T03:00Z; re-captured 2026-05-10T16:40Z | yoga-gwn-c3 (orig); yoga-gwn (sub-agent, re-capture) | [§ Day 2 — 2026-04-27 (CS60-1c)](#day-2--2026-04-27-cs60-1c) |
| Day 3 — 2026-04-28 (CS60-2c, backfill) | captured 2026-04-30T03:00Z; re-captured 2026-05-10T16:40Z | yoga-gwn-c3 (orig); yoga-gwn (sub-agent, re-capture) | [§ Day 3 — 2026-04-28 (CS60-2c)](#day-3--2026-04-28-cs60-2c) |
| Day 4 — 2026-04-29 (CS60-2d, backfill) | captured 2026-04-30T03:00Z; re-captured 2026-05-10T16:40Z | yoga-gwn-c3 (orig); yoga-gwn (sub-agent, re-capture) | [§ Day 4 — 2026-04-29 (CS60-2d)](#day-4--2026-04-29-cs60-2d) |
| Day 5 — 2026-04-30 (CS60-2e) | captured 2026-05-02T18:30Z; re-captured 2026-05-10T16:40Z | yoga-gwn (orig); yoga-gwn (sub-agent, re-capture) | [§ Day 5 — 2026-04-30 (CS60-2e)](#day-5--2026-04-30-cs60-2e) |
| Day 6 — 2026-05-01 (CS60-2f) | captured 2026-05-02T18:30Z; re-captured 2026-05-10T16:40Z | yoga-gwn (orig); yoga-gwn (sub-agent, re-capture) | [§ Day 6 — 2026-05-01 (CS60-2f)](#day-6--2026-05-01-cs60-2f) |
| Day 7 — 2026-05-02 (CS60-2h) | captured 2026-05-02T18:30Z; re-captured 2026-05-10T16:40Z | yoga-gwn (orig); yoga-gwn (sub-agent, re-capture) | [§ Day 7 — 2026-05-02 (CS60-2h)](#day-7--2026-05-02-cs60-2h) |
| Day 8 — 2026-05-03 (CS60-3i) | captured 2026-05-10T16:40Z | yoga-gwn (sub-agent) | [§ Day 8 — 2026-05-03 (CS60-3i)](#day-8--2026-05-03-cs60-3i) |
| Day 9 — 2026-05-04 (CS60-3j) | captured 2026-05-10T16:40Z | yoga-gwn (sub-agent) | [§ Day 9 — 2026-05-04 (CS60-3j)](#day-9--2026-05-04-cs60-3j) |
| Day 10 — 2026-05-05 (CS60-3k) | captured 2026-05-10T16:40Z | yoga-gwn (sub-agent) | [§ Day 10 — 2026-05-05 (CS60-3k)](#day-10--2026-05-05-cs60-3k) |
| Day 11 — 2026-05-06 (CS60-3l) | captured 2026-05-10T16:40Z | yoga-gwn (sub-agent) | [§ Day 11 — 2026-05-06 (CS60-3l)](#day-11--2026-05-06-cs60-3l) |
| Day 12 — 2026-05-07 (CS60-3m) | captured 2026-05-10T16:40Z | yoga-gwn (sub-agent) | [§ Day 12 — 2026-05-07 (CS60-3m)](#day-12--2026-05-07-cs60-3m) |
| Day 13 — 2026-05-08 (CS60-3n) | captured 2026-05-10T16:40Z | yoga-gwn (sub-agent) | [§ Day 13 — 2026-05-08 (CS60-3n)](#day-13--2026-05-08-cs60-3n) |
| Day 14 — 2026-05-09 (CS60-3o) | captured 2026-05-10T16:40Z | yoga-gwn (sub-agent) | [§ Day 14 — 2026-05-09 (CS60-3o)](#day-14--2026-05-09-cs60-3o) |
| +7d cost measurement | 2026-05-02T18:30Z; refreshed 2026-05-10T16:40Z | yoga-gwn | [§ +7d cost-watch close-out (CS60-2h)](#7d-cost-watch-close-out-cs60-2h) |
| +14d midpoint roll-up | 2026-05-10T16:40Z | yoga-gwn (sub-agent) | [§ +14d midpoint roll-up (CS60-3o)](#14d-midpoint-roll-up-cs60-3o) |
| +30d cost measurement (first-pass extrapolation) | 2026-05-02T18:30Z; refreshed with 14-day actuals 2026-05-10T16:40Z | yoga-gwn | [§ CS60-3 second-pass projection (Days 0-14 actuals)](#cs60-3-second-pass-projection-days-0-14-actuals) |
| +30d cost measurement (final) | 2026-05-25T22:39Z | _pending — CS60-3 daily ticks Day 15..Day 30_ | _to be appended_ |
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

**Captured:** 2026-04-26T23:50Z by yoga-gwn-c3 (backfill); cost + Container Apps metrics added 2026-04-27T03:15Z.
**Re-captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent dispatched by yoga-gwn for CS60-3 backfill) — closed-day Cost Management data.
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

#### Cost — Day 0 (DKK)

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-staging        | Standard Memory Idle Usage    | 1.29 |
| gwn-staging        | Standard vCPU Idle Usage      | 0.64 |
| gwn-staging        | Standard vCPU Active Usage    | 0.16 |
| gwn-staging        | Standard Memory Active Usage  | 0.04 |
| gwn-production     | Standard Memory Idle Usage    | 1.38 |
| gwn-production     | Standard vCPU Idle Usage      | 0.69 |
| gwn-production     | Standard vCPU Active Usage    | 0.02 |
| gwn-production     | Standard Memory Active Usage  | 0.00 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion | 0.02 |

| Resource | Day 0 cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **2.14** | Idle dominates (~91%). CS58 scale-to-zero applied 2026-04-25T18:30Z, so day was billed for ~18.5h normal + ~5.5h scaled-to-zero. (Original record: 2.13 DKK; closed-day re-capture: 2.14 DKK — rounding only, no material change.) |
| gwn-production | **2.09** | Idle ~99% — typical for a Container App with low real traffic. |
| workspace-gwnrg6bXt | **0.02** | Whole workspace logs — well below 5GB/month free tier. |
| gwn-sqldb (production) | 0.00 | Free tier. |
| gwn-ai-staging / gwn-ai-production | 0.00 | Workspace-mode AI components have no separate cost line; ingest cost rolls into the workspace meter. |
| **Day 0 total** | **4.25 DKK** | ≈$0.61 USD at ~7 DKK/USD. (Original record: 4.24 DKK; closed-day re-capture: 4.25 DKK — rounding only.) |

#### Container Apps compute / memory / requests — Day 0

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0001 cores (~100k nanocores) | 69.1 MiB | 1 | 233 | 0 |
| gwn-production | 0.0001 cores | 65.8 MiB | 1 | 199 | 0 |

**Notes**
- Both apps essentially idle — vCPU usage at 1/10000th of a core average, memory pinned around 65-69 MiB (well below the configured limit).
- Day-0 staging AI ingest dominates because CS54-6 verification + CS58 scale-to-zero work both happened on staging that day. Prod was barely touched until late 22:28Z.
- No `AppExceptions`, `AppTraces`, `AppPageViews`, `AppBrowserTimings`, `AppAvailabilityResults`, or `AppSystemEvents` rows on Day 0.
- `gwn-staging` Requests (233) ≫ AI `AppRequests` rows (73) for the same day — likely request-instrumentation sampling or metric-vs-telemetry semantics (e.g., `Requests` metric counts include `/healthz`-style probes that may not be captured as AI `AppRequests`); investigate under CS60-4. (Note: the staging classic AI-scope asymmetry doesn't explain this gap because the `AppRequests` count is already from the workspace-direct path.)

---

### Day 1 — 2026-04-26 (CS60-1b)

**Captured:** 2026-04-26T23:50Z by yoga-gwn-c3 (canonical "+24h" window per original CS60-1 trigger); cost + Container Apps metrics added 2026-04-27T03:15Z.
**Re-captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent dispatched by yoga-gwn for CS60-3 backfill) — closed-day Cost Management data. **Material delta: total moved 1.37 DKK → 2.52 DKK (+1.15 DKK).** Original was a partial-day capture at T23:50Z that missed the final compute-meter close-out (gwn-production retro-filled from 1.36 → 2.46 DKK, gwn-staging emerged from 0.00 → 0.04 DKK active-only). Cumulative-since-baseline narrative below remains essentially correct in shape.
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

#### Cost — Day 1 (DKK)

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-production     | Standard Memory Idle Usage    | 1.64 |
| gwn-production     | Standard vCPU Idle Usage      | 0.82 |
| gwn-production     | Standard Memory Active Usage  | 0.00 |
| gwn-production     | Standard vCPU Active Usage    | 0.00 |
| gwn-staging        | Standard vCPU Active Usage    | 0.03 |
| gwn-staging        | Standard Memory Active Usage  | 0.01 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion | 0.02 |

| Resource | Day 1 cost (DKK) | Notes |
|---|---:|---|
| gwn-production | **2.46** | Closed-day total. (Original record: 1.36 DKK partial — captured T23:50Z. **Delta: +1.10 DKK retro-fill.** The Idle meters bill for a full UTC day's residency; the original capture reported only the meters that had posted by T23:50Z.) |
| **gwn-staging** | **0.04** | Active-only (no idle meter — CS58 scale-to-zero held). (Original record: 0.00 DKK — "first full day at scale-to-zero". **Delta: +0.04 DKK.** Staging woke briefly within the UTC day, possibly for the CS61-1 deploy attempts that triggered the early-Day-2 SQLITE storm; CS58 still saved the bulk of idle billing.) |
| workspace-gwnrg6bXt | 0.02 | (Original record: 0.01 DKK; closed-day: 0.02 DKK — rounding.) |
| gwn-sqldb / AI components | 0.00 | |
| **Day 1 total** | **2.52 DKK** | ≈$0.36 USD. (Original record: 1.37 DKK; closed-day re-capture: 2.52 DKK — **+1.15 DKK material delta**, see Notes.) |

#### Container Apps compute / memory / requests — Day 1

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0005 cores | 129.1 MiB | 1 | 4 | 0 |
| gwn-production | 0.0003 cores | 134.2 MiB | 1 | 81 | 0 |

**Notes**
- Replicas max = 1 for staging means staging WAS up at some point on Day 1 (just briefly — 4 requests). The CS61-1 deploy attempts (which triggered the SQLITE storm) and the CS52-10 staging probes are likely the source. CS58 still wins overall — `Standard vCPU Idle Usage` cost = 0 on Day 1, but a small Active-only charge of 0.04 DKK retro-filled by the closed-day re-capture.
- WorkingSet doubled from Day 0 (~65-69 MiB → ~129-134 MiB) likely reflecting Node heap warming up after CS41 deploy + recent CS53/CS52 work landing.
- Prod requests dropped 199 → 81 vs Day 0 — Day 0 included CS54-6 verification probes; Day 1 is closer to organic traffic.
- **Re-capture note (2026-05-10):** the original capture at T23:50Z under-reported Day 1 cost by 1.15 DKK because the partial-day capture missed the final compute-meter close-out window. Cumulative-since-baseline narrative below was written with the partial number; the steady-state run-rate it derives is therefore a slight under-estimate. The +7d / +14d roll-ups use the corrected closed-day numbers.

**Cumulative since baseline (Day 0 + Day 1)**

Window basis: baseline marker `2026-04-25T22:39Z` → capture `2026-04-26T23:50Z` = **25.18 hours elapsed**. Run-rate uses `MB / 25.18 × 24`; monthly uses `run-rate × 30`. Both are best-effort point estimates from a partial-window sample — refine at CS60-1c (full Day 2) and revisit at CS60-2h (+7d).

| env | rows | MB | Run-rate (MB/day) | Projected monthly (MB) |
|---|---:|---:|---:|---:|
| staging | 1003 | 0.88 | ≈0.84 | ≈25 |
| prod    | 1160 | 0.87 | ≈0.83 | ≈25 |

> **Why cumulative `rows` ≠ sum of per-day `rows`:** the cumulative figures here and in the whole-workspace table further below were pulled by a single workspace query run **after** the per-day captures (after the cost+metrics addition at 03:15Z on 2026-04-27, post-dating the 00:51Z `SQLITE_ERROR` storm). The per-day tables bucket strictly by `[00:00Z, 23:59Z]` of each UTC day and were captured at 23:50Z on Day 1. So the cumulative dataset covers ≳26h (baseline 2026-04-25T22:39Z → cumulative-query time on 2026-04-27) while per-day Day-0+Day-1 only covers up to 2026-04-26T23:50Z — the cumulative therefore includes the early-2026-04-27 SQLITE storm (40 `AppExceptions`) and a small tail of post-23:50Z dependency / request rows that the per-day buckets miss. The 25.18h denominator used for the run-rate / monthly projections below is therefore a slight underestimate of the elapsed window (≈4-7% short), which makes the projections a slight overestimate of the steady-state rate — fine for ≪5GB-cap headroom checks; CS60-1c will tighten this once a full Day 2 closes cleanly.

**Free-tier headroom (5 GB / month workspace cap, AI tables only):** ≫ 4 GB headroom in both envs at current run-rate (~0.5% of cap).

#### ⚠️ Operational finding — staging exception storm

40 `SQLITE_ERROR: no such table: users` exceptions in `AppExceptions` against `gwn-ai-staging`, all between **2026-04-27T00:51:00Z** and **2026-04-27T00:51:47Z** (47-second burst). Exact root cause not investigated yet, but this is precisely the failure-mode that **CS61** (activate CS41 smoke + DB migration validation in staging) is designed to catch — staging spun up a fresh container with an empty SQLite at `/tmp/game.db` and migrations apparently did not run before the first request hit. Logged here as evidence; full investigation belongs in active CS61 work or a follow-up CS, not in CS60 (CS60 is observability follow-up, not staging-deploy fix).

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

So total workspace ingest (~52 MB cumulative for the ~25.18h since baseline) projects to ≈1.49 GB/month at current rate (`52 / 25.18 × 24 × 30`) — still well inside the 5 GB free tier (~30% of cap), but ~30× the **combined** AI-tables-only projection (~50 MB/month for staging + prod) and ~60× the single-env AI slice (~25 MB/month). CS60-3 free-tier-headroom decision must use this whole-workspace number, not just the AI-component slice.

**Caveat on these projections.** Both AI- and workspace-level run-rates are extrapolated from a 25h sample that includes one-off CS54-6 verification traffic on Day 0 staging and the CS61-1 deploy-failure exception storm on Day 1 staging. Treat these numbers as upper-bound estimates until CS60-2h (+7d) provides a steadier baseline.

---

### Day 2 — 2026-04-27 (CS60-1c)

**Captured:** 2026-04-30T03:00Z by yoga-gwn-c3 (backfill).
**Re-captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent dispatched by yoga-gwn for CS60-3 backfill) — closed-day Cost Management data. **No material change** (closed-day total 3.30 DKK matches original 3.30 DKK; per-meter values within ±0.01 DKK rounding).
**Window:** UTC day 2026-04-27.

#### App Insights tables — Day 2

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 6,033 | 4.46 |
| prod | AppRequests | 429 | 0.36 |
| prod | AppMetrics | 29 | 0.03 |
| staging | AppDependencies | 8,489 | 6.34 |
| staging | AppRequests | 551 | 0.49 |
| staging | AppMetrics | 94 | 0.08 |
| staging | AppExceptions | 50 | 0.05 |

| env | Day 2 AI total (MB) |
|---|---:|
| staging | **6.96** |
| prod | **4.85** |

#### Cost — Day 2 (DKK)

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-production     | Standard Memory Idle Usage    | 1.64 |
| gwn-production     | Standard vCPU Idle Usage      | 0.82 |
| gwn-production     | Standard vCPU Active Usage    | 0.00 |
| gwn-production     | Standard Memory Active Usage  | 0.00 |
| gwn-staging        | Standard vCPU Active Usage    | 0.49 |
| gwn-staging        | Standard Memory Active Usage  | 0.12 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion | 0.22 |

| Resource | Day 2 cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.61** | Brief active-only billing from staging spin-up(s); no idle meter returned, so CS58 scale-to-zero still prevented all-day idle cost. |
| gwn-production | **2.47** | Higher than Day 1 as prod was resident for the full UTC day; idle memory/vCPU dominate. |
| workspace-gwnrg6bXt | **0.22** | Highest observed workspace ingest cost so far, consistent with Day 2's AI/log spike and staging exception burst. |
| gwn-sqldb / AI components | 0.00 | |
| **Day 2 total** | **3.30 DKK** | ≈$0.47 USD at ≈7 DKK/USD. |

#### Container Apps compute / memory / requests — Day 2

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0019 cores (≈1.94M nanocores) | 122.9 MiB | 1 | 505 | 0 |
| gwn-production | 0.0003 cores (≈289k nanocores) | 103.3 MiB | 1 | 430 | 0 |

**Notes**
- Day 2 is the noisy backfill day: staging AI ingest jumped to 6.96 MB and prod to 4.85 MB, far above Day 1, matching the CS61/CS52 operational activity around the CS61 staging failure window.
- `AppExceptions` recorded 50 staging rows, extending the Day 1 operational finding (`SQLITE_ERROR` storm) into the Day 2 UTC bucket; disposition remains with CS61 / CS60-4 follow-up rather than this cost-watch task.
- `gwn-staging` billed only active vCPU/memory (0.61 DKK) and no idle meter, so scale-to-zero continued to avoid baseline idle burn despite 505 requests.
- No restarts were observed; both apps reached Replicas max = 1 at least once.

---

### Day 3 — 2026-04-28 (CS60-2c)

**Captured:** 2026-04-30T03:00Z by yoga-gwn-c3 (backfill).
**Re-captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent dispatched by yoga-gwn for CS60-3 backfill) — closed-day Cost Management data. **No material change** (closed-day total 2.53 DKK matches original 2.53 DKK; per-meter values within ±0.01 DKK rounding).
**Window:** UTC day 2026-04-28.

#### App Insights tables — Day 3

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 2,736 | 2.02 |
| prod | AppRequests | 186 | 0.15 |
| prod | AppMetrics | 18 | 0.02 |

| env | Day 3 AI total (MB) |
|---|---:|
| prod | **2.19** |
| staging | **0.00** |

#### Cost — Day 3 (DKK)

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-production     | Standard Memory Idle Usage    | 1.64 |
| gwn-production     | Standard vCPU Idle Usage      | 0.82 |
| gwn-production     | Standard vCPU Active Usage    | 0.00 |
| gwn-production     | Standard Memory Active Usage  | 0.00 |
| gwn-staging        | Standard vCPU Active Usage    | 0.03 |
| gwn-staging        | Standard Memory Active Usage  | 0.01 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion | 0.04 |

| Resource | Day 3 cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.03** | Near-zero active-only blip; no idle meter. |
| gwn-production | **2.46** | Stable full-day idle footprint after Day 2. |
| workspace-gwnrg6bXt | **0.04** | Drops sharply after Day 2 spike. |
| gwn-sqldb / AI components | 0.00 | |
| **Day 3 total** | **2.53 DKK** | ≈$0.36 USD. |

#### Container Apps compute / memory / requests — Day 3

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0011 cores (≈1.07M nanocores) | 118.0 MiB | 1 | 0 | 0 |
| gwn-production | 0.0003 cores (≈273k nanocores) | 92.8 MiB | 1 | 186 | 0 |

**Notes**
- Workspace-direct AI query returned no staging App Insights rows for Day 3, matching the Container Apps `Requests` total of 0.
- The small staging active cost with 0 requests implies a short platform/deploy spin-up rather than user traffic; absence of idle meter still supports CS58 scale-to-zero.
- Prod traffic settled to 186 requests and 2.19 MB AI ingest, down from Day 2 but above Day 1.
- No `AppExceptions` rows on Day 3.

---

### Day 4 — 2026-04-29 (CS60-2d)

**Captured:** 2026-04-30T03:00Z by yoga-gwn-c3 (backfill).
**Re-captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent dispatched by yoga-gwn for CS60-3 backfill) — closed-day Cost Management data. **Material delta: total moved 1.08 DKK → 2.53 DKK (+1.45 DKK).** Original was captured only ~3 hours after the UTC day closed; gwn-production retro-filled from 1.05 → 2.47 DKK (the second half of Idle vCPU/Memory meters posted later). gwn-staging unchanged at 0.03 DKK active-only.
**Window:** UTC day 2026-04-29.

#### App Insights tables — Day 4

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 465 | 0.34 |
| prod | AppRequests | 40 | 0.03 |
| prod | AppMetrics | 8 | 0.01 |

| env | Day 4 AI total (MB) |
|---|---:|
| prod | **0.38** |
| staging | **0.00** |

#### Cost — Day 4 (DKK)

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-production     | Standard Memory Idle Usage    | 1.64 |
| gwn-production     | Standard vCPU Idle Usage      | 0.82 |
| gwn-production     | Standard vCPU Active Usage    | 0.01 |
| gwn-production     | Standard Memory Active Usage  | 0.00 |
| gwn-staging        | Standard vCPU Active Usage    | 0.03 |
| gwn-staging        | Standard Memory Active Usage  | 0.01 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion | 0.03 |

| Resource | Day 4 cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.03** | Near-zero active-only blip; no idle meter and no staging requests. (Unchanged from original.) |
| gwn-production | **2.47** | Closed-day total. (Original record: 1.05 DKK partial — captured ~3h after UTC day closed. **Delta: +1.42 DKK retro-fill.** Idle meters bill for the full day; the original capture missed the second half of Idle posting.) |
| workspace-gwnrg6bXt | **0.03** | Closed-day workspace ingestion. (Original record: 0.00 DKK rounded; closed-day: 0.03 DKK.) |
| gwn-sqldb / AI components | 0.00 | |
| **Day 4 total** | **2.53 DKK** | ≈$0.36 USD; UTC day fully closed at re-capture time. (Original record: 1.08 DKK partial; closed-day: 2.53 DKK — **+1.45 DKK material delta**, see Notes.) |

#### Container Apps compute / memory / requests — Day 4

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0004 cores (≈407k nanocores) | 118.5 MiB | 1 | 0 | 0 |
| gwn-production | 0.0003 cores (≈263k nanocores) | 94.5 MiB | 1 | 40 | 0 |

**Notes**
- Day 4 prod traffic dropped to 40 requests and 0.38 MB AI ingest, the lowest full-day prod telemetry since activation.
- Staging again had 0 requests and 0.00 MB AI ingest; the 0.03 DKK active-only cost is likely platform/deploy warm time rather than user traffic.
- **Re-capture note (2026-05-10):** the original capture's "Cost Management for Day 4 was captured only a few hours after the UTC day closed, so the lower prod/workspace totals are marked partial and should be revisited at CS60-2e" warning has now been actioned by this re-capture. Closed-day total moved +1.45 DKK to 2.53 DKK.
- No `AppExceptions` rows and no restarts were observed.

---

### Day 5 — 2026-04-30 (CS60-2e)

**Captured:** 2026-05-02T18:30Z by yoga-gwn (backfill — closed UTC day).
**Re-captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent dispatched by yoga-gwn for CS60-3 backfill) — closed-day Cost Management data. **No material change** (closed-day total 2.54 DKK vs original 2.55 DKK — within ±0.01 DKK rounding; per-meter values stable).
**Window:** UTC day 2026-04-30.

#### App Insights tables — Day 5

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 2508 | 1.85 |
| prod | AppRequests | 242 | 0.21 |
| prod | AppMetrics | 16 | 0.01 |
| staging | _(no rows — scale-to-zero, no traffic)_ | 0 | 0.00 |

| env | Day 5 AI total (MB) |
|---|---:|
| prod | **2.07** |
| staging | **0.00** |

#### Cost — Day 5 (DKK)

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-production     | Standard Memory Idle Usage    | 1.64 |
| gwn-production     | Standard vCPU Idle Usage      | 0.82 |
| gwn-production     | Standard vCPU Active Usage    | 0.02 |
| gwn-production     | Standard Memory Active Usage  | 0.01 |
| gwn-staging        | Standard vCPU Active Usage    | 0.02 |
| gwn-staging        | Standard Memory Active Usage  | 0.01 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion | 0.03 |

| Resource | Day 5 cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.03** | Brief active-only blip; no idle meter; no staging requests recorded by the platform. |
| gwn-production | **2.48** | Closed-day total — matches Days 1/3 prod steady-state shape. |
| workspace-gwnrg6bXt | **0.03** | Closed-day workspace ingestion. |
| gwn-sqldb / AI components | 0.00 | |
| **Day 5 total** | **2.54 DKK** | ≈$0.36 USD; UTC day fully closed at capture time. |

#### Container Apps compute / memory / requests — Day 5

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0005 cores (≈453k nanocores) | 102.2 MiB | 1 | 0 | 0 |
| gwn-production | 0.0003 cores (≈287k nanocores) | 94.8 MiB | 1 | 242 | 0 |

**Notes**
- Day 5 prod traffic recovered to 242 requests / 2.07 MB AI ingest from Day 4's 40-request low.
- Prod **AppDependencies = 2508 rows / 1.85 MB** — this is the single largest table by volume across the 8-day window; confirms the `tedious` driver's `execSql` spans are flowing all the way to App Insights, not just the local OTLP collector. Material input to CS60-4 disposition.
- Staging: 0 traffic, but a short 0.03 DKK active-only blip (likely a deploy-side warm probe).

---

### Day 6 — 2026-05-01 (CS60-2f)

**Captured:** 2026-05-02T18:30Z by yoga-gwn (backfill — UTC day closed but Cost Management partial).
**Re-captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent dispatched by yoga-gwn for CS60-3 backfill) — closed-day Cost Management data. Originally captured partial; this section now reflects closed-day CM data, but Cost Management compute meters remain absent for both `gwn-staging` and `gwn-production` even 9 days post-close. The original capture's "expect retro-fill ≈ 1.5-2.5 DKK" prediction did **not** materialize — see updated Notes below. Day 6 is part of a contiguous 4-day CM compute-meter gap (Days 6-9 = 2026-05-01..2026-05-04); see [+14d midpoint roll-up § Cost Management compute-meter gap](#14d-midpoint-roll-up-cs60-3o) for the cross-day finding.
**Window:** UTC day 2026-05-01.

#### App Insights tables — Day 6

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 920 | 0.68 |
| prod | AppRequests | 88 | 0.08 |
| prod | AppMetrics | 16 | 0.01 |
| staging | AppDependencies | 69 | 0.05 |
| staging | AppRequests | 6 | 0.01 |
| staging | AppMetrics | 2 | 0.00 |

| env | Day 6 AI total (MB) |
|---|---:|
| prod | **0.77** |
| staging | **0.06** |

#### Cost — Day 6 (DKK)

> **CM compute-meter gap (confirmed, not lag).** As of the 2026-05-10 closed-day re-capture (9 days after UTC day close), Cost Management still emits only Free-tier line items for `gwn-production` ("1 vCore - Free", "General Purpose Data Stored - Free") and zero `Standard *Idle/Active Usage` meters for either Container App. Container Apps platform metrics confirm both apps were running normally on Day 6 (prod replicas=1, requests=88; staging replicas=1, requests=2) — this is a billing-data anomaly, not an outage. The Days 6-9 window is contiguous; see the +14d roll-up cross-day note for the full pattern.

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-production     | 1 vCore - Free                    | 0.00 |
| gwn-production     | General Purpose Data Stored - Free| 0.00 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion    | 0.01 |

| Resource | Day 6 cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.00** | No compute meters from CM. Original capture predicted "expect ~0.02-0.05 DKK after retro-fill"; closed-day re-capture confirms NO retro-fill landed. Status remains 0.00 DKK as recorded by CM. |
| gwn-production | **0.00** | No compute meters from CM. Original capture predicted "expect ~1.5-2.5 DKK after retro-fill"; closed-day re-capture confirms NO retro-fill landed in the 9 days since. Status remains 0.00 DKK as recorded by CM. |
| workspace-gwnrg6bXt | **0.01** | Workspace ingestion did emit and is unchanged. |
| **Day 6 recorded total** | **0.01 DKK** | **Original capture (2026-05-02): 0.01 DKK partial — predicted ≈1.7-2.6 DKK after lag-fill.** **Closed-day re-capture (2026-05-10, 9 days later): 0.01 DKK — no compute meters arrived.** Cross-reference Day 7/8/9 same anomaly. |

#### Container Apps compute / memory / requests — Day 6

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0005 cores (≈499k nanocores) | 122.5 MiB | 1 | 2 | 0 |
| gwn-production | 0.0003 cores (≈269k nanocores) | 91.2 MiB | 1 | 88 | 0 |

**Notes**
- Day 6 staging telemetry (6 AppRequests + 69 AppDependencies) suggests a deploy or probe burst — Container Apps recorded only 2 platform-level Requests, the difference is likely OTel-instrumented health/probe traffic captured via spans.
- Prod ingest dropped to 0.77 MB (88 requests + 920 dependencies) — well within steady-state band.
- No restarts. No exceptions.
- **Re-capture finding:** the predicted "lag-corrected estimate ≈ 1.7-2.6 DKK" did NOT materialize. Cost Management has not emitted Container Apps compute meters for Day 6 in the 9 days since UTC close. Same shape on Days 7, 8, 9 (contiguous 4-day gap). Recommend a CS60-4-or-new-CS follow-up to file an Azure support ticket and/or use the Consumption / Usage Details API as cross-check (out of scope for this CS60-3 backfill PR).

---

### Day 7 — 2026-05-02 (CS60-2h)

**Captured:** 2026-05-02T18:30Z by yoga-gwn (in-day capture — UTC day not yet closed).
**Re-captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent dispatched by yoga-gwn for CS60-3 backfill) — closed-day Cost Management data. Originally captured at ~75 % through the UTC day; closed-day re-capture shows substantial post-capture activity (prod went 35 → 1,923 AppDependencies; staging emerged from 0 → 1,658 AppDependencies + 97 AppRequests, with Replicas peaking at 1). Cost Management compute meters remain absent (Day 7 is part of the contiguous Days 6-9 CM compute-meter gap). The CS60-2h close-out roll-up below has been refreshed with these closed-day numbers.
**Window:** UTC day 2026-05-02.

#### App Insights tables — Day 7

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 1,923 | 1.44 |
| prod | AppRequests | 125 | 0.11 |
| prod | AppMetrics | 23 | 0.02 |
| staging | AppDependencies | 1,658 | 1.24 |
| staging | AppRequests | 97 | 0.08 |
| staging | AppMetrics | 14 | 0.01 |

| env | Day 7 AI total (MB) |
|---|---:|
| prod | **1.57** |
| staging | **1.33** |

> **Original mid-day capture had recorded:** prod 35/0.03 + 3/0.00 + 3/0.00 = 0.03 MB; staging zero. Closed-day re-capture shows ≈50× more activity than the partial recorded at T18:30Z — the bulk of Day 7 traffic (and the staging wake-up) happened after the original capture window.

#### Cost — Day 7 (DKK)

> **CM compute-meter gap (confirmed, not lag).** As of the 2026-05-10 closed-day re-capture (8 days after UTC day close), Cost Management still emits no `Standard *Idle/Active Usage` meters for either Container App on Day 7. Workspace ingestion has filled in (0.03 → 0.08 DKK) but compute remains absent. Same anomaly as Days 6, 8, 9.

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-production     | General Purpose Data Stored - Free | 0.00 |
| gwn-production     | 1 vCore - Free                     | 0.00 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion     | 0.08 |

| Resource | Day 7 cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.00** | No compute meters from CM. (Original record: 0.00 DKK; closed-day re-capture: 0.00 DKK — but staging WAS up during Day 7 with 97 platform-recorded AppRequests, so Active charges *should* have posted.) |
| gwn-production | **0.00** | No compute meters from CM. Original prediction "expect ~1.5-2 DKK at close" did NOT materialize. (Original record: 0.00 DKK; closed-day re-capture: 0.00 DKK.) |
| workspace-gwnrg6bXt | **0.08** | Workspace ingestion filled in. (Original record: 0.03 DKK partial; closed-day: 0.08 DKK — **+0.05 DKK retro-fill** of workspace meter only.) |
| gwn-sqldb / AI components | 0.00 | |
| **Day 7 recorded total** | **0.08 DKK** | (Original record: 0.03 DKK partial; closed-day re-capture: 0.08 DKK — only workspace ingestion retro-filled.) |

#### Container Apps compute / memory / requests — Day 7

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0024 cores (≈2.40M nanocores) | 102.4 MiB | 1 | 94 | 0 |
| gwn-production | 0.0003 cores (≈266k nanocores) | 90.1 MiB | 1 | 125 | 0 |

> **Original Day 7 capture had recorded:** staging "_no data — Replicas = 0_" and prod 0.0003 cores / 87.7 MiB / Replicas=1 / 3 requests. Closed-day re-capture shows staging actually went up during the post-T18:30Z portion of the UTC day (Replicas peaked at 1; 94 platform-recorded Requests; UsageNanoCores avg ≈ 2.4M = highest in the 14-day window).

**Notes**
- The original "Staging Replicas max = 0 — first day in the 8-day window where CS58 scale-to-zero held the entire UTC day" claim was inaccurate due to the in-day capture timing — staging woke after the original capture window. The first true zero-replica full-UTC-day in the window is **Day 8** (per closed-day data; see Day 8 section).
- Prod and staging both saw real traffic on Day 7 (125 + 94 platform requests respectively); origin not pinned (could be CS41/CS52/CS53 deploy probes or operator activity). 4 days later the bulk of traffic finally appears in the workspace.
- No restarts. No exceptions.
- **Re-capture finding (re: lag prediction):** the original section's "expect ~1.5-2 DKK at close based on Days 3/4/5 shape" prediction did NOT materialize for production compute; same Days 6-9 CM gap as Day 6.

---

### Day 8 — 2026-05-03 (CS60-3i)

**Captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent — closed UTC day, backfill).
**Window:** UTC day 2026-05-03.

#### App Insights tables — Day 8

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 8,990 | 6.91 |
| prod | AppRequests | 495 | 0.43 |
| prod | AppMetrics | 112 | 0.10 |
| prod | AppExceptions | 48 | 0.06 |
| prod | AppTraces | 1 | 0.00 |
| staging | _(no rows — scale-to-zero, no traffic)_ | 0 | 0.00 |

| env | Day 8 AI total (MB) |
|---|---:|
| prod | **7.50** |
| staging | **0.00** |

#### Cost — Day 8 (DKK)

> **PARTIAL — Cost Management compute-meter gap.** As of capture (8 days after the UTC day closed) Cost Management has emitted only the workspace ingestion line and SQL Free-tier zero placeholders. No `Standard *Idle/Active Usage` meters for `gwn-staging` or `gwn-production`. Day 8 is part of a contiguous 4-day gap (Days 6-9 = 2026-05-01..2026-05-04) — see the [+14d midpoint roll-up](#14d-midpoint-roll-up-cs60-3o) for the cross-day finding and the resulting plan-side disposition note. Expected lag-corrected total based on Day 7 closed-day extrapolation + Day 8 ingest-cost ≈ 1.7-2.6 DKK.

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion     | 0.13 |
| gwn-production     | 1 vCore - Free                    | 0.00 |
| gwn-production     | General Purpose Data Stored - Free| 0.00 |

| Resource | Day 8 recorded cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.00** | No meters — staging at scale-to-zero (Replicas max = 0); expect 0.00 DKK after lag-fill. |
| gwn-production | **0.00** | No compute meters; CM gap. Expect ~2.0-2.5 DKK after lag-fill (Day 8 ran 3 replicas at peak — see notes). |
| workspace-gwnrg6bXt | **0.13** | Highest workspace ingestion cost so far; reflects the prod 7.50 MB AI ingest day + container logs. |
| gwn-sqldb / AI components | 0.00 | |
| **Day 8 recorded total** | **0.13 DKK** | Strongly partial. |

#### Container Apps compute / memory / requests — Day 8

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | _(no data — Replicas = 0)_ | _(no data)_ | 0 | 0 | 0 |
| gwn-production | 0.0004 cores (≈386k nanocores) | 136.6 MiB | **3** | 495 | 0 |

**Notes**
- **Highest-ingest day in the 14-day window for prod** (7.50 MB AI), driven by 8,990 dependency spans + 48 exceptions + 1 trace row. The exception count (48) plus the replicas-max=3 burst suggests a real prod activity spike — possibly an investigation session, traffic burst, or short-lived error condition — worth correlating with the staging scale-to-zero state.
- First day in the window where prod scaled past Replicas=1 (max=3); Working Set climbed to 136.6 MiB (steady ~134 MiB across Days 8-13, up from Days 0-7 mid-90s).
- Staging fully scaled-to-zero entire UTC day (CS58 holding).
- No restarts.

---

### Day 9 — 2026-05-04 (CS60-3j)

**Captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent — closed UTC day, backfill).
**Window:** UTC day 2026-05-04.

#### App Insights tables — Day 9

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 205 | 0.15 |
| prod | AppRequests | 17 | 0.01 |
| prod | AppMetrics | 11 | 0.01 |
| staging | _(no rows — scale-to-zero, no traffic)_ | 0 | 0.00 |

| env | Day 9 AI total (MB) |
|---|---:|
| prod | **0.17** |
| staging | **0.00** |

#### Cost — Day 9 (DKK)

> **PARTIAL — Cost Management compute-meter gap (continued from Day 8).** No compute meters for either app. Workspace ingestion 0.003 DKK only. Lowest-ingest day in the 14-day window. Expected lag-corrected total ≈ 1.5-2 DKK based on Day 7 closed-day shape.

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion     | 0.00 |
| gwn-production     | General Purpose Data Stored - Free| 0.00 |

| Resource | Day 9 recorded cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.00** | No meters — staging at scale-to-zero. |
| gwn-production | **0.00** | No compute meters; CM gap. Expect ~1.5-2 DKK after lag-fill (Day 9 was idle — only 17 requests). |
| workspace-gwnrg6bXt | **0.00** | Rounded to 0.00 (raw 0.003 DKK). |
| gwn-sqldb / AI components | 0.00 | |
| **Day 9 recorded total** | **0.00 DKK** | Strongly partial. |

#### Container Apps compute / memory / requests — Day 9

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | _(no data — Replicas = 0)_ | _(no data)_ | 0 | 0 | 0 |
| gwn-production | 0.0003 cores (≈300k nanocores) | 134.5 MiB | 1 | 17 | 0 |

**Notes**
- Lowest-traffic day for prod in the 14-day window (17 requests, 0.17 MB AI ingest); prod returned to Replicas=1 after Day 8's burst.
- Staging fully scaled-to-zero entire UTC day.
- No restarts. No exceptions.

---

### Day 10 — 2026-05-05 (CS60-3k)

**Captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent — closed UTC day, backfill).
**Window:** UTC day 2026-05-05.

#### App Insights tables — Day 10

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 195 | 0.14 |
| prod | AppRequests | 17 | 0.01 |
| prod | AppMetrics | 14 | 0.01 |
| staging | _(no rows — no traffic)_ | 0 | 0.00 |

| env | Day 10 AI total (MB) |
|---|---:|
| prod | **0.17** |
| staging | **0.00** |

#### Cost — Day 10 (DKK)

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-production     | Standard Memory Idle Usage    | 1.41 |
| gwn-production     | Standard vCPU Idle Usage      | 0.71 |
| gwn-staging        | Standard vCPU Active Usage    | 0.02 |
| gwn-staging        | Standard Memory Active Usage  | 0.01 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion | 0.00 |
| gwn-production     | General Purpose Data Stored - Free | 0.00 |

| Resource | Day 10 cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.03** | Brief active-only blip; no idle meter — CS58 scale-to-zero still avoided baseline idle billing despite 0 platform-recorded requests. |
| gwn-production | **2.12** | Closed-day total. **Idle-only** — no Active vCPU/Memory meters; reflects very-low-traffic day (17 requests). |
| workspace-gwnrg6bXt | **0.00** | Rounded; raw 0.003 DKK. |
| gwn-sqldb / AI components | 0.00 | |
| **Day 10 total** | **2.15 DKK** | ≈$0.31 USD; UTC day fully closed at capture time. |

#### Container Apps compute / memory / requests — Day 10

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0005 cores (≈472k nanocores) | 77.5 MiB | 1 | 0 | 0 |
| gwn-production | 0.0003 cores (≈262k nanocores) | 135.4 MiB | 1 | 17 | 0 |

**Notes**
- First day after the Days 6-9 CM compute-meter gap; billing appears intact for Day 10 onwards.
- Staging woke briefly (Replicas peaked at 1 with 0 platform-recorded requests) — likely a deploy/probe blip that drove the 0.03 DKK active charge.
- Prod working set jumped to 135 MiB (settled at this level Days 8-13 after Day 7's 87.7 MiB low; correlates with the Day 8 burst that triggered the higher steady-state).
- No restarts. No exceptions.

---

### Day 11 — 2026-05-06 (CS60-3l)

**Captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent — closed UTC day, backfill).
**Window:** UTC day 2026-05-06.

#### App Insights tables — Day 11

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 1,593 | 1.18 |
| prod | AppRequests | 112 | 0.09 |
| prod | AppMetrics | 24 | 0.02 |
| staging | _(no rows — no traffic)_ | 0 | 0.00 |

| env | Day 11 AI total (MB) |
|---|---:|
| prod | **1.29** |
| staging | **0.00** |

#### Cost — Day 11 (DKK)

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-production     | Standard Memory Idle Usage    | 1.64 |
| gwn-production     | Standard vCPU Idle Usage      | 0.82 |
| gwn-production     | Standard vCPU Active Usage    | 0.05 |
| gwn-production     | Standard Memory Active Usage  | 0.01 |
| gwn-staging        | Standard vCPU Active Usage    | 0.03 |
| gwn-staging        | Standard Memory Active Usage  | 0.01 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion | 0.02 |
| gwn-production     | General Purpose Data Stored - Free | 0.00 |

| Resource | Day 11 cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.03** | Active-only blip; no idle. |
| gwn-production | **2.51** | Steady-state shape resumes (Idle ≈ 2.46 + Active ≈ 0.05); slightly higher than baseline because prod replica peaked at 2. |
| workspace-gwnrg6bXt | **0.02** | Closed-day workspace ingestion. |
| gwn-sqldb / AI components | 0.00 | |
| **Day 11 total** | **2.56 DKK** | ≈$0.37 USD. |

#### Container Apps compute / memory / requests — Day 11

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0004 cores (≈356k nanocores) | 115.5 MiB | 1 | 0 | 0 |
| gwn-production | 0.0003 cores (≈261k nanocores) | 135.4 MiB | 2 | 112 | 0 |

**Notes**
- Prod Replicas max = 2 — second day in the window with multi-replica scale-out (after Day 8's max=3 burst).
- Steady-state recovery after the low-ingest Days 9/10.
- No restarts. No exceptions.

---

### Day 12 — 2026-05-07 (CS60-3m)

**Captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent — closed UTC day, backfill).
**Window:** UTC day 2026-05-07.

#### App Insights tables — Day 12

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 6,984 | 5.16 |
| prod | AppRequests | 542 | 0.45 |
| prod | AppMetrics | 55 | 0.05 |
| staging | AppDependencies | 522 | 0.39 |
| staging | AppRequests | 51 | 0.05 |
| staging | AppMetrics | 3 | 0.00 |

| env | Day 12 AI total (MB) |
|---|---:|
| prod | **5.66** |
| staging | **0.44** |

#### Cost — Day 12 (DKK)

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-production     | Standard Memory Idle Usage    | 1.63 |
| gwn-production     | Standard vCPU Idle Usage      | 0.82 |
| gwn-production     | Standard vCPU Active Usage    | 0.05 |
| gwn-production     | Standard Memory Active Usage  | 0.01 |
| gwn-staging        | Standard vCPU Active Usage    | 0.03 |
| gwn-staging        | Standard Memory Active Usage  | 0.01 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion | 0.11 |
| gwn-production     | General Purpose Data Stored - Free | 0.00 |

| Resource | Day 12 cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.04** | Active-only blip; no idle. Staging woke briefly (51 AppRequests + 522 AppDependencies) — likely a deploy or operator probe burst. |
| gwn-production | **2.52** | Steady-state shape; high-ingest day pushed workspace cost up. |
| workspace-gwnrg6bXt | **0.11** | Higher than recent days; reflects the 5.66 MB prod ingest. |
| gwn-sqldb / AI components | 0.00 | |
| **Day 12 total** | **2.67 DKK** | ≈$0.38 USD. |

#### Container Apps compute / memory / requests — Day 12

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0005 cores (≈459k nanocores) | 132.3 MiB | 1 | 50 | 0 |
| gwn-production | 0.0003 cores (≈278k nanocores) | 133.5 MiB | 2 | 542 | 0 |

**Notes**
- Highest-traffic day for prod since Day 8 (542 requests; 6,984 dependency spans).
- Staging WAS up briefly (50 platform-recorded requests + 51 AI AppRequests — close match) — operator activity rather than scheduled traffic.
- No restarts. No exceptions.

---

### Day 13 — 2026-05-08 (CS60-3n)

**Captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent — closed UTC day, backfill).
**Window:** UTC day 2026-05-08.

#### App Insights tables — Day 13

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 7,700 | 5.75 |
| prod | AppRequests | 480 | 0.39 |
| prod | AppExceptions | 68 | 0.09 |
| prod | AppMetrics | 62 | 0.06 |
| prod | AppTraces | 1 | 0.00 |
| staging | _(no rows — no traffic)_ | 0 | 0.00 |

| env | Day 13 AI total (MB) |
|---|---:|
| prod | **6.29** |
| staging | **0.00** |

#### Cost — Day 13 (DKK)

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-production     | Standard Memory Idle Usage    | 1.63 |
| gwn-production     | Standard vCPU Idle Usage      | 0.82 |
| gwn-production     | Standard vCPU Active Usage    | 0.05 |
| gwn-production     | Standard Memory Active Usage  | 0.01 |
| gwn-staging        | Standard vCPU Active Usage    | 0.02 |
| gwn-staging        | Standard Memory Active Usage  | 0.01 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion | 0.11 |
| gwn-production     | General Purpose Data Stored - Free | 0.00 |

| Resource | Day 13 cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.03** | Active-only blip; no idle. |
| gwn-production | **2.52** | Steady-state shape, matches Days 11/12. |
| workspace-gwnrg6bXt | **0.11** | High workspace ingestion driven by 6.29 MB prod AI day + 68 AppExceptions. |
| gwn-sqldb / AI components | 0.00 | |
| **Day 13 total** | **2.66 DKK** | ≈$0.38 USD. |

#### Container Apps compute / memory / requests — Day 13

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0004 cores (≈418k nanocores) | 105.7 MiB | 1 | 0 | 0 |
| gwn-production | 0.0003 cores (≈278k nanocores) | 134.3 MiB | 2 | 481 | 0 |

**Notes**
- ⚠️ **68 prod AppExceptions** in this 24h window — highest exception count on any single day in the 14-day window (Day 8 had 48). Worth investigating in CS60-4 follow-up: pull `AppExceptions | where TimeGenerated between(datetime(2026-05-08T00:00Z) .. datetime(2026-05-09T00:00Z)) and _ResourceId contains 'gwn-ai-production' | summarize n=count() by type, outerMessage` to identify the failure class.
- Prod traffic stayed at ~480 requests (very close to Day 12's 542) with replicas max = 2 — sustained ~2-replica steady state since Day 11.
- Staging had 0 requests but 0.03 DKK active-only billing (deploy/probe blip).
- 1 AppTraces row appeared — first appearance of an OTel-logs trace span in production since CS54-6 baseline (CS60-5 Gap 2 work would expand this).

---

### Day 14 — 2026-05-09 (CS60-3o)

**Captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent — closed UTC day, backfill).
**Window:** UTC day 2026-05-09.

#### App Insights tables — Day 14

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 4,780 | 3.53 |
| prod | AppRequests | 320 | 0.23 |
| prod | AppMetrics | 21 | 0.02 |
| staging | _(no rows — scale-to-zero, no traffic)_ | 0 | 0.00 |

| env | Day 14 AI total (MB) |
|---|---:|
| prod | **3.78** |
| staging | **0.00** |

#### Cost — Day 14 (DKK)

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-production     | Standard Memory Idle Usage    | 1.64 |
| gwn-production     | Standard vCPU Idle Usage      | 0.82 |
| gwn-production     | Standard vCPU Active Usage    | 0.01 |
| gwn-production     | Standard Memory Active Usage  | 0.00 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion | 0.11 |
| gwn-production     | General Purpose Data Stored - Free | 0.00 |

| Resource | Day 14 cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.00** | ✅ Staging fully at scale-to-zero — no compute meters at all (no Active, no Idle); CS58 worked for the entire UTC day. |
| gwn-production | **2.47** | Closed-day total; Active vCPU dropped to 0.01 (low-traffic day relative to Days 12/13). |
| workspace-gwnrg6bXt | **0.11** | Workspace ingestion. |
| gwn-sqldb / AI components | 0.00 | |
| **Day 14 total** | **2.58 DKK** | ≈$0.37 USD; +14d midpoint marker. |

#### Container Apps compute / memory / requests — Day 14

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | _(no data — Replicas = 0)_ | _(no data)_ | 0 | 0 | 0 |
| gwn-production | 0.0003 cores (≈265k nanocores) | 126.9 MiB | 1 | 320 | 0 |

**Notes**
- **Staging Replicas max = 0** for Day 14 — third such full-day in the 14-day window (after Days 8 and 9; Day 7 was 0 but had post-capture activity that retroactively raised it). CS58 holding cleanly when nothing pokes staging.
- Prod returned to Replicas=1 after the multi-replica run on Days 11-13.
- No restarts. No exceptions.
- This day is the canonical **+14d midpoint** marker — triggers the [+14d roll-up](#14d-midpoint-roll-up-cs60-3o) below.

---

### +7d cost-watch close-out (CS60-2h)

> **Status:** complete for the canonical +7d window (Days 0-7 covering 2026-04-25..2026-05-02). **Refreshed 2026-05-10T16:40Z with closed-day CM data** by yoga-gwn (sub-agent dispatched for CS60-3 backfill). Days 1 and 4 had material retro-fills (+1.15 DKK and +1.45 DKK respectively) once the closing-day Idle meters posted. **Days 6-7 did NOT retro-fill** — Cost Management still shows no `Standard *Idle/Active Usage` compute meters for either Container App on those days even after 8-9 days, despite Container Apps platform metrics confirming both apps were running (see Day 6 / Day 7 sections for the per-day cross-checks). The original prediction "Days 6-7 cost will retro-fill" did NOT hold — this is a confirmed CM compute-meter gap, not lag, contiguous across Days 6-9 (see [+14d roll-up § Cost Management compute-meter gap](#14d-midpoint-roll-up-cs60-3o)).
>
> **CS60-2g is intentionally unused** in this split (see plan task notes); the Manifest is the source of truth for which UTC days are recorded.

#### Days 0-7 cost roll-up (closed-day CM data, refreshed 2026-05-10)

| Day | gwn-staging $ (DKK) | gwn-production $ (DKK) | workspace $ (DKK) | Day total $ (DKK) | Notes |
|---|---:|---:|---:|---:|---|
| Day 0 — 2026-04-25 | 2.14 | 2.09 | 0.02 | **4.25** | CS58 partial (scale-to-zero applied 18:30Z) + CS54-6 verification traffic. One-time. (Re-captured: original 4.24, closed-day 4.25 — rounding only.) |
| Day 1 — 2026-04-26 | 0.04 | 2.46 | 0.02 | **2.52** | First full day at CS58 scale-to-zero on staging side; brief Active blip (0.04 DKK). (Re-captured: original 1.37 → closed-day 2.52 — **+1.15 DKK material delta**; original was T23:50Z partial-day capture.) |
| Day 2 — 2026-04-27 | 0.61 | 2.47 | 0.22 | **3.30** | Noisy CS61/CS52 activity; staging exception burst; brief staging Active charge. (No re-capture delta.) |
| Day 3 — 2026-04-28 | 0.03 | 2.46 | 0.04 | **2.53** | Prod steady; staging 0 requests / 0.00 MB AI ingest. (No re-capture delta.) |
| Day 4 — 2026-04-29 | 0.03 | 2.47 | 0.03 | **2.53** | (Re-captured: original 1.08 → closed-day 2.53 — **+1.45 DKK material delta**; original was 3h-after-close partial.) |
| Day 5 — 2026-04-30 | 0.03 | 2.48 | 0.03 | **2.54** | Closed cleanly; matches Days 1/3 prod steady-state. (Re-captured: original 2.55, closed-day 2.54 — rounding only.) |
| Day 6 — 2026-05-01 | 0.00 | 0.00 | 0.01 | **0.01** | **CM compute-meter gap (confirmed not lag).** Original prediction "expect retro-fill ≈ 1.5-2.5 DKK" did NOT materialize after 9 days. |
| Day 7 — 2026-05-02 | 0.00 | 0.00 | 0.08 | **0.08** | **CM compute-meter gap (confirmed not lag).** Closed-day re-capture filled workspace ingest 0.03 → 0.08 DKK only; compute meters absent. |
| **Closed-day 8-day total** | **2.88** | **14.43** | **0.45** | **17.76** | _Refreshed 2026-05-10. Days 6/7 still under-count compute by the same ~4 DKK gap noted in the original close-out. **Lag-corrected estimate using Day 5 prod shape (~2.48 DKK/day) for Days 6-7: ~22.7 DKK 8-day.**_ |

For comparison, the originally-recorded 8-day total at 2026-05-02T18:30Z was **15.11 DKK**. The +2.65 DKK delta came almost entirely from Day 1 (+1.15) and Day 4 (+1.45) closed-day retro-fills; Days 6/7 were unchanged.

#### +7d interpretation (refreshed 2026-05-10)

| Metric | Value | Method |
|---|---:|---|
| Closed-day total cost (Days 0-7) | 17.76 DKK (≈$2.54 USD) | Refreshed sum of closed-day values above. |
| Days 0-5 only (closed-and-billed days) | 17.67 DKK | Day 0 anomaly included. |
| Days 1-5 only (drop Day 0 anomaly) | 13.42 DKK | Steady-state proxy with closed-day Days 1+4 retro-fills. |
| Steady-state daily run-rate | **2.68 DKK/day** (≈$0.38 USD) | Sum of Day 1-5 closed totals (13.42 DKK) / 5 days. |
| Naive 7-day cost (run-rate × 7) | **18.8 DKK** (≈$2.69 USD) | Sanity-check vs recorded total. |
| 30-day projection (run-rate × 30) | **80.4 DKK/month** (≈$11.5 USD) | Above the original 65 DKK/month first-pass projection because the closed-day Days 1+4 retro-fills moved the steady-state baseline up. Re-confirmed below in the [second-pass projection (Days 0-14)](#cs60-3-second-pass-projection-days-0-14-actuals). |

#### +7d AI ingest summary (refreshed 2026-05-10)

| env | 8-day rows | 8-day MB | Notes |
|---|---:|---:|---|
| `gwn-ai-production` AppDependencies | ≥ 12,700 | ≥ 9.4 MB | Dominates production AI ingest; populating every day since Day 4 (informs CS60-4 Gap 1 disposition — prod side empirically resolved, staging side still owes a deliberate probe; see CS60-4 disposition note in plan-file). |
| `gwn-ai-production` AppRequests | ~1,000 | ~0.85 MB | Steady. |
| `gwn-ai-production` AppMetrics | ~110 | ~0.10 MB | Steady. |
| `gwn-ai-staging` (all tables) | ≥ 1,750 rows total | ≥ 1.4 MB total | Dominated by Day 7 closed-day data (1,658 dependencies, 97 requests, 14 metrics); Days 5/8 stayed at 0 (CS58 holding). |

> **Workspace-wide ingest by table for the same 8-day window** (closed-day workspace-direct KQL `union withsource=Tbl * | summarize bytes by Tbl | where TimeGenerated >= datetime(2026-04-25T00Z) and TimeGenerated < datetime(2026-05-03T00Z)`): `AppDependencies` 19.97 MB, `ContainerAppConsoleLogs_CL` 7.87 MB, `AppRequests` 1.66 MB, `AppMetrics` 0.27 MB, `ContainerAppSystemLogs_CL` 0.26 MB, `Usage` 0.09 MB, `AppExceptions` 0.05 MB. Total **30.18 MB / 8 days = 3.77 MB/day workspace-wide.** _(Original recorded 26.87 MB; the +3.31 MB delta is the post-T18:30Z portion of Day 7 plus closed-day backfill across the window.)_

#### Container Apps compute / memory — running min/max across Days 0-7 (closed-day data)

| Metric | gwn-staging (range) | gwn-production (range) |
|---|---|---|
| UsageNanoCores avg | ≈ 100 k .. ≈ 2.4 M nanocores (≈ 0.0001..0.0024 cores) | ≈ 263 k .. ≈ 290 k nanocores (≈ 0.0003 cores) |
| WorkingSetBytes avg | 69 .. ≈ 129 MiB | 66 .. ≈ 134 MiB |
| Replicas max | 1 (steady at 1 every day; first true Replicas=0 full UTC day is Day 8 — see [+14d roll-up](#14d-midpoint-roll-up-cs60-3o)) | 1 (steady) |
| Requests/day | 0..505 | 3..430 |
| RestartCount | 0 | 0 |

> Day 7 staging running max bumped UsageNanoCores up to ≈ 2.4 M (the original mid-day capture had no data because Replicas=0 at capture time; staging woke after the original capture). Replicas=0 days now correctly identified as Days 8, 9, 14 (Day 7 was 0 at the original mid-day capture but rose to 1 by close).

#### CS60-2 close interpretation (refreshed 2026-05-10)

- **Free-tier headroom is enormous**: 30.18 MB workspace ingest in 8 closed days vs 5120 MB / month free tier. Even if Day 2's anomaly recurred weekly, monthly ingest would land near 230 MB — still ≤ 5% of cap.
- **Production compute is the dominant recurring cost line** at ≈ 2.5 DKK/day (idle + active vCPU + memory), not AI ingest. AI ingest rounds to 0.00 DKK on most days. _Refreshed steady-state run-rate is 2.68 DKK/day after Days 1+4 closed-day retro-fills._
- **Staging cost was effectively zero** on Days 1, 3, 4, 5, 6, 7 (CS58 scale-to-zero is doing its job); Days 0, 2 had CS-driven activity that woke it briefly. Days 6-7 staging zeros could in principle be the CM compute-meter gap rather than CS58 — Container Apps platform metrics show staging was idle (Day 6) or briefly up post-T18:30Z (Day 7) so the absence of compute meters might be plausibly explained either way.
- **CS60-4 Gap 1 (`dependencies` table) is empirically resolved on the prod side; staging side still owes a deliberate ≥ 20-leaderboard-request probe** — see disposition note in CS60-4 row of plan-file task table. Day 7 closed-day staging data (1,658 AppDependencies + 97 AppRequests + 14 AppMetrics) is positive but not a controlled verification.
- **Days 6-7 cost did NOT retro-fill as predicted.** CM has not emitted Container Apps compute meters for Days 6-9. This is documented as a finding requiring follow-up (separate CS or CS60-4 expansion) — see [+14d roll-up § Cost Management compute-meter gap](#14d-midpoint-roll-up-cs60-3o).

---

### +14d midpoint roll-up (CS60-3o)

**Captured:** 2026-05-10T16:40Z by yoga-gwn (sub-agent dispatched by yoga-gwn for CS60-3 backfill).
**Window:** UTC days 2026-04-25 .. 2026-05-09 (15 calendar days = Day 0 .. Day 14). Day 15 (2026-05-10) is in-progress UTC and explicitly out of scope.

#### Days 0-14 cost roll-up (closed-day CM data)

| Day | Date | gwn-staging | gwn-production | workspace | Other | Total (DKK) |
|---|---|---:|---:|---:|---:|---:|
| Day 0  | 2026-04-25 | 2.14 | 2.09 | 0.02 | 0.00 | **4.25** |
| Day 1  | 2026-04-26 | 0.04 | 2.46 | 0.02 | 0.00 | **2.52** |
| Day 2  | 2026-04-27 | 0.61 | 2.47 | 0.22 | 0.00 | **3.30** |
| Day 3  | 2026-04-28 | 0.03 | 2.46 | 0.04 | 0.00 | **2.53** |
| Day 4  | 2026-04-29 | 0.03 | 2.47 | 0.03 | 0.00 | **2.53** |
| Day 5  | 2026-04-30 | 0.03 | 2.48 | 0.03 | 0.00 | **2.54** |
| Day 6  | 2026-05-01 | 0.00 ⚠️ | 0.00 ⚠️ | 0.01 | 0.00 | **0.01** |
| Day 7  | 2026-05-02 | 0.00 ⚠️ | 0.00 ⚠️ | 0.08 | 0.00 | **0.08** |
| Day 8  | 2026-05-03 | 0.00 ⚠️ | 0.00 ⚠️ | 0.13 | 0.00 | **0.13** |
| Day 9  | 2026-05-04 | 0.00 ⚠️ | 0.00 ⚠️ | 0.00 | 0.00 | **0.00** |
| Day 10 | 2026-05-05 | 0.03 | 2.12 | 0.00 | 0.00 | **2.15** |
| Day 11 | 2026-05-06 | 0.03 | 2.51 | 0.02 | 0.00 | **2.56** |
| Day 12 | 2026-05-07 | 0.04 | 2.52 | 0.11 | 0.00 | **2.67** |
| Day 13 | 2026-05-08 | 0.03 | 2.52 | 0.11 | 0.00 | **2.66** |
| Day 14 | 2026-05-09 | 0.00 | 2.47 | 0.11 | 0.00 | **2.58** |
| **Sum** | | **3.01** | **26.57** | **0.93** | **0.00** | **30.51** |

> ⚠️ rows: Days 6-9 (2026-05-01..2026-05-04) Cost Management compute-meter gap. See note below for the lag-corrected estimate.

**Lag-corrected estimate** (filling Days 6-9 with Day 5 prod baseline ≈ 2.48 DKK/day): the 4-day gap likely understates the closed-day cost by ≈ **9.9 DKK** for prod. Lag-corrected 15-day total ≈ **40.4 DKK** (≈$5.77 USD) → daily avg ≈ **2.69 DKK/day** → 30-day projection ≈ **80.8 DKK/month** (≈$11.5 USD). This bracket aligns with the [Days 10-14 closed-day-only steady-state run-rate](#cs60-3-second-pass-projection-days-0-14-actuals) of 2.52 DKK/day → 75.7 DKK/month.

#### Cost Management compute-meter gap (Days 6-9 finding)

**Pattern:** four contiguous UTC days (2026-05-01 → 2026-05-04, Days 6-9) show **zero `Standard *Idle/Active Usage` meters** for both `gwn-staging` and `gwn-production` in the Cost Management `query` API, despite:

- Container Apps platform metrics confirming both apps ran normally (Day 6: prod replicas=1, requests=88; Day 7: prod replicas=1, requests=125 + staging replicas=1, requests=94; Day 8: prod replicas=3, requests=495; Day 9: prod replicas=1, requests=17).
- App Insights AppDependencies/AppRequests/AppMetrics tables populating on those days (Day 8 alone produced 8,990 prod dependencies + 48 exceptions).
- Workspace ingestion meters (`Analytics Logs Data Ingestion`) emitting normally on those same days (0.01..0.13 DKK).
- Days 5 and 10 (immediately bracketing the gap) showing normal `Standard *Idle/Active Usage` meters in the same CM query.

**Cross-checks performed at re-capture time:**

- Re-pulled the same daily cost query 8-9 days after each UTC day closed; result identical.
- Pulled a single 15-day cost query without ResourceId grouping (broader scope) to rule out grouping artifacts; same gap visible.
- Pulled a Days 6-9 cost query grouped by `MeterCategory + MeterSubCategory + Meter`; only `SQL Database` Free-tier zero entries and `Log Analytics` ingestion appear — no `Container Apps` MeterCategory entries at all for those four days.

**Hypotheses (none verified):**

1. Cost Management has a >9-day backfill window for some Container Apps meters (longest observed elsewhere in the project: ~3 days). Unlikely but possible.
2. A monthly free credit / promotional offer absorbed Days 6-9 compute usage (matches the calendar-month boundary 2026-05-01) — but the "Standard" plan-tier meter names suggest Workload Profiles tier, which has no monthly free grant for Container Apps. Day 10 (2026-05-05) shows normal billing again, which doesn't fit a "free grant exhausted on Day N" pattern.
3. A billing-system glitch / data-pipeline incident on Azure's side. Plausible; not investigated.

**Disposition:** documented here as a finding. Recommend a follow-up CS to (a) cross-check via the Consumption / Usage Details API, (b) re-pull in 14 days to see if meters eventually emit, and (c) if still missing, file an Azure support ticket. Out of scope for this CS60-3 backfill PR (which is docs-only). **Does NOT change CS60-4/5/6 dispositions** — the cost picture remains "<$15/month under any reasonable scenario", well below CS60-3 free-tier-headroom decision thresholds.

#### +14d AI ingest summary

| env | Days 0-14 AI ingest (MB) | per-day avg | trend vs Days 0-7 |
|---|---:|---:|---|
| prod | **37.56** | 2.50 | **Rising** — Days 0-7 avg 1.59 MB/day vs Days 8-14 avg 3.55 MB/day (~2.2x). Driven by higher prod traffic on Days 8/12/13 (495/542/480 requests) and the AppExceptions/AppTraces appearing on Days 8/13. |
| staging | **9.69** | 0.65 | **Falling** — Days 0-7 avg 1.16 MB/day vs Days 8-14 avg 0.06 MB/day (~95% drop). CS58 scale-to-zero is fully effective on the post-Day-7 segment; only Day 12 had a brief operator-driven spike (0.44 MB). |

#### Workspace-wide ingest (15-day window)

Closed-day KQL `union withsource=Tbl * | where TimeGenerated >= datetime(2026-04-25T00Z) and TimeGenerated < datetime(2026-05-10T00Z) | summarize bytes by Tbl`:

| Tbl | rows | MB billed |
|---|---:|---:|
| AppDependencies | 57,852 | **43.19** |
| ContainerAppConsoleLogs_CL | 8,737 | **13.56** |
| AppRequests | 3,969 | 3.32 |
| AppMetrics | 598 | 0.53 |
| ContainerAppSystemLogs_CL | 1,189 | 0.31 |
| Usage | 536 | 0.20 |
| AppExceptions | 166 | 0.20 |
| AppTraces | 2 | 0.00 |
| **Total (15 days)** | **73,049** | **61.31 MB** |

**Daily avg:** 4.09 MB/day workspace-wide → **30-day projection 122.7 MB/month = 2.40% of 5 GB free tier.** Free-tier headroom remains ≫ 4 GB/month under every reasonable scenario.

#### Container Apps compute / memory — running min/max across Days 0-14

| Resource | UsageNanoCores avg range | WorkingSetBytes avg range | Replicas max | Requests total | Restart total |
|---|---|---|---:|---:|---:|
| gwn-staging | ≈ 100 k .. ≈ 2.4 M nanocores (≈ 0.0001..0.0024 cores) | 69 .. ≈ 132 MiB | 1 (max across days; **0 on Days 8, 9, 14**) | 888 (Days 0-14 sum) | 0 |
| gwn-production | ≈ 261 k .. ≈ 386 k nanocores (≈ 0.0003..0.0004 cores) | 66 .. ≈ 137 MiB | **3** (Day 8 burst; Days 11/12/13 all peaked at 2) | 3,374 (Days 0-14 sum) | 0 |

#### +14d interpretation

- **Free-tier headroom remains overwhelming.** Workspace-wide 15-day ingest of 61.31 MB projects to 122.7 MB/month → 2.40% of the 5 GB free tier. Even doubling that for a hypothetical incident-driven spike, monthly ingest stays under 5%. CS60-3's "free-tier headroom decision" can confidently land on **>4 GB/month free** at the 2026-05-25 final marker (CS54-9 Gap dispositions can move forward on this basis).
- **Cost trajectory is +20-25% above the original first-pass projection** but still far below any concern threshold. First-pass projected 65.1 DKK/month (steady-state Days 1-5 only); refreshed steady-state from Days 10-14 closed-day data projects 75.7 DKK/month, and the lag-corrected 15-day estimate gives 80.8 DKK/month. ≈$10.80-$11.55/month all-in, dominated by `gwn-production` Container Apps compute (idle + active vCPU + memory).
- **Days 6-9 CM compute-meter gap is the single biggest data-quality finding** of the +14d roll-up. Documented above; recommended for follow-up CS. Does NOT change any CS60 disposition because the lag-corrected estimate stays in the same monthly cost band as the recorded estimate.
- **CS60-4 prod auto-resolved status holds across Days 8-14.** AppDependencies populated every day for prod (Day 8: 8,990; Day 12: 6,984; Day 13: 7,700; Day 14: 4,780); the `tedious` `execSql` spans continue to flow through to App Insights without filter widening. **Staging-side parity still unverified** — only Day 7 (closed-day data, 1,658 dependencies) and Day 12 (522 dependencies) showed staging activity, both incidental rather than the controlled ≥20-leaderboard-request probe CS60-4 still owes.
- **CS60-5/6 dispositions can advance from "wait for CS60-3" to "decide now."** The free-tier-headroom gating input is empirically resolved (≫4 GB/month margin). CS60-5 (Pino → AI traces) recommendation can proceed on the "stay on cross-table KQL bridge" path unless an incident emerged in Days 8-14 — none observed in this data (highest exception count was 68 on Day 13, all within typical SQLITE_ERROR / 5xx-dependency-failure shape; no operator-investigation pain points cited in this window). CS60-6 (exceptions table) remains "decide-by-CS60-5" per its dependency.

---

### CS60-3 second-pass projection (Days 0-14 actuals)

> **Status:** SECOND PASS — refreshed 2026-05-10T16:40Z by yoga-gwn (sub-agent dispatched for CS60-3 backfill) using closed-day Cost Management data for Days 0-14 (15 calendar days). Replaces the original CS60-3 first-pass extrapolation built from the Days 0-7 partial-day capture. The canonical CS60-3 +30d measurement still lands at 2026-05-25 via daily ticks Day 15..Day 30; this section is a **second-pass forecast**, not the final measurement.
>
> Original first-pass projections (kept for audit context — see [+7d cost-watch close-out](#7d-cost-watch-close-out-cs60-2h) for the closed-day refresh of those days):
>
> - First-pass naive ingest: 100.8 MB/month (3.36 MB/day × 30).
> - First-pass steady-state ingest: 53.6 MB/month (1.79 MB/day × 30, dropping Day 2 spike).
> - First-pass worst-case ingest: 111.1 MB/month (steady-state + Day 2 spike weekly).
> - First-pass naive cost: 56.7 DKK/month (≈$8.10).
> - First-pass steady-state cost: 65.1 DKK/month (≈$9.30, Days 1-5 closed proxy).
> - First-pass conservative cost: 70-72 DKK/month (≈$10.00-$10.30).

#### Methodology (second pass)

1. Use the workspace-direct per-day ingest for the 15-calendar-day window 2026-04-25..2026-05-09 (Day 0 baseline through Day 14, all closed UTC days).
2. Compute four projections:
   - **Naive average** — mean of all 15 daily values × 30 days.
   - **Steady-state (Days 10-14 only, post-CM-gap)** — mean of the most recent 5 closed days where both Container Apps cost and ingest are present and behaving normally. Best forward-looking proxy.
   - **Lag-corrected (fill Days 6-9 CM gap with Day 5 prod baseline)** — replace each gap-day's missing prod compute with 2.48 DKK/day, then average. Best estimate of "what the +14d cost actually was."
   - **Worst-case (Day 8 spike recurs weekly)** — steady-state + 4× Day 8 workspace-wide ingest (8.29 MB) per 30-day period.
3. Compare ingest against 5 GB / month App Insights free tier (5120 MB).
4. For cost, same scenarios applied to closed-day daily DKK totals.

#### Per-day workspace-wide ingest (15 days, MB)

| Day | Ingest (MB) | Notes |
|---|---:|---|
| Day 0 — 2026-04-25 | 1.76 | Baseline + first traffic. |
| Day 1 — 2026-04-26 | 0.98 | Steady. |
| Day 2 — 2026-04-27 | **14.37** | Spike — CS61/CS52 activity + staging exception burst. |
| Day 3 — 2026-04-28 | 2.52 | Steady. |
| Day 4 — 2026-04-29 | 2.20 | Steady. |
| Day 5 — 2026-04-30 | 2.21 | Steady. |
| Day 6 — 2026-05-01 | 0.90 | Steady; CM compute-meter gap day (no impact on ingest). |
| Day 7 — 2026-05-02 | 5.24 | Closed-day re-pull (was 1.94 partial). CM compute-meter gap. |
| Day 8 — 2026-05-03 | **8.29** | Highest single-day; 8,990 prod AppDependencies + 48 prod AppExceptions; replicas peaked at 3. CM compute-meter gap. |
| Day 9 — 2026-05-04 | 0.21 | CM compute-meter gap. |
| Day 10 — 2026-05-05 | 0.21 | First post-gap day; CM compute meters resume normally. |
| Day 11 — 2026-05-06 | 1.47 | Steady; prod replicas peaked at 2. |
| Day 12 — 2026-05-07 | 6.82 | Steady; brief staging activity (522 deps, 50 requests); prod replicas peaked at 2. |
| Day 13 — 2026-05-08 | **7.14** | 68 prod exceptions (highest single-day) + first AppTraces row of window. |
| Day 14 — 2026-05-09 | 7.00 | Steady. |
| **15-day total** | **61.31 MB** | _(closed-day workspace-wide; matches the per-table breakdown in [§ +14d midpoint roll-up](#14d-midpoint-roll-up-cs60-3o); per-day rounded values sum to 61.32 MB due to per-row rounding.)_ |

#### 30-day ingest projections vs 5 GB free tier (refreshed)

| Scenario | Daily avg | 30-day projection | % of 5 GB free tier | Headroom | vs first pass |
|---|---:|---:|---:|---:|---|
| Naive (all 15 days) | 4.09 MB/day | **122.7 MB/month** | 2.40 % | 4997 MB | +21.9 MB vs first-pass naive (100.8 MB) |
| Steady-state (Days 10-14 only) | 4.53 MB/day | **135.8 MB/month** | 2.65 % | 4984 MB | +82.2 MB vs first-pass steady-state (53.6 MB) — first pass under-estimated because CS58 was new and prod traffic was lower in Days 0-5 |
| Lag-corrected naive (gap days unchanged for ingest) | 4.09 MB/day | **122.7 MB/month** | 2.40 % | 4997 MB | (CM gap is cost-only; ingest meters are unaffected) |
| Worst-case (Day 8 spike recurs weekly: +4 × 8.29 MB / 30d) | (4.53 × 30) + (8.29 × 4) = 135.8 + 33.2 | **169.0 MB/month** | 3.30 % | 4951 MB | +57.9 MB vs first-pass worst-case (111.1 MB) |

> **Conclusion:** even under the second-pass worst-case (Day 8 spike weekly), 30-day workspace ingest lands at ≈ 3.2 % of the 5 GB free tier — well within the "free-tier headroom not material" disposition. The first-pass steady-state under-estimated by ~80 MB but the policy conclusion is unchanged: **>4 GB/month margin under every observed scenario.** CS54-9's "wait for CS60-3 to decide" gating input for CS60-4/5/6 is empirically resolved.

#### 30-day cost projections (refreshed with closed-day data)

| Scenario | Daily avg | 30-day projection | Notes | vs first pass |
|---|---:|---:|---|---|
| Naive recorded (30.51 DKK / 15 days) | 2.03 DKK/day | **61.0 DKK/month** (≈$8.71 USD) | Under-counts by Days 6-9 CM gap. | +4.3 DKK vs first-pass naive (56.7) |
| Lag-corrected (Days 6-9 filled with Day 5 baseline 2.48/day) | 2.69 DKK/day | **80.8 DKK/month** (≈$11.55 USD) | Best estimate of actual +14d cost. | +24.1 DKK vs first-pass naive |
| Steady-state (Days 10-14 only, post-gap) | 2.52 DKK/day | **75.7 DKK/month** (≈$10.81 USD) | Best forward-looking proxy. | +10.6 DKK vs first-pass steady-state (65.1) |
| Conservative (steady-state + 1 Day 0-class anomaly per 30d) | n/a | **≈ 80-82 DKK/month** (≈$11.45-$11.70 USD) | Adds 4.25 DKK once per month for a CS58-style scale-event or large verification burst. | +10 DKK vs first-pass conservative (70-72) |

> **What changed vs first-pass:** the +20-25% cost upward revision came mostly from prod traffic rising in Days 8-14 (3.55 MB/day AI ingest vs 1.59 MB/day in Days 0-7), bumping `gwn-production` Active Usage meters slightly higher when CM was emitting them. **Cost composition is unchanged:** virtually 100% is `gwn-production` Container Apps compute. AI ingest cost remains sub-0.05 DKK/day on every day.

#### Days 6-9 CM compute-meter gap — projection-side handling

Cost Management has not emitted `Standard *Idle/Active Usage` meters for Days 6-9 (2026-05-01..2026-05-04) for either Container App. See [+14d roll-up § Cost Management compute-meter gap](#14d-midpoint-roll-up-cs60-3o) for the cross-checks performed and recommended follow-up.

For the 30-day projection, the **lag-corrected scenario (80.8 DKK/month)** is the most defensible figure to cite externally because:

1. Container Apps platform metrics confirm both apps were running on Days 6-9 at typical replica/request shapes.
2. Days 5 and 10 (immediately bracketing the gap) show normal compute meters at ≈ 2.48 DKK/day prod baseline.
3. Filling Days 6-9 with Day 5 baseline gives 4 × 2.48 = 9.9 DKK retro-fill, lifting 15-day total from 30.51 → 40.4 DKK.

If CM eventually retro-fills the gap (recommended check: re-pull at 2026-05-25 alongside the +30d final measurement), the lag-corrected projection should land within ±5 DKK of whatever CM emits.

#### Sensitivity check — what would change the picture?

- **A real production incident** with prolonged exception storms or 100×-amplified traffic. Day 2's 14.37 MB and Day 8's 8.29 MB both came from known-cause bursts; if a real prod incident produced a similar 24h spike on `gwn-production`, daily ingest could hit 30-50 MB. Even then, 30-day total stays well under 1 GB.
- **Enabling additional auto-instrumentations** (CS60-4 Gap 1 widening, or future logs SDK in CS60-5). Days 0-14 AppDependencies = 43.19 MB at 2.88 MB/day; doubling that via filter widening still leaves ≥ 4.7 GB free-tier headroom monthly.
- **Container Apps replica scaling** — if `gwn-production` were ever forced above `replicaCount: 1` for sustained traffic, compute cost scales linearly and dwarfs telemetry. Day 8's brief replicas=3 burst shows the autoscaler engages cleanly without runaway cost (Day 8 prod cost was inside the CM gap so we can't isolate the burst contribution; Day 11/12/13 each peaked at replicas=2 and cost 2.51-2.52 DKK/day, indistinguishable from baseline). Telemetry policy is not the lever to pull on cost.
- **Days 6-9 CM gap retro-fills** — would shift the naive projection from 61.0 → ~80 DKK/month, matching the lag-corrected scenario. No policy change either way.

> **Bottom line for CS60-3 / CS60-4 / CS60-5 / CS60-6 dispositions:** with 14 days of actuals, every projection scenario stays under ≈$12/month and 5 GB free-tier ingest stays under ≈3.2 % utilisation. CS54-9's "wait for CS60-3 to decide" framing can advance to a final recommendation at the +30d marker (2026-05-25). CS60-4's prod side is empirically resolved (43.19 MB AppDependencies in 15 days = 0.84% of free tier); staging side still owes a deliberate ≥20-leaderboard-request probe (Day 7 closed-day data + Day 12 incidental activity are positive signals but not controlled verification). CS60-5 (Pino → AI traces) and CS60-6 (exceptions table) gating input is resolved — both can decide on logic-clarity / operator-pain criteria rather than cost.

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
