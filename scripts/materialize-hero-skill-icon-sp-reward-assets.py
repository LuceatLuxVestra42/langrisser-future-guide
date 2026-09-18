#!/usr/bin/env python3
import argparse,hashlib,importlib.util,json,pathlib
SHARDS=pathlib.Path("data/generated/hero-detail/by-id")
MANIFEST=pathlib.Path("data/generated/hero-skill-icon-assets.v1.json")
LOCATOR=pathlib.Path("data/generated/hero-awakening-icon-official-bundle-locator.v1.json")
VERIFIER=pathlib.Path("scripts/verify-hero-awakening-icon-official.py")
PUBLIC=pathlib.Path("public/images/heroes/skill-icons")
OUTPUT=pathlib.Path("data/generated/hero-skill-icon-sp-reward-materialization.v1.json")
PREFIXES=("UI/Icon/Skill_ABS/","UI/Icon/Skill2_ABS/")
def load(p): return json.loads(p.read_text(encoding="utf-8"))
def h(b): return hashlib.sha256(b).hexdigest()
def compact(v): return h(json.dumps(v,ensure_ascii=False,separators=(",",":")).encode())
def verifier():
 s=importlib.util.spec_from_file_location("v",VERIFIER);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def targets():
 files=sorted((p for p in SHARDS.glob("*.json") if p.stem.isdigit()),key=lambda p:int(p.stem))
 if len(files)!=267: raise RuntimeError(f"hero shard count {len(files)}/267")
 released=total=excluded=0; by={}
 for p in files:
  x=load(p);sp=x.get("sp") or {}
  if sp.get("status")!="RELEASED": continue
  released+=1;hid=int(x["heroId"]);rows=((sp.get("secondStageRewards") or {}).get("skills") or [])
  if len(rows)!=2: raise RuntimeError(f"reward count hero={hid} count={len(rows)}")
  for s in rows:
   total+=1;src=s.get("icon");sid=s.get("skillId")
   if not isinstance(src,str) or not src.startswith(PREFIXES): raise RuntimeError(f"bad icon hero={hid} skill={sid} path={src!r}")
   if hid==6: excluded+=1;continue
   r=by.setdefault(src,{"sourcePath":src,"usageCount":0,"heroIds":set(),"skillIds":set()});r["usageCount"]+=1;r["heroIds"].add(hid)
   if isinstance(sid,int): r["skillIds"].add(sid)
 if (released,total,excluded)!=(25,50,2): raise RuntimeError(f"source cardinality {(released,total,excluded)}")
 if sum(r["usageCount"] for r in by.values())!=48 or len(by)!=48: raise RuntimeError(f"target cardinality usage={sum(r['usageCount'] for r in by.values())} unique={len(by)}")
 return released,total,[{"sourcePath":k,"usageCount":r["usageCount"],"heroIds":sorted(r["heroIds"]),"skillIds":sorted(r["skillIds"])} for k,r in sorted(by.items())]
def groups(v):
 import UnityPy
 l=load(LOCATOR)
 if l.get("schemaId")!="hero-awakening-icon-official-bundle-locator/v1" or l.get("status")!="FROZEN" or l.get("completion")!="COMPLETE": raise RuntimeError("locator contract")
 gs={g.get("sourcePathPrefix"):g for g in l.get("locatorGroups",[])};out={}
 for pre in PREFIXES:
  cs=(gs.get(pre) or {}).get("candidates") or []
  if len(cs)!=1: raise RuntimeError(f"locator candidates {pre}={len(cs)}")
  c=cs[0];raw=v.fetch_zip_entry(c["packageUrl"],c);sha=v.sha256_bytes(raw)
  if c.get("bundleSha256") and sha!=c["bundleSha256"]: raise RuntimeError(f"bundle sha {pre}")
  env=UnityPy.load(raw);idx={}
  for cp,val in env.container.items():
   rel=v.runtime_relative(cp)
   if rel is not None: idx.setdefault(rel,[]).append((str(cp).replace("\\","/"),val))
  out[pre]=(c,sha,idx)
 return out
