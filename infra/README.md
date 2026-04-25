# Azure Infrastructure

Operational notes for deploying and maintaining the Azure Container Apps deployment of guesswhatisnext. Authoritative configuration lives in the workflow files and deploy scripts; this README points at them and covers a few topics those files don't.

Per [INSTRUCTIONS.md § Documentation Conventions](../INSTRUCTIONS.md#documentation-conventions), this file does not restate values (replica counts, secret names, image tags, environment names, region, CPU/memory limits, health-monitor cadence, branch-protection rules, etc.) that already live authoritatively in workflow files or deploy scripts — it links to them.

## Quickstart

- **Local / first-run bootstrap:** `./infra/deploy.sh --help` (Bash) or `.\infra\deploy.ps1 -help` (PowerShell). The scripts are idempotent.
- **Staging + production deploys:** see [`.github/workflows/staging-deploy.yml`](../.github/workflows/staging-deploy.yml) and [`.github/workflows/prod-deploy.yml`](../.github/workflows/prod-deploy.yml) for triggers, gates, and pipeline shape. The Azure `gwn-staging` Container App is being moved to scale-to-zero (on-demand cold-start; live state tracks [CS58-1/CS58-2](../project/clickstops/active/active_cs58_scale-staging-to-zero.md)) and is not a pre-prod release gate — see [§ Waking staging for ad-hoc validation in OPERATIONS.md](../OPERATIONS.md#waking-staging-for-ad-hoc-validation).
- **No Bicep / ARM templates:** infra is created imperatively by the deploy scripts via `az containerapp` commands.

## Custom Domain (one-time setup)

Production uses **gwn.metzger.dk**. The commands below are the procedure — they are not part of any deploy pipeline and have no other authoritative home.

### 1. DNS records

Add these in your DNS provider before binding the hostname in Azure. Some providers expect zone-relative hostnames (e.g. `gwn`, `asuid.gwn` in the `metzger.dk` zone), others expect FQDNs (`gwn.metzger.dk`, `asuid.gwn.metzger.dk`).

| Type  | Host         | Value |
|-------|--------------|-------|
| CNAME | `gwn`        | `gwn-production.<env-id>.<region>.azurecontainerapps.io` |
| TXT   | `asuid.gwn`  | Output of `az containerapp show --name gwn-production --resource-group gwn-rg --query "properties.customDomainVerificationId" -o tsv` |

### 2. Bind hostname + provision managed TLS cert

```bash
az containerapp hostname add \
  --name gwn-production --resource-group gwn-rg \
  --hostname gwn.metzger.dk

az containerapp hostname bind \
  --name gwn-production --resource-group gwn-rg \
  --hostname gwn.metzger.dk --environment gwn-env \
  --validation-method CNAME
```

The free managed TLS cert is issued automatically after DNS validation and renews automatically.

### 3. `PROD_URL` GitHub secret gotcha

Re-running `infra/deploy.sh` / `infra/deploy.ps1` resets the `PROD_URL` GitHub secret back to the Azure FQDN. After re-bootstrap, manually restore `PROD_URL` to `https://gwn.metzger.dk` (or whatever your custom domain is) so GitHub Actions keep targeting the custom hostname. `PRODUCTION_CANONICAL_HOST` only affects the container app's `CANONICAL_HOST` env var, not the secret.

## Operational troubleshooting

When prod is misbehaving, these are the `az` commands to reach for. For workflow context (what the pipeline did, which image tag is live, what the verify step checked) see [`prod-deploy.yml`](../.github/workflows/prod-deploy.yml) and [`health-monitor.yml`](../.github/workflows/health-monitor.yml).

```bash
# Tail logs
az containerapp logs show --name gwn-production --resource-group gwn-rg --follow

# List revisions (find the active one + recent ones to roll back to)
az containerapp revision list --name gwn-production --resource-group gwn-rg -o table

# Restart a revision
az containerapp revision restart --name gwn-production --resource-group gwn-rg --revision <revision-name>

# Running status
az containerapp show --name gwn-production --resource-group gwn-rg --query "properties.runningStatus"
```

Local health-check scripts: [`scripts/health-check.sh`](../scripts/health-check.sh) / [`scripts/health-check.ps1`](../scripts/health-check.ps1).

## Authoritative sources

For everything not covered above (replica counts, CPU/memory, secrets list, environment variables, image tags, region, GitHub environments setup, branch protection, health-monitor cadence + checks, CI/CD pipeline shape, auto-rollback behaviour, storage backend), go to the source — do not rely on a paraphrase here:

- [`.github/workflows/prod-deploy.yml`](../.github/workflows/prod-deploy.yml) — production deploy pipeline, verify, auto-rollback, replica counts, image, secrets used.
- [`.github/workflows/staging-deploy.yml`](../.github/workflows/staging-deploy.yml) — staging deploy pipeline, auto-deploy gating, smoke tests, manual approval.
- [`.github/workflows/health-monitor.yml`](../.github/workflows/health-monitor.yml) — production health monitor cadence, checks, retry logic, on-failure issue creation.
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — PR check pipeline (lint + test).
- [`infra/deploy.sh`](deploy.sh) / [`infra/deploy.ps1`](deploy.ps1) — local bootstrap + GitHub secret/variable seeding. Run with `--help` / `-help` for options.
- [`server/db/mssql-adapter.js`](../server/db/mssql-adapter.js) — production database adapter (Azure SQL serverless free tier; connection-string handling lives in `prod-deploy.yml`).
- [`CONTEXT.md § Current Codebase State`](../CONTEXT.md#current-codebase-state) — high-level architecture and component layout.
- [`README.md § Architecture`](../README.md#architecture) — repo overview and developer guide.
- [`project/clickstops/done/done_cs26_public-repo-transition.md`](../project/clickstops/done/done_cs26_public-repo-transition.md) — branch protection, GitHub environments, CODEOWNERS, fork-PR security (the historical setup record).
