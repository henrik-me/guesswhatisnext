# Deprecated compatibility wrapper.

$ErrorActionPreference = 'Stop'

$forwardedArgs = @(
    $args | Where-Object { $_ -notmatch '^-SkipProvision(?:$|:)' }
)

Write-Host 'setup-github.ps1 is deprecated; forwarding to deploy.ps1 -SkipProvision' -ForegroundColor Yellow
& (Join-Path $PSScriptRoot 'deploy.ps1') -SkipProvision @forwardedArgs
exit $LASTEXITCODE