def materialize(ts):
 v=verifier();gs=groups(v);m=load(MANIFEST);old=[*(m.get("records") or []),*(m.get("awakeningRecords") or []),*(m.get("spTalentRecords") or [])]
 oldsrc={r.get("sourcePath") for r in old};oldpub={str(r.get("publicPath","")).lower() for r in old if r.get("publicPath")};seen=set();rows=[]
 for t in ts:
  src=t["sourcePath"]
  if src in oldsrc: raise RuntimeError(f"source already admitted {src}")
  pre=next(p for p in PREFIXES if src.startswith(p));c,bsha,idx=gs[pre];exact=idx.get(v.norm(src),[])
  if not exact: raise RuntimeError(f"no exact hit {src}")
  sprites=[];companions=0
  for cp,val in exact:
   rd=v.reader_of(val);typ=getattr(getattr(rd,"type",None),"name",None)
   if typ!="Sprite": companions+=1;continue
   raw=rd.get_raw_data();im=rd.read().image.convert("RGBA")
   if im.getchannel("A").getbbox() is None: raise RuntimeError(f"empty alpha {src}")
   sprites.append((cp,rd,im,h(raw),h(im.tobytes())))
  if not sprites: raise RuntimeError(f"no Sprite {src}")
  if len({(x[2].width,x[2].height,x[4]) for x in sprites})!=1: raise RuntimeError(f"ambiguous Sprite {src}")
  cp,rd,im,rawsha,rgba=sprites[0];name=pathlib.PurePosixPath(src).name;pub=f"/images/heroes/skill-icons/{name}";key=pub.lower()
  if key in oldpub or key in seen: raise RuntimeError(f"public collision {pub}")
  seen.add(key);path=PUBLIC/name;path.parent.mkdir(parents=True,exist_ok=True);im.save(path,format="PNG",optimize=False,compress_level=9);png=path.read_bytes()
  rows.append({**t,"role":"sp-reward","verificationOwner":"OFFICIAL_INSTALLER_EXACT_RUNTIME_PATH_UNITY_SPRITE","packagePart":c["packagePart"],"packageName":c["packageName"],"bundleEntry":c["bundleEntry"],"bundleSha256":bsha,"containerPath":cp,"objectType":"Sprite","pathId":int(getattr(rd,"path_id",0) or 0),"rawObjectSha256":rawsha,"rgbaSha256":rgba,"width":im.width,"height":im.height,"publicPath":pub,"pngBytes":len(png),"pngSha256":h(png),"nonSpriteExactPathCompanionCount":companions})
 return sorted(rows,key=lambda r:r["sourcePath"])
def main():
 a=argparse.ArgumentParser();a.add_argument("--write",action="store_true");args=a.parse_args()
 if not args.write: raise RuntimeError("pass --write")
 released,total,ts=targets();rows=materialize(ts)
 if len(rows)!=48: raise RuntimeError("materialized count")
 out={"version":1,"schemaId":"hero-skill-icon-sp-reward-materialization/v1","status":"FROZEN","completion":"COMPLETE","semanticReopen":False,"lookupAuthority":"exact sp.secondStageRewards.skills[].icon only","scope":{"releasedSpHeroCount":released,"totalSpRewardSkillUsageCount":total,"excludedHeroIds":[6],"excludedUsageCount":2,"excludedReason":"Hero 6 Leon SP reward skill icons already materialized in frozen predecessor","spTalentIconsIncluded":False},"source":{"kind":"OFFICIAL_INSTALLER","installVersion":"1.1.113","unityParser":"UnityPy==1.25.3","unityContainerRootPrefix":"assets/gameproject/runtimeassets"},"policy":{"nameJoin":False,"idArithmetic":False,"basenameInference":False,"semanticRecomputation":False,"proofRequirement":"full normalized runtime relative path equality + Sprite decode + decoded RGBA + non-empty alpha"},"summary":{"targetUsageCount":48,"targetUniqueIconPathCount":48,"provedCount":48,"missingCount":0,"publicPathCollisionCount":0},"records":rows}
 out["materializationSetSha256"]=compact(rows);out["materializationHashContract"]="sha256(UTF-8 compact JSON of records array sorted by exact sourcePath)"
 OUTPUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print(json.dumps({"status":"PASS_MATERIALIZED",**out["summary"],"materializationSetSha256":out["materializationSetSha256"]},ensure_ascii=False,indent=2))
if __name__=="__main__": main()
