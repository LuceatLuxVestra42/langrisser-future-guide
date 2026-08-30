#!/usr/bin/env python3
import importlib.util
import pathlib
from collections import deque

ROOT = pathlib.Path(__file__).resolve().parent
BASE = ROOT / "run-skin-detail-spine-stage3-bulk.py"

spec = importlib.util.spec_from_file_location("skin_stage3_bulk", BASE)
if spec is None or spec.loader is None:
    raise RuntimeError(f"unable to load {BASE}")
bulk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bulk)

_CURRENT_ENV_OBJECTS = []
_original_extract_render_input = bulk.extract_render_input


def fixed_reachable_objects(root_obj, max_nodes=1600, max_depth=20):
    objects = list(_CURRENT_ENV_OBJECTS)
    if not objects:
        raise RuntimeError("bulk UnityPy Environment object list is empty")
    by_key = {bulk.owner_key(obj): obj for obj in objects}
    start = bulk.owner_key(root_obj)
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
        for ref in bulk.base.pptr_refs(tree):
            try:
                file_id = int(ref.get("fileId", 0))
                path_id = int(ref.get("pathId", 0))
            except Exception:
                continue
            if file_id != 0 or path_id == 0:
                continue
            q.append(((id(getattr(obj, "assets_file", None)), path_id), depth + 1))
    return rows


def fixed_extract_render_input(env, root_obj, skin_id, bundle_name, bundle_sha, package_part):
    global _CURRENT_ENV_OBJECTS
    _CURRENT_ENV_OBJECTS = list(env.objects)
    try:
        return _original_extract_render_input(env, root_obj, skin_id, bundle_name, bundle_sha, package_part)
    finally:
        _CURRENT_ENV_OBJECTS = []


bulk.reachable_objects = fixed_reachable_objects
bulk.extract_render_input = fixed_extract_render_input

if __name__ == "__main__":
    raise SystemExit(bulk.main())
