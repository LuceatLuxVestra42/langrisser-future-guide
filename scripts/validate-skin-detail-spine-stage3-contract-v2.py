#!/usr/bin/env python3
import argparse, hashlib, importlib.util, json, pathlib, subprocess, sys
from collections import deque
from PIL import Image
import UnityPy

ROOT=pathlib.Path(__file__).resolve().parent.parent
BULK=ROOT/'scripts/run-skin-detail-spine-stage3-bulk.py'
CONTRACT=ROOT/'data/contracts/skin-detail-spine-render-contract.v1.json'
OUT=ROOT/'skin-detail-spine-stage3-contract-v2-targeted.json'
RENDERS=ROOT/'skin-detail-spine-stage3-contract-v2-renders'

spec=importlib.util.spec_from_file_location('bulk_target_v2',BULK); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
base=m.base
TARGETS={
102:(25,'begin_spine_char_mathew_abs.b','8d2525638331fe5b0e4af8801e32548a11d29de717d52cdf0471a0590b6cc5d3','assets/gameproject/runtimeassets/spine/char/mathew_abs/mathew_skin01_prefab.prefab'),
1901:(38,'spine_char_lista_abs.b','38576ff406951938907e9f65a2cf34b54a31a1f23343d2eb8c91fdf1e77c67e1','assets/gameproject/runtimeassets/spine/char/lista_abs/lista_skin01_prefab.prefab'),
3701:(45,'spine_char_zigodlla_abs.b','8addf342cf0ae3c5db5c3d5bcded4505d690df5fe37bafcfcc613b8cd412ae25','assets/gameproject/runtimeassets/spine/char/zigodlla_abs/zigodlla_skin01_prefab.prefab'),
1001:(37,'spine_char_ledin_abs.b','12b6dcf9e2bb08e55d5aca15918f55f580379b2ea0526a442442beb43dea87e2','assets/gameproject/runtimeassets/spine/char/ledin_abs/ledin_skin_prefab.prefab'),
3102:(43,'spine_char_sofia_abs.b','3d0d75b48c36c663ed4b66b2966c1aaaeaf6987f6d5222d5810234ca147162e8','assets/gameproject/runtimeassets/spine/char/sofia_abs/sofia_skin02_prefab.prefab')}

def sha(b): return hashlib.sha256(b).hexdigest()
def local_reachable(env,root):
 objs=list(env.objects); by={(id(getattr(o,'assets_file',None)),int(o.path_id)):o for o in objs}; q=deque([(m.owner_key(root),0)]); seen=set(); out=[]
 while q:
  key,d=q.popleft()
  if key in seen or d>20: continue
  o=by.get(key)
  if o is None: continue
  seen.add(key); out.append(o)
  try: tree=o.read_typetree()
  except Exception: continue
  for r in base.pptr_refs(tree):
   try: fi=int(r.get('fileId',0)); pi=int(r.get('pathId',0))
   except Exception: continue
   if fi==0 and pi: q.append(((id(getattr(o,'assets_file',None)),pi),d+1))
 return out

def initial_state(reachable):
 rows=[]
 for o in reachable:
  if base.object_type(o)!='MonoBehaviour': continue
  try: t=o.read_typetree()
  except Exception: continue
  if isinstance(t,dict) and 'skeletonDataAsset' in t and '_animationName' in t and 'initialSkinName' in t:
   rows.append({'pathId':int(o.path_id),'initialSkinName':str(t.get('initialSkinName') or ''),'prefabAnimationName':str(t.get('_animationName') or '')})
 uniq={(r['initialSkinName'],r['prefabAnimationName']) for r in rows}
 if len(uniq)!=1: raise RuntimeError('BLOCK_SKELETON_ANIMATION_STATE_CARDINALITY:'+json.dumps(rows,ensure_ascii=False))
 return rows[0]

def entry(part,bundle):
 z=base.zip_directory(part); hits=[{**e,'part':part,'packageName':z['packageName'],'packageSizeBytes':z['packageSizeBytes'],'url':z['url']} for e in z['entries'] if pathlib.PurePosixPath(e['normName']).name==bundle]
 if len(hits)!=1: raise RuntimeError(f'entry cardinality {bundle}:{len(hits)}')
 return hits[0]

