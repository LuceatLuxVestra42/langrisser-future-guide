import binascii, hashlib, io, json, os, pathlib, struct, urllib.request, zlib
from collections import defaultdict, deque
import UnityPy

ROOT=pathlib.Path(os.environ.get('RUNNER_TEMP','.'))/'hero-artwork-h-a5'; OUT=ROOT/'report'; OUT.mkdir(parents=True,exist_ok=True)
DETAIL=pathlib.Path('data/generated/hero-detail/by-id'); VER='1.1.113'; BASE=f'http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VER}'
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
BEGIN={24,45,16,35,1,3,4,28,88,89,92,105,109,99169,99171,99176,99181,99188,99193,99204,99206,99207,99232,99276,99277,99278,99281}
# bundle: layer, package index, package bytes, bundle bytes, md5, sha256, crc32
P={
'ui_heropainting_r_abs.b':('final',60,109027105,1234370,'19C940F7E635EC502768E701496F92B9','4F5E6D8202DC62E483CB090973BE9FFB80B0B96B0354358259EEF62BC8BBCA25','CE79F47D'),
'begin_ui_heropainting_r_abs.b':('begin',25,113636260,509982,'9D18E3360DE378C6FB8F5758F507D1A8','71A830A444269E9611D74D8F9E880783FFEF291E2F2D9E34F29EF1CB0E21AB49','98999A3B'),
'ui_heropainting_sr_abs.b':('final',60,109027105,4204670,'50C4FFD5AB6F7CBD8A0B39117F9CA101','294750FF12725BF5B8DF906B6CFAB702AF6352F7BAAF2203553E3E5EACDE8ED2','BD688F0F'),
'begin_ui_heropainting_sr_abs.b':('begin',25,113636260,542747,'28C0FF4A9DD4B9E0E32CECDCFEB65465','93D7B9BF9B51D4150AB99002AD5DC9BEDEE774BFCE03A9E0FF3CFC600E350654','44BCA97B'),
'ui_heropainting_ssr_abs.b':('final',60,109027105,25793935,'168B2D54E39D62B98CD1E92BDE9F787B','818942EA601B584D007D97A0E2A388554AFBAF6A83A36302E241601015D87492','4682CEA2'),
'begin_ui_heropainting_ssr_abs.b':('begin',25,113636260,3710837,'16CF10B79FF22F3CE1BF78B45D05DFA8','7C1551C8A4626CAA0BAB5E83A6A5BC4B3EF804E831D570C724D94193C4569F8A','A06A3B3B'),
'ui_heropainting01_ssr_abs.b':('final',59,109932003,1691149,'62B9FBBF127C06DEB2DF05AAA7B27B45','D6D6703231462DF82E0EFE4E04EF6DF007B040E64458C512BDB5A6A98BEFF085','443949F3'),
'ui_heropainting2_sr_abs.b':('final',59,109932003,129396,'A3562B74ED28963AB28C094F5D35D3AA','26D42F36307FD0D2956852FE7578FAA86B5C93B5CDEEEC677422F2F69D0AF2F9','2213DF27'),
'ui_heropainting2_ssr_abs.b':('final',59,109932003,22281425,'F761441E61BDD29E4A15511AB586D010','15C8BF6DA53E44FC6D252DAB82D2AED8320618A507F5AA24BA421E8ACF91A73C','9E9468FC'),
'begin_ui_heropainting2_ssr_abs.b':('begin',25,113636260,2199501,'A147491BCABEA405E11C6B38CE341414','60DEE0C7B95366FAA2A72FCB307674C0DF86CBD4334813A2831520C070C6E422','0A6C0CCE'),
'ui_heropainting3_ssr_abs.b':('final',60,109027105,5134422,'74E60EFC2536FC98EC1CD38CF099A043','BDEA49BC1F33B76D39C68751A0B1A085DAF7300643BF1024562F5E9013B8B51E','12D207E7'),
'begin_ui_heropainting3_ssr_abs.b':('begin',25,113636260,1185839,'497DA317E1BEF7118265BE556BC71C94','EC8FB4D57ACDEEBC724AEBC183FA4A6B5AB2E7F08F196AA11536C24B7C33A1E1','B048BBA2')}
ALLOWED={'GameObject','Transform','RectTransform','MonoBehaviour','CanvasRenderer','SpriteRenderer','Sprite','Texture2D','Material','Animator','Animation'}

def norm(x): return str(x).replace('\\','/').strip('/').lower()
def typ(o): return getattr(getattr(o,'type',None),'name',None)
def refs(v):
    out=[]
    def walk(x,path=''):
        if isinstance(x,dict):
            if 'm_FileID' in x and 'm_PathID' in x:
                try: out.append((path,int(x['m_FileID']),int(x['m_PathID'])))
                except: pass
            for k,y in x.items(): walk(y,f'{path}.{k}' if path else str(k))
        elif isinstance(x,list):
            for i,y in enumerate(x): walk(y,f'{path}[{i}]')
    walk(v); return out

