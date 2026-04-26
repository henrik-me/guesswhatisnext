# Unified Azure + GitHub bootstrap for GuessWhatIsNext
# Usage: .\infra\deploy.ps1 [-SkipProvision] [-SkipHealthCheck]
# Idempotent — safe to re-run.

param(
    [switch]$SkipProvision,
    [switch]$SkipHealthCheck
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir '..')).Path

$ResourceGroup = if ($env:RESOURCE_GROUP) { $env:RESOURCE_GROUP } else { 'gwn-rg' }
$Location = if ($env:LOCATION) { $env:LOCATION } else { 'eastus' }
$Environment = if ($env:ENVIRONMENT) { $env:ENVIRONMENT } else { 'gwn-env' }
$ImageName = if ($env:IMAGE_NAME) { $env:IMAGE_NAME } else { 'ghcr.io/henrik-me/guesswhatisnext' }
$ImageTag = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { 'latest' }
$PlaceholderImage = if ($env:PLACEHOLDER_IMAGE) { $env:PLACEHOLDER_IMAGE } else { 'mcr.microsoft.com/k8se/quickstart:latest' }
$TargetRepo = if ($env:TARGET_REPO) { $env:TARGET_REPO } else { 'henrik-me/guesswhatisnext' }
$ServicePrincipalName = if ($env:SERVICE_PRINCIPAL_NAME) { $env:SERVICE_PRINCIPAL_NAME } else { 'gwn-github-actions' }
$StagingAppName = 'gwn-staging'
$ProductionAppName = 'gwn-production'

$script:SubscriptionId = ''
$script:TenantId = ''
$script:ResourceScope = ''
$script:AzureCredentialsJson = ''
$script:JwtSecret = ''
$script:SystemApiKey = ''

function Write-Step($Message) {
    Write-Host "→ $Message" -ForegroundColor Yellow
}

function Write-Info($Message) {
    Write-Host "  $Message"
}

function Write-Success($Message) {
    Write-Host "  ✓ $Message" -ForegroundColor Green
}

function Write-WarnMessage($Message) {
    Write-Host "  ⚠ $Message" -ForegroundColor DarkYellow
}

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Get-EnvValue {
    param([string]$Name)

    $item = Get-Item "Env:$Name" -ErrorAction SilentlyContinue
    if ($item) {
        return [string]$item.Value
    }

    return ''
}

function Test-GhSecretExists {
    param([string]$Name)

    $names = gh secret list --repo $TargetRepo --json name --jq '.[].name' 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $false
    }

    return (($names -split "`r?`n") | Where-Object { $_ -eq $Name }).Count -gt 0
}

function Test-GhVariableExists {
    param([string]$Name)

    $names = gh variable list --repo $TargetRepo --json name --jq '.[].name' 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $false
    }

    return (($names -split "`r?`n") | Where-Object { $_ -eq $Name }).Count -gt 0
}

function Set-GhSecret {
    param(
        [string]$Name,
        [string]$Value
    )

    gh secret set $Name --repo $TargetRepo --body $Value | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to set GitHub secret $Name"
    }

    Write-Success "$Name set as GitHub secret"
}

function Set-GhVariable {
    param(
        [string]$Name,
        [string]$Value
    )

    gh variable set $Name --repo $TargetRepo --body $Value | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to set GitHub variable $Name"
    }

    Write-Success "$Name set as GitHub variable"
}

function New-SecureSecret {
    param([int]$ByteLength)

    $bytes = New-Object 'System.Byte[]' $ByteLength
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
}

function Normalize-TsvValue {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -eq 'None' -or $Value -eq 'null') {
        return ''
    }

    return $Value.Trim()
}

function Get-AppQuery {
    param(
        [string]$AppName,
        [string]$Query
    )

    $value = az containerapp show --name $AppName --resource-group $ResourceGroup --query $Query -o tsv 2>$null
    if ($LASTEXITCODE -ne 0) {
        return ''
    }

    return Normalize-TsvValue $value
}

function Get-AppEnvValue {
    param(
        [string]$AppName,
        [string]$EnvName
    )

    return Get-AppQuery $AppName "properties.template.containers[0].env[?name=='$EnvName'].value | [0]"
}

function Get-AppImage {
    param([string]$AppName)

    return Get-AppQuery $AppName 'properties.template.containers[0].image'
}