def render(gproj,work,sid,selected,state):
 d=work/str(sid); d.mkdir(parents=True,exist_ok=True); RENDERS.mkdir(exist_ok=True)
 sk=d/selected['skelName']; at=d/selected['atlasName']; tx=d/selected['atlasPageName']; gj=d/'geometry.json'; png=RENDERS/f'{sid}.png'
 sk.write_bytes(selected['skelBytes']); at.write_bytes(selected['atlasBytes']); tx.write_bytes(selected['texturePng'])
 p=subprocess.run(['dotnet','run','--project',str(gproj),'-c','Release','--no-build','--',str(sk),str(at),str(gj),'idle_Normal','0',state['initialSkinName']],text=True,capture_output=True)
 if p.returncode: return {'status':'BLOCK_GEOMETRY_V2','error':(p.stderr or p.stdout)[-4000:]}
 g=json.loads(gj.read_text('utf-8'))
 p=subprocess.run([sys.executable,str(ROOT/'scripts/render-spine-stage2-geometry.py'),str(gj),str(tx),str(png)],text=True,capture_output=True)
 if p.returncode: return {'status':'BLOCK_CPU_RENDER','error':(p.stderr or p.stdout)[-4000:]}
 im=Image.open(png).convert('RGBA'); bbox=im.getchannel('A').getbbox()
 return {'status':'PASS_RENDERED','initialSkinName':state['initialSkinName'],'prefabAnimationName':state['prefabAnimationName'],'appliedSkinName':g.get('appliedSkinName'),'fingerprint':selected['fingerprint'],'canvas':[im.width,im.height],'alphaBounds':list(bbox) if bbox else None,'drawItemCount':g.get('drawItemCount'),'attachmentTypeCounts':g.get('attachmentTypeCounts'),'blendModeCounts':g.get('blendModeCounts'),'rgbaPixelSha256':sha(im.tobytes()),'renderSha256':hashlib.sha256(png.read_bytes()).hexdigest()}

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--geometry-project',type=pathlib.Path,required=True); ap.add_argument('--work-dir',type=pathlib.Path,default=pathlib.Path('/tmp/skin-v2-target')); a=ap.parse_args(); a.work_dir.mkdir(parents=True,exist_ok=True)
 v1=json.loads(CONTRACT.read_text('utf-8')); expected=v1['representativeRegression']['expected']; rows=[]
 for sid,(part,bundle,want_sha,rpath) in TARGETS.items():
  raw=base.fetch_zip_entry(entry(part,bundle)); actual=sha(raw)
  if actual!=want_sha: rows.append({'skinId':sid,'status':'BLOCK_BUNDLE_SHA_MISMATCH','actual':actual}); continue
  env=UnityPy.load(raw); hits=m.exact_container_hits(env,rpath)
  if len(hits)!=1: rows.append({'skinId':sid,'status':'BLOCK_RUNTIME_PATH_CARDINALITY','count':len(hits)}); continue
  root=hits[0][1]; reach=local_reachable(env,root); state=initial_state(reach); old=m.reachable_objects; m.reachable_objects=lambda root,max_nodes=1600,max_depth=20,_r=reach:_r
  try: selected=m.extract_render_input(env,root,sid,bundle,actual,part)
  except Exception as e: rows.append({'skinId':sid,'status':'BLOCK_INPUT','error':str(e)}); m.reachable_objects=old; continue
  finally: m.reachable_objects=old
  r=render(a.geometry_project.resolve(),a.work_dir,sid,selected,state); r['skinId']=sid; r['bundle']=bundle; r['part']=part
  if r['status']=='PASS_RENDERED' and sid in (102,1901,3701):
   e=expected[str(sid)]; checks={k:r.get(k)==e.get(k) for k in ['canvas','alphaBounds','drawItemCount','attachmentTypeCounts','blendModeCounts','rgbaPixelSha256']}; checks['fingerprint']=all(r['fingerprint'].get(k)==e.get(k) for k in ['skelSha256','atlasSha256','texturePngSha256']); r['v1RepresentativeChecks']=checks
   if not all(checks.values()): r['status']='BLOCK_V1_REPRESENTATIVE_REGRESSION'
  if r['status']=='PASS_RENDERED' and sid==1001 and not (r['initialSkinName']=='Ledin_Skin' and r['appliedSkinName']=='Ledin_Skin'): r['status']='BLOCK_LEDIN_INITIAL_SKIN_CONTRACT'
  if r['status']=='PASS_RENDERED' and sid==3102 and int((r['blendModeCounts'] or {}).get('additive',0))<=0: r['status']='BLOCK_ADDITIVE_REPRESENTATIVE_MISSING'
  rows.append(r); print(json.dumps({'skinId':sid,'status':r['status'],'initialSkinName':r.get('initialSkinName'),'blendModeCounts':r.get('blendModeCounts')},ensure_ascii=False),flush=True)
 status='PASS_TARGETED_CONTRACT_V2' if all(r['status']=='PASS_RENDERED' for r in rows) else 'TARGETED_CONTRACT_V2_BLOCKED'
 out={'schemaVersion':1,'stage':'skin-detail-spine-stage3','substage':'contract-v2-targeted-regression','status':status,'sourceBulkRun':33300225041,'sourceRepairRun':33302201311,'targets':[102,1901,3701,1001,3102],'rules':{'animation':'idle_Normal','time':0,'initialSkin':'authoritative SkeletonAnimation.initialSkinName when non-empty','validatedBlendModes':['normal','additive']},'records':rows,'guardrails':{'full540Run':False,'semanticReopened':False,'frontendMutation':False,'publicSkinAssetMutation':False,'classFusionTouched':False}}
 OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n','utf-8'); print(json.dumps({'status':status,'output':str(OUT)},ensure_ascii=False))
 return 0 if status.startswith('PASS_') else 1
if __name__=='__main__': raise SystemExit(main())
