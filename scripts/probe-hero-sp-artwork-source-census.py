#!/usr/bin/env python3
import binascii, hashlib, json, os, pathlib, struct, urllib.error, urllib.request, zlib
import UnityPy

VER='1.1.113'
BASE=f'http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VER}'
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
MAX_PART=90; MISS_BREAK=8
STAGE=pathlib.Path('data/generated/hero-page-stage5-4-sp.v1.json')
CHAR=pathlib.Path(os.environ.get('CHAR_IMAGE_INFO_JSON','.probe-input/ConfigDataCharImageInfo.json'))
OUT=pathlib.Path('.probe-out/sp-source-census'); OUT.mkdir(parents=True,exist_ok=True)

def norm(x): return str(x).replace('\\','/').strip('/').lower()
def req(url,a,b):
    h={'User-Agent':UA,'Accept-Encoding':'identity','Range':f'bytes={a}-{b}'}
    with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=90) as r:d=r.read()
    if len(d)!=b-a+1: raise RuntimeError(f'range mismatch {url}')
    return d
def head(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA,'Accept-Encoding':'identity'},method='HEAD'),timeout=45) as r:return int(r.headers['Content-Length'])
    except urllib.error.HTTPError as e:
        if e.code in (403,404): return None
        raise
def zip_dir(url,n):
    t=min(1048576,n); tail=req(url,n-t,n-1); q=tail.rfind(b'PK\x05\x06')
    if q<0: raise RuntimeError(f'EOCD missing {url}')
    _,_,_,_,cs,co,_=struct.unpack_from('<HHHHIIH',tail,q+4); cd=req(url,co,co+cs-1); out=[]; i=0
    while i+46<=len(cd) and cd[i:i+4]==b'PK\x01\x02':
        fl,me=struct.unpack_from('<HH',cd,i+8); crc,cz,uz=struct.unpack_from('<III',cd,i+16)
        fn,ex,cm=struct.unpack_from('<HHH',cd,i+28); lo=struct.unpack_from('<I',cd,i+42)[0]
        nb=cd[i+46:i+46+fn]; name=nb.decode('utf-8' if fl&0x800 else 'cp437','replace')
        out.append({'name':name,'method':me,'crc':crc,'compressed':cz,'uncompressed':uz,'offset':lo}); i+=46+fn+ex+cm
    return out
def fetch_entry(url,e):
    lo=e['offset']; lh=req(url,lo,lo+4095); fn,ex=struct.unpack_from('<HH',lh,26); start=lo+30+fn+ex
    c=req(url,start,start+e['compressed']-1)
    d=c if e['method']==0 else zlib.decompress(c,-15) if e['method']==8 else None
    if d is None or len(d)!=e['uncompressed'] or (binascii.crc32(d)&0xffffffff)!=e['crc']: raise RuntimeError('entry integrity mismatch')
    return d
def safe_tree(o):
    try:return o.read_typetree()
    except:return {}
def refs(v,path='$',out=None):
    out=[] if out is None else out
    if isinstance(v,dict):
        if 'm_FileID' in v and 'm_PathID' in v:
            try:out.append((path,int(v['m_FileID']),int(v['m_PathID'])))
            except:pass
        for k,x in v.items():refs(x,f'{path}.{k}',out)
    elif isinstance(v,list):
        for i,x in enumerate(v):refs(x,f'{path}[{i}]',out)
    return out
def text_bytes(o):
    d=o.read(); s=getattr(d,'script',None)
    if s is None:s=safe_tree(o).get('m_Script')
    if isinstance(s,str):return s.encode('utf-8',errors='surrogateescape')
    if isinstance(s,(bytes,bytearray,memoryview)):return bytes(s)
    raise RuntimeError('unsupported TextAsset')
def varint(data,off):
    r=0; sh=0
    for _ in range(5):
        if off>=len(data):raise RuntimeError('EOF varint')
        b=data[off];off+=1;r|=(b&127)<<sh
        if not b&128:return r,off
        sh+=7
    raise RuntimeError('bad varint')
def spstr(data,off):
    n,off=varint(data,off)
    if n==0:return None,off
    n-=1; return data[off:off+n].decode('utf-8'),off+n
def candidate_bundle(spine):
    p=spine.replace('\\','/').split('/')
    if len(p)<4 or p[0]!='Spine' or p[1]!='Char' or not p[2].lower().endswith('_abs'):
        raise RuntimeError(f'unsupported explicit SP Char source family: {spine}')
    return f'spine_char_{p[2].lower()}.b'

stage=json.loads(STAGE.read_text(encoding='utf-8'))
released=[r for r in stage['records'] if r.get('sp',{}).get('status')=='RELEASED']
if len(released)!=25: raise RuntimeError(f'SP released count drift {len(released)}')
char_rows=json.loads(CHAR.read_text(encoding='utf-8')); char_by={int(r['ID']):r for r in char_rows}
targets=[]
for r in released:
    hid=int(r['heroId']); cid=int(r['sp']['charImageId']); c=char_by.get(cid)
    if not c: raise RuntimeError(f'CharImage {cid} missing for Hero {hid}')
    spine=c.get('Spine')
    if not isinstance(spine,str) or not spine.startswith('Spine/Char/'): raise RuntimeError(f'Hero {hid} CharImage {cid} lacks explicit Spine/Char')
    targets.append({'heroId':hid,'nameKr':r.get('nameKr'),'nameCn':r.get('nameCn'),'charImageId':cid,'charImageNameCn':c.get('Name'),'sourceSpinePath':spine,'candidateBundle':candidate_bundle(spine),'runtimePath':'assets/gameproject/runtimeassets/'+norm(spine)})
