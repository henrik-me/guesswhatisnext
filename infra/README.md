# Azure Infrastructure

Deployment infrastructure for GuessWhatIsNext using Azure Container Apps.

## Architecture

```
GitHub Actions CI/CD
  ├── Build → GHCR (ghcr.io/henrik-me/guesswhatisnext)
  ├── Deploy Staging → Azure Container Apps (gwn-staging)
  ├── Smoke Tests → Health + API verification
  └── Deploy Production → Azure Container Apps (gwn-production)

Azure Resources
  ├── Resource Group: gwn-rg
  ├── Container Apps Environment: gwn-env
  ├── Container App: gwn-staging  (0-2 replicas, 0.25 CPU, 0.5 GiB)
  └── Container App: gwn-production (1-5 replicas, 0.5 CPU, 1 GiB)
```

## Prerequisites

1. **Azure CLI** — [Install](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
2. **GitHub CLI** — [Install](https://cli.github.com/)
3. **Node.js** — [Install](https://nodejs.org/) (required by `infra/deploy.sh`)
4. **curl** — required when running the bundled health checks from Bash / Git Bash
5. **Azure subscription** with permissions to create resources and Entra apps/service principals
6. **GitHub repository** with Actions enabled

### Azure CLI Setup

```bash
# Log in to Azure
az login

# Set your subscription (if you have multiple)
az account set --subscription "<subscription-id>"

# Register required providers
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
```

## Unified Setup

`infra/deploy.sh` and `infra/deploy.ps1` now handle the full first-run bootstrap:

- create/update the Azure resource group, Container Apps environment, and staging/production apps
- generate or reuse `JWT_SECRET` + `SYSTEM_API_KEY`
- create/reset the GitHub Actions Azure service principal and store `AZURE_CREDENTIALS`
- set the GitHub secrets/variables used by the deploy and health-monitor workflows
- configure app `CANONICAL_HOST` values from the deployed ingress URLs
- run the existing health-check script against any app already running the real image

The legacy `setup-github.sh` / `setup-github.ps1` entry points remain as compatibility wrappers and simply forward to `deploy.* --skip-provision`.

### Optional environment overrides

| Variable | Purpose |
|----------|---------|
| `GHCR_PAT` | Dedicated GitHub token with at least `read:packages` so Azure Container Apps can pull the private GHCR image |
| `GHCR_USERNAME` | Override the GHCR username if it differs from the logged-in `gh` user |
| `IMAGE_TAG` | Deploy a specific image tag instead of `latest` |
| `CANONICAL_HOST` | Override the staging hostname written to Azure / GitHub vars |
| `PRODUCTION_CANONICAL_HOST` | Override the production hostname written to Azure |
| `STAGING_AUTO_DEPLOY` | Seed or update the repo variable that gates automatic staging deploys |
| `RESOURCE_GROUP`, `LOCATION`, `ENVIRONMENT`, `TARGET_REPO` | Override the default infra or repo targets |

If `GHCR_PAT` is omitted, the script leaves any existing `GHCR_PAT` repo secret untouched but does not seed or rotate GHCR pull credentials. Provide `GHCR_PAT` explicitly whenever you want the bootstrap to configure or update GHCR access.

## Initial Deployment

### PowerShell (Windows)

```powershell
# 1. Login
az login

# 2. (Recommended) provide a dedicated GHCR pull token
$env:GHCR_PAT = '<github-token-with-read-packages>'

# 3. Run the unified bootstrap
.\infra\deploy.ps1
```

### Bash (macOS / Linux / WSL)

```bash
# 1. Login
az login

# 2. (Recommended) provide a dedicated GHCR pull token
export GHCR_PAT='<github-token-with-read-packages>'

# 3. Run the unified bootstrap
chmod +x infra/deploy.sh
./infra/deploy.sh
```

The bootstrap script is idempotent — safe to re-run at any time.

## GitHub Configuration

The unified deploy script writes the repository settings the workflows expect.

### Repository secrets (set automatically when values are available)

| Secret | Description |
|--------|-------------|
| `AZURE_CREDENTIALS` | Azure service principal JSON for `azure/login` |
| `JWT_SECRET` | Shared app secret for JWT signing |
| `SYSTEM_API_KEY` | Shared app secret for health/admin access |
| `GHCR_PAT` | Token used by Azure Container Apps to pull the private GHCR image |
| `PROD_URL` | Production base URL used by `prod-deploy.yml` and `health-monitor.yml` |

### Repository variables (set automatically when values are available)

| Variable | Description |
|----------|-------------|
| `STAGING_URL` | Staging base URL used by `staging-deploy.yml` |
| `GHCR_USERNAME` | GHCR username paired with `GHCR_PAT` |
| `CANONICAL_HOST` | Staging host name injected into staging runtime config |
| `STAGING_AUTO_DEPLOY` | Gates automatic staging deploys (`false` by default unless overridden) |

### GitHub environments

Create two environments under **Settings → Environments**:

- **`staging`** — used by staging deployment jobs
- **`production`** — used by production deployment and health monitoring
  - Enable **Required reviewers** for the production approval gate
  - Optionally add a **wait timer** (for example, 5 minutes)

## CI/CD Pipeline

Three workflows handle the full pipeline:

### PR Checks (`.github/workflows/ci.yml`)
Runs on every pull request to `main`:
```
[Lint] + [Test]  (parallel)
```

### Staging Deploy (`.github/workflows/staging-deploy.yml`)
Runs on every merge to `main`:
```
Build & Push GHCR → Ephemeral Smoke Test → ff release/staging
  → Manual Approval → Deploy Azure Staging → Verify Health
```

### Production Deploy (`.github/workflows/prod-deploy.yml`)
Manual trigger from `release/staging`:
```
Deploy same image to prod → Verify → Auto-rollback on failure
```

### Auto-Rollback

If production verification fails after deployment:
1. The previous container image is automatically redeployed
2. A GitHub issue is created with the `deployment-failure` label
3. The workflow run logs contain full details

### Docker Image Tags

Images are tagged with the short git SHA: `ghcr.io/henrik-me/guesswhatisnext:<sha>`

## Health Monitoring

The health monitor (`.github/workflows/health-monitor.yml`) runs every 5 minutes and
performs a multi-layer check of production:

### What it checks

| Check | Details |
|-------|---------|
| **Health endpoint** | `GET /api/health` with `X-API-Key` — verifies database, WebSocket, disk, and uptime |
| **Response time** | Flags as degraded if health endpoint takes >5 seconds |
| **Puzzles endpoint** | Registers a temp user, obtains a JWT, fetches `GET /api/puzzles` |
| **Retry logic** | Retries up to 3 times with 10 s delay before declaring failure |

### On failure

- Creates a GitHub issue with the `service-health` label containing full diagnostics
  (HTTP status, response time, response body, timestamp, workflow run link)
- If an open `service-health` issue already exists, adds a comment instead of a duplicate

### Workflow outputs

Other workflows can consume the health status via job outputs:

```yaml
jobs:
  downstream:
    needs: health-check
    if: needs.health-check.outputs.status == 'healthy'
```

Available outputs: `status` (healthy / degraded / failed), `health_status`,
`health_response_time`, `puzzles_status`, `timestamp`.

### Running health checks locally

Use the included scripts to check any environment from your machine:

```bash
# Bash / macOS / Linux / Git Bash
./scripts/health-check.sh http://localhost:3000 gwn-dev-system-key

# PowerShell (Windows)
.\scripts\health-check.ps1 -BaseUrl http://localhost:3000 -ApiKey gwn-dev-system-key
```

The scripts check:
1. `GET /api/health` — status and response time
2. Auth flow — register → login → fetch scores
3. `GET /api/puzzles` — data availability

Exit code `0` = all pass, `1` = any failure. Colored output shows pass/fail per check.

### Interpreting service-health issues

When the monitor creates an issue:
- **Health endpoint failed** — the server may be down or unhealthy (check Azure
  Container Apps logs)
- **Response time degraded** — the server is slow; check database latency or resource
  usage
- **Puzzles endpoint failed** — auth or data layer may be broken even though `/api/health`
  reports OK
- Close the issue once the root cause is resolved — the monitor will create a new one if
  the problem recurs

## Storage

SQLite databases are stored on the container's local filesystem (`GWN_DB_PATH=/tmp/game.db`
in staging/production). Data is ephemeral — lost on container restart. This is acceptable
for staging; production will migrate to Azure SQL (Phase 11b-c).

## Cost Estimates

With Container Apps consumption plan (pay-per-use):
- **Staging** (0 min replicas): ~$0 when idle
- **Production** (1 min replica): ~$15-30/month at low traffic

## Troubleshooting

```bash
# View container app logs
az containerapp logs show --name gwn-production --resource-group gwn-rg --follow

# Check app status
az containerapp show --name gwn-production --resource-group gwn-rg --query "properties.runningStatus"

# Restart an app
az containerapp revision restart --name gwn-production --resource-group gwn-rg --revision <revision-name>

# List revisions
az containerapp revision list --name gwn-production --resource-group gwn-rg -o table
```

## GitHub Repository Settings

For the CI/CD pipeline and health monitoring to work, the following must be
configured in the GitHub repository settings.

### Required Secrets

Navigate to **Settings → Secrets and variables → Actions → Secrets** and verify:

| Secret | Description |
|--------|-------------|
| `AZURE_CREDENTIALS` | Service principal JSON for Azure deployments |
| `JWT_SECRET` | Secret key used for signing JWT authentication tokens |
| `SYSTEM_API_KEY` | API key for health-check and admin endpoints |
| `GHCR_PAT` | GitHub token with package-read access for Azure Container Apps pulls |
| `PROD_URL` | Production application URL (e.g. `https://gwn-production.<region>.azurecontainerapps.io`) |

### Required Variables

Navigate to **Settings → Secrets and variables → Actions → Variables** and verify:

| Variable | Description |
|----------|-------------|
| `STAGING_URL` | Staging application URL (e.g. `https://gwn-staging.<region>.azurecontainerapps.io`) |
| `GHCR_USERNAME` | Username paired with `GHCR_PAT` |
| `CANONICAL_HOST` | Staging hostname used by the staging deploy workflow |
| `STAGING_AUTO_DEPLOY` | Auto-deploy gate (`false` by default unless intentionally enabled) |

### Environments

Create two environments under **Settings → Environments**:

- **staging** — used by staging deployment and smoke tests
- **production** — used by production deployment, verification, and health monitor
  - Enable **Required reviewers** for manual approval before production deploys
  - Optionally add a **wait timer** (e.g. 5 minutes)

### Branch Protection Rules

Navigate to **Settings → Branches → Add rule** for the `main` branch:

| Setting | Value |
|---------|-------|
| Branch name pattern | `main` |
| Require a pull request before merging | ✅ |
| Require approvals | 1 |
| Require status checks to pass | ✅ — select **Lint** and **Test** |
| Require branches to be up to date | ✅ |
| Include administrators | ✅ (recommended) |

This ensures every change to `main` passes CI and is reviewed before merging.
