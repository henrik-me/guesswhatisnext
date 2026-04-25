# CS59 — `gwn-staging` cost-soak verification (post-CS58)

**Status:** ⬜ Planned
**Earliest claim date:** 2026-05-02 (7 days after CS58-2 was applied on 2026-04-25T18:30Z). Claiming earlier produces noisy or misleading data and the CS should not be picked up until the soak window has elapsed.
**Origin:** Split out of CS58 (`done_cs58_scale-staging-to-zero.md`). CS58 set `gwn-staging` `minReplicas` to 0 on the live Container App. The cost-saving projection (~50.8 DKK/month, ~$7.30) needs empirical verification once Azure Cost Management has accumulated enough post-change data to trend reliably. A single CS exists for this work so that picking it up at the right time, doing the same analysis as CS58 used, and either closing the loop (✅) or filing a follow-up if the projection missed (❌) all happen as one auditable unit.

## Goal

Verify, ~7 days after CS58-2 took effect, that the live `gwn-staging` cost has dropped as projected — specifically that the **Idle Usage** meters (vCPU + memory) have dropped >95% week-over-week. Document the result and either close CS58's hypothesis as confirmed or open a follow-up CS if it missed.

## Pre-flight (before doing anything)

Confirm the change is actually still in effect — somebody could have flipped it back during the soak:

```powershell
az containerapp show --name gwn-staging --resource-group gwn-rg `
  --query "{minReplicas: properties.template.scale.minReplicas, latestRev: properties.latestRevisionName}" -o table
# Expected: minReplicas: 0
```

If `minReplicas` is no longer 0, **stop**. Document why in the CS, do not proceed with cost analysis (it would be invalid), and either reapply the change or close CS59 as superseded with a new clickstop.

Also confirm there is exactly one active revision serving traffic (not two — see [LEARNINGS.md](../../../LEARNINGS.md) for the CS58-2 gotcha):

```powershell
az containerapp revision list --name gwn-staging --resource-group gwn-rg `
  --query "[?properties.active].{name:name, replicas:properties.replicas, traffic:properties.trafficWeight, minReplicas:properties.template.scale.minReplicas}" -o table
# Expected: 1 row, traffic=100, minReplicas=0
```

### Cold-wake `/healthz` probe (folded in from CS58-5)

This was originally CS58-5 acceptance criterion (c) but could not be reliably tested at CS58 close-out because concurrent CS54 staging activity was keeping the replica warm. After 7 days of soak, staging should be deallocated; this is the natural cold-state verification window.

Before any other CS59 query, confirm staging actually went cold and wakes correctly:

```powershell
# Confirm cold state — replicas should be 0
az containerapp revision list --name gwn-staging --resource-group gwn-rg `
  --query "[?properties.active] | [0].properties.replicas" -o tsv
# Expected: 0 (if not, something kept it warm — investigate before continuing)

# Cold probe
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$r = Invoke-WebRequest "https://gwn-staging.blackbay-4189fc2a.eastus.azurecontainerapps.io/healthz" `
  -TimeoutSec 90 -UseBasicParsing
"Cold response: $($r.StatusCode) in $([math]::Round($sw.Elapsed.TotalSeconds,1))s"
# Expected: 200, ~10–60s (replica spin-up + DB lazy init)

# Warm probe (immediately after)
$sw.Restart()
$r2 = Invoke-WebRequest "https://gwn-staging.blackbay-4189fc2a.eastus.azurecontainerapps.io/healthz" `
  -TimeoutSec 30 -UseBasicParsing
"Warm response: $($r2.StatusCode) in $([math]::Round($sw.Elapsed.TotalSeconds,2))s"
# Expected: 200, <1s
```

If cold response > 90s or non-200, the cold-start UX is broken — open a new CS to investigate, do not just close CS59.

## Cost analysis procedure

The canonical query lives in [`OPERATIONS.md` § Querying Azure cost](../../../OPERATIONS.md#querying-azure-cost). Run it and capture the meter-level breakdown for `gwn-staging` over the last 7 days (the soak window):

```powershell
$sub  = az account show --query id -o tsv
$end   = (Get-Date).ToString('yyyy-MM-dd')
$start = (Get-Date).AddDays(-7).ToString('yyyy-MM-dd')

$body = @{
  type = 'Usage'; timeframe = 'Custom'
  timePeriod = @{ from = $start; to = $end }
  dataset = @{
    granularity = 'None'
    aggregation = @{
      totalCost = @{ name = 'Cost';          function = 'Sum' }
      totalQty  = @{ name = 'UsageQuantity'; function = 'Sum' }
    }
    grouping = @(
      @{ type = 'Dimension'; name = 'Meter' }
      @{ type = 'Dimension'; name = 'ResourceId' }
    )
    filter = @{ dimensions = @{ name = 'ResourceId'; operator = 'In'; values = @(
      "/subscriptions/$sub/resourceGroups/gwn-rg/providers/microsoft.app/containerapps/gwn-staging"
    ) } }
  }
} | ConvertTo-Json -Depth 12 -Compress

$body | Out-File cost-cs59.json -Encoding ascii
az rest --method post `
  --url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.CostManagement/query?api-version=2023-11-01" `
  --body "@cost-cs59.json"
