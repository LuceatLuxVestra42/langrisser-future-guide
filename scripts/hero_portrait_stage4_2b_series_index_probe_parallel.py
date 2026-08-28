#!/usr/bin/env python3
import json, re, threading
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from gdown.download_folder import _GoogleDriveFile, _parse_embedded_folder_view

ROOT="1_uAT_IXmlucRMcfB5h_mP60lyi2VO3BO"; MAX_DEPTH=4; WORKERS=20
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/98 Safari/537.36"
local=threading.local()
def sess():
    if not hasattr(local,'s'):
        s=requests.Session(); s.headers.update({'User-Agent':UA})
        retry=Retry(total=2,connect=2,read=2,backoff_factor=.4,status_forcelist=(429,500,502,503,504),allowed_methods=frozenset(['GET']))
        s.mount('https://',HTTPAdapter(max_retries=retry)); local.s=s
    return local.s

def ls(fid): return _parse_embedded_folder_view(sess=sess(),folder_id=fid)
def stem(p):
    n=Path(p).name
    if n.lower().endswith('.prefab'): n=n[:-7]
    return re.sub(r'(?i)_prefab$','',n)
def did(url):
    q=parse_qs(urlparse(url).query)
    if q.get('id'): return q['id'][0]
    return None
def furl(fid): return f'https://drive.google.com/uc?id={fid}'

def inspect_folder(item):
    fid,path,depth=item
    try: _,children=ls(fid)
    except Exception as e: return {'kind':'error','fid':fid,'path':path,'depth':depth,'error':f'{type(e).__name__}:{e}'}
    folders=[x for x in children if x[2]==_GoogleDriveFile.TYPE_FOLDER]
    skins=[x for x in folders if x[1]=='스킨']
    if len(skins)==1: return {'kind':'hero','fid':fid,'path':path,'depth':depth,'skin':skins[0][0]}
    if len(skins)>1: return {'kind':'error','fid':fid,'path':path,'depth':depth,'error':'multiple-skin-folders'}
    return {'kind':'branch','fid':fid,'path':path,'depth':depth,'children':[(c[0],f'{path}/{c[1]}',depth+1) for c in folders]}

def crawl_group(g):
    entries=[]; errors=[]
    try: _,children=ls(g['skin'])
    except Exception as e: return {**g,'entries':[],'errors':[f'skin:{type(e).__name__}:{e}']}
    for cid,name,typ in children:
        if typ!=_GoogleDriveFile.TYPE_FOLDER: entries.append({'url':furl(cid),'path':f"{g['path']}/스킨/{name}"})
    sub=[x for x in children if x[2]==_GoogleDriveFile.TYPE_FOLDER]
    def one(child):
        cid,name,_=child
        try: _,kids=ls(cid); return [(fid,fname,ftype,name) for fid,fname,ftype in kids],None
        except Exception as e: return [],f'{name}:{type(e).__name__}:{e}'
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs=[ex.submit(one,x) for x in sub]
        for fut in as_completed(futs):
            rows,err=fut.result()
            if err: errors.append(err)
            for fid,fname,ftype,subname in rows:
                if ftype!=_GoogleDriveFile.TYPE_FOLDER: entries.append({'url':furl(fid),'path':f"{g['path']}/스킨/{subname}/{fname}"})
    return {**g,'entries':entries,'errors':errors}

