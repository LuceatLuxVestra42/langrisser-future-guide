$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v2'
$reportDir = Join-Path $root 'report'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$pcPage = 'https://mz.zlongame.com/jx/mzdownload/20180731/5473.html'
$htmlPath = Join-Path $reportDir 'official-pc-page.html'
try {
  $page = Invoke-WebRequest -Uri $pcPage -UseBasicParsing -MaximumRedirection 10 -TimeoutSec 30
  $page.Content | Set-Content -LiteralPath $htmlPath -Encoding UTF8
  Write-Host "PC_PAGE_STATUS=$($page.StatusCode)"
} catch {
  Write-Host "PC_PAGE_FETCH_FAILED=$($_.Exception.Message)"
  '' | Set-Content -LiteralPath $htmlPath -Encoding UTF8
}

$html = Get-Content -LiteralPath $htmlPath -Raw
$candidateList = [System.Collections.Generic.List[string]]::new()
if ($html) {
  $patterns = @(
    '(?i)(?:https?:)?//[^\"''<>\s]+?\.(?:exe|zip)(?:\?[^\"''<>\s]*)?',
    '(?i)mhmnzdownload\.zlongame\.com/[^\"''<>\s]+?\.(?:exe|zip)(?:\?[^\"''<>\s]*)?'
  )
  foreach ($pattern in $patterns) {
    foreach ($m in [regex]::Matches($html, $pattern)) {
      $u = $m.Value
      if ($u.StartsWith('//')) { $u = 'https:' + $u }
      elseif ($u -notmatch '^https?://') { $u = 'https://' + $u }
      $candidateList.Add($u)
    }
  }
}

# Bounded explicit candidates. The historical full-client path is probed last.
@(
  'https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe',
  'https://mhmnzdownload.zlongame.com/MHMNZ/DownLoad-MZ-PC.exe',
  'https://mhmnzdownload.zlongame.com/DownLoad-MZ-PC.exe',
  'https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/Langrisser_DownLoad_PC.exe'
) | ForEach-Object { $candidateList.Add($_) }

$candidates = @($candidateList | Select-Object -Unique)
$candidates | Set-Content -LiteralPath (Join-Path $reportDir 'download-candidates.txt') -Encoding UTF8
Write-Host 'DOWNLOAD CANDIDATES:'
$candidates | ForEach-Object { Write-Host "  $_" }

$probeRows = @()
$downloaded = $null
$downloadUrl = $null
$maxBytes = 100MB

foreach ($u in $candidates) {
  $row = [ordered]@{
    url = $u
    headStatus = $null
    contentLength = $null
    contentType = $null
    finalUrl = $null
    download = 'NOT_ATTEMPTED'
    error = $null
  }

  try {
    $head = Invoke-WebRequest -Uri $u -Method Head -UseBasicParsing -MaximumRedirection 10 -TimeoutSec 15
    $row.headStatus = [int]$head.StatusCode
    $row.finalUrl = [string]$head.BaseResponse.RequestMessage.RequestUri
    $len = $head.Headers['Content-Length']
    if ($len) { $row.contentLength = [int64]$len }
    $row.contentType = [string]$head.Headers['Content-Type']
  } catch {
    $row.error = "HEAD: $($_.Exception.Message)"
  }

  if ($row.headStatus -ne 200) {
    $row.download = 'SKIPPED_NON_200'
    $probeRows += [pscustomobject]$row
    continue
  }
  if ($row.contentLength -and $row.contentLength -gt $maxBytes) {
    $row.download = 'SKIPPED_OVER_100MB'
    $probeRows += [pscustomobject]$row
    continue
  }

  $name = [IO.Path]::GetFileName(([Uri]$u).AbsolutePath)
  if (-not $name) { $name = 'launcher.bin' }
  $target = Join-Path $root $name

  try {
    $curlArgs = @('-L','--fail','--silent','--show-error','--max-time','90','--max-filesize',[string]$maxBytes,'-o',$target,$u)
    & curl.exe @curlArgs
    if ($LASTEXITCODE -ne 0) { throw "curl exit $LASTEXITCODE" }
    if (-not (Test-Path -LiteralPath $target)) { throw 'download target missing' }
    $size = (Get-Item -LiteralPath $target).Length
    $row.contentLength = $size
    if ($size -lt 100KB) {
      $row.download = "REJECTED_TOO_SMALL_$size"
      Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
      $probeRows += [pscustomobject]$row
      continue
    }
    $first2 = [IO.File]::ReadAllBytes($target)[0..1]
    if ($first2[0] -ne 0x4D -or $first2[1] -ne 0x5A) {
      $row.download = 'REJECTED_NOT_PE_MZ'
      Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
      $probeRows += [pscustomobject]$row
      continue
    }
    $row.download = 'SUCCESS'
    $downloaded = $target
    $downloadUrl = $u
    $probeRows += [pscustomobject]$row
    break
  } catch {
    $row.download = 'FAILED'
    $row.error = (($row.error + ' | GET: ' + $_.Exception.Message).Trim(' ','|'))
    Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue
    $probeRows += [pscustomobject]$row
  }
}

