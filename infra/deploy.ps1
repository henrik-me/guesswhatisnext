# Azure Container Apps deployment script for GuessWhatIsNext
# Usage: .\infra\deploy.ps1
# Idempotent — safe to re-run.

$ErrorActionPreference = "Stop"

# ─── Configuration ───────────────────────────────────────────────────────────

$ResourceGroup = "gwn-rg"
$Location = "eastus"
$Environment = "gwn-env"
$Registry = "ghcr.io"
$ImageName = "ghcr.io/henrik-me/guesswhatisnext"
$ImageTag = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "latest" }
# For initial provisioning, use a public placeholder image since GHCR is private.
# Staging auto-deploys the real GHCR image on merge to main via CI/CD;
# production deployment is manual or via a separate workflow.
$PlaceholderImage = "mcr.microsoft.com/k8se/quickstart:latest"

# Validate required environment variables
foreach ($var in @("JWT_SECRET", "SYSTEM_API_KEY")) {
    if (-not (Get-Item "env:$var" -ErrorAction SilentlyContinue)) {
        Write-Error "Error: $var environment variable is required"
        exit 1
    }
}

Write-Host "=== GuessWhatIsNext Azure Deployment ===" -ForegroundColor Cyan
Write-Host "Resource Group: $ResourceGroup"
Write-Host "Location:       $Location"
Write-Host "Image:          ${ImageName}:${ImageTag}"
Write-Host ""

# ─── Resource Group ──────────────────────────────────────────────────────────

Write-Host "→ Creating resource group..." -ForegroundColor Yellow
az group create --name $ResourceGroup --location $Location --output none
if ($LASTEXITCODE -ne 0) { exit 1 }

# ─── Container Apps Environment ──────────────────────────────────────────────

Write-Host "→ Creating Container Apps environment..." -ForegroundColor Yellow
$envExists = az containerapp env show --name $Environment --resource-group $ResourceGroup 2>$null
if (-not $envExists) {
    az containerapp env create `
        --name $Environment `
        --resource-group $ResourceGroup `
        --location $Location `
        --output none
    if ($LASTEXITCODE -ne 0) { exit 1 }
} else {
    Write-Host "  Environment already exists, skipping."
}

# ─── Deploy Staging ──────────────────────────────────────────────────────────

Write-Host "→ Deploying staging container app..." -ForegroundColor Yellow
$stagingExists = az containerapp show --name gwn-staging --resource-group $ResourceGroup 2>$null
if (-not $stagingExists) {
    az containerapp create `
        --name gwn-staging `
        --resource-group $ResourceGroup `
        --environment $Environment `
        --image $PlaceholderImage `
        --target-port 3000 `
        --ingress external `
        --min-replicas 0 `
        --max-replicas 2 `
        --cpu 0.25 `
        --memory 0.5Gi `
        --env-vars `
            NODE_ENV=staging `
            PORT=3000 `
            GWN_DB_PATH=/tmp/game.db `
            "JWT_SECRET=$env:JWT_SECRET" `
            "SYSTEM_API_KEY=$env:SYSTEM_API_KEY" `
        --output none
    if ($LASTEXITCODE -ne 0) { exit 1 }
} else {
    az containerapp update `
        --name gwn-staging `
        --resource-group $ResourceGroup `
        --image "${ImageName}:${ImageTag}" `
        --set-env-vars `
            NODE_ENV=staging `
            PORT=3000 `
            GWN_DB_PATH=/tmp/game.db `
            "JWT_SECRET=$env:JWT_SECRET" `
            "SYSTEM_API_KEY=$env:SYSTEM_API_KEY" `
        --output none
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host "  Staging app updated."
}

# ─── Deploy Production ───────────────────────────────────────────────────────

Write-Host "→ Deploying production container app..." -ForegroundColor Yellow
$prodExists = az containerapp show --name gwn-production --resource-group $ResourceGroup 2>$null
if (-not $prodExists) {
    az containerapp create `
        --name gwn-production `
        --resource-group $ResourceGroup `
        --environment $Environment `
        --image $PlaceholderImage `
        --target-port 3000 `
        --ingress external `
        --min-replicas 1 `
        --max-replicas 5 `
        --cpu 0.5 `
        --memory 1Gi `
        --env-vars `
            NODE_ENV=production `
            PORT=3000 `
            GWN_DB_PATH=/tmp/game.db `
            "JWT_SECRET=$env:JWT_SECRET" `
            "SYSTEM_API_KEY=$env:SYSTEM_API_KEY" `
        --output none
    if ($LASTEXITCODE -ne 0) { exit 1 }
} else {
    az containerapp update `
        --name gwn-production `
        --resource-group $ResourceGroup `
        --image "${ImageName}:${ImageTag}" `
        --set-env-vars `
            NODE_ENV=production `
            PORT=3000 `
            GWN_DB_PATH=/tmp/game.db `
            "JWT_SECRET=$env:JWT_SECRET" `
            "SYSTEM_API_KEY=$env:SYSTEM_API_KEY" `
        --output none
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host "  Production app updated."
}

# ─── Output URLs ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "=== Deployment Complete ===" -ForegroundColor Green

$StagingFqdn = az containerapp show `
    --name gwn-staging `
    --resource-group $ResourceGroup `
    --query "properties.configuration.ingress.fqdn" `
    -o tsv 2>$null

$ProdFqdn = az containerapp show `
    --name gwn-production `
    --resource-group $ResourceGroup `
    --query "properties.configuration.ingress.fqdn" `
    -o tsv 2>$null

Write-Host "Staging:    https://$StagingFqdn"
Write-Host "Production: https://$ProdFqdn"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Run .\infra\setup-github.ps1 to configure GitHub secrets"
Write-Host "  2. Or run the staging deploy workflow: gh workflow run staging-deploy.yml"
