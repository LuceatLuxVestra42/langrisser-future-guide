#!/usr/bin/env python3
import binascii, hashlib, json, os, pathlib, re, struct, urllib.request, zlib
import UnityPy

VER='1.1.113'
BASE=f'http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VER}'
PKG='InstallPage_1.1.113_37.zip'
BUNDLE_ENTRY='Client/Langrisser_Data/StreamingAssets/ExportAssetBundle/spine_char_leon_abs.b'
BUNDLE_SHA='3fde9e1d477bfb8c7426e11036a7432f213237ef36944706948789a2e1c717da'
CHAR_IMAGE_ID=1013
HERO_ID=6
SOURCE_SPINE='Spine/Char/Leon_ABS/Leon_SP_Prefab.prefab'
RUNTIME='assets/gameproject/runtimeassets/spine/char/leon_abs/leon_sp_prefab.prefab'
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
OUT=pathlib.Path('.probe-out/leon-sp')
RAW=OUT/'raw'
OUT.mkdir(parents=True,exist_ok=True); RAW.mkdir(parents=True,exist_ok=True)

def norm(x): return str(x).replace('\\','/').strip('/').lower()
def req(url,a,b):
    h={'User-Agent':UA,'Accept-Encoding':'identity','Range':f'bytes={a}-{b}'}
    with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=90) as r:d=r.read()
    if len(d)!=b-a+1: raise RuntimeError('range mismatch')
    return d
def head(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA,'Accept-Encoding':'identity'},method='HEAD'),timeout=60) as r:return int(r.headers['Content-Length'])
def zip_dir(url,n):
    t=min(1048576,n); tail=req(url,n-t,n-1); q=tail.rfind(b'PK\x05\x06')
    if q<0: raise RuntimeError('EOCD missing')
    _,_,_,_,cs,co,_=struct.unpack_from('<HHHHIIH',tail,q+4); cd=req(url,co,co+cs-1); out=[]; i=0
    while i+46<=len(cd) and cd[i:i+4]==b'PK\x01\x02':
        fl,me=struct.unpack_from('<HH',cd,i+8); crc,cz,uz=struct.unpack_from('<III',cd,i+16)
        fn,ex,cm=struct.unpack_from('<HHH',cd,i+28); lo=struct.unpack_from('<I',cd,i+42)[0]
        nb=cd[i+46:i+46+fn]; name=nb.decode('utf-8' if fl&0x800 else 'cp437','replace')
        out.append((name,me,crc,cz,uz,lo)); i+=46+fn+ex+cm
    return out
def fetch_entry(url,e):
    name,me,crc,cz,uz,lo=e; lh=req(url,lo,lo+4095); fn,ex=struct.unpack_from('<HH',lh,26); start=lo+30+fn+ex
    c=req(url,start,start+cz-1); d=c if me==0 else zlib.decompress(c,-15) if me==8 else None
    if d is None or len(d)!=uz or (binascii.crc32(d)&0xffffffff)!=crc: raise RuntimeError('zip entry integrity mismatch')
    return d
def safe_tree(o):
    try:return o.read_typetree()
    except:return {}
def refs(v,path='$',out=None):
    out=[] if out is None else out
    if isinstance(v,dict):
        if 'm_FileID' in v and 'm_PathID' in v:
            try: out.append((path,int(v['m_FileID']),int(v['m_PathID'])))
            except: pass
        for k,x in v.items(): refs(x,f'{path}.{k}',out)
    elif isinstance(v,list):
        for i,x in enumerate(v): refs(x,f'{path}[{i}]',out)
    return out
def name_of(o):
    t=safe_tree(o)
    for k in ('m_Name','name','Name'):
        if isinstance(t.get(k),str) and t[k]: return t[k]
    return None
def text_bytes(o):
    d=o.read(); s=getattr(d,'script',None)
    if s is None:s=safe_tree(o).get('m_Script')
    if isinstance(s,str):return s.encode('utf-8',errors='surrogateescape')
    if isinstance(s,(bytes,bytearray,memoryview)):return bytes(s)
    raise RuntimeError('unsupported TextAsset payload')
def varint(data,off):
    r=0; sh=0
    for _ in range(5):
        b=data[off]; off+=1; r|=(b&127)<<sh
        if not b&128:return r,off
        sh+=7
    raise RuntimeError('bad varint')
def spstr(data,off):
    n,off=varint(data,off)
    if n==0:return None,off
    n-=1; return data[off:off+n].decode('utf-8'),off+n