if len({x['charImageId'] for x in targets})!=25: raise RuntimeError('duplicate CharImage_ID in SP population')

wanted={x['candidateBundle'] for x in targets}; catalog={b:[] for b in wanted}; packages=[]; seen=False; misses=0
for part in range(1,MAX_PART+1):
    name=f'InstallPage_{VER}_{part}.zip'; url=f'{BASE}/{name}'; n=head(url)
    if n is None:
        if seen:
            misses+=1
            if misses>=MISS_BREAK:break
        continue
    seen=True;misses=0; entries=zip_dir(url,n); hit=0
    for e in entries:
        base=norm(e['name']).rsplit('/',1)[-1]
        if base in wanted:
            catalog[base].append({'part':part,'packageName':name,'packageUrl':url,'packageBytes':n,'entry':e});hit+=1
    packages.append({'part':part,'packageName':name,'packageBytes':n,'candidateEntryCount':hit})

bundle_cache={}
records=[]
for t in targets:
    candidates=catalog[t['candidateBundle']]
    if len(candidates)!=1: raise RuntimeError(f"Hero {t['heroId']} bundle candidate cardinality {len(candidates)} for {t['candidateBundle']}")
    c=candidates[0]; key=(c['packageName'],c['entry']['name'])
    if key not in bundle_cache:
        raw=fetch_entry(c['packageUrl'],c['entry']); env=UnityPy.load(raw)
        bundle_cache[key]=(raw,env)
    raw,env=bundle_cache[key]; containers=[(p,(v.deref() if hasattr(v,'deref') else v)) for p,v in env.container.items()]
    pm=[(p,o) for p,o in containers if norm(p)==t['runtimePath']]
    if len(pm)!=1: raise RuntimeError(f"Hero {t['heroId']} exact prefab cardinality {len(pm)}")
    p,o=pm[0]; objs={int(x.path_id):x for x in env.objects}; component_ids=[pid for _,fid,pid in refs(safe_tree(o)) if fid==0 and pid in objs]
    sd=None
    for pid in component_ids:
        for field,fid,target in refs(safe_tree(objs[pid])):
            if field.endswith('.skeletonDataAsset') and fid==0 and target in objs:sd=objs[target];break
        if sd is not None:break
    if sd is None: raise RuntimeError(f"Hero {t['heroId']} skeletonDataAsset missing")
    queue=[sd];seen_ids=set(); skels=[];atlases=[]
    for _ in range(3):
        nxt=[]
        for q in queue:
            qid=int(q.path_id)
            if qid in seen_ids:continue
            seen_ids.add(qid)
            if q.type.name=='TextAsset':
                payload=text_bytes(q); nm=''
                tr=safe_tree(q); nm=str(tr.get('m_Name') or getattr(q.read(),'name','') or '').lower()
                if '.skel' in nm:skels.append(payload)
                if '.atlas' in nm:atlases.append(payload)
            for _,fid,cid2 in refs(safe_tree(q)):
                if fid==0 and cid2 in objs and cid2 not in seen_ids:nxt.append(objs[cid2])
        queue=nxt
    if len(skels)!=1 or len(atlases)<1: raise RuntimeError(f"Hero {t['heroId']} skeleton/atlas cardinality skel={len(skels)} atlas={len(atlases)}")
    _,off=spstr(skels[0],0); ver,_=spstr(skels[0],off)
    records.append({**t,'packagePart':c['part'],'packageName':c['packageName'],'bundleEntry':c['entry']['name'],
        'bundleBytes':len(raw),'bundleSha256':hashlib.sha256(raw).hexdigest(),'resolvedPrefabPath':p,
        'prefabObjectSha256':hashlib.sha256(o.get_raw_data()).hexdigest(),'spineVersion':ver,'atlasTextAssetCount':len(atlases)})

versions={}
for r in records:versions[r['spineVersion']]=versions.get(r['spineVersion'],0)+1
result={'schemaVersion':1,'status':'PASS_SP_25_CURRENT_OFFICIAL_SOURCE_CENSUS','scope':{'releasedSpHeroCount':25},
 'authority':{'spProjection':STAGE.as_posix(),'charImageInfo':CHAR.as_posix(),'officialInstallerVersion':VER},
 'guardrails':{'semanticRelation':'SPHeroInfo.ID -> CharImage_ID -> CharImageInfo.ID -> Spine','nameJoin':False,'idArithmetic':False,
   'bundleNameUse':'LOCATOR_CANDIDATE_ONLY_FINAL_ACCEPTANCE_REQUIRES_EXACT_RUNTIME_PREFAB','aiBackgroundRemoval':False},
 'coverage':{'records':len(records),'uniqueCharImageIds':len({r['charImageId'] for r in records}),'uniqueBundles':len(bundle_cache),'spineVersionCounts':versions},
 'packagesScanned':packages,'records':sorted(records,key=lambda r:r['charImageId'])}
(OUT/'summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':result['status'],'coverage':result['coverage'],'records':[{'heroId':r['heroId'],'charImageId':r['charImageId'],'spineVersion':r['spineVersion'],'bundle':r['candidateBundle']} for r in result['records']]},ensure_ascii=False))
