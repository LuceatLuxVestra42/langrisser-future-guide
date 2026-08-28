#!/usr/bin/env python3
import json, re
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from gdown.download_folder import _GoogleDriveFile, _parse_embedded_folder_view

SERIES_ROOT_ID = "1_uAT_IXmlucRMcfB5h_mP60lyi2VO3BO"
MAX_DISCOVERY_DEPTH = 4
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/98 Safari/537.36"

class TimedSession(requests.Session):
    def get(self, *args, **kwargs):
        kwargs.setdefault("timeout", 25)
        return super().get(*args, **kwargs)

def make_session():
    s = TimedSession(); s.headers.update({"User-Agent": USER_AGENT})
    retry = Retry(total=2, connect=2, read=2, backoff_factor=.5, status_forcelist=(429,500,502,503,504), allowed_methods=frozenset(["GET"]))
    s.mount("https://", HTTPAdapter(max_retries=retry)); return s

def list_folder(sess, folder_id):
    return _parse_embedded_folder_view(sess=sess, folder_id=folder_id)

def runtime_stem(spine_path):
    name = Path(spine_path).name
    if name.lower().endswith(".prefab"): name = name[:-7]
    return re.sub(r"(?i)_prefab$", "", name)

def drive_id_from_url(url):
    q=parse_qs(urlparse(url).query)
    if q.get("id"): return q["id"][0]
    m=re.search(r"/folders/([^/?]+)",url) or re.search(r"/d/([^/]+)",url)
    return m.group(1) if m else None

def file_url(fid): return f"https://drive.google.com/uc?id={fid}"

def crawl_skin_group(sess, group_id, group_path, skin_id):
    entries=[]; errors=[]; req=0
    try:
        _, skin_children=list_folder(sess, skin_id); req+=1
    except Exception as e:
        return entries,[f"skin-read:{type(e).__name__}:{e}"],req
    for cid,cname,ctype in skin_children:
        if ctype != _GoogleDriveFile.TYPE_FOLDER:
            entries.append({"url":file_url(cid),"path":f"{group_path}/스킨/{cname}"})
    for cid,cname,ctype in sorted([x for x in skin_children if x[2]==_GoogleDriveFile.TYPE_FOLDER], key=lambda x:(x[1],x[0])):
        try:
            _, grandchildren=list_folder(sess,cid); req+=1
        except Exception as e:
            errors.append(f"child-read:{cname}:{type(e).__name__}:{e}"); continue
        for fid,fname,ftype in grandchildren:
            if ftype == _GoogleDriveFile.TYPE_FOLDER: continue
            entries.append({"url":file_url(fid),"path":f"{group_path}/스킨/{cname}/{fname}"})
    return entries,errors,req

