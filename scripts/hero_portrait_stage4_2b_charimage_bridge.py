#!/usr/bin/env python3
import json,re
from pathlib import Path
repo=Path('.')
def load(p): return json.loads((repo/p).read_text())
def rid(r): return r.get('ID',r.get('Id',r.get('id')))
def stem(p):
    n=Path(p).name
    if n.lower().endswith('.prefab'): n=n[:-7]
    return re.sub(r'(?i)_prefab$','',n)
art=load('data/generated/hero-card-artwork-stage4.v1.json')
hero=load('data/configdata/ConfigDataHeroInfo.json'); char=load('data/configdata/ConfigDataCharImageInfo.json')
reg=load('data/generated/hero-portrait-stage4-2-fallback-admission.v1.json')
H={int(rid(r)):r for r in hero if rid(r) is not None}; C={int(rid(r)):r for r in char if rid(r) is not None}
adm={int(r['heroId']) for r in reg['records']}
rows=[]
for a in art['records']:
    h=int(a['heroId']); hr=H.get(h,{}); cid=hr.get('CharImage_ID'); cr=C.get(int(cid)) if cid is not None else None
    rows.append({'heroId':h,'pending':h not in adm,'charImageId':cid,'charImageExists':cr is not None,'heroPainting':cr.get('HeroPainting') if cr else None,'frozenArtworkPath':a['sourceArtworkPath'],'heroPaintingParity':bool(cr and cr.get('HeroPainting')==a['sourceArtworkPath']),'baseSpinePath':cr.get('Spine') if cr else None,'baseRuntimeStem':stem(cr.get('Spine')) if cr and cr.get('Spine') else None})
summary={'canonicalHeroCount':len(rows),'charImageIdPresentCount':sum(r['charImageId'] is not None for r in rows),'charImageRecordFoundCount':sum(r['charImageExists'] for r in rows),'heroPaintingExactParityCount':sum(r['heroPaintingParity'] for r in rows),'baseSpinePresentCount':sum(bool(r['baseSpinePath']) for r in rows),'baseRuntimeStemPresentCount':sum(bool(r['baseRuntimeStem']) for r in rows),'pendingCount':sum(r['pending'] for r in rows),'pendingWithBaseRuntimeStemCount':sum(r['pending'] and bool(r['baseRuntimeStem']) for r in rows),'missingOrMismatchCount':sum(not (r['charImageExists'] and r['heroPaintingParity'] and r['baseRuntimeStem']) for r in rows)}
out={'version':1,'stage':'hero-portrait-stage4-2b-explicit-fallback-source-acquisition','phase':'CHARIMAGE_BASE_RUNTIME_BRIDGE_PROOF','status':'PASS' if summary['missingOrMismatchCount']==0 else 'PASS_WITH_REVIEW','policy':{'join':'HeroInfo.ID -> HeroInfo.CharImage_ID -> CharImageInfo.ID','heroPaintingParityComparedToFrozenArtworkLocator':True,'filenameOrDisplayNameJoin':False,'bitmapSourceAdmissionPerformed':False},'summary':summary,'pendingRecords':[r for r in rows if r['pending']],'exceptions':[r for r in rows if not (r['charImageExists'] and r['heroPaintingParity'] and r['baseRuntimeStem'])]}
(repo/'data/validation/hero-portrait-stage4-2b-charimage-bridge.v1.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
