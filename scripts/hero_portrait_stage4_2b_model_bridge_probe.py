#!/usr/bin/env python3
import json,re
from pathlib import Path
from collections import defaultdict
root=Path('.')
def load(p): return json.loads((root/p).read_text())
def rid(r): return r.get('ID',r.get('Id',r.get('id')))
def strings(v):
 out=[]
 if isinstance(v,str): out.append(v)
 elif isinstance(v,list):
  for x in v: out+=strings(x)
 elif isinstance(v,dict):
  for x in v.values(): out+=strings(x)
 return out
def tok(s):
 n=Path(s.replace('\\','/')).name
 for ext in ['.prefab','.asset','.png']:
  if n.lower().endswith(ext): n=n[:-len(ext)]
 return re.sub(r'(?i)_prefab$','',n)
hero=load('data/configdata/ConfigDataHeroInfo.json'); jobs=load('data/configdata/ConfigDataJobConnectionInfo.json'); models=load('data/configdata/ConfigDataModelSkinResourceInfo.json')
reg=load('data/generated/hero-portrait-stage4-2b-237-admission.v1.json'); sd=load('data/validation/hero-portrait-stage4-2b-sd-bulk-bridge.v1.json')
H={int(rid(r)):r for r in hero if rid(r) is not None}; J={int(rid(r)):r for r in jobs if rid(r) is not None}; M={int(rid(r)):r for r in models if rid(r) is not None}; admitted={int(r['heroId']) for r in reg['records']}; pending=sorted(set(H)-admitted)
# canonical only: intersect source registry universe by HeroPainting stage file
art=load('data/generated/hero-card-artwork-stage4.v1.json'); canon={int(r['heroId']) for r in art['records']};pending=sorted(canon-admitted)
hero_tokens={}
for h in pending:
 hr=H[h]; jids=[]
 for k in ('JobConnection_ID','UseableJobConnections_ID'):
  v=hr.get(k)
  if isinstance(v,int):jids.append(v)
  elif isinstance(v,list):jids += [x for x in v if isinstance(x,int)]
 raw=[]; modelrefs=[]
 for jid in sorted(set(jids)):
  jr=J.get(jid)
  if not jr: continue
  for k in ('Model','CombatModel'):
   v=jr.get(k)
   raw += strings(v)
   if isinstance(v,int) and v in M:modelrefs.append(v)
 # include any model resource references visible anywhere in matching J row conservatively, but only explicit int->M IDs
 for jid in sorted(set(jids)):
  jr=J.get(jid)
  if not jr:continue
  for k,v in jr.items():
   if isinstance(v,int) and v in M and any(x in k.lower() for x in ('model','resource','skin')):modelrefs.append(v)
 for mid in sorted(set(modelrefs)):
  mr=M[mid]
  for k in ('Model','CombatModel'):raw += strings(mr.get(k))
 ts=sorted({tok(x) for x in raw if x})
 hero_tokens[h]={'jobConnectionIds':sorted(set(jids)),'foundJobConnectionIds':sorted(j for j in set(jids) if j in J),'modelResourceIds':sorted(set(modelrefs)),'modelTokens':ts,'rawModelStrings':sorted(set(raw))}
exceptions=[r for r in sd['records'] if r['result']=='NO_PENDING_BASE_RUNTIME_MATCH_IN_SD']
records=[]
for e in exceptions:
 matches=[]
 for h,info in hero_tokens.items():
  hits=[]
  for f in e.get('sdFiles',[]):
   fn=f['fileName']
   for t in info['modelTokens']:
    if t and (fn==t or fn.startswith(t+'_') or fn.startswith(t+'.')):hits.append({'modelToken':t,'fileName':fn,'driveFileId':f['driveFileId']})
  if hits:matches.append({'heroId':h,'hits':hits,'modelInfo':info})
 records.append({'driveGroupPath':e['driveGroupPath'],'frozenGroupLabel':e['frozenGroupLabel'],'sdFolderId':e.get('sdFolderId'),'sdFiles':e.get('sdFiles',[]),'pendingModelMatches':matches,'matchHeroCount':len(matches),'result':'UNIQUE_PENDING_MODEL_MATCH' if len(matches)==1 else ('NO_PENDING_MODEL_MATCH' if not matches else 'MULTIPLE_PENDING_MODEL_MATCHES')})
out={'version':1,'stage':'hero-portrait-stage4-2b-explicit-fallback-source-acquisition','phase':'JOB_MODEL_SD_BRIDGE_PROBE','status':'PASS_WITH_REVIEW','policy':{'heroJoin':'HeroInfo explicit JobConnection_ID/UseableJobConnections_ID only','jobJoin':'JobConnectionInfo.ID exact only','modelJoin':'explicit JobConnection integer field -> ModelSkinResourceInfo.ID only','folderLabelsUsedForOwnership':False,'sourceAdmissionPerformed':False},'summary':{'pendingCanonicalCount':len(pending),'pendingWithFoundJobConnectionCount':sum(bool(x['foundJobConnectionIds']) for x in hero_tokens.values()),'pendingWithModelTokensCount':sum(bool(x['modelTokens']) for x in hero_tokens.values()),'inputNoSdRuntimeMatchGroupCount':len(records),'uniquePendingModelMatchGroupCount':sum(r['matchHeroCount']==1 for r in records),'zeroPendingModelMatchGroupCount':sum(r['matchHeroCount']==0 for r in records),'multiplePendingModelMatchGroupCount':sum(r['matchHeroCount']>1 for r in records)},'records':records,'pendingHeroModelDiagnostics':hero_tokens}
(root/'data/validation/hero-portrait-stage4-2b-model-bridge-probe.v1.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(out['summary'],ensure_ascii=False,indent=2))
