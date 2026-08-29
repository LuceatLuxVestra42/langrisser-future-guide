$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v14'
$report=Join-Path $root 'report'
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $report|Out-Null
$src='https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe'
$page='https://mz.zlongame.com/jx/mzdownload/20180731/5473.html'
$ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
$offset=284773204L;$size=4820928L;$end=$offset+$size-1;$pg=Join-Path $root 'PGLAUNCHER.EXE'
& curl.exe -L --fail --silent --show-error --http1.1 -A $ua -e $page -H 'Accept-Encoding: identity' -r ("{0}-{1}" -f $offset,$end) --max-filesize $size -o $pg $src
if($LASTEXITCODE -ne 0){throw 'PGLAUNCHER range fetch failed'}
if((Get-Item $pg).Length -ne $size){throw 'PGLAUNCHER size mismatch'}

@'
import json, pathlib, struct, sys
p=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); b=p.read_bytes()
def u16(o): return struct.unpack_from('<H',b,o)[0]
def u32(o): return struct.unpack_from('<I',b,o)[0]
pe=u32(0x3c); coff=pe+4; nsec=u16(coff+2); optsz=u16(coff+16); opt=coff+20; magic=u16(opt)
imagebase=u32(opt+28) if magic==0x10b else struct.unpack_from('<Q',b,opt+24)[0]
st=opt+optsz; secs=[]
for i in range(nsec):
 o=st+i*40; name=b[o:o+8].split(b'\0',1)[0].decode('ascii','replace'); vs,va,rs,rp=struct.unpack_from('<IIII',b,o+8)
 secs.append({'name':name,'virtualSize':vs,'virtualAddress':va,'rawSize':rs,'rawPointer':rp})
text=next(s for s in secs if s['name']=='.text'); tb=b[text['rawPointer']:text['rawPointer']+text['rawSize']]
def raw_to_rva(raw):
 for s in secs:
  if s['rawPointer']<=raw<s['rawPointer']+s['rawSize']: return s['virtualAddress']+(raw-s['rawPointer'])
 return None
def va_to_raw(va):
 rva=va-imagebase
 for s in secs:
  span=max(s['virtualSize'],s['rawSize'])
  if s['virtualAddress']<=rva<s['virtualAddress']+span: return s['rawPointer']+(rva-s['virtualAddress'])
 return None
def text_raw_to_va(raw): return imagebase+text['virtualAddress']+(raw-text['rawPointer'])
def find_prologue(abs_raw,max_back=4096):
 lo=max(text['rawPointer'],abs_raw-max_back); chunk=b[lo:abs_raw]
 best=None
 for pat in (b'\x55\x8b\xec',b'\x55\x89\xe5'):
  pos=chunk.rfind(pat)
  if pos>=0:
   cand=lo+pos
   if best is None or cand>best: best=cand
 return best
def imm_xrefs(va):
 needle=struct.pack('<I',va); outx=[]; start=0
 while True:
  pos=tb.find(needle,start)
  if pos<0: break
  raw=text['rawPointer']+pos; pro=find_prologue(raw)
  outx.append({'codeRaw':raw,'codeVa':text_raw_to_va(raw),'nearestPrologueVa':(text_raw_to_va(pro) if pro is not None else None)})
  start=pos+1
 return outx
def call_xrefs(destva):
 hits=[]; rp=text['rawPointer']; end=rp+text['rawSize']-5
 for raw in range(rp,end):
  if b[raw]!=0xE8: continue
  rel=struct.unpack_from('<i',b,raw+1)[0]; src=text_raw_to_va(raw); dest=src+5+rel
  if dest==destva:
   pro=find_prologue(raw); hits.append({'callRaw':raw,'callVa':src,'nearestPrologueVa':(text_raw_to_va(pro) if pro is not None else None)})
 return hits
targets={'RunStart':0x3131F0,'FetchServerVersionFailed':0x313268,'BuildPatchChainFailed':0x3132C8,'PatchListStep':0x31345C,'AutoPatchPrefix':0x313498,'PatchInfoFormat':0x3135D8,'RunDone':0x313678,'InstallFetchServerVersion':0x313918,'InstallRemoteLocal':0x313970,'ConcatFormat':0x3139DC,'InstallInfoFormat':0x3139E8,'UpdateURI':0x311704}
rows=[]
for name,raw in targets.items():
 rva=raw_to_rva(raw); va=imagebase+rva; rows.append({'target':name,'raw':raw,'va':va,'xrefs':imm_xrefs(va)})
