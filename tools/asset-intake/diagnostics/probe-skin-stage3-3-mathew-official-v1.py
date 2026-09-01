#!/usr/bin/env python3
import hashlib
import json
import os
import pathlib
import re
import runpy

import UnityPy
from UnityPy.classes.PPtr import PPtr

ROOT = pathlib.Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
EVIDENCE_PATH = ROOT / "data/evidence/skin-stage3-2-asset-resolution-evidence.v1.json"
BASE_SCANNER = ROOT / "tools/asset-intake/diagnostics/scan-skin-stage3-2-fresh-source-v1.py"
OUT = ROOT / "skin-stage3-3-mathew-official-probe"
ns = runpy.run_path(str(BASE_SCANNER))


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def safe_name(value):
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value or "unnamed"))
    return value[:180] or "unnamed"


def json_safe(value):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, bytes):
        return {"bytes": len(value), "sha256": sha256(value)}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if hasattr(value, "m_FileID") and hasattr(value, "m_PathID"):
        return {"m_FileID": int(value.m_FileID), "m_PathID": int(value.m_PathID)}
    return str(value)


def collect_pptrs(node, path=""):
    rows = []
    if isinstance(node, dict):
        if "m_FileID" in node and "m_PathID" in node:
            try:
                rows.append({"field": path, "fileId": int(node["m_FileID"]), "pathId": int(node["m_PathID"])})
            except Exception:
                pass
        for key, value in node.items():
            rows.extend(collect_pptrs(value, f"{path}.{key}" if path else str(key)))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            rows.extend(collect_pptrs(value, f"{path}[{index}]"))
    return rows


def parse_ref(source_ref):
    # official-install://1.1.113/InstallPage_1.1.113_25.zip/PC/AssetBundle/foo.b#container
    before_hash, container = source_ref.split("#", 1)
    parts = before_hash.split("/")
    package_name = next(p for p in parts if p.endswith(".zip"))
    basename = parts[-1]
    return package_name, basename, container


def fetch_named_bundle(base, package_name, basename):
    url = f"{base}/{package_name}"
    total = ns["head_size"](url)
    if total is None:
        raise RuntimeError(f"official package unavailable: {url}")
    entries = ns["zip_directory"](url, total)
    matches = [e for e in entries if e["name"].replace("\\", "/").rsplit("/", 1)[-1].lower() == basename.lower()]
    if len(matches) != 1:
        raise RuntimeError(f"bundle basename cardinality failed: {package_name} {basename} -> {len(matches)}")
    entry = matches[0]
    raw = ns["fetch_zip_entry"](url, entry)
    return {
        "packageName": package_name,
        "packageBytes": total,
        "packageUrl": url,
        "entry": entry,
        "raw": raw,
        "sha256": sha256(raw),
    }


def object_reader(obj):
    if hasattr(obj, "deref"):
        return obj.deref()
    reader = getattr(obj, "object_reader", None)
    return reader if reader is not None else obj


def external_rows(reader):
    out = []
    af = getattr(reader, "assets_file", None)
    for i, ext in enumerate(getattr(af, "externals", []) or [], start=1):
        out.append({
            "fileId": i,
            "name": str(getattr(ext, "name", "") or ""),
            "path": str(getattr(ext, "path", "") or ""),
            "guid": str(getattr(ext, "guid", "") or ""),
        })
    return out


def deref_row(reader, ref):
    row = dict(ref)
    try:
        pptr = PPtr(m_FileID=ref["fileId"], m_PathID=ref["pathId"], assetsfile=reader.assets_file)
        dep = pptr.deref()
        raw = dep.get_raw_data()
        row.update({
            "resolved": True,
            "type": dep.type.name,
            "byteSize": int(dep.byte_size),
            "sha256": sha256(raw),
            "container": str(getattr(dep, "container", "") or ""),
        })
    except Exception as exc:
        row.update({"resolved": False, "error": str(exc)})
    return row


