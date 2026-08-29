$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v10'
$reportDir = Join-Path $root 'report'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$pcPage = 'https://mz.zlongame.com/jx/mzdownload/20180731/5473.html'
$launcher = 'https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

$targets = @(
  [pscustomobject]@{ name='PGLAUNCHER.EXE'; offset=284773204L; size=4820928L },
  [pscustomobject]@{ name='GAMEINFO.INI'; offset=115723864L; size=5398L }
)

function Fetch-Exact([object]$t) {
  $end=$t.offset+$t.size-1
  $out=Join-Path $root $t.name
  $header=Join-Path $reportDir ($t.name+'.headers.txt')
  $args=@('-L','--fail','--silent','--show-error','--http1.1','-A',$ua,'-e',$pcPage,'-H','Accept-Encoding: identity','-r',("{0}-{1}" -f $t.offset,$end),'--max-filesize',[string]$t.size,'-D',$header,'-o',$out,'-w','%{http_code}|%{size_download}',$launcher)
  $output=@(& curl.exe @args 2>&1); $exit=$LASTEXITCODE
  $meta=if($output.Count){[string]$output[-1]}else{''}
  if($exit -ne 0 -or $meta -notmatch '^(200|206)\|(\d+)$'){ throw "fetch failed $($t.name): $($output -join "`n")" }
  $actual=(Get-Item -LiteralPath $out).Length
  if($actual -ne $t.size){throw "size mismatch $($t.name): $actual != $($t.size)"}
  return $out
}

$pg=Fetch-Exact $targets[0]
$gi=Fetch-Exact $targets[1]

@'
import json, pathlib, re, struct, sys
root=pathlib.Path(sys.argv[1]); report=pathlib.Path(sys.argv[2])
pg=root/'PGLAUNCHER.EXE'; gi=root/'GAMEINFO.INI'

def printable(data, utf16=False):
    text=data.decode('utf-16le' if utf16 else 'latin1', errors='ignore')
    return [m.group(0) for m in re.finditer(r'[\x20-\x7e]{4,1024}', text)]

def scan(path):
    data=path.read_bytes()
    vals=printable(data)+printable(data,True)
    pats=re.compile(r'(?i)(https?://|update|repair|install|patch|manifest|version|filelist|listfile|gameinfo|server|download|resource|package|catalog|\.ini\b|\.json\b|\.xml\b|\.txt\b|\.zip\b|\.7z\b|\.dat\b|\.b\b)')
    interesting=sorted(set(v for v in vals if pats.search(v)))
    urls=sorted(set(u.rstrip('.,;)]}') for v in vals for u in re.findall(r'(?i)https?://[^\s"<>]+',v)))
    filenames=sorted(set(f for v in vals for f in re.findall(r'(?i)[A-Za-z0-9_./\\-]+\.(?:ini|json|xml|txt|zip|7z|dat|b)',v) if len(f)<=260))
    return data,interesting,urls,filenames

pgdata,interesting,urls,filenames=scan(pg)
(report/'pglauncher-interesting-strings.txt').write_text('\n'.join(interesting),encoding='utf-8')
(report/'pglauncher-urls.txt').write_text('\n'.join(urls),encoding='utf-8')
(report/'pglauncher-filenames.txt').write_text('\n'.join(filenames),encoding='utf-8')

# PE identity only, never execute.
pe=None
if pgdata[:2]==b'MZ' and len(pgdata)>0x40:
    off=struct.unpack_from('<I',pgdata,0x3c)[0]
    if pgdata[off:off+4]==b'PE\0\0':
        machine=struct.unpack_from('<H',pgdata,off+4)[0]
        sections=struct.unpack_from('<H',pgdata,off+6)[0]
        pe={'machine':machine,'sectionCount':sections,'peOffset':off}

# GAMEINFO.INI appears non-text in v9: preserve only structure evidence, hex prefix, printable fragments.
gib=gi.read_bytes()
giascii=printable(gib)
giutf=printable(gib,True)
gi_summary={
  'bytes':len(gib),'hexPrefix':gib[:128].hex(' '),
  'asciiStrings':giascii[:200], 'utf16LikeStrings':giutf[:200]
}
(report/'gameinfo-structure.json').write_text(json.dumps(gi_summary,ensure_ascii=False,indent=2),encoding='utf-8')
summary={
 'status':'EMBEDDED_PGLAUNCHER_STATIC_PROTOCOL_SCAN_COMPLETE',
 'pgLauncherBytes':len(pgdata),'pgLauncherPe':pe,
 'interestingStringCount':len(interesting),'urlCount':len(urls),'filenameCount':len(filenames),
 'gameInfoBytes':len(gib)
}
(report/'v10-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=True))
'@ | Set-Content -LiteralPath (Join-Path $root 'scan.py') -Encoding UTF8

python (Join-Path $root 'scan.py') $root $reportDir
if ($LASTEXITCODE -ne 0){throw 'static scan failed'}

Write-Host '=== V10 SUMMARY ==='
Get-Content (Join-Path $reportDir 'v10-summary.json') -Raw | Write-Host
Write-Host '=== CANDIDATE FILENAMES ==='
Get-Content (Join-Path $reportDir 'pglauncher-filenames.txt') | Select-Object -First 300 | Write-Host
Write-Host '=== URLS ==='
Get-Content (Join-Path $reportDir 'pglauncher-urls.txt') | Select-Object -First 200 | Write-Host
Write-Host '=== UPDATE/PROTOCOL STRINGS ==='
Get-Content (Join-Path $reportDir 'pglauncher-interesting-strings.txt') | Select-Object -First 500 | Write-Host

Remove-Item -LiteralPath $pg,$gi,(Join-Path $root 'scan.py') -Force -ErrorAction SilentlyContinue
