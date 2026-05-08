# CS75 — Scale `gwn-production` Container App to zero (cost optimization)

**Status:** ⬜ Planned
**Depends on:** [CS73](planned_cs73_prod-deploy-cold-db-handling.md) — must merge first (see § Dependency rationale)
**Parallel-safe with:** CS55, CS56, CS57, CS59, CS63, CS69, CS70, CS71, CS72
**Origin:** Direct extension of [CS58](../done/done_cs58_scale-staging-to-zero.md)'s rationale to the production Container App. User direction 2026-05-08: *"Change the prod container to allow 0 instances running, similar to staging."* Acceptance of the user-visible cold-start trade-off explicitly confirmed by user during planning.

## Goal

Reduce the monthly cost of `gwn-production` from ~37 DKK/month to <1 DKK/month by setting `minReplicas=0` on the Container App, accepting a one-time user-visible cold start (~10–30s container + ~30–60s Azure SQL serverless resume = up to ~90s) on the first request after the replica deallocates (cooldown ≈300s of zero traffic).

## Cost evidence (from CS58 snapshot, last 30 days, DKK)

`gwn-production` total: **37.34 DKK/month** — ~97% Idle Usage, same shape as staging pre-CS58.

| Meter family | Estimated share |
|---|---:|
| Standard Memory + vCPU **Idle** Usage | ~97% |
| Standard Memory + vCPU Active Usage | ~3% |

Projected post-CS75 cost: **<1 DKK/month** (matches CS58 outcome on staging). Saving: **~36 DKK/month ≈ $5/month**. Smaller than CS58's $7.30/month because prod gets some real traffic.

