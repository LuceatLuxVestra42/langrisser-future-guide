import json
import pathlib
import struct
import urllib.request

VER="1.1.113"
BASE=f"http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VER}"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
OUT=pathlib.Path("data/validation/hero-card-bundle-ownership.v1.json")

def req(url,start=None,end=None):
    h={"User-Agent":UA,"Accept-Encoding":"identity"}
    if start is not None:h["Range"]=f"bytes={start}-{end}"
    with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=60) as r:return r.read()

def hsize(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":UA,"Accept-Encoding":"identity"},method="HEAD"),timeout=30) as r:return int(r.headers["Content-Length"])

def entries(url):
    size=hsize(url); ts=min(size,524288); tail=req(url,size-ts,size-1); e=tail.rfind(b"PK\x05\x06")
    if e<0:raise RuntimeError("EOCD missing")
    _,_,_,_,cs,co,_=struct.unpack_from("<HHHHIIH",tail,e+4); c=req(url,co,co+cs-1); out=[]; off=0
    while off+46<=len(c) and c[off:off+4]==b"PK\x01\x02":
        flags=struct.unpack_from("<H",c,off+8)[0]; fl,el,cl=struct.unpack_from("<HHH",c,off+28); raw=c[off+46:off+46+fl]
        name=raw.decode("utf-8" if flags&0x800 else "cp437","replace"); out.append(name); off+=46+fl+el+cl
    return size,out

records=[]; errors=[]
for n in range(1,80):
    name=f"InstallPage_{VER}_{n}.zip"; url=f"{BASE}/{name}"
    try:
        size,names=entries(url)
    except Exception as e:
        errors.append({"packageNumber":n,"error":type(e).__name__})
        continue
    matches=[]
    for path in names:
        base=pathlib.PurePosixPath(path).name.lower()
        if base.endswith(".b") and ("ui_card" in base or "ui_icon_card" in base):matches.append(path)
    if matches:records.append({"packageNumber":n,"packageName":name,"packageBytes":size,"matches":matches})

report={"version":1,"status":"PASS_DISCOVERY","gameVersion":VER,"packagesWithCardBundles":records,"errors":errors,"packageHitCount":len(records)}
OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"packageHitCount":len(records),"packagesWithCardBundles":records},ensure_ascii=True,indent=2))
