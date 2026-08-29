$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v6'
$reportDir = Join-Path $root 'report'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$pcPage = 'https://mz.zlongame.com/jx/mzdownload/20180731/5473.html'
$launcher = 'https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
$maxChunkBytes = 40MB

function Invoke-RangeFetch([string]$Name, [int64]$Start, [int64]$End) {
  $body = Join-Path $root ($Name + '.bin')
  $headers = Join-Path $reportDir ($Name + '.headers.txt')
  $range = "$Start-$End"
  $args = @(
    '-L','--fail','--silent','--show-error','--http1.1',
    '-A',$ua,'-e',$pcPage,'-H','Accept-Encoding: identity',
    '-r',$range,'--max-filesize',[string]$maxChunkBytes,
    '-D',$headers,'-o',$body,'-w','%{http_code}|%{url_effective}|%{content_type}|%{size_download}',
    $launcher
  )
  $output = @(& curl.exe @args 2>&1)
  $exitCode = $LASTEXITCODE
  $meta = if ($output.Count) { [string]$output[-1] } else { '' }
  $status = $null; $finalUrl=$null; $contentType=$null; $downloaded=0L
  if ($meta -match '^(\d{3})\|([^|]*)\|([^|]*)\|(\d+)$') {
    $status=[int]$matches[1]; $finalUrl=$matches[2]; $contentType=$matches[3]; $downloaded=[int64]$matches[4]
  }
  return [pscustomobject]@{
    name=$Name; start=$Start; end=$End; requestedBytes=($End-$Start+1); path=$body
    curlExit=$exitCode; status=$status; finalUrl=$finalUrl; contentType=$contentType; downloadedBytes=$downloaded
    error=if ($exitCode -ne 0) { ($output -join "`n") } else { $null }
  }
}

function Get-RegionEvidence([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) { return [pscustomobject]@{ label=$Label; strings=@(); urls=@(); domains=@(); packaging=@() } }
  $bytes = [IO.File]::ReadAllBytes($Path)
  $ascii = [Text.Encoding]::Latin1.GetString($bytes)
  $unicode = [Text.Encoding]::Unicode.GetString($bytes)
  $interest = '(?i)(https?://|zlongame|qyzlgame|mhmnz|patch|update|updater|manifest|version|cdn|assetbundle|streamingassets|catalog|download|resource|reslist|filelist|launcher|client|server|endpoint|api\b|\.json\b|\.xml\b|\.ini\b|\.cfg\b|\.config\b)'
  $pack = '(?i)(Nullsoft|NSIS|Inno Setup|7-Zip|Chromium|CEF|libcef|Electron|Squirrel|UPX|Qt|resources\.pak|chrome_elf|icudtl|natives_blob|snapshot_blob)'
  $stringSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $urlSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $domainSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $packSet = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

  foreach ($text in @($ascii,$unicode)) {
    foreach ($m in [regex]::Matches($text,'[\x20-\x7E]{4,512}')) {
      $v=$m.Value
      if ($v -match $interest) { [void]$stringSet.Add($v) }
      if ($v -match $pack) { [void]$packSet.Add($v) }
      foreach ($u in [regex]::Matches($v,'(?i)https?://[^\s"<>]+')) { [void]$urlSet.Add($u.Value.TrimEnd('.',',',';',')',']','}')) }
      foreach ($d in [regex]::Matches($v,'(?i)(?:[a-z0-9-]+\.)+(?:zlongame\.com|qyzlgame\.com)')) { [void]$domainSet.Add($d.Value.ToLowerInvariant()) }
    }
  }
  return [pscustomobject]@{
    label=$Label
    strings=@($stringSet | Sort-Object)
    urls=@($urlSet | Sort-Object)
    domains=@($domainSet | Sort-Object)
    packaging=@($packSet | Sort-Object)
  }
}

