#!/usr/bin/env python3
import argparse
import importlib.util
import json
import pathlib
import sys
from collections import deque

import UnityPy

ROOT = pathlib.Path(__file__).resolve().parent.parent
BULK_PATH = ROOT / "scripts/run-skin-detail-spine-stage3-bulk.py"
OUT = ROOT / "skin-detail-spine-stage3-blocker-repair.json"

spec = importlib.util.spec_from_file_location("skin_stage3_bulk_repair", BULK_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"unable to load {BULK_PATH}")
bulk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bulk)
base = bulk.base

# Frozen package provenance from completed Stage 3 blocker diagnostic run 33301771699.
# No 68-part rescan is allowed here.
BLOCKERS = {
    1101: {
        "runtimePath": "assets/gameproject/runtimeassets/spine/char/nahm_abs/nahm_skin02_prefab.prefab",
        "bundles": [("begin_spine_char_nahm_abs.b", 25), ("spine_char_nahm_abs.b", 39)],
    },
    1301: {
        "runtimePath": "assets/gameproject/runtimeassets/spine/char/hein_abs/hein_skin_prefab.prefab",
        "bundles": [("begin_spine_char_hein_abs.b", 24), ("spine_char_hein_abs.b", 35)],
    },
    1403: {
        "runtimePath": "assets/gameproject/runtimeassets/spine/char/sherry_abs/sherry_skin03_prefab.prefab",
        "bundles": [("begin_spine_char_sherry_abs.b", 25), ("spine_char_sherry_abs.b", 43)],
    },
    3502: {
        "runtimePath": "assets/gameproject/runtimeassets/spine/char/npc_anjelica_abs/anjelica_skin02_prefab.prefab",
        "bundles": [("begin_spine_char_npc_anjelica_abs.b", 25), ("spine_char_npc_anjelica_abs.b", 39)],
    },
    5102: {
        "runtimePath": "assets/gameproject/runtimeassets/spine/char/schelfaniel_abs/schelfaniel_skin02_prefab.prefab",
        "bundles": [("begin_spine_char_schelfaniel_abs.b", 25), ("spine_char_schelfaniel_abs.b", 43)],
    },
    5103: {
        "runtimePath": "assets/gameproject/runtimeassets/spine/char/schelfaniel_abs/schelfaniel_skin04_prefab.prefab",
        "bundles": [("begin_spine_char_schelfaniel_abs.b", 25), ("spine_char_schelfaniel_abs.b", 43)],
    },
    12403: {
        "runtimePath": "assets/gameproject/runtimeassets/spine/char/christiane_abs/christiane_skin03_prefab.prefab",
        "bundles": [("begin_spine_char_christiane_abs.b", 24), ("spine_char_christiane_abs.b", 33)],
    },
    9921901: {
        "runtimePath": "assets/gameproject/runtimeassets/spine/char/jayce_abs/jayce_skin01_prefab.prefab",
        "bundles": [("begin_spine_char_jayce_abs.b", 25), ("spine_char_jayce_abs.b", 36)],
    },
}


def norm(s):
    return str(s).replace("\\", "/").strip("/").lower()


def af_name(af):
    for attr in ("name", "path"):
        v = getattr(af, attr, None)
        if isinstance(v, str) and v:
            return pathlib.PurePosixPath(v.replace("\\", "/")).name
    return f"assets-file-{id(af)}"


def external_path(ext):
    for attr in ("path", "name"):
        v = getattr(ext, attr, None)
        if isinstance(v, str) and v:
            return v.replace("\\", "/")
    return str(ext)


def get_object(af, path_id):
    objects = getattr(af, "objects", None)
    if isinstance(objects, dict):
        return objects.get(path_id)
    if objects is not None:
        for obj in objects:
            if int(getattr(obj, "path_id", 0)) == int(path_id):
                return obj
    return None


def asset_files(env):
    rows = []
    seen = set()
    for obj in env.objects:
        af = getattr(obj, "assets_file", None)
        if af is None or id(af) in seen:
            continue
        seen.add(id(af))
        rows.append(af)
    return rows


