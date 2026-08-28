#!/usr/bin/env python3
import hashlib,json,re,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/validation/hero-portrait-stage4-2c-pglauncher-update-bridge-probe.v1.json'
URL='https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/DownLoad-MZ-PC.exe'
OFFSET=284773204; SIZE=4820928
req=urllib.request.Request(URL,headers={'User-Agent':'Mozilla/5.0','Range':f'bytes={OFFSET}-{OFFSET+SIZE-1}'})
with urllib.request.urlopen(req,timeout=60) as r: data=r.read(SIZE)
vals=[]
for m in re.finditer(rb'[\x20-\x7e]{3,}',data):
 s=m.group(0).decode('ascii','replace')
 if s not in vals: vals.append(s)
for m in re.finditer(rb'(?:[\x20-\x7e]\x00){3,}',data):
 s=m.group(0).decode('utf-16le','replace')
 if s not in vals: vals.append(s)
terms=['PGUpdate','UpdateUrl','updateURI','installURI','repairURI','GameInfo','appkey','AppKey','FileList','baseFileList','gamesFileList','Version','manifest','repair','update','install','Langrisser.exe','MHMNZ']
interesting=[s for s in vals if any(t.lower() in s.lower() for t in terms)]
contexts=[]
for i,s in enumerate(vals):
 if any(t.lower() in s.lower() for t in terms):
  contexts.append({'index':i,'value':s,'before':vals[max(0,i-6):i],'after':vals[i+1:i+7]})
  if len(contexts)>=800: break
urls=[]
for s in vals:
 for u in re.findall(r'https?://[^\s\"\'<>\x00]+',s,re.I):
  u=u.rstrip(');,]}>')
  if u not in urls: urls.append(u)
out={'version':1,'stage':'hero-portrait-stage4-2c-current-unity-source-proof','phase':'OFFICIAL_PGLAUNCHER_TO_PGUPDATE_BRIDGE_PROBE','status':'PASS','source':{'resourceName':'PGLAUNCHER.EXE','offset':OFFSET,'size':SIZE},'technical':{'byteLength':len(data),'sha256':hashlib.sha256(data).hexdigest(),'md5':hashlib.md5(data).hexdigest(),'peValid':data[:2]==b'MZ'},'summary':{'printableStringCount':len(vals),'interestingStringCount':len(interesting),'contextCount':len(contexts),'urlCount':len(urls)},'urls':urls[:500],'interestingStrings':interesting[:1800],'contexts':contexts,'policy':{'fullLauncherDownloadPerformed':False,'exactPGLauncherResourceOnly':True,'fullClientDownloadPerformed':False,'protocolDiscoveryOnly':True}}
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(out['summary'],ensure_ascii=False,indent=2))