$probeRows | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $reportDir 'candidate-probe.json') -Encoding UTF8

if (-not $downloaded) {
  [ordered]@{
    status = 'DOWNLOAD_FAILED_OR_BOUNDED_OUT'
    officialPcPage = $pcPage
    candidates = $candidates
    probes = $probeRows
    executionPolicy = 'STATIC_ONLY_EXECUTABLE_NOT_RUN'
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $reportDir 'launcher-probe-summary.json') -Encoding UTF8
  Write-Host 'LAUNCHER_DOWNLOAD_FAILED_OR_BOUNDED_OUT'
  exit 0
}

$item = Get-Item -LiteralPath $downloaded
$md5 = (Get-FileHash -LiteralPath $downloaded -Algorithm MD5).Hash
$sha256 = (Get-FileHash -LiteralPath $downloaded -Algorithm SHA256).Hash
$sig = Get-AuthenticodeSignature -FilePath $downloaded
$vi = $item.VersionInfo
$bytes = [IO.File]::ReadAllBytes($downloaded)

$machineLabel = 'UNKNOWN'
$peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
if ($peOffset -ge 0 -and ($peOffset + 6) -lt $bytes.Length) {
  $machine = [BitConverter]::ToUInt16($bytes, $peOffset + 4)
  switch ($machine) {
    0x014c { $machineLabel = 'x86' }
    0x8664 { $machineLabel = 'x64' }
    0xAA64 { $machineLabel = 'ARM64' }
    default { $machineLabel = ('0x{0:X4}' -f $machine) }
  }
}

function Get-AsciiStrings([byte[]]$Data, [int]$MinLength = 4) {
  $sb = [Text.StringBuilder]::new()
  $out = [System.Collections.Generic.List[string]]::new()
  foreach ($b in $Data) {
    if ($b -ge 32 -and $b -le 126) { [void]$sb.Append([char]$b) }
    else {
      if ($sb.Length -ge $MinLength) { $out.Add($sb.ToString()) }
      [void]$sb.Clear()
    }
  }
  if ($sb.Length -ge $MinLength) { $out.Add($sb.ToString()) }
  return $out
}

function Get-Utf16AsciiStrings([byte[]]$Data, [int]$MinLength = 4) {
  $sb = [Text.StringBuilder]::new()
  $out = [System.Collections.Generic.List[string]]::new()
  for ($i = 0; $i + 1 -lt $Data.Length; $i += 2) {
    $lo = $Data[$i]; $hi = $Data[$i+1]
    if ($hi -eq 0 -and $lo -ge 32 -and $lo -le 126) { [void]$sb.Append([char]$lo) }
    else {
      if ($sb.Length -ge $MinLength) { $out.Add($sb.ToString()) }
      [void]$sb.Clear()
    }
  }
  if ($sb.Length -ge $MinLength) { $out.Add($sb.ToString()) }
  return $out
}

