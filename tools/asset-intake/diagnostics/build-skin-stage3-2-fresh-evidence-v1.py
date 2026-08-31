#!/usr/bin/env python3
import hashlib
import json
import os
import pathlib
import runpy

import UnityPy
from UnityPy.classes.PPtr import PPtr

ROOT = pathlib.Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
BASE_SCANNER = ROOT / "tools/asset-intake/diagnostics/scan-skin-stage3-2-fresh-source-v1.py"
EVIDENCE_OUT = ROOT / "data/evidence/skin-stage3-2-asset-resolution-evidence.v1.json"
RESOURCE_MAP_OUT = ROOT / "skin-stage3-2-fresh-model-resource-map.v1.json"
ns = runpy.run_path(str(BASE_SCANNER))


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def runtime_relative(container_path, root_prefix):
    actual = ns["norm"](container_path)
    prefix = ns["norm"](root_prefix)
    required = prefix + "/"
    if not actual.startswith(required):
        return None
    return actual[len(required):]


def to_reader(obj):
    if hasattr(obj, "deref"):
        return obj.deref()
    reader = getattr(obj, "object_reader", None)
    if reader is not None:
        return reader
    if hasattr(obj, "get_raw_data") and hasattr(obj, "byte_size"):
        return obj
    raise RuntimeError(f"cannot resolve ObjectReader from {type(obj).__name__}")


def object_evidence(obj):
    reader = to_reader(obj)
    raw = reader.get_raw_data()
    container = getattr(reader, "container", None)
    if isinstance(container, (list, tuple)):
        container = container[0] if container else None
    return reader, {
        "objectType": reader.type.name,
        "pathId": int(reader.path_id),
        "sizeBytes": int(reader.byte_size),
        "sha256": sha256(raw),
        "containerAlias": container if isinstance(container, str) else None,
    }


def collect_pointer_rows(node, path=""):
    rows = []
    if isinstance(node, dict):
        if "m_FileID" in node and "m_PathID" in node:
            try:
                rows.append({
                    "field": path,
                    "fileId": int(node["m_FileID"]),
                    "pathId": int(node["m_PathID"]),
                })
            except Exception:
                pass
        for key, value in node.items():
            rows.extend(collect_pointer_rows(value, f"{path}.{key}" if path else str(key)))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            rows.extend(collect_pointer_rows(value, f"{path}[{index}]"))
    return rows


def dependency_evidence(reader, bundle_entry):
    tree = reader.read_typetree()
    refs = collect_pointer_rows(tree)
    out = []
    seen = set()
    for ref in refs:
        file_id = ref["fileId"]
        path_id = ref["pathId"]
        if path_id == 0 or (file_id, path_id) in seen:
            continue
        seen.add((file_id, path_id))
        row = {
            "path": f"{bundle_entry}#fileId={file_id}&pathId={path_id}",
            "type": "UNRESOLVED_PPTR",
            "field": ref["field"],
            "fileId": file_id,
            "pathId": path_id,
        }
        try:
            pointer = PPtr(m_FileID=file_id, m_PathID=path_id, assetsfile=reader.assets_file)
            dep_reader = pointer.deref()
            dep_raw = dep_reader.get_raw_data()
            alias = getattr(dep_reader, "container", None)
            if isinstance(alias, (list, tuple)):
                alias = alias[0] if alias else None
            row.update({
                "type": dep_reader.type.name,
                "sizeBytes": int(dep_reader.byte_size),
                "sha256": sha256(dep_raw),
            })
            if isinstance(alias, str) and alias:
                row["path"] = alias.replace("\\", "/")
                row["containerAlias"] = alias.replace("\\", "/")
        except Exception as error:
            if file_id > 0 and file_id - 1 < len(reader.assets_file.externals):
                external = reader.assets_file.externals[file_id - 1]
                external_path = str(getattr(external, "path", "") or getattr(external, "name", ""))
                if external_path:
                    row["path"] = f"{external_path}#pathId={path_id}"
                    row["type"] = "EXTERNAL_PPTR"
            row["resolutionError"] = str(error)
        out.append(row)
    return out


def exact_hits(contract, targets):
    stems = sorted({row["discoveryBundleStem"] for row in targets})
    packages, candidates = ns["scan_package_catalog"](contract, stems)
    root_prefix = contract["resolutionPolicy"]["unityContainerRootPrefix"]
    hits = {index: [] for index in range(len(targets))}
    cache = {}

    for candidate in candidates:
        key = (candidate["packagePart"], candidate["entry"]["name"])
        if key not in cache:
            raw = ns["fetch_zip_entry"](candidate["packageUrl"], candidate["entry"])
            env = UnityPy.load(raw)
            cache[key] = (raw, [(path, obj) for path, obj in env.container.items()])
        bundle_raw, container = cache[key]
        for index, target in enumerate(targets):
            if target["discoveryBundleStem"] not in candidate["matchedStems"]:
                continue
            expected = ns["norm"](target["exactRuntimePath"])
            for container_path, obj in container:
                if runtime_relative(container_path, root_prefix) != expected:
                    continue
                reader, meta = object_evidence(obj)
                hits[index].append({
                    "packagePart": candidate["packagePart"],
                    "packageName": candidate["packageName"],
                    "bundleEntry": candidate["entry"]["name"],
                    "bundleBasename": candidate["bundleBasename"],
                    "bundleBytes": len(bundle_raw),
                    "bundleSha256": sha256(bundle_raw),
                    "containerPath": str(container_path).replace("\\", "/"),
                    "normalizedRuntimePath": runtime_relative(container_path, root_prefix),
                    "reader": reader,
                    **meta,
                })
    for index, rows in hits.items():
        if len(rows) != 1:
            target = targets[index]
            raise RuntimeError(f"target must have exactly one fresh exact source: {target['skinId']} {target['locatorKind']} {target['locatorValue']} -> {len(rows)}")
    return packages, candidates, {index: rows[0] for index, rows in hits.items()}


