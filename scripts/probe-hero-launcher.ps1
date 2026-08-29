$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v2'
$reportDir = Join-Path $root 'report'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$pcPage = 'https://mz.zlongame.com/jx/mzdownload/20180731/5473.html'
$launcher = 'https://mhmnzdownload.zlongame.com/MHMNZ/ClientDown/exe/20240227/DownLoad-MZ-PC.exe'
$expectedMd5 = '31A6DB4F224374185E2C498287D3D3F3'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
$maxBytes = 100MB
$cookieJar = Join-Path $root 'cookies.txt'

function Get-FirstBytesHex([string]$Path, [int]$Count = 16) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $data = [IO.File]::ReadAllBytes($Path)
  if ($data.Length -eq 0) { return '' }
  $n = [Math]::Min($Count, $data.Length)
  return (($data[0..($n-1)] | ForEach-Object { $_.ToString('X2') }) -join ' ')
}

function Is-MzPe([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  $fs = [IO.File]::OpenRead($Path)
  try {
    if ($fs.Length -lt 2) { return $false }
    return ($fs.ReadByte() -eq 0x4D -and $fs.ReadByte() -eq 0x5A)
  } finally { $fs.Dispose() }
}

# Establish the exact official-page browsing context first.
$pagePath = Join-Path $reportDir 'official-pc-page.html'
$pageHeaders = Join-Path $reportDir 'official-pc-page.headers.txt'
& curl.exe -L --fail --silent --show-error --http1.1 -A $ua -c $cookieJar -D $pageHeaders -o $pagePath $pcPage
$pageCurlExit = $LASTEXITCODE
$pageHtml = if (Test-Path -LiteralPath $pagePath) { Get-Content -LiteralPath $pagePath -Raw } else { '' }
$pageContainsExactLauncher = $pageHtml.Contains($launcher)

$rows = [System.Collections.Generic.List[object]]::new()
$verifiedFile = $null
$verifiedVariant = $null

# HEAD is evidence only; a 200 HEAD does not imply GET is allowed.
try {
  $head = Invoke-WebRequest -Uri $launcher -Method Head -UseBasicParsing -MaximumRedirection 10 -TimeoutSec 20
  $rows.Add([pscustomobject][ordered]@{
    variant = 'HEAD_BASELINE'
    transport = 'Invoke-WebRequest'
    status = [int]$head.StatusCode
    contentLength = [string]$head.Headers['Content-Length']
    contentType = [string]$head.Headers['Content-Type']
    finalUrl = [string]$head.BaseResponse.RequestMessage.RequestUri
    bytes = 0
    mz = $false
    md5 = $null
    md5MatchesOfficial = $false
    firstBytesHex = $null
    error = $null
  })
} catch {
  $rows.Add([pscustomobject][ordered]@{
    variant = 'HEAD_BASELINE'; transport = 'Invoke-WebRequest'; status = $null; contentLength = $null; contentType = $null; finalUrl = $null; bytes = 0; mz = $false; md5 = $null; md5MatchesOfficial = $false; firstBytesHex = $null; error = $_.Exception.Message
  })
}

$variants = @(
  [ordered]@{ name='GET_BASELINE'; args=@('--http1.1') },
  [ordered]@{ name='GET_BROWSER_REFERER'; args=@('--http1.1','-A',$ua,'-e',$pcPage,'-H','Accept: */*','-H','Accept-Language: zh-CN,zh;q=0.9,en;q=0.8','-H','Accept-Encoding: identity') },
  [ordered]@{ name='GET_BROWSER_COOKIE_REFERER'; args=@('--http1.1','-A',$ua,'-b',$cookieJar,'-e',$pcPage,'-H','Accept: */*','-H','Accept-Language: zh-CN,zh;q=0.9,en;q=0.8','-H','Accept-Encoding: identity') },
  [ordered]@{ name='GET_BROWSER_NAVIGATION'; args=@('--http1.1','-A',$ua,'-b',$cookieJar,'-e',$pcPage,'-H','Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8','-H','Accept-Language: zh-CN,zh;q=0.9,en;q=0.8','-H','Accept-Encoding: identity','-H','Sec-Fetch-Site: same-site','-H','Sec-Fetch-Mode: navigate','-H','Sec-Fetch-Dest: document','-H','Upgrade-Insecure-Requests: 1')
)

foreach ($variant in $variants) {
  $body = Join-Path $root ($variant.name + '.bin')
  $headers = Join-Path $reportDir ($variant.name + '.headers.txt')
  Remove-Item -LiteralPath $body -Force -ErrorAction SilentlyContinue

  $curlArgs = @('-L','--silent','--show-error','--max-time','90','--max-filesize',[string]$maxBytes,'-D',$headers,'-o',$body,'-w','%{http_code}|%{url_effective}|%{content_type}|%{size_download}') + $variant.args + @($launcher)
  $curlOut = & curl.exe @curlArgs 2>&1
  $exit = $LASTEXITCODE
  $metaLine = ($curlOut | Select-Object -Last 1)
  $status = $null; $finalUrl = $null; $contentType = $null
  if ($metaLine -match '^(\d{3})\|([^|]*)\|([^|]*)\|') {
    $status = [int]$matches[1]; $finalUrl = $matches[2]; $contentType = $matches[3]
  }
  $size = if (Test-Path -LiteralPath $body) { (Get-Item -LiteralPath $body).Length } else { 0 }
  $mz = Is-MzPe $body
  $md5 = if ($size -gt 0) { (Get-FileHash -LiteralPath $body -Algorithm MD5).Hash } else { $null }
  $match = ($md5 -eq $expectedMd5)
  $rows.Add([pscustomobject][ordered]@{
    variant = $variant.name
    transport = 'curl'
    curlExit = $exit
    status = $status
    contentLength = $size
    contentType = $contentType
    finalUrl = $finalUrl
    bytes = $size
    mz = $mz
    md5 = $md5
    md5MatchesOfficial = $match
    firstBytesHex = Get-FirstBytesHex $body
    error = if ($exit -ne 0) { ($curlOut -join "`n") } else { $null }
  })

  if ($match -and $mz) {
    $verifiedFile = $body
    $verifiedVariant = $variant.name
    break
  }
  Remove-Item -LiteralPath $body -Force -ErrorAction SilentlyContinue
}

# Independent PowerShell session probe if curl variants did not produce the official-MD5 file.
if (-not $verifiedFile) {
  $session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
  try {
    Invoke-WebRequest -Uri $pcPage -WebSession $session -UserAgent $ua -UseBasicParsing -TimeoutSec 30 | Out-Null
    $psBody = Join-Path $root 'GET_POWERSHELL_SESSION.bin'
    $psHeaders = @{ Referer=$pcPage; Accept='*/*'; 'Accept-Language'='zh-CN,zh;q=0.9,en;q=0.8'; 'Accept-Encoding'='identity' }
    $resp = Invoke-WebRequest -Uri $launcher -WebSession $session -UserAgent $ua -Headers $psHeaders -UseBasicParsing -MaximumRedirection 10 -TimeoutSec 90 -OutFile $psBody -PassThru
    $size = if (Test-Path -LiteralPath $psBody) { (Get-Item -LiteralPath $psBody).Length } else { 0 }
    $mz = Is-MzPe $psBody
    $md5 = if ($size -gt 0) { (Get-FileHash -LiteralPath $psBody -Algorithm MD5).Hash } else { $null }
    $match = ($md5 -eq $expectedMd5)
    $rows.Add([pscustomobject][ordered]@{
      variant='GET_POWERSHELL_SESSION'; transport='Invoke-WebRequest'; curlExit=$null; status=[int]$resp.StatusCode; contentLength=$size; contentType=[string]$resp.Headers['Content-Type']; finalUrl=[string]$resp.BaseResponse.RequestMessage.RequestUri; bytes=$size; mz=$mz; md5=$md5; md5MatchesOfficial=$match; firstBytesHex=Get-FirstBytesHex $psBody; error=$null
    })
    if ($match -and $mz) { $verifiedFile = $psBody; $verifiedVariant = 'GET_POWERSHELL_SESSION' }
    else { Remove-Item -LiteralPath $psBody -Force -ErrorAction SilentlyContinue }
  } catch {
    $rows.Add([pscustomobject][ordered]@{
      variant='GET_POWERSHELL_SESSION'; transport='Invoke-WebRequest'; curlExit=$null; status=$null; contentLength=0; contentType=$null; finalUrl=$null; bytes=0; mz=$false; md5=$null; md5MatchesOfficial=$false; firstBytesHex=$null; error=$_.Exception.Message
    })
  }
}

$rows | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $reportDir 'request-variant-results.json') -Encoding UTF8

if (-not $verifiedFile) {
  [ordered]@{
    status = 'EXACT_LAUNCHER_GET_BLOCKED_OR_UNVERIFIED'
    officialPcPage = $pcPage
    exactLauncherUrl = $launcher
    expectedMd5 = $expectedMd5
    pageCurlExit = $pageCurlExit
    pageContainsExactLauncher = $pageContainsExactLauncher
    variants = $rows
    inference = 'HEAD availability is confirmed, but no tested GET request context returned a PE whose MD5 matches the official page.'
    executionPolicy = 'STATIC_ONLY_EXECUTABLE_NOT_RUN'
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $reportDir 'launcher-probe-summary.json') -Encoding UTF8
  Write-Host '=== EXACT LAUNCHER REQUEST RESULTS ==='
  $rows | Format-Table -AutoSize | Out-String | Write-Host
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

function Get-AsciiStrings([byte[]]$Data, [int]$MinLength = 4) {
  $sb = [Text.StringBuilder]::new(); $out = [System.Collections.Generic.List[string]]::new()
  foreach ($b in $Data) {
    if ($b -ge 32 -and $b -le 126) { [void]$sb.Append([char]$b) }
    else { if ($sb.Length -ge $MinLength) { $out.Add($sb.ToString()) }; [void]$sb.Clear() }
  }
  if ($sb.Length -ge $MinLength) { $out.Add($sb.ToString()) }
  return $out
}
function Get-Utf16AsciiStrings([byte[]]$Data, [int]$MinLength = 4) {
  $sb = [Text.StringBuilder]::new(); $out = [System.Collections.Generic.List[string]]::new()
  for ($i=0; $i+1 -lt $Data.Length; $i+=2) {
    $lo=$Data[$i]; $hi=$Data[$i+1]
    if ($hi -eq 0 -and $lo -ge 32 -and $lo -le 126) { [void]$sb.Append([char]$lo) }
    else { if ($sb.Length -ge $MinLength) { $out.Add($sb.ToString()) }; [void]$sb.Clear() }
  }
  if ($sb.Length -ge $MinLength) { $out.Add($sb.ToString()) }
  return $out
}

$strings = [System.Collections.Generic.List[string]]::new()
(Get-AsciiStrings $bytes) | ForEach-Object { $strings.Add($_) }
(Get-Utf16AsciiStrings $bytes) | ForEach-Object { $strings.Add($_) }
$interestPattern = '(?i)(https?://|zlongame|mhmnz|patch|update|manifest|version|cdn|assetbundle|streamingassets|exportassetbundle|\.ini\b|\.json\b|\.xml\b|\.zip\b|\.exe\b|\.b\b)'
$interesting = @($strings | Where-Object { $_ -match $interestPattern } | Sort-Object -Unique)
$interesting | Select-Object -First 4000 | Set-Content -LiteralPath (Join-Path $reportDir 'interesting-strings.txt') -Encoding UTF8

$urls = [System.Collections.Generic.List[string]]::new(); $domains = [System.Collections.Generic.List[string]]::new()
foreach ($s in $strings) {
  foreach ($m in [regex]::Matches($s, '(?i)https?://[A-Za-z0-9._~:/?#\[\]@!$&''()*+,;=%-]+')) { $urls.Add($m.Value.TrimEnd('.',',',';',')',']','}')) }
  foreach ($m in [regex]::Matches($s, '(?i)(?:[a-z0-9-]+\.)+(?:zlongame\.com|qyzlgame\.com)')) { $domains.Add($m.Value.ToLowerInvariant()) }
}
$uniqueUrls = @($urls | Sort-Object -Unique); $uniqueDomains = @($domains | Sort-Object -Unique)
$uniqueUrls | Set-Content -LiteralPath (Join-Path $reportDir 'embedded-urls.txt') -Encoding UTF8
$uniqueDomains | Set-Content -LiteralPath (Join-Path $reportDir 'embedded-domains.txt') -Encoding UTF8

$sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
if ($sevenZip) { & 7z l $verifiedFile 2>&1 | Out-File -LiteralPath (Join-Path $reportDir '7z-listing.txt') -Encoding UTF8 }

$summary = [ordered]@{
  status = 'EXACT_LAUNCHER_VERIFIED_STATIC_PROBE_COMPLETE'
  officialPcPage = $pcPage
  exactLauncherUrl = $launcher
  verifiedRequestVariant = $verifiedVariant
  fileName = $item.Name
  sizeBytes = $item.Length
  md5 = $expectedMd5
  md5MatchesOfficialPage = $true
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
  requestVariants = $rows
  executionPolicy = 'STATIC_ONLY_EXECUTABLE_NOT_RUN'
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $reportDir 'launcher-probe-summary.json') -Encoding UTF8

Write-Host '=== VERIFIED LAUNCHER SUMMARY ==='
$summary | ConvertTo-Json -Depth 5 | Write-Host
Write-Host '=== EMBEDDED DOMAINS ==='; $uniqueDomains | Select-Object -First 100 | ForEach-Object { Write-Host $_ }
Write-Host '=== EMBEDDED URLS ==='; $uniqueUrls | Select-Object -First 200 | ForEach-Object { Write-Host $_ }
Write-Host '=== INTERESTING STRINGS ==='; $interesting | Select-Object -First 400 | ForEach-Object { Write-Host $_ }

# The executable itself is never persisted as an artifact.
Remove-Item -LiteralPath $verifiedFile -Force -ErrorAction SilentlyContinue