# Current public object metadata. Referer is the official download page.
$head = Invoke-WebRequest -Uri $launcher -Method Head -UserAgent $ua -Headers @{ Referer=$pcPage } -UseBasicParsing -MaximumRedirection 10 -TimeoutSec 30
$contentLength = [int64]$head.Headers['Content-Length']
$headMeta = [ordered]@{
  status=[int]$head.StatusCode
  contentLength=$contentLength
  contentType=[string]$head.Headers['Content-Type']
  lastModified=[string]$head.Headers['Last-Modified']
  etag=[string]$head.Headers['ETag']
  acceptRanges=[string]$head.Headers['Accept-Ranges']
  cosMd5=[string]$head.Headers['x-cos-meta-md5']
  cosCrc64=[string]$head.Headers['x-cos-hash-crc64ecma']
  finalUrl=[string]$head.BaseResponse.RequestMessage.RequestUri
}
$headMeta | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $reportDir 'current-object-metadata.json') -Encoding UTF8

$firstEnd = [Math]::Min($contentLength-1, 32MB-1)
$first = Invoke-RangeFetch 'first-32m' 0 $firstEnd
if ($first.status -notin 200,206 -or -not (Test-Path -LiteralPath $first.path)) { throw "First range fetch failed: $($first | ConvertTo-Json -Compress)" }
$firstBytes = [IO.File]::ReadAllBytes($first.path)
if ($firstBytes.Length -lt 4096 -or $firstBytes[0] -ne 0x4D -or $firstBytes[1] -ne 0x5A) { throw 'First range is not an MZ PE prefix.' }

$peOffset = [BitConverter]::ToInt32($firstBytes,0x3C)
$sectionCount = [BitConverter]::ToUInt16($firstBytes,$peOffset+6)
$optionalSize = [BitConverter]::ToUInt16($firstBytes,$peOffset+20)
$sectionTable = $peOffset + 24 + $optionalSize
$sections = [System.Collections.Generic.List[object]]::new()
$overlayStart = 0L
for ($i=0; $i -lt $sectionCount; $i++) {
  $o=$sectionTable + 40*$i
  if ($o+40 -gt $firstBytes.Length) { break }
  $name=[Text.Encoding]::ASCII.GetString($firstBytes,$o,8).Trim([char]0)
  $virtualSize=[BitConverter]::ToUInt32($firstBytes,$o+8)
  $virtualAddress=[BitConverter]::ToUInt32($firstBytes,$o+12)
  $rawSize=[BitConverter]::ToUInt32($firstBytes,$o+16)
  $rawPtr=[BitConverter]::ToUInt32($firstBytes,$o+20)
  $end=[int64]$rawPtr + [int64]$rawSize
  if ($end -gt $overlayStart) { $overlayStart=$end }
  $sections.Add([pscustomobject]@{ name=$name; virtualSize=$virtualSize; virtualAddress=$virtualAddress; rawSize=$rawSize; rawPointer=$rawPtr; rawEnd=$end })
}
$sections | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $reportDir 'pe-sections.json') -Encoding UTF8

$regions = [System.Collections.Generic.List[object]]::new()
$regions.Add($first)
if ($overlayStart -gt 0 -and $overlayStart -lt $contentLength) {
  $overlayEnd=[Math]::Min($contentLength-1,$overlayStart+32MB-1)
  if ($overlayStart -gt $firstEnd) { $regions.Add((Invoke-RangeFetch 'overlay-first-32m' $overlayStart $overlayEnd)) }
}
$tailStart=[Math]::Max(0,$contentLength-16MB)
if ($tailStart -gt $firstEnd -and ($overlayStart -le 0 -or $tailStart -gt ($overlayStart+32MB-1))) {
  $regions.Add((Invoke-RangeFetch 'tail-16m' $tailStart ($contentLength-1)))
}

