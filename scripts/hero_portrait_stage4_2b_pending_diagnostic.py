#!/usr/bin/env python3
import json,re
from collections import defaultdict,Counter
from pathlib import Path

def st(p):
    n=Path(p).name
    if n.lower().endswith('.prefab'): n=n[:-7]
    return re.sub(r'(?i)_prefab$','',n)
repo=Path('.')
reg=json.loads((repo/'data/generated/hero-portrait-stage4-2-fallback-admission.v1.json').read_text())
art=json.loads((repo/'data/generated/hero-card-artwork-stage4.v1.json').read_text())
inv=json.loads((repo/'data/generated/skin-stage3-1-asset-inventory.v1.json').read_text())
gap=json.loads((repo/'data/validation/hero-portrait-stage4-2-gap-inventory.v1.json').read_text())
known=json.loads((repo/'data/validation/hero-portrait-stage4-2-known-ownership-rescue.v1.json').read_text())
adm={int(r['heroId']) for r in reg['records']}
art_by={int(r['heroId']):r for r in art['records']}; pending=sorted(set(art_by)-adm)
skins=defaultdict(list)
for r in inv['records']: skins[int(r['heroId'])].append(r)
known_state={int(r['heroId']):r['result'] for r in known['records']}
ownership=set(gap['structuredOwnershipProvenPendingHeroIds'])
rows=[]; counts=Counter()
for h in pending:
    ss=sorted({st(r['spine']['sourceSpinePath']) for r in skins[h] if r.get('spine',{}).get('sourceSpinePath')})
    if h in known_state: blocker='KNOWN_OWNERSHIP_'+known_state[h]
    elif h in ownership: blocker='STRUCTURED_OWNERSHIP_PROVEN'
    elif h in gap['pendingWithoutAuthoritativeStructuredOwnershipHeroIds']: blocker='NO_AUTHORITATIVE_STRUCTURED_OWNERSHIP'
    else: blocker='OTHER'
    counts[blocker]+=1
    rows.append({'heroId':h,'sourceArtworkPath':art_by[h]['sourceArtworkPath'],'skinRecordCount':len(skins[h]),'uniqueRuntimeStemCount':len(ss),'runtimeStems':ss,'blocker':blocker})
out={'version':1,'summary':{'pendingCount':len(rows),'zeroSkinRecordCount':sum(1 for r in rows if r['skinRecordCount']==0),'zeroRuntimeStemCount':sum(1 for r in rows if r['uniqueRuntimeStemCount']==0),'blockerCounts':dict(counts)},'records':rows}
(repo/'data/validation/hero-portrait-stage4-2b-pending-diagnostic.v1.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(out['summary'],ensure_ascii=False,indent=2))
