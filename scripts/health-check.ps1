# health-check.ps1 — Local health check for GuessWhatIsNext (Windows)
# Usage: .\scripts\health-check.ps1 -BaseUrl http://localhost:3000 -ApiKey gwn-dev-system-key

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$BaseUrl,

    [Parameter(Mandatory = $true, Position = 1)]
    [string]$ApiKey
)

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')

$script:PassCount = 0
$script:FailCount = 0
$script:ExitCode = 0

function Write-Pass($Message) {
    $script:PassCount++
    Write-Host "  ✓ PASS " -ForegroundColor Green -NoNewline
    Write-Host $Message
}

function Write-Fail($Message, $Detail) {
    $script:FailCount++
    $script:ExitCode = 1
    Write-Host "  ✗ FAIL " -ForegroundColor Red -NoNewline
    Write-Host $Message
    if ($Detail) { Write-Host "         $Detail" -ForegroundColor DarkGray }
}

function Write-Section($Title) {
    Write-Host ""
    Write-Host "━━ $Title" -ForegroundColor Cyan
}

function Invoke-Check {
    param(
        [string]$Uri,
        [string]$Method = 'GET',
        [hashtable]$Headers = @{},
        [string]$Body,
        [int]$TimeoutSec = 10
    )
    $params = @{
        Uri             = $Uri
        Method          = $Method
        Headers         = $Headers
        TimeoutSec      = $TimeoutSec
        UseBasicParsing = $true
        ErrorAction     = 'Stop'
    }
    if ($Body) {
        $params.Body = $Body
        $params.ContentType = 'application/json'
    }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-WebRequest @params
        $sw.Stop()
        return @{
            StatusCode  = $response.StatusCode
            Body        = $response.Content
            ElapsedMs   = $sw.ElapsedMilliseconds
            Error       = $null
        }
    }
    catch {
        $sw.Stop()
        $statusCode = 0
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $body = $reader.ReadToEnd()
            $reader.Close()
        }
        else {
            $body = $_.Exception.Message
        }
        return @{
            StatusCode  = $statusCode
            Body        = $body
            ElapsedMs   = $sw.ElapsedMilliseconds
            Error       = $_.Exception.Message
        }
    }
}

# ── Health Endpoint ──────────────────────────────────────────────────────────
Write-Section "Health Endpoint"

$healthResult = Invoke-Check -Uri "$BaseUrl/api/health" -Headers @{ 'X-API-Key' = $ApiKey }

if ($healthResult.Error -and $healthResult.StatusCode -eq 0) {
    Write-Fail "Health endpoint reachable" $healthResult.Error
}
else {
    if ($healthResult.StatusCode -eq 200) {
        Write-Pass "Health endpoint reachable (HTTP $($healthResult.StatusCode), $($healthResult.ElapsedMs)ms)"
    }
    else {
        Write-Fail "Health endpoint reachable" "HTTP $($healthResult.StatusCode)"
    }

    # Check status field
    try {
        $healthJson = $healthResult.Body | ConvertFrom-Json
        if ($healthJson.status -eq 'ok') {
            Write-Pass "Health status: $($healthJson.status)"
        }
        elseif ($healthJson.status -eq 'degraded') {
            Write-Host "  ⚠ WARN " -ForegroundColor Yellow -NoNewline
            Write-Host "Health status: degraded"
        }
        else {
            Write-Fail "Health status" "Got: $($healthJson.status)"
        }
    }
    catch {
        Write-Fail "Health status" "Could not parse response JSON"
    }

    # Check response time
    if ($healthResult.ElapsedMs -le 5000) {
        Write-Pass "Response time: $($healthResult.ElapsedMs)ms (<=5000ms)"
    }
    else {
        Write-Fail "Response time" "$($healthResult.ElapsedMs)ms exceeds 5000ms threshold"
    }
}

# ── Auth Flow ────────────────────────────────────────────────────────────────
Write-Section "Auth Flow (register -> login -> fetch scores)"

$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$Username = "hc_test_$timestamp"
$Password = "healthcheck_pass_123"
$Token = $null

# Register
$regBody = @{ username = $Username; password = $Password } | ConvertTo-Json
$regResult = Invoke-Check -Uri "$BaseUrl/api/auth/register" -Method 'POST' -Body $regBody

if ($regResult.StatusCode -eq 201) {
    Write-Pass "Register user ($Username)"
    $regJson = $regResult.Body | ConvertFrom-Json
    $Token = $regJson.token
}
else {
    Write-Fail "Register user" "HTTP $($regResult.StatusCode)"
}

# Login
$loginBody = @{ username = $Username; password = $Password } | ConvertTo-Json
$loginResult = Invoke-Check -Uri "$BaseUrl/api/auth/login" -Method 'POST' -Body $loginBody

if ($loginResult.StatusCode -eq 200) {
    Write-Pass "Login user"
    $loginJson = $loginResult.Body | ConvertFrom-Json
    $Token = $loginJson.token
}
else {
    Write-Fail "Login user" "HTTP $($loginResult.StatusCode)"
}

# Fetch scores
if ($Token) {
    $scoresResult = Invoke-Check -Uri "$BaseUrl/api/scores/me" -Headers @{ 'Authorization' = "Bearer $Token" }
    if ($scoresResult.StatusCode -eq 200) {
        Write-Pass "Fetch scores (GET /api/scores/me)"
    }
    else {
        Write-Fail "Fetch scores" "HTTP $($scoresResult.StatusCode)"
    }
}
else {
    Write-Fail "Fetch scores" "No auth token available"
}

# ── Puzzles Endpoint ─────────────────────────────────────────────────────────
Write-Section "Puzzles Endpoint"

if ($Token) {
    $pzResult = Invoke-Check -Uri "$BaseUrl/api/puzzles" -Headers @{ 'Authorization' = "Bearer $Token" }

    if ($pzResult.StatusCode -eq 200) {
        Write-Pass "Puzzles endpoint (HTTP $($pzResult.StatusCode))"
    }
    else {
        Write-Fail "Puzzles endpoint" "HTTP $($pzResult.StatusCode)"
    }

    # Verify JSON array
    try {
        $puzzles = $pzResult.Body | ConvertFrom-Json
        if ($puzzles -is [System.Array] -or $puzzles -is [System.Collections.IEnumerable]) {
            $count = @($puzzles).Count
            Write-Pass "Puzzles returns JSON array ($count puzzles)"
        }
        else {
            Write-Fail "Puzzles response format" "Expected JSON array"
        }
    }
    catch {
        Write-Fail "Puzzles response format" "Could not parse JSON"
    }
}
else {
    Write-Fail "Puzzles endpoint" "No auth token available"
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━ Summary" -ForegroundColor White
Write-Host "  Passed: $script:PassCount" -ForegroundColor Green -NoNewline
Write-Host "  Failed: $script:FailCount" -ForegroundColor Red
Write-Host ""

if ($script:ExitCode -eq 0) {
    Write-Host "All checks passed ✓" -ForegroundColor Green
}
else {
    Write-Host "Some checks failed ✗" -ForegroundColor Red
}

exit $script:ExitCode
