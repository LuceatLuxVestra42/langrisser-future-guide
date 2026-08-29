$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v15'
$report=Join-Path $root 'report'
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $report|Out-Null
$ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
$version='1.1.113'
$packageName='InstallPage_1.1.113_61.zip'
$url="http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_${version}/${packageName}"
$expectedPackageBytes=109027105L
$expectedPackageMd5='77EA43E878D2A50E18EE96C814F34FD2'
$targetName='ui_heropainting_ssr_abs.b'
$expectedTargetBytes=25793935L
$expectedTargetMd5='168B2D54E39D62B98CD1E92BDE9F787B'
$canonicalSource='UI/HeroPainting/SSR_ABS/Prefab/Leon.prefab'

# Use ZIP metadata + HTTP ranges only. Do not download the full ~109 MB install package.
$head=Join-Path $report 'package60-head.txt'
& curl.exe -I -L --silent --show-error --http1.1 -A $ua -H 'Accept-Encoding: identity' -o $head $url
if($LASTEXITCODE -ne 0){throw 'Package60 HEAD failed'}

$tailSize=1048576L
$tailStart=$expectedPackageBytes-$tailSize
$tailEnd=$expectedPackageBytes-1
$tail=Join-Path $root 'zip-tail.bin'
& curl.exe -L --fail --silent --show-error --http1.1 -A $ua -H 'Accept-Encoding: identity' -r ("{0}-{1}" -f $tailStart,$tailEnd) --max-filesize 1100000 -o $tail $url
if($LASTEXITCODE -ne 0){throw 'Package60 ZIP tail range failed'}
if((Get-Item $tail).Length -gt 1100000){throw 'Package60 server ignored tail range'}

