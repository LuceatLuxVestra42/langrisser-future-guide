#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

SOURCE_REF_RE = re.compile(
    r"^official-install://(?P<version>[^/]+)/(?P<package>[^/]+)/PC/AssetBundle/(?P<bundle>[^#]+)#(?P<runtime>.+)$"
)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def fail(message: str) -> None:
    raise RuntimeError(message)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def normalized(value: str) -> str:
    return value.replace("\\", "/").strip().lower()


def resolve_container_object(value):
    deref = getattr(value, "deref", None)
    if callable(deref):
        return deref(), "container_value.deref"
    return value, "direct_container_object"


def load_unitypy():
    try:
        import UnityPy  # type: ignore
    except Exception as exc:
        fail(f"UnityPy is required: {exc}")
    return UnityPy


def exact_container_match(env, runtime_path: str):
    target = normalized(runtime_path)
    matches = []
    for container_path, value in env.container.items():
        if isinstance(container_path, str) and normalized(container_path) == target:
            obj, resolution = resolve_container_object(value)
            matches.append((container_path, obj, resolution))
    if len(matches) != 1:
        fail(f"exact runtime path match count must be 1, got {len(matches)}: {runtime_path}")
    return matches[0]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract one bounded Skin STATIC artwork batch from current Stage 3-2 evidence.")
    parser.add_argument("--evidence", default="data/evidence/skin-stage3-2-asset-resolution-evidence.v1.json")
    parser.add_argument("--skin-ids", nargs="+", type=int, required=True)
    parser.add_argument("--batch-id", required=True)
    parser.add_argument("--work-root", default=".skin-stage3-3-batch-work")
    parser.add_argument("--public-root", default="public/images/skins")
    parser.add_argument("--plan-output", required=True)
    parser.add_argument("--result-output", required=True)
    return parser.parse_args()


def download_package(base: str, package_name: str, destination: Path) -> None:
    if destination.is_file() and destination.stat().st_size > 0:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    url = f"{base.rstrip('/')}/{package_name}"
    request = urllib.request.Request(url, headers={"User-Agent": "langrisser-future-guide-skin-batch/1.0"})
    with urllib.request.urlopen(request, timeout=180) as response, destination.open("wb") as output:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)
    if not destination.is_file() or destination.stat().st_size <= 0:
        fail(f"downloaded package is empty: {url}")


def extract_bundle(package_path: Path, bundle_name: str, destination: Path) -> None:
    member = f"PC/AssetBundle/{bundle_name}"
    with zipfile.ZipFile(package_path) as archive:
        names = archive.namelist()
        exact = [name for name in names if name.replace("\\", "/") == member]
        if len(exact) != 1:
            fail(f"exact bundle member count must be 1, got {len(exact)}: {member}")
        destination.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(exact[0]) as source, destination.open("wb") as output:
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
    if not destination.is_file() or destination.stat().st_size <= 0:
        fail(f"extracted bundle is empty: {bundle_name}")


