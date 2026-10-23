$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
$InformationPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

# PowerBIMgmt 1.3.84 uses WAM, which requires a console HWND even in a
# hidden worker. Preserve the protocol pipes when allocating that console.
$protocolInput = [Console]::In
$protocolOutput = [Console]::Out
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PowerBiConsole {
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
    [DllImport("kernel32.dll")] public static extern bool AllocConsole();
    [DllImport("kernel32.dll")] public static extern bool FreeConsole();
    [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
}
'@
if ([PowerBiConsole]::GetAncestor([PowerBiConsole]::GetConsoleWindow(), 3) -eq [IntPtr]::Zero) {
    $null = [PowerBiConsole]::FreeConsole()
    $null = [PowerBiConsole]::AllocConsole()
    $null = [PowerBiConsole]::ShowWindow([PowerBiConsole]::GetConsoleWindow(), 0)
    [Console]::SetIn($protocolInput)
    [Console]::SetOut($protocolOutput)
}

function Send-Message($message) {
    [Console]::Out.WriteLine(($message | ConvertTo-Json -Depth 100 -Compress))
    [Console]::Out.Flush()
}

try {
    Import-Module MicrosoftPowerBIMgmt.Profile -ErrorAction Stop
    Send-Message @{ event = 'ready'; pid = $PID }
} catch {
    Send-Message @{ event = 'fatal'; code = 'MODULE_UNAVAILABLE'; message = 'MicrosoftPowerBIMgmt.Profile could not be loaded.' }
    exit 1
}

$connected = $false
$cachedToken = $null
$tokenCacheFile = $null
function Read-CachedToken($file) {
    try {
        if (-not (Test-Path -LiteralPath $file)) { return $null }
        $secure = Get-Content -LiteralPath $file -Raw | ConvertTo-SecureString -ErrorAction Stop
        $plain = [System.Net.NetworkCredential]::new('', $secure).Password
        $entry = $plain | ConvertFrom-Json
        if ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() -lt ([long]$entry.expires - 120)) { return [string]$entry.token }
    } catch { }
    return $null
}
function Save-CachedToken($file, $token) {
    try {
        $payload = $token.Split('.')[1].Replace('-', '+').Replace('_', '/')
        $payload = $payload.PadRight($payload.Length + ((4 - $payload.Length % 4) % 4), '=')
        $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
        if (-not $claims.exp) { return }
        $entry = @{ token = $token; expires = [long]$claims.exp } | ConvertTo-Json -Compress
        $encrypted = ConvertTo-SecureString $entry -AsPlainText -Force | ConvertFrom-SecureString
        $null = New-Item -ItemType Directory -Path (Split-Path -Parent $file) -Force
        [IO.File]::WriteAllText($file, $encrypted)
    } catch { } # Cache failure must not block the requested query.
}
while ($null -ne ($line = [Console]::ReadLine())) {
    $requestId = $null
    try {
        $request = $line | ConvertFrom-Json
        $requestId = $request.id
        if ($request.action -eq 'stop') { break }
        if ($request.action -ne 'query') { throw 'Unsupported action.' }
        $datasetId = [string]$request.datasetId
        $tenantId = [string]$request.tenantId
        if ($datasetId -notmatch '^[0-9a-fA-F-]{36}$' -or $tenantId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'Invalid model identifier.' }
        $dax = [string]$request.dax
        if ([string]::IsNullOrWhiteSpace($dax) -or $dax.Length -gt 100000) { throw 'Invalid DAX query.' }
        $tokenCacheFile = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) "bgapp\auth\powerbi-$tenantId.dpapi"
        if (-not $connected) { $cachedToken = Read-CachedToken $tokenCacheFile }
        if (-not $connected -and -not $cachedToken) {
            Send-Message @{ event = 'sign-in'; id = $requestId }
            # The Microsoft module owns credentials and token renewal. Never emit tokens.
            # WAM needs a visible owner while its account picker is active.
            $authOwner = [PowerBiConsole]::GetAncestor([PowerBiConsole]::GetConsoleWindow(), 3)
            [Console]::Title = 'Usagi Power BI - first sign-in'
            $null = [PowerBiConsole]::ShowWindow($authOwner, 5)
            try {
                $null = Connect-PowerBIServiceAccount -Tenant $tenantId -ErrorAction Stop
            } finally {
                $null = [PowerBiConsole]::ShowWindow($authOwner, 0)
            }
            $connected = $true
            $headers = Get-PowerBIAccessToken -ErrorAction Stop
            $cachedToken = ([string]$headers.Authorization) -replace '^Bearer\s+', ''
            Save-CachedToken $tokenCacheFile $cachedToken
            Send-Message @{ event = 'signed-in'; id = $requestId }
        }
        $body = @{
            queries = @(@{ query = $dax })
            serializerSettings = @{ includeNulls = $true }
        } | ConvertTo-Json -Depth 10 -Compress
        if ($connected) {
            $raw = Invoke-PowerBIRestMethod -Url "datasets/$datasetId/executeQueries" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 60 -ErrorAction Stop
            $result = $raw | ConvertFrom-Json
            $headers = Get-PowerBIAccessToken -ErrorAction Stop
            $cachedToken = ([string]$headers.Authorization) -replace '^Bearer\s+', ''
            Save-CachedToken $tokenCacheFile $cachedToken
        } else {
            $result = Invoke-RestMethod -Uri "https://api.powerbi.com/v1.0/myorg/datasets/$datasetId/executeQueries" -Method Post -Headers @{ Authorization = "Bearer $cachedToken" } -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json' -TimeoutSec 60 -ErrorAction Stop
        }
        if ($result.error -or @($result.results | Where-Object { $_.error }).Count -gt 0) {
            Send-Message @{ id = $requestId; ok = $false; code = 'QUERY_RESPONSE_ERROR'; message = 'Power BI returned a query error or truncated result.' }
        } else {
            Send-Message @{ id = $requestId; ok = $true; result = $result; pid = $PID }
        }
    } catch {
        $failureCode = 'POWER_BI_REQUEST_FAILED'
        if (-not $connected -and -not $cachedToken) { $failureCode = 'BI_AUTH_FAILED' }
        if ($_.Exception.Response) {
            $httpStatus = [int]$_.Exception.Response.StatusCode
            if ($httpStatus -eq 401) { $failureCode = 'BI_AUTH_REQUIRED' }
            elseif ($httpStatus -eq 403) { $failureCode = 'BI_PERMISSION_DENIED' }
            elseif ($httpStatus -eq 400) { $failureCode = 'BI_QUERY_ERROR' }
        } elseif ($_.Exception -is [System.Net.WebException]) {
            $failureCode = 'BI_NETWORK_ERROR'
        }
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) {
            $connected = $false
            $cachedToken = $null
            if ($tokenCacheFile) { Remove-Item -LiteralPath $tokenCacheFile -ErrorAction SilentlyContinue }
        }
        # Avoid leaking auth headers, tokens, or account details through error objects.
        $message = 'Power BI query failed. Retry the test; if sign-in expired, restart the bridge.'
        if (-not $connected) {
            $cause = $_.Exception
            while ($cause.InnerException) { $cause = $cause.InnerException }
            # Sign-in failures contain diagnostic text, never a successful token.
            $message = 'Power BI sign-in failed: ' + $cause.Message
        }
        Send-Message @{ id = $requestId; ok = $false; code = $failureCode; message = $message }
    }
}
