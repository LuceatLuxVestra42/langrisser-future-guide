#!/usr/bin/env python3
import hashlib
import json
import os
import pathlib
import runpy

import UnityPy

ROOT = pathlib.Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
SCANNER = ROOT / "tools/asset-intake/diagnostics/scan-skin-stage3-2-fresh-source-v1.py"
EVIDENCE = ROOT / "data/evidence/skin-stage3-2-asset-resolution-evidence.v1.json"
OUT = ROOT / "skin-stage3-3-mathew-spine-payload"
ns = runpy.run_path(str(SCANNER))


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def parse_ref(ref):
    pre, container = ref.split("#", 1)
    parts = pre.split("/")
    package = next(p for p in parts if p.endswith(".zip"))
    return package, parts[-1], container


def fetch_bundle(base, package, basename):
    url = f"{base}/{package}"
    total = ns["head_size"](url)
    if total is None:
        raise RuntimeError(f"missing package {url}")
    entries = ns["zip_directory"](url, total)
    matches = [e for e in entries if e["name"].replace("\\", "/").rsplit("/", 1)[-1].lower() == basename.lower()]
    if len(matches) != 1:
        raise RuntimeError(f"bundle cardinality {basename}: {len(matches)}")
    return ns["fetch_zip_entry"](url, matches[0])


def textasset_payload(reader):
    tree = reader.read_typetree()
    script = tree.get("m_Script", b"")
    if isinstance(script, str):
        return script.encode("utf-8", "surrogateescape")
    if isinstance(script, bytes):
        return script
    if isinstance(script, list):
        return bytes(script)
    return bytes(script or b"")


def main():
    ev = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    fx = next(x for x in ev["fixtures"] if int(x["skinId"]) == 102)
    package, basename, _ = parse_ref(fx["spine"]["sourceRef"])
    raw = fetch_bundle(ev["source"]["base"], package, basename)
    env = UnityPy.load(raw)
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    wanted = {"Mathew_Skin01.skel", "Mathew_Skin01.atlas", "Mathew_Skin01"}
    for obj in env.objects:
        reader = obj
        typ = reader.type.name
        if typ == "TextAsset":
            tree = reader.read_typetree()
            name = str(tree.get("m_Name", ""))
            if name not in wanted:
                continue
            payload = textasset_payload(reader)
            ext = ".skel" if name.endswith(".skel") else ".atlas"
            path = OUT / ("Mathew_Skin01" + ext)
            path.write_bytes(payload)
            rows.append({"type": typ, "name": name, "pathId": int(reader.path_id), "bytes": len(payload), "sha256": sha256(payload), "output": path.name})
        elif typ == "Texture2D":
            data = reader.read()
            name = str(getattr(data, "m_Name", "") or getattr(data, "name", "") or "")
            if name != "Mathew_Skin01":
                continue
            image = data.image
            path = OUT / "Mathew_Skin01.png"
            image.save(path)
            rows.append({"type": typ, "name": name, "pathId": int(reader.path_id), "width": image.size[0], "height": image.size[1], "output": path.name})
    # authoritative animation/skin selectors from the Skin 102 prefab component
    skeleton_anim = None
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
        except Exception:
            continue
        if tree.get("_animationName") == "idle_Normal" and tree.get("initialSkinName") == "default":
            go = tree.get("m_GameObject", {})
            skeleton_anim = {
                "pathId": int(obj.path_id),
                "gameObject": go,
                "skeletonDataAsset": tree.get("skeletonDataAsset"),
                "animationName": tree.get("_animationName"),
                "initialSkinName": tree.get("initialSkinName"),
                "loop": tree.get("loop"),
                "timeScale": tree.get("timeScale"),
            }
            break
    outputs = {row["name"]: row for row in rows}
    required = ["Mathew_Skin01.skel", "Mathew_Skin01.atlas", "Mathew_Skin01"]
    missing = [name for name in required if name not in outputs]
    report = {
        "status": "PASS_OFFICIAL_SKIN102_SPINE_PAYLOAD" if not missing and skeleton_anim else "FAIL_OFFICIAL_SKIN102_SPINE_PAYLOAD",
        "skinId": 102,
        "sourceSpinePath": fx["spine"]["sourceSpinePath"],
        "packageName": package,
        "bundleName": basename,
        "bundleBytes": len(raw),
        "bundleSha256": sha256(raw),
        "payloads": rows,
        "skeletonAnimation": skeleton_anim,
        "missing": missing,
        "boundaries": {"semanticMutation": False, "legacyDriveAuthority": False, "nameJoin": False, "idArithmetic": False},
    }
    (OUT / "payload-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["status"].startswith("FAIL"):
        raise SystemExit(2)


if __name__ == "__main__":
    main()
