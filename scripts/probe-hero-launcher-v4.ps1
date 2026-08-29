$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v4'
$reportDir = Join-Path $root 'report'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$pcPage = 'https://mz.zlongame.com/jx/mzdownload/20180731/5473.html'
$launcher = 'https://mhmnzdownload.zlongame.com/MHMNZ/ClientDown/exe/20240227/DownLoad-MZ-PC.exe'
$expectedMd5 = '31A6DB4F224374185E2C498287D3D3F3'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
$cookieJar = Join-Path $root 'cookies.txt'

function Test-MzPe([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  $fs = [IO.File]::OpenRead($Path)
  try {
    if ($fs.Length -lt 2) { return $false }
    return ($fs.ReadByte() -eq 0x4D -and $fs.ReadByte() -eq 0x5A)
  }
  finally { $fs.Dispose() }
}

function Get-FirstBytesHex([string]$Path, [int]$Count = 16) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $fs = [IO.File]::OpenRead($Path)
  try {
    $n = [Math]::Min($Count, [int]$fs.Length)
    if ($n -le 0) { return '' }
    $buf = New-Object byte[] $n
    [void]$fs.Read($buf, 0, $n)
    return (($buf | ForEach-Object { $_.ToString('X2') }) -join ' ')
  }
  finally { $fs.Dispose() }
}

# Establish ordinary official-page context. This is not an access-control bypass.
$pagePath = Join-Path $reportDir 'official-pc-page.html'
$pageHeaders = Join-Path $reportDir 'official-pc-page.headers.txt'
& curl.exe -L --silent --show-error --http1.1 -A $ua -c $cookieJar -D $pageHeaders -o $pagePath $pcPage
$pageCurlExit = $LASTEXITCODE
$pageHtml = if (Test-Path -LiteralPath $pagePath) { Get-Content -LiteralPath $pagePath -Raw } else { '' }
$pageContainsExactLauncher = $pageHtml.Contains($launcher)

$results = [System.Collections.Generic.List[object]]::new()
$verifiedFile = $null
$verifiedVariant = $null

try {
  $head = Invoke-WebRequest -Uri $launcher -Method Head -UseBasicParsing -MaximumRedirection 10 -TimeoutSec 30
  $results.Add([pscustomobject][ordered]@{
    variant='HEAD_BASELINE'; transport='Invoke-WebRequest'; status=[int]$head.StatusCode
    contentLength=[string]$head.Headers['Content-Length']; contentType=[string]$head.Headers['Content-Type']
    finalUrl=[string]$head.BaseResponse.RequestMessage.RequestUri; bytes=0; mz=$false; md5=$null
    md5MatchesOfficial=$false; firstBytesHex=$null; error=$null
  })
}
catch {
  $results.Add([pscustomobject][ordered]@{
    variant='HEAD_BASELINE'; transport='Invoke-WebRequest'; status=$null; contentLength=$null; contentType=$null
    finalUrl=$null; bytes=0; mz=$false; md5=$null; md5MatchesOfficial=$false; firstBytesHex=$null
    error=$_.Exception.Message
  })
}

$variants = @(
  [pscustomobject]@{ Name='GET_BASELINE'; Args=@('--http1.1') }
  [pscustomobject]@{ Name='GET_BROWSER_REFERER'; Args=@('--http1.1','-A',$ua,'-e',$pcPage,'-H','Accept: */*','-H','Accept-Language: zh-CN,zh;q=0.9,en;q=0.8','-H','Accept-Encoding: identity') }
  [pscustomobject]@{ Name='GET_BROWSER_COOKIE_REFERER'; Args=@('--http1.1','-A',$ua,'-b',$cookieJar,'-e',$pcPage,'-H','Accept: */*','-H','Accept-Language: zh-CN,zh;q=0.9,en;q=0.8','-H','Accept-Encoding: identity') }
  [pscustomobject]@{ Name='GET_BROWSER_NAVIGATION'; Args=@('--http1.1','-A',$ua,'-b',$cookieJar,'-e',$pcPage,'-H','Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8','-H','Accept-Language: zh-CN,zh;q=0.9,en;q=0.8','-H','Accept-Encoding: identity','-H','Sec-Fetch-Site: same-site','-H','Sec-Fetch-Mode: navigate','-H','Sec-Fetch-Dest: document','-H','Upgrade-Insecure-Requests: 1') }
)