def main():
    repo=Path('.')
    inv=json.loads((repo/'data/generated/skin-stage3-1-asset-inventory.v1.json').read_text())
    reg=json.loads((repo/'data/generated/hero-portrait-stage4-2-fallback-admission.v1.json').read_text())
    art=json.loads((repo/'data/generated/hero-card-artwork-stage4.v1.json').read_text())
    admitted={int(r['heroId']) for r in reg['records']}; allh={int(r['heroId']) for r in art['records']}; pending=allh-admitted
    stoh=defaultdict(set)
    for r in inv['records']:
        h=int(r['heroId'])
        if h in pending:
            s=stem(r['spine']['sourceSpinePath'])
            if s: stoh[s].add(h)
    stems=sorted(stoh,key=len,reverse=True)

    frontier=[(ROOT,'시리즈별',0)]; hero=[]; errs=[]; visited=set(); depth_counts={}
    for depth in range(MAX_DEPTH+1):
        batch=[x for x in frontier if x[0] not in visited and x[2]==depth]; frontier=[]
        if not batch: continue
        for x in batch: visited.add(x[0])
        depth_counts[str(depth)]=len(batch)
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            fs=[ex.submit(inspect_folder,x) for x in batch]
            for f in as_completed(fs):
                r=f.result()
                if r['kind']=='hero': hero.append(r)
                elif r['kind']=='error': errs.append(r)
                elif depth<MAX_DEPTH: frontier.extend(r['children'])
    groups=[]
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        fs=[ex.submit(crawl_group,g) for g in hero]
        for f in as_completed(fs): groups.append(f.result())

    states=defaultdict(int); records=[]; exact_by_h=defaultdict(list)
    for g in sorted(groups,key=lambda x:x['path']):
        evidence=[]; matched=set(); base=[]
        for e in g['entries']:
            parts=e['path'].split('/'); name=parts[-1]
            if '기본' in parts:
                if name.endswith('_idle_Normal_default.png'): base.append({'driveFileId':did(e['url']),'driveFileName':name})
                continue
            for s in stems:
                if name.startswith(s+'_'):
                    hs=stoh[s]; evidence.append({'driveFileId':did(e['url']),'driveFileName':name,'runtimeStem':s,'heroIds':sorted(hs)}); matched.update(hs); break
        hid=next(iter(matched)) if len(matched)==1 else None
        if hid is None: state='UNRESOLVED_NO_EXACT_PENDING_RUNTIME_STEM' if not matched else 'AMBIGUOUS_MULTIPLE_PENDING_HERO_IDS'
        elif len(base)==1: state='SERIES_BRIDGE_PROVEN_EXACT_BASE_MAPPING'
        elif not base: state='SERIES_OWNERSHIP_PROVEN_BASE_PNG_MISSING'
        else: state='SERIES_OWNERSHIP_PROVEN_BASE_PNG_AMBIGUOUS'
        states[state]+=1
        rec={'seriesGroupPath':g['path'],'groupFolderId':g['fid'],'skinFolderId':g['skin'],'heroId':hid,'mappingState':state,'ownershipEvidence':evidence,'baseCandidates':base,'crawlErrors':g['errors']}; records.append(rec)
        if state=='SERIES_BRIDGE_PROVEN_EXACT_BASE_MAPPING': exact_by_h[hid].append(rec)
    exact=set(exact_by_h); dup={str(h):[r['seriesGroupPath'] for r in rs] for h,rs in exact_by_h.items() if len(rs)>1}
    out={'version':2,'stage':'hero-portrait-stage4-2b-explicit-fallback-source-acquisition','phase':'SERIES_INDEX_PARALLEL_EXACT_RUNTIME_PROBE','status':'PASS_WITH_REVIEW','policy':{'folderLabelsUsedForOwnership':False,'seriesNamesUsedForOwnership':False,'pendingOnly':True,'sourceAdmissionPerformed':False},'summary':{'previousAdmitted':len(admitted),'pendingInput':len(pending),'visitedFolderCount':len(visited),'depthFolderCounts':depth_counts,'seriesHeroGroupCount':len(groups),'exactMappedPendingHeroCount':len(exact),'remainingAfterExactMapping':len(pending-exact),'mappingStateCounts':dict(states),'duplicateExactHeroCount':len(dup),'discoveryErrorCount':len(errs)},'exactMappedPendingHeroIds':sorted(exact),'duplicateExactHeroGroups':dup,'discoveryErrors':errs,'records':records}
    p=repo/'data/validation/hero-portrait-stage4-2b-series-index-probe-parallel.v1.json'; p.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(out['summary'],ensure_ascii=False,indent=2))
if __name__=='__main__': main()
