#!/usr/bin/env python3
import argparse, hashlib, importlib.util, json, pathlib

SHARDS = pathlib.Path("data/generated/hero-detail/by-id")
MANIFEST = pathlib.Path("data/generated/hero-skill-icon-assets.v1.json")
PACKAGES = pathlib.Path("data/generated/hero-awakening-icon-official-package-inventory.v1.json")
LOCATOR = pathlib.Path("data/generated/hero-awakening-icon-official-bundle-locator.v1.json")
VERIFIER = pathlib.Path("scripts/verify-hero-awakening-icon-official.py")
PUBLIC = pathlib.Path("public/images/heroes/skill-icons")
OUTPUT = pathlib.Path("data/generated/hero-skill-icon-sp-reward-materialization.v1.json")
SHARD_COUNT = 8
EXPECTED_PACKAGE_COUNT = 68
EXPECTED_BUNDLE_COUNT = 3045
PREFIXES = ("UI/Icon/Skill_ABS/", "UI/Icon/Skill2_ABS/")

def load(p):
    return json.loads(pathlib.Path(p).read_text(encoding="utf-8"))

def h(b):
    return hashlib.sha256(b).hexdigest()

def compact(v):
    return h(json.dumps(v, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))

def load_verifier():
    spec = importlib.util.spec_from_file_location("sp_reward_icon_verifier", VERIFIER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def collect_targets():
    files = sorted((p for p in SHARDS.glob("*.json") if p.stem.isdigit()), key=lambda p: int(p.stem))
    if len(files) != 267:
        raise RuntimeError(f"hero shard count mismatch {len(files)}/267")
    released = total = excluded = 0
    by = {}
    for p in files:
        hero = load(p)
        sp = hero.get("sp") or {}
        if sp.get("status") != "RELEASED":
            continue
        released += 1
        hero_id = int(hero["heroId"])
        rows = ((sp.get("secondStageRewards") or {}).get("skills") or [])
        if len(rows) != 2:
            raise RuntimeError(f"SP reward skill count drift hero={hero_id} count={len(rows)}")
        for row in rows:
            total += 1
            source = row.get("icon")
            skill_id = row.get("skillId")
            if not isinstance(source, str) or not source.startswith(PREFIXES):
                raise RuntimeError(f"invalid SP reward icon hero={hero_id} skill={skill_id} path={source!r}")
            if hero_id == 6:
                excluded += 1
                continue
            item = by.setdefault(source, {"sourcePath": source, "usageCount": 0, "heroIds": set(), "skillIds": set()})
            item["usageCount"] += 1
            item["heroIds"].add(hero_id)
            if isinstance(skill_id, int):
                item["skillIds"].add(skill_id)
    if (released, total, excluded) != (25, 50, 2):
        raise RuntimeError(f"SP source cardinality drift released={released} total={total} excluded={excluded}")
    usage = sum(v["usageCount"] for v in by.values())
    if usage != 48 or len(by) != 48:
        raise RuntimeError(f"SP target cardinality drift usage={usage} unique={len(by)}")
    targets = [
        {
            "sourcePath": source,
            "usageCount": row["usageCount"],
            "heroIds": sorted(row["heroIds"]),
            "skillIds": sorted(row["skillIds"]),
        }
        for source, row in sorted(by.items())
    ]
    return released, total, targets

def validate_static_inputs():
    packages = load(PACKAGES)
    locator = load(LOCATOR)
    if packages.get("schemaId") != "hero-awakening-icon-official-package-inventory/v1" or packages.get("completion") != "COMPLETE":
        raise RuntimeError("official package inventory contract mismatch")
    rows = packages.get("packages") or []
    if len(rows) != EXPECTED_PACKAGE_COUNT or [p.get("part") for p in rows] != list(range(1, EXPECTED_PACKAGE_COUNT + 1)):
        raise RuntimeError("official package inventory coverage mismatch")
    if locator.get("schemaId") != "hero-awakening-icon-official-bundle-locator/v1" or locator.get("completion") != "COMPLETE":
        raise RuntimeError("official locator contract mismatch")
    if (locator.get("summary") or {}).get("allBundleEntryCount") != EXPECTED_BUNDLE_COUNT:
        raise RuntimeError("official locator all-bundle count mismatch")
    return packages

def scan_package(package, verifier, target_lookup):
    import UnityPy
    hits = {source: [] for source in target_lookup.values()}
    errors = []
    bundle_count = 0
    try:
        entries = verifier.zip_directory(package["url"], package["contentLength"])
    except Exception as exc:
        return 0, hits, [{"packagePart": package["part"], "reason": f"PACKAGE_CATALOG_FAIL:{type(exc).__name__}:{exc}"}]
    for entry in entries:
        if not verifier.norm(entry["name"]).endswith(".b"):
            continue
        bundle_count += 1
        try:
            raw = verifier.fetch_zip_entry(package["url"], entry)
            env = UnityPy.load(raw)
        except Exception as exc:
            errors.append({"packagePart": package["part"], "bundleEntry": entry["name"], "reason": f"BUNDLE_DECODE_FAIL:{type(exc).__name__}:{exc}"})
            continue
        bundle_sha = None
        for container_path, value in env.container.items():
            rel = verifier.runtime_relative(container_path)
            source = target_lookup.get(rel)
            if source is None:
                continue
            if bundle_sha is None:
                bundle_sha = verifier.sha256_bytes(raw)
            try:
                reader = verifier.reader_of(value)
                object_type = getattr(getattr(reader, "type", None), "name", None)
                row = {
                    "packagePart": package["part"],
                    "packageName": package["packageName"],
                    "bundleEntry": entry["name"],
                    "bundleSha256": bundle_sha,
                    "runtimeContainerPath": str(container_path).replace("\\", "/"),
                    "objectType": object_type,
                }
                if object_type == "Sprite":
                    raw_obj = reader.get_raw_data()
                    image = reader.read().image.convert("RGBA")
                    row.update({
                        "pathId": int(getattr(reader, "path_id", 0) or 0),
                        "width": image.width,
                        "height": image.height,
                        "rawObjectSha256": verifier.sha256_bytes(raw_obj),
                        "rgbaSha256": verifier.sha256_bytes(image.tobytes()),
                        "nonEmptyAlpha": image.getchannel("A").getbbox() is not None,
                    })
                hits[source].append(row)
            except Exception as exc:
                errors.append({
                    "packagePart": package["part"],
                    "bundleEntry": entry["name"],
                    "runtimeContainerPath": str(container_path).replace("\\", "/"),
                    "reason": f"EXACT_HIT_DECODE_FAIL:{type(exc).__name__}:{exc}",
                })
    return bundle_count, hits, errors

def run_shard(args):
    if args.shard_count != SHARD_COUNT or args.shard_index < 0 or args.shard_index >= SHARD_COUNT:
        raise RuntimeError("shard contract mismatch")
    _, _, targets = collect_targets()
    packages = validate_static_inputs()
    verifier = load_verifier()
    lookup = {verifier.norm(t["sourcePath"]): t["sourcePath"] for t in targets}
    selected = [p for idx, p in enumerate(packages["packages"]) if idx % SHARD_COUNT == args.shard_index]
    merged_hits = {t["sourcePath"]: [] for t in targets}
    errors = []
    bundle_count = 0
    for package in selected:
        count, hits, errs = scan_package(package, verifier, lookup)
        bundle_count += count
        errors.extend(errs)
        for source in merged_hits:
            merged_hits[source].extend(hits[source])
    result = {
        "version": 1,
        "schemaId": "hero-skill-icon-sp-reward-source-scan-shard/v1",
        "shardIndex": args.shard_index,
        "shardCount": SHARD_COUNT,
        "targetSetSha256": compact(targets),
        "packageParts": [p["part"] for p in selected],
        "packageScanCount": len(selected),
        "bundleScanCount": bundle_count,
        "hits": merged_hits,
        "scanErrors": errors,
    }
    result["shardResultSha256"] = compact({k: result[k] for k in ("shardIndex","shardCount","targetSetSha256","packageParts","packageScanCount","bundleScanCount","hits","scanErrors")})
    out = pathlib.Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "shardIndex": args.shard_index,
        "packageScanCount": result["packageScanCount"],
        "bundleScanCount": bundle_count,
        "exactHitCount": sum(len(v) for v in merged_hits.values()),
        "scanErrorCount": len(errors),
    }, indent=2))
    if errors:
        raise SystemExit(2)

