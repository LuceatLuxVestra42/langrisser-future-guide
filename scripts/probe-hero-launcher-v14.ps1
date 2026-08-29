$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v14'
$report=Join-Path $root 'report'
$extract=Join-Path $root 'extract'
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $report,$extract|Out-Null
$ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
$base='http://mhmnzupdate.zlongame.com/MHMNZ/AutoPatch/AutoPatch_1.1.112_1.1.113'
$name='Patch_1.1.112_1.1.113_30.zip'
$url="$base/$name"
$pkg=Join-Path $root $name
$expectedBytes=8915235L
$expectedMd5='B26A2ADDEA998AE3D2703E56D7C154C2'

& curl.exe -L --fail --silent --show-error --http1.1 -A $ua -H 'Accept-Encoding: identity' --max-filesize 10000000 -o $pkg $url
if($LASTEXITCODE -ne 0){throw 'Package29 download failed'}
$actualBytes=(Get-Item $pkg).Length
$actualMd5=(Get-FileHash $pkg -Algorithm MD5).Hash.ToUpperInvariant()
if($actualBytes -ne $expectedBytes){throw "Package29 size mismatch: $actualBytes"}
if($actualMd5 -ne $expectedMd5){throw "Package29 MD5 mismatch: $actualMd5"}

$seven=(Get-Command 7z.exe -ErrorAction SilentlyContinue).Source
if(-not $seven){$seven=(Get-Command 7z -ErrorAction SilentlyContinue).Source}
if(-not $seven){throw '7-Zip not available'}
& $seven l -slt $pkg | Set-Content (Join-Path $report 'package29-listing.txt') -Encoding UTF8
if($LASTEXITCODE -ne 0){throw '7-Zip listing failed'}

# Extract only the one bundle identified from the decrypted patchinfo. Never expand the whole package.
& $seven x $pkg '-oui_extract_placeholder' -y | Out-Null
# The first extraction call above deliberately goes to a disposable literal directory only if wildcard handling varies.
Remove-Item 'ui_extract_placeholder' -Recurse -Force -ErrorAction SilentlyContinue
& $seven x $pkg ("-o$extract") '*ui_heropainting3_ssr_abs.b*' -r -y | Set-Content (Join-Path $report 'target-extract-log.txt') -Encoding UTF8
if($LASTEXITCODE -ne 0){throw 'HeroPainting target extraction failed'}

$targets=Get-ChildItem $extract -Recurse -File | Where-Object {$_.Name -like '*ui_heropainting3_ssr_abs.b*'}
$rows=@()
foreach($f in $targets){
  $bytes=[System.IO.File]::ReadAllBytes($f.FullName)
  $headLen=[Math]::Min(64,$bytes.Length)
  $head=($bytes[0..($headLen-1)] | ForEach-Object {$_.ToString('X2')}) -join ''
  $ascii=-join ($bytes[0..($headLen-1)] | ForEach-Object {if($_ -ge 32 -and $_ -lt 127){[char]$_}else{'.'}})
  $rows += [pscustomobject]@{
    relativePath=$f.FullName.Substring($extract.Length).TrimStart('\')
    bytes=$f.Length
    md5=(Get-FileHash $f.FullName -Algorithm MD5).Hash.ToUpperInvariant()
    sha256=(Get-FileHash $f.FullName -Algorithm SHA256).Hash.ToUpperInvariant()
    first64Hex=$head
    first64Ascii=$ascii
  }
  if($f.Length -le 8000000){Copy-Item $f.FullName (Join-Path $report $f.Name) -Force}
}
$summary=[pscustomobject]@{
  status='MINIMAL_HEROPAINTING_PATCH_PACKAGE_INSPECTED'
  source=$url
  packageBytes=$actualBytes
  packageMd5=$actualMd5
  patchinfoPackageIndex=29
  patchinfoZipName=$name
  targetManifestPath='Client\Langrisser_Data\StreamingAssets\ExportAssetBundle\ui_heropainting3_ssr_abs.b'
  targetExpectedFinalBytes=5134422
  targetOldMd5='74E60EFC2536FC98EC1CD38CF099A043'
  targetNewMd5='4B54C77617B0B29B50B8104F920F4375'
  extractedTargets=$rows
}
$summary|ConvertTo-Json -Depth 8|Set-Content (Join-Path $report 'package29-summary.json') -Encoding UTF8
$summary|ConvertTo-Json -Depth 8|Write-Host
Remove-Item $pkg -Force -ErrorAction SilentlyContinue
