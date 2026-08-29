import binascii, hashlib, json, os, pathlib, struct, urllib.request, zlib
from collections import deque
import UnityPy

OUT=pathlib.Path(os.environ.get('RUNNER_TEMP','.'))/'hero-artwork-h-a5-seven'/'report'; OUT.mkdir(parents=True,exist_ok=True)
DETAIL=pathlib.Path('data/generated/hero-detail/by-id'); VER='1.1.113'; BASE=f'http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VER}'
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
IDS={17,42,48,54,58,66,80}
P={
'ui_heropainting_r_abs.b':(60,109027105,1234370,'19C940F7E635EC502768E701496F92B9','4F5E6D8202DC62E483CB090973BE9FFB80B0B96B0354358259EEF62BC8BBCA25','CE79F47D'),
'ui_heropainting_sr_abs.b':(60,109027105,4204670,'50C4FFD5AB6F7CBD8A0B39117F9CA101','294750FF12725BF5B8DF906B6CFAB702AF6352F7BAAF2203553E3E5EACDE8ED2','BD688F0F'),
'ui_heropainting_ssr_abs.b':(60,109027105,25793935,'168B2D54E39D62B98CD1E92BDE9F787B','818942EA601B584D007D97A0E2A388554AFBAF6A83A36302E241601015D87492','4682CEA2')}
ALLOWED={'GameObject','Transform','RectTransform','MonoBehaviour','CanvasRenderer','SpriteRenderer','Sprite','Texture2D','Material','Animator','Animation'}

def norm(x): return str(x).replace('\\','/').strip('/').lower()
def typ(o): return getattr(getattr(o,'type',None),'name',None)
def refs(v):
 out=[]
 def w(x,p=''):
  if isinstance(x,dict):
   if 'm_FileID' in x and 'm_PathID' in x:
    try: out.append((p,int(x['m_FileID']),int(x['m_PathID'])))
    except: pass
   for k,y in x.items(): w(y,f'{p}.{k}' if p else str(k))
  elif isinstance(x,list):
   for i,y in enumerate(x): w(y,f'{p}[{i}]')
 w(v); return out

def strings(v):
 out=[]
 def w(x,p=''):
  if isinstance(x,str) and ('.b' in x.lower() or 'heropainting' in x.lower()): out.append((p,x))
  elif isinstance(x,dict):
   for k,y in x.items(): w(y,f'{p}.{k}' if p else str(k))
  elif isinstance(x,list):
   for i,y in enumerate(x): w(y,f'{p}[{i}]')
 w(v); return out

def req(url,a,b):
 h={'User-Agent':UA,'Accept-Encoding':'identity','Range':f'bytes={a}-{b}'}
 with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=90) as r:d=r.read()
 if len(d)!=b-a+1: raise RuntimeError('range mismatch')
 return d

def head(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA,'Accept-Encoding':'identity'},method='HEAD'),timeout=60) as r:return int(r.headers['Content-Length'])

ZD=None
def extract(name):
 global ZD
 pi,pbytes,bbytes,md5,sha,crc=P[name]; pkg=f'InstallPage_{VER}_{pi+1}.zip'; url=f'{BASE}/{pkg}'
 if ZD is None:
  n=head(url)
  if n!=pbytes: raise RuntimeError('package size drift')
  t=min(1048576,n); tail=req(url,n-t,n-1); q=tail.rfind(b'PK\x05\x06'); _,_,_,_,cs,co,_=struct.unpack_from('<HHHHIIH',tail,q+4); cd=req(url,co,co+cs-1); e={}; i=0
  while i+46<=len(cd) and cd[i:i+4]==b'PK\x01\x02':
   fl,me=struct.unpack_from('<HH',cd,i+8); zcrc,cz,uz=struct.unpack_from('<III',cd,i+16); fn,ex,cm=struct.unpack_from('<HHH',cd,i+28); lo=struct.unpack_from('<I',cd,i+42)[0]; nb=cd[i+46:i+46+fn]; nm=nb.decode('utf-8' if fl&0x800 else 'cp437','replace'); e[norm(nm)]=(me,f'{zcrc:08X}',cz,lo); i+=46+fn+ex+cm
  ZD=(url,e)
 url,e=ZD; me,zcrc,cz,lo=[v for k,v in e.items() if k.endswith('/'+norm(name)) or k==norm(name)][0]; lh=req(url,lo,lo+4095); fn,ex=struct.unpack_from('<HH',lh,26); start=lo+30+fn+ex; c=req(url,start,start+cz-1); d=c if me==0 else zlib.decompress(c,-15)
 actual=(len(d),hashlib.md5(d).hexdigest().upper(),hashlib.sha256(d).hexdigest().upper(),f'{binascii.crc32(d)&0xffffffff:08X}')
 if actual!=(bbytes,md5,sha,crc) or zcrc!=crc: raise RuntimeError(f'{name} integrity mismatch')
 return d

