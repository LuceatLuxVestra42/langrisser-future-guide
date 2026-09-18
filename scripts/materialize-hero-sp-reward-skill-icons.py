#!/usr/bin/env python3
import argparse, hashlib, importlib.util, json, pathlib

SHARDS = pathlib.Path("data/generated/hero-detail/by-id")
MANIFEST = pathlib.Path("data/generated/hero-skill-icon-assets.v1.json")
PACKAGES = pathlib.Path("data/generated/hero-awakening-icon-official-package-inventory.v1.json")
VERIFIER = pathlib.Path("scripts/verify-hero-awakening-icon-official.py")
PUBLIC = pathlib.Path("public/images/heroes/skill-icons")
OUTPUT = pathlib.Path("data/generated/hero-skill-icon-sp-reward-materialization.v1.json")
PREFIXES = ("UI/Icon/Skill_ABS/", "UI/Icon/Skill2_ABS/")
EXPECTED_SHARDS = 267
EXPECTED_RELEASED = 25
EXPECTED_USAGE = 50
EXCLUDED_HERO = 6
EXPECTED_TARGET_HEROES = 24
EXPECTED_TARGET_USAGE = 48
EXPECTED_TARGET_UNIQUE = 48
EXPECTED_PACKAGES = 68
EXPECTED_BUNDLES = 3045

def load(path):
    return json.loads(path.read_text(encoding="utf-8"))

def sha(data):
    return hashlib.sha256(data).hexdigest()

def compact_sha(value):
    return sha(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())