def external_map_rows(afs):
    rows = []
    for af in afs:
        externals = list(getattr(af, "externals", []) or [])
        rows.append({
            "assetsFile": af_name(af),
            "externalFiles": [external_path(x) for x in externals],
        })
    return rows


def resolve_ref(source_obj, file_id, path_id, afs):
    source_af = getattr(source_obj, "assets_file", None)
    if source_af is None or path_id == 0:
        return None, None
    if file_id == 0:
        return get_object(source_af, path_id), {"mode": "LOCAL", "assetsFile": af_name(source_af)}
    externals = list(getattr(source_af, "externals", []) or [])
    idx = file_id - 1
    if idx < 0 or idx >= len(externals):
        return None, {"mode": "EXTERNAL_INDEX_OUT_OF_RANGE", "fileId": file_id, "externalCount": len(externals)}
    ext = externals[idx]
    ext_path = external_path(ext)
    target_name = pathlib.PurePosixPath(ext_path).name.lower()
    matches = [af for af in afs if af_name(af).lower() == target_name]
    if len(matches) != 1:
        # Some Unity external paths include CAB names in an archive-style path.
        matches = [af for af in afs if af_name(af).lower() in ext_path.lower()]
    if len(matches) != 1:
        return None, {
            "mode": "EXTERNAL_ASSETS_FILE_NOT_UNIQUE",
            "fileId": file_id,
            "externalPath": ext_path,
            "targetAssetsFiles": [af_name(x) for x in matches],
        }
    target_af = matches[0]
    return get_object(target_af, path_id), {
        "mode": "EXTERNAL_RESOLVED",
        "fileId": file_id,
        "externalPath": ext_path,
        "assetsFile": af_name(target_af),
    }


def cross_reachable(root_obj, afs, max_nodes=2400, max_depth=24):
    q = deque([(root_obj, 0)])
    seen = set()
    rows = []
    ref_report = []
    while q and len(seen) < max_nodes:
        obj, depth = q.popleft()
        key = (id(getattr(obj, "assets_file", None)), int(getattr(obj, "path_id", 0)))
        if key in seen or depth > max_depth:
            continue
        seen.add(key)
        rows.append(obj)
        try:
            tree = obj.read_typetree()
        except Exception:
            continue
        for ref in base.pptr_refs(tree):
            try:
                file_id = int(ref.get("fileId", 0))
                path_id = int(ref.get("pathId", 0))
            except Exception:
                continue
            if path_id == 0:
                continue
            target, resolution = resolve_ref(obj, file_id, path_id, afs)
            if file_id != 0:
                ref_report.append({
                    "sourceAssetsFile": af_name(getattr(obj, "assets_file", None)),
                    "sourceType": base.object_type(obj),
                    "sourcePathId": int(obj.path_id),
                    "fileId": file_id,
                    "pathId": path_id,
                    "resolution": resolution,
                    "targetType": base.object_type(target) if target is not None else None,
                    "targetName": base.object_name(target) if target is not None else None,
                })
            if target is not None:
                q.append((target, depth + 1))
    return rows, ref_report


_part_cache = {}
_entry_cache = {}


