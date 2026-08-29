$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v12'
$report=Join-Path $root 'report'
New-Item -ItemType Directory -Force -Path $report|Out-Null
$bases=@('http://mhmnzupdate.zlongame.com/MHMNZ','http://mhmnzupdatebak.zlongame.com/MHMNZ')
$paths=@('sAutoPatch/AutoPatch.ini','sAutoPatch/GameInfo.ini','sAutoPatch/gameinfo.ini')
$results=[System.Collections.Generic.List[object]]::new()
foreach($base in $bases){foreach($path in $paths){
 $url="$base/$path";$safe=(($base+'/'+$path)-replace '[^A-Za-z0-9]','_');$body=Join-Path $root ($safe+'.bin');$hdr=Join-Path $report ($safe+'.headers.txt')
 $args=@('-L','--silent','--show-error','--http1.1','--max-time','20','--max-filesize','1048576','-D',$hdr,'-o',$body,'-w','%{http_code}|%{url_effective}|%{content_type}|%{size_download}',$url)
 $o=@(& curl.exe @args 2>&1);$exit=$LASTEXITCODE;$meta=if($o.Count){[string]$o[-1]}else{''};$status=$null;$final=$null;$ct=$null;$sz=0L
 if($meta -match '^(\d{3})\|([^|]*)\|([^|]*)\|(\d+)$'){$status=[int]$matches[1];$final=$matches[2];$ct=$matches[3];$sz=[int64]$matches[4]}
 $actual=if(Test-Path $body){(Get-Item $body).Length}else{0};$sha=if($actual){(Get-FileHash $body -Algorithm SHA256).Hash}else{$null};$strings=@()
 if($actual){$b=[IO.File]::ReadAllBytes($body);$latin=[Text.Encoding]::Latin1.GetString($b);$strings=@([regex]::Matches($latin,'[\x20-\x7E]{4,1024}')|ForEach-Object{$_.Value}|Select-Object -First 200);if($strings.Count){$strings|Set-Content (Join-Path $report ($safe+'.strings.txt')) -Encoding UTF8}}
 $results.Add([pscustomobject]@{url=$url;status=$status;finalUrl=$final;contentType=$ct;bytes=$actual;sha256=$sha;strings=$strings;curlExit=$exit;error=if($exit){($o -join "`n")}else{$null}});Remove-Item $body -Force -ErrorAction SilentlyContinue
}}
$results|ConvertTo-Json -Depth 6|Set-Content (Join-Path $report 'v12-results.json') -Encoding UTF8
$ok=@($results|Where-Object{$_.status -ge 200 -and $_.status -lt 300})
[ordered]@{status='SAUTOPATCH_SUBPATH_PROBE_COMPLETE';successCount=$ok.Count;successUrls=@($ok.url)}|ConvertTo-Json -Depth 4|Set-Content (Join-Path $report 'v12-summary.json') -Encoding UTF8
$results|Select-Object url,status,finalUrl,contentType,bytes,sha256|Format-Table -AutoSize|Out-String|Write-Host
