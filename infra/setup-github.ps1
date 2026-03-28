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
Write-Host "  ✓ AZURE_CREDENTIALS set as GitHub secret" -ForegroundColor Green

# ─── 2. Set app secrets in GitHub ─────────────────────────────────────────────

Write-Host ""
Write-Host "→ Step 2: App secrets" -ForegroundColor Yellow

if ($env:JWT_SECRET) {
    $env:JWT_SECRET | gh secret set JWT_SECRET --repo $Repo
    Write-Host "  ✓ JWT_SECRET set from environment variable" -ForegroundColor Green
} else {
    $existing = gh secret list --repo $Repo 2>$null | Select-String "JWT_SECRET"
    if ($existing) {
        Write-Host "  ✓ JWT_SECRET already exists, skipping"
    } else {
        $jwt = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})
        $jwt | gh secret set JWT_SECRET --repo $Repo
        Write-Host "  ✓ JWT_SECRET generated and set" -ForegroundColor Green
    }
}

if ($env:SYSTEM_API_KEY) {
    $env:SYSTEM_API_KEY | gh secret set SYSTEM_API_KEY --repo $Repo
    Write-Host "  ✓ SYSTEM_API_KEY set from environment variable" -ForegroundColor Green
} else {
    $existing = gh secret list --repo $Repo 2>$null | Select-String "SYSTEM_API_KEY"
    if ($existing) {
        Write-Host "  ✓ SYSTEM_API_KEY already exists, skipping"
    } else {
        $apikey = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
        $apikey | gh secret set SYSTEM_API_KEY --repo $Repo
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

    # Set as repo-level variables
    try {
        $StagingUrl | gh variable set STAGING_URL --repo $Repo 2>$null
        $ProdUrl | gh variable set PROD_URL --repo $Repo 2>$null
        Write-Host "  ✓ URLs set as GitHub variables" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠ Could not set URL variables (may need environment-level config)" -ForegroundColor Red
    }
}

# ─── 4. Summary ──────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "GitHub Secrets (set automatically):"
Write-Host "  ✓ AZURE_CREDENTIALS — service principal for Azure deployments"
Write-Host "  ✓ JWT_SECRET"
Write-Host "  ✓ SYSTEM_API_KEY"
Write-Host ""
Write-Host "GitHub Variables:"
if ($StagingFqdn) { Write-Host "  ✓ STAGING_URL = $StagingUrl" }
if ($ProdFqdn) { Write-Host "  ✓ PROD_URL = $ProdUrl" }
Write-Host ""
Write-Host "The staging deploy workflow will now deploy to Azure automatically"
Write-Host "on every merge to main. Trigger it manually with:"
Write-Host "  gh workflow run staging-deploy.yml" -ForegroundColor Cyan
