$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v13'
$report=Join-Path $root 'report'
New-Item -ItemType Directory -Force -Path $report|Out-Null
$src='https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe'
$page='https://mz.zlongame.com/jx/mzdownload/20180731/5473.html'
$ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
$offset=284773204L;$size=4820928L;$end=$offset+$size-1;$pg=Join-Path $root 'PGLAUNCHER.EXE'
$args=@('-L','--fail','--silent','--show-error','--http1.1','-A',$ua,'-e',$page,'-H','Accept-Encoding: identity','-r',("{0}-{1}" -f $offset,$end),'--max-filesize',[string]$size,'-o',$pg,$src)
& curl.exe @args
if($LASTEXITCODE -ne 0){throw 'PGLAUNCHER range fetch failed'}
if((Get-Item $pg).Length -ne $size){throw 'PGLAUNCHER size mismatch'}
@'
import json,re,struct,sys,pathlib
p=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); b=p.read_bytes()
# PE mapping
pe=struct.unpack_from('<I',b,0x3c)[0]; coff=pe+4; nsec=struct.unpack_from('<H',b,coff+2)[0]; optsz=struct.unpack_from('<H',b,coff+16)[0]; opt=coff+20
magic=struct.unpack_from('<H',b,opt)[0]; imagebase=struct.unpack_from('<I',b,opt+28)[0] if magic==0x10b else struct.unpack_from('<Q',b,opt+24)[0]
st=opt+optsz; secs=[]
for i in range(nsec):
 o=st+i*40; name=b[o:o+8].split(b'\0',1)[0].decode('ascii','replace'); vs,va,rs,rp=struct.unpack_from('<IIII',b,o+8)
 secs.append({'name':name,'virtualSize':vs,'virtualAddress':va,'rawSize':rs,'rawPointer':rp})
def raw_to_rva(off):
 for s in secs:
  if s['rawPointer']<=off<s['rawPointer']+s['rawSize']: return s['virtualAddress']+(off-s['rawPointer'])
 return None
# Collect ASCII/UTF16 printable strings with offsets.
entries=[]
for m in re.finditer(rb'[\x20-\x7e]{4,1024}',b): entries.append({'offset':m.start(),'encoding':'ascii','text':m.group().decode('ascii','replace')})
# UTF16-LE sequences with printable ASCII code units, useful for path constants.
for m in re.finditer(rb'(?:[\x20-\x7e]\x00){4,512}',b): entries.append({'offset':m.start(),'encoding':'utf16le-ascii','text':m.group().decode('utf-16le','replace')})
entries.sort(key=lambda x:x['offset'])
targets=['sAutoPatch/','uAutoPatch','AutoPatch.ini','GameInfo.ini','gameinfo.ini','patchinfo_%s_%s.ini','intallinfo_%s.ini','s.ini','lu.ini','6.b','n.b','download.bin','updateURI','updateurl']
results=[]
for target in targets:
 hits=[e for e in entries if e['text']==target or target.lower() in e['text'].lower()]
 for h in hits[:20]:
  lo=h['offset']-4096; hi=h['offset']+4096
  neigh=[e for e in entries if lo<=e['offset']<=hi and len(e['text'])<=500]
  rva=raw_to_rva(h['offset'])
  results.append({'target':target,'hit':h,'rva':rva,'va':(imagebase+rva if rva is not None else None),'neighbors':neigh})
summary={'status':'PGLAUNCHER_PROTOCOL_STRING_CONTEXT_MAPPED','imageBase':imagebase,'sections':secs,'entryCount':len(entries),'targetHitCount':len(results),'targets':targets}
(out/'v13-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'v13-string-contexts.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
with (out/'v13-contexts.txt').open('w',encoding='utf-8') as f:
 for r in results:
  f.write(f"\n=== {r['target']} @ raw 0x{r['hit']['offset']:X} rva {r['rva']} va {r['va']} ({r['hit']['encoding']}) ===\n")
  for e in r['neighbors']:
   mark='>>' if e['offset']==r['hit']['offset'] else '  '
   f.write(f"{mark} 0x{e['offset']:08X} {e['encoding']}: {e['text']}\n")
print(json.dumps(summary,ensure_ascii=True))
'@|Set-Content (Join-Path $root 'map.py') -Encoding UTF8
python (Join-Path $root 'map.py') $pg $report
if($LASTEXITCODE -ne 0){throw 'context mapper failed'}
Get-Content (Join-Path $report 'v13-summary.json') -Raw|Write-Host
Get-Content (Join-Path $report 'v13-contexts.txt')|Select-Object -First 1200|Write-Host
Remove-Item $pg,(Join-Path $root 'map.py') -Force -ErrorAction SilentlyContinue