foreach ($variant in $variants) {
  $body = Join-Path $root ($variant.Name + '.bin')
  $headers = Join-Path $reportDir ($variant.Name + '.headers.txt')
  Remove-Item -LiteralPath $body -Force -ErrorAction SilentlyContinue

  $curlArgs = @('-L','--silent','--show-error','--max-time','90','--max-filesize','104857600','-D',$headers,'-o',$body,'-w','%{http_code}|%{url_effective}|%{content_type}|%{size_download}') + $variant.Args + @($launcher)
  $curlOutput = @(& curl.exe @curlArgs 2>&1)
  $exitCode = $LASTEXITCODE
  $metaLine = if ($curlOutput.Count -gt 0) { [string]$curlOutput[-1] } else { '' }
  $status = $null
  $finalUrl = $null
  $contentType = $null
  if ($metaLine -match '^(\d{3})\|([^|]*)\|([^|]*)\|') {
    $status = [int]$matches[1]
    $finalUrl = $matches[2]
    $contentType = $matches[3]
  }

  $size = if (Test-Path -LiteralPath $body) { (Get-Item -LiteralPath $body).Length } else { 0 }
  $mz = Test-MzPe $body
  $md5 = if ($size -gt 0) { (Get-FileHash -LiteralPath $body -Algorithm MD5).Hash } else { $null }
  $match = ($mz -and $md5 -eq $expectedMd5)
  $results.Add([pscustomobject][ordered]@{
    variant=$variant.Name; transport='curl'; curlExit=$exitCode; status=$status; contentLength=$size
    contentType=$contentType; finalUrl=$finalUrl; bytes=$size; mz=$mz; md5=$md5
    md5MatchesOfficial=$match; firstBytesHex=(Get-FirstBytesHex $body)
    error=if ($exitCode -ne 0) { ($curlOutput -join "`n") } else { $null }
  })

  if ($match) {
    $verifiedFile = $body
    $verifiedVariant = $variant.Name
    break
  }
  Remove-Item -LiteralPath $body -Force -ErrorAction SilentlyContinue
}

if (-not $verifiedFile) {
  $session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
  try {
    Invoke-WebRequest -Uri $pcPage -WebSession $session -UserAgent $ua -UseBasicParsing -TimeoutSec 30 | Out-Null
    $body = Join-Path $root 'GET_POWERSHELL_SESSION.bin'
    $headers = @{ Referer=$pcPage; Accept='*/*'; 'Accept-Language'='zh-CN,zh;q=0.9,en;q=0.8'; 'Accept-Encoding'='identity' }
    $resp = Invoke-WebRequest -Uri $launcher -WebSession $session -UserAgent $ua -Headers $headers -UseBasicParsing -MaximumRedirection 10 -TimeoutSec 90 -OutFile $body -PassThru
    $size = if (Test-Path -LiteralPath $body) { (Get-Item -LiteralPath $body).Length } else { 0 }
    $mz = Test-MzPe $body
    $md5 = if ($size -gt 0) { (Get-FileHash -LiteralPath $body -Algorithm MD5).Hash } else { $null }
    $match = ($mz -and $md5 -eq $expectedMd5)
    $results.Add([pscustomobject][ordered]@{
      variant='GET_POWERSHELL_SESSION'; transport='Invoke-WebRequest'; status=[int]$resp.StatusCode
      contentLength=$size; contentType=[string]$resp.Headers['Content-Type']; finalUrl=[string]$resp.BaseResponse.RequestMessage.RequestUri
      bytes=$size; mz=$mz; md5=$md5; md5MatchesOfficial=$match; firstBytesHex=(Get-FirstBytesHex $body); error=$null
    })
    if ($match) { $verifiedFile=$body; $verifiedVariant='GET_POWERSHELL_SESSION' }
    else { Remove-Item -LiteralPath $body -Force -ErrorAction SilentlyContinue }
  }
  catch {
    $results.Add([pscustomobject][ordered]@{
      variant='GET_POWERSHELL_SESSION'; transport='Invoke-WebRequest'; status=$null; contentLength=0; contentType=$null
      finalUrl=$null; bytes=0; mz=$false; md5=$null; md5MatchesOfficial=$false; firstBytesHex=$null; error=$_.Exception.Message
    })
  }
}

$results | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $reportDir 'request-variant-results.json') -Encoding UTF8

if (-not $verifiedFile) {
  $summary = [ordered]@{
    status='EXACT_LAUNCHER_GET_BLOCKED_OR_UNVERIFIED'
    officialPcPage=$pcPage
    exactLauncherUrl=$launcher
    expectedMd5=$expectedMd5
    pageCurlExit=$pageCurlExit
    pageContainsExactLauncher=$pageContainsExactLauncher
    variants=$results
    executionPolicy='STATIC_ONLY_EXECUTABLE_NOT_RUN'
  }
  $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $reportDir 'launcher-probe-summary.json') -Encoding UTF8
  Write-Host '=== EXACT LAUNCHER REQUEST RESULTS ==='
  $results | Format-Table -AutoSize | Out-String | Write-Host
  Write-Host 'EXACT_LAUNCHER_GET_BLOCKED_OR_UNVERIFIED'
  exit 0
}

