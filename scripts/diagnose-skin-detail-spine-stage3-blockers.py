#!/usr/bin/env python3
import argparse
import hashlib
import importlib.util
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
V2 = ROOT / "scripts/run-skin-detail-spine-stage3-bulk-v2.py"
INVENTORY = ROOT / "data/generated/skin-stage3-1-asset-inventory.v1.json"
OUTPUT = ROOT / "skin-detail-spine-stage3-blocker-diagnostic.json"
BLOCKED = {1001, 1101, 1301, 1403, 3502, 5102, 5103, 12403, 9921901}

spec = importlib.util.spec_from_file_location("skin_stage3_bulk_v2", V2)
if spec is None or spec.loader is None:
    raise RuntimeError(f"unable to load {V2}")
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)
bulk = v2.bulk


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def obj_desc(obj):
    return {
        "type": bulk.base.object_type(obj),
        "pathId": int(obj.path_id),
        "name": bulk.base.object_name(obj),
        "assetsFile": bulk.base.assets_file_name(obj),
    }


def text_desc(obj):
    row = obj_desc(obj)
    try:
        data = bulk.base.text_asset_bytes(obj)
        row.update({"sizeBytes": len(data), "sha256": sha(data), "headHex": data[:24].hex()})
        if (row.get("name") or "").lower().endswith(".atlas"):
            row["atlasPages"] = bulk.atlas_pages(data)
    except Exception as exc:
        row["readError"] = str(exc)
    return row


def external_refs(objects):
    rows = []
    seen = set()
    for obj in objects:
        try:
            tree = obj.read_typetree()
        except Exception:
            continue
        for ref in bulk.base.pptr_refs(tree):
            file_id = int(ref.get("fileId", 0) or 0)
            path_id = int(ref.get("pathId", 0) or 0)
            if file_id == 0 or path_id == 0:
                continue
            key = (int(obj.path_id), ref.get("field"), file_id, path_id)
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                "source": obj_desc(obj),
                "field": ref.get("field"),
                "fileId": file_id,
                "pathId": path_id,
            })
    return rows[:250]


def texture_candidates(env, page_names):
    wanted = {p.lower() for p in page_names}
    stems = {pathlib.PurePosixPath(p).stem.lower() for p in page_names}
    object_hits = []
    for obj in env.objects:
        if bulk.base.object_type(obj) not in {"Texture2D", "Sprite"}:
            continue
        name = (bulk.base.object_name(obj) or "").lower()
        if name in wanted or name in stems:
            object_hits.append(obj_desc(obj))
    container_hits = []
    for path, value in env.container.items():
        if not isinstance(path, str):
            continue
        base_name = pathlib.PurePosixPath(path.replace("\\", "/")).name.lower()
        if base_name not in wanted:
            continue
        obj = bulk.base.resolve_container_value(value)
        if bulk.base.object_type(obj) in {"Texture2D", "Sprite"}:
            container_hits.append({"containerPath": path, **obj_desc(obj)})
    return {"objectNameHits": object_hits, "containerHits": container_hits}


