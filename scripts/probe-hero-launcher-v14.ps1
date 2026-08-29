$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v14'
$report=Join-Path $root 'report'
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $report|Out-Null
$ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
$version='1.1.113'
$packageName='InstallPage_1.1.113_61.zip'
$url="http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_${version}/${packageName}"
$expectedPackageBytes=109027105L
$expectedPackageMd5='77EA43E878D2A50E18EE96C814F34FD2'
$targetName='ui_heropainting3_ssr_abs.b'
$expectedTargetBytes=5134422L
$expectedTargetMd5='74E60EFC2536FC98EC1CD38CF099A043'

# Read only headers and ZIP metadata first; never download the full ~109 MB package.
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
p=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); base=int(sys.argv[3]); target=sys.argv[4]
b=p.read_bytes()
sig=b'PK\x05\x06'; pos=b.rfind(sig)
if pos<0: raise SystemExit('EOCD not found in tail')
if pos+22>len(b): raise SystemExit('truncated EOCD')
disk,cd_disk,n_disk,n_total,cd_size,cd_off,comment_len=struct.unpack_from('<HHHHIIH',b,pos+4)
if disk!=0 or cd_disk!=0: raise SystemExit('multi-disk ZIP unsupported')
meta={'eocdAbsoluteOffset':base+pos,'entryCount':n_total,'centralDirectoryOffset':cd_off,'centralDirectorySize':cd_size,'commentLength':comment_len}
(out/'zip-eocd.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
print(json.dumps(meta))
'@|Set-Content (Join-Path $root 'parse_eocd.py') -Encoding UTF8
$eocdJson=python (Join-Path $root 'parse_eocd.py') $tail $report $tailStart $targetName
if($LASTEXITCODE -ne 0){throw 'EOCD parse failed'}
$eocd=$eocdJson|ConvertFrom-Json
$cdStart=[int64]$eocd.centralDirectoryOffset
$cdSize=[int64]$eocd.centralDirectorySize
$cdEnd=$cdStart+$cdSize-1
$cd=Join-Path $root 'central-dir.bin'
& curl.exe -L --fail --silent --show-error --http1.1 -A $ua -H 'Accept-Encoding: identity' -r ("{0}-{1}" -f $cdStart,$cdEnd) --max-filesize ([int64]($cdSize+1024)) -o $cd $url
if($LASTEXITCODE -ne 0){throw 'Central directory range failed'}
if((Get-Item $cd).Length -ne $cdSize){throw "Central directory size mismatch"}

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
 if name.replace('\\','/').endswith('/'+target) or name==target: hit=row
 pos+=46+fn+ex+cm
if hit is None: raise SystemExit('target entry not found in central directory')
(out/'zip-target-entry.json').write_text(json.dumps(hit,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'zip-entry-count.txt').write_text(str(len(rows)),encoding='utf-8')
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
import json, pathlib, struct, sys, zlib, hashlib, binascii
src=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); method=int(sys.argv[3]); expected_size=int(sys.argv[4]); expected_md5=sys.argv[5].upper(); expected_crc=sys.argv[6].upper()
c=src.read_bytes()
if method==0: data=c
elif method==8: data=zlib.decompress(c,-15)
else: raise SystemExit(f'unsupported ZIP method {method}')
md5=hashlib.md5(data).hexdigest().upper(); sha=hashlib.sha256(data).hexdigest().upper(); crc=f'{binascii.crc32(data)&0xffffffff:08X}'
if len(data)!=expected_size: raise SystemExit(f'target size mismatch {len(data)}')
if md5!=expected_md5: raise SystemExit(f'target MD5 mismatch {md5}')
if crc!=expected_crc: raise SystemExit(f'target CRC mismatch {crc} != {expected_crc}')
target=out/'ui_heropainting3_ssr_abs.b'; target.write_bytes(data)
head=data[:64]
meta={'status':'FULL_HEROPAINTING_BUNDLE_RANGE_EXTRACTED','bytes':len(data),'md5':md5,'sha256':sha,'crc32':crc,'zipMethod':method,'first64Hex':head.hex().upper(),'first64Ascii':''.join(chr(x) if 32<=x<127 else '.' for x in head)}
(out/'hero-bundle-summary.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
print(json.dumps(meta))
'@|Set-Content (Join-Path $root 'inflate_target.py') -Encoding UTF8
python (Join-Path $root 'inflate_target.py') $compressed $report ([int]$entry.method) $expectedTargetBytes $expectedTargetMd5 $entry.crc32
if($LASTEXITCODE -ne 0){throw 'Target inflate/verification failed'}

$summary=[pscustomobject]@{
 status='INSTALL_PACKAGE_RANGE_EXTRACTION_COMPLETE'
 source=$url
 expectedPackageBytes=$expectedPackageBytes
 expectedPackageMd5=$expectedPackageMd5
 centralDirectoryBytes=$cdSize
 targetCompressedBytes=[int64]$entry.compressedSize
 targetUncompressedBytes=[int64]$entry.uncompressedSize
 targetLocalHeaderOffset=$localOff
 targetDataStart=$dataStart
 targetDataEnd=$dataEnd
 targetExpectedMd5=$expectedTargetMd5
 totalPayloadFetchedApprox=$tailSize+$cdSize+4096+[int64]$entry.compressedSize
}
$summary|ConvertTo-Json -Depth 5|Set-Content (Join-Path $report 'range-extraction-summary.json') -Encoding UTF8
$summary|ConvertTo-Json -Depth 5|Write-Host
Remove-Item $tail,$cd,$localProbe,$compressed -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $root '*.py') -Force -ErrorAction SilentlyContinue