def verify_merged(args):
    released, total, targets = collect_targets()
    packages = validate_static_inputs()
    target_sha = compact(targets)
    files = sorted(pathlib.Path(args.merge_dir).glob("**/sp-reward-shard-*.json"))
    if len(files) != SHARD_COUNT:
        raise RuntimeError(f"expected {SHARD_COUNT} shard files, got {len(files)}")
    shards = [load(p) for p in files]
    shards.sort(key=lambda x: x["shardIndex"])
    if [s.get("shardIndex") for s in shards] != list(range(SHARD_COUNT)):
        raise RuntimeError("shard index coverage mismatch")
    if any(s.get("shardCount") != SHARD_COUNT or s.get("targetSetSha256") != target_sha for s in shards):
        raise RuntimeError("shard predecessor mismatch")
    parts = sorted(p for s in shards for p in s.get("packageParts", []))
    package_count = sum(s.get("packageScanCount", 0) for s in shards)
    bundle_count = sum(s.get("bundleScanCount", 0) for s in shards)
    errors = [e for s in shards for e in s.get("scanErrors", [])]
    if parts != list(range(1, 69)) or package_count != EXPECTED_PACKAGE_COUNT or bundle_count != EXPECTED_BUNDLE_COUNT:
        raise RuntimeError(f"exhaustive coverage mismatch packages={package_count} bundles={bundle_count}")
    if errors:
        raise RuntimeError(f"exhaustive scan errors={len(errors)} first={errors[0]}")
    hits = {t["sourcePath"]: [] for t in targets}
    for s in shards:
        for source in hits:
            hits[source].extend(s.get("hits", {}).get(source, []))
    proof = {}
    for target in targets:
        source = target["sourcePath"]
        exact = hits[source]
        sprite_hits = [x for x in exact if x.get("objectType") == "Sprite"]
        valid = [x for x in sprite_hits if x.get("nonEmptyAlpha") is True]
        if sprite_hits and len(valid) != len(sprite_hits):
            raise RuntimeError(f"invalid exact Sprite hit {source}")
        if not valid:
            raise RuntimeError(f"no exact Sprite after exhaustive scan {source}")
        render_keys = {(x.get("width"), x.get("height"), x.get("rgbaSha256")) for x in valid}
        if len(render_keys) != 1:
            raise RuntimeError(f"ambiguous non-equivalent exact sources {source}")
        valid.sort(key=lambda x: (x["packagePart"], x["bundleEntry"], x["runtimeContainerPath"], x.get("pathId", 0)))
        proof[source] = {"selected": valid[0], "exactHitCount": len(exact), "validSpriteHitCount": len(valid)}
    return released, total, targets, packages, proof

