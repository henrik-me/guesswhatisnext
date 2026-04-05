# Deprecated compatibility wrapper.

$ErrorActionPreference = 'Stop'

$forwardedArgs = @()
for ($i = 0; $i -lt $args.Count; $i++) {
    $arg = $args[$i]

    if ($arg -match '^-SkipProvision(?:$|:)') {
        if (
            $arg -eq '-SkipProvision' -and
            $i + 1 -lt $args.Count -and
            $args[$i + 1] -in @('$true', '$false', 'true', 'false')
        ) {
            $i++
        }

        continue
    }

    $forwardedArgs += $arg
}

Write-Host 'setup-github.ps1 is deprecated; forwarding to deploy.ps1 -SkipProvision' -ForegroundColor Yellow
& (Join-Path $PSScriptRoot 'deploy.ps1') -SkipProvision @forwardedArgs
exit $LASTEXITCODE
