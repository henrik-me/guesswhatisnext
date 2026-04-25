# CS54 — Enable Azure Application Insights in production

**Status:** ⬜ Planned
**Owner:** unassigned (planning by yoga-gwn-c2)
**Origin:** Discovered during CS53-1 (2026-04-23). When pulling logs to investigate the cold-start retry hiccup, we found that the production Container App has no `APPLICATIONINSIGHTS_CONNECTION_STRING` env var set. The OTel SDK is wired and ready ([`server/telemetry.js`](../../../server/telemetry.js)) — it just falls back to no-export. As a result, neither `traces` nor `requests` tables exist for the prod resource in Application Insights; we can only query Container Apps console stdout via Log Analytics (`ContainerAppConsoleLogs_CL`).

## Goal

Enable Application Insights in production (and staging, for parity) so future investigations have access to:

- Structured `requests` table (HTTP req/resp pairs with duration, status, name, id)
- `dependencies` table (mssql connection attempts, durations, success/fail)
- `exceptions` table (typed stack traces with request correlation)
- `traces` table (Pino logs with structured `customDimensions`)
- Distributed tracing via OTel `trace_id`/`span_id` already injected by [`server/logger.js`](../../../server/logger.js)

This eliminates the need for ad-hoc `parse_json(Log_s)` extraction over Container App console logs and unlocks proper KQL across HTTP and DB layers.

## Investigation summary (already known — no rediscovery needed)

| Component | State | Notes |
|---|---|---|
| `server/telemetry.js` | ✅ Ready | Instantiates `AzureMonitorTraceExporter` when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set. Selection precedence: OTLP endpoint → AI conn string → no-op. No code change required. |
| `server/config.js:25` | ✅ Ready | `APPLICATIONINSIGHTS_CONNECTION_STRING` already declared (defaults to `''`). |
| `tests/opentelemetry.test.js` | ✅ Exists | Already covers enabled/disabled bootstrap paths. CS54 must not regress these. |
| `prod-deploy.yml` | ❌ Missing | Env-var enumeration in deploy template (~L186) AND rollback template (~L280); plus `env:` blocks (~L211, ~L322). |
| `staging-deploy.yml` | ❌ Missing | Env-var enumeration (~L464) plus `env:` block (~L496). |
| `infra/deploy.sh` / `deploy.ps1` | ❌ Missing | One-shot provisioning; if re-run, would not set the env var. Update for completeness. |
| AI resource in Azure | ❌ Does not exist | Verified: no `APPLICATIONINSIGHTS_CONNECTION_STRING` reference anywhere in `infra/`. CS54-1 must provision. |
| Existing Log Analytics workspace | 🔍 Unknown — TBD in CS54-1 | Container Apps writes to a workspace already; AI should be workspace-based against the same one. |

## Design decisions

