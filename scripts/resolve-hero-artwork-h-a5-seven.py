import binascii, hashlib, io, json, os, pathlib, struct, urllib.request, zlib
from collections import deque
import UnityPy

OUT=pathlib.Path(os.environ.get('RUNNER_TEMP','.'))/'hero-artwork-h-a5-seven-resolve'/'report'; OUT.mkdir(parents=True,exist_ok=True)
DETAIL=pathlib.Path('data/generated/hero-detail/by-id'); VER='1.1.113'; BASE=f'http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VER}'
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'; IDS={17,42,48,54,58,66,80}
P={
'ui_heropainting_r_abs.b':(60,109027105,1234370,'19C940F7E635EC502768E701496F92B9','4F5E6D8202DC62E483CB090973BE9FFB80B0B96B0354358259EEF62BC8BBCA25','CE79F47D'),
'begin_ui_heropainting_r_abs.b':(25,113636260,509982,'9D18E3360DE378C6FB8F5758F507D1A8','71A830A444269E9611D74D8F9E880783FFEF291E2F2D9E34F29EF1CB0E21AB49','98999A3B'),
'ui_heropainting_sr_abs.b':(60,109027105,4204670,'50C4FFD5AB6F7CBD8A0B39117F9CA101','294750FF12725BF5B8DF906B6CFAB702AF6352F7BAAF2203553E3E5EACDE8ED2','BD688F0F'),
'begin_ui_heropainting_sr_abs.b':(25,113636260,542747,'28C0FF4A9DD4B9E0E32CECDCFEB65465','93D7B9BF9B51D4150AB99002AD5DC9BEDEE774BFCE03A9E0FF3CFC600E350654','44BCA97B'),
'ui_heropainting_ssr_abs.b':(60,109027105,25793935,'168B2D54E39D62B98CD1E92BDE9F787B','818942EA601B584D007D97A0E2A388554AFBAF6A83A36302E241601015D87492','4682CEA2'),
'begin_ui_heropainting_ssr_abs.b':(25,113636260,3710837,'16CF10B79FF22F3CE1BF78B45D05DFA8','7C1551C8A4626CAA0BAB5E83A6A5BC4B3EF804E831D570C724D94193C4569F8A','A06A3B3B')}

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

def req(url,a,b):
 h={'User-Agent':UA,'Accept-Encoding':'identity','Range':f'bytes={a}-{b}'}
 with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=90) as r:d=r.read()
 if len(d)!=b-a+1: raise RuntimeError('range mismatch')
 return d

def head(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA,'Accept-Encoding':'identity'},method='HEAD'),timeout=60) as r:return int(r.headers['Content-Length'])

Z={}
def zipdir(pi,pbytes):
 if pi in Z:return Z[pi]
 pkg=f'InstallPage_{VER}_{pi+1}.zip'; url=f'{BASE}/{pkg}'; n=head(url)
 if n!=pbytes: raise RuntimeError(f'{pkg} size drift')
 t=min(1048576,n); tail=req(url,n-t,n-1); q=tail.rfind(b'PK\x05\x06'); _,_,_,_,cs,co,_=struct.unpack_from('<HHHHIIH',tail,q+4); cd=req(url,co,co+cs-1); e={}; i=0
 while i+46<=len(cd) and cd[i:i+4]==b'PK\x01\x02':
  fl,me=struct.unpack_from('<HH',cd,i+8); zcrc,cz,uz=struct.unpack_from('<III',cd,i+16); fn,ex,cm=struct.unpack_from('<HHH',cd,i+28); lo=struct.unpack_from('<I',cd,i+42)[0]; nb=cd[i+46:i+46+fn]; nm=nb.decode('utf-8' if fl&0x800 else 'cp437','replace'); e[norm(nm)]=(me,f'{zcrc:08X}',cz,lo); i+=46+fn+ex+cm
 Z[pi]=(url,e); return Z[pi]
def extract(name):
 pi,pbytes,bbytes,md5,sha,crc=P[name]; url,e=zipdir(pi,pbytes); hit=[v for k,v in e.items() if k==norm(name) or k.endswith('/'+norm(name))]
 if len(hit)!=1: raise RuntimeError(f'{name} zip hits {len(hit)}')
 me,zcrc,cz,lo=hit[0]; lh=req(url,lo,lo+4095); fn,ex=struct.unpack_from('<HH',lh,26); s=lo+30+fn+ex; c=req(url,s,s+cz-1); d=c if me==0 else zlib.decompress(c,-15); actual=(len(d),hashlib.md5(d).hexdigest().upper(),hashlib.sha256(d).hexdigest().upper(),f'{binascii.crc32(d)&0xffffffff:08X}')
 if actual!=(bbytes,md5,sha,crc) or zcrc!=crc: raise RuntimeError(f'{name} integrity mismatch')
 return d,{'packageIndex':pi,'packageName':f'InstallPage_{VER}_{pi+1}.zip','bundleName':name,'bundleBytes':bbytes,'bundleMd5':md5,'bundleSha256':sha,'bundleCrc32':crc}
