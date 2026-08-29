$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v6'
$reportDir = Join-Path $root 'report'
$extractDir = Join-Path $root 'selected'
New-Item -ItemType Directory -Force -Path $reportDir, $extractDir | Out-Null

$pcPage = 'https://mz.zlongame.com/jx/mzdownload/20180731/5473.html'
$launcher = 'https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe'
$pageDeclaredMd5 = '31A6DB4F224374185E2C498287D3D3F3'
$pageDeclaredSize = '22.4 MB'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
$installer = Join-Path $root 'DownLoad-MZ-PC.exe'

function Test-MzPe([string]$Path) {
  $fs = [IO.File]::OpenRead($Path)
  try { return ($fs.Length -ge 2 -and $fs.ReadByte() -eq 0x4D -and $fs.ReadByte() -eq 0x5A) }
  finally { $fs.Dispose() }
}

function Get-InterestingStringsFromFile([string]$Path, [int64]$MaxBytes = 33554432) {
  $fi = Get-Item -LiteralPath $Path
  $take = [Math]::Min($fi.Length, $MaxBytes)
  $fs = [IO.File]::OpenRead($Path)
  try {
    $buf = New-Object byte[] ([int]$take)
    $read = $fs.Read($buf, 0, $buf.Length)
    if ($read -lt $buf.Length) { $buf = $buf[0..($read-1)] }
  }
  finally { $fs.Dispose() }

  $ascii = [Text.Encoding]::Latin1.GetString($buf)
  $unicode = [Text.Encoding]::Unicode.GetString($buf)
  $pattern = '(?i)(https?://|zlongame|mhmnz|qyzlgame|patch|update|manifest|version|cdn|assetbundle|streamingassets|download|resource|reslist|filelist|catalog|\.json\b|\.xml\b|\.ini\b|\.cfg\b|\.config\b)'
  $values = [System.Collections.Generic.List[string]]::new()
  foreach ($text in @($ascii, $unicode)) {
    foreach ($m in [regex]::Matches($text, '[\x20-\x7E]{4,}')) {
      if ($m.Value -match $pattern) { $values.Add($m.Value) }
    }
  }
  return @($values | Sort-Object -Unique)
}

# Normal public-page session only. The executable is never run.
$pageResp = Invoke-WebRequest -Uri $pcPage -SessionVariable session -UserAgent $ua -UseBasicParsing -TimeoutSec 30
$pageHtml = [string]$pageResp.Content
$sourceLinkPresent = ($pageHtml -match '(?i)//mhmnzdownload\.zlongame\.com/MHMNZ/Clientdown/DownLoad-MZ-PC\.exe')

$headers = @{ Referer=$pcPage; Accept='*/*'; 'Accept-Language'='zh-CN,zh;q=0.9,en;q=0.8'; 'Accept-Encoding'='identity' }
$downloadResp = Invoke-WebRequest -Uri $launcher -WebSession $session -UserAgent $ua -Headers $headers -UseBasicParsing -MaximumRedirection 10 -TimeoutSec 180 -OutFile $installer -PassThru

$item = Get-Item -LiteralPath $installer
$mz = Test-MzPe $installer
$md5 = (Get-FileHash -LiteralPath $installer -Algorithm MD5).Hash
$sha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
$sig = Get-AuthenticodeSignature -FilePath $installer
$vi = $item.VersionInfo
$bytesHead = New-Object byte[] 4096
$fs = [IO.File]::OpenRead($installer)
try { [void]$fs.Read($bytesHead,0,$bytesHead.Length) } finally { $fs.Dispose() }
$peOffset = if ($mz) { [BitConverter]::ToInt32($bytesHead,0x3C) } else { 0 }
$machine = if ($mz -and $peOffset + 6 -le $bytesHead.Length) { [BitConverter]::ToUInt16($bytesHead,$peOffset+4) } else { 0 }
$machineLabel = switch ($machine) { 0x014c {'x86'} 0x8664 {'x64'} 0xAA64 {'ARM64'} default { if ($machine) { ('0x{0:X4}' -f $machine) } else { $null } } }

$sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
$archiveSupported = $false
$archiveExit = $null
$entryCount = 0
$candidates = [System.Collections.Generic.List[object]]::new()
$extracted = [System.Collections.Generic.List[object]]::new()
$allInteresting = [System.Collections.Generic.List[string]]::new()

if ($sevenZip) {
  $listPath = Join-Path $root 'archive-listing.slt.txt'
  & $sevenZip.Path l -slt $installer 2>&1 | Out-File -LiteralPath $listPath -Encoding UTF8
  $archiveExit = $LASTEXITCODE
  if ($archiveExit -eq 0) {
    $archiveSupported = $true
    $record = @{}
    foreach ($line in Get-Content -LiteralPath $listPath) {
      if ([string]::IsNullOrWhiteSpace($line)) {
        if ($record.ContainsKey('Path') -and $record.ContainsKey('Size')) {
          $entryCount++
          $path = [string]$record['Path']
          $size = 0L
          [void][int64]::TryParse([string]$record['Size'], [ref]$size)
          $lower = $path.ToLowerInvariant()
          $extInteresting = $lower -match '\.(json|xml|ini|cfg|config|txt|exe|dll|dat|manifest)$'
          $nameInteresting = $lower -match '(launcher|launch|update|updater|patch|manifest|version|config|setting|download|client|resource|catalog|filelist|reslist)'
          $smallData = ($lower -match '\.(json|xml|ini|cfg|config|txt|manifest)$')
          if ($size -gt 0 -and $size -le 33554432 -and $extInteresting -and ($nameInteresting -or $smallData)) {
            $candidates.Add([pscustomobject]@{ path=$path; size=$size })
          }
        }
        $record = @{}
      }
      elseif ($line -match '^([^=]+) = (.*)$') {
        $record[$matches[1].Trim()] = $matches[2]
      }
    }
  }
}

