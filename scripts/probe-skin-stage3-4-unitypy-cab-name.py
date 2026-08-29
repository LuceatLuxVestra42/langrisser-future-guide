#!/usr/bin/env python3
import argparse
import hashlib
import json
import sys
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def normalized(value: str) -> str:
    return value.replace("\\", "/").strip().lower()


def basename(value: str) -> str:
    return Path(value.replace("\\", "/")).name


def resolve_container_object(value):
    deref = getattr(value, "deref", None)
    if callable(deref):
        return deref(), "container_value.deref"
    return value, "direct_container_object"


def main() -> int:
    p = argparse.ArgumentParser(description="Probe one real Stage 3-4 request for UnityPy serialized-file/CAB ownership exposure.")
    p.add_argument("plan", type=Path)
    p.add_argument("bundle_root", type=Path)
    p.add_argument("--request-id")
    args = p.parse_args()

    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    requests = plan.get("requests") or []
    if not requests:
        raise RuntimeError("plan has no requests")
    if args.request_id:
        request = next((r for r in requests if r.get("requestId") == args.request_id), None)
        if request is None:
            raise RuntimeError(f"request not found: {args.request_id}")
    else:
        request = requests[0]

    source = request["selectedExtractionSource"]
    bundle_path = args.bundle_root / source["bundle"]
    if not bundle_path.is_file():
        raise RuntimeError(f"bundle missing: {bundle_path}")
    actual_bundle_sha = sha256_file(bundle_path)
    if actual_bundle_sha.lower() != source["bundleSha256"].lower():
        raise RuntimeError("bundle SHA-256 mismatch")

    import UnityPy  # type: ignore

    env = UnityPy.load(str(bundle_path))
    target = normalized(request["runtimePath"])
    matches = [(path, value) for path, value in env.container.items() if isinstance(path, str) and normalized(path) == target]
    if len(matches) != 1:
        raise RuntimeError(f"exact runtime path match count: {len(matches)}")
    actual_container_path, container_value = matches[0]
    obj, container_resolution = resolve_container_object(container_value)

    assets_file = getattr(obj, "assets_file", None)
    direct_name = getattr(assets_file, "name", None)
    parent = getattr(assets_file, "parent", None)
    parent_files = getattr(parent, "files", None)
    parent_identity_keys = []
    if hasattr(parent_files, "items"):
        parent_identity_keys = [str(k) for k, v in parent_files.items() if v is assets_file]

    candidates = []
    if isinstance(direct_name, str) and direct_name:
        candidates.append(("assets_file.name", basename(direct_name)))
    for key in parent_identity_keys:
        if key:
            candidates.append(("assets_file.parent.files_identity_key", basename(key)))

    unique = {}
    for source_name, name in candidates:
        unique.setdefault(name.lower(), {"source": source_name, "name": name})

    resolved = next(iter(unique.values())) if len(unique) == 1 else None
    expected = source["embeddedCab"]
    passed = resolved is not None and resolved["name"].lower() == expected.lower()

    print(json.dumps({
        "status": "PASS_REAL_UNITYPY_CAB_NAME_PROBE" if passed else "FAIL_REAL_UNITYPY_CAB_NAME_PROBE",
        "unityPyVersion": str(getattr(UnityPy, "__version__", "unknown")),
        "requestId": request["requestId"],
        "bundle": source["bundle"],
        "runtimePath": request["runtimePath"],
        "actualContainerPath": actual_container_path,
        "containerEntryType": type(container_value).__name__,
        "containerResolution": container_resolution,
        "resolvedObjectType": type(obj).__name__,
        "expectedEmbeddedCab": expected,
        "assetsFileDirectName": direct_name,
        "parentIdentityKeys": parent_identity_keys,
        "resolved": resolved,
        "candidateCount": len(unique),
    }, ensure_ascii=False, indent=2))
    return 0 if passed else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[skin-stage3-4-cab-probe] {exc}", file=sys.stderr)
        raise SystemExit(1)