url=f'{BASE}/{PKG}'; n=head(url); entries=zip_dir(url,n)
matches=[e for e in entries if norm(e[0])==norm(BUNDLE_ENTRY)]
if len(matches)!=1: raise RuntimeError(f'bundle entry cardinality {len(matches)}')
bundle=fetch_entry(url,matches[0]); bsha=hashlib.sha256(bundle).hexdigest()
if bsha!=BUNDLE_SHA: raise RuntimeError(f'official Leon bundle hash drift: {bsha}')
(OUT/'spine_char_leon_abs.b').write_bytes(bundle)
env=UnityPy.load(bundle); objs={int(o.path_id):o for o in env.objects}
containers=[(p,(v.deref() if hasattr(v,'deref') else v)) for p,v in env.container.items()]
pm=[(p,o) for p,o in containers if norm(p)==norm(RUNTIME)]
if len(pm)!=1: raise RuntimeError(f'Leon SP prefab exact container count {len(pm)}')
prefab_path,prefab=pm[0]

component_ids=[pid for _,fid,pid in refs(safe_tree(prefab)) if fid==0 and pid in objs]
skeleton_data=None; component=None; data_ref=None
for pid in component_ids:
    o=objs[pid]
    for field,fid,target in refs(safe_tree(o)):
        if field.endswith('.skeletonDataAsset') and fid==0 and target in objs:
            component=o; skeleton_data=objs[target]; data_ref={'fieldPath':field,'fileId':fid,'pathId':target}; break
    if skeleton_data is not None: break
if skeleton_data is None: raise RuntimeError('skeletonDataAsset PPtr not found')

expanded={}
queue=[skeleton_data]; seen=set()
for depth in range(3):
    nxt=[]
    for o in queue:
        pid=int(o.path_id)
        if pid in seen: continue
        seen.add(pid); tree=safe_tree(o)
        expanded[pid]={'type':o.type.name,'name':name_of(o),'refs':refs(tree)}
        for _,fid,cid in refs(tree):
            if fid==0 and cid in objs and cid not in seen:nxt.append(objs[cid])
    queue=nxt

atlas=None; skel=None
for pid,m in expanded.items():
    o=objs[pid]
    if m['type']!='TextAsset': continue
    payload=text_bytes(o); nm=(m['name'] or '').lower()
    if '.atlas' in nm:
        p=RAW/f'{pid}-{m["name"]}.atlas.txt'; p.write_bytes(payload); atlas=p
    elif '.skel' in nm:
        p=RAW/f'{pid}-{m["name"]}.skel.bytes'; p.write_bytes(payload); skel=p
if atlas is None or skel is None: raise RuntimeError(f'atlas/skel missing atlas={atlas} skel={skel}')
h,off=spstr(skel.read_bytes(),0); ver,off=spstr(skel.read_bytes(),off)
if ver!='3.3.05': raise RuntimeError(f'unexpected Spine version {ver}')
lines=[x for x in atlas.read_text(encoding='utf-8').splitlines() if x.strip()]
page=lines[0].strip()
tex_runtime=norm(str(pathlib.PurePosixPath(RUNTIME).parent/page))
tm=[(p,o) for p,o in containers if norm(p)==tex_runtime]
if len(tm)!=1 or tm[0][1].type.name!='Texture2D': raise RuntimeError(f'atlas texture exact match count/type invalid: {len(tm)}')
texture=tm[0][1].read().image; tex=RAW/page; texture.save(tex)

result={
 'schemaVersion':1,'status':'PASS_LEON_SP_CURRENT_OFFICIAL_SOURCE_CHAIN',
 'heroId':HERO_ID,'charImageId':CHAR_IMAGE_ID,
 'authority':{
   'configRelation':'ConfigDataSPHeroInfo.ID=6 -> CharImage_ID=1013 -> ConfigDataCharImageInfo.ID=1013',
   'sourceSpinePath':SOURCE_SPINE,'officialInstallerVersion':VER,'packageName':PKG,
   'bundleEntry':BUNDLE_ENTRY,'bundleSha256':bsha,'prefabRuntimePath':prefab_path,
   'prefabObjectSha256':hashlib.sha256(prefab.get_raw_data()).hexdigest()
 },
 'guardrails':{'nameJoin':False,'idArithmetic':False,'aiBackgroundRemoval':False,'historicalImageImported':False},
 'spine':{'version':ver,'hash':h,'atlasPath':atlas.as_posix(),'skeletonPath':skel.as_posix(),
          'texturePath':tex.as_posix(),'textureRuntimePath':tm[0][0],'textureSize':[texture.width,texture.height]},
 'next':'Render idle_Normal @ 0 with pinned Spine 3.3 runtime and inspect transparent output.'
}
(OUT/'source-evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