Live source-of-truth query: see [§ Querying Azure cost in OPERATIONS.md](../../../OPERATIONS.md#querying-azure-cost).

## Why scale-to-zero (chosen) vs always-on (rejected)

| Aspect | minReplicas=0 (chosen) | minReplicas=1 (status quo) |
|---|---|---|
| Monthly cost | <1 DKK | ~37 DKK |
| Cold start on first user request after idle | ~60–90s | None |
| Steady-state UX during active hours | Identical (replica stays warm while traffic flows) | Identical |
| Reversibility | Trivial (`az containerapp update --min-replicas 1`) | n/a |
| Multiplayer WebSocket impact | None during active match (live traffic keeps replica warm) | None |
| Deploy-time cold-DB hit frequency | **High** (DB will idle more often → CS73 mandatory) | Low |

**User-visible cold-start trade-off accepted** during planning (2026-05-08): the cost saving is worth a ~60–90s spinner on the first homepage load after a quiet period.

## Dependency rationale (why CS73 blocks CS75)

Today the prod DB stays warm because of ambient traffic. After CS75 lands, traffic drops to near-zero overnight and on quiet days, so `gwn-production` Azure SQL (autoPause 60min) will pause far more often. **Every prod deploy will then reliably hit the [CS73](planned_cs73_prod-deploy-cold-db-handling.md) cold-DB migration timeout** (`mssql` 5s connect timeout vs ~30–60s resume window). Today this is rare; post-CS75 it is the steady state.

CS73 must be merged and verified before CS75-2 (live `az` apply) so that the very first post-CS75 deploy doesn't immediately fail.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|------|--------|------------|-------|
| CS75-1 | Update [`.github/workflows/prod-deploy.yml`](../../../.github/workflows/prod-deploy.yml) line ~338 from `--min-replicas 1` → `--min-replicas 0`, keep `--max-replicas 5` unchanged. Single PR. Run local `npm run container:validate` + Copilot review per the standard non-docs PR gate. | ⬜ Planned | CS73 merged | One-line YAML change. PR body must include `## Container Validation` table per gate. |
| CS75-2 | Apply `minReplicas=0` to live `gwn-production` Container App: `az containerapp update --name gwn-production --resource-group gwn-rg --min-replicas 0`. Then per CS58-2 lesson: `az containerapp ingress traffic set --revision-weight <new>=100` and deactivate the previous revision so we don't double-bill. Confirm via `az containerapp show` that `minReplicas=0` and via `az containerapp revision list` that exactly one revision is active. | ⬜ Planned | CS75-1 merged, CS73 merged & verified | Reversible in one command. |
| CS75-3 | Documentation update (apply "link, don't restate"). Update CONTEXT.md (Blockers section, mirror staging entry), INSTRUCTIONS.md (production-deploys section if it references warm replica assumptions), OPERATIONS.md (add "Waking production for ad-hoc validation" subsection paralleling the staging one — though prod waking is just *visit the site*), [`infra/README.md`](../../../infra/README.md) if it pins prod's `minReplicas`. Audit secrets on the GH `production` environment — confirm still needed (no secrets removed by this CS, but the audit is the same shape as CS58-3). Audit `.github/workflows/health-monitor.yml` — already verified (2026-05-08) that the 6h cron runs Azure-API-only checks (does NOT wake the container); the deep HTTP probe is `workflow_dispatch`-gated. **No change to health-monitor.yml is required.** Capture this finding in the docs PR. | ⬜ Planned | — (independent of CS75-1/2) | Can ship in parallel with CS75-1/2. |
| CS75-4 | Cost-verification soak. Wait ~7 days post-CS75-2, re-run the Cost Management meter query, document actual idle-meter drop and total saving. Expected: idle quantities drop >95% week-over-week, total trends <1 DKK/month. **Split out** as its own clickstop (`CS76-prod-cost-soak-verification`, paralleling [CS59](planned_cs59_staging-cost-soak-verification.md)) at CS75-2 close time so the wait is tracked properly with explicit "earliest claim date." Verdict appends back to this file under § CS76 cost-soak verification once CS76 closes. | ⬜ Planned (will be split out) | CS75-2 (+ ~7 days soak) | Detached at close per CS58 lesson — multi-day soaks should not park as `blocked` rows. |
| CS75-5 | **End-to-end functional validation via `prod-deploy.yml workflow_dispatch`.** Per CS58 lesson ("Live `az` update applied is NOT the same as deployed via workflow"): trigger a no-op prod deploy against `main` (containing the CS75-1 YAML change), confirm (a) workflow completes successfully end-to-end including CS73 wake step, (b) the new revision has `minReplicas=0`, and (c) the new revision serves a healthy `/healthz` after the workflow completes. Cold-wake `/healthz` from a deallocated state is harder to test reliably here (deploy itself warms the DB) — record this as a known limitation; the natural cold-start verification will happen organically the first time a real user hits the site after off-hours. | ⬜ Planned | CS75-1 merged, CS75-2 applied, CS73 merged | Mirrors CS58-5. The deploy itself counts as the first post-scale-to-zero deploy and exercises CS73's wake step against real prod load. |

### Dependency graph

```
CS73 (merged + verified) ──→ CS75-1 ──→ CS75-2 ──→ CS75-5 ──→ (close CS75)
                              │
                              └─ CS75-3 (parallel, independent)
                              └─ CS76 (cost soak, scheduled ≥ CS75-2 + 7 days, split out at close)
```

## Closure preconditions

CS75 cannot be closed until **all** of:

1. CS73 merged and verified (cold-DB wake step in prod-deploy.yml works end-to-end).
2. CS75-1 PR merged.
3. CS75-2 live `az` update applied with traffic shifted to the new revision and the prior revision deactivated. Verified via `az containerapp show --query "properties.template.scale.minReplicas"` returning `0` and `az containerapp revision list` showing a single active revision.
4. CS75-3 docs PR merged.
5. CS75-5 `prod-deploy.yml workflow_dispatch` succeeds end-to-end with `minReplicas=0` confirmed on the new revision and `/healthz` serving 200 post-deploy.

CS76 (7-day cost soak) appends results back to this file post-closure but does NOT block closure.

## Acceptance Criteria

- `az containerapp show --name gwn-production --resource-group gwn-rg --query "properties.template.scale.minReplicas"` returns `0`.
- After ~10 min of zero traffic, `az containerapp replica list --name gwn-production --resource-group gwn-rg` shows zero active replicas.
- A cold probe to `https://gwn.metzger.dk/healthz` returns 200 within ~120s after wake (budget: container cold start + DB serverless resume).
- The next regular `prod-deploy.yml workflow_dispatch` run completes successfully on the **first** attempt without operator pre-wake (validated by CS73's wake step).
- 7-day cost soak (CS76) shows `gwn-production`'s "Idle Usage" meter quantities dropped >95% week-over-week and total monthly cost trends toward <1 DKK.
- Documentation describes production accurately as a scale-to-zero environment with a documented cold-start expectation.

## Will not be done as part of this clickstop

- **Deleting** the `gwn-production` Container App, the `release/production` branch, or the `prod-deploy.yml` workflow.
- Changing the Azure SQL `autoPauseDelay` (it is intentional cost-saving; leaving it at 60min).
- Changing `health-monitor.yml` (already scale-to-zero-friendly: cron runs Azure-API-only).
- Adding a synthetic keep-warm pinger (explicitly rejected during planning — would defeat the saving).
- Improving the user-facing cold-start UX (e.g. richer progressive loader copy, 503 Retry-After surface) — that is [CS56](planned_cs56_server-cache-and-cold-db-fallback.md)'s scope.
- Telemetry/dashboard for cold-start frequency — could be a follow-up if anyone wants the data; not blocking.
- Changing `maxReplicas` (stays at 5).

## Risks & rollback

- **First user request after off-hours pays ~60–90s.** User-visible. Trade-off explicitly accepted during planning.
- **Multiplayer WebSocket sessions:** active traffic keeps the replica warm, so an in-progress match is not affected. A user trying to *start* multiplayer cold pays the cold start, same as a normal page load. No mitigation planned.
- **Cooldown period (~300s default) means prod takes ~5 min of zero traffic to actually deallocate.** During active hours the replica likely stays warm continuously.
- **Deploy-time cold-DB hit** — addressed by CS73 (hard dependency).
- **Old revision left active after `az` update would double-bill** (CS58-2 lesson) — task CS75-2 explicitly includes the traffic-shift + old-revision-deactivate steps.
- **Rollback policy (decided during planning):** if a real prod issue is observed (consistent >2min cold starts, broken multiplayer reconnects, alarming Copilot/user reports), **investigate first**; only roll back if the issue persists for >24h. Rollback command: `az containerapp update --name gwn-production --resource-group gwn-rg --min-replicas 1` — single command, instant. Document the rollback decision and re-open CS75 with the failure mode captured.

## Re-running the cost query

Source of truth for current cost is Azure Cost Management. The canonical PowerShell snippet for regenerating the meter-level breakdown lives in [§ Querying Azure cost in OPERATIONS.md](../../../OPERATIONS.md#querying-azure-cost) — run it from there so future cost analyses use a single source.

## Relationship to other clickstops

- **[CS58](../done/done_cs58_scale-staging-to-zero.md)** — direct precedent on staging. CS75 reuses the same task structure, the same `az` command pattern (with the traffic-shift + old-revision-deactivate lesson baked in), and the same cost-soak-as-separate-CS pattern.
- **[CS73](planned_cs73_prod-deploy-cold-db-handling.md)** — **hard dependency.** Must merge before CS75-2 because CS75 makes the deploy-time cold-DB failure mode the steady state instead of an edge case.
- **[CS56](planned_cs56_server-cache-and-cold-db-fallback.md)** — adjacent (no overlap). CS56 improves the user-facing cold-DB UX; CS75 makes that UX visible more often. CS56 not a blocker — user explicitly accepted the cold-start trade-off without it.
- **[CS59](planned_cs59_staging-cost-soak-verification.md)** — CS76 (the spin-off CS75 cost soak) will mirror CS59's structure exactly.
- **[CS53](../active/active_cs53_prod-cold-start-retry-investigation.md)** — investigates production cold-start retry behavior. CS75 will likely surface more cold-start cases and may inform CS53's investigation. Not a blocker either way.
- **`.github/workflows/health-monitor.yml`** — already scale-to-zero-friendly (verified 2026-05-08); no change required.