function Assert-AppInsightsSecretPresent {
    param([string]$AppName)

    $secretListOutput = az containerapp secret list `
        --name $AppName `
        --resource-group $ResourceGroup `
        --query "[?name=='appinsights-connection-string'].name" `
        -o tsv 2>&1
    $azExitCode = $LASTEXITCODE

    if ($azExitCode -ne 0) {
        $azError = ($secretListOutput | Out-String).Trim()
        Write-Host "Error: failed to query ACA secrets on $AppName (az exit=$azExitCode)." -ForegroundColor Red
        if ($azError) {
            Write-Host "       Azure CLI reported: $azError" -ForegroundColor Red
        }
        Write-Host "       Common causes: not logged in (run 'az login'), wrong subscription," -ForegroundColor Red
        Write-Host "       missing 'containerapp' extension, or insufficient RBAC on $ResourceGroup." -ForegroundColor Red
        throw "Failed to query ACA secrets for $AppName"
    }

    if (-not (Normalize-TsvValue ($secretListOutput | Out-String))) {
        Write-Host "Error: ACA secret 'appinsights-connection-string' is not registered on $AppName." -ForegroundColor Red
        Write-Host "       Run the CS54-1 + CS54-2 operator steps first — see" -ForegroundColor Red
        Write-Host "       project/clickstops/done/done_cs54_enable-app-insights-in-prod.md" -ForegroundColor Red
        Write-Host "       (or done/done_cs54_*.md once the clickstop is closed)." -ForegroundColor Red
        throw "Missing ACA secret 'appinsights-connection-string' on $AppName"
    }
}

function Get-AppFqdn {
    param([string]$AppName)

    return Get-AppQuery $AppName 'properties.configuration.ingress.fqdn'
}

function Get-HostFromUrl {
    param([string]$Url)

    if ([string]::IsNullOrWhiteSpace($Url)) {
        return ''
    }

    try {
        return ([Uri]$Url).Authority
    }
    catch {
        return ''
    }
}

function Resolve-SharedSecret {
    param(
        [string]$Name,
        [int]$ByteLength
    )

    $value = Get-EnvValue $Name
    if ($value) {
        return $value
    }

    foreach ($appName in @($StagingAppName, $ProductionAppName)) {
        $value = Get-AppEnvValue $appName $Name
        if ($value) {
            return $value
        }
    }

    return New-SecureSecret -ByteLength $ByteLength
}

function Ensure-AzureLogin {
    $script:SubscriptionId = az account show --query id -o tsv 2>$null
    $script:TenantId = az account show --query tenantId -o tsv 2>$null

    if ($LASTEXITCODE -ne 0 -or -not $script:SubscriptionId -or -not $script:TenantId) {
        throw "Not logged in to Azure. Run 'az login' first."
    }

    $script:SubscriptionId = $script:SubscriptionId.Trim()
    $script:TenantId = $script:TenantId.Trim()
    $script:ResourceScope = "/subscriptions/$($script:SubscriptionId)/resourceGroups/$ResourceGroup"
}

function Ensure-GitHubLogin {
    gh auth status *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Not logged in to GitHub CLI. Run 'gh auth login' first."
    }
}

