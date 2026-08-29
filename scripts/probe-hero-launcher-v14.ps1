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
def find_prologue(abs_raw,max_back=16384):
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
  outx.append({'codeRaw':raw,'codeVa':text_raw_to_va(raw),'nearestPrologueVa':text_raw_to_va(pro) if pro is not None else None})
  start=pos+1
 return outx
# Raw offsets frozen from v13 string map. Resolve through PE sections rather than assuming a delta.
targets={
 'PatchInfoTempName':0x320368,
 'CyPtCryptCpp':0x32053C,
 'SpecialFileHeader':0x32054C,
 'DecryptLoadFailed':0x32055C,
 'DecryptSkip':0x32058C,
 'DecryptStart':0x3205C0,
 'DecryptFunctionName':0x3205E0,
 'DecryptCrcMismatch':0x3205FC,
 'DecryptOk':0x320638,
 'DecryptSaveFailed':0x32066C,
 'DecryptChecksumFailed':0x3206A8,
}
rows=[]; starts=set()
for name,raw in targets.items():
 rva=raw_to_rva(raw); va=imagebase+rva if rva is not None else None
 xs=imm_xrefs(va) if va is not None else []
 rows.append({'target':name,'raw':raw,'rva':rva,'va':va,'xrefs':xs})
 for x in xs:
  if x['nearestPrologueVa']: starts.add(x['nearestPrologueVa'])
# Keep only small code windows around proven xref-owning functions.
wins=[]
for va in sorted(starts):
 raw=va_to_raw(va)
 if raw is None: continue
 n=min(24576,text['rawPointer']+text['rawSize']-raw)
 wins.append({'startVa':va,'startRaw':raw,'size':n,'hex':b[raw:raw+n].hex()})
summary={'status':'CYPTCRYPT_XREFS_MAPPED','imageBase':imagebase,'targets':rows,'windowCount':len(wins),'windowStarts':[w['startVa'] for w in wins]}
(out/'crypt-xrefs.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'crypt-function-windows.json').write_text(json.dumps(wins),encoding='utf-8')
with (out/'crypt-xrefs.txt').open('w',encoding='utf-8') as f:
 for r in rows:
  f.write(f"[{r['target']}] raw=0x{r['raw']:X} va={(f'0x{r[\"va\"]:08X}' if r['va'] is not None else 'none')} xrefs={len(r['xrefs'])}\n")
  for x in r['xrefs']: f.write(f"  code=0x{x['codeVa']:08X} prologue={(f'0x{x[\"nearestPrologueVa\"]:08X}' if x['nearestPrologueVa'] else 'none')}\n")
print(json.dumps({'status':summary['status'],'windowCount':len(wins),'targets':[{'name':r['target'],'xrefs':len(r['xrefs'])} for r in rows]}))
'@|Set-Content (Join-Path $root 'tracecrypt.py') -Encoding UTF8
python (Join-Path $root 'tracecrypt.py') $pg $report
if($LASTEXITCODE -ne 0){throw 'CyPtCrypt xref mapper failed'}
Get-Content (Join-Path $report 'crypt-xrefs.txt') -Raw|Write-Host
Remove-Item $pg,(Join-Path $root 'tracecrypt.py') -Force -ErrorAction SilentlyContinue
