$ErrorActionPreference = 'Stop'

$source = Join-Path $PSScriptRoot 'probe-hero-launcher-v6.ps1'
$temp = Join-Path $env:RUNNER_TEMP 'probe-hero-launcher-v7-expanded.ps1'
$text = Get-Content -LiteralPath $source -Raw

$oldLength = '$contentLength = [int64]$head.Headers[''Content-Length'']'
$newLength = '$contentLength = [int64](@($head.Headers[''Content-Length''])[0])'
if (-not $text.Contains($oldLength)) { throw 'Expected Content-Length line not found.' }
$text = $text.Replace($oldLength, $newLength)

$oldBytes = 'bytesScanned=@($regionSummaries | Measure-Object downloadedBytes -Sum).Sum'
$newBytes = 'bytesScanned=($regionSummaries | Measure-Object -Property downloadedBytes -Sum).Sum'
if ($text.Contains($oldBytes)) { $text = $text.Replace($oldBytes, $newBytes) }

Set-Content -LiteralPath $temp -Value $text -Encoding UTF8
& pwsh -NoProfile -ExecutionPolicy Bypass -File $temp
exit $LASTEXITCODE