def family(path):
 p=path.replace('\\','/').split('/'); i=next(i for i,x in enumerate(p) if x.lower()=='prefab'); return '/'.join(p[:i+1])
def final_name(path):
 p=family(path).split('/'); return f'ui_{p[1].lower()}_{p[2].lower()}.b'

cache={}
def env_for(name):
 if name not in cache:
  raw,prov=extract(name); env=UnityPy.load(raw); cache[name]=(env,{int(o.path_id):o for o in env.objects},{norm(p):o for p,o in env.container.items()},prov)
 return cache[name]

rows=[]
for hid in sorted(IDS):
 x=json.loads((DETAIL/f'{hid}.json').read_text(encoding='utf-8')); src=x['presentation']['artwork']['sourceAssetPath']; fn=final_name(src); bn='begin_'+fn; fenv,fobjs,fcont,fprov=env_for(fn); benv,bobjs,bcont,bprov=env_for(bn); wanted='assets/gameproject/runtimeassets/'+norm(src); pre=fcont.get(wanted)
 if pre is None: raise RuntimeError(f'{hid} exact final prefab missing')
 root=int(pre.path_id); q=deque([(root,0)]); seen=set(); external=[]
 while q and len(seen)<500:
  pid,depth=q.popleft()
  if pid in seen or depth>12 or pid not in fobjs: continue
  seen.add(pid); o=fobjs[pid]
  try: tr=o.read_typetree()
  except: continue
  for field,fid,cid in refs(tr):
   if fid==0:
    if cid in fobjs and typ(fobjs[cid]) in {'GameObject','Transform','RectTransform','MonoBehaviour','CanvasRenderer','SpriteRenderer','Sprite','Texture2D','Material','Animator','Animation'} and cid not in seen:q.append((cid,depth+1))
   elif field.endswith('m_Sprite') or field=='m_Sprite': external.append({'fromPathId':pid,'fromType':typ(o),'fieldPath':field,'fileId':fid,'pathId':cid})
 if len(external)!=1 or external[0]['fileId']!=1: raise RuntimeError(f'{hid} expected one fileID=1 m_Sprite, got {external}')
 spid=external[0]['pathId']; sr=bobjs.get(spid)
 if sr is None or typ(sr)!='Sprite': raise RuntimeError(f'{hid} dependency Sprite {spid} not found/type={typ(sr) if sr else None}')
 st=sr.read_typetree(); tex=[]
 for field,fid,tid in refs(st):
  if field=='m_RD.texture' and fid==0 and tid in bobjs and typ(bobjs[tid])=='Texture2D': tex.append(tid)
 if not tex: raise RuntimeError(f'{hid} dependency Sprite has no local m_RD.texture')
 sd=sr.read(); im=sd.image; buf=io.BytesIO(); im.save(buf,format='PNG'); png=buf.getvalue(); rgba=im.convert('RGBA').tobytes()
 rows.append({'heroId':hid,'nameKr':x['identity']['nameKr'],'sourceArtworkPath':src,'finalPackageName':fprov['packageName'],'finalBundleName':fn,'finalBundleSha256':fprov['bundleSha256'],'prefabPathId':root,'dependencyBundleName':bn,'dependencyBundleSha256':bprov['bundleSha256'],'externalFileId':1,'spritePathId':spid,'spriteName':str(getattr(sd,'m_Name','')),'texturePathIds':sorted(set(tex)),'width':im.width,'height':im.height,'pngSha256':hashlib.sha256(png).hexdigest().upper(),'rgbaSha256':hashlib.sha256(rgba).hexdigest().upper(),'targetWebPath':f'public/images/heroes/cards/{hid}.png','selectionStatus':'EXTERNAL_DEPENDENCY_SPRITE_FILEID1','status':'PASS'})

summary={'status':'H_A5_SEVEN_EXTERNAL_DEPENDENCY_RESOLVED' if len(rows)==7 else 'INCOMPLETE','heroCount':len(rows),'selectionRule':'exact final prefab serialized m_Sprite PPtr fileID=1 -> AssetBundle m_Dependencies[0] begin_ family bundle -> exact dependency Sprite pathId -> local m_RD.texture Texture2D; no filename selection','heroes':rows,'unityPyVersion':getattr(UnityPy,'__version__',None)}
(OUT/'hero-artwork-h-a5-seven-resolved.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps({'status':summary['status'],'heroCount':len(rows),'heroIds':[r['heroId'] for r in rows]},ensure_ascii=True))
if len(rows)!=7: raise SystemExit(4)
