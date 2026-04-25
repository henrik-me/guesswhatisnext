# CS58 — Scale `gwn-staging` Container App to zero (cost optimization)

**Status:** 🟢 Active — validating (re-opened by yoga-gwn-c3 on 2026-04-25T18:58Z; CS58-5 functional E2E validation pending)
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
| CS58-1 | Update `staging-deploy.yml` deploy YAML template to `minReplicas: 0` so future deploys don't re-introduce always-on. Validate via `workflow_dispatch` that smoke + E2E still pass with extra cold-start slack. | ✅ Done ([PR #248](https://github.com/henrik-me/guesswhatisnext/pull/248)) | — | One-line YAML change at the `scale:` block in the `deploy-azure-staging` job. |
| CS58-2 | Apply `minReplicas=0` to the live `gwn-staging` Container App: `az containerapp update --name gwn-staging --resource-group gwn-rg --min-replicas 0`. Confirm via `az containerapp show`. | ✅ Done (orchestrator-applied 2026-04-25T18:30Z) | CS58-1 (so live config doesn't drift from what next deploy would set) | Reversible in one command. Executed: `az containerapp update --min-replicas 0` created revision `gwn-staging--0000025` (min=0). Then switched 100% traffic to the new revision and deactivated the old `deploy-1777134427` (which still had min=1) — both steps required, otherwise old revision keeps running and we double-bill. Final state verified: single active revision `gwn-staging--0000025`, traffic=100, minReplicas=0. |
| CS58-3 | Documentation update — apply "link, don't restate." Update `INSTRUCTIONS.md`, `OPERATIONS.md`, `CONTEXT.md`, `infra/README.md` to describe staging as scale-to-zero with cold-start on first request. Update [`prod-deploy.yml`](../../../.github/workflows/prod-deploy.yml) header comment from "validated in staging" → "validated by Ephemeral Smoke Test job + local container:validate." Audit the GH `staging` environment secrets — confirm still needed. Add a short OPERATIONS section: "How to wake staging for a quick validation." | ✅ Done ([PR #249](https://github.com/henrik-me/guesswhatisnext/pull/249)) | — | Independent of CS58-1/2; can ship in parallel. Health-monitor audit: confirmed `.github/workflows/health-monitor.yml` does not ping `gwn-staging` (only targets `gwn-production`). Staging-secrets audit: GHCR_PAT, AZURE_CREDENTIALS, JWT_SECRET, SYSTEM_API_KEY all still required by `staging-deploy.yml`. |
| CS58-4 | Cost verification soak. Wait ~7 days post-CS58-2, re-run the Cost Management meter query, document actual idle-meter drop and total saving. Confirm meters show near-zero idle on staging. | ⏭️ Split out → [CS59](../planned/planned_cs59_staging-cost-soak-verification.md) | CS58-2 (+ ~7 days soak) | Detached so the soak gets picked up at the right time (≥ 2026-05-02) as a fresh claim, with explicit pre-flight, query procedure, pass/fail thresholds, and investigation runbook. The verdict will be appended back to this file under § CS59 cost-soak verification once CS59 closes. |
| CS58-5 | **End-to-end functional validation via `staging-deploy.yml workflow_dispatch`.** This is the unaddressed half of CS58-1's acceptance criterion ("Validate via `workflow_dispatch` that smoke + E2E still pass with extra cold-start slack") and the closure step CS58-2 missed. Verify that a fresh `staging-deploy.yml` run, executed against `main` (which contains the CS58-1 YAML change), (a) completes successfully end-to-end, (b) creates an active revision with `minReplicas=0`, and (c) the new revision serves a healthy `/healthz` after wake-from-cold. | 🔄 In progress | CS58-1 (merged) | Lucky alignment: yoga-gwn-c2's CS54-6 staging deploy run [24938066927](https://github.com/henrik-me/guesswhatisnext/actions/runs/24938066927) is doubling as this validation — it was triggered on `main` after CS58-1 merged, so the deploy YAML in effect uses `minReplicas: 0`. Watcher `watch-deploy-24938066927` is polling for terminal state + revision shape. If c2's run fails for CS54-related reasons (not CS58), CS58-5 must be re-run with an independent `workflow_dispatch`. |

### Dependency graph

```
CS58-1 ──→ CS58-2 ──→ CS58-5 (E2E validation) ──→ (close CS58)
CS58-3 (independent)
CS59 (cost soak, scheduled ≥ 2026-05-02 — independent of CS58 closure)
```

## Closure preconditions

CS58 cannot be closed until **all** of:

1. CS58-1 ✅ merged (PR #248)
2. CS58-2 ✅ live `az` update applied
3. CS58-3 ✅ merged (PR #249)
4. **CS58-5 functional E2E validation green** — i.e. a real `staging-deploy.yml workflow_dispatch` against `main` produces a healthy revision with `minReplicas=0`. This is the criterion I missed when I first marked CS58 done.

CS59 (7-day cost soak) appends results back to this file post-closure but does NOT block closure — it's a deferred verification of the cost projection, not an acceptance criterion of CS58 itself.

## In-flight notes (2026-04-25T18:58Z)

- **CS58-1** merged via [PR #248](https://github.com/henrik-me/guesswhatisnext/pull/248).
- **CS58-2** orchestrator-applied via `az containerapp update --min-replicas 0` followed by traffic switch + old-revision deactivation. Single active revision `gwn-staging--0000025`, traffic=100%, `minReplicas=0`. Note: this manually-applied revision will be **superseded** when CS58-5's deploy completes — the new workflow-deployed revision becomes the long-term live state.
- **CS58-3** merged via [PR #249](https://github.com/henrik-me/guesswhatisnext/pull/249). Docs updated, audits clean.
- **CS58-5** in flight. Watcher `watch-deploy-24938066927` (background sub-agent) polling c2's CS54-6 staging deploy. Verdict criteria + reporting protocol documented in CS58-5 row above.
- **Earlier transparency miss:** I closed CS58 prematurely (commit `fdc5181`), believing CS58-2 alone was sufficient functional validation. User correctly flagged that I never proved CS58-1 end-to-end via the workflow path — that's CS58-5. Reopening here, file moved back to `active/`.

## Lessons captured (added to repo memory)

- `az containerapp update --min-replicas 0` creates a **new** revision with the new spec but does NOT shift traffic. Must follow with `az containerapp ingress traffic set --revision-weight <new>=100` and `az containerapp revision deactivate --revision <old>`, otherwise both revisions stay active and double-bill.
- WORKBOARD State column has a strict canonical vocabulary (8 values per [TRACKING.md § WORKBOARD State Machine](../../../TRACKING.md#workboard-state-machine)). Non-canonical strings break `npm run check:docs:strict` on every subsequent PR until cleaned up.
- For multi-day soak / verification work, do not park the wait inside the original CS as a `blocked` row — split it out as its own clickstop with explicit "earliest claim date" so it gets picked up properly. (See CS59.)
- "Live `az` update applied" is **not** the same as "deployed via workflow." A CS that touches a deploy workflow YAML must include a real `workflow_dispatch` validation step before closing — running the orchestrator's preferred path (direct CLI) does not prove the workflow path. (See CS58-5.)



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

Source of truth for current cost is Azure Cost Management. The canonical PowerShell snippet for regenerating the meter-level breakdown above lives in [§ Querying Azure cost in OPERATIONS.md](../../../OPERATIONS.md#querying-azure-cost) — run it from there so future cost analyses use a single source.

## Relationship to other clickstops

- **CS53** — uses staging for cold-start investigation work (CS53-17-validate, CS53-19, planned CS53-20). All compatible with scale-to-zero; CS53-20 actually benefits because it would test the cold-start path that becomes the default state.
- **CS54 (App Insights)** — independent. If CS54 lands first, staging telemetry will keep working through cold starts.
- **CS41 (production-deploy validation)** — independent. The new pre-prod gate this CS sets up (Ephemeral Smoke Test + local container:validate) is the substrate CS41 will build on.
