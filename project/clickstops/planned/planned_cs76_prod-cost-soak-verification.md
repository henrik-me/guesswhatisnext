# CS76 — Prod Cost Soak Verification

**Status:** ⬜ Planned
**Depends on:** CS75
**Parallel-safe with:** CS59, CS65, CS66, CS67, CS68
**Earliest claim date:** 2026-05-17 (7 days after CS75-2 was applied on 2026-05-10T19:31Z). Claiming earlier produces noisy or misleading data and the CS should not be picked up until the soak window has elapsed.
**Origin:** Split out of CS75 (`active_cs75_scale-prod-to-zero.md`, → `done_cs75_*.md` once CS75 closes). CS75 set `gwn-production` `minReplicas` to 0 on the live Container App. The cost-saving projection (~36 DKK/month, ~$5/month) needs empirical verification once Azure Cost Management has accumulated enough post-change data to trend reliably. A single CS exists for this work so that picking it up at the right time, doing the same analysis as CS75 used, and either closing the loop (✅) or filing a follow-up if the projection missed (❌) all happen as one auditable unit.

## Goal

Verify, ~7 days after CS75-2 took effect, that the live `gwn-production` cost has dropped as projected — specifically that the **Idle Usage** meters (vCPU + memory) have dropped >95% week-over-week. Document the result and either close CS75's hypothesis as confirmed or open a follow-up CS if it missed.

## Notes & gotchas carried forward from CS75 (and CS58 → CS59)

These are operational facts that CS76 needs in order to interpret pre-flight results correctly. They live inline here so this CS is self-contained.

1. **`az containerapp update --min-replicas 0` does NOT shift traffic on its own (CS58-2 lesson).** It creates a *new* revision with the new spec but in **multi-revision** mode leaves the *old* revision still serving 100% of traffic. **Prod is single-revision mode** (`az containerapp show --query "properties.configuration.activeRevisionsMode"` returns `Single`), so traffic shifts atomically — but the **old revision can still remain Active with replicas=1 for a brief window** until Azure deactivates it. CS75-2 explicitly deactivated `gwn-production--0000025` after `0000026` (with `minReplicas: 0`) was created. If the CS76 pre-flight finds *two active revisions*, the most likely cause is that a subsequent `az containerapp update` regressed this — re-apply the traffic shift / deactivate the old revision before continuing the cost analysis (commands in § Notes & gotchas item 1 of CS59).

2. **Cold-state assertions about `gwn-production` are unreliable while ANY other agent is touching prod.** Concurrent CS work that hits prod (deploys, smoke probes, even a casual `curl` on the prod URL) keeps the replica warm and silently invalidates "cold" measurements. CS76-1 must explicitly check WORKBOARD for any concurrent prod activity *before* doing the cold probe (see pre-flight step 3).

3. **DB-touching cold path differs from container cold path.** `gwn-production`'s Azure SQL is serverless with `autoPauseDelay=60min`. Container cooldown is ~300s of zero ingress traffic; DB pause is governed independently. So a "cold" probe can land in any of: (a) container cold + DB cold (worst case — full ~60–90s budget), (b) container cold + DB warm (recently touched by ops/admin), (c) container warm + DB cold (replica kept alive by App Insights / OTel heartbeats but DB idled out). CS76 reports the breakdown when probing.

## Pre-flight (before doing anything)

Confirm the change is actually still in effect — somebody could have flipped it back during the soak:

```powershell
az containerapp show --name gwn-production --resource-group gwn-rg `
  --query "{minReplicas: properties.template.scale.minReplicas, latestRev: properties.latestRevisionName}" -o table
# Expected: minReplicas: 0
```

If `minReplicas` is no longer 0, **stop**. Document why in the CS, do not proceed with cost analysis (it would be invalid), and either reapply the change or close CS76 as superseded with a new clickstop.

Also confirm there is exactly one active revision serving traffic (not two — see § Notes & gotchas item 1):

```powershell
az containerapp revision list --name gwn-production --resource-group gwn-rg `
  --query "[?properties.active].{name:name, replicas:properties.replicas, traffic:properties.trafficWeight, minReplicas:properties.template.scale.minReplicas}" -o table
# Expected: 1 row, traffic=100, minReplicas=0
```

### Cross-agent quiescence check (do this BEFORE the cold-wake probe)