def geometry_probe(selected, geometry_project, work_dir):
    d = work_dir / str(selected["skinId"])
    d.mkdir(parents=True, exist_ok=True)
    skel = d / selected["skelName"]
    atlas = d / selected["atlasName"]
    texture = d / selected["atlasPageName"]
    out = d / "geometry.json"
    skel.write_bytes(selected["skelBytes"])
    atlas.write_bytes(selected["atlasBytes"])
    texture.write_bytes(selected["texturePng"])
    p = subprocess.run([
        "dotnet", "run", "--project", str(geometry_project), "-c", "Release", "--no-build", "--",
        str(skel), str(atlas), str(out), "idle_Normal", "0",
    ], text=True, capture_output=True, check=False)
    row = {"returnCode": p.returncode, "stdoutTail": p.stdout[-4000:], "stderrTail": p.stderr[-4000:]}
    if out.is_file():
        try:
            g = json.loads(out.read_text("utf-8"))
            row["geometrySummary"] = {
                "skeletonVersion": g.get("skeletonVersion"),
                "animationName": g.get("animationName"),
                "drawItemCount": g.get("drawItemCount"),
                "blendModeCounts": g.get("blendModeCounts"),
                "worldBounds": g.get("worldBounds"),
            }
        except Exception as exc:
            row["geometryJsonError"] = str(exc)
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--geometry-project", type=pathlib.Path, required=True)
    ap.add_argument("--work-dir", type=pathlib.Path, default=pathlib.Path("/tmp/skin-spine-blocker-diagnostic"))
    args = ap.parse_args()
    work_dir = args.work_dir.resolve()
    work_dir.mkdir(parents=True, exist_ok=True)
    geometry_project = args.geometry_project.resolve()

    inventory = json.loads(INVENTORY.read_text("utf-8"))
    rows = [r for r in inventory["records"] if int(r["skinId"]) in BLOCKED]
    if len(rows) != len(BLOCKED):
        raise RuntimeError(f"blocked inventory coverage changed: {len(rows)} != {len(BLOCKED)}")

    targets = {}
    candidate_names = set()
    for row in rows:
        sid = int(row["skinId"])
        locator = row["spine"]["sourceSpinePath"]
        candidates = bulk.char_candidates(locator)
        targets[sid] = {
            "skinId": sid,
            "heroId": int(row["heroId"]),
            "sourceOrder": int(row["sourceOrder"]),
            "frozenSpinePath": locator,
            "runtimePath": bulk.runtime_path(locator),
            "candidateBundles": candidates,
        }
        candidate_names.update(candidates)

    catalog = {}
    for part in range(1, bulk.base.MAX_PACKAGE_PART + 1):
        info = bulk.base.zip_directory(part)
        for entry in info["entries"]:
            name = pathlib.PurePosixPath(entry["normName"]).name
            if name not in candidate_names:
                continue
            catalog.setdefault(name, []).append({
                **entry,
                "part": part,
                "packageName": info["packageName"],
                "packageSizeBytes": info["packageSizeBytes"],
                "url": info["url"],
            })

    results = []
    for sid in sorted(targets):
        target = targets[sid]
        target_result = {**target, "bundleDiagnostics": []}
        for bundle_name in target["candidateBundles"]:
            entries = catalog.get(bundle_name, [])
            if not entries:
                continue
            if len(entries) != 1:
                target_result["bundleDiagnostics"].append({"bundle": bundle_name, "status": "PACKAGE_ENTRY_CARDINALITY", "count": len(entries)})
                continue
            meta = entries[0]
            raw = bulk.base.fetch_zip_entry(meta)
            env = bulk.UnityPy.load(raw)
            hits = bulk.exact_container_hits(env, target["runtimePath"])
            bundle_row = {
                "bundle": bundle_name,
                "officialPackagePart": int(meta["part"]),
                "bundleSizeBytes": len(raw),
                "bundleSha256": sha(raw),
                "exactRuntimePathCount": len(hits),
            }
            if len(hits) != 1:
                target_result["bundleDiagnostics"].append(bundle_row)
                continue
            _, root_obj = hits[0]
            v2._CURRENT_ENV_OBJECTS = list(env.objects)
            try:
                reachable = v2.fixed_reachable_objects(root_obj)
            finally:
                v2._CURRENT_ENV_OBJECTS = []
            root_af = getattr(root_obj, "assets_file", None)
            same_file_objects = [o for o in env.objects if getattr(o, "assets_file", None) is root_af]
            reachable_text = [o for o in reachable if bulk.base.object_type(o) == "TextAsset"]
            same_file_text = [o for o in same_file_objects if bulk.base.object_type(o) == "TextAsset"]
            all_text = [o for o in env.objects if bulk.base.object_type(o) == "TextAsset"]
            page_names = []
            for obj in same_file_text:
                name = bulk.base.object_name(obj) or ""
                if not name.lower().endswith(".atlas"):
                    continue
                try:
                    page_names.extend(bulk.atlas_pages(bulk.base.text_asset_bytes(obj)))
                except Exception:
                    pass
            bundle_row.update({
                "root": obj_desc(root_obj),
                "reachableObjectCount": len(reachable),
                "reachableTypeCounts": {t: sum(1 for o in reachable if bulk.base.object_type(o) == t) for t in sorted({bulk.base.object_type(o) for o in reachable})},
                "reachableTextAssets": [text_desc(o) for o in reachable_text],
                "sameSerializedFileTextAssets": [text_desc(o) for o in same_file_text],
                "allBundleTextAssets": [text_desc(o) for o in all_text[:120]],
                "externalRefsFromReachable": external_refs(reachable),
                "atlasTextureCandidatesFromSameFilePages": texture_candidates(env, sorted(set(page_names))),
            })
            try:
                selected = bulk.extract_render_input(env, root_obj, sid, bundle_name, sha(raw), int(meta["part"]))
                bundle_row["bulkExtractorStatus"] = "RESOLVED"
                bundle_row["selectedFingerprint"] = selected["fingerprint"]
                bundle_row["geometryProbe"] = geometry_probe(selected, geometry_project, work_dir)
            except Exception as exc:
                code, detail = bulk.classify_exception(exc)
                bundle_row["bulkExtractorStatus"] = code
                bundle_row["bulkExtractorDetail"] = detail
            target_result["bundleDiagnostics"].append(bundle_row)
        results.append(target_result)
        print(json.dumps({"skinId": sid, "bundleDiagnostics": len(target_result["bundleDiagnostics"])}, ensure_ascii=False), flush=True)

    out = {
        "schemaVersion": 1,
        "stage": "skin-detail-spine-stage3",
        "substage": "blocker-diagnostic",
        "sourceBulkRun": 33300225041,
        "sourceBulkHead": "7b871f3e40860c7e89c9f1068fbae9a50954bd8e",
        "blockedSkinIds": sorted(BLOCKED),
        "guardrails": {
            "onlyBlockedSkinIdsInvestigated": True,
            "canonicalSkinRecomputed": False,
            "heroSkinOwnershipRecomputed": False,
            "frontendMutation": False,
            "publicSkinAssetMutation": False,
            "classFusionTouched": False,
        },
        "records": results,
    }
    OUTPUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps({"output": str(OUTPUT), "recordCount": len(results)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
