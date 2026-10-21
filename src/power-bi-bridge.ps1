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
        if (-not $connected) {
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
            Send-Message @{ event = 'signed-in'; id = $requestId }
        }
        $body = @{
            queries = @(@{ query = $dax })
            serializerSettings = @{ includeNulls = $true }
        } | ConvertTo-Json -Depth 10 -Compress
        $raw = Invoke-PowerBIRestMethod -Url "datasets/$datasetId/executeQueries" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 60 -ErrorAction Stop
        $result = $raw | ConvertFrom-Json
        if ($result.error -or @($result.results | Where-Object { $_.error }).Count -gt 0) {
            Send-Message @{ id = $requestId; ok = $false; code = 'QUERY_RESPONSE_ERROR'; message = 'Power BI returned a query error or truncated result.' }
        } else {
            Send-Message @{ id = $requestId; ok = $true; result = $result; pid = $PID }
        }
    } catch {
        # Avoid leaking auth headers, tokens, or account details through error objects.
        $message = 'Power BI query failed. Retry the test; if sign-in expired, restart the bridge.'
        if (-not $connected) {
            $cause = $_.Exception
            while ($cause.InnerException) { $cause = $cause.InnerException }
            # Sign-in failures contain diagnostic text, never a successful token.
            $message = 'Power BI sign-in failed: ' + $cause.Message
        }
        Send-Message @{ id = $requestId; ok = $false; code = 'POWER_BI_REQUEST_FAILED'; message = $message }
    }
}
