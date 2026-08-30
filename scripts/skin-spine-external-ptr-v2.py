#!/usr/bin/env python3
import json, pathlib
from collections import deque


def asset_file_name(af):
    if af is None: return ''
    for attr in ('name','path'):
        v=getattr(af,attr,None)
        if isinstance(v,str) and v:
            return pathlib.PurePosixPath(v.replace('\\','/')).name
    return f'assets-file-{id(af)}'


def external_path(ext):
    for attr in ('path','name'):
        v=getattr(ext,attr,None)
        if isinstance(v,str) and v: return v.replace('\\','/')
    return str(ext)


def asset_files(env):
    out=[]; seen=set()
    for obj in env.objects:
        af=getattr(obj,'assets_file',None)
        if af is None or id(af) in seen: continue
        seen.add(id(af)); out.append(af)
    return out


def get_object(af,path_id):
    objects=getattr(af,'objects',None)
    if isinstance(objects,dict): return objects.get(path_id)
    if objects is not None:
        for obj in objects:
            if int(getattr(obj,'path_id',0))==int(path_id): return obj
    return None


def resolve_ref(source_obj,file_id,path_id,afs):
    source_af=getattr(source_obj,'assets_file',None)
    if source_af is None or path_id==0: return None
    if file_id==0: return get_object(source_af,path_id)
    externals=list(getattr(source_af,'externals',[]) or []); idx=file_id-1
    if idx<0 or idx>=len(externals): return None
    ep=external_path(externals[idx]); target=pathlib.PurePosixPath(ep).name.lower()
    matches=[af for af in afs if asset_file_name(af).lower()==target]
    if len(matches)!=1:
        matches=[af for af in afs if asset_file_name(af).lower() and asset_file_name(af).lower() in ep.lower()]
    return get_object(matches[0],path_id) if len(matches)==1 else None


def reachable(base,root_obj,env,max_nodes=2400,max_depth=24):
    afs=asset_files(env); q=deque([(root_obj,0)]); seen=set(); out=[]
    while q and len(seen)<max_nodes:
        obj,depth=q.popleft(); key=(id(getattr(obj,'assets_file',None)),int(getattr(obj,'path_id',0)))
        if key in seen or depth>max_depth: continue
        seen.add(key); out.append(obj)
        try: tree=obj.read_typetree()
        except Exception: continue
        for ref in base.pptr_refs(tree):
            try: fi=int(ref.get('fileId',0)); pi=int(ref.get('pathId',0))
            except Exception: continue
            if not pi: continue
            target=resolve_ref(obj,fi,pi,afs)
            if target is not None: q.append((target,depth+1))
    return out


def skeleton_animation_state(base,objects):
    rows=[]
    for obj in objects:
        if base.object_type(obj)!='MonoBehaviour': continue
        try: tree=obj.read_typetree()
        except Exception: continue
        if not isinstance(tree,dict): continue
        if 'skeletonDataAsset' not in tree or '_animationName' not in tree or 'initialSkinName' not in tree: continue
        p=tree.get('skeletonDataAsset') if isinstance(tree.get('skeletonDataAsset'),dict) else {}
        rows.append({'pathId':int(obj.path_id),'assetsFile':asset_file_name(getattr(obj,'assets_file',None)),'initialSkinName':str(tree.get('initialSkinName') or ''),'prefabAnimationName':str(tree.get('_animationName') or ''),'skeletonDataAsset':{'fileId':int(p.get('m_FileID',0) or 0),'pathId':int(p.get('m_PathID',0) or 0)}})
    keys={(r['initialSkinName'],r['prefabAnimationName'],r['skeletonDataAsset']['fileId'],r['skeletonDataAsset']['pathId']) for r in rows}
    if len(keys)!=1: raise RuntimeError('BLOCK_SKELETON_ANIMATION_STATE_CARDINALITY:'+json.dumps(rows,ensure_ascii=False))
    return rows[0]
