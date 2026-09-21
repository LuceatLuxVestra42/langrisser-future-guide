#!/usr/bin/env python3
import binascii, hashlib, json, os, pathlib, struct, urllib.request, zlib
import UnityPy

EVIDENCE=pathlib.Path(__file__).resolve().parent/'fixture.v1.json'
HERO_ID=int(os.environ['HERO_ID']); CHAR_IMAGE_ID=int(os.environ['CHAR_IMAGE_ID'])
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
ev=json.loads(EVIDENCE.read_text(encoding='utf-8'))
rows=[r for r in ev['records'] if int(r['heroId'])==HERO_ID and int(r['charImageId'])==CHAR_IMAGE_ID]
if len(rows)!=1: raise RuntimeError(f'evidence record cardinality {len(rows)}')
r=rows[0]; ver=ev['officialInstallerVersion']; base=f'http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{ver}'
out=pathlib.Path('out')/str(HERO_ID); rawdir=out/'raw'; rawdir.mkdir(parents=True,exist_ok=True)

def norm(x):return str(x).replace('\\','/').strip('/').lower()
def req(url,a,b):
 h={'User-Agent':UA,'Accept-Encoding':'identity','Range':f'bytes={a}-{b}'}
 with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=90) as q:d=q.read()
 if len(d)!=b-a+1:raise RuntimeError('range mismatch')
 return d
def head(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA,'Accept-Encoding':'identity'},method='HEAD'),timeout=60) as q:return int(q.headers['Content-Length'])
def zip_dir(url,n):
 t=min(1048576,n);tail=req(url,n-t,n-1);q=tail.rfind(b'PK\x05\x06')
 if q<0:raise RuntimeError('EOCD missing')
 _,_,_,_,cs,co,_=struct.unpack_from('<HHHHIIH',tail,q+4);cd=req(url,co,co+cs-1);res=[];i=0
 while i+46<=len(cd) and cd[i:i+4]==b'PK\x01\x02':
  fl,me=struct.unpack_from('<HH',cd,i+8);crc,cz,uz=struct.unpack_from('<III',cd,i+16);fn,ex,cm=struct.unpack_from('<HHH',cd,i+28);lo=struct.unpack_from('<I',cd,i+42)[0]
  nb=cd[i+46:i+46+fn];name=nb.decode('utf-8' if fl&0x800 else 'cp437','replace');res.append({'name':name,'method':me,'crc':crc,'compressed':cz,'uncompressed':uz,'offset':lo});i+=46+fn+ex+cm
 return res
def fetch_entry(url,e):
 lo=e['offset'];lh=req(url,lo,lo+4095);fn,ex=struct.unpack_from('<HH',lh,26);start=lo+30+fn+ex;c=req(url,start,start+e['compressed']-1)
 d=c if e['method']==0 else zlib.decompress(c,-15) if e['method']==8 else None
 if d is None or len(d)!=e['uncompressed'] or (binascii.crc32(d)&0xffffffff)!=e['crc']:raise RuntimeError('entry integrity mismatch')
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
 d=o.read();s=getattr(d,'script',None)
 if s is None:s=safe_tree(o).get('m_Script')
 if isinstance(s,str):return s.encode('utf-8',errors='surrogateescape')
 if isinstance(s,(bytes,bytearray,memoryview)):return bytes(s)
 raise RuntimeError('unsupported TextAsset')
def name_of(o):
 t=safe_tree(o)
 for k in ('m_Name','name','Name'):
  if isinstance(t.get(k),str) and t[k]:return t[k]
 return ''
def varint(data,off):
 x=0;sh=0
 for _ in range(5):
  b=data[off];off+=1;x|=(b&127)<<sh
  if not b&128:return x,off
  sh+=7
 raise RuntimeError('bad varint')
def spstr(data,off):
 n,off=varint(data,off)
 if n==0:return None,off
 n-=1;return data[off:off+n].decode('utf-8'),off+n

