#!/usr/bin/env python3
import hashlib, json, re, struct, urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/validation/hero-portrait-stage4-2c-embedded-pe-identity-probe.v1.json'
URL='https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe'
CANDIDATES=[
 {'offset':305299940,'size':348672},
 {'offset':305660836,'size':2440192},
]

def rng(start,size):
 req=urllib.request.Request(URL,headers={'User-Agent':'Mozilla/5.0','Range':f'bytes={start}-{start+size-1}','Accept':'*/*'})
 with urllib.request.urlopen(req,timeout=45) as r:
  return r.read(size)

def strings(data):
 vals=[]
 for m in re.finditer(rb'[\x20-\x7e]{4,}',data):
  s=m.group(0).decode('ascii','replace')
  if s not in vals: vals.append(s)
 for m in re.finditer(rb'(?:[\x20-\x7e]\x00){4,}',data):
  s=m.group(0).decode('utf-16le','replace')
  if s not in vals: vals.append(s)
 return vals

records=[]
for c in CANDIDATES:
 data=rng(c['offset'],c['size'])
 ss=strings(data)
 ident=[s for s in ss if re.search(r'PGUpdate|PGLauncher|Langrisser|MHMNZ|zlong|OriginalFilename|FileDescription|ProductName|CompanyName|FileVersion|ProductVersion|\.exe$|updateURI|installURI|repairURI|patch|manifest|filelist|version|https?://',s,re.I)]
 urls=[]
 for s in ss:
  for u in re.findall(r'https?://[^\s\"\'<>\x00]+',s,re.I):
   u=u.rstrip(');,]}>')
   if u not in urls: urls.append(u)
 records.append({
  **c,'sha256':hashlib.sha256(data).hexdigest(),'md5':hashlib.md5(data).hexdigest(),
  'mzSignature':data[:2]==b'MZ','identityStrings':ident[:400],'urls':urls[:200],
  'containsPGUpdate':any('PGUpdate' in s for s in ss),
  'containsPGLauncher':any('PGLauncher' in s for s in ss),
  'containsMhmnzUpdate':any('mhmnzupdate' in s.lower() for s in ss),
 })
out={'version':1,'stage':'hero-portrait-stage4-2c-current-unity-source-proof','phase':'OFFICIAL_LAUNCHER_EMBEDDED_PE_IDENTITY_PROBE','status':'PASS','sourceUrl':URL,'summary':{'candidateCount':len(records),'pgUpdateMatchCount':sum(r['containsPGUpdate'] for r in records),'pgLauncherMatchCount':sum(r['containsPGLauncher'] for r in records),'mhmnzUpdateMatchCount':sum(r['containsMhmnzUpdate'] for r in records)},'records':records,'policy':{'fullLauncherDownloadPerformed':False,'exactEmbeddedPeRangesOnly':True,'totalEmbeddedBytesRead':sum(c['size'] for c in CANDIDATES),'fullClientDownloadPerformed':False}}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(out['summary'],ensure_ascii=False,indent=2))
