# CS58 — Scale `gwn-staging` Container App to zero (cost optimization)

**Status:** 🟢 Active (claimed by yoga-gwn-c3 on 2026-04-25T17:46Z)
**Origin:** Discovered 2026-04-25 while reviewing whether to remove the staging environment entirely. Cost Management meter-level data showed that the always-on `gwn-staging` Container App is the single most expensive resource in `gwn-rg` — and **99.5% of its bill is "Idle Usage"**, i.e. Azure billing for keeping a replica warm under `minReplicas=1` while it serves no traffic. Setting `minReplicas=0` captures essentially the full cost saving of a full deletion (~$7.30/month) while preserving staging as an on-demand validation surface.

## Goal

Reduce the monthly cost of `gwn-staging` to <1 DKK/month (down from ~52 DKK/month) by setting `minReplicas=0`, **without** deleting the resource — so staging stays available for ad-hoc validation, just paying a one-time cold-start (~10–30s replica + ~30s DB lazy init) on the first request after going idle.

## Cost evidence (last 30 days, DKK, Azure Cost Management — meter level)

`gwn-staging` total: **51.82 DKK**

| Meter | Cost | Quantity | Share |
|---|---:|---:|---:|
| Standard Memory **Idle** Usage | 34.38 | 1,809,504 GiB-s | 66.4% |
| Standard vCPU **Idle** Usage | 17.19 | 904,566 vCPU-s | 33.2% |
| Standard Memory Active Usage | 0.05 | 2,676 GiB-s | 0.1% |
| Standard vCPU Active Usage | 0.20 | 1,322 vCPU-s | 0.4% |

`gwn-production` total: **37.34 DKK** (~97% idle — same shape).

