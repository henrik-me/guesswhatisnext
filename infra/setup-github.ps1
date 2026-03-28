# GitHub + Azure setup for GuessWhatIsNext CI/CD
# Run once after Azure resources are provisioned with .\infra\deploy.ps1
#
# Prerequisites:
#   - Azure CLI logged in (az login)
#   - GitHub CLI logged in (gh auth login)
#   - .\infra\deploy.ps1 has been run successfully
#
# Usage: .\infra\setup-github.ps1

$ErrorActionPreference = "Stop"

$Repo = "henrik-me/guesswhatisnext"
$ResourceGroup = "gwn-rg"

# Helper: run an external command and fail fast on non-zero exit
function Invoke-CliOrFail {
    param([string]$Description)
    if ($LASTEXITCODE -ne 0) {
        Write-Error "$Description failed (exit code $LASTEXITCODE)."
        exit 1
    }
}

# Helper: generate a cryptographically secure random string (Base64)
function New-SecureSecret {
    param([int]$ByteLength)
    $bytes = New-Object 'System.Byte[]' $ByteLength
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
}

Write-Host "=== GitHub CI/CD Setup for $Repo ===" -ForegroundColor Cyan
Write-Host ""

# ─── 1. Create Azure service principal ────────────────────────────────────────

Write-Host "→ Step 1: Azure service principal" -ForegroundColor Yellow
$SubscriptionId = az account show --query id -o tsv
if ($LASTEXITCODE -ne 0) {
    Write-Error "Not logged in to Azure. Run 'az login' first."
    exit 1
}

Write-Host "  Creating service principal 'gwn-github-actions'..."
$SpJson = az ad sp create-for-rbac `
    --name "gwn-github-actions" `
    --role contributor `
    --scopes "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroup" `
    --sdk-auth 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create service principal. Check Azure permissions."
    exit 1
}

$SpJson | gh secret set AZURE_CREDENTIALS --repo $Repo
Invoke-CliOrFail "Setting AZURE_CREDENTIALS secret"
Write-Host "  ✓ AZURE_CREDENTIALS set as GitHub secret" -ForegroundColor Green

# ─── 2. Set app secrets in GitHub ─────────────────────────────────────────────

Write-Host ""
Write-Host "→ Step 2: App secrets" -ForegroundColor Yellow

if ($env:JWT_SECRET) {
    $env:JWT_SECRET | gh secret set JWT_SECRET --repo $Repo
    Invoke-CliOrFail "Setting JWT_SECRET secret"
    Write-Host "  ✓ JWT_SECRET set from environment variable" -ForegroundColor Green
} else {
    $existing = gh secret list --repo $Repo 2>$null | Select-String "JWT_SECRET"
    if ($existing) {
        Write-Host "  ✓ JWT_SECRET already exists, skipping"
    } else {
        $jwt = New-SecureSecret -ByteLength 48
        $jwt | gh secret set JWT_SECRET --repo $Repo
        Invoke-CliOrFail "Setting JWT_SECRET secret"
        Write-Host "  ✓ JWT_SECRET generated and set" -ForegroundColor Green
    }
}

if ($env:SYSTEM_API_KEY) {
    $env:SYSTEM_API_KEY | gh secret set SYSTEM_API_KEY --repo $Repo
    Invoke-CliOrFail "Setting SYSTEM_API_KEY secret"
    Write-Host "  ✓ SYSTEM_API_KEY set from environment variable" -ForegroundColor Green
} else {
    $existing = gh secret list --repo $Repo 2>$null | Select-String "SYSTEM_API_KEY"
    if ($existing) {
        Write-Host "  ✓ SYSTEM_API_KEY already exists, skipping"
    } else {
        $apikey = New-SecureSecret -ByteLength 32
        $apikey | gh secret set SYSTEM_API_KEY --repo $Repo
        Invoke-CliOrFail "Setting SYSTEM_API_KEY secret"
        Write-Host "  ✓ SYSTEM_API_KEY generated and set" -ForegroundColor Green
    }
}

# ─── 3. Get deployed URLs ────────────────────────────────────────────────────

Write-Host ""
Write-Host "→ Step 3: Retrieve deployed URLs" -ForegroundColor Yellow

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

if (-not $StagingFqdn -or -not $ProdFqdn) {
    Write-Host "  ⚠ Container apps not found. Run .\infra\deploy.ps1 first." -ForegroundColor Red
    Write-Host "  Skipping URL configuration."
} else {
    $StagingUrl = "https://$StagingFqdn"
    $ProdUrl = "https://$ProdFqdn"

    Write-Host "  Staging:    $StagingUrl"
    Write-Host "  Production: $ProdUrl"

    # STAGING_URL as variable (staging-deploy.yml reads vars.STAGING_URL)
    # PROD_URL as secret (health-monitor.yml reads secrets.PROD_URL)
    $StagingUrl | gh variable set STAGING_URL --repo $Repo 2>$null
    Invoke-CliOrFail "Setting STAGING_URL variable"
    $ProdUrl | gh secret set PROD_URL --repo $Repo 2>$null
    Invoke-CliOrFail "Setting PROD_URL secret"
    Write-Host "  ✓ STAGING_URL set as GitHub variable" -ForegroundColor Green
    Write-Host "  ✓ PROD_URL set as GitHub secret" -ForegroundColor Green
}

# ─── 4. Summary ──────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "GitHub Secrets (set automatically):"
Write-Host "  ✓ AZURE_CREDENTIALS — service principal for Azure deployments"
Write-Host "  ✓ JWT_SECRET"
Write-Host "  ✓ SYSTEM_API_KEY"
if ($ProdFqdn) { Write-Host "  ✓ PROD_URL = $ProdUrl" }
Write-Host ""
Write-Host "GitHub Variables:"
if ($StagingFqdn) { Write-Host "  ✓ STAGING_URL = $StagingUrl" }
Write-Host ""
Write-Host "The staging deploy workflow will now deploy to Azure automatically"
Write-Host "on every merge to main. Trigger it manually with:"
Write-Host "  gh workflow run staging-deploy.yml" -ForegroundColor Cyan