def family(path):
 p=path.replace('\\','/').split('/'); i=next(i for i,x in enumerate(p) if x.lower()=='prefab'); return '/'.join(p[:i+1])
def bname(path):
 p=family(path).split('/'); return f'ui_{p[1].lower()}_{p[2].lower()}.b'

def external_meta(reader,file_id):
 af=getattr(reader,'assets_file',None); exts=getattr(af,'externals',None) or []
 if 1<=file_id<=len(exts):
  x=exts[file_id-1]; return {'path':str(getattr(x,'path','')),'name':str(getattr(x,'name','')),'guid':str(getattr(x,'guid','')),'type':str(getattr(x,'type',''))}
 return None

heroes=[]
for hid in sorted(IDS):
 x=json.loads((DETAIL/f'{hid}.json').read_text(encoding='utf-8')); src=x['presentation']['artwork']['sourceAssetPath']; heroes.append({'heroId':hid,'nameKr':x['identity']['nameKr'],'sourceArtworkPath':src,'bundleName':bname(src),'prefabPath':'assets/gameproject/runtimeassets/'+norm(src)})

out=[]; depout={}
for bn in sorted({h['bundleName'] for h in heroes}):
 raw=extract(bn); env=UnityPy.load(raw); objs={int(o.path_id):o for o in env.objects}; cont={norm(p):o for p,o in env.container.items()}
 files=[]
 for key,f in getattr(env,'files',{}).items():
  ex=[]
  for x in getattr(f,'externals',[]) or []: ex.append({'path':str(getattr(x,'path','')),'name':str(getattr(x,'name','')),'guid':str(getattr(x,'guid','')),'type':str(getattr(x,'type',''))})
  files.append({'key':str(key),'name':str(getattr(f,'name','')),'externals':ex})
 depstrings=[]
 for o in env.objects:
  if typ(o)=='AssetBundle':
   try: depstrings.extend([{'pathId':int(o.path_id),'field':p,'value':v} for p,v in strings(o.read_typetree())])
   except: pass
 depout[bn]={'files':files,'assetBundleStrings':depstrings}
 for h in [x for x in heroes if x['bundleName']==bn]:
  pre=cont[h['prefabPath']]; root=int(pre.path_id); q=deque([(root,0)]); seen=set(); nonzero=[]; zero_types={}
  while q and len(seen)<500:
   pid,depth=q.popleft()
   if pid in seen or depth>12 or pid not in objs: continue
   seen.add(pid); o=objs[pid]; zero_types[typ(o)]=zero_types.get(typ(o),0)+1
   try: tr=o.read_typetree()
   except: continue
   for field,fid,cid in refs(tr):
    if fid==0:
     if cid in objs and typ(objs[cid]) in ALLOWED and cid not in seen:q.append((cid,depth+1))
    else:
     nonzero.append({'fromPathId':pid,'fromType':typ(o),'fieldPath':field,'fileId':fid,'pathId':cid,'external':external_meta(o,fid)})
  out.append({**h,'prefabPathId':root,'visitedObjectCount':len(seen),'visitedTypeCounts':zero_types,'nonZeroRefs':nonzero})

summary={'status':'H_A5_SEVEN_EXTERNAL_REFERENCE_DIAGNOSTIC','heroCount':len(out),'heroes':out,'bundleDependencies':depout,'unityPyVersion':getattr(UnityPy,'__version__',None)}
(OUT/'hero-artwork-h-a5-seven-diagnostic.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'status':summary['status'],'heroCount':len(out),'nonZeroRefCounts':{str(r['heroId']):len(r['nonZeroRefs']) for r in out}},ensure_ascii=True))
