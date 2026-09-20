#!/usr/bin/env python3
import hashlib, json, os, pathlib, struct, urllib.error, urllib.request, zlib, binascii
from collections import defaultdict
import UnityPy

ROOT = pathlib.Path(os.environ.get("RUNNER_TEMP", ".")) / "hero-sp-artwork-charimage-probe"
OUT = ROOT / "report"
OUT.mkdir(parents=True, exist_ok=True)
VER = "1.1.113"
BASE = f"http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VER}"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
TARGET_ID = 1013
TOKENS = ("1013", "leon", "sp")
BUNDLE_HINTS = ("heropainting", "charimage", "heroimage", "heroinfo", "hero_info", "portrait")
MAX_PART = 90
MISS_BREAK = 8

def norm(v):
    return str(v).replace("\\", "/").strip("/").lower()

def req(url, a=None, b=None):
    h = {"User-Agent": UA, "Accept-Encoding": "identity"}
    if a is not None:
        h["Range"] = f"bytes={a}-{b}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=90) as r:
        d = r.read()
    if a is not None and len(d) != b-a+1:
        raise RuntimeError(f"range mismatch {len(d)} != {b-a+1}")
    return d

def head(url):
    q = urllib.request.Request(url, headers={"User-Agent":UA,"Accept-Encoding":"identity"}, method="HEAD")
    try:
        with urllib.request.urlopen(q, timeout=45) as r:
            return int(r.headers["Content-Length"])
    except urllib.error.HTTPError as e:
        if e.code in (403,404): return None
        raise

def zipdir(url, total):
    t=min(262144,total)
    tail=req(url,total-t,total-1)
    q=tail.rfind(b"PK\x05\x06")
    if q<0: raise RuntimeError("EOCD missing")
    _,_,_,_,cs,co,_=struct.unpack_from("<HHHHIIH",tail,q+4)
    cd=req(url,co,co+cs-1)
    out=[]; i=0
    while i+46<=len(cd) and cd[i:i+4]==b"PK\x01\x02":
        fl,me=struct.unpack_from("<HH",cd,i+8)
        crc,cz,uz=struct.unpack_from("<III",cd,i+16)
        fn,ex,cm=struct.unpack_from("<HHH",cd,i+28)
        lo=struct.unpack_from("<I",cd,i+42)[0]
        nb=cd[i+46:i+46+fn]
        name=nb.decode("utf-8" if fl&0x800 else "cp437","replace")
        out.append({"name":name,"method":me,"crc32":f"{crc:08X}","compressed":cz,"uncompressed":uz,"localOffset":lo})
        i+=46+fn+ex+cm
    return out

def fetch_entry(url,e):
    lo=e["localOffset"]
    h=req(url,lo,lo+4095)
    if h[:4]!=b"PK\x03\x04": raise RuntimeError("local header missing")
    me=struct.unpack_from("<H",h,8)[0]
    fn,ex=struct.unpack_from("<HH",h,26)
    s=lo+30+fn+ex
    c=req(url,s,s+e["compressed"]-1)
    d=c if me==0 else zlib.decompress(c,-15)
    if len(d)!=e["uncompressed"]: raise RuntimeError("size mismatch")
    if f"{binascii.crc32(d)&0xffffffff:08X}"!=e["crc32"]: raise RuntimeError("crc mismatch")
    return d

def obj_type(o):
    return getattr(getattr(o,"type",None),"name",None)

def obj_name(o):
    try:
        d=o.read()
        return str(getattr(d,"m_Name","") or "")
    except Exception:
        return ""

def find_scalar_1013(v, path="", out=None, depth=0):
    if out is None: out=[]
    if depth>10: return out
    if isinstance(v,dict):
        for k,x in v.items():
            p=f"{path}.{k}" if path else str(k)
            if isinstance(x,(int,float)) and x==TARGET_ID:
                out.append(p)
            elif isinstance(x,(dict,list)):
                find_scalar_1013(x,p,out,depth+1)
    elif isinstance(v,list):
        for i,x in enumerate(v):
            p=f"{path}[{i}]"
            if isinstance(x,(int,float)) and x==TARGET_ID:
                out.append(p)
            elif isinstance(x,(dict,list)):
                find_scalar_1013(x,p,out,depth+1)
    return out

