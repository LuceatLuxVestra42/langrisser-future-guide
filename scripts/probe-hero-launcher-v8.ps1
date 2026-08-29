$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v8'
$reportDir = Join-Path $root 'report'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$pcPage = 'https://mz.zlongame.com/jx/mzdownload/20180731/5473.html'
$launcher = 'https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
$prefix = Join-Path $root 'pe-prefix-8m.bin'
$headers = Join-Path $reportDir 'pe-prefix-8m.headers.txt'

$curlArgs = @(
  '-L','--fail','--silent','--show-error','--http1.1',
  '-A',$ua,'-e',$pcPage,'-H','Accept-Encoding: identity',
  '-r','0-8388607','--max-filesize','8388608',
  '-D',$headers,'-o',$prefix,'-w','%{http_code}|%{url_effective}|%{content_type}|%{size_download}',
  $launcher
)
$output = @(& curl.exe @curlArgs 2>&1)
$exitCode = $LASTEXITCODE
$meta = if ($output.Count) { [string]$output[-1] } else { '' }
if ($exitCode -ne 0) { throw "Range fetch failed: $($output -join "`n")" }
if ($meta -notmatch '^(200|206)\|') { throw "Unexpected range response: $meta" }
if (-not (Test-Path -LiteralPath $prefix)) { throw 'Prefix file missing.' }

$prefixSize = (Get-Item -LiteralPath $prefix).Length
if ($prefixSize -lt 2614272) { throw "Prefix too small to reach .rsrc: $prefixSize" }

python scripts/parse-pe-resource-index.py $prefix $reportDir
if ($LASTEXITCODE -ne 0) { throw "PE resource parser failed with exit $LASTEXITCODE" }

$summaryPath = Join-Path $reportDir 'resource-index-summary.json'
$inventoryPath = Join-Path $reportDir 'resource-inventory.json'
if (-not (Test-Path -LiteralPath $summaryPath)) { throw 'Resource summary missing.' }
$summary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
$inventory = Get-Content -LiteralPath $inventoryPath -Raw | ConvertFrom-Json

Write-Host '=== RESOURCE INDEX SUMMARY ==='
Get-Content -LiteralPath $summaryPath -Raw | Write-Host
Write-Host '=== LARGEST 40 RESOURCES ==='
$inventory | Sort-Object size -Descending | Select-Object -First 40 typeName,name,language,dataRawOffset,size,codePage | Format-Table -AutoSize | Out-String | Write-Host
Write-Host '=== RCDATA / HTML / MANIFEST / VERSION ==='
$inventory | Where-Object { $_.typeName -in @('RCDATA','HTML','MANIFEST','VERSION') } | Sort-Object size -Descending | Select-Object typeName,name,language,dataRawOffset,size,codePage | Format-Table -AutoSize | Out-String | Write-Host

Remove-Item -LiteralPath $prefix -Force -ErrorAction SilentlyContinue