Remove-Item cost-cs59.json
```

Then run it a **second** time with `--days -14 to -7` (the week immediately *before* CS58-2 was applied) for the comparison baseline:

```powershell
$end   = (Get-Date).AddDays(-7).ToString('yyyy-MM-dd')
$start = (Get-Date).AddDays(-14).ToString('yyyy-MM-dd')
# ... rebuild $body with the new timePeriod and re-POST
```

Compute, per meter (Standard Memory Idle, Standard vCPU Idle), the percentage drop in `UsageQuantity` from the prior 7-day window to the post-change 7-day window. Cost is the easier-to-eyeball number but Quantity is the more correct one (Azure can change unit prices).

## Expected result (the hypothesis to test)

- **Standard Memory Idle Usage**: prior baseline ≈ 1,809,504 GiB-s / 30 d ⇒ ≈ 422,217 GiB-s / 7 d. Post-change: should be **<5%** of that, i.e. < ~21,000 GiB-s / 7 d.
- **Standard vCPU Idle Usage**: prior baseline ≈ 904,566 vCPU-s / 30 d ⇒ ≈ 211,065 vCPU-s / 7 d. Post-change: should be **<5%** of that, i.e. < ~10,500 vCPU-s / 7 d.
- **Total `gwn-staging` cost** for the 7-day soak window: should be **< 1 DKK** (vs ~12 DKK for the prior 7 days).

These targets come from CS58's projection. Use them as the pass/fail line. If actuals are within ±20% of expected, treat as confirmed. If actuals show **>20% of the prior idle usage still remaining**, something else is keeping the replica warm — investigate before closing.

## Investigation if the hypothesis fails

If staging is still accumulating significant idle hours, check (in this order):

1. **Recent revision deploys.** `az containerapp revision list --name gwn-staging --resource-group gwn-rg --query "[?properties.active].{name,createdTime:properties.createdTime,minReplicas:properties.template.scale.minReplicas}" -o table` — confirm no new revision has been created that re-introduced `minReplicas: 1`. If `staging-deploy.yml` was re-edited or if a hand-deploy bypassed the YAML template, the change can silently regress.
2. **Outbound probes pinning it warm.** Grep workflows for `gwn-staging`: `Select-String -Pattern 'gwn-staging' -Path .github\workflows\*.yml`. CS58-3 audited `health-monitor.yml` — recheck nothing new pings staging on a schedule.
3. **External traffic.** `az monitor metrics list --resource gwn-staging -g gwn-rg --resource-type Microsoft.App/containerApps --metric Requests --interval PT1H` — if requests > 0/h consistently, something or someone is hitting the URL.
4. **Cooldown misbehavior.** Check `az containerapp show --name gwn-staging -g gwn-rg --query "properties.template.scale.cooldownPeriod"` — if it's been changed from the default 300s to a much larger value, deallocation won't happen quickly.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS59-1 | Run pre-flight checks (above), **including the cold-wake `/healthz` probe** (folded in from CS58-5(c)). If `minReplicas != 0`, multiple active revisions, or cold probe non-200/>90s, halt and document. | ⬜ Pending | Earliest: 2026-05-02. |
| CS59-2 | Run the 7-day post-change cost meter query and capture the result. | ⬜ Pending | Depends on CS59-1 passing. |
| CS59-3 | Run the prior-7-day baseline cost meter query and capture the result. | ⬜ Pending | Depends on CS59-1 passing. |
| CS59-4 | Compare meter quantities; produce the post/pre table; classify as ✅ confirmed (>95% drop) or ❌ regressed (<80% drop) or 🟡 partial (80–95%). | ⬜ Pending | Depends on CS59-2 + CS59-3. |
| CS59-5 | Append the result table + verdict to `done_cs58_scale-staging-to-zero.md` under a new `## CS59 cost-soak verification` section so the CS58 audit trail is complete. | ⬜ Pending | Depends on CS59-4. Edit done file in place — do not move CS58. |
| CS59-6 | If ❌ regressed: open a new investigation CS (suggested name `cs60_staging-cost-regression-investigation`), referencing the failure modes in § Investigation. If ✅ confirmed: close CS59 (move file to `done/`). If 🟡 partial: document the gap and decide with the user before closing. | ⬜ Pending | Depends on CS59-4. |

## Acceptance criteria

- Pre-flight ran and passed (or the CS halted cleanly with the failure documented).
- Both 7-day windows queried and recorded.
- Verdict (✅ / 🟡 / ❌) classified per the thresholds above.
- CS58 done file updated with the verification table and verdict.
- CS59 file moved to `project/clickstops/done/done_cs59_*.md` with `Status: ✅ Complete` and the same verdict appended at the top.
- WORKBOARD reflects the closure (row removed if added).

## Will not be done as part of this clickstop

- Any change to `staging-deploy.yml`, `prod-deploy.yml`, or the live Container App spec — that's CS58 (done) or CS60 (only if CS59 finds a regression).
- Cost analysis on `gwn-production` — separate decision.
- Setting up automated cost alerting — out of scope; if recurring need emerges, file as a new CS.

## Pre-claim checklist (for the orchestrator who picks this up)

1. **Date check:** is today >= 2026-05-02? If not, do not claim — too early. Add a note to WORKBOARD if you intentionally claim early but expect partial data.
2. **No-one else claimed it:** check WORKBOARD Active Work for any existing CS59 row.
3. **CS58 is in `done/`:** confirm `project/clickstops/done/done_cs58_scale-staging-to-zero.md` exists and that `active/active_cs58_*.md` does not. CS59 amends CS58's done file — that file must already exist.

## Relationship to other clickstops

- **CS58** (done) — set up the change being verified here. CS59 is the closing audit. CS59's verdict is appended to `done_cs58_*.md`.
- **CS54** (App Insights, in flight) — independent. If CS54 lands before CS59, the cost-soak query is unaffected; App Insights ingestion has its own meters but those are on the Log Analytics workspace, not the Container App.
- **Future CS60 (only if needed)** — staging cost regression investigation. CS59-6 decides whether to open it.