def exact_entry(bundle_name, part):
    key = (part, bundle_name)
    if key in _entry_cache:
        return _entry_cache[key]
    if part not in _part_cache:
        _part_cache[part] = base.zip_directory(part)
    info = _part_cache[part]
    hits = []
    for entry in info["entries"]:
        if pathlib.PurePosixPath(entry["normName"]).name == bundle_name:
            hits.append({**entry, "part": part, "packageName": info["packageName"], "packageSizeBytes": info["packageSizeBytes"], "url": info["url"]})
    if len(hits) != 1:
        raise RuntimeError(f"{bundle_name}@part{part} entry cardinality {len(hits)}")
    _entry_cache[key] = hits[0]
    return hits[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--geometry-project", type=pathlib.Path, required=True)
    ap.add_argument("--work-dir", type=pathlib.Path, default=pathlib.Path("/tmp/skin-spine-blocker-repair"))
    args = ap.parse_args()
    args.work_dir.mkdir(parents=True, exist_ok=True)

    bundle_bytes = {}
    bundle_meta = {}
    for cfg in BLOCKERS.values():
        for bundle_name, part in cfg["bundles"]:
            if bundle_name in bundle_bytes:
                continue
            meta = exact_entry(bundle_name, part)
            raw = base.fetch_zip_entry(meta)
            bundle_bytes[bundle_name] = raw
            bundle_meta[bundle_name] = {"part": part, "sizeBytes": len(raw), "sha256": bulk.sha256_bytes(raw)}

    records = []
    for skin_id, cfg in BLOCKERS.items():
        pair = cfg["bundles"]
        raws = [bundle_bytes[name] for name, _ in pair]
        try:
            env = UnityPy.load(*raws)
        except Exception as exc:
            records.append({"skinId": skin_id, "status": "BLOCK_COMBINED_ENV_LOAD", "error": repr(exc)})
            continue
        afs = asset_files(env)
        hits = bulk.exact_container_hits(env, cfg["runtimePath"])
        row = {
            "skinId": skin_id,
            "runtimePath": cfg["runtimePath"],
            "bundles": [{"name": n, **bundle_meta[n]} for n, _ in pair],
            "combinedAssetsFiles": external_map_rows(afs),
            "exactRuntimePathCount": len(hits),
        }
        if len(hits) != 1:
            row["status"] = "BLOCK_COMBINED_EXACT_RUNTIME_PATH_CARDINALITY"
            records.append(row)
            continue
        _, root_obj = hits[0]
        reachable, ref_report = cross_reachable(root_obj, afs)
        row["crossReachableObjectCount"] = len(reachable)
        row["crossReachableTypeCounts"] = dict(sorted(__import__("collections").Counter(base.object_type(o) for o in reachable).items()))
        row["externalReferenceResolutions"] = ref_report
        row["crossReachableTextAssets"] = [
            {"name": base.object_name(o), "pathId": int(o.path_id), "assetsFile": af_name(o.assets_file)}
            for o in reachable if base.object_type(o) == "TextAsset"
        ]

        old = bulk.reachable_objects
        bulk.reachable_objects = lambda root, max_nodes=1600, max_depth=20, _afs=afs: cross_reachable(root, _afs, max_nodes=max_nodes, max_depth=max_depth)[0]
        try:
            selected = bulk.extract_render_input(env, root_obj, skin_id, "PAIR_COMBINED", "PAIR_COMBINED", 0)
            row["input"] = {
                "skelName": selected["skelName"],
                "atlasName": selected["atlasName"],
                "atlasPageName": selected["atlasPageName"],
                "fingerprint": selected["fingerprint"],
                "textureEvidence": selected["textureEvidence"],
                "textureMeta": selected["textureMeta"],
            }
            status, detail = bulk.render_one({"skinId": skin_id}, selected, args.work_dir, args.geometry_project.resolve())
            row["status"] = status
            row["render"] = detail
        except Exception as exc:
            code, detail = bulk.classify_exception(exc)
            row["status"] = code
            row["error"] = detail
        finally:
            bulk.reachable_objects = old
        records.append(row)
        print(json.dumps({"skinId": skin_id, "status": row["status"], "crossReachableTextAssets": row.get("crossReachableTextAssets")}, ensure_ascii=False), flush=True)

    out = {
        "schemaVersion": 1,
        "stage": "skin-detail-spine-stage3",
        "substage": "cross-bundle-blocker-repair-probe",
        "sourceBulkRun": 33300225041,
        "sourceDiagnosticRun": 33301771699,
        "packageProvenanceSource": "FROZEN_FROM_RUN_33301771699",
        "all68PackageRescan": False,
        "blockedSkinIds": sorted(BLOCKERS),
        "guardrails": {
            "onlyCrossBundleBlockedSkinIdsInvestigated": True,
            "pass531Reopened": False,
            "canonicalSkinRecomputed": False,
            "heroSkinOwnershipRecomputed": False,
            "frontendMutation": False,
            "publicSkinAssetMutation": False,
            "classFusionTouched": False,
        },
        "records": records,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(OUT), "statusCounts": dict(__import__("collections").Counter(r["status"] for r in records))}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    raise SystemExit(main())