$item = Get-Item -LiteralPath $verifiedFile
$sha256 = (Get-FileHash -LiteralPath $verifiedFile -Algorithm SHA256).Hash
$sig = Get-AuthenticodeSignature -FilePath $verifiedFile
$vi = $item.VersionInfo
$bytes = [IO.File]::ReadAllBytes($verifiedFile)
$peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
$machine = [BitConverter]::ToUInt16($bytes, $peOffset + 4)
$machineLabel = switch ($machine) { 0x014c {'x86'} 0x8664 {'x64'} 0xAA64 {'ARM64'} default { ('0x{0:X4}' -f $machine) } }

$asciiText = [Text.Encoding]::Latin1.GetString($bytes)
$unicodeText = [Text.Encoding]::Unicode.GetString($bytes)
$asciiStrings = [regex]::Matches($asciiText, '[\x20-\x7E]{4,}') | ForEach-Object { $_.Value }
$unicodeStrings = [regex]::Matches($unicodeText, '[\x20-\x7E]{4,}') | ForEach-Object { $_.Value }
$strings = @($asciiStrings) + @($unicodeStrings)
$interestPattern = '(?i)(https?://|zlongame|mhmnz|patch|update|manifest|version|cdn|assetbundle|streamingassets|\.ini\b|\.json\b|\.xml\b|\.zip\b|\.exe\b|\.b\b)'
$interesting = @($strings | Where-Object { $_ -match $interestPattern } | Sort-Object -Unique)
$interesting | Select-Object -First 5000 | Set-Content -LiteralPath (Join-Path $reportDir 'interesting-strings.txt') -Encoding UTF8

$urls = [System.Collections.Generic.List[string]]::new()
$domains = [System.Collections.Generic.List[string]]::new()
foreach ($s in $interesting) {
  foreach ($m in [regex]::Matches($s, '(?i)https?://[^\s"<>]+')) { $urls.Add($m.Value.TrimEnd('.',',',';',')',']','}')) }
  foreach ($m in [regex]::Matches($s, '(?i)(?:[a-z0-9-]+\.)+(?:zlongame\.com|qyzlgame\.com)')) { $domains.Add($m.Value.ToLowerInvariant()) }
}
$uniqueUrls = @($urls | Sort-Object -Unique)
$uniqueDomains = @($domains | Sort-Object -Unique)
$uniqueUrls | Set-Content -LiteralPath (Join-Path $reportDir 'embedded-urls.txt') -Encoding UTF8
$uniqueDomains | Set-Content -LiteralPath (Join-Path $reportDir 'embedded-domains.txt') -Encoding UTF8

$summary = [ordered]@{
  status='EXACT_LAUNCHER_VERIFIED_STATIC_PROBE_COMPLETE'
  officialPcPage=$pcPage
  exactLauncherUrl=$launcher
  verifiedRequestVariant=$verifiedVariant
  sizeBytes=$item.Length
  md5=$expectedMd5
  md5MatchesOfficialPage=$true
  sha256=$sha256
  peMachine=$machineLabel
  signatureStatus=[string]$sig.Status
  signerSubject=if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { $null }
  signerIssuer=if ($sig.SignerCertificate) { $sig.SignerCertificate.Issuer } else { $null }
  productName=$vi.ProductName
  productVersion=$vi.ProductVersion
  fileVersion=$vi.FileVersion
  companyName=$vi.CompanyName
  embeddedUrlCount=$uniqueUrls.Count
  embeddedDomainCount=$uniqueDomains.Count
  interestingStringCount=$interesting.Count
  variants=$results
  executionPolicy='STATIC_ONLY_EXECUTABLE_NOT_RUN'
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $reportDir 'launcher-probe-summary.json') -Encoding UTF8

Write-Host '=== VERIFIED LAUNCHER SUMMARY ==='
$summary | ConvertTo-Json -Depth 5 | Write-Host
Write-Host '=== EMBEDDED DOMAINS ==='
$uniqueDomains | Select-Object -First 100 | ForEach-Object { Write-Host $_ }
Write-Host '=== EMBEDDED URLS ==='
$uniqueUrls | Select-Object -First 200 | ForEach-Object { Write-Host $_ }
Write-Host '=== INTERESTING STRINGS ==='
$interesting | Select-Object -First 400 | ForEach-Object { Write-Host $_ }

# Never persist the executable itself as an artifact.
Remove-Item -LiteralPath $verifiedFile -Force -ErrorAction SilentlyContinue
