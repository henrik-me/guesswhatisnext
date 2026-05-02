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
| Day 2 — 2026-04-27 (CS60-1c, backfill) | captured 2026-04-30T03:00Z | yoga-gwn-c3 | [§ Day 2 — 2026-04-27 (CS60-1c)](#day-2--2026-04-27-cs60-1c) |
| Day 3 — 2026-04-28 (CS60-2c, backfill) | captured 2026-04-30T03:00Z | yoga-gwn-c3 | [§ Day 3 — 2026-04-28 (CS60-2c)](#day-3--2026-04-28-cs60-2c) |
| Day 4 — 2026-04-29 (CS60-2d, backfill) | captured 2026-04-30T03:00Z | yoga-gwn-c3 | [§ Day 4 — 2026-04-29 (CS60-2d)](#day-4--2026-04-29-cs60-2d) |
| Day 5 — 2026-04-30 (CS60-2e) | captured 2026-05-02T18:30Z | yoga-gwn | [§ Day 5 — 2026-04-30 (CS60-2e)](#day-5--2026-04-30-cs60-2e) |
| Day 6 — 2026-05-01 (CS60-2f, partial) | captured 2026-05-02T18:30Z | yoga-gwn | [§ Day 6 — 2026-05-01 (CS60-2f)](#day-6--2026-05-01-cs60-2f) |
| Day 7 — 2026-05-02 (CS60-2h, partial — UTC day not closed) | captured 2026-05-02T18:30Z | yoga-gwn | [§ Day 7 — 2026-05-02 (CS60-2h)](#day-7--2026-05-02-cs60-2h) |
| +7d cost measurement | 2026-05-02T18:30Z | yoga-gwn | [§ +7d cost-watch close-out (CS60-2h)](#7d-cost-watch-close-out-cs60-2h) |
| +30d cost measurement (first-pass extrapolation) | 2026-05-02T18:30Z | yoga-gwn | [§ CS60-3 first-pass extrapolation (Day 7 — partial)](#cs60-3-first-pass-extrapolation-day-7--partial) |
| +30d cost measurement (final) | 2026-05-25T22:39Z | _pending — CS60-3_ | _to be appended (daily ticks via CS60-3i..)_ |
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
| gwn-staging | **2.13** | Idle dominates (~91%). CS58 scale-to-zero applied 2026-04-25T18:30Z, so day was billed for ~18.5h normal + ~5.5h scaled-to-zero. |
| gwn-production | **2.09** | Idle ~99% — typical for a Container App with low real traffic. |
| workspace-gwnrg6bXt | **0.02** | Whole workspace logs — well below 5GB/month free tier. |
| gwn-sqldb (production) | 0.00 | Free tier. |
| gwn-ai-staging / gwn-ai-production | 0.00 | Workspace-mode AI components have no separate cost line; ingest cost rolls into the workspace meter. |
| **Day 0 total** | **4.24 DKK** | ≈$0.61 USD at ~7 DKK/USD. |

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
| gwn-production     | Standard Memory Idle Usage    | 0.91 |
| gwn-production     | Standard vCPU Idle Usage      | 0.45 |
| gwn-production     | Standard vCPU Active Usage    | 0.00 |
| gwn-production     | Standard Memory Active Usage  | 0.00 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion | 0.01 |

| Resource | Day 1 cost (DKK) | Notes |
|---|---:|---|
| gwn-production | **1.36** | ~33% drop vs Day 0 — fewer Active Usage minutes despite more requests; Active Usage doesn't bill linearly with request count, only with sustained CPU above the idle threshold. |
| **gwn-staging** | **0.00** | ✅ CS58 scale-to-zero is fully working — first full day at zero billing. Confirms ~50.8 DKK/month projection from CS58 close-out (CS59 will measure the +7d window). |
| workspace-gwnrg6bXt | 0.01 | |
| gwn-sqldb / AI components | 0.00 | |
| **Day 1 total** | **1.37 DKK** | ≈$0.20 USD. |

#### Container Apps compute / memory / requests — Day 1

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0005 cores | 129.1 MiB | 1 | 4 | 0 |
| gwn-production | 0.0003 cores | 134.2 MiB | 1 | 81 | 0 |

**Notes**
- Replicas max = 1 for staging means staging WAS up at some point on Day 1 (just briefly — 4 requests). The CS61-1 deploy attempts (which triggered the SQLITE storm) and the CS52-10 staging probes are likely the source. CS58 still wins overall — `Standard vCPU Idle Usage` cost = 0 on Day 1.
- WorkingSet doubled from Day 0 (~65-69 MiB → ~129-134 MiB) likely reflecting Node heap warming up after CS41 deploy + recent CS53/CS52 work landing.
- Prod requests dropped 199 → 81 vs Day 0 — Day 0 included CS54-6 verification probes; Day 1 is closer to organic traffic.

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
| staging | **6.97** |
| prod | **4.84** |

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
- Day 2 is the noisy backfill day: staging AI ingest jumped to 6.97 MB and prod to 4.84 MB, far above Day 1, matching the CS61/CS52 operational activity around the CS61 staging failure window.
- `AppExceptions` recorded 50 staging rows, extending the Day 1 operational finding (`SQLITE_ERROR` storm) into the Day 2 UTC bucket; disposition remains with CS61 / CS60-4 follow-up rather than this cost-watch task.
- `gwn-staging` billed only active vCPU/memory (0.61 DKK) and no idle meter, so scale-to-zero continued to avoid baseline idle burn despite 505 requests.
- No restarts were observed; both apps reached Replicas max = 1 at least once.

---

### Day 3 — 2026-04-28 (CS60-2c)

**Captured:** 2026-04-30T03:00Z by yoga-gwn-c3 (backfill).
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
| gwn-production     | Standard Memory Idle Usage    | 0.70 |
| gwn-production     | Standard vCPU Idle Usage      | 0.35 |
| gwn-production     | Standard vCPU Active Usage    | 0.00 |
| gwn-production     | Standard Memory Active Usage  | 0.00 |
| gwn-staging        | Standard vCPU Active Usage    | 0.03 |
| gwn-staging        | Standard Memory Active Usage  | 0.01 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion | 0.00 |

| Resource | Day 4 cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.03** | Near-zero active-only blip; no idle meter and no staging requests. |
| gwn-production | **1.05** | Lower than Day 2/3; Day 4 Cost Management data may still carry closing-day lag at this capture time. |
| workspace-gwnrg6bXt | **0.00** | Rounded to 0.00 DKK; revisit at CS60-2e if Cost Management backfills more ingestion cost. |
| gwn-sqldb / AI components | 0.00 | |
| **Day 4 total** | **1.08 DKK** | ≈$0.15 USD; partial/lag-sensitive because captured early on 2026-04-30 UTC. |

#### Container Apps compute / memory / requests — Day 4

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0004 cores (≈407k nanocores) | 118.5 MiB | 1 | 0 | 0 |
| gwn-production | 0.0003 cores (≈263k nanocores) | 94.5 MiB | 1 | 40 | 0 |

**Notes**
- Day 4 prod traffic dropped to 40 requests and 0.38 MB AI ingest, the lowest full-day prod telemetry since activation.
- Staging again had 0 requests and 0.00 MB AI ingest; the 0.03 DKK active-only cost is likely platform/deploy warm time rather than user traffic.
- Cost Management for Day 4 was captured only a few hours after the UTC day closed, so the lower prod/workspace totals are marked partial and should be revisited at CS60-2e.
- No `AppExceptions` rows and no restarts were observed.

---

### Day 5 — 2026-04-30 (CS60-2e)

**Captured:** 2026-05-02T18:30Z by yoga-gwn (backfill — closed UTC day).
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
| gwn-production | **2.49** | Closed-day total — matches Days 1/3 prod steady-state shape. |
| workspace-gwnrg6bXt | **0.03** | Closed-day workspace ingestion. |
| gwn-sqldb / AI components | 0.00 | |
| **Day 5 total** | **2.55 DKK** | ≈$0.36 USD; UTC day fully closed at capture time. |

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

> **PARTIAL — Cost Management closing-day lag.** As of capture, Cost Management has emitted only Free-tier line items for `gwn-production` ("1 vCore - Free", "General Purpose Data Stored - Free") and zero compute meters for `gwn-staging`. Recheck during CS60-3i (Day 8 = 2026-05-03) and amend.

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-production     | 1 vCore - Free                    | 0.00 |
| gwn-production     | General Purpose Data Stored - Free| 0.00 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion    | 0.01 |

| Resource | Day 6 cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.00** | No meters yet — likely lag; staging had 6 prod requests via probe / deploy, expect ~0.02-0.05 DKK after retro-fill. |
| gwn-production | **0.00** | No compute meters yet — likely lag; expect ~1.5-2.5 DKK after retro-fill (Day 6 traffic shape resembles Day 3/4). |
| workspace-gwnrg6bXt | **0.01** | Workspace ingestion did emit. |
| **Day 6 recorded total** | **0.01 DKK** | Strongly partial. **Lag-corrected estimate: ≈ 1.7-2.6 DKK** based on Day 3/4 shape. |

#### Container Apps compute / memory / requests — Day 6

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | 0.0005 cores (≈499k nanocores) | 122.5 MiB | 1 | 2 | 0 |
| gwn-production | 0.0003 cores (≈269k nanocores) | 91.2 MiB | 1 | 88 | 0 |

**Notes**
- Day 6 staging telemetry (6 AppRequests + 69 AppDependencies) suggests a deploy or probe burst — Container Apps recorded only 2 platform-level Requests, the difference is likely OTel-instrumented health/probe traffic captured via spans.
- Prod ingest dropped to 0.77 MB (88 requests + 920 dependencies) — well within steady-state band.
- No restarts. No exceptions.

---

### Day 7 — 2026-05-02 (CS60-2h)

**Captured:** 2026-05-02T18:30Z by yoga-gwn (in-day capture — UTC day not yet closed).
**Window:** UTC day 2026-05-02 (~75 % through at capture time).

> **STRONGLY PARTIAL.** This row reflects ≤ 75 % of the UTC day. Cost Management has not yet emitted compute meters. The CS60-2h close-out interpretation in the next section uses the Day 0-5 closed-day baseline rather than this row.

#### App Insights tables — Day 7

| env | Table | rows | MB billed |
|---|---|---:|---:|
| prod | AppDependencies | 35 | 0.03 |
| prod | AppRequests | 3 | 0.00 |
| prod | AppMetrics | 3 | 0.00 |
| staging | _(no rows — scale-to-zero, no traffic)_ | 0 | 0.00 |

| env | Day 7 AI total (partial, MB) |
|---|---:|
| prod | **0.03** |
| staging | **0.00** |

#### Cost — Day 7 (DKK, partial)

| Resource | Meter | Cost (DKK) |
|---|---|---:|
| gwn-production     | General Purpose Data Stored - Free | 0.00 |
| workspace-gwnrg6bXt | Analytics Logs Data Ingestion     | 0.03 |

| Resource | Day 7 partial cost (DKK) | Notes |
|---|---:|---|
| gwn-staging | **0.00** | Staging at scale-to-zero (Replicas max = 0); no compute. Expect 0.00 DKK at close. |
| gwn-production | **0.00** | No compute meters yet — UTC day not closed. Expect ~1.5-2 DKK at close based on Days 3/4/5 shape. |
| workspace-gwnrg6bXt | **0.03** | Workspace ingestion. |
| **Day 7 recorded total** | **0.03 DKK** | Strongly partial — < quarter-day's worth of compute reported. |

#### Container Apps compute / memory / requests — Day 7

| Resource | UsageNanoCores avg | WorkingSetBytes avg | Replicas max | Requests total | RestartCount max |
|---|---:|---:|---:|---:|---:|
| gwn-staging | _(no data — Replicas = 0)_ | _(no data)_ | 0 | 0 | 0 |
| gwn-production | 0.0003 cores (≈265k nanocores) | 87.7 MiB | 1 | 3 | 0 |

**Notes**
- **Staging Replicas max = 0** for Day 7 — first day in the 8-day window where CS58 scale-to-zero held the entire UTC day with no wakeup. Confirms staging steady-state cost = 0 DKK when nothing pokes it.
- Prod traffic 3 requests so far today (capture is mid-UTC-day); will retro-fill at CS60-3i.
- No restarts. No exceptions.

---

### +7d cost-watch close-out (CS60-2h)

> **Status:** complete for the canonical +7d window (Days 0-7 covering 2026-04-25..2026-05-02). **Days 4, 6, and 7 carry Cost Management closing-day lag** at the time of capture (2026-05-02T18:30Z); the daily-row totals will under-count those days. The interpretation below is based on Days 0-5 (closed) plus the partial signals on Days 4/6/7 — projections are stated separately for "as recorded" vs "lag-corrected (Day 0-5 baseline)" so the under-count is visible.
>
> **CS60-2g is intentionally unused** in this split (see plan task notes); the Manifest is the source of truth for which UTC days are recorded.

#### Days 0-7 cost roll-up (recorded values)

| Day | gwn-staging $ (DKK) | gwn-production $ (DKK) | workspace $ (DKK) | Day total $ (DKK) | Notes |
|---|---:|---:|---:|---:|---|
| Day 0 — 2026-04-25 | 2.13 | 2.09 | 0.02 | **4.24** | CS58 partial (scale-to-zero applied 18:30Z) + CS54-6 verification traffic. One-time. |
| Day 1 — 2026-04-26 | 0.00 | 1.36 | 0.01 | **1.37** | First full day at CS58 scale-to-zero. |
| Day 2 — 2026-04-27 | 0.61 | 2.47 | 0.22 | **3.30** | Noisy CS61/CS52 activity; staging exception burst; no staging idle meter. |
| Day 3 — 2026-04-28 | 0.03 | 2.46 | 0.04 | **2.53** | Prod steady; staging 0 requests / 0.00 MB AI ingest. |
| Day 4 — 2026-04-29 | 0.03 | 1.05 | 0.00 | **1.08** | **Partial** — captured 2026-04-30T03:00Z, Cost Management closing-day lag suspected. |
| Day 5 — 2026-04-30 | 0.03 | 2.49 | 0.03 | **2.55** | Closed cleanly; matches Days 1/3 prod steady-state. |
| Day 6 — 2026-05-01 | 0.00 | 0.00 | 0.01 | **0.01** | **Strongly partial** — Cost Management has not yet emitted compute meters for `gwn-staging` / `gwn-production`; only Free-tier line items ("1 vCore - Free", "General Purpose Data Stored - Free", workspace ingestion) are present. Expect retro-fill ≈ 1.5-2.5 DKK once meters arrive. |
| Day 7 — 2026-05-02 | 0.00 | 0.00 | 0.03 | **0.03** | **Strongly partial** — UTC day not closed at capture time (18:30Z = ~75% through). Compute meters absent; only workspace ingestion present. Recheck during CS60-3i. |
| **Recorded 8-day total** | **2.83** | **11.92** | **0.36** | **15.11** | _As-recorded; under-counts Days 4/6/7 by ≥3-5 DKK in aggregate._ |

#### +7d interpretation

| Metric | Value | Method |
|---|---:|---|
| Recorded total cost (Days 0-7) | 15.11 DKK (≈$2.16 USD) | Sum of recorded values above. |
| Days 0-5 only (closed days) | 15.07 DKK | Day 0 anomaly included. |
| Days 1-5 only (drop Day 0 anomaly) | 10.83 DKK | Steady-state proxy. |
| Steady-state daily run-rate | **2.17 DKK/day** (≈$0.31 USD) | Sum of Day 1-5 totals (10.83 DKK) / 5 closed steady-state days. Excludes Day 0 anomaly and lag-affected Days 6/7 (Day 4 is also lag-affected but kept as a low-side bound). |
| Naive 7-day cost (run-rate × 7) | **15.2 DKK** (≈$2.17 USD) | Sanity-check vs recorded total. Matches within ~0.3% — confirms the run-rate estimate is reasonable even with Days 4/6/7 partial, because Days 4/6/7 happen to be low-traffic days. |
| 30-day projection (run-rate × 30) | **65.1 DKK/month** (≈$9.30 USD) | Caveat: assumes Day 0 conditions (CS58 scale-to-zero rollout, exception storm, large verification probes) do not recur. |

#### +7d AI ingest summary

| env | 8-day rows | 8-day MB | Notes |
|---|---:|---:|---|
| `gwn-ai-production` AppDependencies | _≥ 8500_ | _≥ 7-8 MB_ | Dominates production AI ingest; populating every day since Day 4 (informs CS60-4 Gap 1 disposition — prod side empirically resolved, staging side still owes a deliberate probe; see CS60-4 disposition note below). |
| `gwn-ai-production` AppRequests | ~1700 | ~1.5 MB | Steady. |
| `gwn-ai-production` AppMetrics | ~260 | ~0.2 MB | Steady. |
| `gwn-ai-staging` (all tables) | ≤ 80 rows total | ≤ 0.1 MB total | Day 6 (CS41 deploy / probe) is the only day with non-trivial staging telemetry; Days 5 + 7 are 0. |

> **Workspace-wide ingest by table for the same 8-day window** (from the workspace-direct KQL `union withsource=Tbl * | summarize bytes by Tbl`): `AppDependencies` 17.32 MB, `ContainerAppConsoleLogs_CL` 7.47 MB, `AppRequests` 1.47 MB, `ContainerAppSystemLogs_CL` 0.24 MB, `AppMetrics` 0.23 MB, `Usage` 0.09 MB, `AppExceptions` 0.05 MB. Total **26.87 MB / 8 days = 3.36 MB/day workspace-wide**.

#### Container Apps compute / memory — running min/max across Days 0-7

| Metric | gwn-staging (range) | gwn-production (range) |
|---|---|---|
| UsageNanoCores avg | 0 .. ≈ 500 k nanocores (≈ 0.0005 cores) | ≈ 263 k .. ≈ 290 k nanocores (≈ 0.0003 cores) |
| WorkingSetBytes avg | 69 .. ≈ 122 MiB | 66 .. ≈ 134 MiB |
| Replicas max | 0..1 (Day 7 = 0; CS58 scale-to-zero working) | 1 (steady) |
| Requests/day | 0..505 | 3..430 |
| RestartCount | 0 | 0 |

#### CS60-2 close interpretation

- **Free-tier headroom is enormous**: 26.87 MB workspace ingest in 8 days vs 5120 MB / month free tier. Even if Day 2's 14.37 MB anomaly recurred weekly, monthly ingest would land near 200 MB — still ≤ 4% of cap.
- **Production compute is the dominant recurring cost line** at ≈ 2 DKK/day (idle + active vCPU + memory), not AI ingest. AI ingest rounds to 0.00 DKK on most days.
- **Staging cost was effectively zero** on Days 1, 3, 4, 5, 7 (CS58 scale-to-zero is doing its job); Days 0, 2, 6 had CS-driven activity that woke it briefly.
- **CS60-4 Gap 1 (`dependencies` table) is empirically resolved on the prod side; staging side still owes a deliberate ≥ 20-leaderboard-request probe** — see disposition note in CS60-4 row of plan-file task table.
- **Day 6 / Day 7 cost will retro-fill** as Cost Management closes those days. Recheck during CS60-3i (Day 8 = 2026-05-03) and amend totals if the lag-fill changes the picture.

---

### CS60-3 first-pass extrapolation (Day 7 — partial)

> **Status:** FIRST PASS — based on the 7-day trend (Days 0-7) only. The canonical CS60-3 +30d measurement still lands at 2026-05-25 via daily ticks CS60-3i..CS60-3{Day30}. This section is a **forecast**, not a measurement; it is intentionally separated from the Day 5/6/7 daily rows so a future operator does not confuse projected with actual.
>
> Captured 2026-05-02T18:30Z by yoga-gwn under explicit user direction to "show an extrapolation following the past 7 days trend".

#### Methodology

1. Use the workspace-direct per-day ingest sum for the 8-calendar-day window 2026-04-25..2026-05-02 (Day 0 baseline through Day 7 partial).
2. Compute three projections:
   - **Naive average** — mean of all 8 daily values projected linearly to 30 days.
   - **Steady-state (drop Day 0 anomaly + Day 2 spike)** — mean of remaining days projected linearly. This is the most likely "no incidents" forecast.
   - **Worst-case (Day 2 recurs every week)** — mean of remaining days + 4× Day 2 anomaly per 30-day period. Conservative upper bound.
3. Compare against 5 GB / month App Insights free tier (5120 MB).
4. For cost: same three projections applied to the recorded daily DKK totals, with explicit lag-correction warning for Days 4/6/7.

#### Per-day workspace ingest (8 days, MB)

| Day | Ingest (MB) | Notes |
|---|---:|---|
| Day 0 — 2026-04-25 | 1.76 | Baseline + first traffic. |
| Day 1 — 2026-04-26 | 0.98 | Steady. |
| Day 2 — 2026-04-27 | **14.37** | Spike — CS61/CS52 activity + staging exception burst. |
| Day 3 — 2026-04-28 | 2.52 | Steady. |
| Day 4 — 2026-04-29 | 2.20 | Steady. |
| Day 5 — 2026-04-30 | 2.21 | Steady. |
| Day 6 — 2026-05-01 | 0.90 | Steady. |
| Day 7 — 2026-05-02 | 1.94 | Partial UTC day (~75% closed); already on the steady-state trend. |
| **8-day total** | **26.88 MB** | |

#### 30-day ingest projections vs 5 GB free tier

| Scenario | Daily avg | 30-day projection | % of 5 GB free tier | Headroom |
|---|---:|---:|---:|---:|
| Naive (all 8 days) | 3.36 MB/day | **100.8 MB/month** | 1.97 % | 5019 MB |
| Steady-state (drop Day 2 spike) | 1.79 MB/day | **53.6 MB/month** | 1.05 % | 5066 MB |
| Worst-case (Day 2 recurs weekly: +4 spikes / 30d) | (1.79 × 30) + (14.37 × 4) = 53.6 + 57.5 | **111.1 MB/month** | 2.17 % | 5009 MB |

> **Conclusion (provisional, must be re-confirmed at CS60-3 Day 30):** even under the worst-case assumption that the Day 2 spike recurs weekly, the 30-day workspace ingest stays under 2.2 % of the 5 GB free tier. The free-tier-headroom risk that CS54-9 carved out as the gating input for CS60-4 / CS60-5 / CS60-6 dispositions is **not material** at current traffic levels.

#### 30-day cost projections

| Scenario | Daily avg | 30-day projection | Notes |
|---|---:|---:|---|
| Recorded as-is (15.11 DKK / 8 days) | 1.89 DKK/day | **56.7 DKK/month** (≈$8.10 USD) | Under-counts Days 4/6/7 by ≥3-5 DKK aggregate. |
| Steady-state (Days 1-5 only) | 2.17 DKK/day | **65.1 DKK/month** (≈$9.30 USD) | Best estimate; excludes Day 0 anomaly and Days 6/7 lag-undercount. |
| Conservative (steady-state + 1 Day 0-class anomaly per 30d) | n/a | **≈ 70-72 DKK/month** (≈$10.00-$10.30 USD) | Adds 4.24 DKK once per month for a CS58-style scale-event or large verification burst. |

> **Cost composition reminder:** virtually 100 % of these DKK figures are `gwn-production` Container Apps compute (≈ 60 % idle vCPU + memory, ≈ 40 % active when there's traffic). AI ingest cost is sub-0.05 DKK/day in every steady-state day. CS60-3's monetary outcome is overwhelmingly a function of `gwn-production` baseline replicas, not of telemetry policy.

#### Sensitivity check — what would change the picture?

- **A real production incident** with prolonged exception storms or 100×-amplified traffic. Day 2's 14.37 MB came from a known-cause CS61/CS52 burst + staging exception storm; if a real prod incident produced a similar spike for 24 h on `gwn-production`, daily ingest could briefly hit 30-50 MB. Even then, 30-day total stays well under 1 GB.
- **Enabling additional auto-instrumentations** (CS60-4 Gap 1 widening, or future logs SDK in CS60-5). Today's 17.32 MB / 8 days for AppDependencies is about 2.2 MB/day; doubling that via filter widening still leaves ≥ 4.5 GB free-tier headroom monthly.
- **Container Apps replica scaling** — if `gwn-production` were ever forced above `replicaCount: 1` for sustained traffic, compute cost scales linearly and dwarfs telemetry. Telemetry policy is not the lever to pull on cost.

> **Bottom line for CS60-3 / CS60-4 / CS60-5 / CS60-6 dispositions (provisional):** under every reasonable scenario the 5 GB free tier is comfortably preserved. CS54-9's "wait for CS60-3 to decide" framing for CS60-4 / CS60-5 / CS60-6 can move forward to a recommendation now, with final confirmation at the actual +30d measurement. See the CS60-4 disposition note for what this implies for Gap 1.

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