helpers=[0x449E50,0x449EE0,0x449F10,0x449FA0,0x43CD60,0x440780,0x417D00,0x49BB50,0x49F260,0x416B70,0x451C10,0x447D70]
helperRows=[{'helperVa':va,'callers':call_xrefs(va)} for va in helpers]
starts=set([0x449D90,0x449E50,0x449EE0,0x449F10,0x449FA0,0x44A0E0,0x44A590,0x44B980,0x450E40,0x453AE0,0x454FA0,0x451C10,0x447D70,0x416B70,0x49F260])
for r in rows:
 for x in r['xrefs']:
  if x['nearestPrologueVa']: starts.add(x['nearestPrologueVa'])
for h in helperRows:
 for x in h['callers']:
  if x['nearestPrologueVa'] and 0x00400000<=x['nearestPrologueVa']<0x00600000: starts.add(x['nearestPrologueVa'])
wins=[]
for va in sorted(starts):
 raw=va_to_raw(va)
 if raw is None or not(text['rawPointer']<=raw<text['rawPointer']+text['rawSize']): continue
 n=min(4096,text['rawPointer']+text['rawSize']-raw); wins.append({'startVa':va,'startRaw':raw,'size':n,'hex':b[raw:raw+n].hex()})
summary={'status':'PATCH_FLOW_CALLERS_AND_WINDOWS_MAPPED','imageBase':imagebase,'stringTargets':rows,'helperCallers':helperRows,'windowCount':len(wins),'windowStarts':[w['startVa'] for w in wins]}
(out/'v14-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'v14-function-windows.json').write_text(json.dumps(wins,ensure_ascii=False),encoding='utf-8')
with (out/'v14-callers.txt').open('w',encoding='utf-8') as f:
 for r in rows:
  f.write(f"\n[{r['target']}] VA=0x{r['va']:08X} xrefs={len(r['xrefs'])}\n")
  for x in r['xrefs']: f.write(f"  code=0x{x['codeVa']:08X} prologue={('0x%08X'%x['nearestPrologueVa']) if x['nearestPrologueVa'] else 'none'}\n")
 f.write('\n[helper callers]\n')
 for h in helperRows:
  f.write(f"helper 0x{h['helperVa']:08X} callers={len(h['callers'])}\n")
  for x in h['callers'][:100]: f.write(f"  call=0x{x['callVa']:08X} prologue={('0x%08X'%x['nearestPrologueVa']) if x['nearestPrologueVa'] else 'none'}\n")
print(json.dumps({'status':summary['status'],'windowCount':len(wins)},ensure_ascii=True))
'@|Set-Content (Join-Path $root 'trace.py') -Encoding UTF8
python (Join-Path $root 'trace.py') $pg $report
if($LASTEXITCODE -ne 0){throw 'patch flow mapper failed'}

# Code-derived endpoint proof only: 0x449F10 constructs AutoPatch + AutoPatch.ini,
# and 0x449FA0 passes that relative path with updateURI to the download service.
$targets=@(
  'http://mhmnzupdate.zlongame.com/MHMNZ/AutoPatch/AutoPatch.ini',
  'http://mhmnzupdatebak.zlongame.com/MHMNZ/AutoPatch/AutoPatch.ini'
)
$results=@()
$i=0
foreach($u in $targets){
  $i++
  $body=Join-Path $report ("autopatch-{0}.body" -f $i)
  $headers=Join-Path $report ("autopatch-{0}.headers.txt" -f $i)
  $code=& curl.exe -L --silent --show-error --http1.1 -A $ua -H 'Accept-Encoding: identity' --max-filesize 1048576 -D $headers -o $body -w '%{http_code}' $u
  $exit=$LASTEXITCODE
  $len=if(Test-Path $body){(Get-Item $body).Length}else{0}
  $results += [pscustomobject]@{url=$u;curlExit=$exit;httpCode="$code";bytes=$len}
  if($len -gt 0 -and $len -le 1048576){
    try { Get-Content $body -Raw -ErrorAction Stop | Set-Content (Join-Path $report ("autopatch-{0}.txt" -f $i)) -Encoding UTF8 } catch {}
  }
}
$results|ConvertTo-Json -Depth 4|Set-Content (Join-Path $report 'autopatch-endpoint-proof.json') -Encoding UTF8
$results|Format-Table -AutoSize|Out-String|Write-Host
Remove-Item $pg,(Join-Path $root 'trace.py') -Force -ErrorAction SilentlyContinue
