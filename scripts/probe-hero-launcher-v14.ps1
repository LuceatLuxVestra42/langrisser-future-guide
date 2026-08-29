$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v14'
$report=Join-Path $root 'report'
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $report|Out-Null
$ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
$primary='http://mhmnzupdate.zlongame.com/MHMNZ'
$backup='http://mhmnzupdatebak.zlongame.com/MHMNZ'

function Fetch-Small([string]$Url,[string]$Stem){
  $body=Join-Path $report ($Stem+'.body')
  $headers=Join-Path $report ($Stem+'.headers.txt')
  $code=& curl.exe -L --silent --show-error --http1.1 -A $ua -H 'Accept-Encoding: identity' --max-filesize 1048576 -D $headers -o $body -w '%{http_code}' $Url
  $exit=$LASTEXITCODE
  $len=if(Test-Path $body){(Get-Item $body).Length}else{0}
  if($len -gt 0 -and $len -le 1048576){
    try { Get-Content $body -Raw -ErrorAction Stop | Set-Content (Join-Path $report ($Stem+'.txt')) -Encoding UTF8 } catch {}
  }
  return [pscustomobject]@{url=$Url;curlExit=$exit;httpCode="$code";bytes=$len;body=$body}
}

# Checkpointed from static code: remote metadata path is AutoPatch/AutoPatch.ini.
$auto=Fetch-Small ($primary+'/AutoPatch/AutoPatch.ini') 'autopatch-primary'
if($auto.httpCode -ne '200'){ throw 'Primary AutoPatch.ini unavailable' }
$ini=Get-Content $auto.body -Raw
$patchNum=[int]([regex]::Match($ini,'(?m)^PatchNum=(\d+)\s*$').Groups[1].Value)
$versionNow=[regex]::Match($ini,'(?m)^VersionNow=([^\r\n]+)').Groups[1].Value.Trim()
$idx=$patchNum-1
$section=[regex]::Match($ini,"(?ms)^\[Patch_$idx\]\s*\r?\nVersionFrom=([^\r\n]+)\s*\r?\nVersionTo=([^\r\n]+)")
if(-not $section.Success){ throw "Latest Patch_$idx section not found" }
$from=$section.Groups[1].Value.Trim(); $to=$section.Groups[2].Value.Trim()

# Checkpointed from PGPatchChain::BuildFromAutoPatchIni + DownloadPatchInfo:
# AutoPatch/AutoPatch_{VersionFrom}_{VersionTo}/patchinfo_{VersionFrom}_{VersionTo}.ini
$rel="AutoPatch/AutoPatch_${from}_${to}/patchinfo_${from}_${to}.ini"
$results=@()
$results += Fetch-Small ($primary+'/'+$rel) 'patchinfo-primary'
$results += Fetch-Small ($backup+'/'+$rel) 'patchinfo-backup'
$summary=[pscustomobject]@{
  status='LATEST_PATCHINFO_CODE_DERIVED_PROBE'
  patchNum=$patchNum
  versionNow=$versionNow
  latestPatchIndex=$idx
  versionFrom=$from
  versionTo=$to
  relativePath=$rel
  results=$results | ForEach-Object { [pscustomobject]@{url=$_.url;curlExit=$_.curlExit;httpCode=$_.httpCode;bytes=$_.bytes} }
}
$summary|ConvertTo-Json -Depth 6|Set-Content (Join-Path $report 'patchinfo-proof.json') -Encoding UTF8
$summary|ConvertTo-Json -Depth 6|Write-Host
