$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=Join-Path $env:RUNNER_TEMP 'langrisser-launcher-probe-v14'
$report=Join-Path $root 'report'
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
text=next(s for s in secs if s['name']=='.text')
text_bytes=b[text['rawPointer']:text['rawPointer']+text['rawSize']]

def raw_to_rva(raw):
 for s in secs:
  if s['rawPointer']<=raw<s['rawPointer']+s['rawSize']:
   return s['virtualAddress']+(raw-s['rawPointer'])
 return None

def text_raw_to_va(raw): return imagebase + text['virtualAddress'] + (raw-text['rawPointer'])

def find_prologue(abs_raw,max_back=1024):
 lo=max(text['rawPointer'],abs_raw-max_back); chunk=b[lo:abs_raw]
 patterns=[b'\x55\x8b\xec',b'\x55\x89\xe5',b'\x53\x8b\xdc']
 best=None
 for pat in patterns:
  pos=chunk.rfind(pat)
  if pos>=0:
   cand=lo+pos
   if best is None or cand>best: best=cand
 return best

def nearby_rel_calls(abs_raw, radius=160):
 lo=max(text['rawPointer'],abs_raw-radius); hi=min(text['rawPointer']+text['rawSize'],abs_raw+radius)
 out=[]; i=lo
 while i+5<=hi:
  op=b[i]
  if op==0xE8:
   rel=struct.unpack_from('<i',b,i+1)[0]; srcva=text_raw_to_va(i); dest=srcva+5+rel
   out.append({'raw':i,'va':srcva,'destVa':dest,'deltaFromXref':i-abs_raw})
   i+=5
  else:i+=1
 return out

def classify_ref(abs_raw):
 rel=abs_raw-text['rawPointer']
 prev=text_bytes[max(0,rel-8):rel]
 cls=[]
 # Immediate address starts at abs_raw. Common x86 forms using imm32.
 if rel>=1 and text_bytes[rel-1]==0x68: cls.append('push imm32')
 if rel>=1 and 0xB8<=text_bytes[rel-1]<=0xBF: cls.append('mov reg, imm32')
 if rel>=2 and text_bytes[rel-2] in (0xC7,): cls.append('mov r/m32, imm32 (possible)')
 if rel>=2 and text_bytes[rel-2] in (0x81,): cls.append('alu r/m32, imm32 (possible)')
 if rel>=2 and text_bytes[rel-2] in (0xA1,0xA3): cls.append('moffs address (possible)')
 return cls or ['embedded imm32 / opcode needs disassembly']

targets={
 'sAutoPatch/':0x314CD6,
 'uAutoPatch':0x3136BA,
 'AutoPatch.ini':0x3136D0,
 'patchinfo_%s_%s.ini':0x3135D8,
 'intallinfo_%s.ini':0x3139E8,
 'download.bin':0x315344,
 'GameInfo.ini_utf16_1':0x30CD20,
 'GameInfo.ini_utf16_2':0x30CEF4,
 'GameInfo.ini_ascii_1':0x310780,
 'updateURI':0x311704,
}
res=[]
for name,raw in targets.items():
 rva=raw_to_rva(raw); va=imagebase+rva if rva is not None else None
 needle=struct.pack('<I',va) if va is not None else b''
 start=0; hits=[]
 while needle:
  pos=text_bytes.find(needle,start)
  if pos<0: break
  abs_raw=text['rawPointer']+pos; codeva=text_raw_to_va(abs_raw); pro=find_prologue(abs_raw)
  hits.append({
   'codeRaw':abs_raw,'codeVa':codeva,'deltaToStringRaw':raw-abs_raw,
   'classification':classify_ref(abs_raw),
   'nearestPrologueRaw':pro,'nearestPrologueVa':(text_raw_to_va(pro) if pro is not None else None),
   'bytesBeforeHex':b[max(text['rawPointer'],abs_raw-48):abs_raw].hex(' '),
   'bytesAtAfterHex':b[abs_raw:min(len(b),abs_raw+68)].hex(' '),
   'nearbyCalls':nearby_rel_calls(abs_raw),
  })
  start=pos+1
 res.append({'target':name,'stringRaw':raw,'stringRva':rva,'stringVa':va,'xrefCount':len(hits),'xrefs':hits})
summary={'status':'PGLAUNCHER_PROTOCOL_CODE_XREFS_MAPPED','imageBase':imagebase,'text':text,'targetCount':len(res),'totalXrefs':sum(x['xrefCount'] for x in res),'targets':[{k:v for k,v in x.items() if k!='xrefs'} for x in res]}
(out/'v14-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
(out/'v14-xrefs.json').write_text(json.dumps(res,ensure_ascii=False,indent=2),encoding='utf-8')
with (out/'v14-xrefs.txt').open('w',encoding='utf-8') as f:
 for t in res:
  f.write(f"\n=== {t['target']} stringVA=0x{t['stringVa']:08X} xrefs={t['xrefCount']} ===\n")
  for i,x in enumerate(t['xrefs'],1):
   f.write(f"[{i}] codeVA=0x{x['codeVa']:08X} raw=0x{x['codeRaw']:X} class={'; '.join(x['classification'])} prologueVA={('0x%08X'%x['nearestPrologueVa']) if x['nearestPrologueVa'] else 'none'}\n")
   f.write(f"    before: {x['bytesBeforeHex']}\n    at+: {x['bytesAtAfterHex']}\n")
   if x['nearbyCalls']:
    f.write('    calls: '+', '.join(f"0x{c['va']:08X}->0x{c['destVa']:08X}({c['deltaFromXref']:+d})" for c in x['nearbyCalls'])+'\n')
print(json.dumps(summary,ensure_ascii=True))
'@|Set-Content (Join-Path $root 'xref.py') -Encoding UTF8
python (Join-Path $root 'xref.py') $pg $report
if($LASTEXITCODE -ne 0){throw 'xref mapper failed'}
Get-Content (Join-Path $report 'v14-summary.json') -Raw|Write-Host
Get-Content (Join-Path $report 'v14-xrefs.txt')|Select-Object -First 1200|Write-Host
Remove-Item $pg,(Join-Path $root 'xref.py') -Force -ErrorAction SilentlyContinue
