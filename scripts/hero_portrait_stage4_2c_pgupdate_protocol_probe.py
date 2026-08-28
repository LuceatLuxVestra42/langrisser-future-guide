#!/usr/bin/env python3
import hashlib, json, re, struct, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/validation/hero-portrait-stage4-2c-pgupdate-protocol-probe.v1.json'
URL='https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe'
OFFSET=293352148
SIZE=3528640

def fetch():
 req=urllib.request.Request(URL,headers={'User-Agent':'Mozilla/5.0','Range':f'bytes={OFFSET}-{OFFSET+SIZE-1}','Accept':'*/*'})
 with urllib.request.urlopen(req,timeout=60) as r:
  return r.read(SIZE), {'status':getattr(r,'status',200),'contentRange':r.headers.get('Content-Range'),'contentLength':r.headers.get('Content-Length')}

data,http=fetch()
vals=[]
for m in re.finditer(rb'[\x20-\x7e]{4,}',data):
 s=m.group(0).decode('ascii','replace')
 if s not in vals: vals.append(s)
for m in re.finditer(rb'(?:[\x20-\x7e]\x00){4,}',data):
 s=m.group(0).decode('utf-16le','replace')
 if s not in vals: vals.append(s)

pat=re.compile(r'https?://|ftp://|manifest|version|filelist|file.?list|patch|update|repair|install|md5|sha|\.json|\.xml|\.ini|\.txt|\.zip|\.7z|\.pak|\.dat|cdn|server|URI|download|Langrisser|MHMNZ|PGUpdate|PGLauncher|Client\\',re.I)
interesting=[s for s in vals if pat.search(s)]
urls=[]
for s in vals:
 for u in re.findall(r'https?://[^\s\"\'<>\x00]+',s,re.I):
  u=u.rstrip(');,]}>')
  if u not in urls: urls.append(u)
# Focused terms with nearby printable-string context (string-list neighborhood, not raw bytes).
terms=['update','version','filelist','manifest','patch','repair','md5','download','baseFileList','updateURI','installURI','repairURI']
contexts=[]
for i,s in enumerate(vals):
 if any(t.lower() in s.lower() for t in terms):
  contexts.append({'index':i,'value':s,'before':vals[max(0,i-3):i],'after':vals[i+1:i+4]})
  if len(contexts)>=500: break
# Basic PE identity.
pe_valid=data[:2]==b'MZ'
pe_meta={}
if pe_valid:
 e=struct.unpack_from('<I',data,0x3c)[0]
 if e+24<len(data) and data[e:e+4]==b'PE\0\0':
  pe_meta={'e_lfanew':e,'machine':hex(struct.unpack_from('<H',data,e+4)[0]),'sections':struct.unpack_from('<H',data,e+6)[0]}
out={'version':1,'stage':'hero-portrait-stage4-2c-current-unity-source-proof','phase':'OFFICIAL_PGUPDATE_PROTOCOL_PROBE','status':'PASS','source':{'launcherUrl':URL,'resourceName':'PGUPDATE.EXE','resourceOffset':OFFSET,'resourceSize':SIZE},'http':http,'technical':{'byteLength':len(data),'sha256':hashlib.sha256(data).hexdigest(),'md5':hashlib.md5(data).hexdigest(),'peValid':pe_valid,**pe_meta},'summary':{'printableStringCount':len(vals),'interestingStringCount':len(interesting),'urlCount':len(urls),'contextCount':len(contexts)},'urls':urls[:400],'interestingStrings':interesting[:1500],'contexts':contexts,'policy':{'fullLauncherDownloadPerformed':False,'exactPGUpdateResourceOnly':True,'fullClientDownloadPerformed':False,'protocolDiscoveryOnly':True}}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(out['summary'],ensure_ascii=False,indent=2))