packages=[]; candidates=[]
seen=False; miss=0
for part in range(1,MAX_PART+1):
    pkg=f"InstallPage_{VER}_{part}.zip"
    url=f"{BASE}/{pkg}"
    total=head(url)
    if total is None:
        if seen:
            miss+=1
            if miss>=MISS_BREAK: break
        continue
    seen=True; miss=0
    ents=zipdir(url,total)
    hits=[]
    for e in ents:
        base=norm(e["name"]).rsplit("/",1)[-1]
        if not base.endswith(".b"): continue
        if any(h in base for h in BUNDLE_HINTS):
            candidates.append({"part":part,"package":pkg,"packageUrl":url,"packageBytes":total,"entry":e,"basename":base})
            hits.append(base)
    packages.append({"part":part,"package":pkg,"bytes":total,"candidateBasenames":sorted(set(hits))})

reports=[]; clue_rows=[]; numeric_rows=[]
for c in candidates:
    raw=fetch_entry(c["packageUrl"],c["entry"])
    env=UnityPy.load(raw)
    containers=[str(p).replace("\\","/") for p,_ in env.container.items()]
    container_hits=[p for p in containers if any(t in p.lower() for t in TOKENS)]
    named=[]
    numeric=[]
    for o in env.objects:
        typ=obj_type(o)
        name=obj_name(o)
        low=name.lower()
        if name and any(t in low for t in TOKENS):
            row={"type":typ,"pathId":int(o.path_id),"name":name}
            named.append(row)
            clue_rows.append({**row,"bundle":c["basename"],"package":c["package"]})
        if typ in ("MonoBehaviour","GameObject"):
            try:
                tt=o.read_typetree()
                paths=find_scalar_1013(tt)
                if paths:
                    row={"type":typ,"pathId":int(o.path_id),"name":name,"fieldPaths":paths[:40]}
                    numeric.append(row)
                    numeric_rows.append({**row,"bundle":c["basename"],"package":c["package"]})
            except Exception:
                pass
    reports.append({
        "packagePart":c["part"],"packageName":c["package"],"bundleEntry":c["entry"]["name"],
        "bundleBasename":c["basename"],"bundleBytes":len(raw),"bundleSha256":hashlib.sha256(raw).hexdigest(),
        "containerCount":len(containers),"containerTokenHits":container_hits[:100],
        "namedObjectHits":named[:200],"numeric1013Hits":numeric[:200]
    })

result={
    "schemaVersion":1,
    "status":"COMPLETE",
    "purpose":"Read-only official installer probe for SP Hero CharImage_ID 1013 without semantic inference.",
    "target":{"heroId":6,"nameKr":"레온","charImageId":1013},
    "source":{"installVersion":VER,"base":BASE},
    "discovery":{"packageCount":len(packages),"candidateBundleCount":len(candidates),"bundleHints":list(BUNDLE_HINTS)},
    "evidence":{
        "namedObjectHitCount":len(clue_rows),
        "numeric1013HitCount":len(numeric_rows),
        "hasDirect1013Evidence":bool(numeric_rows or any("1013" in json.dumps(x,ensure_ascii=False).lower() for x in clue_rows))
    },
    "candidateBundles":reports,
    "packageSummary":packages,
    "boundaries":{"nameJoinPromoted":False,"idArithmetic":False,"semanticMutationCount":0,"assetMutationCount":0}
}
(OUT/"hero-sp-artwork-charimage-1013-probe.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"status":result["status"],"candidateBundleCount":len(candidates),"namedObjectHitCount":len(clue_rows),"numeric1013HitCount":len(numeric_rows),"hasDirect1013Evidence":result["evidence"]["hasDirect1013Evidence"]},ensure_ascii=False))
