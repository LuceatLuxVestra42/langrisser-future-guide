#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

EXPECTED_TOTAL = 1869
EXPECTED_BY_KIND = {"STATIC": 540, "CHAR_SPINE": 540, "MODEL_PRIMARY": 789}


def fail(message: str) -> None:
    raise RuntimeError(message)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def file_artifact(root: Path, path: Path, role: str, artifact_type: str) -> dict:
    rel = path.relative_to(root).as_posix()
    return {
        "role": role,
        "artifactType": artifact_type,
        "relativePath": rel,
        "sizeBytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def safe_component(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value)
    return value.strip("._") or "asset"


def normalized_container_path(value: str) -> str:
    return value.replace("\\", "/").strip().lower()


def actual_serialized_file_name(obj) -> tuple[str | None, str | None]:
    """Resolve the owning serialized-file/CAB name without inventing provenance.

    UnityPy normally exposes ObjectReader.assets_file.name, but some real bundle
    loads expose an empty name while retaining the exact child key in
    assets_file.parent.files. The parent mapping is authoritative because
    UnityPy's bundle reader stores each parsed child under its bundle node path.
    """
    assets_file = getattr(obj, "assets_file", None)
    if assets_file is None:
        return None, None

    candidates: list[tuple[str, str]] = []

    def add_candidate(source: str, value) -> None:
        if not isinstance(value, str) or not value:
            return
        name = Path(value.replace("\\", "/")).name
        if name:
            candidates.append((source, name))

    add_candidate("assets_file.name", getattr(assets_file, "name", None))

    parent = getattr(assets_file, "parent", None)
    parent_files = getattr(parent, "files", None)
    if hasattr(parent_files, "items"):
        for key, value in parent_files.items():
            if value is assets_file:
                add_candidate("assets_file.parent.files_identity_key", key)

    unique: dict[str, tuple[str, str]] = {}
    for source, name in candidates:
        unique.setdefault(name.lower(), (source, name))

    if not unique:
        return None, None
    if len(unique) != 1:
        detail = ", ".join(f"{source}={name}" for source, name in candidates)
        fail(f"conflicting owning serialized-file/CAB names from UnityPy: {detail}")
    source, name = next(iter(unique.values()))
    return name, source


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Execute a frozen Skin Stage 3-4 extraction plan with UnityPy."
    )
    p.add_argument("plan", type=Path)
    p.add_argument("bundle_root", type=Path)
    p.add_argument("output_root", type=Path)
    p.add_argument("result_output", type=Path)
    p.add_argument("--allow-incomplete", action="store_true")
    return p.parse_args()


def load_plan(path: Path) -> dict:
    plan = json.loads(path.read_text(encoding="utf-8"))
    if plan.get("stage") != "skin-page-3" or plan.get("substage") != "3-4":
        fail("invalid Stage 3-4 extraction plan")
    if plan.get("status") != "READY_FOR_SELECTIVE_OBJECT_EXTRACTION":
        fail(f"plan not executable: {plan.get('status')}")
    predecessor = plan.get("predecessor") or {}
    if predecessor.get("qaFinalFreezeReady") is not True:
        fail("plan predecessor is not Stage 3-3-3 final-freeze ready")
    requests = plan.get("requests")
    if not isinstance(requests, list) or len(requests) != EXPECTED_TOTAL:
        fail(f"extraction request count changed: {0 if not isinstance(requests, list) else len(requests)}")
    counts = {kind: 0 for kind in EXPECTED_BY_KIND}
    ids = set()
    for request in requests:
        request_id = request.get("requestId")
        if not isinstance(request_id, str) or not request_id:
            fail("requestId missing")
        if request_id in ids:
            fail(f"duplicate requestId {request_id}")
        ids.add(request_id)
        kind = request.get("kind")
        if kind not in counts:
            fail(f"unsupported required extraction kind {kind!r} for {request_id}")
        counts[kind] += 1
        source = request.get("selectedExtractionSource") or {}
        for key in ("bundle", "bundleSha256", "embeddedCab", "embeddedCabSha256"):
            if not isinstance(source.get(key), str) or not source[key]:
                fail(f"selected extraction source missing {key} for {request_id}")
        if not isinstance(request.get("runtimePath"), str) or not request["runtimePath"]:
            fail(f"runtimePath missing for {request_id}")
    if counts != EXPECTED_BY_KIND:
        fail(f"request kind counts changed: {counts}")
    return plan


def load_unitypy():
    try:
        import UnityPy  # type: ignore
    except Exception as exc:
        fail(
            "UnityPy is required for Stage 3-4 extraction. "
            "Install it in the local Python environment with `python -m pip install UnityPy`. "
            f"Import error: {exc}"
        )
    return UnityPy