@'
import json, pathlib, struct, sys
p=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); base=int(sys.argv[3])
b=p.read_bytes(); sig=b'PK\x05\x06'; pos=b.rfind(sig)
if pos<0: raise SystemExit('EOCD not found in tail')
if pos+22>len(b): raise SystemExit('truncated EOCD')
disk,cd_disk,n_disk,n_total,cd_size,cd_off,comment_len=struct.unpack_from('<HHHHIIH',b,pos+4)
if disk!=0 or cd_disk!=0: raise SystemExit('multi-disk ZIP unsupported')
meta={'eocdAbsoluteOffset':base+pos,'entryCount':n_total,'centralDirectoryOffset':cd_off,'centralDirectorySize':cd_size,'commentLength':comment_len}
(out/'zip-eocd.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
print(json.dumps(meta))
'@|Set-Content (Join-Path $root 'parse_eocd.py') -Encoding UTF8
$eocdJson=python (Join-Path $root 'parse_eocd.py') $tail $report $tailStart
if($LASTEXITCODE -ne 0){throw 'EOCD parse failed'}
$eocd=$eocdJson|ConvertFrom-Json
$cdStart=[int64]$eocd.centralDirectoryOffset
$cdSize=[int64]$eocd.centralDirectorySize
$cdEnd=$cdStart+$cdSize-1
$cd=Join-Path $root 'central-dir.bin'
& curl.exe -L --fail --silent --show-error --http1.1 -A $ua -H 'Accept-Encoding: identity' -r ("{0}-{1}" -f $cdStart,$cdEnd) --max-filesize ([int64]($cdSize+1024)) -o $cd $url
if($LASTEXITCODE -ne 0){throw 'Central directory range failed'}
if((Get-Item $cd).Length -ne $cdSize){throw 'Central directory size mismatch'}

@'
import json, pathlib, struct, sys
b=pathlib.Path(sys.argv[1]).read_bytes(); target=sys.argv[2]; out=pathlib.Path(sys.argv[3])
pos=0; rows=[]; hit=None
while pos+46<=len(b):
    if b[pos:pos+4]!=b'PK\x01\x02': break
    flags,method=struct.unpack_from('<HH',b,pos+8)
    crc,csize,usize=struct.unpack_from('<III',b,pos+16)
    fn,ex,cm=struct.unpack_from('<HHH',b,pos+28)
    local=struct.unpack_from('<I',b,pos+42)[0]
    nameb=b[pos+46:pos+46+fn]
    enc='utf-8' if flags&0x800 else 'cp437'
    name=nameb.decode(enc,'replace')
    row={'name':name,'flags':flags,'method':method,'crc32':f'{crc:08X}','compressedSize':csize,'uncompressedSize':usize,'localHeaderOffset':local}
    rows.append(row)
    norm=name.replace('\\','/').lower()
    if norm.endswith('/'+target.lower()) or norm==target.lower(): hit=row
    pos+=46+fn+ex+cm
if hit is None: raise SystemExit('target entry not found in central directory')
(out/'zip-target-entry.json').write_text(json.dumps(hit,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'zip-entry-list.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(hit))
'@|Set-Content (Join-Path $root 'parse_cd.py') -Encoding UTF8
$entryJson=python (Join-Path $root 'parse_cd.py') $cd $targetName $report
if($LASTEXITCODE -ne 0){throw 'Central directory parse failed'}
$entry=$entryJson|ConvertFrom-Json
$localOff=[int64]$entry.localHeaderOffset
$localProbe=Join-Path $root 'local-header.bin'
$localProbeEnd=$localOff+4095
& curl.exe -L --fail --silent --show-error --http1.1 -A $ua -H 'Accept-Encoding: identity' -r ("{0}-{1}" -f $localOff,$localProbeEnd) --max-filesize 4096 -o $localProbe $url
if($LASTEXITCODE -ne 0){throw 'Local header range failed'}

@'
import json, pathlib, struct, sys
b=pathlib.Path(sys.argv[1]).read_bytes(); base=int(sys.argv[2]); csize=int(sys.argv[3]); out=pathlib.Path(sys.argv[4])
if b[:4]!=b'PK\x03\x04': raise SystemExit('local header signature mismatch')
ver,flags,method,tm,dt,crc,lcsize,lusize,fn,ex=struct.unpack_from('<HHHHHIIIHH',b,4)
name=b[30:30+fn].decode('utf-8' if flags&0x800 else 'cp437','replace')
data_start=base+30+fn+ex
meta={'name':name,'flags':flags,'method':method,'localCompressedSize':lcsize,'localUncompressedSize':lusize,'dataStart':data_start,'dataEnd':data_start+csize-1}
(out/'zip-local-header.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(meta))
'@|Set-Content (Join-Path $root 'parse_local.py') -Encoding UTF8
$localJson=python (Join-Path $root 'parse_local.py') $localProbe $localOff ([int64]$entry.compressedSize) $report
if($LASTEXITCODE -ne 0){throw 'Local header parse failed'}
$local=$localJson|ConvertFrom-Json
$dataStart=[int64]$local.dataStart
$dataEnd=[int64]$local.dataEnd
$compressed=Join-Path $root 'target-compressed.bin'
$maxCompressed=[int64]$entry.compressedSize+1024
& curl.exe -L --fail --silent --show-error --http1.1 -A $ua -H 'Accept-Encoding: identity' -r ("{0}-{1}" -f $dataStart,$dataEnd) --max-filesize $maxCompressed -o $compressed $url
if($LASTEXITCODE -ne 0){throw 'Target compressed-data range failed'}
if((Get-Item $compressed).Length -ne [int64]$entry.compressedSize){throw 'Target compressed size mismatch'}

@'
import json, pathlib, sys, zlib, hashlib, binascii
src=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); method=int(sys.argv[3]); expected_size=int(sys.argv[4]); expected_md5=sys.argv[5].upper(); expected_crc=sys.argv[6].upper(); dst=pathlib.Path(sys.argv[7])
c=src.read_bytes()
if method==0: data=c
elif method==8: data=zlib.decompress(c,-15)
else: raise SystemExit(f'unsupported ZIP method {method}')
md5=hashlib.md5(data).hexdigest().upper(); sha=hashlib.sha256(data).hexdigest().upper(); crc=f'{binascii.crc32(data)&0xffffffff:08X}'
if len(data)!=expected_size: raise SystemExit(f'target size mismatch {len(data)} != {expected_size}')
if md5!=expected_md5: raise SystemExit(f'target MD5 mismatch {md5} != {expected_md5}')
if crc!=expected_crc: raise SystemExit(f'target CRC mismatch {crc} != {expected_crc}')
dst.write_bytes(data)
meta={'status':'TARGET_HEROPAINTING_SSR_BUNDLE_RANGE_EXTRACTED','bytes':len(data),'md5':md5,'sha256':sha,'crc32':crc,'zipMethod':method,'first16Ascii':''.join(chr(x) if 32<=x<127 else '.' for x in data[:16])}
(out/'bundle-extraction-summary.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
print(json.dumps(meta))
'@|Set-Content (Join-Path $root 'inflate_target.py') -Encoding UTF8
$bundle=Join-Path $root $targetName
python (Join-Path $root 'inflate_target.py') $compressed $report ([int]$entry.method) $expectedTargetBytes $expectedTargetMd5 $entry.crc32 $bundle
if($LASTEXITCODE -ne 0){throw 'Target inflate/verification failed'}

# Parse the UnityFS AssetBundle container and confirm Leon.prefab by exact normalized source suffix.
python -m pip install --disable-pip-version-check --quiet UnityPy
if($LASTEXITCODE -ne 0){throw 'UnityPy installation failed'}
@'
import json, pathlib, sys, hashlib
import UnityPy
bundle=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); canonical=sys.argv[3]
canonical_norm=canonical.replace('\\','/').lower().strip('/')
expected_suffix=canonical_norm

env=UnityPy.load(str(bundle))
container_rows=[]
container_error=None
try:
    container=env.container
    for path,obj in container.items():
        norm=str(path).replace('\\','/').lower().strip('/')
        typ=getattr(getattr(obj,'type',None),'name',None)
        pid=getattr(obj,'path_id',None)
        container_rows.append({'path':str(path),'normalized':norm,'type':typ,'pathId':pid})
except Exception as exc:
    container_error=f'{type(exc).__name__}: {exc}'

matches=[]
for row in container_rows:
    n=row['normalized']
    if n==expected_suffix or n.endswith('/'+expected_suffix) or n.endswith(expected_suffix):
        matches.append(row)

# Secondary evidence only: named GameObject. Exact owning proof still requires the container path match above.
gameobject_hits=[]
for obj in env.objects:
    if getattr(getattr(obj,'type',None),'name',None)!='GameObject':
        continue
    try:
        data=obj.read()
        name=getattr(data,'m_Name','')
        if str(name).lower()=='leon':
            gameobject_hits.append({'pathId':getattr(obj,'path_id',None),'name':str(name)})
    except Exception:
        pass

hero_family=[r for r in container_rows if '/ui/heropainting/ssr_abs/' in ('/'+r['normalized']) or 'ui/heropainting/ssr_abs/' in r['normalized']]
summary={
    'status':'LEON_OWNING_BUNDLE_CONFIRMED' if matches else 'LEON_CONTAINER_PATH_NOT_FOUND',
    'canonicalSourceArtworkPath':canonical,
    'bundleName':bundle.name,
    'bundleBytes':bundle.stat().st_size,
    'bundleMd5':hashlib.md5(bundle.read_bytes()).hexdigest().upper(),
    'bundleSha256':hashlib.sha256(bundle.read_bytes()).hexdigest().upper(),
    'unityPyVersion':getattr(UnityPy,'__version__',None),
    'containerEntryCount':len(container_rows),
    'containerError':container_error,
    'exactOrSuffixMatches':matches,
    'leonGameObjectHits':gameobject_hits,
    'heroPaintingSsrFamilyCount':len(hero_family),
    'heroPaintingSsrFamilySample':hero_family[:100]
}
(out/'leon-owning-bundle-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'heropainting-ssr-container-paths.txt').write_text('\n'.join(r['path'] for r in hero_family),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=True))
if not matches:
    raise SystemExit(3)
'@|Set-Content (Join-Path $root 'inspect_bundle.py') -Encoding UTF8
python (Join-Path $root 'inspect_bundle.py') $bundle $report $canonicalSource
if($LASTEXITCODE -ne 0){throw 'Leon exact container path not found in target bundle'}

$summary=[pscustomobject]@{
 status='LEON_OWNING_BUNDLE_PROBE_COMPLETE'
 heroId=6
 canonicalSourceArtworkPath=$canonicalSource
 installVersion=$version
 packageIndex=60
 packageName=$packageName
 packageUrl=$url
 packageExpectedBytes=$expectedPackageBytes
 packageExpectedMd5=$expectedPackageMd5
 bundleName=$targetName
 bundleExpectedBytes=$expectedTargetBytes
 bundleExpectedMd5=$expectedTargetMd5
 compressedBytes=[int64]$entry.compressedSize
 totalPayloadFetchedApprox=$tailSize+$cdSize+4096+[int64]$entry.compressedSize
}
$summary|ConvertTo-Json -Depth 5|Set-Content (Join-Path $report 'v15-summary.json') -Encoding UTF8
$summary|ConvertTo-Json -Depth 5|Write-Host

Remove-Item $tail,$cd,$localProbe,$compressed,$bundle -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $root '*.py') -Force -ErrorAction SilentlyContinue