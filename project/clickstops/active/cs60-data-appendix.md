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
| +7d cost measurement | 2026-05-02T22:39Z | _pending — CS60-2_ | _Day 2 recorded as CS60-1c; remaining daily ticks via CS60-2e, CS60-2f, and CS60-2h (CS60-2g unused)_ |
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

### +7d cost-watch summary (CS60-2h preview — partial)

> **Status:** PARTIAL — Day 0 through Day 4 are recorded. CS60-2e, CS60-2f, and CS60-2h (Days 5-7 = 2026-04-30..2026-05-02) will append daily rows as their windows close; CS60-2g is not used for a daily tick in the current split, so the Manifest remains the source of truth. Day 4 cost may still have Cost Management closing-day lag and should be rechecked at CS60-2e.

#### Days observed so far (5 of 7)

| Day | gwn-staging $ (DKK) | gwn-production $ (DKK) | workspace $ (DKK) | Day total $ (DKK) | Notes |
|---|---:|---:|---:|---:|---|
| Day 0 — 2026-04-25 | 2.13 | 2.09 | 0.02 | **4.24** | CS58 partial (scale-to-zero applied 18:30Z) + CS54-6 verification traffic. |
| Day 1 — 2026-04-26 | 0.00 | 1.36 | 0.01 | **1.37** | First full day at CS58 scale-to-zero. |
| Day 2 — 2026-04-27 | 0.61 | 2.47 | 0.22 | **3.30** | Noisy CS61/CS52 activity; staging exception burst; no staging idle meter. |
| Day 3 — 2026-04-28 | 0.03 | 2.46 | 0.04 | **2.53** | Prod steady; staging 0 requests / 0.00 MB AI ingest. |
| Day 4 — 2026-04-29 | 0.03 | 1.05 | 0.00 | **1.08** | Partial/lag-sensitive Cost Management close; recheck at CS60-2e. |
| Day 5 — 2026-04-30 | _pending CS60-2e_ | _pending_ | _pending_ | _pending_ | |
| Day 6 — 2026-05-01 | _pending CS60-2f_ | _pending_ | _pending_ | _pending_ | |
| Day 7 — 2026-05-02 | _pending CS60-2h_ | _pending_ | _pending_ | _pending_ | **Canonical +7d window — interpretive close-out for CS60-2.** CS60-2g is not used for a daily tick in the current split. |

#### 5-day preview — running totals & extrapolations

| Metric | gwn-staging | gwn-production | workspace | Total |
|---|---:|---:|---:|---:|
| Cost so far (5 days) | 2.80 DKK | 9.43 DKK | 0.29 DKK | **12.52 DKK** |
| Daily avg (5 days) | 0.56 DKK/day | 1.89 DKK/day | 0.06 DKK/day | **2.50 DKK/day** |
| Naive 7-day projection | 3.92 DKK | 13.20 DKK | 0.41 DKK | **17.53 DKK** (≈$2.50 USD) |
| Naive 30-day projection | 16.8 DKK | 56.6 DKK | 1.74 DKK | **75.1 DKK/month** (≈$10.73 USD) |

> **Caveat (must read before quoting these numbers):** The 5-day projection still blends one-time conditions: Day 0 pre-CS58 staging idle billing, Day 2 staging/prod verification and exception-storm noise, and Day 4 Cost Management closing-day lag. The steady-state staging cost remains closer to 0.00 DKK/day than the 0.56 DKK/day average when no deploy/probe traffic wakes it; prod remains the dominant recurring cost at roughly 1.9 DKK/day in this sample.
>
> The +7d data added through CS60-2e, CS60-2f, and CS60-2h will replace this preview with the actual measurement.

#### Container Apps compute / memory — running min/max

| Metric | gwn-staging (Day 0..4 range) | gwn-production (Day 0..4 range) |
|---|---|---|
| UsageNanoCores avg | 0.0001..0.0019 cores | 0.0001..0.0003 cores |
| WorkingSetBytes avg | 69..129 MiB | 66..134 MiB |
| Replicas max | 1 | 1 |
| Requests/day | 0..505 | 40..430 |
| RestartCount | 0 | 0 |

> Will be tracked across all 7 days at CS60-2h close.

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