Per § Notes & gotchas item 2, the cold-wake probe is meaningless if another agent is concurrently touching prod. Before probing:

1. Read `WORKBOARD.md` Active Work and grep for `prod`, `gwn-production`, `CS75`, `CS76`, and any deploy-related rows. If any other agent has an active row that could plausibly hit prod, **do not probe yet**.
2. Post a `workboard:` quiescence-window note in WORKBOARD ahead of the probe, e.g.: *"🤫 CS76 cold-wake probe in ~10 min — please don't `curl`/deploy/probe `gwn-production` between HH:MM and HH:MM UTC."* Commit + push.
3. Wait ≥10 min after posting (gives other agents a chance to see it and stop) before running the probe block below.
4. After the probe, remove the quiescence note from WORKBOARD.

If you skip this and the cold probe shows replicas != 0, you cannot tell whether scale-to-zero is broken or whether someone just woke prod — the result is unactionable.

### Cold-wake `/healthz` + DB-touching probe (folded in from CS75-5(c))

This was originally a CS75-5 acceptance criterion but could not be tested at CS75 close-out because the deploy itself warms both layers (container + DB). After 7 days of soak, prod should have spent meaningful time deallocated; this is the natural cold-state verification window.

Before any other CS76 query, confirm prod actually went cold and wakes correctly:

```powershell
# Confirm cold state — replicas should be 0 and SQL DB should be Paused
az containerapp revision list --name gwn-production --resource-group gwn-rg `
  --query "[?properties.active] | [0].properties.replicas" -o tsv
# Expected: 0 (if not, something kept it warm — investigate before continuing)

az sql db show --resource-group gwn-rg --server gwn-sqldb --name gwn-production --query "status" -o tsv
# Expected: Paused (if Online, DB is warm — note in CS76 results, may invalidate cold-DB timing)

# Cold probe — /healthz (DB-bypass)
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$r = Invoke-WebRequest "https://gwn.metzger.dk/healthz" -TimeoutSec 90 -UseBasicParsing
"Cold /healthz: $($r.StatusCode) in $([math]::Round($sw.Elapsed.TotalSeconds,1))s"
# Expected: 200, ~10–60s (replica spin-up + ingress + custom-domain SNI; DB resume NOT in this budget)

# Warm probe (immediately after) — /healthz
$sw.Restart()
$r2 = Invoke-WebRequest "https://gwn.metzger.dk/healthz" -TimeoutSec 30 -UseBasicParsing
"Warm /healthz: $($r2.StatusCode) in $([math]::Round($sw.Elapsed.TotalSeconds,2))s"
# Expected: 200, <1s

