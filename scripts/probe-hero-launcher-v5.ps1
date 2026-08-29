$ErrorActionPreference = 'Stop'

$source = Join-Path $PSScriptRoot 'probe-hero-launcher-v4.ps1'
$temp = Join-Path $env:RUNNER_TEMP 'probe-hero-launcher-v5-expanded.ps1'
$text = Get-Content -LiteralPath $source -Raw

$old = "https://mhmnzdownload.zlongame.com/MHMNZ/ClientDown/exe/20240227/DownLoad-MZ-PC.exe"
$current = "https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe"

if (-not $text.Contains($old)) {
  throw 'Expected v4 launcher URL marker was not found.'
}

$text = $text.Replace($old, $current)
Set-Content -LiteralPath $temp -Value $text -Encoding UTF8

& pwsh -NoProfile -ExecutionPolicy Bypass -File $temp
exit $LASTEXITCODE
