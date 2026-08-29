$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v14'
$report=Join-Path $root 'report'
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $report|Out-Null
$ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
$base='http://mhmnzupdate.zlongame.com/MHMNZ'
$version='1.1.113'
$rel="InstallVersion/InstallPage_${version}/intallinfo_${version}.ini"
$url="$base/$rel"
$enc=Join-Path $root 'installinfo.enc'
$headers=Join-Path $report 'installinfo.headers.txt'
$code=& curl.exe -L --silent --show-error --http1.1 -A $ua -H 'Accept-Encoding: identity' --max-filesize 10485760 -D $headers -o $enc -w '%{http_code}' $url
$exit=$LASTEXITCODE
if($exit -ne 0 -or "$code" -ne '200'){ throw "installinfo fetch failed exit=$exit http=$code" }

@'
import pathlib, json, struct, zlib, sys
src=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); url=sys.argv[3]
b=src.read_bytes()
state=0x19830716
key=[]
for _ in range(128):
    state=(state*214013+2531011)&0xffffffff
    r=(state>>16)&0x7fff
    key.append(r%255)
x=bytes(v ^ key[i&0x7f] for i,v in enumerate(b))
header=x[:100]
status='UNKNOWN_FORMAT'; payload=b''; crc_ok=None
if header.startswith(b'SEPCIAL_FILE_HD') and len(x)>=100:
    status='CYPTCRYPT_DECRYPTED'
    payload=x[100:]
    expected_len=struct.unpack_from('<I',header,20)[0]
    crc_ascii=header[24:32].decode('ascii','replace')
    calc_crc=zlib.crc32(payload)&0xffffffff
    crc_le=calc_crc.to_bytes(4,'little').hex().upper()
    crc_ok=(len(payload)==expected_len and crc_ascii.upper()==crc_le)
else:
    payload=b; status='PLAINTEXT_OR_OTHER'
text=payload.decode('utf-8','replace')
(out/'installinfo-decrypted.ini').write_text(text,encoding='utf-8')
lines=text.splitlines(); hits=[]
for i,line in enumerate(lines):
    if 'ui_heropainting3_ssr_abs.b' in line.lower():
        lo=max(0,i-20); hi=min(len(lines),i+21)
        hits.append({'line':i+1,'value':line,'context':lines[lo:hi]})
summary={'status':status,'url':url,'encryptedBytes':len(b),'decryptedBytes':len(payload),'headerMagic':header[:16].decode('ascii','replace') if header else '','crcOk':crc_ok,'heroPaintingSsrHitCount':len(hits),'hits':hits}
(out/'installinfo-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
with (out/'installinfo-hero-context.txt').open('w',encoding='utf-8') as f:
    for h in hits:
        f.write('--- hit line {} ---\n'.format(h['line']))
        f.write('\n'.join(h['context'])+'\n')
print(json.dumps({k:summary[k] for k in ['status','url','encryptedBytes','decryptedBytes','crcOk','heroPaintingSsrHitCount']},ensure_ascii=True))
'@|Set-Content (Join-Path $root 'parse_install.py') -Encoding UTF8
python (Join-Path $root 'parse_install.py') $enc $report $url
if($LASTEXITCODE -ne 0){throw 'installinfo parse failed'}
Get-Content (Join-Path $report 'installinfo-hero-context.txt') -Raw|Write-Host
Remove-Item $enc,(Join-Path $root 'parse_install.py') -Force -ErrorAction SilentlyContinue