# DB-touching probe (mirrors prod-deploy.yml lines 545-614 — Phase 1 + Phase 2).
# Phase 1 (loop, 8 attempts × 30s timeout, 30s sleep between):
#   - 200                                       → init_triggered (DB warm; assert db=ok in Phase 2)
#   - 503 + unavailable=true + no Retry-After   → intentional_unavailable (assert app=ok only)
#   - 503 + Retry-After present                 → transient cold-start, keep retrying
#   - anything else                             → unexpected, keep retrying within budget
$dbSw = [System.Diagnostics.Stopwatch]::StartNew()
$state = "never_probed"
for ($i=1; $i -le 8; $i++) {
  try {
    $resp = Invoke-WebRequest "https://gwn.metzger.dk/api/features" `
      -Headers @{ 'X-User-Activity' = '1' } -TimeoutSec 35 -UseBasicParsing -ErrorAction Stop
    $http = $resp.StatusCode
    $hasRetryAfter = $resp.Headers.ContainsKey('Retry-After')
    $unavail = $false; $reason = ''
    try { $j = $resp.Content | ConvertFrom-Json; $unavail = [bool]$j.unavailable; $reason = "$($j.reason)" } catch {}
  } catch {
    $http = $_.Exception.Response.StatusCode.value__
    $hasRetryAfter = $false
    $unavail = $false; $reason = ''
    try {
      $body = $_.ErrorDetails.Message | ConvertFrom-Json
      $unavail = [bool]$body.unavailable; $reason = "$($body.reason)"
      $hasRetryAfter = $_.Exception.Response.Headers.GetValues('Retry-After').Count -gt 0
    } catch {}
  }
  "Probe attempt $i: /api/features http=$http unavailable=$unavail reason='$reason' retry_after=$hasRetryAfter"
  if ($http -eq 200) { $state = 'init_triggered'; break }
  if ($http -eq 503 -and $unavail -and -not $hasRetryAfter) { $state = 'intentional_unavailable'; break }
  if ($http -eq 503 -and $hasRetryAfter) { $state = 'transient_cold_start' }
  else { $state = "unexpected_$http" }
  Start-Sleep -Seconds 30
}
"Phase 1 elapsed: $([math]::Round($dbSw.Elapsed.TotalSeconds,1))s, final state=$state"
if ($state -ne 'init_triggered' -and $state -ne 'intentional_unavailable') { "Phase 1 FAILED — investigate"; return }

# Phase 2: authoritative /api/health probe — REQUIRES X-API-Key: $env:SYSTEM_API_KEY
# (the same secret used by prod-deploy.yml). If you don't have it locally, run
# `az containerapp secret list --name gwn-production -g gwn-rg` or pull from GH Environments.
if (-not $env:SYSTEM_API_KEY) { "Set $env:SYSTEM_API_KEY before Phase 2"; return }
$h = Invoke-WebRequest "https://gwn.metzger.dk/api/health" `
  -Headers @{ 'X-API-Key' = $env:SYSTEM_API_KEY } -TimeoutSec 30 -UseBasicParsing
$hj = $h.Content | ConvertFrom-Json
"Phase 2 /api/health: status=$($hj.status) db=$($hj.checks.database.status)"
if ($hj.status -ne 'ok') { "Phase 2 FAILED — investigate"; return }
if ($state -eq 'init_triggered' -and $hj.checks.database.status -ne 'ok') { "Phase 2 FAILED: /api/features 200 but db=$($hj.checks.database.status)"; return }
"OK — phase1=$state health.status=ok db=$($hj.checks.database.status)"
```

If cold response > 90s or non-200 (`/healthz`), or Phase 1 (`/api/features`) doesn't reach `init_triggered` or `intentional_unavailable` within ~4 min (8×30s), or Phase 2 (`/api/health`) is non-`ok`, the cold-start UX is broken — open a new CS to investigate, do not just close CS76.

> **Easier alternative:** if you don't want to manage `SYSTEM_API_KEY` locally for the Phase 2 call, trigger `prod-deploy.yml workflow_dispatch` against `main` and inspect the existing healthcheck step's logs (lines 540-614). It runs the same two-phase verdict end-to-end with the secret already wired in.

## Cost analysis procedure

The canonical query lives in [`OPERATIONS.md` § Querying Azure cost](../../../OPERATIONS.md#querying-azure-cost). Run it and capture the meter-level breakdown for `gwn-production` over the last 7 days (the soak window):

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
      "/subscriptions/$sub/resourceGroups/gwn-rg/providers/microsoft.app/containerapps/gwn-production"
    ) } }
  }
} | ConvertTo-Json -Depth 12 -Compress

$body | Out-File cost-cs76.json -Encoding ascii
az rest --method post `
  --url "https://management.azure.com/subscriptions/$sub/providers/Microsoft.CostManagement/query?api-version=2023-11-01" `
  --body "@cost-cs76.json"
Remove-Item cost-cs76.json
```

Then run it a **second** time with `--days -14 to -7` (the week immediately *before* CS75-2 was applied) for the comparison baseline:

```powershell
$end   = (Get-Date).AddDays(-7).ToString('yyyy-MM-dd')
$start = (Get-Date).AddDays(-14).ToString('yyyy-MM-dd')
# ... rebuild $body with the new timePeriod and re-POST
```

Compute, per meter (Standard Memory Idle, Standard vCPU Idle), the percentage drop in `UsageQuantity` from the prior 7-day window to the post-change 7-day window. Cost is the easier-to-eyeball number but Quantity is the more correct one (Azure can change unit prices).

## Expected result (the hypothesis to test)

CS75's projection: Total cost should drop from ~37 DKK/month (~8.6 DKK/week) to <1 DKK/month (~<0.25 DKK/week) — a >95% reduction. Specifically:

- **Standard Memory Idle Usage**: prior 7-day baseline ≈ ~415,000 GiB-s (extrapolated from CS58 staging shape; will need re-baseline from the actual prior-7-day query). Post-change: should be **<5%** of that.
- **Standard vCPU Idle Usage**: prior 7-day baseline ≈ ~210,000 vCPU-s (extrapolated from CS58 staging shape). Post-change: should be **<5%** of that.
- **Total `gwn-production` cost** for the 7-day soak window: should be **< 0.25 DKK** (vs ~8.6 DKK for the prior 7 days).

These targets come from CS75's projection (which itself was anchored on CS58's empirical staging result — see CS58 done file's CS59 verdict appendix once CS59 closes). Use them as the pass/fail line. If actuals are within ±20% of expected, treat as confirmed. If actuals show **>20% of the prior idle usage still remaining**, something else is keeping the replica warm — investigate before closing.

**Note on prod-vs-staging:** prod gets some real traffic, so a small Active Usage residual is expected (and not a regression). The Idle Usage drop is the key signal.

## Investigation if the hypothesis fails

If prod is still accumulating significant idle hours, check (in this order):

1. **Recent revision deploys.** `az containerapp revision list --name gwn-production --resource-group gwn-rg --query "[?properties.active].{name,createdTime:properties.createdTime,minReplicas:properties.template.scale.minReplicas}" -o table` — confirm no new revision has been created that re-introduced `minReplicas: 1`. If `prod-deploy.yml` was re-edited or if a hand-deploy bypassed the YAML template, the change can silently regress.
2. **Outbound probes pinning it warm.** Grep workflows for `gwn-production` and `gwn.metzger.dk`: `Select-String -Pattern 'gwn-production|gwn\.metzger\.dk' -Path .github\workflows\*.yml`. CS75-3's audit confirmed `health-monitor.yml` is scale-to-zero-friendly (cron is Azure-API-only); recheck nothing new pings prod on a schedule. Also check `prod-deploy.yml`'s smoke jobs (CS41-1+2) — these run on every prod deploy, but only on dispatch/release-branch push, so cumulative impact should be small.
3. **App Insights / OTel exporter heartbeats.** Per CS75 § Risks & rollback, in-process telemetry SDK background flushes may keep the replica partially warm. If idle-meter savings are significantly below the projected >95%, this is the first hypothesis to check beyond the obvious.
4. **External traffic.** `az monitor metrics list --resource gwn-production -g gwn-rg --resource-type Microsoft.App/containerApps --metric Requests --interval PT1H` — if requests > 0/h consistently, real users / scrapers / search-engine bots are hitting the URL. May warrant a robots.txt audit or a CDN/Cloudflare front for cache.
5. **Cooldown misbehavior.** Check `az containerapp show --name gwn-production -g gwn-rg --query "properties.template.scale.cooldownPeriod"` — if it's been changed from the default 300s to a much larger value, deallocation won't happen quickly.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS76-1 | Run pre-flight checks (above): minReplicas==0, single active revision, cross-agent quiescence check + WORKBOARD note, and the cold-wake `/healthz` + Phase-1 `/api/features` (8×30s, X-User-Activity:1, terminal verdicts `init_triggered` or `intentional_unavailable` per `prod-deploy.yml` lines 545-583) + Phase-2 `/api/health` (X-API-Key, lines 593-614) probe (folded in from CS75-5(c)+(d)). Easier alternative: re-trigger `prod-deploy.yml workflow_dispatch` and inspect the healthcheck step logs. If `minReplicas != 0`, multiple active revisions, cold `/healthz` non-200/>90s, or the two-phase probe fails, halt and document. | ⬜ Pending | Earliest: 2026-05-17. |
| CS76-2 | Run the 7-day post-change cost meter query and capture the result. | ⬜ Pending | Depends on CS76-1 passing. |
| CS76-3 | Run the prior-7-day baseline cost meter query (window: 2026-05-03..2026-05-10, the week immediately pre-CS75-2). Capture the result. | ⬜ Pending | Depends on CS76-1 passing. |
| CS76-4 | Compare meter quantities; produce the post/pre table; classify as ✅ confirmed (>95% drop) or ❌ regressed (<80% drop) or 🟡 partial (80–95%). | ⬜ Pending | Depends on CS76-2 + CS76-3. |
| CS76-5 | Append the result table + verdict to `done_cs75_scale-prod-to-zero.md` under a new `## CS76 cost-soak verification` section so the CS75 audit trail is complete. | ⬜ Pending | Depends on CS76-4. Edit done file in place — do not move CS75. |
| CS76-6 | If ❌ regressed: open a new investigation CS (suggested name `csNN_prod-cost-regression-investigation`), referencing the failure modes in § Investigation. If ✅ confirmed: close CS76 (move file to `done/`). If 🟡 partial: document the gap and decide with the user before closing. | ⬜ Pending | Depends on CS76-4. |
| CS76-7 | Cross-check the verdict against CS59's staging verdict (once CS59 has closed). If both ✅, also append a "scale-to-zero in production validated end-to-end" note to the CS58 done file's existing CS59 appendix linking the two cost-soak results. If they diverge, capture the delta as a learning in `LEARNINGS.md`. | ⬜ Pending | Depends on CS76-4 + CS59 being in `done/`. |
| CS76-8 | **Decide and document the CS41 traffic-filtering approach** for prod (filter `gwn-smoke-bot`-attributed requests vs require a quiescence window). Required BEFORE any cost-soak measurement is reported. See § CS41 deploy-traffic interaction below. | ⬜ Pending | Mirrors CS59-8. May be able to short-circuit by reusing CS59-8's decision once CS59 closes. |

### CS41 deploy-traffic interaction (mirrors CS59-8)

CS41 prod deploys add deterministic smoke-test traffic on every deploy via `gwn-smoke-bot` (~6 requests per deploy, plus migration-step DB activity, plus the CS73 wake step). CS76 measurements MUST EITHER:

- Filter `gwn-smoke-bot`-attributed requests from prod cost queries (use `customDimensions.user_id` if available, OR correlate request count vs deploy count from the GitHub Actions API), OR
- Document a "quiescence window" requirement (e.g., "no deploys for 24h before measurement") and execute measurements during such windows.

This must be resolved by CS76-8 before reporting cost-soak verification results. Without this, idle-meter drops attributable to scale-to-zero will be mixed with deploy-driven warm windows and the verdict will be unactionable.

## Acceptance

- The post-CS75 prod cost-soak result is recorded and any miss is converted into follow-up work.
- Pre-flight ran and passed (or the CS halted cleanly with the failure documented), **including the cross-agent quiescence step** (WORKBOARD note posted ahead of the cold probe and removed afterward).
- Both 7-day windows queried and recorded.
- Verdict (✅ / 🟡 / ❌) classified per the thresholds above.
- CS75 done file updated with the verification table and verdict.
- CS76 file moved to `project/clickstops/done/done_cs76_*.md` with `Status: ✅ Complete` and the same verdict appended at the top.
- WORKBOARD reflects the closure (row removed if added).

## Will not be done as part of this clickstop

- Any change to `prod-deploy.yml`, `staging-deploy.yml`, or the live Container App spec — that's CS75 (done).
- Cost analysis on `gwn-staging` — that's CS59 (separate decision).
- Setting up automated cost alerting — out of scope; if recurring need emerges, file as a new CS.

## Pre-claim checklist (for the orchestrator who picks this up)

1. **Date check:** is today >= 2026-05-17? If not, do not claim — too early. Add a note to WORKBOARD if you intentionally claim early but expect partial data.
2. **No-one else claimed it:** check WORKBOARD Active Work for any existing CS76 row.
3. **CS75 is in `done/`:** confirm `project/clickstops/done/done_cs75_scale-prod-to-zero.md` exists and that `active/active_cs75_*.md` does not. CS76 amends CS75's done file — that file must already exist.

## Relationship to other clickstops

- **CS75** (parent) — set up the change being verified here. CS76 is the closing audit. CS76's verdict is appended to `done_cs75_*.md`.
- **CS59** (parallel) — same shape for staging. If both ✅, CS76-7 cross-links the two as joint validation that scale-to-zero is reliable across both environments.
- **CS58** (already done) — the original staging precedent. CS59 is its audit; CS76-7 may extend that audit's appendix with the prod result.
- **CS73** (done) — the cold-DB wake step that makes deploys against a paused-DB prod work. CS76's Phase-1 `/api/features` (X-User-Activity:1) + Phase-2 `/api/health` cold-DB probe verifies the runtime cold-DB path (separate from the deploy-time wake). The probe pattern mirrors `prod-deploy.yml` lines 545-608.

## Cross-references

- [CS75 done file](../done/done_cs75_scale-prod-to-zero.md) — origin scale-to-zero change.
- [CS59 staging cost-soak](../planned/planned_cs59_staging-cost-soak-verification.md) — sister CS for staging; same procedure and shape.