def main():
    repo=Path('.')
    inv=json.loads((repo/'data/generated/skin-stage3-1-asset-inventory.v1.json').read_text())
    reg=json.loads((repo/'data/generated/hero-portrait-stage4-2-fallback-admission.v1.json').read_text())
    admitted={int(r['heroId']) for r in reg['records']}
    canonical=json.loads((repo/'data/generated/hero-card-artwork-stage4.v1.json').read_text())
    all_heroes={int(r['heroId']) for r in canonical['records']}
    pending=all_heroes-admitted

    stem_to_heroes=defaultdict(set)
    for rec in inv['records']:
        hid=int(rec['heroId'])
        if hid not in pending: continue
        stem=runtime_stem(rec['spine']['sourceSpinePath'])
        if stem: stem_to_heroes[stem].add(hid)
    stems=sorted(stem_to_heroes,key=len,reverse=True)

    sess=make_session(); q=deque([(SERIES_ROOT_ID,'시리즈별',0)]); seen=set(); groups=[]; discovery_errors=[]; requests_count=0
    while q:
        fid,path,depth=q.popleft()
        if fid in seen or depth>MAX_DISCOVERY_DEPTH: continue
        seen.add(fid)
        try:
            _, children=list_folder(sess,fid); requests_count+=1
        except Exception as e:
            discovery_errors.append({"folderId":fid,"path":path,"error":f"{type(e).__name__}:{e}"}); continue
        folders=[c for c in children if c[2]==_GoogleDriveFile.TYPE_FOLDER]
        skin=[c for c in folders if c[1]=='스킨']
        if skin:
            if len(skin)==1:
                entries,errs,req=crawl_skin_group(sess,fid,path,skin[0][0]); requests_count+=req
                groups.append({"groupFolderId":fid,"groupPath":path,"skinFolderId":skin[0][0],"entries":entries,"errors":errs})
            else:
                groups.append({"groupFolderId":fid,"groupPath":path,"skinFolderCount":len(skin),"entries":[],"errors":["multiple-skin-folders"]})
            continue
        if depth < MAX_DISCOVERY_DEPTH:
            for cid,cname,_ in folders:
                q.append((cid,f"{path}/{cname}",depth+1))

    mapped=[]; states=defaultdict(int); mapped_by_hero=defaultdict(list)
    for g in groups:
        evidence=[]; matched=set(); base=[]
        for e in g['entries']:
            parts=e['path'].split('/'); name=parts[-1]
            if '기본' in parts:
                if name.endswith('_idle_Normal_default.png'):
                    base.append({"driveFileId":drive_id_from_url(e['url']),"driveFileName":name})
                continue
            for stem in stems:
                if name.startswith(stem+'_'):
                    hs=stem_to_heroes[stem]
                    evidence.append({"driveFileId":drive_id_from_url(e['url']),"driveFileName":name,"runtimeStem":stem,"heroIds":sorted(hs)})
                    matched.update(hs); break
        hero_id=next(iter(matched)) if len(matched)==1 else None
        if hero_id is None:
            state='UNRESOLVED_NO_EXACT_PENDING_RUNTIME_STEM' if not matched else 'AMBIGUOUS_MULTIPLE_PENDING_HERO_IDS'
        elif len(base)==1:
            state='SERIES_BRIDGE_PROVEN_EXACT_BASE_MAPPING'
        elif len(base)==0:
            state='SERIES_OWNERSHIP_PROVEN_BASE_PNG_MISSING'
        else:
            state='SERIES_OWNERSHIP_PROVEN_BASE_PNG_AMBIGUOUS'
        states[state]+=1
        rec={"seriesGroupPath":g['groupPath'],"groupFolderId":g['groupFolderId'],"skinFolderId":g.get('skinFolderId'),"heroId":hero_id,"mappingState":state,"ownershipEvidence":evidence,"baseCandidates":base,"crawlErrors":g['errors']}
        mapped.append(rec)
        if hero_id is not None: mapped_by_hero[hero_id].append(rec)

    exact=[r for r in mapped if r['mappingState']=='SERIES_BRIDGE_PROVEN_EXACT_BASE_MAPPING']
    exact_heroes=sorted({r['heroId'] for r in exact})
    dup={str(h):[r['seriesGroupPath'] for r in rs] for h,rs in mapped_by_hero.items() if len([r for r in rs if r['mappingState']=='SERIES_BRIDGE_PROVEN_EXACT_BASE_MAPPING'])>1}
    out={
      "version":1,"stage":"hero-portrait-stage4-2b-explicit-fallback-source-acquisition","phase":"SERIES_INDEX_EXACT_RUNTIME_PROBE","status":"PASS_WITH_REVIEW",
      "policy":{"folderLabelsUsedForOwnership":False,"seriesNamesUsedForOwnership":False,"pendingOnly":True,"ownershipRule":"exact frozen Skin sourceSpinePath runtime stem prefix in non-base file under same series-index Hero group","baseSelectionRule":"same proven group -> 스킨/기본 -> unique *_idle_Normal_default.png","sourceAdmissionPerformed":False},
      "summary":{"previousAdmitted":len(admitted),"pendingInput":len(pending),"seriesHeroGroupCount":len(groups),"exactMappedPendingHeroCount":len(exact_heroes),"remainingAfterExactMapping":len(pending-set(exact_heroes)),"mappingStateCounts":dict(states),"duplicateExactHeroCount":len(dup),"discoveryErrorCount":len(discovery_errors),"approxRequestCount":requests_count},
      "exactMappedPendingHeroIds":exact_heroes,"duplicateExactHeroGroups":dup,"discoveryErrors":discovery_errors,"records":mapped
    }
    p=repo/'data/validation/hero-portrait-stage4-2b-series-index-probe.v1.json'; p.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(out['summary'],ensure_ascii=False,indent=2))

if __name__=='__main__': main()
