$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v9'
$reportDir = Join-Path $root 'report'
$rawDir = Join-Path $root 'raw'
New-Item -ItemType Directory -Force -Path $reportDir, $rawDir | Out-Null

$pcPage = 'https://mz.zlongame.com/jx/mzdownload/20180731/5473.html'
$launcher = 'https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

$targets = @(
  [pscustomobject]@{ name='APPKEY'; offset=2646572L; size=14L },
  [pscustomobject]@{ name='DEST_CONFIG_GAMES.JSON'; offset=115687472L; size=6535L },
  [pscustomobject]@{ name='DEST_GAMESFILELIST.JSON'; offset=115698296L; size=7340L },
  [pscustomobject]@{ name='GAMEINFO.INI'; offset=115723864L; size=5398L },
  [pscustomobject]@{ name='GAMENAME'; offset=115729264L; size=16L },
  [pscustomobject]@{ name='ISBRANCH'; offset=126196888L; size=2L },
  [pscustomobject]@{ name='INFO'; offset=126142768L; size=54120L }
)

$fetchResults = [System.Collections.Generic.List[object]]::new()
foreach ($t in $targets) {
  $end = $t.offset + $t.size - 1
  $out = Join-Path $rawDir ($t.name + '.bin')
  $header = Join-Path $reportDir ($t.name + '.headers.txt')
  $args = @(
    '-L','--fail','--silent','--show-error','--http1.1',
    '-A',$ua,'-e',$pcPage,'-H','Accept-Encoding: identity',
    '-r',("{0}-{1}" -f $t.offset,$end),
    '--max-filesize',[string]$t.size,
    '-D',$header,'-o',$out,'-w','%{http_code}|%{size_download}|%{content_type}',
    $launcher
  )
  $output = @(& curl.exe @args 2>&1)
  $exitCode = $LASTEXITCODE
  $meta = if ($output.Count) { [string]$output[-1] } else { '' }
  $status=$null; $downloaded=0L; $contentType=$null
  if ($meta -match '^(\d{3})\|(\d+)\|(.*)$') {
    $status=[int]$matches[1]; $downloaded=[int64]$matches[2]; $contentType=$matches[3]
  }
  $actual = if (Test-Path -LiteralPath $out) { (Get-Item -LiteralPath $out).Length } else { 0 }
  $ok = ($exitCode -eq 0 -and $status -in 200,206 -and $actual -eq $t.size)
  $fetchResults.Add([pscustomobject][ordered]@{
    name=$t.name; offset=$t.offset; size=$t.size; end=$end; curlExit=$exitCode; status=$status
    downloadedBytes=$downloaded; actualBytes=$actual; contentType=$contentType; exactSizeMatch=$ok
    error=if ($exitCode -ne 0) { ($output -join "`n") } else { $null }
  })
  if (-not $ok) { throw "Target range failed: $($fetchResults[-1] | ConvertTo-Json -Compress)" }
}

$fetchResults | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $reportDir 'target-range-fetch-results.json') -Encoding UTF8

@'
import json, pathlib, sys
raw = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

def decode_bytes(b):
    candidates=[]
    if b.startswith(b'\xef\xbb\xbf'): candidates.append(('utf-8-sig', b.decode('utf-8-sig')))
    if b.startswith(b'\xff\xfe'): candidates.append(('utf-16le', b[2:].decode('utf-16le')))
    if b.startswith(b'\xfe\xff'): candidates.append(('utf-16be', b[2:].decode('utf-16be')))
    for enc in ('utf-8','utf-16le','gb18030','latin1'):
        try:
            s=b.decode(enc)
            if '\x00' in s and enc not in ('utf-16le',):
                continue
            candidates.append((enc,s))
        except Exception:
            pass
    seen=set()
    for enc,s in candidates:
        key=(enc,s[:256])
        if key in seen: continue
        seen.add(key)
        yield enc,s

summary=[]
for p in sorted(raw.glob('*.bin')):
    b=p.read_bytes()
    chosen=None; parsed=None
    for enc,s in decode_bytes(b):
        stripped=s.strip('\x00\ufeff\r\n \t')
        try:
            obj=json.loads(stripped)
            chosen=(enc,stripped); parsed=obj
            break
        except Exception:
            if chosen is None and stripped:
                chosen=(enc,stripped)
    if chosen is None:
        chosen=('binary','')
    enc,text=chosen
    text_path=out/(p.stem+'.txt')
    text_path.write_text(text, encoding='utf-8')
    item={'name':p.stem,'bytes':len(b),'encoding':enc,'json':parsed is not None,'textPreview':text[:400]}
    if parsed is not None:
        json_path=out/(p.stem+'.json')
        json_path.write_text(json.dumps(parsed,ensure_ascii=False,indent=2),encoding='utf-8')
        if isinstance(parsed,dict): item['topLevelKeys']=list(parsed.keys())
        elif isinstance(parsed,list): item['topLevelLength']=len(parsed)
    summary.append(item)
(out/'decoded-resource-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
'@ | Set-Content -LiteralPath (Join-Path $root 'decode.py') -Encoding UTF8

python (Join-Path $root 'decode.py') $rawDir $reportDir
if ($LASTEXITCODE -ne 0) { throw 'Target resource decode failed.' }

Write-Host '=== TARGET FETCH RESULTS ==='
$fetchResults | Format-Table -AutoSize | Out-String | Write-Host
Write-Host '=== DECODE SUMMARY ==='
Get-Content -LiteralPath (Join-Path $reportDir 'decoded-resource-summary.json') -Raw | Write-Host
foreach ($name in @('APPKEY','GAMENAME','ISBRANCH','DEST_CONFIG_GAMES.JSON','DEST_GAMESFILELIST.JSON','GAMEINFO.INI')) {
  $p = Join-Path $reportDir ($name + '.txt')
  if (Test-Path -LiteralPath $p) {
    Write-Host "=== $name ==="
    Get-Content -LiteralPath $p -Raw | Write-Host
  }
}

Remove-Item -LiteralPath $rawDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $root 'decode.py') -Force -ErrorAction SilentlyContinue