def exact_container_index(env) -> dict[str, list[tuple[str, object]]]:
    index: dict[str, list[tuple[str, object]]] = {}
    for container_path, obj in env.container.items():
        if not isinstance(container_path, str):
            continue
        key = normalized_container_path(container_path)
        index.setdefault(key, []).append((container_path, obj))
    return index


def export_static(obj, destination: Path) -> tuple[Path, dict]:
    object_type = getattr(getattr(obj, "type", None), "name", None)
    if object_type not in {"Texture2D", "Sprite"}:
        fail(f"STATIC container object type must be Texture2D/Sprite, got {object_type}")
    parsed = obj.parse_as_object()
    image = getattr(parsed, "image", None)
    if image is None:
        fail("STATIC object has no UnityPy image handler")
    destination = destination.with_suffix(".png")
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, format="PNG")
    return destination, {
        "objectType": object_type,
        "pathId": int(getattr(obj, "path_id")),
        "serializedByteSize": int(getattr(obj, "byte_size")),
    }


def export_prefab(obj, destination: Path) -> tuple[Path, dict]:
    object_type = getattr(getattr(obj, "type", None), "name", None)
    if object_type != "GameObject":
        fail(f"Prefab container object type must be GameObject, got {object_type}")
    raw = obj.get_raw_data()
    if not isinstance(raw, (bytes, bytearray)) or len(raw) == 0:
        fail("Prefab GameObject raw serialized bytes are empty")
    destination = destination.with_suffix(".serialized.bin")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(bytes(raw))
    return destination, {
        "objectType": object_type,
        "pathId": int(getattr(obj, "path_id")),
        "serializedByteSize": int(getattr(obj, "byte_size")),
    }