function Ensure-ServicePrincipal {
    Write-Step 'Ensuring Azure service principal...'

    $appId = az ad app list --display-name $ServicePrincipalName --query '[0].appId' -o tsv 2>$null
    if ($LASTEXITCODE -ne 0) {
        $appId = ''
    }
    $appId = Normalize-TsvValue $appId

    if (-not $appId) {
        $appId = az ad app create --display-name $ServicePrincipalName --query appId -o tsv
        if ($LASTEXITCODE -ne 0) {
            throw 'Failed to create Entra application'
        }
        $appId = $appId.Trim()
        Write-Success "Created Entra application $ServicePrincipalName"
    }
    else {
        Write-Info "Using existing Entra application $ServicePrincipalName"
    }

    az ad sp show --id $appId *> $null
    if ($LASTEXITCODE -ne 0) {
        az ad sp create --id $appId | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw 'Failed to create service principal'
        }
        Write-Success 'Created service principal'
    }
    else {
        Write-Info 'Service principal already exists'
    }

    $spObjectId = az ad sp show --id $appId --query id -o tsv
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to resolve service principal object id'
    }
    $spObjectId = $spObjectId.Trim()

    $roleCount = az role assignment list --assignee-object-id $spObjectId --scope $script:ResourceScope --query "[?roleDefinitionName=='Contributor'] | length(@)" -o tsv 2>$null
    if ($LASTEXITCODE -ne 0) {
        $roleCount = '0'
    }
    $roleCount = Normalize-TsvValue $roleCount
    if (-not $roleCount) {
        $roleCount = '0'
    }

    if ($roleCount -eq '0') {
        az role assignment create `
            --assignee-object-id $spObjectId `
            --assignee-principal-type ServicePrincipal `
            --role Contributor `
            --scope $script:ResourceScope | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to grant Contributor on $($script:ResourceScope)"
        }
        Write-Success "Granted Contributor on $($script:ResourceScope)"
    }
    else {
        Write-Info "Contributor role already assigned on $($script:ResourceScope)"
    }

    $clientSecret = az ad app credential reset --id $appId --display-name "$ServicePrincipalName-github-actions" --query password -o tsv
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to refresh service principal credentials'
    }
    $clientSecret = $clientSecret.Trim()

    $script:AzureCredentialsJson = ([ordered]@{
        clientId                     = $appId
        clientSecret                 = $clientSecret
        subscriptionId               = $script:SubscriptionId
        tenantId                     = $script:TenantId
        activeDirectoryEndpointUrl   = 'https://login.microsoftonline.com'
        resourceManagerEndpointUrl   = 'https://management.azure.com/'
        activeDirectoryGraphResourceId = 'https://graph.windows.net/'
        sqlManagementEndpointUrl     = 'https://management.core.windows.net:8443/'
        galleryEndpointUrl           = 'https://gallery.azure.com/'
        managementEndpointUrl        = 'https://management.core.windows.net/'
    } | ConvertTo-Json -Compress)

    Write-Success 'Refreshed service principal credentials'
}

function Ensure-ResourceGroup {
    Write-Step 'Creating resource group...'
    az group create --name $ResourceGroup --location $Location --output none
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to create resource group'
    }
    Write-Success 'Resource group ready'
}

function Ensure-ContainerAppEnvironment {
    Write-Step 'Ensuring Container Apps environment...'
    az containerapp env show --name $Environment --resource-group $ResourceGroup *> $null
    if ($LASTEXITCODE -ne 0) {
        az containerapp env create `
            --name $Environment `
            --resource-group $ResourceGroup `
            --location $Location `
            --output none
        if ($LASTEXITCODE -ne 0) {
            throw 'Failed to create Container Apps environment'
        }
        Write-Success "Created Container Apps environment $Environment"
    }
    else {
        Write-Info 'Container Apps environment already exists'
    }
}

