#!/usr/bin/env python3
import argparse
import hashlib
import importlib.util
import io
import json
import pathlib
import re
import shutil
import subprocess
import sys
from collections import Counter, deque

from PIL import Image
import UnityPy

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE_SCRIPT = ROOT / "scripts/probe-skin-detail-spine-stage2.py"
RAW_HELPER_SCRIPT = ROOT / "scripts/run-skin-detail-spine-stage2-contract-probe.py"
INVENTORY = ROOT / "data/generated/skin-stage3-1-asset-inventory.v1.json"
OUT_ROOT = ROOT / "skin-detail-spine-stage3-bulk-artifacts"
SUMMARY = ROOT / "skin-detail-spine-stage3-bulk-summary.json"
RUNTIME_COMMIT = "1c1936532527900f74cfb58f7002998bf157b254"
EXPECTED_SKINS = 540
EXPECTED_SKELETON_VERSION = "3.3.05"
ALLOWED_BLEND_MODES = {"normal", "additive", "multiply", "screen"}


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_module("skin_stage2_base", BASE_SCRIPT)
raw_helper = load_module("skin_stage2_raw_helper", RAW_HELPER_SCRIPT)
base.text_asset_bytes = lambda obj: raw_helper.exact_text_asset_bytes(base, obj)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def norm(value: str) -> str:
    return str(value).replace("\\", "/").strip("/").lower()


def char_candidates(locator: str) -> list[str]:
    m = re.match(r"^Spine/Char/([^/]+)_ABS/", locator, re.I)
    if not m:
        return []
    current = f"spine_char_{m.group(1).lower()}_abs.b"
    return [f"begin_{current}", current]


def runtime_path(locator: str) -> str:
    return norm(f"assets/gameproject/runtimeassets/{locator}")


def owner_key(obj):
    return (id(getattr(obj, "assets_file", None)), int(getattr(obj, "path_id")))


def reachable_objects(root_obj, max_nodes=1600, max_depth=20):
    root_af = getattr(root_obj, "assets_file", None)
    if root_af is None:
        raise RuntimeError("root object has no assets_file")
    env = getattr(root_af, "parent", None)
    objects = list(getattr(env, "objects", [])) if env is not None else []
    if not objects:
        # UnityPy Environment is not always exposed as assets_file.parent.objects.
        # Caller patches _bulk_env on the root for deterministic access.
        objects = list(getattr(root_obj, "_bulk_env_objects", []))
    by_key = {owner_key(obj): obj for obj in objects}
    start = owner_key(root_obj)
    q = deque([(start, 0)])
    seen = set()
    rows = []
    while q and len(seen) < max_nodes:
        key, depth = q.popleft()
        if key in seen or depth > max_depth:
            continue
        obj = by_key.get(key)
        if obj is None:
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
            if file_id != 0 or path_id == 0:
                continue
            q.append(((id(getattr(obj, "assets_file", None)), path_id), depth + 1))
    return rows


def exact_container_hits(env, target_runtime_path: str):
    wanted = norm(target_runtime_path)
    hits = []
    for container_path, value in env.container.items():
        if not isinstance(container_path, str) or norm(container_path) != wanted:
            continue
        obj = base.resolve_container_value(value)
        hits.append((container_path, obj))
    return hits


def atlas_pages(atlas_bytes: bytes) -> list[str]:
    text = atlas_bytes.decode("utf-8", "replace")
    pages = []
    for line in text.splitlines():
        s = line.strip()
        if s.lower().endswith((".png", ".jpg", ".jpeg")):
            name = pathlib.PurePosixPath(s).name
            if name not in pages:
                pages.append(name)
    return pages


def export_texture_png(obj) -> tuple[bytes, dict]:
    parsed = obj.read()
    image = getattr(parsed, "image", None)
    if image is None:
        raise RuntimeError("atlas page object has no image handler")
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    data = buf.getvalue()
    return data, {
        "objectType": base.object_type(obj),
        "pathId": int(obj.path_id),
        "name": base.object_name(obj),
        "width": int(image.width),
        "height": int(image.height),
        "pngSha256": sha256_bytes(data),
        "pngSizeBytes": len(data),
    }


