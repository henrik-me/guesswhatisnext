# CS60 — Data Appendix (cost & telemetry actuals)

**Status:** companion to [`planned_cs60_post-cs54-observability-followup.md`](planned_cs60_post-cs54-observability-followup.md). Travels with CS60 through its lifecycle (planned → active → done).
**Purpose:** durable, append-only record of empirical observability data captured by CS41 deploys and CS60 measurement windows. Keeping it as a separate file (rather than inline in CS60) keeps CS60's plan readable while allowing this file to grow large over time without bloating the planning doc.

**Read order:** check the [Manifest](#manifest) below to find the most recent measurement, then jump to the relevant section. The Manifest is the single source of truth for what's recorded; sections may be appended out of strict chronological order.

---

## Manifest

| Window / event | Date (UTC) | Captured by | Section |
|---|---|---|---|
| _baseline_ | 2026-04-25T22:39Z (CS54-6 verification) | yoga-gwn-c2 | [§ Baseline (CS54-6)](#baseline-cs54-6) |
| +24h cost measurement | 2026-04-26T22:39Z | _pending — CS60-1_ | _to be appended_ |
| +7d cost measurement | 2026-05-02T22:39Z | _pending — CS60-2_ | _to be appended_ |
| +30d cost measurement | 2026-05-25T22:39Z | _pending — CS60-3_ | _to be appended_ |
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

CS41-7 (planned) appends one row per successful production or staging deploy with the deploy timestamp, revision name, image SHA, and the AI ingest delta from the prior deploy's marker. The format is:

```markdown
### Deploy <ISO-timestamp> — <revision-name>

| Field | Value |
|---|---|
| Environment | `gwn-staging` or `gwn-production` |
| Image SHA | `<40-char-sha>` |
| Workflow run | <link to actions run> |
| AI ingest since previous deploy | `<X.Y MB requests + W.Z MB other>` |
| `requests` rows since previous deploy | `<N>` |
| KQL run | (link to docs/observability.md anchor or one-liner) |
```

When a deploy executes, the deploy script appends a section here (NOT a row in the Manifest — the Manifest just points at this section). The first such section will be the first deploy after CS41 lands; everything before it is captured in the Baseline section above.

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

CS60-1/2/3 task descriptions in [`planned_cs60_post-cs54-observability-followup.md`](planned_cs60_post-cs54-observability-followup.md#tasks) point here for the actual recording of values.

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