$allStrings=[System.Collections.Generic.List[string]]::new()
$allUrls=[System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$allDomains=[System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$allPackaging=[System.Collections.Generic.List[string]]::new()
$regionSummaries=[System.Collections.Generic.List[object]]::new()
foreach ($region in $regions) {
  if ($region.status -notin 200,206 -or -not (Test-Path -LiteralPath $region.path)) { continue }
  $ev=Get-RegionEvidence $region.path $region.name
  foreach ($s in $ev.strings) { $allStrings.Add("[$($region.name)] $s") }
  foreach ($u in $ev.urls) { [void]$allUrls.Add($u) }
  foreach ($d in $ev.domains) { [void]$allDomains.Add($d) }
  foreach ($p in $ev.packaging) { $allPackaging.Add("[$($region.name)] $p") }
  $regionSummaries.Add([pscustomobject]@{
    name=$region.name; start=$region.start; end=$region.end; status=$region.status; downloadedBytes=$region.downloadedBytes
    interestingStringCount=$ev.strings.Count; urlCount=$ev.urls.Count; domainCount=$ev.domains.Count; packagingStringCount=$ev.packaging.Count
  })
}

$uniqueStrings=@($allStrings | Sort-Object -Unique)
$uniqueUrls=@($allUrls | Sort-Object)
$uniqueDomains=@($allDomains | Sort-Object)
$uniquePackaging=@($allPackaging | Sort-Object -Unique)
$uniqueStrings | Select-Object -First 8000 | Set-Content -LiteralPath (Join-Path $reportDir 'range-interesting-strings.txt') -Encoding UTF8
$uniqueUrls | Set-Content -LiteralPath (Join-Path $reportDir 'range-embedded-urls.txt') -Encoding UTF8
$uniqueDomains | Set-Content -LiteralPath (Join-Path $reportDir 'range-embedded-domains.txt') -Encoding UTF8
$uniquePackaging | Select-Object -First 2000 | Set-Content -LiteralPath (Join-Path $reportDir 'range-packaging-strings.txt') -Encoding UTF8
$regionSummaries | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $reportDir 'range-regions.json') -Encoding UTF8

$summary=[ordered]@{
  status='CURRENT_LAUNCHER_RANGE_ENDPOINT_SCAN_COMPLETE'
  exactLauncherUrl=$launcher
  contentLength=$contentLength
  objectMd5=$headMeta.cosMd5
  lastModified=$headMeta.lastModified
  acceptRanges=$headMeta.acceptRanges
  peSectionCount=$sectionCount
  peOverlayStart=$overlayStart
  peOverlayBytes=if ($overlayStart -gt 0) { $contentLength-$overlayStart } else { $null }
  regionsScanned=$regionSummaries.Count
  bytesScanned=@($regionSummaries | Measure-Object downloadedBytes -Sum).Sum
  interestingStringCount=$uniqueStrings.Count
  embeddedUrlCount=$uniqueUrls.Count
  embeddedDomainCount=$uniqueDomains.Count
  packagingStringCount=$uniquePackaging.Count
  executionPolicy='RANGE_STATIC_ONLY_EXECUTABLE_NOT_RUN'
}
$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $reportDir 'range-scan-summary.json') -Encoding UTF8

Write-Host '=== RANGE SCAN SUMMARY ==='
$summary | ConvertTo-Json -Depth 5 | Write-Host
Write-Host '=== PE SECTIONS ==='
$sections | Format-Table -AutoSize | Out-String | Write-Host
Write-Host '=== DOMAINS ==='
$uniqueDomains | ForEach-Object { Write-Host $_ }
Write-Host '=== URLS ==='
$uniqueUrls | Select-Object -First 200 | ForEach-Object { Write-Host $_ }
Write-Host '=== PACKAGING ==='
$uniquePackaging | Select-Object -First 100 | ForEach-Object { Write-Host $_ }
Write-Host '=== INTERESTING SAMPLE ==='
$uniqueStrings | Select-Object -First 300 | ForEach-Object { Write-Host $_ }

foreach ($region in $regions) { Remove-Item -LiteralPath $region.path -Force -ErrorAction SilentlyContinue }
