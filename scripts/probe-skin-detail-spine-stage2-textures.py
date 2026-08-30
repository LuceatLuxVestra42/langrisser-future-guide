import importlib.util
import io
import json
import pathlib

import UnityPy

HERE = pathlib.Path(__file__).resolve().parent
WORKSPACE = HERE.parent
BASE_SCRIPT = HERE / "probe-skin-detail-spine-stage2.py"
INPUT = WORKSPACE / "skin-detail-spine-stage2-probe.json"
OUTPUT = WORKSPACE / "skin-detail-spine-stage2-texture-probe.json"
ARTIFACT_ROOT = WORKSPACE / "skin-detail-spine-stage2-artifacts"

spec = importlib.util.spec_from_file_location("stage2base", BASE_SCRIPT)
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)


def atlas_page_name(path: pathlib.Path):
    text = path.read_text("utf-8", "replace")
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.lower().endswith((".png", ".jpg", ".jpeg")):
            return pathlib.PurePosixPath(stripped).name
    raise RuntimeError(f"atlas page image name missing: {path}")


def object_type(obj):
    return getattr(getattr(obj, "type", None), "name", None)


def object_name(obj):
    try:
        parsed = obj.read()
        name = getattr(parsed, "m_Name", None)
        return str(name) if name is not None else None
    except Exception:
        return None


def export_image(obj, path):
    typ = object_type(obj)
    if typ not in {"Texture2D", "Sprite"}:
        return None
    parsed = obj.read()
    image = parsed.image
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    data = buf.getvalue()
    path.write_bytes(data)
    return {
        "objectType": typ,
        "pathId": int(obj.path_id),
        "name": object_name(obj),
        "width": image.width,
        "height": image.height,
        "sizeBytes": len(data),
        "sha256": base.sha256_bytes(data),
        "relativePath": path.relative_to(WORKSPACE).as_posix(),
    }


def main():
    probe = json.loads(INPUT.read_text("utf-8"))
    by_skin = {str(row["skinId"]): row for row in probe["records"]}
    result = {
        "schemaVersion": 1,
        "stage": "skin-detail-spine-stage2",
        "substage": "atlas-texture-resolution",
        "status": "DIAGNOSTIC_COMPLETE",
        "purpose": "Use the exact atlas page filename carried by the resolved AtlasAsset TextAsset to test same-bundle Texture2D/Sprite availability. Atlas page names are dependency evidence, not a free filename heuristic.",
        "guardrails": {
            "atlasPageNameIsAuthoritativeDependencyEvidence": True,
            "crossBundleFilenameSearch": False,
            "nameJoinToCanonicalSkin": False,
            "numericIdArithmetic": False,
            "frontendMutation": False,
            "publicSkinAssetMutation": False,
            "classFusionTouched": False,
        },
        "records": [],
    }

    for skin_id, target in base.TARGETS.items():
        prior = by_skin[skin_id]
        package_part = int(prior["source"]["officialPackagePart"])
        package = base.zip_directory(package_part)
        bundle_name = target["bundle"]
        entries = [
            e for e in package["entries"]
            if pathlib.PurePosixPath(e["normName"]).name == bundle_name
        ]
        if len(entries) != 1:
            raise RuntimeError(f"Skin {skin_id}: exact bundle entry count {len(entries)} in package part {package_part}")
        entry = {
            **entries[0],
            "part": package_part,
            "packageName": package["packageName"],
            "packageSizeBytes": package["packageSizeBytes"],
            "url": package["url"],
        }
        raw = base.fetch_zip_entry(entry)
        if len(raw) != target["bundleSizeBytes"] or base.sha256_bytes(raw).lower() != target["bundleSha256"].lower():
            raise RuntimeError(f"Skin {skin_id}: frozen bundle integrity mismatch during texture probe")
        env = UnityPy.load(raw)

        atlas_exports = [
            pathlib.Path(WORKSPACE / a["path"])
            for a in prior["graph"]["exportedArtifacts"]
            if a["role"] == "TEXT_ASSET" and ".atlas" in pathlib.Path(a["path"]).name.lower()
        ]
        if len(atlas_exports) != 1:
            raise RuntimeError(f"Skin {skin_id}: atlas export count {len(atlas_exports)}")
        page = atlas_page_name(atlas_exports[0])
        page_norm = page.lower()
        stem_norm = pathlib.PurePosixPath(page).stem.lower()

        container_hits = []
        candidate_paths = []
        for container_path, value in env.container.items():
            if not isinstance(container_path, str):
                continue
            base_name = pathlib.PurePosixPath(container_path.replace("\\", "/")).name.lower()
            if stem_norm in base_name or page_norm == base_name:
                candidate_paths.append(container_path)
            if base_name != page_norm:
                continue
            obj = base.resolve_container_value(value)
            container_hits.append({
                "containerPath": container_path,
                "objectType": object_type(obj),
                "pathId": int(obj.path_id),
                "name": object_name(obj),
            })

        object_hits = []
        for obj in env.objects:
            typ = object_type(obj)
            if typ not in {"Texture2D", "Sprite"}:
                continue
            name = object_name(obj) or ""
            if name.lower() not in {stem_norm, page_norm}:
                continue
            object_hits.append({
                "objectType": typ,
                "pathId": int(obj.path_id),
                "name": name,
            })

        export_dir = ARTIFACT_ROOT / skin_id
        export_dir.mkdir(parents=True, exist_ok=True)
        exports = []
        seen = set()
        # Prefer exact container evidence; fall back only to exact object m_Name equality with atlas page stem.
        for hit in container_hits + object_hits:
            key = (hit["objectType"], hit["pathId"])
            if key in seen:
                continue
            seen.add(key)
            obj = next((o for o in env.objects if int(o.path_id) == hit["pathId"] and object_type(o) == hit["objectType"]), None)
            if obj is None:
                continue
            out = export_dir / f"atlas-page-{hit['objectType'].lower()}-{hit['pathId']}.png"
            try:
                exported = export_image(obj, out)
                if exported:
                    exported["evidenceClass"] = "EXACT_ATLAS_PAGE_CONTAINER" if any(c["pathId"] == hit["pathId"] and c["objectType"] == hit["objectType"] for c in container_hits) else "EXACT_ATLAS_PAGE_OBJECT_NAME"
                    exports.append(exported)
            except Exception as exc:
                exports.append({"objectType": hit["objectType"], "pathId": hit["pathId"], "exportError": str(exc)})

        result["records"].append({
            "skinId": int(skin_id),
            "bundle": bundle_name,
            "officialPackagePart": package_part,
            "atlasPageName": page,
            "exactContainerHits": container_hits,
            "exactObjectNameHits": object_hits,
            "sameStemCandidateContainerPaths": sorted(candidate_paths),
            "exports": exports,
            "textureResolved": any("relativePath" in x for x in exports),
        })

    result["summary"] = {
        "representativeCount": len(result["records"]),
        "textureResolvedCount": sum(1 for r in result["records"] if r["textureResolved"]),
        "allTextureResolved": all(r["textureResolved"] for r in result["records"]),
        "exactContainerResolvedCount": sum(1 for r in result["records"] if r["exactContainerHits"]),
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": result["status"], "summary": result["summary"], "output": str(OUTPUT)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