def req(url,a=None,b=None):
    h={'User-Agent':UA,'Accept-Encoding':'identity'}
    if a is not None: h['Range']=f'bytes={a}-{b}'
    with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=90) as r: d=r.read()
    if a is not None and len(d)!=b-a+1: raise RuntimeError(f'range mismatch {len(d)} != {b-a+1}')
    return d

def head(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA,'Accept-Encoding':'identity'},method='HEAD'),timeout=60) as r:
        return int(r.headers['Content-Length'])

Z={}
def zipdir(pkg,pbytes):
    if pkg in Z:return Z[pkg]
    url=f'{BASE}/{pkg}'; n=head(url)
    if n!=pbytes: raise RuntimeError(f'{pkg} size drift {n} != {pbytes}')
    t=min(1048576,n); tail=req(url,n-t,n-1); q=tail.rfind(b'PK\x05\x06')
    if q<0: raise RuntimeError('EOCD missing')
    _,_,_,_,cs,co,_=struct.unpack_from('<HHHHIIH',tail,q+4); cd=req(url,co,co+cs-1); e={}; i=0
    while i+46<=len(cd) and cd[i:i+4]==b'PK\x01\x02':
        fl,me=struct.unpack_from('<HH',cd,i+8); crc,cz,uz=struct.unpack_from('<III',cd,i+16); fn,ex,cm=struct.unpack_from('<HHH',cd,i+28); lo=struct.unpack_from('<I',cd,i+42)[0]
        nb=cd[i+46:i+46+fn]; name=nb.decode('utf-8' if fl&0x800 else 'cp437','replace'); e[norm(name)]=(name,me,f'{crc:08X}',cz,uz,lo); i+=46+fn+ex+cm
    Z[pkg]=(url,e,t+cs); return Z[pkg]

def bundle(name):
    layer,pi,pbytes,bbytes,md5,sha,crc=P[name]; pkg=f'InstallPage_{VER}_{pi+1}.zip'; url,e,dirbytes=zipdir(pkg,pbytes); hits=[x for k,x in e.items() if k==norm(name) or k.endswith('/'+norm(name))]
    if len(hits)!=1: raise RuntimeError(f'{name} zip hits {len(hits)}')
    _,_,zcrc,cz,_,lo=hits[0]; lh=req(url,lo,lo+4095); fl,me=struct.unpack_from('<HH',lh,6); fn,ex=struct.unpack_from('<HH',lh,26); start=lo+30+fn+ex; c=req(url,start,start+cz-1); d=c if me==0 else zlib.decompress(c,-15)
    actual=(len(d),hashlib.md5(d).hexdigest().upper(),hashlib.sha256(d).hexdigest().upper(),f'{binascii.crc32(d)&0xffffffff:08X}')
    if actual!=(bbytes,md5,sha,crc) or zcrc!=crc: raise RuntimeError(f'{name} integrity mismatch {actual}')
    return d,{'layer':layer,'packageIndex':pi,'packageName':pkg,'packageBytes':pbytes,'bundleName':name,'bundleBytes':bbytes,'bundleMd5':md5,'bundleSha256':sha,'bundleCrc32':crc,'compressedBytesFetched':cz,'directoryBytesFetched':dirbytes}

def fam(path):
    p=str(path).replace('\\','/').split('/'); i=next(i for i,x in enumerate(p) if x.lower()=='prefab'); return '/'.join(p[:i+1])
def final_name(f):
    p=f.split('/'); return f'ui_{p[1].lower()}_{p[2].lower()}.b'

heroes=[]
for f in sorted(DETAIL.glob('*.json'),key=lambda p:int(p.stem)):
    x=json.loads(f.read_text(encoding='utf-8')); hid=int(x['heroId']); src=x['presentation']['artwork']['sourceAssetPath']; fa=fam(src); bn=final_name(fa); layer='begin' if hid in BEGIN else 'final'; bn='begin_'+bn if layer=='begin' else bn
    heroes.append({'heroId':hid,'nameKr':x.get('identity',{}).get('nameKr'),'nameEn':x.get('identity',{}).get('nameEn'),'sourceArtworkPath':src,'family':fa,'layer':layer,'bundleName':bn,'prefabContainerPath':'assets/gameproject/runtimeassets/'+norm(src)})
if len(heroes)!=267 or {x['heroId'] for x in heroes if x['layer']=='begin'}!=BEGIN: raise RuntimeError('H-A4 assignment drift')
g=defaultdict(list)
for h in heroes:
    if h['bundleName'] not in P: raise RuntimeError(f"missing provenance {h['bundleName']}")
    g[h['bundleName']].append(h)
if len(g)!=12: raise RuntimeError(f'bundle count {len(g)}')