$selected = @($candidates | Sort-Object size,path | Select-Object -First 40)
$selected | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $reportDir 'archive-candidates.json') -Encoding UTF8

foreach ($candidate in $selected) {
  $before = @(Get-ChildItem -LiteralPath $extractDir -File -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
  & $sevenZip.Path x -y "-o$extractDir" $installer $candidate.path | Out-Null
  if ($LASTEXITCODE -ne 0) { continue }
  $after = @(Get-ChildItem -LiteralPath $extractDir -File -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
  $newFiles = @($after | Where-Object { $_ -notin $before })
  foreach ($file in $newFiles) {
    $strings = @(Get-InterestingStringsFromFile $file)
    foreach ($s in $strings) { $allInteresting.Add("[$($candidate.path)] $s") }
    $extracted.Add([pscustomobject]@{ archivePath=$candidate.path; extractedFile=[IO.Path]::GetFileName($file); size=(Get-Item -LiteralPath $file).Length; interestingStringCount=$strings.Count })
    Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
  }
}

# Low-cost fallback: inspect only the outer executable's first 32 MiB if archive extraction yielded no useful strings.
if ($allInteresting.Count -eq 0) {
  $outerStrings = @(Get-InterestingStringsFromFile $installer 33554432)
  foreach ($s in $outerStrings) { $allInteresting.Add("[OUTER_FIRST_32M] $s") }
}

$interestingUnique = @($allInteresting | Sort-Object -Unique)
$interestingUnique | Select-Object -First 5000 | Set-Content -LiteralPath (Join-Path $reportDir 'interesting-strings.txt') -Encoding UTF8
$extracted | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $reportDir 'extracted-candidate-summary.json') -Encoding UTF8

$urls = [System.Collections.Generic.List[string]]::new()
$domains = [System.Collections.Generic.List[string]]::new()
foreach ($s in $interestingUnique) {
  foreach ($m in [regex]::Matches($s, '(?i)https?://[^\s"<>\]]+')) { $urls.Add($m.Value.TrimEnd('.',',',';',')','}')) }
  foreach ($m in [regex]::Matches($s, '(?i)(?:[a-z0-9-]+\.)+(?:zlongame\.com|qyzlgame\.com)')) { $domains.Add($m.Value.ToLowerInvariant()) }
}
$uniqueUrls = @($urls | Sort-Object -Unique)
$uniqueDomains = @($domains | Sort-Object -Unique)
$uniqueUrls | Set-Content -LiteralPath (Join-Path $reportDir 'embedded-urls.txt') -Encoding UTF8
$uniqueDomains | Set-Content -LiteralPath (Join-Path $reportDir 'embedded-domains.txt') -Encoding UTF8

$summary = [ordered]@{
  status='CURRENT_OFFICIAL_PAGE_LINK_STATIC_TRIAGE_COMPLETE'
  officialPcPage=$pcPage
  exactLauncherUrl=$launcher
  sourceLinkPresent=$sourceLinkPresent
  pageDeclaredSize=$pageDeclaredSize
  pageDeclaredMd5=$pageDeclaredMd5
  responseStatus=[int]$downloadResp.StatusCode
  responseContentType=[string]$downloadResp.Headers['Content-Type']
  sizeBytes=$item.Length
  mz=$mz
  md5=$md5
  md5MatchesPage=$($md5 -eq $pageDeclaredMd5)
  sha256=$sha256
  peMachine=$machineLabel
  signatureStatus=[string]$sig.Status
  signerSubject=if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
  signerIssuer=if ($sig.SignerCertificate) { $sig.SignerCertificate.Issuer } else { $null }
  productName=$vi.ProductName
  productVersion=$vi.ProductVersion
  fileVersion=$vi.FileVersion
  companyName=$vi.CompanyName
  archiveTool=if ($sevenZip) { $sevenZip.Source } else { $null }
  archiveListExit=$archiveExit
  archiveSupported=$archiveSupported
  archiveEntryCount=$entryCount
  selectedCandidateCount=$selected.Count
  extractedCandidateCount=$extracted.Count
  interestingStringCount=$interestingUnique.Count
  embeddedUrlCount=$uniqueUrls.Count
  embeddedDomainCount=$uniqueDomains.Count
  executionPolicy='STATIC_ONLY_EXECUTABLE_NOT_RUN'
}
$summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $reportDir 'launcher-v6-summary.json') -Encoding UTF8

Write-Host '=== CURRENT OFFICIAL LAUNCHER TRIAGE ==='
$summary | ConvertTo-Json -Depth 5 | Write-Host
Write-Host '=== SELECTED ARCHIVE CANDIDATES ==='
$selected | Format-Table -AutoSize | Out-String | Write-Host
Write-Host '=== EMBEDDED DOMAINS ==='
$uniqueDomains | ForEach-Object { Write-Host $_ }
Write-Host '=== EMBEDDED URLS ==='
$uniqueUrls | Select-Object -First 200 | ForEach-Object { Write-Host $_ }
Write-Host '=== INTERESTING STRINGS SAMPLE ==='
$interestingUnique | Select-Object -First 300 | ForEach-Object { Write-Host $_ }

Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