1. **Workspace-based App Insights.** Bind the new AI resource to the existing Log Analytics workspace that backs Container Apps console logs (`ContainerAppConsoleLogs_CL`). Benefits: single workspace for both streams, cross-table joins possible, single retention policy, no extra workspace cost.
2. **Two AI resources, not one.** Separate AI resources for staging and production. Mixing them defeats the purpose of having staging in the first place — incident KQL must filter to a known environment without `cloud_RoleName` heuristics. Naming: `gwn-ai-production`, `gwn-ai-staging`. Same `gwn-rg` resource group.
3. **Connection string stored as GitHub secret.** `APPLICATIONINSIGHTS_CONNECTION_STRING_PROD` and `APPLICATIONINSIGHTS_CONNECTION_STRING_STAGING` (separate secrets — never share). Wired into the deploy YAML the same way `JWT_SECRET` is today: literal `value:` in the YAML, with the actual secret resolved via `${{ secrets.* }}` in the workflow's `env:` block. We deliberately do **not** use `secretRef:` + `az containerapp secret set` in this iteration — that adds a separate provisioning step and the existing pattern in `prod-deploy.yml` is consistent.
4. **Enable both staging and prod in the same clickstop.** The cost of doing only prod is that staging stays observability-blind, which keeps CS47 partially blocked and means CS54 verifies AI in production for the first time. Staging-first lets us verify the wiring on a non-customer environment before prod ever sees it.
5. **No code changes.** Strictly infra/CI work. If `tests/opentelemetry.test.js` needs anything, it's at most an additional case for the staging-vs-prod connection-string distinction (which is `process.env`-driven and already covered).
6. **No custom metrics or alerts in this CS.** That's CS47's scope. CS54's success criterion is "tables populate"; alerting on contents is a follow-up.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS54-1 | Provision AI resources (staging + prod) in `gwn-rg`, workspace-based against the existing Container Apps Log Analytics workspace. Capture both connection strings. | ⬜ Pending | Manual `az` commands documented in PR body; no Bicep/Terraform in this repo today, so we don't introduce IaC just for this. |
| CS54-2 | Add `APPLICATIONINSIGHTS_CONNECTION_STRING_STAGING` + `APPLICATIONINSIGHTS_CONNECTION_STRING_PROD` GitHub secrets (via `gh secret set`). Verify each is masked in workflow logs. | ⬜ Pending | Operator-only step (requires repo admin). Must be done before CS54-3. |
| CS54-3 | Wire `APPLICATIONINSIGHTS_CONNECTION_STRING` into `staging-deploy.yml`: deploy template env enumeration (~L464) + workflow `env:` block (~L496). | ⬜ Pending | First — we want staging to prove the wiring. PR includes container-validation cycle (env-only change to runtime path is borderline; treat as runtime-affecting and validate). |
| CS54-4 | Wire `APPLICATIONINSIGHTS_CONNECTION_STRING` into `prod-deploy.yml`: deploy template env enumeration (~L186) + rollback template env enumeration (~L280) + workflow `env:` blocks (~L211 + ~L322). **Both happy and rollback paths must be updated identically — easy to miss the rollback.** | ⬜ Pending | Depends on CS54-3 verified in staging. |
| CS54-5 | Update `infra/deploy.sh` and `infra/deploy.ps1` to set the env var when (re-)provisioning the container app, so the wiring isn't only in the GH Actions path. Also update `infra/setup-github.sh` / `setup-github.ps1` to register the new secret name in their checklists. | ⬜ Pending | Completeness — these scripts are the documented provisioning path. Pure docs/CI per REVIEWS.md (no app code change). |
| CS54-6 | Deploy + verify end-to-end: trigger staging deploy, hit `/api/health` then `/api/scores/leaderboard?mode=freeplay&period=alltime`, confirm a `requests` row + a `traces` row + an mssql `dependencies` row appear in `gwn-ai-staging` within 5 min. Then trigger prod deploy and repeat. Capture KQL+screenshots in PR body. | ⬜ Pending | This is the CS gate — if any table doesn't populate, troubleshoot before closing. |
| CS54-7 | Document common KQL queries in `OPERATIONS.md` (or a new `docs/observability.md`): cold-start dependency latency, request error rate, exception aggregation, log search by `trace_id`. Include staging-vs-prod filtering note. | ⬜ Pending | Replaces the ad-hoc `parse_json(Log_s)` queries used during CS53. |
| CS54-8 | Close clickstop: move file to `done/`, update WORKBOARD, summarize CS54 + link to first prod KQL screenshot in CONTEXT.md if relevant. | ⬜ Pending | Standard close-out. |

## Per-task implementation detail

### CS54-1 — Provision AI resources