def source_ref(hit):
    return f"official-install://1.1.113/{hit['packageName']}/{hit['bundleEntry']}#{hit['containerPath']}"


def clean_hit(hit):
    return {key: value for key, value in hit.items() if key != "reader" and value is not None}


def main():
    contract = ns["read_json"](ns["CONTRACT_PATH"])
    readiness, model_map, targets, model_blob = ns["build_targets"](contract)
    packages, candidates, hits = exact_hits(contract, targets)

    by_skin = {}
    for index, target in enumerate(targets):
        by_skin.setdefault(target["skinId"], []).append((target, hits[index]))

    fixtures = []
    for skin_id in contract["currentAuthority"]["representativeSkinIds"]:
        rows = by_skin[skin_id]
        static_target, static_hit = next((t, h) for t, h in rows if t["assetRole"] == "staticArtwork")
        spine_target, spine_hit = next((t, h) for t, h in rows if t["assetRole"] == "spinePrefab")
        model_rows = [(t, h) for t, h in rows if t["assetRole"] == "modelResource"]
        dependencies = dependency_evidence(spine_hit["reader"], spine_hit["bundleEntry"])
        if not dependencies:
            raise RuntimeError(f"Skin {skin_id} Spine prefab has no concrete PPtr dependencies")
        fixtures.append({
            "skinId": skin_id,
            "static": {
                "resolved": True,
                "sourceImagePath": static_target["exactRuntimePath"],
                "resolvedSourcePath": static_hit["containerPath"],
                "sizeBytes": static_hit["sizeBytes"],
                "sha256": static_hit["sha256"],
                "objectType": static_hit["objectType"],
                "sourceRef": source_ref(static_hit),
                "provenance": clean_hit(static_hit),
            },
            "spine": {
                "resolved": True,
                "sourceSpinePath": spine_target["exactRuntimePath"],
                "resolvedPrefabPath": spine_hit["containerPath"],
                "sizeBytes": spine_hit["sizeBytes"],
                "sha256": spine_hit["sha256"],
                "objectType": spine_hit["objectType"],
                "sourceRef": source_ref(spine_hit),
                "dependencyScope": "DIRECT_PPTR_FROM_PREFAB_ROOT_TYPETREE",
                "dependencies": dependencies,
                "provenance": clean_hit(spine_hit),
            },
            "model": {
                "resources": [
                    {
                        "skinResourceId": int(target["resourceId"]),
                        "prefabPath": target["exactRuntimePath"],
                        "resolved": True,
                        "resolvedSource": source_ref(hit),
                        "resolvedContainerPath": hit["containerPath"],
                        "sizeBytes": hit["sizeBytes"],
                        "sha256": hit["sha256"],
                        "objectType": hit["objectType"],
                        "provenance": clean_hit(hit),
                    }
                    for target, hit in model_rows
                ]
            }
        })

    evidence = {
        "version": 1,
        "stage": "skin-page-3",
        "substage": "3-2",
        "evidenceClass": "FRESH_OFFICIAL_INSTALLER_REPRESENTATIVE_ASSET_RESOLUTION",
        "status": "GENERATED_FRESH_EVIDENCE",
        "purpose": "Provide fresh authoritative representative Skin static, Char Spine, and model-resource resolution evidence from official installer 1.1.113 without importing historical Stage 3-2 completion artifacts.",
        "source": {
            "kind": "OFFICIAL_INSTALLER",
            "installVersion": contract["freshSource"]["installVersion"],
            "base": contract["freshSource"]["base"],
            "officialPackageCount": len(packages),
            "candidateBundleCount": len(candidates),
            "unityParser": contract["freshSource"]["unityParser"],
            "unityContainerRootPrefix": contract["resolutionPolicy"]["unityContainerRootPrefix"],
        },
        "currentAuthority": {
            "readiness": contract["currentAuthority"]["readiness"],
            "modelResourceSource": contract["modelResourceSource"]["path"],
            "modelResourceBlobSha": model_blob,
            "representativeSkinIds": contract["currentAuthority"]["representativeSkinIds"],
            "locatorCount": contract["currentAuthority"]["expectedLocatorCount"],
        },
        "fixtures": fixtures,
        "guardrails": {
            "historicalCompletionEvidenceImported": False,
            "legacyDriveUsedAsAuthority": False,
            "beginCurrentPreferenceByName": False,
            "nameJoin": False,
            "idArithmetic": False,
            "stage31Recomputed": False,
            "semanticMutationCount": 0,
        }
    }
    EVIDENCE_OUT.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_OUT.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    resource_map = {
        "version": 1,
        "source": contract["modelResourceSource"]["path"],
        "sourceBlobSha": model_blob,
        "records": [
            {
                "skinResourceId": resource_id,
                "prefabPath": model_map[resource_id],
                "assetEntryStatus": "CONFIRMED",
            }
            for resource_id in sorted(model_map)
        ]
    }
    RESOURCE_MAP_OUT.write_text(json.dumps(resource_map, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "PASS_FRESH_SKIN_STAGE3_2_EVIDENCE_BUILD",
        "fixtureCount": len(fixtures),
        "locatorCount": len(targets),
        "modelResourceCount": len(model_map),
        "spineDependencyCounts": {str(row['skinId']): len(row['spine']['dependencies']) for row in fixtures},
        "evidencePath": str(EVIDENCE_OUT.relative_to(ROOT)).replace("\\", "/"),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
