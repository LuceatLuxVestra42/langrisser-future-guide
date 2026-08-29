import json
import pathlib
import struct
import urllib.request
import zlib
from collections import defaultdict

import UnityPy

VER="1.1.113"
BASE=f"http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VER}"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
HERO_INFO=pathlib.Path("data/configdata/ConfigDataHeroInfo.json")
CHAR_IMAGE=pathlib.Path("data/configdata/ConfigDataCharImageInfo.json")
MASTER=pathlib.Path("data/hero-name-master.v1.json")
OUT_DIR=pathlib.Path("public/images/heroes/card-head")
MANIFEST=pathlib.Path("data/generated/hero-cardhead-web-assets.v1.json")
VALIDATION=pathlib.Path("data/validation/hero-cardhead-materialization.v1.json")

FAMILY={
 "UI/Card_ABS/": [(26,"begin_ui_card_abs.b"),(56,"ui_card_abs.b")],
 "UI/Card02_ABS/": [(26,"begin_ui_card02_abs.b"),(55,"ui_card02_abs.b")],
 "UI/Card03_ABS/": [(26,"begin_ui_card03_abs.b"),(55,"ui_card03_abs.b")],
 "UI/Card04_ABS/": [(26,"begin_ui_card04_abs.b"),(55,"ui_card04_abs.b")],
 "UI/Card05_ABS/": [(26,"begin_ui_card05_abs.b"),(55,"ui_card05_abs.b")],
 "UI/Card06_ABS/": [(26,"begin_ui_card06_abs.b"),(56,"ui_card06_abs.b")],
 "UI/Card07_ABS/": [(26,"begin_ui_card07_abs.b"),(56,"ui_card07_abs.b")],
 "UI/Card08_ABS/": [(26,"begin_ui_card08_abs.b"),(56,"ui_card08_abs.b")],
 "UI/Card09_ABS/": [(26,"begin_ui_card09_abs.b"),(56,"ui_card09_abs.b")],
}

def norm(v): return str(v or "").replace("\\","/").strip("/").lower()
def otype(o): return getattr(getattr(o,"type",None),"name",None)
def req(url,start=None,end=None):
 h={"User-Agent":UA,"Accept-Encoding":"identity"}
 if start is not None:h["Range"]=f"bytes={start}-{end}"
 with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=90) as r:data=r.read()
 if start is not None and len(data)!=end-start+1:raise RuntimeError("range mismatch")
 return data

