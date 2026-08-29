import json
import pathlib
import struct
import urllib.request
import zlib
from collections import Counter, defaultdict

import UnityPy

VER = "1.1.113"
BASE = f"http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VER}"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
PACKAGE_NUMBER = 26
PACKAGE_NAME = f"InstallPage_{VER}_{PACKAGE_NUMBER}.zip"
PACKAGE_URL = f"{BASE}/{PACKAGE_NAME}"
OUT = pathlib.Path("data/validation/hero-cardhead-sprite-diagnostic.v1.json")
SAMPLE_DIR = pathlib.Path("public/images/heroes/card-head-diagnostic")
HERO_INFO = pathlib.Path("data/configdata/ConfigDataHeroInfo.json")
CHAR_IMAGE = pathlib.Path("data/configdata/ConfigDataCharImageInfo.json")
MASTER = pathlib.Path("data/hero-name-master.v1.json")
BUNDLE_BY_PREFIX = {
    "UI/Card_ABS/": "begin_ui_card_abs.b",
    "UI/Card02_ABS/": "begin_ui_card02_abs.b",
    "UI/Card03_ABS/": "begin_ui_card03_abs.b",
    "UI/Card04_ABS/": "begin_ui_card04_abs.b",
    "UI/Card05_ABS/": "begin_ui_card05_abs.b",
    "UI/Card06_ABS/": "begin_ui_card06_abs.b",
    "UI/Card07_ABS/": "begin_ui_card07_abs.b",
    "UI/Card08_ABS/": "begin_ui_card08_abs.b",
    "UI/Card09_ABS/": "begin_ui_card09_abs.b",
}


def norm(v): return str(v or "").replace("\\", "/").strip("/").lower()
def obj_type(o): return getattr(getattr(o, "type", None), "name", None)

def req(url, start=None, end=None):
    headers = {"User-Agent": UA, "Accept-Encoding": "identity"}
    if start is not None: headers["Range"] = f"bytes={start}-{end}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=90) as r: data = r.read()
    if start is not None and len(data) != end - start + 1: raise RuntimeError("range mismatch")
    return data

def head_size(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding":"identity"}, method="HEAD"), timeout=60) as r:
        return int(r.headers["Content-Length"])

def zipdir(url):
    size=head_size(url); tail_size=min(1048576,size); tail=req(url,size-tail_size,size-1); e=tail.rfind(b"PK\x05\x06")
    if e<0: raise RuntimeError("EOCD missing")
    _,_,_,_,cs,co,_=struct.unpack_from("<HHHHIIH",tail,e+4); central=req(url,co,co+cs-1); entries={}; off=0
    while off+46<=len(central) and central[off:off+4]==b"PK\x01\x02":
        flags,method=struct.unpack_from("<HH",central,off+8); csz,usz=struct.unpack_from("<II",central,off+20)
        fl,el,cl=struct.unpack_from("<HHH",central,off+28); lo=struct.unpack_from("<I",central,off+42)[0]
        raw=central[off+46:off+46+fl]; name=raw.decode("utf-8" if flags&0x800 else "cp437","replace")
        entries[pathlib.PurePosixPath(name).name.lower()]={"name":name,"method":method,"compressedSize":csz,"uncompressedSize":usz,"localOffset":lo}
        off += 46+fl+el+cl
    return size,entries

def extract(entry):
    lo=entry["localOffset"]; h=req(PACKAGE_URL,lo,lo+4095); method=struct.unpack_from("<H",h,8)[0]; fl,el=struct.unpack_from("<HH",h,26)
    start=lo+30+fl+el; compressed=req(PACKAGE_URL,start,start+entry["compressedSize"]-1)
    return compressed if method==0 else zlib.decompress(compressed,-15)

master=json.loads(MASTER.read_text(encoding="utf-8")); heroes=master if isinstance(master,list) else master["records"]
hi=json.loads(HERO_INFO.read_text(encoding="utf-8")); ci=json.loads(CHAR_IMAGE.read_text(encoding="utf-8"))
hi_by={r["ID"]:r for r in hi if isinstance(r,dict) and isinstance(r.get("ID"),int)}; ci_by={r["ID"]:r for r in ci if isinstance(r,dict) and isinstance(r.get("ID"),int)}
rows=[]
for hero in heroes:
    hid=int(hero["heroId"]); h=hi_by[hid]; c=ci_by[h["CharImage_ID"]]; source=c["CardHeadImage"]
    prefix=next(p for p in BUNDLE_BY_PREFIX if source.startswith(p)); rows.append({"heroId":hid,"nameKr":hero.get("nameKr"),"source":source,"bundle":BUNDLE_BY_PREFIX[prefix]})

_,entries=zipdir(PACKAGE_URL); by_bundle=defaultdict(list)
for r in rows: by_bundle[r["bundle"]].append(r)
SAMPLE_DIR.mkdir(parents=True,exist_ok=True)
for p in SAMPLE_DIR.glob("*.png"): p.unlink()
records=[]; suffix_counts=Counter(); dim_counts=Counter(); sprite_count_counts=Counter(); type_pattern_counts=Counter()
for bundle, items in sorted(by_bundle.items()):
    env=UnityPy.load(extract(entries[bundle.lower()]))
    containers=[(norm(k),str(k),o) for k,o in env.container.items()]
    for r in items:
        target=norm(r["source"]); hits=[(k,orig,o) for k,orig,o in containers if k==target or k.endswith("/"+target)]
        sprites=[]
        for _,orig,o in hits:
            if obj_type(o)!="Sprite": continue
            d=o.read(); img=d.image
            rec={"pathId":int(getattr(o,"path_id",0)),"name":getattr(d,"m_Name",None),"width":img.size[0] if img else None,"height":img.size[1] if img else None,"containerPath":orig}
            sprites.append(rec)
            n=(rec["name"] or "").lower(); suffix="_0" if n.endswith("_0") else "_1" if n.endswith("_1") else "other"; suffix_counts[suffix]+=1
            dim_counts[f"{rec['width']}x{rec['height']}"]+=1
            if r["heroId"] in {6,25,69,99284} and img is not None:
                img.save(SAMPLE_DIR/f"{r['heroId']}-{len(sprites)}-{rec['name']}.png",format="PNG",optimize=True)
        sprite_count_counts[len(sprites)]+=1
        type_pattern_counts["+".join(sorted(obj_type(o) or "None" for _,_,o in hits))]+=1
        records.append({**r,"pathHitCount":len(hits),"pathObjectTypes":[obj_type(o) for _,_,o in hits],"sprites":sprites})

report={"version":1,"status":"PASS_DIAGNOSTIC","canonicalHeroCount":267,"recordCount":len(records),"spriteCountPerPath":dict(sprite_count_counts),"pathObjectTypePatterns":dict(type_pattern_counts),"spriteNameSuffixCounts":dict(suffix_counts),"spriteDimensionCounts":dict(dim_counts),"representative":[r for r in records if r["heroId"] in {6,25,69,99284}],"records":records}
OUT.parent.mkdir(parents=True,exist_ok=True); OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({k:report[k] for k in ["status","recordCount","spriteCountPerPath","pathObjectTypePatterns","spriteNameSuffixCounts","spriteDimensionCounts","representative"]},ensure_ascii=False,indent=2))