results=[]; bundles=[]
for bn in sorted(g):
    raw,prov=bundle(bn); env=UnityPy.load(raw); objs={int(o.path_id):o for o in env.objects}; cont={norm(p):o for p,o in env.container.items()}; tree={}
    def t(pid):
        if pid not in tree:
            try: tree[pid]=objs[pid].read_typetree()
            except: tree[pid]=None
        return tree[pid]
    passed=0
    for h in sorted(g[bn],key=lambda x:x['heroId']):
        pre=cont.get(h['prefabContainerPath']); row={**h,'packageName':prov['packageName'],'bundleMd5':prov['bundleMd5'],'bundleSha256':prov['bundleSha256']}
        if pre is None: row.update(status='REVIEW',selectionStatus='PREFAB_MISSING',prefabPathId=None,candidates=[]); results.append(row); continue
        root=int(pre.path_id); q=deque([(root,0)]); seen=set(); sids=set()
        while q and len(seen)<500:
            pid,depth=q.popleft()
            if pid in seen or depth>12 or pid not in objs: continue
            seen.add(pid); o=objs[pid]
            if typ(o)=='Sprite': sids.add(pid)
            tr=t(pid)
            if tr is None: continue
            for _,fid,cid in refs(tr):
                if fid==0 and cid in objs and typ(objs[cid]) in ALLOWED and cid not in seen: q.append((cid,depth+1))
        cand=[]
        for sid in sorted(sids):
            sr=objs[sid]; tr=t(sid); tids=[]
            if tr is not None:
                for field,fid,tid in refs(tr):
                    if field=='m_RD.texture' and fid==0 and tid in objs and typ(objs[tid])=='Texture2D': tids.append(tid)
            try:
                sd=sr.read(); im=sd.image; buf=io.BytesIO(); im.save(buf,format='PNG'); png=buf.getvalue(); rgba=im.convert('RGBA').tobytes()
                c={'spritePathId':sid,'spriteName':str(getattr(sd,'m_Name','')),'texturePathIds':sorted(set(tids)),'width':im.width,'height':im.height,'pngSha256':hashlib.sha256(png).hexdigest().upper(),'rgbaSha256':hashlib.sha256(rgba).hexdigest().upper()}
                if c['texturePathIds']: cand.append(c)
            except Exception: pass
        if len(cand)==1:
            c=cand[0]; row.update(status='PASS',selectionStatus='UNIQUE_REFERENCED_SPRITE',prefabPathId=root,spritePathId=c['spritePathId'],texturePathIds=c['texturePathIds'],width=c['width'],height=c['height'],pngSha256=c['pngSha256'],rgbaSha256=c['rgbaSha256'],targetWebPath=f'public/images/heroes/cards/{h["heroId"]}.png',candidates=cand); passed+=1
        else:
            row.update(status='REVIEW',selectionStatus='NO_REFERENCED_SPRITE' if not cand else 'AMBIGUOUS_REFERENCED_SPRITES',prefabPathId=root,candidates=cand)
        results.append(row)
    bundles.append({**prov,'assignedHeroCount':len(g[bn]),'passHeroCount':passed,'reviewHeroCount':len(g[bn])-passed})

results.sort(key=lambda x:x['heroId']); review=[x for x in results if x['status']!='PASS']; status='H_A5_BULK_EXTRACTION_INDEX_COMPLETE' if not review else 'H_A5_BULK_EXTRACTION_INDEX_WITH_REVIEW'
summary={'status':status,'installVersion':VER,'inputOwnershipStatus':'H_A4_BUNDLE_OWNERSHIP_RESOLVED','canonicalHeroCount':267,'beginOnlyHeroCount':27,'usedBundleCount':12,'heroPassCount':267-len(review),'heroReviewCount':len(review),'bundleFetchDecodeRule':'each owning bundle fetched and decoded exactly once','selectionPolicy':'serialized PPtr traversal only; filename similarity is not used; unique renderable referenced Sprite is auto-selected','targetWebContract':'public/images/heroes/cards/{heroId}.png','binaryCommitPerformed':False,'reviewHeroes':[{'heroId':x['heroId'],'nameKr':x['nameKr'],'bundleName':x['bundleName'],'selectionStatus':x['selectionStatus'],'candidateCount':len(x['candidates'])} for x in review],'bundleResults':bundles,'unityPyVersion':getattr(UnityPy,'__version__',None)}
(OUT/'hero-artwork-h-a5-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8'); (OUT/'hero-artwork-h-a5-index.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8'); (OUT/'hero-artwork-h-a5-bundle-provenance.json').write_text(json.dumps(bundles,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'status':status,'heroPassCount':267-len(review),'heroReviewCount':len(review),'reviewHeroIds':[x['heroId'] for x in review]},ensure_ascii=True))
if review: raise SystemExit(4)
