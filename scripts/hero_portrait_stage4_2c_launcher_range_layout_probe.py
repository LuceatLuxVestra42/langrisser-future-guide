#!/usr/bin/env python3
import json, re, struct, urllib.request, urllib.error
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/validation/hero-portrait-stage4-2c-launcher-range-layout-probe.v1.json'
URL='https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe'
UA={'User-Agent':'Mozilla/5.0','Accept':'*/*'}

def get_range(start,end):
    h=dict(UA); h['Range']=f'bytes={start}-{end}'
    req=urllib.request.Request(URL,headers=h)
    with urllib.request.urlopen(req,timeout=30) as r:
        body=r.read(end-start+1)
        return {
            'status':getattr(r,'status',200), 'finalUrl':r.geturl(),
            'contentRange':r.headers.get('Content-Range'),
            'contentLength':r.headers.get('Content-Length'),
            'acceptRanges':r.headers.get('Accept-Ranges'), 'body':body,
        }

def total_from(resp):
    cr=resp.get('contentRange') or ''
    m=re.search(r'/([0-9]+)$',cr)
    if m: return int(m.group(1))
    cl=resp.get('contentLength')
    return int(cl) if cl and cl.isdigit() else None

def parse_pe(b):
    if len(b)<0x100 or b[:2]!=b'MZ': return {'valid':False}
    pe=struct.unpack_from('<I',b,0x3c)[0]
    if pe+24>len(b) or b[pe:pe+4]!=b'PE\0\0': return {'valid':False,'e_lfanew':pe}
    nsec=struct.unpack_from('<H',b,pe+6)[0]
    optsz=struct.unpack_from('<H',b,pe+20)[0]
    opt=pe+24
    magic=struct.unpack_from('<H',b,opt)[0]
    dd=opt+(112 if magic==0x20b else 96)
    cert_off=cert_size=0
    if dd+8*5<=len(b): cert_off,cert_size=struct.unpack_from('<II',b,dd+8*4)
    sec0=opt+optsz
    sections=[]; max_end=0
    for i in range(nsec):
        p=sec0+i*40
        if p+40>len(b): break
        name=b[p:p+8].split(b'\0',1)[0].decode('ascii','replace')
        raw_size=struct.unpack_from('<I',b,p+16)[0]
        raw_ptr=struct.unpack_from('<I',b,p+20)[0]
        end=raw_ptr+raw_size
        max_end=max(max_end,end)
        sections.append({'name':name,'rawPointer':raw_ptr,'rawSize':raw_size,'rawEnd':end})
    return {'valid':True,'e_lfanew':pe,'numberOfSections':nsec,'optionalMagic':hex(magic),'sections':sections,'maxSectionRawEnd':max_end,'certificateOffset':cert_off,'certificateSize':cert_size,'certificateEnd':cert_off+cert_size if cert_off else 0}

def scan(label,start,body):
    tokens=[b'PGUpdate.exe',b'baseFileList.json',b'dest\\PGUpdate.exe',b'updateURI',b'mhmnzupdate',b'MHMNZ',b'filelist',b'Langrisser.exe']
    hits=[]
    for tok in tokens:
        pos=0
        while True:
            j=body.find(tok,pos)
            if j<0: break
            lo=max(0,j-160); hi=min(len(body),j+len(tok)+400)
            ctx=body[lo:hi].decode('utf-8','replace').replace('\x00',' ')
            hits.append({'token':tok.decode('ascii','replace'),'absoluteOffset':start+j,'relativeOffset':j,'context':ctx})
            pos=j+1
            if sum(1 for x in hits if x['token']==tok.decode('ascii','replace'))>=8: break
    magic=[]
    sigs={b'PK\x03\x04':'ZIP_LOCAL',b'7z\xbc\xaf\x27\x1c':'7Z',b'Rar!\x1a\x07':'RAR',b'MZ':'MZ'}
    for sig,name in sigs.items():
        pos=0; count=0
        while True:
            j=body.find(sig,pos)
            if j<0: break
            magic.append({'type':name,'absoluteOffset':start+j,'relativeOffset':j})
            pos=j+1; count+=1
            if count>=20: break
    return {'label':label,'start':start,'byteLength':len(body),'tokenHits':hits,'magicHits':magic}

head=get_range(0,131071)
total=total_from(head)
pe=parse_pe(head['body'])
layout_end=max(pe.get('maxSectionRawEnd',0),pe.get('certificateEnd',0)) if pe.get('valid') else 0
windows=[]
if total:
    tail_start=max(0,total-4*1024*1024)
    tail=get_range(tail_start,total-1)
    windows.append(scan('tail4MiB',tail_start,tail['body']))
if layout_end and total and layout_end<total:
    ov_start=layout_end
    ov_end=min(total-1,ov_start+4*1024*1024-1)
    ov=get_range(ov_start,ov_end)
    windows.append(scan('overlayStart4MiB',ov_start,ov['body']))
# A small window before logical PE end can expose embedded file tables near the trailer.
if layout_end:
    s=max(0,layout_end-2*1024*1024); e=layout_end-1
    before=get_range(s,e)
    windows.append(scan('beforeLayoutEnd2MiB',s,before['body']))

out={
 'version':1,'stage':'hero-portrait-stage4-2c-current-unity-source-proof','phase':'OFFICIAL_LAUNCHER_HTTP_RANGE_LAYOUT_PROBE','status':'PASS',
 'sourceUrl':URL,
 'headResponse':{k:v for k,v in head.items() if k!='body'},
 'totalByteLength':total,'pe':pe,'logicalLayoutEnd':layout_end,
 'overlayByteLength':(total-layout_end) if total and layout_end else None,
 'windows':windows,
 'policy':{'fullLauncherDownloadPerformed':False,'httpRangeOnly':True,'maxRequestedWindowBytes':4*1024*1024,'fullClientDownloadPerformed':False}
}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'totalByteLength':total,'logicalLayoutEnd':layout_end,'overlayByteLength':out['overlayByteLength'],'windowHitCounts':[{'label':w['label'],'tokenHits':len(w['tokenHits']),'magicHits':len(w['magicHits'])} for w in windows]},ensure_ascii=False,indent=2))
