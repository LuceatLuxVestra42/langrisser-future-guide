#!/usr/bin/env python3
import argparse
import importlib.util
import json
import pathlib
import subprocess

import UnityPy

ROOT = pathlib.Path(__file__).resolve().parent.parent
BULK_PATH = ROOT / "scripts/run-skin-detail-spine-stage3-bulk.py"
OUT = ROOT / "skin-detail-spine-stage3-ledin-diagnostic.json"
BUNDLE = "spine_char_ledin_abs.b"
PART = 37
RUNTIME_PATH = "assets/gameproject/runtimeassets/spine/char/ledin_abs/ledin_skin_prefab.prefab"

spec = importlib.util.spec_from_file_location("skin_stage3_bulk_ledin", BULK_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"unable to load {BULK_PATH}")
bulk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bulk)
base = bulk.base


def exact_entry():
    info = base.zip_directory(PART)
    hits = []
    for entry in info["entries"]:
        if pathlib.PurePosixPath(entry["normName"]).name == BUNDLE:
            hits.append({**entry, "part": PART, "packageName": info["packageName"], "packageSizeBytes": info["packageSizeBytes"], "url": info["url"]})
    if len(hits) != 1:
        raise RuntimeError(f"{BUNDLE}@part{PART} entry cardinality {len(hits)}")
    return hits[0]


def flatten_relevant(value, prefix="", rows=None):
    if rows is None:
        rows = []
    if isinstance(value, dict):
        for k, v in value.items():
            p = f"{prefix}.{k}" if prefix else str(k)
            kl = str(k).lower()
            if any(token in kl for token in ("skin", "animation", "skeleton", "atlas")) and isinstance(v, (str, int, float, bool, type(None))):
                rows.append({"field": p, "value": v})
            flatten_relevant(v, p, rows)
    elif isinstance(value, list):
        for i, v in enumerate(value):
            flatten_relevant(v, f"{prefix}[{i}]", rows)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--visibility-project", type=pathlib.Path, required=True)
    ap.add_argument("--work-dir", type=pathlib.Path, default=pathlib.Path("/tmp/skin-spine-ledin-diagnostic"))
    args = ap.parse_args()
    args.work_dir.mkdir(parents=True, exist_ok=True)

    meta = exact_entry()
    raw = base.fetch_zip_entry(meta)
    env = UnityPy.load(raw)
    hits = bulk.exact_container_hits(env, RUNTIME_PATH)
    if len(hits) != 1:
        raise RuntimeError(f"exact runtime path cardinality {len(hits)}")
    _, root = hits[0]

    # Reuse the already-successful local Stage 3 resolver for Skin 1001 input.
    objects = list(env.objects)
    by_key = {bulk.owner_key(o): o for o in objects}
    def local_reachable(root_obj, max_nodes=1600, max_depth=20):
        from collections import deque
        q = deque([(bulk.owner_key(root_obj), 0)])
        seen = set(); rows = []
        while q and len(seen) < max_nodes:
            key, depth = q.popleft()
            if key in seen or depth > max_depth: continue
            obj = by_key.get(key)
            if obj is None: continue
            seen.add(key); rows.append(obj)
            try: tree = obj.read_typetree()
            except Exception: continue
            for ref in base.pptr_refs(tree):
                try: file_id = int(ref.get("fileId",0)); path_id = int(ref.get("pathId",0))
                except Exception: continue
                if file_id == 0 and path_id != 0:
                    q.append(((id(getattr(obj,"assets_file",None)), path_id), depth+1))
        return rows

    old = bulk.reachable_objects
    bulk.reachable_objects = local_reachable
    try:
        selected = bulk.extract_render_input(env, root, 1001, BUNDLE, bulk.sha256_bytes(raw), PART)
    finally:
        bulk.reachable_objects = old

    skel = args.work_dir / selected["skelName"]
    atlas = args.work_dir / selected["atlasName"]
    page = args.work_dir / selected["atlasPageName"]
    visibility_json = args.work_dir / "visibility.json"
    skel.write_bytes(selected["skelBytes"])
    atlas.write_bytes(selected["atlasBytes"])
    page.write_bytes(selected["texturePng"])

    proc = subprocess.run([
        "dotnet", "run", "--project", str(args.visibility_project.resolve()), "-c", "Release", "--no-build", "--",
        str(skel), str(atlas), str(visibility_json), "idle_Normal",
    ], text=True, capture_output=True, check=False)

    reachable = local_reachable(root)
    mono = []
    for obj in reachable:
        if base.object_type(obj) != "MonoBehaviour":
            continue
        try:
            tree = obj.read_typetree()
        except Exception as exc:
            mono.append({"pathId": int(obj.path_id), "name": base.object_name(obj), "typetreeError": repr(exc)})
            continue
        mono.append({
            "pathId": int(obj.path_id),
            "name": base.object_name(obj),
            "relevantFields": flatten_relevant(tree),
        })

    result = {
        "schemaVersion": 1,
        "stage": "skin-detail-spine-stage3",
        "substage": "ledin-1001-visibility-diagnostic",
        "sourceBulkRun": 33300225041,
        "sourceDiagnosticRun": 33301771699,
        "packageProvenanceSource": "FROZEN_FROM_RUN_33301771699",
        "all68PackageRescan": False,
        "skinId": 1001,
        "bundle": {"name": BUNDLE, "part": PART, "sizeBytes": len(raw), "sha256": bulk.sha256_bytes(raw)},
        "input": {
            "skelName": selected["skelName"],
            "atlasName": selected["atlasName"],
            "atlasPageName": selected["atlasPageName"],
            "fingerprint": selected["fingerprint"],
        },
        "prefabRelevantMonoBehaviourFields": mono,
        "visibilityProbe": {
            "returnCode": proc.returncode,
            "stdoutTail": proc.stdout[-4000:],
            "stderrTail": proc.stderr[-4000:],
            "result": json.loads(visibility_json.read_text("utf-8")) if visibility_json.exists() else None,
        },
        "guardrails": {
            "onlySkin1001Investigated": True,
            "pass531Reopened": False,
            "frontendMutation": False,
            "publicSkinAssetMutation": False,
            "classFusionTouched": False,
        },
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps({"output": str(OUT), "returnCode": proc.returncode, "prefabFields": mono, "visibility": result["visibilityProbe"]["result"]}, ensure_ascii=False))


if __name__ == "__main__":
    raise SystemExit(main())
