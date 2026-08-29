$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v11'
$reportDir = Join-Path $root 'report'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$bases = @(
  'http://mhmnzupdate.zlongame.com/MHMNZ',
  'http://mhmnzupdatebak.zlongame.com/MHMNZ'
)
$names = @('AutoPatch.ini','GameInfo.ini','gameinfo.ini','download.bin')
$results=[System.Collections.Generic.List[object]]::new()

foreach($base in $bases){
  foreach($name in $names){
    $url="$base/$name"
    $safe=($base -replace '[^A-Za-z0-9]','_')+'__'+$name
    $body=Join-Path $root ($safe+'.bin')
    $header=Join-Path $reportDir ($safe+'.headers.txt')
    $args=@('-L','--silent','--show-error','--http1.1','--max-time','30','--max-filesize','1048576','-D',$header,'-o',$body,'-w','%{http_code}|%{url_effective}|%{content_type}|%{size_download}',$url)
    $output=@(& curl.exe @args 2>&1); $exit=$LASTEXITCODE
    $meta=if($output.Count){[string]$output[-1]}else{''}
    $status=$null;$final=$null;$ct=$null;$downloaded=0L
    if($meta -match '^(\d{3})\|([^|]*)\|([^|]*)\|(\d+)$'){$status=[int]$matches[1];$final=$matches[2];$ct=$matches[3];$downloaded=[int64]$matches[4]}
    $actual=if(Test-Path $body){(Get-Item $body).Length}else{0}
    $sha=if($actual -gt 0){(Get-FileHash $body -Algorithm SHA256).Hash}else{$null}
    $prefix=if($actual -gt 0){$b=[IO.File]::ReadAllBytes($body); (($b[0..([Math]::Min($b.Length-1,127))]|ForEach-Object{$_.ToString('X2')}) -join ' ')}else{$null}
    $strings=@()
    if($actual -gt 0){
      $bytes=[IO.File]::ReadAllBytes($body)
      $latin=[Text.Encoding]::Latin1.GetString($bytes)
      $strings=@([regex]::Matches($latin,'[\x20-\x7E]{4,512}')|ForEach-Object{$_.Value}|Select-Object -First 100)
      if($strings.Count){$strings|Set-Content -LiteralPath (Join-Path $reportDir ($safe+'.strings.txt')) -Encoding UTF8}
    }
    $results.Add([pscustomobject][ordered]@{url=$url;curlExit=$exit;status=$status;finalUrl=$final;contentType=$ct;downloadedBytes=$downloaded;actualBytes=$actual;sha256=$sha;hexPrefix=$prefix;printableStrings=$strings;error=if($exit -ne 0){($output -join "`n")}else{$null}})
    Remove-Item $body -Force -ErrorAction SilentlyContinue
  }
}

$results|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $reportDir 'v11-public-update-probe.json') -Encoding UTF8
$summary=[ordered]@{status='PUBLIC_UPDATE_PROTOCOL_FILE_PROBE_COMPLETE';bases=$bases;candidateNames=$names;success=@($results|Where-Object{$_.status -ge 200 -and $_.status -lt 300}|ForEach-Object{$_.url});redirects=@($results|Where-Object{$_.status -ge 300 -and $_.status -lt 400}|ForEach-Object{$_.url});notFound=@($results|Where-Object{$_.status -eq 404}|ForEach-Object{$_.url})}
$summary|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $reportDir 'v11-summary.json') -Encoding UTF8
Write-Host '=== V11 SUMMARY ===';$summary|ConvertTo-Json -Depth 5|Write-Host
Write-Host '=== RESULTS ===';$results|Select-Object url,status,finalUrl,contentType,actualBytes,sha256|Format-Table -AutoSize|Out-String|Write-Host