Snapshot only — see [§ Re-running the cost query](#re-running-the-cost-query) below for the live source of truth.

### Projected savings

- Idle billing accrues **only while a replica is allocated**. With `minReplicas=0` the replica is deallocated after the cooldown window (currently 300s) when no traffic arrives.
- Active usage stays negligible (<0.30 DKK/month) — staging serves almost no requests.
- **Projected new cost:** <1 DKK/month.
- **Saving:** ~50.8 DKK/month ≈ $7.30/month — essentially identical to a full deletion.

## Why scale-to-zero over full deletion

| Aspect | minReplicas=0 (chosen) | Full delete (rejected) |
|---|---|---|
| Monthly cost | <1 DKK | 0 DKK |
| Cold start on first probe | ~10–30s + ~30s DB lazy init | n/a |
| Re-availability | Instant | ~5–10 min infra recreate |
| Reversibility | Trivial (`minReplicas=1`) | Requires infra script |
| Available for ad-hoc validation | ✅ Yes | ❌ No |
| Risk of forgotten secrets / drift | Mitigated by audit (CS58-3) | Fully eliminated |

## Tasks

| # | Task | Status | Depends On | Notes |
|---|------|--------|------------|-------|
| CS58-1 | Update `staging-deploy.yml` deploy YAML template to `minReplicas: 0` so future deploys don't re-introduce always-on. Validate via `workflow_dispatch` that smoke + E2E still pass with extra cold-start slack. | ⬜ Pending | — | One-line YAML change at the `scale:` block in the `deploy-azure-staging` job. |
| CS58-2 | Apply `minReplicas=0` to the live `gwn-staging` Container App: `az containerapp update --name gwn-staging --resource-group gwn-rg --min-replicas 0`. Confirm via `az containerapp show`. | ⬜ Pending | CS58-1 (so live config doesn't drift from what next deploy would set) | Reversible in one command. |
| CS58-3 | Documentation update — apply "link, don't restate." Update `INSTRUCTIONS.md`, `OPERATIONS.md`, `CONTEXT.md`, `infra/README.md` to describe staging as scale-to-zero with cold-start on first request. Update [`prod-deploy.yml`](../../../.github/workflows/prod-deploy.yml) header comment from "validated in staging" → "validated by Ephemeral Smoke Test job + local container:validate." Audit the GH `staging` environment secrets — confirm still needed. Add a short OPERATIONS section: "How to wake staging for a quick validation." | ⬜ Pending | — | Independent of CS58-1/2; can ship in parallel. |
| CS58-4 | Cost verification soak. Wait ~7 days post-CS58-2, re-run the Cost Management meter query, document actual idle-meter drop and total saving in the closing notes. Confirm meters show near-zero idle on staging. | ⬜ Pending | CS58-2 (+ ~7 days soak) | Confirms the projection. |

### Dependency graph

```
CS58-1 ──→ CS58-2 ──→ CS58-4
CS58-3 (independent)
```

## Acceptance Criteria

- `az containerapp show --name gwn-staging --resource-group gwn-rg --query "properties.template.scale.minReplicas"` returns `0`.
- After 10 min of zero traffic, `az containerapp replica list` shows zero active replicas for `gwn-staging`.
- A cold probe to `https://gwn-staging.blackbay-…azurecontainerapps.io/healthz` returns 200 within ~60s after wake.
- Ephemeral Smoke Test job in `staging-deploy.yml` continues to pass on every triggered run (it doesn't depend on the deployed Azure staging app at all — it boots its own container as a service).
- 7-day cost soak shows staging's "Idle Usage" meter quantities dropped >95% week-over-week and total monthly cost trends toward <1 DKK.
- Documentation describes staging accurately as a scale-to-zero environment, and the prod-deploy gate text reflects the in-CI ephemeral smoke as the enforced gate.

## Will not be done as part of this clickstop

- **Deleting** the `gwn-staging` Container App, the `release/staging` branch, or the `staging-deploy.yml` workflow — the whole point is to keep them available, just idle.
- Changing production's `minReplicas` (it serves real users; cold-start there is a separate decision tied to CS53/CS56).
- Rewriting the Ephemeral Smoke Test job — it already runs against a self-contained MSSQL service container and does not depend on Azure staging.
- Adding new alerting/monitoring on staging cost — the Cost Management query in OPERATIONS (added by CS58-3) is sufficient given how rarely the number will move.

## Risks & rollback

- **CS53 active work uses staging.** Active row CS53-19 is blocked on CS55-2; CS53-17-validate is "Done — staging on `cceedac` healthy." Quick-validation use of staging post-CS58-2 will incur a cold start. Notify `yoga-gwn` orchestrator before applying CS58-2 so a slow first probe isn't mistaken for a regression.
- **Cooldown period (300s) means staging takes ~5 min of zero traffic to actually deallocate.** A probe followed by 5 min of silence is what triggers the savings.
- **Anything that pings staging on a schedule defeats the savings.** Confirm `.github/workflows/health-monitor.yml` and any other cron only target prod. Audit as part of CS58-3.
- **Rollback:** `az containerapp update --name gwn-staging --resource-group gwn-rg --min-replicas 1` — single command, instant.

## Re-running the cost query

Source of truth for current cost is Azure Cost Management. To regenerate the meter-level breakdown above:

```powershell
$sub = az account show --query id -o tsv
$end = (Get-Date).ToString('yyyy-MM-dd')
$start = (Get-Date).AddDays(-30).ToString('yyyy-MM-dd')
$body = @{
  type = 'Usage'; timeframe = 'Custom'
  timePeriod = @{ from = $start; to = $end }
  dataset = @{
    granularity = 'None'
    aggregation = @{
      totalCost = @{ name = 'Cost'; function = 'Sum' }
      totalQty  = @{ name = 'UsageQuantity'; function = 'Sum' }
    }
    grouping = @(
      @{ type = 'Dimension'; name = 'Meter' }
      @{ type = 'Dimension'; name = 'ResourceId' }
    )
    filter = @{ dimensions = @{ name = 'ResourceGroupName'; operator = 'In'; values = @('gwn-rg') } }
  }
} | ConvertTo-Json -Depth 12 -Compress
$body | Out-File cost.json -Encoding ascii
az rest --method post `
  --url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.CostManagement/query?api-version=2023-11-01" `
  --body "@cost.json"
```

CS58-3 will add the canonical version of this snippet to OPERATIONS.md so future cost analyses don't require digging through CS history.

## Relationship to other clickstops

- **CS53** — uses staging for cold-start investigation work (CS53-17-validate, CS53-19, planned CS53-20). All compatible with scale-to-zero; CS53-20 actually benefits because it would test the cold-start path that becomes the default state.
- **CS54 (App Insights)** — independent. If CS54 lands first, staging telemetry will keep working through cold starts.
- **CS41 (production-deploy validation)** — independent. The new pre-prod gate this CS sets up (Ephemeral Smoke Test + local container:validate) is the substrate CS41 will build on.