def extract_render_input(env, root_obj, skin_id: int, bundle_name: str, bundle_sha: str, package_part: int):
    # Make Environment objects available to the graph walker without relying on
    # UnityPy's internal parent shape.
    objects = list(env.objects)
    try:
        setattr(root_obj, "_bulk_env_objects", objects)
    except Exception:
        pass

    reachable = reachable_objects(root_obj)
    text_rows = []
    reachable_text_ids = set()
    reachable_texture_ids = set()
    for obj in reachable:
        typ = base.object_type(obj)
        if typ == "TextAsset":
            data = base.text_asset_bytes(obj)
            name = base.object_name(obj) or ""
            text_rows.append((obj, name, data))
            reachable_text_ids.add(int(obj.path_id))
        elif typ in {"Texture2D", "Sprite"}:
            reachable_texture_ids.add((base.object_type(obj), int(obj.path_id)))

    skels = [(obj, name, data) for obj, name, data in text_rows if name.lower().endswith(".skel")]
    atlases = [(obj, name, data) for obj, name, data in text_rows if name.lower().endswith(".atlas")]
    if len(skels) != 1:
        raise RuntimeError(f"BLOCK_SKEL_DEPENDENCY_CARDINALITY:{len(skels)}")
    if len(atlases) != 1:
        raise RuntimeError(f"BLOCK_ATLAS_DEPENDENCY_CARDINALITY:{len(atlases)}")

    skel_obj, skel_name, skel_bytes = skels[0]
    atlas_obj, atlas_name, atlas_bytes = atlases[0]
    pages = atlas_pages(atlas_bytes)
    if len(pages) != 1:
        raise RuntimeError(f"BLOCK_ATLAS_PAGE_CARDINALITY:{len(pages)}")
    page_name = pages[0]
    page_lower = page_name.lower()
    page_stem = pathlib.PurePosixPath(page_name).stem.lower()

    texture_candidates = []
    # First preference: texture/sprite reached from the exact prefab graph and
    # exact atlas-page object name.
    for obj in reachable:
        typ = base.object_type(obj)
        if typ not in {"Texture2D", "Sprite"}:
            continue
        name = (base.object_name(obj) or "").lower()
        if name in {page_lower, page_stem}:
            texture_candidates.append(("REACHABLE_EXACT_ATLAS_PAGE_NAME", obj))

    if not texture_candidates:
        # Same-bundle exact container basename is the already-admitted Stage 2
        # fallback. Atlas page name itself is dependency evidence; no free name
        # search or cross-bundle fallback is used.
        for container_path, value in env.container.items():
            if not isinstance(container_path, str):
                continue
            if pathlib.PurePosixPath(container_path.replace("\\", "/")).name.lower() != page_lower:
                continue
            obj = base.resolve_container_value(value)
            if base.object_type(obj) in {"Texture2D", "Sprite"}:
                texture_candidates.append(("SAME_BUNDLE_EXACT_ATLAS_PAGE_CONTAINER", obj))

    unique = {}
    for evidence, obj in texture_candidates:
        unique[(base.object_type(obj), int(obj.path_id))] = (evidence, obj)
    texture_candidates = list(unique.values())
    if len(texture_candidates) != 1:
        raise RuntimeError(f"BLOCK_ATLAS_TEXTURE_CARDINALITY:{len(texture_candidates)}")

    texture_evidence, texture_obj = texture_candidates[0]
    texture_png, texture_meta = export_texture_png(texture_obj)
    fingerprint = {
        "skelSha256": sha256_bytes(skel_bytes),
        "atlasSha256": sha256_bytes(atlas_bytes),
        "texturePngSha256": sha256_bytes(texture_png),
        "atlasPageName": page_name,
    }
    return {
        "skinId": skin_id,
        "bundle": bundle_name,
        "bundleSha256": bundle_sha,
        "officialPackagePart": package_part,
        "embeddedCab": base.assets_file_name(root_obj),
        "rootPathId": int(root_obj.path_id),
        "skelName": skel_name,
        "skelPathId": int(skel_obj.path_id),
        "skelBytes": skel_bytes,
        "atlasName": atlas_name,
        "atlasPathId": int(atlas_obj.path_id),
        "atlasBytes": atlas_bytes,
        "atlasPageName": page_name,
        "textureEvidence": texture_evidence,
        "textureMeta": texture_meta,
        "texturePng": texture_png,
        "fingerprint": fingerprint,
        "reachableObjectCount": len(reachable),
        "reachableTextAssetCount": len(text_rows),
    }