def verifier_module():
    spec = importlib.util.spec_from_file_location("sp_reward_official", VERIFIER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def collect_targets():
    paths = sorted((p for p in SHARDS.glob("*.json") if p.stem.isdigit()), key=lambda p:int(p.stem))
    if len(paths) != EXPECTED_SHARDS:
        raise RuntimeError(f"hero shard count drift {len(paths)}/{EXPECTED_SHARDS}")
    released = usage = 0
    targets = {}
    leon = set()
    for path in paths:
        hero = load(path)
        sp = hero.get("sp") or {}
        if sp.get("status") != "RELEASED":
            continue
        released += 1
        hero_id = int(hero["heroId"])
        skills = ((sp.get("secondStageRewards") or {}).get("skills") or [])
        if len(skills) != 2:
            raise RuntimeError(f"Hero {hero_id} SP reward skill count {len(skills)}/2")
        for skill in skills:
            usage += 1
            skill_id = skill.get("skillId")
            source_path = skill.get("icon")
            if not isinstance(skill_id, int) or not isinstance(source_path, str) or not source_path.startswith(PREFIXES):
                raise RuntimeError(f"invalid exact SP reward locator hero={hero_id} skill={skill_id} path={source_path}")
            if hero_id == EXCLUDED_HERO:
                leon.add(source_path)
                continue
            row = targets.setdefault(source_path, {"sourcePath":source_path,"usageCount":0,"heroIds":set(),"skillIds":set()})
            row["usageCount"] += 1
            row["heroIds"].add(hero_id)
            row["skillIds"].add(skill_id)
    if released != EXPECTED_RELEASED or usage != EXPECTED_USAGE:
        raise RuntimeError(f"SP source drift released={released}/{EXPECTED_RELEASED} usage={usage}/{EXPECTED_USAGE}")
    if len(leon) != 2:
        raise RuntimeError(f"Leon scope drift {len(leon)}/2")
    if len({h for r in targets.values() for h in r["heroIds"]}) != EXPECTED_TARGET_HEROES:
        raise RuntimeError("target hero population drift")
    if sum(r["usageCount"] for r in targets.values()) != EXPECTED_TARGET_USAGE or len(targets) != EXPECTED_TARGET_UNIQUE:
        raise RuntimeError("target usage/unique drift")
    manifest = load(MANIFEST)
    frozen = list(manifest.get("records") or []) + list(manifest.get("awakeningRecords") or []) + list(manifest.get("spTalentRecords") or [])
    frozen_paths = {r.get("sourcePath") for r in frozen}
    if not leon.issubset(frozen_paths):
        raise RuntimeError(f"Leon predecessor coverage missing {sorted(leon-frozen_paths)}")
    overlap = set(targets) & frozen_paths
    if overlap:
        raise RuntimeError(f"non-Leon SP reward path already admitted unexpectedly {sorted(overlap)[:5]}")
    normalized = []
    for source_path in sorted(targets):
        row = targets[source_path]
        normalized.append({
            "sourcePath":source_path,
            "usageCount":row["usageCount"],
            "heroIds":sorted(row["heroIds"]),
            "skillIds":sorted(row["skillIds"]),
        })
    return {"released":released,"usage":usage,"leonPaths":sorted(leon),"targets":normalized,"frozen":frozen}

def validate_packages():
    packages = load(PACKAGES)
    rows = packages.get("packages") or []
    if packages.get("schemaId") != "hero-awakening-icon-official-package-inventory/v1" or packages.get("completion") != "COMPLETE":
        raise RuntimeError("official package inventory contract mismatch")
    if len(rows) != EXPECTED_PACKAGES or [p.get("part") for p in rows] != list(range(1, EXPECTED_PACKAGES+1)):
        raise RuntimeError("official package inventory coverage drift")
    return packages

def scan_shard(index, count, output):
    if count != 8 or index < 0 or index >= count:
        raise RuntimeError("scan shard contract mismatch")
    src = collect_targets()
    packages = validate_packages()
    verifier = verifier_module()
    import UnityPy
    lookup = {verifier.norm(r["sourcePath"]):r["sourcePath"] for r in src["targets"]}
    selected = [p for i,p in enumerate(packages["packages"]) if i % count == index]
    hits = {r["sourcePath"]:[] for r in src["targets"]}
    errors = []
    bundle_count = 0
    for package in selected:
        try:
            entries = verifier.zip_directory(package["url"], package["contentLength"])
        except Exception as exc:
            errors.append({"packagePart":package["part"],"reason":f"PACKAGE_CATALOG_FAIL:{type(exc).__name__}:{exc}"})
            continue
        for entry in entries:
            if not verifier.norm(entry["name"]).endswith(".b"):
                continue
            bundle_count += 1
            try:
                raw = verifier.fetch_zip_entry(package["url"], entry)
                env = UnityPy.load(raw)
            except Exception as exc:
                errors.append({"packagePart":package["part"],"bundleEntry":entry["name"],"reason":f"BUNDLE_DECODE_FAIL:{type(exc).__name__}:{exc}"})
                continue
            bundle_sha = None
            for container_path,value in env.container.items():
                rel = verifier.runtime_relative(container_path)
                source_path = lookup.get(rel)
                if source_path is None:
                    continue
                if bundle_sha is None:
                    bundle_sha = sha(raw)
                try:
                    reader = verifier.reader_of(value)
                    kind = getattr(getattr(reader,"type",None),"name",None)
                    row = {
                        "packagePart":package["part"],"packageName":package["packageName"],
                        "bundleEntry":entry["name"],"bundleSha256":bundle_sha,
                        "containerPath":str(container_path).replace("\\","/"),"objectType":kind,
                    }
                    if kind == "Sprite":
                        raw_obj = reader.get_raw_data()
                        image = reader.read().image.convert("RGBA")
                        row.update({
                            "pathId":int(getattr(reader,"path_id",0) or 0),
                            "width":image.width,"height":image.height,
                            "rawObjectSha256":sha(raw_obj),"rgbaSha256":sha(image.tobytes()),
                            "nonEmptyAlpha":image.getchannel("A").getbbox() is not None,
                        })
                    hits[source_path].append(row)
                except Exception as exc:
                    errors.append({"packagePart":package["part"],"bundleEntry":entry["name"],"containerPath":str(container_path),"reason":f"EXACT_HIT_DECODE_FAIL:{type(exc).__name__}:{exc}"})
    result = {
        "version":1,"schemaId":"hero-skill-icon-sp-reward-source-scan-shard/v1",
        "shardIndex":index,"shardCount":count,
        "targetSetSha256":compact_sha(src["targets"]),
        "packageParts":[p["part"] for p in selected],
        "packageScanCount":len(selected),"bundleScanCount":bundle_count,
        "hits":hits,"scanErrors":errors,
    }
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"shardIndex":index,"packages":len(selected),"bundles":bundle_count,"hits":sum(len(v) for v in hits.values()),"errors":len(errors)},ensure_ascii=False))
    if errors:
        raise SystemExit(2)