def dump_target(env, target_container, label):
    norm_target = target_container.replace("\\", "/").lower()
    matches = [(p, o) for p, o in env.container.items() if str(p).replace("\\", "/").lower() == norm_target]
    if len(matches) != 1:
        raise RuntimeError(f"target container cardinality failed {label}: {len(matches)}")
    path, obj = matches[0]
    reader = object_reader(obj)
    raw = reader.get_raw_data()
    tree = reader.read_typetree()
    refs = collect_pptrs(tree)
    direct = [deref_row(reader, ref) for ref in refs if ref["pathId"] != 0]
    target_dir = OUT / "targets" / label
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / "typetree.json").write_text(json.dumps(json_safe(tree), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (target_dir / "pptrs.json").write_text(json.dumps(direct, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "containerPath": str(path).replace("\\", "/"),
        "objectType": reader.type.name,
        "pathId": int(reader.path_id),
        "byteSize": int(reader.byte_size),
        "sha256": sha256(raw),
        "directPPtrCount": len(direct),
        "resolvedDirectPPtrCount": sum(1 for row in direct if row.get("resolved")),
        "externals": external_rows(reader),
    }


def export_bundle(env, label):
    bundle_dir = OUT / "exports" / label
    text_dir = bundle_dir / "textassets"
    tex_dir = bundle_dir / "textures"
    json_dir = bundle_dir / "typetrees"
    text_dir.mkdir(parents=True, exist_ok=True)
    tex_dir.mkdir(parents=True, exist_ok=True)
    json_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for obj in env.objects:
        reader = object_reader(obj)
        typ = reader.type.name
        row = {"type": typ, "pathId": int(reader.path_id), "byteSize": int(reader.byte_size)}
        try:
            data = reader.read()
            name = str(getattr(data, "m_Name", "") or getattr(data, "name", "") or "")
            row["name"] = name
            if typ == "TextAsset":
                script = getattr(data, "m_Script", None)
                if script is None:
                    script = getattr(data, "script", b"")
                if isinstance(script, str):
                    payload = script.encode("utf-8")
                else:
                    payload = bytes(script or b"")
                fn = f"{reader.path_id}_{safe_name(name)}.bin"
                (text_dir / fn).write_bytes(payload)
                row["export"] = str((text_dir / fn).relative_to(OUT)).replace("\\", "/")
                row["exportBytes"] = len(payload)
                row["exportSha256"] = sha256(payload)
            elif typ == "Texture2D":
                try:
                    image = data.image
                    fn = f"{reader.path_id}_{safe_name(name)}.png"
                    image.save(tex_dir / fn)
                    row["export"] = str((tex_dir / fn).relative_to(OUT)).replace("\\", "/")
                    row["width"], row["height"] = image.size
                except Exception as exc:
                    row["exportError"] = str(exc)
            elif typ in ("MonoBehaviour", "GameObject", "Transform", "MeshRenderer", "MeshFilter", "Material"):
                try:
                    tree = reader.read_typetree()
                    fn = f"{reader.path_id}_{typ}_{safe_name(name)}.json"
                    (json_dir / fn).write_text(json.dumps(json_safe(tree), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                    row["typetreeExport"] = str((json_dir / fn).relative_to(OUT)).replace("\\", "/")
                    refs = collect_pptrs(tree)
                    row["pptrCount"] = len([r for r in refs if r["pathId"] != 0])
                except Exception as exc:
                    row["typetreeError"] = str(exc)
        except Exception as exc:
            row["readError"] = str(exc)
        rows.append(row)
    (bundle_dir / "objects.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "objectCount": len(rows),
        "typeCounts": {t: sum(1 for r in rows if r["type"] == t) for t in sorted({r["type"] for r in rows})},
        "textAssetExports": sum(1 for r in rows if r.get("export", "").startswith("exports/") and r["type"] == "TextAsset"),
        "textureExports": sum(1 for r in rows if r.get("export", "").startswith("exports/") and r["type"] == "Texture2D"),
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    evidence = json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))
    if evidence.get("status") != "GENERATED_FRESH_EVIDENCE":
        raise RuntimeError("Stage 3-2 official evidence is not in the expected completed state")
    fixture = next(row for row in evidence["fixtures"] if int(row["skinId"]) == 102)
    base = evidence["source"]["base"]

    refs = [
        ("char", fixture["spine"]["sourceRef"]),
        ("general", fixture["model"]["resources"][0]["resolvedSource"]),
    ]
    fetched = {}
    report = {
        "version": 1,
        "stage": "skin-page-3",
        "substage": "3-3",
        "probe": "Skin 102 official prefab dependency materialization",
        "sourceAuthority": str(EVIDENCE_PATH.relative_to(ROOT)).replace("\\", "/"),
        "skinId": 102,
        "sourceSpinePath": fixture["spine"]["sourceSpinePath"],
        "status": "RUNNING",
        "bundles": {},
        "targets": {},
        "boundaries": {
            "semanticMutation": False,
            "legacyDriveUsedAsAuthority": False,
            "nameJoin": False,
            "idArithmetic": False,
            "frontendChanged": False,
        },
    }

    for label, source_ref in refs:
        package_name, basename, container = parse_ref(source_ref)
        key = (package_name, basename)
        if key not in fetched:
            fetched[key] = fetch_named_bundle(base, package_name, basename)
        item = fetched[key]
        bundle_path = OUT / "bundles" / basename
        bundle_path.parent.mkdir(parents=True, exist_ok=True)
        bundle_path.write_bytes(item["raw"])
        env = UnityPy.load(item["raw"])
        report["bundles"][label] = {
            "packageName": package_name,
            "packageBytes": item["packageBytes"],
            "bundleEntry": item["entry"]["name"],
            "bundleBytes": len(item["raw"]),
            "bundleSha256": item["sha256"],
            "savedAs": str(bundle_path.relative_to(OUT)).replace("\\", "/"),
            **export_bundle(env, label),
        }
        report["targets"][label] = dump_target(env, container, label)

    report["status"] = "PASS_OFFICIAL_SKIN102_BUNDLE_MATERIALIZED"
    (OUT / "probe-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