$allStrings = [System.Collections.Generic.List[string]]::new()
(Get-AsciiStrings $bytes) | ForEach-Object { $allStrings.Add($_) }
(Get-Utf16AsciiStrings $bytes) | ForEach-Object { $allStrings.Add($_) }

$interestPattern = '(?i)(https?://|zlongame|mhmnz|patch|update|manifest|version|cdn|assetbundle|streamingassets|exportassetbundle|\.ini\b|\.json\b|\.xml\b|\.zip\b|\.exe\b|\.b\b)'
$interesting = @($allStrings | Where-Object { $_ -match $interestPattern } | Sort-Object -Unique)
$interesting | Select-Object -First 3000 | Set-Content -LiteralPath (Join-Path $reportDir 'interesting-strings.txt') -Encoding UTF8

$urls = [System.Collections.Generic.List[string]]::new()
$domains = [System.Collections.Generic.List[string]]::new()
foreach ($s in $allStrings) {
  foreach ($m in [regex]::Matches($s, '(?i)https?://[A-Za-z0-9._~:/?#\[\]@!$&''()*+,;=%-]+')) {
    $urls.Add($m.Value.TrimEnd('.',',',';',')',']','}'))
  }
  foreach ($m in [regex]::Matches($s, '(?i)(?:[a-z0-9-]+\.)+(?:zlongame\.com|qyzlgame\.com)')) {
    $domains.Add($m.Value.ToLowerInvariant())
  }
}
$uniqueUrls = @($urls | Sort-Object -Unique)
$uniqueDomains = @($domains | Sort-Object -Unique)
$uniqueUrls | Set-Content -LiteralPath (Join-Path $reportDir 'embedded-urls.txt') -Encoding UTF8
$uniqueDomains | Set-Content -LiteralPath (Join-Path $reportDir 'embedded-domains.txt') -Encoding UTF8

$sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
if ($sevenZip) {
  & 7z l $downloaded 2>&1 | Out-File -LiteralPath (Join-Path $reportDir '7z-listing.txt') -Encoding UTF8
} else {
  '7z not found on runner' | Set-Content -LiteralPath (Join-Path $reportDir '7z-listing.txt') -Encoding UTF8
}

$summary = [ordered]@{
  status = 'STATIC_PROBE_COMPLETE'
  officialPcPage = $pcPage
  downloadUrl = $downloadUrl
  fileName = $item.Name
  sizeBytes = $item.Length
  md5 = $md5
  expectedMd5FromOfficialPage = '31A6DB4F224374185E2C498287D3D3F3'
  md5MatchesOfficialPage = ($md5 -eq '31A6DB4F224374185E2C498287D3D3F3')
  sha256 = $sha256
  peMachine = $machineLabel
  signatureStatus = [string]$sig.Status
  signerSubject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
  signerIssuer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Issuer } else { $null }
  productName = $vi.ProductName
  productVersion = $vi.ProductVersion
  fileDescription = $vi.FileDescription
  companyName = $vi.CompanyName
  fileVersion = $vi.FileVersion
  embeddedUrlCount = $uniqueUrls.Count
  embeddedDomainCount = $uniqueDomains.Count
  interestingStringCount = $interesting.Count
  candidateProbes = $probeRows
  executionPolicy = 'STATIC_ONLY_EXECUTABLE_NOT_RUN'
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $reportDir 'launcher-probe-summary.json') -Encoding UTF8

Write-Host '=== LAUNCHER SUMMARY ==='
$summary | ConvertTo-Json -Depth 5 | Write-Host
Write-Host '=== EMBEDDED DOMAINS ==='
$uniqueDomains | Select-Object -First 100 | ForEach-Object { Write-Host $_ }
Write-Host '=== EMBEDDED URLS ==='
$uniqueUrls | Select-Object -First 200 | ForEach-Object { Write-Host $_ }
Write-Host '=== INTERESTING STRINGS ==='
$interesting | Select-Object -First 300 | ForEach-Object { Write-Host $_ }

Remove-Item -LiteralPath $downloaded -Force -ErrorAction SilentlyContinue