def merge_materialize(scan_dir):
    src = collect_targets()
    packages = validate_packages()
    verifier = verifier_module()
    import UnityPy
    files = sorted(scan_dir.glob("**/sp-reward-scan-*.json"))
    if len(files) != 8:
        raise RuntimeError(f"scan shard file count {len(files)}/8")
    shards = [load(p) for p in files]
    shards.sort(key=lambda r:r["shardIndex"])
    target_sha = compact_sha(src["targets"])
    if [r["shardIndex"] for r in shards] != list(range(8)) or any(r.get("shardCount") != 8 or r.get("targetSetSha256") != target_sha for r in shards):
        raise RuntimeError("scan shard predecessor mismatch")
    parts = sorted(p for r in shards for p in r["packageParts"])
    bundles = sum(r["bundleScanCount"] for r in shards)
    errors = [e for r in shards for e in r.get("scanErrors",[])]
    if parts != list(range(1,69)) or bundles != EXPECTED_BUNDLES or errors:
        raise RuntimeError(f"exhaustive coverage failure packages={len(parts)} bundles={bundles}/{EXPECTED_BUNDLES} errors={len(errors)}")
    all_hits = {r["sourcePath"]:[] for r in src["targets"]}
    for shard in shards:
        for path in all_hits:
            all_hits[path].extend((shard.get("hits") or {}).get(path,[]))
    selected = {}
    for path,hits in all_hits.items():
        sprite_hits = [h for h in hits if h.get("objectType") == "Sprite"]
        valid = [h for h in sprite_hits if h.get("nonEmptyAlpha") is True]
        if not valid or len(valid) != len(sprite_hits):
            raise RuntimeError(f"no valid exact Sprite after exhaustive scan {path} hits={len(hits)} sprites={len(sprite_hits)}")
        render = {(h["width"],h["height"],h["rgbaSha256"]) for h in valid}
        if len(render) != 1:
            raise RuntimeError(f"ambiguous non-equivalent exact sources {path}")
        valid.sort(key=lambda h:(h["packagePart"],h["bundleEntry"],h["containerPath"],h["pathId"]))
        selected[path] = valid[0]
    package_by_part = {p["part"]:p for p in packages["packages"]}
    grouped = {}
    for path,hit in selected.items():
        grouped.setdefault((hit["packagePart"],hit["bundleEntry"],hit["bundleSha256"]),[]).append(path)
    frozen_public = {str(r.get("publicPath","")).lower() for r in src["frozen"] if r.get("publicPath")}
    seen_public = set()
    outputs = []
    target_by_path = {r["sourcePath"]:r for r in src["targets"]}
    for (part,bundle_entry,expected_bundle_sha),paths in sorted(grouped.items()):
        package = package_by_part[part]
        entries = verifier.zip_directory(package["url"],package["contentLength"])
        entry = next((e for e in entries if e["name"] == bundle_entry),None)
        if entry is None:
            raise RuntimeError(f"proved bundle entry missing part={part} {bundle_entry}")
        raw = verifier.fetch_zip_entry(package["url"],entry)
        if sha(raw) != expected_bundle_sha:
            raise RuntimeError(f"bundle hash drift part={part} {bundle_entry}")
        env = UnityPy.load(raw)
        index = {}
        for container_path,value in env.container.items():
            rel = verifier.runtime_relative(container_path)
            if rel is not None:
                index.setdefault(rel,[]).append((str(container_path).replace("\\","/"),value))
        for path in sorted(paths):
            proof = selected[path]
            exact = index.get(verifier.norm(path),[])
            matches = []
            companions = 0
            for container_path,value in exact:
                reader = verifier.reader_of(value)
                kind = getattr(getattr(reader,"type",None),"name",None)
                if kind != "Sprite":
                    companions += 1
                    continue
                raw_obj = reader.get_raw_data()
                image = reader.read().image.convert("RGBA")
                meta = (int(getattr(reader,"path_id",0) or 0),sha(raw_obj),sha(image.tobytes()),image.width,image.height)
                expected = (proof["pathId"],proof["rawObjectSha256"],proof["rgbaSha256"],proof["width"],proof["height"])
                if meta == expected and image.getchannel("A").getbbox() is not None:
                    matches.append((container_path,image,meta))
            if not matches:
                raise RuntimeError(f"materialization proof mismatch {path}")
            container_path,image,meta = matches[0]
            filename = pathlib.PurePosixPath(path).name
            public_path = f"/images/heroes/skill-icons/{filename}"
            key = public_path.lower()
            if key in frozen_public or key in seen_public:
                raise RuntimeError(f"public path collision {public_path}")
            seen_public.add(key)
            out = pathlib.Path("public"+public_path)
            out.parent.mkdir(parents=True,exist_ok=True)
            image.save(out,format="PNG",optimize=False,compress_level=9)
            png = out.read_bytes()
            usage = target_by_path[path]
            outputs.append({
                "role":"sp-reward","sourcePath":path,"usageCount":usage["usageCount"],
                "heroIds":usage["heroIds"],"skillIds":usage["skillIds"],
                "verificationOwner":"OFFICIAL_INSTALLER_EXHAUSTIVE_ALL_BUNDLES_EXACT_RUNTIME_PATH_UNITY_SPRITE",
                "packagePart":part,"packageName":package["packageName"],"bundleEntry":bundle_entry,"bundleSha256":expected_bundle_sha,
                "containerPath":container_path,"objectType":"Sprite","pathId":meta[0],"rawObjectSha256":meta[1],
                "rgbaSha256":meta[2],"width":meta[3],"height":meta[4],
                "publicPath":public_path,"pngBytes":len(png),"pngSha256":sha(png),
                "nonSpriteExactPathCompanionCount":companions,
            })
    outputs.sort(key=lambda r:r["sourcePath"])
    if len(outputs) != EXPECTED_TARGET_UNIQUE:
        raise RuntimeError("materialized population drift")
    report = {
        "version":1,"schemaId":"hero-skill-icon-sp-reward-materialization/v1",
        "status":"FROZEN","completion":"COMPLETE","semanticReopen":False,
        "lookupAuthority":"exact sp.secondStageRewards.skills[].icon only",
        "source":{"kind":"OFFICIAL_INSTALLER","installVersion":"1.1.113","unityParser":"UnityPy==1.25.3","searchCoverage":"EXHAUSTIVE_ALL_BUNDLES"},
        "authority":{"source":"data/generated/hero-detail/by-id/*.json","exactField":"sp.secondStageRewards.skills[].icon","excludedAlreadyAdmittedHeroId":6,"semanticRecomputation":False,"nameJoin":False,"idArithmetic":False},
        "verificationPolicy":{"proofRequirement":"all 68 packages + all 3045 bundles scanned; full normalized runtime relative path equality + Sprite decode + non-empty alpha","outputPathRule":"exact sourcePath basename after exact proof; case-insensitive collisions fail closed"},
        "summary":{"spReleasedCount":src["released"],"spRewardUsageCount":src["usage"],"excludedLeonUsageCount":len(src["leonPaths"]),"targetHeroCount":24,"targetUsageCount":48,"targetUniqueIconPathCount":48,"provedCount":48,"missingCount":0,"packageScanCount":68,"bundleScanCount":bundles,"scanErrorCount":0,"publicPathCollisionCount":0},
        "records":outputs,
    }
    report["materializationSetSha256"] = compact_sha(outputs)
    report["materializationHashContract"] = "sha256(UTF-8 compact JSON of records array sorted by exact sourcePath)"
    OUTPUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"status":"PASS_MATERIALIZED",**report["summary"],"materializationSetSha256":report["materializationSetSha256"]},ensure_ascii=False,indent=2))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scan-shard",type=int)
    parser.add_argument("--shard-count",type=int,default=8)
    parser.add_argument("--output")
    parser.add_argument("--merge-materialize")
    args = parser.parse_args()
    if args.scan_shard is not None:
        if not args.output:
            raise RuntimeError("--output required")
        scan_shard(args.scan_shard,args.shard_count,pathlib.Path(args.output))
    elif args.merge_materialize:
        merge_materialize(pathlib.Path(args.merge_materialize))
    else:
        raise RuntimeError("choose --scan-shard or --merge-materialize")

if __name__ == "__main__":
    main()