```bash
# Discover the existing Log Analytics workspace ID for Container Apps
WORKSPACE_ID=$(az monitor log-analytics workspace list \
  --resource-group gwn-rg \
  --query "[0].id" -o tsv)
echo "Workspace: $WORKSPACE_ID"

# Provision staging AI
az monitor app-insights component create \
  --app gwn-ai-staging \
  --location <same as Container App> \
  --resource-group gwn-rg \
  --workspace "$WORKSPACE_ID" \
  --kind web \
  --application-type web

# Capture the connection string
az monitor app-insights component show \
  --app gwn-ai-staging --resource-group gwn-rg \
  --query connectionString -o tsv

# Same for prod
az monitor app-insights component create \
  --app gwn-ai-production \
  --location <same> \
  --resource-group gwn-rg \
  --workspace "$WORKSPACE_ID" \
  --kind web \
  --application-type web

az monitor app-insights component show \
  --app gwn-ai-production --resource-group gwn-rg \
  --query connectionString -o tsv
```

Document both connection strings in a private note (1Password / Azure Key Vault style) for the operator before CS54-2 wires them in. Do not paste them in PR descriptions, commits, or chat.

### CS54-2 — GitHub secrets

```bash
# From operator local shell (requires repo admin)
gh secret set APPLICATIONINSIGHTS_CONNECTION_STRING_STAGING --body "<staging conn string>"
gh secret set APPLICATIONINSIGHTS_CONNECTION_STRING_PROD    --body "<prod conn string>"

# Verify they exist
gh secret list | grep APPLICATIONINSIGHTS
```

### CS54-3 — Staging deploy wiring

In `.github/workflows/staging-deploy.yml`:

1. Env enumeration in the YAML template (~L464, after `GWN_DB_PATH`):
   ```yaml
                       - name: APPLICATIONINSIGHTS_CONNECTION_STRING
                         value: "${APPLICATIONINSIGHTS_CONNECTION_STRING}"
   ```
2. Workflow `env:` block (~L496):
   ```yaml
           env:
             JWT_SECRET: ${{ secrets.JWT_SECRET }}
             SYSTEM_API_KEY: ${{ secrets.SYSTEM_API_KEY }}
             CANONICAL_HOST: ${{ vars.CANONICAL_HOST }}
             STAGING_URL: ${{ vars.STAGING_URL }}
             APPLICATIONINSIGHTS_CONNECTION_STRING: ${{ secrets.APPLICATIONINSIGHTS_CONNECTION_STRING_STAGING }}
   ```
3. Mask the value at job start: add an early step that calls `echo "::add-mask::$APPLICATIONINSIGHTS_CONNECTION_STRING"` (mirrors the `CANONICAL_HOST` masking pattern in `prod-deploy.yml:176`).

### CS54-4 — Prod deploy wiring

Same pattern as CS54-3, applied to `.github/workflows/prod-deploy.yml`:

- **Happy-path deploy template** (~L186): add env entry.
- **Rollback deploy template** (~L280): add env entry — easy to forget, breaks rollback otherwise.
- **Workflow `env:` blocks** at L211 and L322: add `APPLICATIONINSIGHTS_CONNECTION_STRING: ${{ secrets.APPLICATIONINSIGHTS_CONNECTION_STRING_PROD }}` to both.
- Mask early in each `inlineScript`.

### CS54-5 — Provisioning scripts

`infra/deploy.sh` / `deploy.ps1` (one-shot bootstrap scripts): add the env var to the `az containerapp create`/`update` invocation. Pull the value from a parameter or a local env. Document in `infra/README.md` that the operator must source the connection string from `az monitor app-insights component show ...`.

`infra/setup-github.sh` / `setup-github.ps1`: add `APPLICATIONINSIGHTS_CONNECTION_STRING_STAGING` and `APPLICATIONINSIGHTS_CONNECTION_STRING_PROD` to the documented secret checklist.

### CS54-6 — End-to-end verification

After staging deploy succeeds:

```kusto
// In Azure Portal: AI resource gwn-ai-staging → Logs

// 1. Confirm requests table populates
requests
| where timestamp > ago(15m)
| project timestamp, name, resultCode, duration
| order by timestamp desc
| take 20

// 2. Confirm Pino traces flow
traces
| where timestamp > ago(15m)
| project timestamp, message, severityLevel, customDimensions
| order by timestamp desc
| take 20

// 3. Confirm mssql dependencies are captured
dependencies
| where timestamp > ago(15m) and type contains "sql"
| project timestamp, name, target, success, duration
| order by timestamp desc
| take 20
```