function Ensure-ContainerAppExists {
    param(
        [string]$AppName,
        [string]$NodeEnv,
        [string]$MinReplicas,
        [string]$MaxReplicas,
        [string]$Cpu,
        [string]$Memory
    )

    az containerapp show --name $AppName --resource-group $ResourceGroup *> $null
    if ($LASTEXITCODE -eq 0) {
        Write-Info "$AppName already exists"
        return
    }

    Write-Step "Creating $AppName..."
    az containerapp create `
        --name $AppName `
        --resource-group $ResourceGroup `
        --environment $Environment `
        --image $PlaceholderImage `
        --target-port 3000 `
        --ingress external `
        --min-replicas $MinReplicas `
        --max-replicas $MaxReplicas `
        --cpu $Cpu `
        --memory $Memory `
        --env-vars `
            "NODE_ENV=$NodeEnv" `
            'PORT=3000' `
            'GWN_DB_PATH=/tmp/game.db' `
            "JWT_SECRET=$($script:JwtSecret)" `
            "SYSTEM_API_KEY=$($script:SystemApiKey)" `
        --output none
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create $AppName"
    }

    Write-Success "Created $AppName"
}

function Configure-ContainerRegistry {
    param(
        [string]$AppName,
        [string]$Username,
        [string]$Password
    )

    if (-not $Username -or -not $Password) {
        return
    }

    Write-Step "Configuring GHCR pull credentials for $AppName..."
    az containerapp registry set `
        --name $AppName `
        --resource-group $ResourceGroup `
        --server ghcr.io `
        --username $Username `
        --password $Password `
        --output none
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to configure GHCR credentials for $AppName"
    }

    Write-Success "Configured GHCR registry credentials for $AppName"
}

function Update-ContainerAppRuntime {
    param(
        [string]$AppName,
        [string]$NodeEnv,
        [string]$CanonicalHost,
        [string]$Image
    )

    $envVars = @(
        "NODE_ENV=$NodeEnv",
        'PORT=3000',
        'GWN_DB_PATH=/tmp/game.db',
        "JWT_SECRET=$($script:JwtSecret)",
        "SYSTEM_API_KEY=$($script:SystemApiKey)",
        'APPLICATIONINSIGHTS_CONNECTION_STRING=secretref:appinsights-connection-string'
    )
    if ($CanonicalHost) {
        $envVars += "CANONICAL_HOST=$CanonicalHost"
    }

    $arguments = @(
        'containerapp', 'update',
        '--name', $AppName,
        '--resource-group', $ResourceGroup,
        '--set-env-vars',
        $envVars,
        '--output', 'none'
    )

    if ($Image) {
        $arguments += @('--image', $Image)
    }

    & az @arguments | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to update $AppName runtime configuration"
    }

    Write-Success "Updated $AppName runtime configuration"
}

function Ensure-ContainerAppRunning {
    param([string]$AppName)

    $state = Get-AppQuery $AppName 'properties.runningStatus'
    if ($state -match '^Running') {
        return
    }

    Write-Step "Starting $AppName via Azure REST API..."
    az rest `
        --method POST `
        --url "/subscriptions/$($script:SubscriptionId)/resourceGroups/$ResourceGroup/providers/Microsoft.App/containerApps/$AppName/start?api-version=2024-03-01" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to start $AppName"
    }

    for ($attempt = 1; $attempt -le 12; $attempt++) {
        Start-Sleep -Seconds 10
        $state = Get-AppQuery $AppName 'properties.runningStatus'
        if ($state -match '^Running') {
            Write-Success "$AppName is running"
            return
        }
    }

    throw "$AppName failed to reach a running state (last state: $state)"
}

function Invoke-VerificationHealthCheck {
    param(
        [string]$Label,
        [string]$AppName,
        [string]$BaseUrl,
        [string]$Image
    )

    if (-not $BaseUrl) {
        Write-WarnMessage "Skipping $Label health check: no URL available"
        return 'skipped'
    }

    if (-not $Image -or $Image -eq $PlaceholderImage) {
        Write-WarnMessage "Skipping $Label health check: $AppName is still using the placeholder image"
        return 'skipped'
    }

    Ensure-ContainerAppRunning $AppName

    Write-Step "Running $Label health check..."
    Start-Sleep -Seconds 30
    & (Join-Path $RepoRoot 'scripts\health-check.ps1') -BaseUrl $BaseUrl -ApiKey $script:SystemApiKey
    if ($LASTEXITCODE -ne 0) {
        return 'failed'
    }

    return 'passed'
}

Write-Host '=== GuessWhatIsNext Infra Bootstrap ===' -ForegroundColor Cyan
Write-Host "Repository:      $TargetRepo"
Write-Host "Resource Group:  $ResourceGroup"
Write-Host "Location:        $Location"
Write-Host "Image:           $ImageName`:$ImageTag"
Write-Host ''

Require-Command az
Require-Command gh

Ensure-AzureLogin
Ensure-GitHubLogin

$script:JwtSecret = Resolve-SharedSecret -Name 'JWT_SECRET' -ByteLength 48
$script:SystemApiKey = Resolve-SharedSecret -Name 'SYSTEM_API_KEY' -ByteLength 32

$GhcrUsername = Get-EnvValue 'GHCR_USERNAME'
if (-not $GhcrUsername) {
    $GhcrUsername = gh api user --jq .login 2>$null
    if ($LASTEXITCODE -ne 0) {
        $GhcrUsername = ''
    }
}
if (-not $GhcrUsername) {
    $GhcrUsername = $TargetRepo.Split('/')[0]
}
$GhcrUsername = $GhcrUsername.Trim()

$GhcrPatValue = Get-EnvValue 'GHCR_PAT'
if ($GhcrPatValue) {
    $GhcrPatValue = $GhcrPatValue.Trim()
}

if (-not $SkipProvision) {
    Ensure-ResourceGroup
    Ensure-ContainerAppEnvironment
    Ensure-ContainerAppExists -AppName $StagingAppName -NodeEnv 'staging' -MinReplicas '0' -MaxReplicas '2' -Cpu '0.25' -Memory '0.5Gi'
    Ensure-ContainerAppExists -AppName $ProductionAppName -NodeEnv 'production' -MinReplicas '1' -MaxReplicas '5' -Cpu '0.5' -Memory '1Gi'
}
else {
    Write-Info 'Skipping Azure resource creation (-SkipProvision)'
}

$StagingFqdn = Get-AppFqdn $StagingAppName
$ProdFqdn = Get-AppFqdn $ProductionAppName
$StagingUrl = if ($StagingFqdn) { "https://$StagingFqdn" } else { '' }
$ProdUrl = if ($ProdFqdn) { "https://$ProdFqdn" } else { '' }

$StagingHostOverride = Get-EnvValue 'CANONICAL_HOST'
$ProductionHostOverride = Get-EnvValue 'PRODUCTION_CANONICAL_HOST'
$StagingHost = if ($StagingHostOverride) { $StagingHostOverride } else { Get-HostFromUrl $StagingUrl }
$ProductionHost = if ($ProductionHostOverride) { $ProductionHostOverride } else { Get-HostFromUrl $ProdUrl }
if (-not $StagingHost) {
    $StagingHost = Get-AppEnvValue $StagingAppName 'CANONICAL_HOST'
}
if (-not $ProductionHost) {
    $ProductionHost = Get-AppEnvValue $ProductionAppName 'CANONICAL_HOST'
}

$StagingImage = Get-AppImage $StagingAppName
$ProductionImage = Get-AppImage $ProductionAppName

if ($GhcrPatValue) {
    Configure-ContainerRegistry -AppName $StagingAppName -Username $GhcrUsername -Password $GhcrPatValue
    Configure-ContainerRegistry -AppName $ProductionAppName -Username $GhcrUsername -Password $GhcrPatValue
    if (-not $StagingImage -or $StagingImage -eq $PlaceholderImage) {
        $StagingImage = "$ImageName`:$ImageTag"
    }
    if (-not $ProductionImage -or $ProductionImage -eq $PlaceholderImage) {
        $ProductionImage = "$ImageName`:$ImageTag"
    }
}

Write-Step "Configuring $StagingAppName..."
if (-not $StagingHost) {
    Write-WarnMessage "Could not determine staging CANONICAL_HOST; updating runtime without changing it"
}
Assert-AppInsightsSecretPresent -AppName $StagingAppName
Update-ContainerAppRuntime -AppName $StagingAppName -NodeEnv 'staging' -CanonicalHost $StagingHost -Image $StagingImage

Write-Step "Configuring $ProductionAppName..."
if (-not $ProductionHost) {
    Write-WarnMessage "Could not determine production CANONICAL_HOST; updating runtime without changing it"
}
Assert-AppInsightsSecretPresent -AppName $ProductionAppName
Update-ContainerAppRuntime -AppName $ProductionAppName -NodeEnv 'production' -CanonicalHost $ProductionHost -Image $ProductionImage

Write-Step 'Configuring GitHub repository settings...'
Ensure-ServicePrincipal
Set-GhSecret -Name 'AZURE_CREDENTIALS' -Value $script:AzureCredentialsJson
Set-GhSecret -Name 'JWT_SECRET' -Value $script:JwtSecret
Set-GhSecret -Name 'SYSTEM_API_KEY' -Value $script:SystemApiKey

if ($GhcrPatValue) {
    Set-GhSecret -Name 'GHCR_PAT' -Value $GhcrPatValue
}
elseif (Test-GhSecretExists 'GHCR_PAT') {
    Write-Info 'GHCR_PAT already exists, leaving current value in place'
}
else {
    Write-WarnMessage 'GHCR_PAT is not set. Export a dedicated read:packages token to seed the repo secret and Azure registry credentials.'
}

if ($ProdUrl) {
    Set-GhSecret -Name 'PROD_URL' -Value $ProdUrl
}
else {
    Write-WarnMessage 'Production URL is unavailable; skipping PROD_URL secret'
}

if ($StagingUrl) {
    Set-GhVariable -Name 'STAGING_URL' -Value $StagingUrl
}
else {
    Write-WarnMessage 'Staging URL is unavailable; skipping STAGING_URL variable'
}

if ($GhcrUsername) {
    Set-GhVariable -Name 'GHCR_USERNAME' -Value $GhcrUsername
}
else {
    Write-WarnMessage 'Could not determine GHCR_USERNAME; skipping GHCR_USERNAME variable'
}

if ($StagingHost) {
    Set-GhVariable -Name 'CANONICAL_HOST' -Value $StagingHost
}
else {
    Write-WarnMessage 'Could not determine CANONICAL_HOST; skipping CANONICAL_HOST variable'
}

$StagingAutoDeploy = Get-EnvValue 'STAGING_AUTO_DEPLOY'
if ($StagingAutoDeploy) {
    Set-GhVariable -Name 'STAGING_AUTO_DEPLOY' -Value $StagingAutoDeploy
}
elseif (Test-GhVariableExists 'STAGING_AUTO_DEPLOY') {
    Write-Info 'STAGING_AUTO_DEPLOY already exists, leaving current value in place'
}
else {
    Set-GhVariable -Name 'STAGING_AUTO_DEPLOY' -Value 'false'
}

$HealthChecksRun = 0
$HealthCheckFailures = 0

if (-not $SkipHealthCheck) {
    $StagingImage = Get-AppImage $StagingAppName
    $ProductionImage = Get-AppImage $ProductionAppName

    $result = Invoke-VerificationHealthCheck -Label 'staging' -AppName $StagingAppName -BaseUrl $StagingUrl -Image $StagingImage
    switch ($result) {
        'passed' { $HealthChecksRun++ }
        'failed' { $HealthChecksRun++; $HealthCheckFailures++ }
    }

    $result = Invoke-VerificationHealthCheck -Label 'production' -AppName $ProductionAppName -BaseUrl $ProdUrl -Image $ProductionImage
    switch ($result) {
        'passed' { $HealthChecksRun++ }
        'failed' { $HealthChecksRun++; $HealthCheckFailures++ }
    }

    if ($HealthChecksRun -eq 0) {
        Write-WarnMessage 'No health checks were executed. This usually means the apps are still on the placeholder image.'
    }

    if ($HealthCheckFailures -gt 0) {
        throw 'One or more health checks failed.'
    }
}
else {
    Write-Info 'Skipping health checks (-SkipHealthCheck)'
}

# ── Custom domain binding (one-time setup, not run on every deploy) ──────────
# Production uses a custom domain: gwn.metzger.dk
# Prerequisites:
#   1. CNAME record: gwn.metzger.dk → <app-fqdn> (e.g. gwn-production.<env-id>.<region>.azurecontainerapps.io)
#   2. TXT record: asuid.gwn.metzger.dk → <domain verification ID from Azure>
#
# After DNS records are in place, run these commands once:
#   az containerapp hostname add `
#     --name $ProductionAppName --resource-group $ResourceGroup `
#     --hostname gwn.metzger.dk
#   az containerapp hostname bind `
#     --name $ProductionAppName --resource-group $ResourceGroup `
#     --hostname gwn.metzger.dk --environment $Environment `
#     --validation-method CNAME
#
# Azure will provision a free managed TLS certificate automatically.
# The certificate renews automatically — no manual rotation needed.
#
# After binding, update the GitHub repo settings:
#   PROD_URL secret       → https://gwn.metzger.dk
#
# Note: re-running this script recomputes PROD_URL from the Azure FQDN
# and may overwrite the PROD_URL GitHub secret with that Azure hostname.
# If production should keep using the custom domain, restore PROD_URL
# manually to https://gwn.metzger.dk after running the script.
# ────────────────────────────────────────────────────────────────────────────

Write-Host ''
Write-Host '=== Setup Complete ===' -ForegroundColor Green
if ($StagingUrl) {
    Write-Host "Staging URL:     $StagingUrl"
}
if ($ProdUrl) {
    Write-Host "Production URL:  $ProdUrl"
}
Write-Host "GitHub repo:     $TargetRepo"
Write-Host ''
Write-Host 'Configured secrets:'
Write-Host '  - AZURE_CREDENTIALS'
Write-Host '  - JWT_SECRET'
Write-Host '  - SYSTEM_API_KEY'
if ($GhcrPatValue -or (Test-GhSecretExists 'GHCR_PAT')) {
    Write-Host '  - GHCR_PAT'
}
if ($ProdUrl) {
    Write-Host '  - PROD_URL'
}
Write-Host 'Configured variables:'
if ($StagingUrl) {
    Write-Host '  - STAGING_URL'
}
if ($GhcrUsername) {
    Write-Host '  - GHCR_USERNAME'
}
if ($StagingHost) {
    Write-Host '  - CANONICAL_HOST'
}
Write-Host '  - STAGING_AUTO_DEPLOY'
