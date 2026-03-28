# Azure Container Apps deployment script for GuessWhatIsNext
# Usage: .\infra\deploy.ps1
# Idempotent — safe to re-run.

$ErrorActionPreference = "Stop"

# ─── Configuration ───────────────────────────────────────────────────────────

$ResourceGroup = "gwn-rg"
$Location = "eastus"
$Environment = "gwn-env"
$ShareNameStaging = "gwn-data-staging"
$ShareNameProduction = "gwn-data-production"
$Registry = "ghcr.io"
$ImageName = "ghcr.io/henrik-me/guesswhatisnext"
$ImageTag = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "latest" }

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

# ─── Azure Storage for SQLite persistence ────────────────────────────────────
# Each environment gets its own file share so staging data never touches production.
# The app uses CREATE TABLE IF NOT EXISTS and only seeds when tables are empty,
# so deployments never overwrite existing data. Schema changes are additive
# (ALTER TABLE ADD COLUMN) and applied on startup.
#
# MIGRATION NOTE: If upgrading from the old shared gwn-data share, copy data first:
#   azcopy copy "https://<account>.file.core.windows.net/gwn-data/*" `
#               "https://<account>.file.core.windows.net/gwn-data-production/" --recursive

Write-Host "→ Setting up persistent storage..." -ForegroundColor Yellow

# Find or create storage account (names must be globally unique)
$ExistingStorage = az storage account list `
    --resource-group $ResourceGroup `
    --query "[?starts_with(name, 'gwnstorage')].name | [0]" `
    -o tsv 2>$null

if ($ExistingStorage -and $ExistingStorage -ne "None") {
    $StorageAccount = $ExistingStorage
    Write-Host "  Using existing storage account: $StorageAccount"
} else {
    $Suffix = (Get-Date -UFormat %s).Substring(0, 9) -replace "\.", ""
    $StorageAccount = "gwnstorage$Suffix"
    Write-Host "  Creating storage account: $StorageAccount"
    az storage account create `
        --name $StorageAccount `
        --resource-group $ResourceGroup `
        --location $Location `
        --sku Standard_LRS `
        --output none
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

$StorageKey = az storage account keys list `
    --resource-group $ResourceGroup `
    --account-name $StorageAccount `
    --query "[0].value" `
    -o tsv
if ($LASTEXITCODE -ne 0 -or -not $StorageKey) {
    Write-Error "Error: Failed to retrieve storage account key for storage account '$StorageAccount'."
    exit 1
}

# Create separate file shares for staging and production
foreach ($Share in @($ShareNameStaging, $ShareNameProduction)) {
    Write-Host "  Creating file share: $Share"
    az storage share create `
        --name $Share `
        --account-name $StorageAccount `
        --account-key $StorageKey `
        --output none 2>$null
}

# Register storage mounts in Container Apps environment (one per share)
az containerapp env storage set `
    --name $Environment `
    --resource-group $ResourceGroup `
    --storage-name gwn-storage-staging `
    --azure-file-account-name $StorageAccount `
    --azure-file-account-key $StorageKey `
    --azure-file-share-name $ShareNameStaging `
    --access-mode ReadWrite `
    --output none 2>$null

az containerapp env storage set `
    --name $Environment `
    --resource-group $ResourceGroup `
    --storage-name gwn-storage-production `
    --azure-file-account-name $StorageAccount `
    --azure-file-account-key $StorageKey `
    --azure-file-share-name $ShareNameProduction `
    --access-mode ReadWrite `
    --output none 2>$null

# ─── Deploy Staging ──────────────────────────────────────────────────────────

Write-Host "→ Deploying staging container app..." -ForegroundColor Yellow
$stagingExists = az containerapp show --name gwn-staging --resource-group $ResourceGroup 2>$null
if (-not $stagingExists) {
    az containerapp create `
        --name gwn-staging `
        --resource-group $ResourceGroup `
        --environment $Environment `
        --image "${ImageName}:${ImageTag}" `
        --target-port 3000 `
        --ingress external `
        --min-replicas 0 `
        --max-replicas 2 `
        --cpu 0.25 `
        --memory 0.5Gi `
        --env-vars `
            NODE_ENV=staging `
            PORT=3000 `
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
            "JWT_SECRET=$env:JWT_SECRET" `
            "SYSTEM_API_KEY=$env:SYSTEM_API_KEY" `
        --output none
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host "  Staging app updated."
}

# Volume mount for staging (via YAML)
$stagingYaml = @"
properties:
  template:
    volumes:
      - name: data-volume
        storageName: gwn-storage-staging
        storageType: AzureFile
    containers:
      - name: gwn-staging
        image: ${ImageName}:${ImageTag}
        volumeMounts:
          - volumeName: data-volume
            mountPath: /app/data
"@
$stagingYamlFile = [System.IO.Path]::GetTempFileName() + ".yaml"
$stagingYaml | Set-Content -Path $stagingYamlFile -Encoding UTF8
try {
    az containerapp update --name gwn-staging --resource-group $ResourceGroup --yaml $stagingYamlFile --output none 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Staging volume mount failed (exit code $LASTEXITCODE). May need manual config via Azure Portal."
    }
} finally {
    Remove-Item -Path $stagingYamlFile -ErrorAction SilentlyContinue
}

# ─── Deploy Production ───────────────────────────────────────────────────────

Write-Host "→ Deploying production container app..." -ForegroundColor Yellow
$prodExists = az containerapp show --name gwn-production --resource-group $ResourceGroup 2>$null
if (-not $prodExists) {
    az containerapp create `
        --name gwn-production `
        --resource-group $ResourceGroup `
        --environment $Environment `
        --image "${ImageName}:${ImageTag}" `
        --target-port 3000 `
        --ingress external `
        --min-replicas 1 `
        --max-replicas 5 `
        --cpu 0.5 `
        --memory 1Gi `
        --env-vars `
            NODE_ENV=production `
            PORT=3000 `
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
            "JWT_SECRET=$env:JWT_SECRET" `
            "SYSTEM_API_KEY=$env:SYSTEM_API_KEY" `
        --output none
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host "  Production app updated."
}

# Volume mount for production (via YAML)
$prodYaml = @"
properties:
  template:
    volumes:
      - name: data-volume
        storageName: gwn-storage-production
        storageType: AzureFile
    containers:
      - name: gwn-production
        image: ${ImageName}:${ImageTag}
        volumeMounts:
          - volumeName: data-volume
            mountPath: /app/data
"@
$prodYamlFile = [System.IO.Path]::GetTempFileName() + ".yaml"
$prodYaml | Set-Content -Path $prodYamlFile -Encoding UTF8
try {
    az containerapp update --name gwn-production --resource-group $ResourceGroup --yaml $prodYamlFile --output none 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Production volume mount failed (exit code $LASTEXITCODE). May need manual config via Azure Portal."
    }
} finally {
    Remove-Item -Path $prodYamlFile -ErrorAction SilentlyContinue
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
