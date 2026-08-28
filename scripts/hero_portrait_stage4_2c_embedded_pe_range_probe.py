#!/usr/bin/env python3
import json, re, struct, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/validation/hero-portrait-stage4-2c-embedded-pe-range-probe.v1.json'
URL='https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe'
TOTAL=308744656
TAIL_START=304550352
TAIL_END=308744655

def rng(start,end):
    req=urllib.request.Request(URL,headers={'User-Agent':'Mozilla/5.0','Range':f'bytes={start}-{end}','Accept':'*/*'})
    with urllib.request.urlopen(req,timeout=30) as r:
        return r.read(end-start+1)

def pe_meta_at(abs_off):
    # Header-only validation first.
    b=rng(abs_off,min(TOTAL-1,abs_off+65535))
    if len(b)<64 or b[:2]!=b'MZ': return None
    e=struct.unpack_from('<I',b,0x3c)[0]
    if e>0x8000 or e+24>len(b) or b[e:e+4]!=b'PE\0\0': return None
    machine,nsec=struct.unpack_from('<HH',b,e+4)
    optsz=struct.unpack_from('<H',b,e+20)[0]
    opt=e+24
    if opt+optsz>len(b): return None
    magic=struct.unpack_from('<H',b,opt)[0]
    sec0=opt+optsz
    sections=[]; max_end=0
    for i in range(nsec):
        p=sec0+i*40
        if p+40>len(b): break
        name=b[p:p+8].split(b'\0',1)[0].decode('ascii','replace')
        raw_size=struct.unpack_from('<I',b,p+16)[0]
        raw_ptr=struct.unpack_from('<I',b,p+20)[0]
        max_end=max(max_end,raw_ptr+raw_size)
        sections.append({'name':name,'rawPointer':raw_ptr,'rawSize':raw_size,'rawEnd':raw_ptr+raw_size})
    # Read bounded first/last samples of embedded PE to identify names/version/config strings.
    first=b
    last=b''
    if 0 < max_end <= 128*1024*1024:
        last_start=abs_off+max(0,max_end-65536)
        if last_start < TOTAL:
            last=rng(last_start,min(TOTAL-1,last_start+65535))
    sample=first+last
    strings=[]
    for m in re.finditer(rb'[\x20-\x7e]{5,}',sample):
        s=m.group(0).decode('ascii','replace')
        if re.search(r'PGUpdate|Langrisser|MHMNZ|ProductName|FileDescription|OriginalFilename|\.exe|update|patch|version|zlong',s,re.I):
            if s not in strings: strings.append(s)
    for m in re.finditer(rb'(?:[\x20-\x7e]\x00){5,}',sample):
        s=m.group(0).decode('utf-16le','replace')
        if re.search(r'PGUpdate|Langrisser|MHMNZ|ProductName|FileDescription|OriginalFilename|\.exe|update|patch|version|zlong',s,re.I):
            if s not in strings: strings.append(s)
    return {'absoluteOffset':abs_off,'machine':hex(machine),'numberOfSections':nsec,'optionalMagic':hex(magic),'estimatedPeRawSize':max_end,'sections':sections,'identityStrings':strings[:80]}

# Re-read only tail 4 MiB; discover every MZ and validate actual PE headers.
tail=rng(TAIL_START,TAIL_END)
mz=[]; pos=0
while True:
    j=tail.find(b'MZ',pos)
    if j<0: break
    mz.append(TAIL_START+j); pos=j+2
valid=[]
for off in mz:
    try:
        meta=pe_meta_at(off)
        if meta: valid.append(meta)
    except Exception as e:
        valid.append({'absoluteOffset':off,'probeError':type(e).__name__+': '+str(e)})

out={
 'version':1,'stage':'hero-portrait-stage4-2c-current-unity-source-proof','phase':'OFFICIAL_LAUNCHER_EMBEDDED_PE_RANGE_PROBE','status':'PASS',
 'sourceUrl':URL,
 'summary':{'tailByteLength':len(tail),'mzMarkerCount':len(mz),'validEmbeddedPeCount':sum(1 for r in valid if 'numberOfSections' in r),'identityBearingPeCount':sum(1 for r in valid if r.get('identityStrings'))},
 'validEmbeddedPeCandidates':valid,
 'policy':{'fullLauncherDownloadPerformed':False,'rangeOnly':True,'tailScanBytes':len(tail),'perCandidateHeaderBytes':65536,'perCandidateTailBytesMax':65536,'fullClientDownloadPerformed':False}
}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(out['summary'],ensure_ascii=False,indent=2))