def main() -> int:
    args = parse_args()
    evidence_path = Path(args.evidence).resolve()
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    if evidence.get("stage") != "skin-page-3" or evidence.get("substage") != "3-2":
        fail("current Stage 3-2 evidence is invalid")
    if evidence.get("evidenceClass") != "FRESH_OFFICIAL_INSTALLER_REPRESENTATIVE_ASSET_RESOLUTION":
        fail("unexpected Stage 3-2 evidence class")
    source = evidence.get("source") or {}
    if source.get("kind") != "OFFICIAL_INSTALLER" or source.get("installVersion") != "1.1.113":
        fail("official installer authority changed")
    if source.get("unityParser") != "UnityPy==1.25.3":
        fail("UnityPy authority changed")

    skin_ids = list(args.skin_ids)
    if len(skin_ids) == 0 or len(set(skin_ids)) != len(skin_ids) or any(value <= 0 for value in skin_ids):
        fail("skin batch IDs must be unique positive integers")

    fixtures = {int(row["skinId"]): row for row in evidence.get("fixtures", [])}
    selected = []
    for skin_id in skin_ids:
        fixture = fixtures.get(skin_id)
        if fixture is None:
            fail(f"skin {skin_id} is not covered by current Stage 3-2 representative evidence")
        static = fixture.get("static") or {}
        if static.get("resolved") is not True or static.get("objectType") != "Sprite":
            fail(f"skin {skin_id} STATIC evidence is not exact resolved Sprite evidence")
        match = SOURCE_REF_RE.match(static.get("sourceRef", ""))
        if not match:
            fail(f"skin {skin_id} sourceRef does not match the frozen official-install form")
        parts = match.groupdict()
        if parts["version"] != source["installVersion"]:
            fail(f"skin {skin_id} sourceRef version differs from evidence source")
        if normalized(parts["runtime"]) != normalized(static.get("resolvedSourcePath", "")):
            fail(f"skin {skin_id} sourceRef runtime path differs from resolvedSourcePath")
        selected.append({
            "skinId": skin_id,
            "package": parts["package"],
            "bundle": parts["bundle"],
            "runtimePath": static["resolvedSourcePath"],
            "sourceRef": static["sourceRef"],
            "expectedObjectType": static["objectType"],
            "expectedSerializedSizeBytes": static["sizeBytes"],
            "expectedSerializedSha256": static["sha256"].lower(),
        })

    plan = {
        "schemaVersion": 1,
        "stage": "skin-page-3",
        "substage": "3-3-batch",
        "batchId": args.batch_id,
        "status": "READY_FOR_BOUNDED_STATIC_EXTRACTION",
        "currentAuthority": {
            "path": evidence_path.relative_to(Path.cwd().resolve()).as_posix(),
            "sha256": sha256_file(evidence_path),
            "installVersion": source["installVersion"],
            "unityParser": source["unityParser"],
        },
        "scope": {
            "kind": "STATIC",
            "skinCount": len(selected),
            "skinIds": skin_ids,
            "fullPopulationValidationRequired": False,
        },
        "requests": selected,
        "guardrails": {
            "historicalBulkArtifactImported": False,
            "heroSkinSemanticRecomputed": False,
            "sourceOrderRecomputed": False,
            "nameJoin": False,
            "idArithmetic": False,
            "filenameSimilarity": False,
            "exactRuntimePathOnly": True,
        },
    }
    plan_output = Path(args.plan_output)
    plan_output.parent.mkdir(parents=True, exist_ok=True)
    plan_output.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    work_root = Path(args.work_root).resolve() / args.batch_id
    packages_root = work_root / "packages"
    bundles_root = work_root / "bundles"
    public_root = Path(args.public_root).resolve()
    public_root.mkdir(parents=True, exist_ok=True)
    UnityPy = load_unitypy()

    records = []
    package_cache = {}
    bundle_cache = {}
    for request in selected:
        skin_id = request["skinId"]
        try:
            package_name = request["package"]
            package_path = package_cache.get(package_name)
            if package_path is None:
                package_path = packages_root / package_name
                download_package(source["base"], package_name, package_path)
                package_cache[package_name] = package_path

            bundle_key = (package_name, request["bundle"])
            bundle_path = bundle_cache.get(bundle_key)
            if bundle_path is None:
                bundle_path = bundles_root / package_name / request["bundle"]
                extract_bundle(package_path, request["bundle"], bundle_path)
                bundle_cache[bundle_key] = bundle_path

            env = UnityPy.load(str(bundle_path))
            actual_container_path, obj, container_resolution = exact_container_match(env, request["runtimePath"])
            object_type = getattr(getattr(obj, "type", None), "name", None)
            if object_type != request["expectedObjectType"]:
                fail(f"skin {skin_id} object type mismatch: {object_type}")
            serialized = obj.get_raw_data()
            if not isinstance(serialized, (bytes, bytearray)):
                fail(f"skin {skin_id} serialized object bytes unavailable")
            serialized_bytes = bytes(serialized)
            serialized_sha = sha256_bytes(serialized_bytes)
            if len(serialized_bytes) != request["expectedSerializedSizeBytes"] or serialized_sha != request["expectedSerializedSha256"]:
                fail(
                    f"skin {skin_id} serialized evidence mismatch: "
                    f"size {len(serialized_bytes)} sha {serialized_sha}"
                )

            parsed = obj.parse_as_object()
            image = getattr(parsed, "image", None)
            if image is None:
                fail(f"skin {skin_id} Sprite has no UnityPy image")
            output_path = public_root / f"{skin_id}.png"
            image.save(output_path, format="PNG")
            png_bytes = output_path.read_bytes()
            if not png_bytes.startswith(PNG_SIGNATURE):
                fail(f"skin {skin_id} export is not PNG")
            width, height = image.size
            if width <= 0 or height <= 0:
                fail(f"skin {skin_id} exported dimensions invalid: {width}x{height}")

            records.append({
                "skinId": skin_id,
                "status": "EXTRACTED",
                "sourceRef": request["sourceRef"],
                "runtimePath": request["runtimePath"],
                "actualContainerPath": actual_container_path,
                "containerResolution": container_resolution,
                "objectType": object_type,
                "serializedEvidence": {
                    "sizeBytes": len(serialized_bytes),
                    "sha256": serialized_sha,
                },
                "publicPath": f"images/skins/{skin_id}.png",
                "repoPath": f"public/images/skins/{skin_id}.png",
                "png": {
                    "sizeBytes": len(png_bytes),
                    "sha256": sha256_bytes(png_bytes),
                    "width": int(width),
                    "height": int(height),
                    "mode": str(getattr(image, "mode", "unknown")),
                },
            })
        except Exception as exc:
            records.append({
                "skinId": skin_id,
                "status": "ERROR",
                "sourceRef": request["sourceRef"],
                "runtimePath": request["runtimePath"],
                "reason": str(exc),
            })

    errors = [row for row in records if row["status"] != "EXTRACTED"]
    result = {
        "schemaVersion": 1,
        "stage": "skin-page-3",
        "substage": "3-3-batch",
        "batchId": args.batch_id,
        "status": "PASS_SKIN_STAGE3_3_STATIC_BATCH_EXTRACTION" if not errors and len(records) == len(selected) else "BLOCKED_SKIN_STAGE3_3_STATIC_BATCH_EXTRACTION",
        "finalReady": not errors and len(records) == len(selected),
        "counts": {
            "requested": len(selected),
            "extracted": len(records) - len(errors),
            "errors": len(errors),
            "packagesDownloaded": len(package_cache),
            "bundlesLoaded": len(bundle_cache),
        },
        "records": records,
        "boundaries": {
            "boundedBatchOnly": True,
            "full540GateUsed": False,
            "currentStage32SerializedEvidenceVerified": True,
            "exactRuntimePathOnly": True,
            "historicalBulkArtifactImported": False,
            "semanticStageReopened": False,
        },
    }
    result_output = Path(args.result_output)
    result_output.parent.mkdir(parents=True, exist_ok=True)
    result_output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({"status": result["status"], "counts": result["counts"], "records": records}, ensure_ascii=False, indent=2))
    return 0 if result["finalReady"] else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