def classify_exception(exc: Exception) -> tuple[str, str]:
    text = str(exc)
    if text.startswith("BLOCK_"):
        code, _, detail = text.partition(":")
        return code, detail
    return "BLOCK_INPUT_EXTRACTION_ERROR", text


def run_checked(cmd, cwd=None):
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, check=False)


def render_one(record, selected, work_dir: pathlib.Path, geometry_project: pathlib.Path):
    skin_id = record["skinId"]
    skin_work = work_dir / str(skin_id)
    skin_work.mkdir(parents=True, exist_ok=True)
    skel_path = skin_work / selected["skelName"]
    atlas_path = skin_work / selected["atlasName"]
    texture_path = skin_work / selected["atlasPageName"]
    geometry_path = skin_work / "geometry-idle0.json"
    render_path = OUT_ROOT / "renders" / f"{skin_id}.png"
    render_path.parent.mkdir(parents=True, exist_ok=True)
    skel_path.write_bytes(selected["skelBytes"])
    atlas_path.write_bytes(selected["atlasBytes"])
    texture_path.write_bytes(selected["texturePng"])

    geo = run_checked([
        "dotnet", "run", "--project", str(geometry_project), "-c", "Release", "--no-build", "--",
        str(skel_path), str(atlas_path), str(geometry_path), "idle_Normal", "0",
    ])
    if geo.returncode != 0:
        return "BLOCK_GEOMETRY_EXPORT", {
            "error": (geo.stderr or geo.stdout)[-4000:],
        }
    try:
        g = json.loads(geometry_path.read_text("utf-8"))
    except Exception as exc:
        return "BLOCK_GEOMETRY_JSON", {"error": str(exc)}
    if g.get("skeletonVersion") != EXPECTED_SKELETON_VERSION:
        return "BLOCK_SKELETON_VERSION", {"skeletonVersion": g.get("skeletonVersion")}
    if g.get("animationName") != "idle_Normal":
        return "BLOCK_IDLE_NORMAL_ABSENT", {"animationName": g.get("animationName")}
    blend_counts = g.get("blendModeCounts") or {}
    unsupported_blends = sorted(k for k in blend_counts if str(k).lower() not in ALLOWED_BLEND_MODES)
    if unsupported_blends:
        return "BLOCK_UNSUPPORTED_BLEND_MODE", {"unsupportedBlendModes": unsupported_blends, "blendModeCounts": blend_counts}
    draw_pages = sorted({pathlib.PurePosixPath(str(x.get("atlasPage") or "")).name.lower() for x in g.get("drawItems", []) if x.get("atlasPage")})
    if len(draw_pages) != 1 or draw_pages[0] != selected["atlasPageName"].lower():
        return "BLOCK_RENDER_ATLAS_PAGE_MISMATCH", {"drawAtlasPages": draw_pages, "selectedAtlasPage": selected["atlasPageName"]}

    rendered = run_checked([
        sys.executable, str(ROOT / "scripts/render-spine-stage2-geometry.py"),
        str(geometry_path), str(texture_path), str(render_path),
    ])
    if rendered.returncode != 0:
        return "BLOCK_CPU_RENDER", {"error": (rendered.stderr or rendered.stdout)[-4000:]}
    try:
        render_meta = json.loads(rendered.stdout.strip().splitlines()[-1])
        im = Image.open(render_path).convert("RGBA")
        alpha = im.getchannel("A")
        bbox = alpha.getbbox()
    except Exception as exc:
        return "BLOCK_RENDER_VALIDATION", {"error": str(exc)}
    if bbox is None or int(render_meta.get("nonTransparentPixelCount", 0)) <= 0:
        return "BLOCK_ALPHA_EMPTY", {"renderMeta": render_meta}
    left, top, right, bottom = bbox
    if left <= 0 or top <= 0 or right >= im.width or bottom >= im.height:
        return "BLOCK_ALPHA_CLIPPED", {"alphaBounds": list(bbox), "canvas": [im.width, im.height]}

    return "PASS_RENDERED", {
        "renderPath": render_path.relative_to(ROOT).as_posix(),
        "renderSha256": sha256_file(render_path),
        "renderSizeBytes": render_path.stat().st_size,
        "canvas": [im.width, im.height],
        "alphaBounds": list(bbox),
        "nonTransparentPixelCount": int(render_meta.get("nonTransparentPixelCount", 0)),
        "triangleCount": int(render_meta.get("triangleCount", 0)),
        "drawItemCount": int(g.get("drawItemCount", 0)),
        "attachmentTypeCounts": g.get("attachmentTypeCounts") or {},
        "blendModeCounts": blend_counts,
        "worldBounds": g.get("worldBounds"),
        "skeletonVersion": g.get("skeletonVersion"),
        "animationName": g.get("animationName"),
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--geometry-project", type=pathlib.Path, required=True)
    p.add_argument("--work-dir", type=pathlib.Path, default=pathlib.Path("/tmp/skin-detail-spine-stage3-bulk"))
    args = p.parse_args()
    geometry_project = args.geometry_project.resolve()
    work_dir = args.work_dir.resolve()
    work_dir.mkdir(parents=True, exist_ok=True)
    if OUT_ROOT.exists():
        shutil.rmtree(OUT_ROOT)
    OUT_ROOT.mkdir(parents=True)

    inventory = json.loads(INVENTORY.read_text("utf-8"))
    records = inventory.get("records") or []
    if inventory.get("counts", {}).get("skinCount") != EXPECTED_SKINS or len(records) != EXPECTED_SKINS:
        raise RuntimeError(f"frozen Skin inventory changed: counts={inventory.get('counts', {}).get('skinCount')} records={len(records)}")

    targets = []
    candidate_names = set()
    for row in records:
        locator = row.get("spine", {}).get("sourceSpinePath")
        candidates = char_candidates(locator or "")
        if len(candidates) != 2:
            raise RuntimeError(f"Skin {row.get('skinId')} has nonstandard frozen CHAR_SPINE locator {locator!r}")
        target = {
            "skinId": int(row["skinId"]),
            "heroId": int(row["heroId"]),
            "sourceOrder": int(row["sourceOrder"]),
            "frozenSpinePath": locator,
            "runtimePath": runtime_path(locator),
            "candidateBundles": candidates,
        }
        targets.append(target)
        candidate_names.update(candidates)

    # Only scan ZIP central directories first. Full bytes are downloaded only for
    # candidate CHAR_SPINE bundles that are actually present in the official PC installer.
    catalog = {}
    scanned_parts = []
    for part in range(1, base.MAX_PACKAGE_PART + 1):
        info = base.zip_directory(part)
        hits = []
        for entry in info["entries"]:
            basename = pathlib.PurePosixPath(entry["normName"]).name
            if basename not in candidate_names:
                continue
            meta = {
                **entry,
                "part": part,
                "packageName": info["packageName"],
                "packageSizeBytes": info["packageSizeBytes"],
                "url": info["url"],
            }
            catalog.setdefault(basename, []).append(meta)
            hits.append(basename)
        scanned_parts.append({"part": part, "entryCount": len(info["entries"]), "candidateHits": sorted(set(hits))})

    target_by_bundle = {}
    for target in targets:
        for candidate in target["candidateBundles"]:
            if candidate in catalog:
                target_by_bundle.setdefault(candidate, []).append(target)

    evidence = {target["skinId"]: [] for target in targets}
    input_by_skin = {}
    bundle_reports = []
    for bundle_name in sorted(target_by_bundle):
        entries = catalog[bundle_name]
        if len(entries) != 1:
            bundle_reports.append({"bundle": bundle_name, "status": "PACKAGE_ENTRY_CARDINALITY", "entryCount": len(entries)})
            continue
        meta = entries[0]
        try:
            raw = base.fetch_zip_entry(meta)
            bundle_sha = sha256_bytes(raw)
            env = UnityPy.load(raw)
            exact_count = 0
            for target in target_by_bundle[bundle_name]:
                hits = exact_container_hits(env, target["runtimePath"])
                if len(hits) == 0:
                    continue
                if len(hits) != 1:
                    evidence[target["skinId"]].append({
                        "bundle": bundle_name,
                        "bundleSha256": bundle_sha,
                        "officialPackagePart": meta["part"],
                        "status": "BLOCK_EXACT_RUNTIME_PATH_CARDINALITY",
                        "exactRuntimePathCount": len(hits),
                    })
                    continue
                exact_count += 1
                _, root_obj = hits[0]
                try:
                    # Attach the Environment object list to the root in a wrapper-safe way.
                    # If ObjectReader rejects dynamic attrs, reachable_objects falls back below.
                    try:
                        setattr(root_obj, "_bulk_env_objects", list(env.objects))
                    except Exception:
                        pass
                    selected = extract_render_input(env, root_obj, target["skinId"], bundle_name, bundle_sha, int(meta["part"]))
                    fingerprint_key = json.dumps(selected["fingerprint"], sort_keys=True)
                    evidence[target["skinId"]].append({
                        "bundle": bundle_name,
                        "bundleSha256": bundle_sha,
                        "officialPackagePart": int(meta["part"]),
                        "embeddedCab": selected["embeddedCab"],
                        "status": "EXACT_RENDER_INPUT_RESOLVED",
                        "fingerprint": selected["fingerprint"],
                        "rootPathId": selected["rootPathId"],
                        "textureEvidence": selected["textureEvidence"],
                    })
                    existing = input_by_skin.get(target["skinId"])
                    if existing is None:
                        selected["fingerprintKey"] = fingerprint_key
                        selected["sourceAliases"] = [bundle_name]
                        input_by_skin[target["skinId"]] = selected
                    elif existing["fingerprintKey"] == fingerprint_key:
                        existing["sourceAliases"].append(bundle_name)
                    else:
                        existing.setdefault("conflictingFingerprints", []).append({
                            "bundle": bundle_name,
                            "fingerprint": selected["fingerprint"],
                        })
                except Exception as exc:
                    code, detail = classify_exception(exc)
                    evidence[target["skinId"]].append({
                        "bundle": bundle_name,
                        "bundleSha256": bundle_sha,
                        "officialPackagePart": int(meta["part"]),
                        "status": code,
                        "detail": detail,
                    })
            bundle_reports.append({
                "bundle": bundle_name,
                "status": "SCANNED",
                "officialPackagePart": int(meta["part"]),
                "sizeBytes": len(raw),
                "sha256": bundle_sha,
                "targetCount": len(target_by_bundle[bundle_name]),
                "exactRuntimePathCount": exact_count,
            })
        except Exception as exc:
            bundle_reports.append({"bundle": bundle_name, "status": "BUNDLE_PROCESS_ERROR", "error": str(exc), "officialPackagePart": int(meta["part"])})

    results = []
    for target in targets:
        sid = target["skinId"]
        ev = evidence[sid]
        selected = input_by_skin.get(sid)
        if selected is None:
            blocker_rows = [x for x in ev if str(x.get("status", "")).startswith("BLOCK_")]
            status = blocker_rows[0]["status"] if blocker_rows else "BLOCK_EXACT_BUNDLE_PATH_NOT_RESOLVED"
            detail = {"evidence": ev}
        elif selected.get("conflictingFingerprints"):
            status = "BLOCK_AMBIGUOUS_RENDER_INPUT_ALIAS"
            detail = {
                "selectedFingerprint": selected["fingerprint"],
                "conflicts": selected["conflictingFingerprints"],
                "evidence": ev,
            }
        else:
            selected["sourceAliases"] = sorted(set(selected.get("sourceAliases", [])))
            status, render_detail = render_one(target, selected, work_dir, geometry_project)
            detail = {
                "selectedSource": {
                    "bundle": selected["bundle"],
                    "bundleSha256": selected["bundleSha256"],
                    "officialPackagePart": selected["officialPackagePart"],
                    "embeddedCab": selected["embeddedCab"],
                    "sourceAliases": selected["sourceAliases"],
                    "sourceSelectionPolicy": "LEXICOGRAPHIC_TRANSPORT_REPRESENTATIVE_ONLY_AFTER_EXACT_RENDER_INPUT_FINGERPRINT_EQUALITY" if len(selected["sourceAliases"]) > 1 else "SOLE_EXACT_RENDER_INPUT_SOURCE",
                },
                "input": {
                    "frozenSpinePath": target["frozenSpinePath"],
                    "runtimePath": target["runtimePath"],
                    "skelName": selected["skelName"],
                    "atlasName": selected["atlasName"],
                    "atlasPageName": selected["atlasPageName"],
                    "fingerprint": selected["fingerprint"],
                    "textureMeta": selected["textureMeta"],
                    "textureEvidence": selected["textureEvidence"],
                    "reachableObjectCount": selected["reachableObjectCount"],
                    "reachableTextAssetCount": selected["reachableTextAssetCount"],
                },
                "render": render_detail,
                "evidence": ev,
            }
        results.append({
            "skinId": sid,
            "heroId": target["heroId"],
            "sourceOrder": target["sourceOrder"],
            "status": status,
            **detail,
        })
        print(json.dumps({"skinId": sid, "status": status}, ensure_ascii=False), flush=True)

    counts = Counter(row["status"] for row in results)
    pass_count = counts.get("PASS_RENDERED", 0)
    blocker_count = len(results) - pass_count
    summary = {
        "schemaVersion": 1,
        "stage": "skin-detail-spine-stage3",
        "substage": "bulk-render",
        "status": "PASS_SKIN_DETAIL_SPINE_STAGE3_BULK_RENDERED_540" if pass_count == EXPECTED_SKINS else "SKIN_DETAIL_SPINE_STAGE3_BULK_CLASSIFIED_WITH_BLOCKERS",
        "predecessor": {
            "contract": "data/contracts/skin-detail-spine-render-contract.v1.json",
            "contractState": "FROZEN_REPRESENTATIVE_REGRESSION_PASS",
            "representativeCheckpointCommit": "d87098e48c1098e315da08b014ca87a26df62e4c",
        },
        "runtime": {
            "spineRuntimeCommit": RUNTIME_COMMIT,
            "expectedSkeletonVersion": EXPECTED_SKELETON_VERSION,
            "animation": "idle_Normal",
            "animationTime": 0,
            "flipV": False,
            "textAssetExtraction": "SERIALIZED_RAW_BYTE_ARRAY",
            "unityPy": getattr(UnityPy, "__version__", "unknown"),
        },
        "guardrails": {
            "canonicalSkinRecomputed": False,
            "heroSkinOwnershipRecomputed": False,
            "sourceOrderRecomputed": False,
            "nameJoin": False,
            "numericIdArithmetic": False,
            "crossBundleTextureFallback": False,
            "frontendMutation": False,
            "publicSkinAssetMutation": False,
            "classFusionTouched": False,
        },
        "counts": {
            "canonicalSkinCount": len(results),
            "passRendered": pass_count,
            "blockerCount": blocker_count,
            "statusCounts": dict(sorted(counts.items())),
            "candidateBundleNameCount": len(candidate_names),
            "officialCandidateBundleCount": len(catalog),
            "scannedBundleCount": sum(1 for row in bundle_reports if row.get("status") == "SCANNED"),
        },
        "officialPackageCentralDirectoryScan": {
            "version": base.VERSION,
            "packagePartCount": len(scanned_parts),
            "parts": scanned_parts,
        },
        "bundleReports": bundle_reports,
        "records": results,
    }
    SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps({"status": summary["status"], "counts": summary["counts"], "summary": str(SUMMARY)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