def materialize(args):
    import UnityPy
    released, total, targets, packages, proof = verify_merged(args)
    manifest = load(MANIFEST)
    frozen = [*(manifest.get("records") or []), *(manifest.get("awakeningRecords") or []), *(manifest.get("spTalentRecords") or [])]
    frozen_sources = {r.get("sourcePath") for r in frozen}
    frozen_public = {str(r.get("publicPath","")).lower() for r in frozen if r.get("publicPath")}
    package_by_part = {p["part"]: p for p in packages["packages"]}
    verifier = load_verifier()
    groups = {}
    for source, p in proof.items():
        hit = p["selected"]
        groups.setdefault((hit["packagePart"], hit["bundleEntry"], hit["bundleSha256"]), []).append(source)
    selected_objects = {}
    for (part, bundle_entry, expected_sha), sources in sorted(groups.items()):
        package = package_by_part[part]
        entries = verifier.zip_directory(package["url"], package["contentLength"])
        entry = next((e for e in entries if e["name"] == bundle_entry), None)
        if entry is None:
            raise RuntimeError(f"proved bundle entry disappeared part={part} entry={bundle_entry}")
        raw = verifier.fetch_zip_entry(package["url"], entry)
        if verifier.sha256_bytes(raw) != expected_sha:
            raise RuntimeError(f"proved bundle SHA drift {bundle_entry}")
        env = UnityPy.load(raw)
        by_rel = {}
        for cp, value in env.container.items():
            rel = verifier.runtime_relative(cp)
            if rel is not None:
                by_rel.setdefault(rel, []).append((str(cp).replace("\\","/"), value))
        for source in sources:
            wanted = proof[source]["selected"]
            matches = []
            for cp, value in by_rel.get(verifier.norm(source), []):
                reader = verifier.reader_of(value)
                if getattr(getattr(reader,"type",None),"name",None) != "Sprite":
                    continue
                raw_obj = reader.get_raw_data()
                image = reader.read().image.convert("RGBA")
                key = (h(raw_obj), h(image.tobytes()), image.width, image.height)
                wanted_key = (wanted["rawObjectSha256"], wanted["rgbaSha256"], wanted["width"], wanted["height"])
                if key == wanted_key:
                    matches.append((cp, reader, image))
            if not matches:
                raise RuntimeError(f"proved exact Sprite cannot be rematerialized {source}")
            selected_objects[source] = matches[0]
    rows = []
    seen_public = set()
    for target in targets:
        source = target["sourcePath"]
        if source in frozen_sources:
            raise RuntimeError(f"SP reward source already admitted by predecessor {source}")
        cp, reader, image = selected_objects[source]
        hit = proof[source]["selected"]
        name = pathlib.PurePosixPath(source).name
        public = f"/images/heroes/skill-icons/{name}"
        pub_key = public.lower()
        if pub_key in frozen_public or pub_key in seen_public:
            raise RuntimeError(f"publicPath collision {public}")
        seen_public.add(pub_key)
        out = PUBLIC / name
        out.parent.mkdir(parents=True, exist_ok=True)
        image.save(out, format="PNG", optimize=False, compress_level=9)
        png = out.read_bytes()
        rows.append({
            **target,
            "role": "sp-reward",
            "verificationOwner": "OFFICIAL_INSTALLER_EXHAUSTIVE_ALL_BUNDLES_EXACT_RUNTIME_PATH_UNITY_SPRITE",
            "packagePart": hit["packagePart"],
            "packageName": hit["packageName"],
            "bundleEntry": hit["bundleEntry"],
            "bundleSha256": hit["bundleSha256"],
            "containerPath": cp,
            "objectType": "Sprite",
            "pathId": int(getattr(reader, "path_id", 0) or 0),
            "rawObjectSha256": hit["rawObjectSha256"],
            "rgbaSha256": hit["rgbaSha256"],
            "width": hit["width"],
            "height": hit["height"],
            "publicPath": public,
            "pngBytes": len(png),
            "pngSha256": h(png),
            "exhaustiveExactHitCount": proof[source]["exactHitCount"],
            "exhaustiveValidSpriteHitCount": proof[source]["validSpriteHitCount"],
        })
    rows.sort(key=lambda r: r["sourcePath"])
    report = {
        "version": 1,
        "schemaId": "hero-skill-icon-sp-reward-materialization/v1",
        "status": "FROZEN",
        "completion": "COMPLETE",
        "semanticReopen": False,
        "lookupAuthority": "exact sp.secondStageRewards.skills[].icon only",
        "scope": {
            "releasedSpHeroCount": released,
            "totalSpRewardSkillUsageCount": total,
            "excludedHeroIds": [6],
            "excludedUsageCount": 2,
            "excludedReason": "Hero 6 Leon SP reward skill icons already materialized in frozen predecessor",
            "spTalentIconsIncluded": False,
        },
        "source": {
            "kind": "OFFICIAL_INSTALLER",
            "installVersion": "1.1.113",
            "unityParser": "UnityPy==1.25.3",
            "unityContainerRootPrefix": "assets/gameproject/runtimeassets",
            "searchCoverage": "EXHAUSTIVE_ALL_68_PACKAGES_ALL_3045_BUNDLES",
        },
        "policy": {
            "nameJoin": False,
            "idArithmetic": False,
            "basenameInference": False,
            "semanticRecomputation": False,
            "proofRequirement": "full normalized runtime relative path equality + exhaustive package/bundle coverage + Sprite decode + decoded RGBA + non-empty alpha",
        },
        "summary": {
            "targetUsageCount": 48,
            "targetUniqueIconPathCount": 48,
            "packageScanCount": EXPECTED_PACKAGE_COUNT,
            "bundleScanCount": EXPECTED_BUNDLE_COUNT,
            "provedCount": len(rows),
            "missingCount": 0,
            "publicPathCollisionCount": 0,
        },
        "records": rows,
    }
    report["materializationSetSha256"] = compact(rows)
    report["materializationHashContract"] = "sha256(UTF-8 compact JSON of records array sorted by exact sourcePath)"
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status":"PASS_MATERIALIZED", **report["summary"], "materializationSetSha256": report["materializationSetSha256"]}, indent=2))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shard-index", type=int)
    ap.add_argument("--shard-count", type=int)
    ap.add_argument("--output")
    ap.add_argument("--merge-dir")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    if args.shard_index is not None:
        if not args.output:
            raise RuntimeError("--output required for shard mode")
        run_shard(args)
    elif args.merge_dir and args.write:
        materialize(args)
    else:
        raise RuntimeError("use shard mode or --merge-dir DIR --write")

if __name__ == "__main__":
    main()