All three queries must return ≥ 1 row within 5 min of the smoke probes (`/api/health` + `/api/scores/leaderboard?mode=freeplay&period=alltime` + at least one auth'd write to populate dependencies). Capture screenshots; attach to PR body.

Repeat the entire verification for `gwn-ai-production` after the prod deploy.

### CS54-7 — KQL examples in OPERATIONS.md

Add a `## Observability — App Insights query examples` subsection. At minimum:

- Cold-start mssql connect latency (`dependencies | where target contains "database.windows.net" | summarize percentiles(duration, 50, 95, 99) by bin(timestamp, 5m)`)
- HTTP error rate by route (`requests | summarize errors=countif(resultCode >= 500), total=count() by name`)
- Distributed trace lookup by `trace_id` (`union requests, traces, dependencies, exceptions | where operation_Id == "<trace_id>"`)
- Recent exceptions with stack (`exceptions | take 10 | project timestamp, type, outerMessage, details`)
- Pino-flavored search by structured field (`traces | where customDimensions["userId"] == "42"`)

Cross-link to CS53 archive for the cold-start-investigation flavor of these queries.

## Risks & mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Connection string leaked in workflow logs (it's a secret containing an InstrumentationKey URL) | HIGH | Mask via `::add-mask::` immediately after first read in each step; rely on GitHub Actions auto-masking of `${{ secrets.* }}` interpolation; never echo the raw value. |
| Rollback path missed in `prod-deploy.yml` | MEDIUM | Explicit task entry (CS54-4) calls out both paths; PR review checklist includes "rollback YAML updated identically"; add a CI grep that fails if `APPLICATIONINSIGHTS` appears only once in `prod-deploy.yml`. |
| Cost overrun on AI ingestion | LOW | App Insights free tier: 5GB/month per resource. Current Container App stdout volume is small (≤ 50MB/day). Initial 2-week sampling shows headroom; re-evaluate if traces volume grows. |
| Adding env var breaks the existing health probe | LOW | `tests/opentelemetry.test.js` already covers both code paths; container-validation cycle (`npm run container:validate`) on each PR catches lazy-init regressions. |
| Workspace-based AI requires the workspace to outlive the AI resource | LOW | Container Apps own the workspace lifecycle; AI is the dependent. Document in `infra/README.md`. |
| Local dev / tests now see a populated env var if operators export it locally | LOW | `server/telemetry.js` only enables the SDK when value is non-empty; tests in `tests/opentelemetry.test.js` already exercise both branches. Add a README note that the conn string belongs in `.env` only if the dev wants prod-shaped traces. |
| Two separate AI resources double the operational surface | LOW | Trade-off accepted in design decision #2; the alternative (single AI with `cloud_RoleName` filtering) is fragile because both environments use the same `serviceName` from `package.json`. |

## Acceptance criteria

- [ ] `APPLICATIONINSIGHTS_CONNECTION_STRING` is set on the prod Container App and the staging Container App.
- [ ] `traces`, `requests`, `dependencies`, `exceptions` tables exist and populate continuously in `gwn-ai-production` and `gwn-ai-staging`.
- [ ] A documented KQL example bundle exists in `OPERATIONS.md` for common incident queries.
- [ ] No regression in `npm test` (especially `tests/opentelemetry.test.js`).
- [ ] No regression in `npm run container:validate` cold-start cycle.
- [ ] Both happy-path and rollback paths in `prod-deploy.yml` reference the secret identically.
- [ ] Connection-string secrets are masked in workflow logs (verified by inspecting a real run's log).

## Will not be done as part of this clickstop

- Custom metrics or alerts beyond what OTel auto-instrumentation provides — that's CS47's scope (ProgressiveLoader telemetry & alerting).
- Reworking [`server/telemetry.js`](../../../server/telemetry.js) — it already supports App Insights export via the connection string; only env-var wiring is missing.
- Backfilling historical incident data — App Insights only sees forward from when it's enabled.
- Migrating to Bicep/Terraform IaC for the AI resource — out of scope; current infra is operator scripts.
- Cross-region failover for AI — single-region matches the rest of the deploy posture.

## Rollback story

Each task is independently revertable:

| Task | Rollback |
|------|----------|
| CS54-1 | `az monitor app-insights component delete --app gwn-ai-{staging,production} -g gwn-rg`. Free; no data loss for the rest of the system. |
| CS54-2 | `gh secret delete APPLICATIONINSIGHTS_CONNECTION_STRING_*`. |
| CS54-3, CS54-4 | Revert PR; redeploy. The container will revert to no-export (current behavior). No data lost; AI tables stop receiving new rows. |
| CS54-5 | Revert PR. Provisioning scripts return to current state. |
| CS54-6, CS54-7 | Pure verification / docs — nothing to roll back. |

## Observability deliverables (meta — for the CS itself)

Even though CS54 *is* the observability work, the rollout has its own signals:

- **Per deploy verification:** the verification queries from CS54-6 are re-runnable; if they ever stop returning rows, AI is mis-wired.
- **Workflow log audit:** a one-time grep through the post-CS54-3 staging run's logs to confirm no raw connection string is ever printed.
- **Cost watch:** check Azure cost panel for `gwn-ai-*` resources at +7 days and +30 days post-CS54-6; record both in the closing note.

## Relationship to other clickstops

- **CS53** — discovered this gap during cold-start investigation. CS53 finishes with Container Apps stdout-only logging.
- **CS47 (planned)** — ProgressiveLoader UX telemetry + alerting. CS47 is *much* easier with App Insights in place; CS54 is effectively a prerequisite.
- **CS41 (planned)** — Production deploy validation. CS41's "telemetry verified" check becomes implementable once CS54 lands.

## Parallelism

- CS54-1, CS54-2 are operator-only (Azure + GitHub admin). Sequential, but lightweight (~15 min total).
- CS54-3 must complete and verify in staging before CS54-4 ships. Sequential.
- CS54-5 can run in parallel with CS54-3 (different files; no conflict).
- CS54-6 is verification — sequential after CS54-3 / CS54-4.
- CS54-7 can be drafted in parallel with CS54-6 (KQL examples reuse the verification queries).
- CS54-8 follows everything.

Realistic worktree usage: 1 sub-agent for CS54-3+CS54-4+CS54-6 (one PR each, sequential) plus 1 in parallel for CS54-5+CS54-7. Or all in one slot sequentially — total work is small.

## Pre-dispatch checklist

- [x] CS54 number verified free across `planned/`, `active/`, `done/`, and WORKBOARD.md.
- [x] Investigation complete (telemetry.js, config.js, both deploy YAMLs, infra/ scripts, tests).
- [ ] Plan reviewed by rubber-duck pass (next step).
- [ ] After review: move file to `active/`, claim CS54-1 in WORKBOARD, prompt user `/rename`.
- [ ] CS54-1 + CS54-2 are operator-driven (Azure CLI + `gh secret set`); confirm operator has Azure subscription contributor access on `gwn-rg` and repo admin access before claiming.

## Open questions (to resolve during CS54-1 or before dispatch)

- [ ] Confirm the existing Log Analytics workspace ID and region (one `az` query in CS54-1).
- [ ] Confirm AI free-tier 5GB/month is sufficient for current log volume (operator can check Container Apps daily ingestion in Log Analytics).
- [ ] Decide whether `OPERATIONS.md` is the right home for KQL examples or whether a new `docs/observability.md` warrants its own file (lean: append to OPERATIONS.md unless the section grows beyond ~100 lines).