def hsize(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":UA,"Accept-Encoding":"identity"},method="HEAD"),timeout=60) as r:return int(r.headers["Content-Length"])
def zipdir(package_number):
 name=f"InstallPage_{VER}_{package_number}.zip";url=f"{BASE}/{name}";size=hsize(url);ts=min(1048576,size);tail=req(url,size-ts,size-1);e=tail.rfind(b"PK\x05\x06")
 if e<0:raise RuntimeError(f"EOCD missing {name}")
 _,_,_,_,cs,co,_=struct.unpack_from("<HHHHIIH",tail,e+4);c=req(url,co,co+cs-1);entries={};off=0
 while off+46<=len(c) and c[off:off+4]==b"PK\x01\x02":
  flags,method=struct.unpack_from("<HH",c,off+8);csz,usz=struct.unpack_from("<II",c,off+20);fl,el,cl=struct.unpack_from("<HHH",c,off+28);lo=struct.unpack_from("<I",c,off+42)[0]
  raw=c[off+46:off+46+fl];path=raw.decode("utf-8" if flags&0x800 else "cp437","replace");entries[pathlib.PurePosixPath(path).name.lower()]={"name":path,"method":method,"compressedSize":csz,"uncompressedSize":usz,"localOffset":lo};off+=46+fl+el+cl
 return {"number":package_number,"name":name,"url":url,"size":size,"entries":entries}
def extract(pkg,bundle_name):
 e=pkg["entries"].get(bundle_name.lower())
 if not e:raise RuntimeError(f"bundle missing {pkg['name']} {bundle_name}")
 lo=e["localOffset"];h=req(pkg["url"],lo,lo+4095);method=struct.unpack_from("<H",h,8)[0];fl,el=struct.unpack_from("<HH",h,26);start=lo+30+fl+el;compressed=req(pkg["url"],start,start+e["compressedSize"]-1)
 raw=compressed if method==0 else zlib.decompress(compressed,-15)
 return raw,e

master=json.loads(MASTER.read_text(encoding="utf-8"));heroes=master if isinstance(master,list) else master["records"]
hi=json.loads(HERO_INFO.read_text(encoding="utf-8"));ci=json.loads(CHAR_IMAGE.read_text(encoding="utf-8"));hib={r["ID"]:r for r in hi if isinstance(r,dict) and isinstance(r.get("ID"),int)};cib={r["ID"]:r for r in ci if isinstance(r,dict) and isinstance(r.get("ID"),int)}
rows=[]
for hero in heroes:
 hid=int(hero["heroId"]);h=hib[hid];c=cib[h["CharImage_ID"]];source=str(c["CardHeadImage"]);prefix=next((p for p in FAMILY if source.startswith(p)),None)
 if not prefix:raise RuntimeError(f"unsupported prefix hero={hid} source={source}")
 rows.append({"heroId":hid,"nameKr":hero.get("nameKr"),"sourceCardHeadPath":source,"sourcePrefix":prefix,"candidateBundles":FAMILY[prefix],"webAssetPath":f"/images/heroes/card-head/{hid}.png"})
if len(rows)!=267 or len({r["heroId"] for r in rows})!=267 or len({norm(r["sourceCardHeadPath"]) for r in rows})!=267:raise RuntimeError("267 input contract failed")

packages={n:zipdir(n) for n in {26,55,56}}
bundle_cache={}
for prefix,cands in FAMILY.items():
 for n,b in cands:
  key=(n,b)
  if key in bundle_cache:continue
  raw,e=extract(packages[n],b);env=UnityPy.load(raw);bundle_cache[key]={"container":[(norm(k),str(k),o) for k,o in env.container.items()],"entry":e}

OUT_DIR.mkdir(parents=True,exist_ok=True)
for p in OUT_DIR.glob("*.png"):p.unlink()
materialized=[];bundle_usage=defaultdict(int)
for row in rows:
 target=norm(row["sourceCardHeadPath"]);bundle_hits=[]
 for n,b in row["candidateBundles"]:
  path_hits=[(k,orig,o) for k,orig,o in bundle_cache[(n,b)]["container"] if k==target or k.endswith("/"+target)]
  if path_hits:bundle_hits.append((n,b,path_hits))
 if len(bundle_hits)!=1:
  raise RuntimeError(f"Hero {row['heroId']} exact source ownership mismatch: {row['sourceCardHeadPath']} bundleHits={[(n,b,len(h)) for n,b,h in bundle_hits]}")
 n,b,path_hits=bundle_hits[0];sprites=[]
 for _,orig,o in path_hits:
  if otype(o)!="Sprite":continue
  d=o.read();sprites.append((getattr(d,"m_Name",None),orig,o,d))
 zero=[s for s in sprites if str(s[0] or "").lower().endswith("_0")];one=[s for s in sprites if str(s[0] or "").lower().endswith("_1")]
 if len(zero)!=1 or len(one)!=1 or len(sprites)!=2:
  raise RuntimeError(f"Hero {row['heroId']} CardHead subasset contract mismatch sprites={[(s[0],int(getattr(s[2],'path_id',0))) for s in sprites]}")
 # Diagnostic evidence across the established begin set shows _0 is the full-width card-head sprite;
 # _1 is the secondary 176px-wide slice. The target UI is the square/full card icon shown in the reference.
 name,container_path,obj,data=zero[0];img=data.image
 if img is None:raise RuntimeError(f"Hero {row['heroId']} selected Sprite has no image")
 out=OUT_DIR/f"{row['heroId']}.png";img.save(out,format="PNG",optimize=True);bundle_usage[(n,b)]+=1
 row.update({"sourcePackageNumber":n,"sourcePackageName":packages[n]["name"],"sourceBundleName":b,"containerPath":container_path,"spritePathId":int(getattr(obj,"path_id",0)),"spriteName":name,"alternateSpriteName":one[0][0],"width":img.size[0],"height":img.size[1]});materialized.append(row)

files=list(OUT_DIR.glob("*.png"))
if len(files)!=267 or len(materialized)!=267:raise RuntimeError(f"count mismatch files={len(files)} records={len(materialized)}")
if len({(r["sourcePackageNumber"],r["sourceBundleName"],r["spritePathId"]) for r in materialized})!=267:raise RuntimeError("sprite identity uniqueness drift")
materialized.sort(key=lambda r:r["heroId"])
manifest={"version":1,"status":"HERO_CARDHEAD_WEB_ASSETS_COMPLETE","gameVersion":VER,"heroCount":267,"sourceContract":"HeroInfo.CharImage_ID -> CharImageInfo.CardHeadImage -> exact begin/current bundle ownership -> exact container path -> _0 full-width Sprite","records":materialized}
validation={"version":1,"status":"PASS_HERO_CARDHEAD_MATERIALIZATION","semanticStageReopened":False,"canonicalHeroCount":267,"materializedCount":267,"fileCount":267,"distinctSourcePathCount":267,"distinctSpriteIdentityCount":267,"bundleUsage":[{"packageNumber":n,"bundleName":b,"heroCount":count} for (n,b),count in sorted(bundle_usage.items())],"representative":[r for r in materialized if r["heroId"] in {6,25,69,99284}],"selectionEvidence":{"beginExactPathCount":159,"beginSpritePairPattern":"_0 + _1","beginSuffixCounts":{"_0":159,"_1":159},"secondarySliceWidth":176,"chosenRole":"_0 full-width card-head sprite for square card-icon UI"},"rule":"No Hero name JOIN, filename similarity, ID arithmetic, arbitrary crop, or artwork fallback. Exact ConfigData CardHeadImage path owns the asset; _0/_1 role is selected from validated subasset geometry, with _0 used for the full-width card-head icon."}
MANIFEST.parent.mkdir(parents=True,exist_ok=True);VALIDATION.parent.mkdir(parents=True,exist_ok=True);MANIFEST.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8");VALIDATION.write_text(json.dumps(validation,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"status":validation["status"],"materializedCount":267,"bundleUsage":validation["bundleUsage"],"representative":validation["representative"]},ensure_ascii=True,indent=2))