def main() -> int:
    args = parse_args()
    plan = load_plan(args.plan.resolve())
    bundle_root = args.bundle_root.resolve()
    output_root = args.output_root.resolve()
    result_output = args.result_output.resolve()
    if not bundle_root.is_dir():
        fail(f"bundle root is not a directory: {bundle_root}")
    output_root.mkdir(parents=True, exist_ok=True)
    result_output.parent.mkdir(parents=True, exist_ok=True)

    UnityPy = load_unitypy()
    requests = plan["requests"]
    by_bundle: dict[str, list[dict]] = {}
    for request in requests:
        bundle = request["selectedExtractionSource"]["bundle"]
        by_bundle.setdefault(bundle, []).append(request)

    records_by_id: dict[str, dict] = {}

    for bundle_name in sorted(by_bundle):
        bundle_path = bundle_root / bundle_name
        bundle_requests = by_bundle[bundle_name]
        expected_bundle_shas = {
            r["selectedExtractionSource"]["bundleSha256"].lower() for r in bundle_requests
        }
        if len(expected_bundle_shas) != 1:
            for request in bundle_requests:
                records_by_id[request["requestId"]] = {
                    "requestId": request["requestId"],
                    "status": "ERROR",
                    "reason": "inconsistent frozen bundle SHA-256 across requests",
                }
            continue
        expected_bundle_sha = next(iter(expected_bundle_shas))
        if not bundle_path.is_file():
            for request in bundle_requests:
                records_by_id[request["requestId"]] = {
                    "requestId": request["requestId"],
                    "status": "ERROR",
                    "reason": f"selected bundle missing: {bundle_name}",
                }
            continue
        actual_bundle_sha = sha256_file(bundle_path)
        if actual_bundle_sha != expected_bundle_sha:
            for request in bundle_requests:
                records_by_id[request["requestId"]] = {
                    "requestId": request["requestId"],
                    "status": "ERROR",
                    "reason": f"selected bundle SHA-256 mismatch for {bundle_name}",
                }
            continue

        try:
            env = UnityPy.load(str(bundle_path))
            container_index = exact_container_index(env)
        except Exception as exc:
            for request in bundle_requests:
                records_by_id[request["requestId"]] = {
                    "requestId": request["requestId"],
                    "status": "ERROR",
                    "reason": f"UnityPy load failed for {bundle_name}: {exc}",
                }
            continue

        for request in bundle_requests:
            request_id = request["requestId"]
            runtime_path = normalized_container_path(request["runtimePath"])
            source = request["selectedExtractionSource"]
            try:
                matches = container_index.get(runtime_path, [])
                if len(matches) != 1:
                    fail(
                        f"exact runtime path container match count must be 1, got {len(matches)}: {runtime_path}"
                    )
                actual_container_path, obj = matches[0]
                actual_cab, cab_resolution = actual_serialized_file_name(obj)
                if actual_cab is None:
                    fail(
                        "UnityPy did not expose the owning serialized-file/CAB name via "
                        "assets_file.name or assets_file.parent.files identity"
                    )
                if actual_cab.lower() != source["embeddedCab"].lower():
                    fail(
                        f"embedded CAB mismatch: expected {source['embeddedCab']}, got {actual_cab}"
                    )

                stem = safe_component(request_id)
                kind = request["kind"]
                destination = output_root / kind.lower() / stem
                if kind == "STATIC":
                    primary_path, metadata = export_static(obj, destination)
                    artifact_type = "PNG_TEXTURE_EXPORT"
                else:
                    primary_path, metadata = export_prefab(obj, destination)
                    artifact_type = "RAW_SERIALIZED_GAMEOBJECT"

                metadata_path = primary_path.with_suffix(primary_path.suffix + ".meta.json")
                metadata_payload = {
                    "schemaVersion": 1,
                    "requestId": request_id,
                    "kind": kind,
                    "runtimePath": request["runtimePath"],
                    "actualContainerPath": actual_container_path,
                    "actualEmbeddedCab": actual_cab,
                    "cabResolution": cab_resolution,
                    "source": source,
                    "unityObject": metadata,
                    "note": "Prefab primary artifacts are exact raw serialized GameObject bytes; dependency export is intentionally deferred to later presentation/web conversion stages unless explicitly required.",
                }
                metadata_path.write_text(
                    json.dumps(metadata_payload, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
                records_by_id[request_id] = {
                    "requestId": request_id,
                    "status": "EXTRACTED",
                    "runtimePath": request["runtimePath"],
                    "source": source,
                    "artifacts": [
                        file_artifact(output_root, primary_path, "PRIMARY_OBJECT", artifact_type),
                        file_artifact(output_root, metadata_path, "EXTRACTION_METADATA", "JSON_METADATA"),
                    ],
                }
            except Exception as exc:
                records_by_id[request_id] = {
                    "requestId": request_id,
                    "status": "ERROR",
                    "runtimePath": request["runtimePath"],
                    "source": source,
                    "artifacts": [],
                    "reason": str(exc),
                }

    records = [records_by_id.get(r["requestId"], {
        "requestId": r["requestId"],
        "status": "ERROR",
        "reason": "internal runner omission",
    }) for r in requests]
    extracted = [r for r in records if r.get("status") == "EXTRACTED"]
    errors = [r for r in records if r.get("status") != "EXTRACTED"]
    extracted_by_kind = {kind: 0 for kind in EXPECTED_BY_KIND}
    request_by_id = {r["requestId"]: r for r in requests}
    for record in extracted:
        extracted_by_kind[request_by_id[record["requestId"]]["kind"]] += 1

    final_ready = (
        len(extracted) == EXPECTED_TOTAL
        and len(errors) == 0
        and extracted_by_kind == EXPECTED_BY_KIND
    )
    result = {
        "schemaVersion": 1,
        "stage": "skin-page-3",
        "substage": "3-4",
        "evidenceClass": "UNITYPY_SELECTIVE_SERIALIZED_OBJECT_EXTRACTION_RESULT",
        "status": "STAGE3_4_EXTRACTION_EXECUTED" if final_ready else "STAGE3_4_EXTRACTION_PARTIAL_OR_BLOCKED",
        "finalReadyForValidation": final_ready,
        "tool": {
            "name": "UnityPy",
            "version": str(getattr(UnityPy, "__version__", "unknown")),
            "runner": "scripts/skin-stage3-4-extract-unitypy.py",
        },
        "counts": {
            "requestCount": len(requests),
            "extractedCount": len(extracted),
            "errorCount": len(errors),
            "extractedByKind": extracted_by_kind,
        },
        "boundaries": {
            "exactRuntimePathOnly": True,
            "bundleSha256VerifiedBeforeLoad": True,
            "embeddedCabNameVerified": True,
            "runtimePathSubstringOffsetUsedAsAssetOffset": False,
            "fuzzyMatching": False,
            "filenameSimilarity": False,
            "semanticOwnershipRecomputed": False,
        },
        "records": records,
    }
    result_output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"status": result["status"], "counts": result["counts"], "result": str(result_output)}, ensure_ascii=False, indent=2))
    if not final_ready and not args.allow_incomplete:
        return 2
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[skin-stage3-4-extract-unitypy] {exc}", file=sys.stderr)
        raise SystemExit(1)