url=f"{base}/{r['packageName']}";n=head(url);entries=zip_dir(url,n);bm=[e for e in entries if norm(e['name'])==norm(r['bundleEntry'])]
if len(bm)!=1:raise RuntimeError(f'exact bundle entry count {len(bm)}')
bundle=fetch_entry(url,bm[0]);bsha=hashlib.sha256(bundle).hexdigest()
if bsha!=r['bundleSha256']:raise RuntimeError(f'bundle hash drift {bsha}')
env=UnityPy.load(bundle);objs={int(x.path_id):x for x in env.objects};containers=[(p,(v.deref() if hasattr(v,'deref') else v)) for p,v in env.container.items()]
runtime='assets/gameproject/runtimeassets/'+norm(r['sourceSpinePath']);pm=[(p,o) for p,o in containers if norm(p)==runtime]
if len(pm)!=1:raise RuntimeError(f'exact prefab count {len(pm)}')
prefab_path,prefab=pm[0];component_ids=[pid for _,fid,pid in refs(safe_tree(prefab)) if fid==0 and pid in objs];sd=None
for pid in component_ids:
 for field,fid,target in refs(safe_tree(objs[pid])):
  if field.endswith('.skeletonDataAsset') and fid==0 and target in objs:sd=objs[target];break
 if sd is not None:break
if sd is None:raise RuntimeError('skeletonDataAsset PPtr missing')
queue=[sd];seen=set();atlases=[];skels=[]
for _ in range(3):
 nxt=[]
 for o in queue:
  pid=int(o.path_id)
  if pid in seen:continue
  seen.add(pid);typ=o.type.name;nm=name_of(o);payload=None
  if typ=='TextAsset':
   payload=text_bytes(o);low=nm.lower()
   if '.atlas' in low:atlases.append((pid,nm,payload))
   if '.skel' in low:skels.append((pid,nm,payload))
  for _,fid,cid in refs(safe_tree(o)):
   if fid==0 and cid in objs and cid not in seen:nxt.append(objs[cid])
 queue=nxt
if len(atlases)!=1 or len(skels)!=1:raise RuntimeError(f'atlas/skel cardinality {len(atlases)}/{len(skels)}')
apid,aname,abytes=atlases[0];spid,sname,sbytes=skels[0]
atlas=rawdir/f'{apid}-{aname}.atlas.txt';skel=rawdir/f'{spid}-{sname}.skel.bytes';atlas.write_bytes(abytes);skel.write_bytes(sbytes)
_,off=spstr(sbytes,0);spver,_=spstr(sbytes,off)
if spver!='3.3.05':raise RuntimeError(f'Spine version drift {spver}')
lines=[x for x in atlas.read_text(encoding='utf-8').splitlines() if x.strip()]
page=lines[0].strip();texruntime=norm(str(pathlib.PurePosixPath(r['sourceSpinePath']).parent/page));tm=[(p,o) for p,o in containers if norm(p)==('assets/gameproject/runtimeassets/'+texruntime)]
if len(tm)!=1 or tm[0][1].type.name!='Texture2D':raise RuntimeError(f'exact texture count/type {len(tm)}')
img=tm[0][1].read().image;texture=rawdir/page;img.save(texture)
result={'status':'PASS_SP_RENDER_INPUT','heroId':HERO_ID,'charImageId':CHAR_IMAGE_ID,'sourceSpinePath':r['sourceSpinePath'],'packageName':r['packageName'],'bundleEntry':r['bundleEntry'],'bundleSha256':bsha,'prefabRuntimePath':prefab_path,'prefabObjectSha256':hashlib.sha256(prefab.get_raw_data()).hexdigest(),'spineVersion':spver,'atlasPath':atlas.as_posix(),'skeletonPath':skel.as_posix(),'texturePath':texture.as_posix(),'textureRuntimePath':tm[0][0],'textureSize':[img.width,img.height]}
(out/'input.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
