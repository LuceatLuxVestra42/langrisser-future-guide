#!/usr/bin/env python3
import hashlib
import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/validation/hero-portrait-stage4-2c-update-server-probe.v1.json'
ROOTS=[
 'http://mhmnzupdate.zlongame.com/MHMNZ',
 'http://mhmnzupdatebak.zlongame.com/MHMNZ',
]
# Bounded discovery set. Names come from launcher/update terminology only;
# hits are discovery evidence, not source admission evidence.
CANDIDATES=[
 '', '/',
 'version','version.txt','Version.txt','version.json','Version.json','version.xml','version.ini',
 'filelist','filelist.txt','filelist.json','FileList.json','fileList.json',
 'manifest','manifest.json','Manifest.json','manifest.xml',
 'update.json','update.xml','update.ini','patch.json','patchlist.txt','patchlist.json',
 'baseFileList.json',
 'Client/version.txt','Client/version.json','Client/filelist.json','Client/FileList.json',
 'Client/manifest.json','Client/update.json','Client/patchlist.txt',
 'client/version.txt','client/version.json','client/filelist.json','client/manifest.json',
]

def probe(url):
    req=urllib.request.Request(url,headers={
        'User-Agent':'Mozilla/5.0',
        'Range':'bytes=0-65535',
        'Accept':'*/*',
    })
    try:
        with urllib.request.urlopen(req,timeout=20) as r:
            body=r.read(65536)
            ctype=r.headers.get('Content-Type')
            clen=r.headers.get('Content-Length')
            text=body.decode('utf-8',errors='replace')
            preview=''.join(ch if ch in '\r\n\t' or 32 <= ord(ch) < 127 or ord(ch) >= 0x80 else ' ' for ch in text[:4000])
            return {
                'ok':True,'status':getattr(r,'status',200),'finalUrl':r.geturl(),
                'contentType':ctype,'contentLengthHeader':clen,'sampleByteLength':len(body),
                'sampleSha256':hashlib.sha256(body).hexdigest(),
                'preview':preview,
            }
    except urllib.error.HTTPError as e:
        body=e.read(4096)
        return {'ok':False,'status':e.code,'finalUrl':e.geturl(),'contentType':e.headers.get('Content-Type'),'sampleByteLength':len(body),'preview':body.decode('utf-8',errors='replace')[:1200]}
    except Exception as e:
        return {'ok':False,'error':type(e).__name__+': '+str(e)}

records=[]
for root in ROOTS:
    for rel in CANDIDATES:
        url=root.rstrip('/')+'/' + rel.lstrip('/') if rel else root
        result=probe(url)
        records.append({'root':root,'relativePath':rel,'url':url,**result})

hits=[r for r in records if r.get('ok') and r.get('status') in (200,206)]
out={
 'version':1,
 'stage':'hero-portrait-stage4-2c-current-unity-source-proof',
 'phase':'OFFICIAL_UPDATE_SERVER_BOUNDED_MANIFEST_DISCOVERY',
 'status':'PASS',
 'policy':{
   'launcherRediscoveryPerformed':False,
   'fullClientDownloadPerformed':False,
   'boundedCandidateProbeOnly':True,
   'discoveryHitIsNotSourceAdmission':True,
 },
 'roots':ROOTS,
 'summary':{
   'candidateRequestCount':len(records),
   'httpSuccessCount':len(hits),
   'distinctSuccessfulRelativePaths':sorted(set(r['relativePath'] for r in hits)),
 },
 'hits':hits,
 'records':records,
}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(out['summary'],ensure_ascii=False,indent=2))
