#!/usr/bin/env python3
import binascii
import hashlib
import json
import os
import pathlib
import struct
import subprocess
import urllib.error
import urllib.request
import zlib

import UnityPy

ROOT = pathlib.Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
CONTRACT_PATH = ROOT / "tools/asset-intake/contract/skin-stage3-2-fresh-source-inventory.v1.json"
OUTPUT_PATH = ROOT / "skin-stage3-2-fresh-source-inventory.v1.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
MAX_PART = 90
MISS_BREAK = 8


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def norm(value):
    return str(value).replace("\\", "/").strip("/").lower()


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def git_blob_sha(path):
    proc = subprocess.run(
        ["git", "hash-object", str(path)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return proc.stdout.strip()


def request(url, start=None, end=None):
    headers = {"User-Agent": UA, "Accept-Encoding": "identity"}
    if start is not None:
        headers["Range"] = f"bytes={start}-{end}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=90) as response:
        data = response.read()
    if start is not None and len(data) != end - start + 1:
        raise RuntimeError(f"range mismatch for {url}: {len(data)} != {end-start+1}")
    return data


def head_size(url):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept-Encoding": "identity"},
        method="HEAD",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            return int(response.headers["Content-Length"])
    except urllib.error.HTTPError as error:
        if error.code in (403, 404):
            return None
        raise


def zip_directory(url, total):
    tail_size = min(131072, total)
    tail = request(url, total - tail_size, total - 1)
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise RuntimeError(f"EOCD missing: {url}")
    _, _, _, _, central_size, central_offset, _ = struct.unpack_from("<HHHHIIH", tail, eocd + 4)
    central = request(url, central_offset, central_offset + central_size - 1)
    entries = []
    i = 0
    while i + 46 <= len(central) and central[i:i + 4] == b"PK\x01\x02":
        flags, method = struct.unpack_from("<HH", central, i + 8)
        crc, compressed, uncompressed = struct.unpack_from("<III", central, i + 16)
        fn_len, extra_len, comment_len = struct.unpack_from("<HHH", central, i + 28)
        local_offset = struct.unpack_from("<I", central, i + 42)[0]
        name_bytes = central[i + 46:i + 46 + fn_len]
        name = name_bytes.decode("utf-8" if flags & 0x800 else "cp437", "replace")
        entries.append({
            "name": name,
            "method": method,
            "crc32": f"{crc:08X}",
            "compressedBytes": compressed,
            "uncompressedBytes": uncompressed,
            "localOffset": local_offset,
        })
        i += 46 + fn_len + extra_len + comment_len
    return entries


def fetch_zip_entry(url, entry):
    offset = entry["localOffset"]
    header = request(url, offset, offset + 4095)
    if header[:4] != b"PK\x03\x04":
        raise RuntimeError(f"local header missing for {entry['name']}")
    method = struct.unpack_from("<H", header, 8)[0]
    fn_len, extra_len = struct.unpack_from("<HH", header, 26)
    if method != entry["method"]:
        raise RuntimeError(f"compression method mismatch for {entry['name']}")
    start = offset + 30 + fn_len + extra_len
    compressed = request(url, start, start + entry["compressedBytes"] - 1)
    if method == 0:
        raw = compressed
    elif method == 8:
        raw = zlib.decompress(compressed, -15)
    else:
        raise RuntimeError(f"unsupported ZIP compression method {method} for {entry['name']}")
    if len(raw) != entry["uncompressedBytes"]:
        raise RuntimeError(f"uncompressed size mismatch for {entry['name']}")
    crc = f"{binascii.crc32(raw) & 0xffffffff:08X}"
    if crc != entry["crc32"]:
        raise RuntimeError(f"CRC mismatch for {entry['name']}")
    return raw


def derive_bundle_stem(runtime_path):
    parts = norm(runtime_path).split("/")
    if len(parts) < 3:
        raise RuntimeError(f"cannot derive discovery stem from {runtime_path}")
    if parts[0:2] == ["ui", "icon"]:
        return "_".join(parts[:3])
    if parts[0] == "spine" and parts[1] in ("char", "general"):
        return "_".join(parts[:3])
    raise RuntimeError(f"unsupported target family for discovery: {runtime_path}")


def resource_entries(document):
    if not isinstance(document, list):
        raise RuntimeError("ConfigDataModelSkinResourceInfo must be a JSON array")
    return document


def build_targets(contract):
    authority = contract["currentAuthority"]
    readiness = read_json(ROOT / authority["readiness"])
    intake = read_json(ROOT / authority["assetIntakeContract"])
    if readiness.get("status") != authority["requiredReadinessStatus"]:
        raise RuntimeError(f"readiness drift: {readiness.get('status')}")
    keys = [int(row["canonicalKey"]["value"]) for row in intake["records"]]
    if keys != authority["representativeSkinIds"]:
        raise RuntimeError(f"representative key drift: {keys}")
    locator_count = sum(len(row["expectedLocators"]) for row in intake["records"])
    if locator_count != authority["expectedLocatorCount"]:
        raise RuntimeError(f"locator count drift: {locator_count}")

    model_spec = contract["modelResourceSource"]
    model_path = ROOT / model_spec["path"]
    actual_blob = git_blob_sha(model_path)
    if actual_blob != model_spec["mainBlobSha"]:
        raise RuntimeError(f"model resource source blob drift: {actual_blob}")
    model_doc = resource_entries(read_json(model_path))
    required_ids = {int(value) for value in model_spec["requiredIds"]}
    selected = [row for row in model_doc if int(row.get("ID", -1)) in required_ids]
    counts = {}
    for row in selected:
        key = int(row["ID"])
        counts[key] = counts.get(key, 0) + 1
    bad = {key: counts.get(key, 0) for key in sorted(required_ids) if counts.get(key, 0) != 1}
    if bad:
        raise RuntimeError(f"exact model resource ID cardinality failed: {bad}")
    model_map = {int(row["ID"]): row.get(model_spec["mappingField"]) for row in selected}
    if any(not isinstance(value, str) or not value for value in model_map.values()):
        raise RuntimeError("one or more exact model resource rows have empty Model path")

    targets = []
    for record in intake["records"]:
        skin_id = int(record["canonicalKey"]["value"])
        for locator in record["expectedLocators"]:
            kind = locator["locatorKind"]
            value = locator["value"]
            if kind == "RESOURCE_ID":
                resource_id = int(value)
                exact_path = model_map[resource_id]
                target_value = resource_id
            else:
                resource_id = None
                exact_path = str(value)
                target_value = str(value)
            targets.append({
                "skinId": skin_id,
                "assetRole": locator["assetRole"],
                "locatorKind": kind,
                "locatorValue": target_value,
                "resourceId": resource_id,
                "exactRuntimePath": exact_path,
                "discoveryBundleStem": derive_bundle_stem(exact_path),
            })
    if len(targets) != authority["expectedLocatorCount"]:
        raise RuntimeError("constructed target count mismatch")
    return readiness, model_map, targets, actual_blob


def scan_package_catalog(contract, stems):
    fresh = contract["freshSource"]
    base = fresh["base"]
    version = fresh["installVersion"]
    packages = []
    candidates = []
    seen = False
    missing_after_seen = 0
    for part in range(1, MAX_PART + 1):
        package_name = f"InstallPage_{version}_{part}.zip"
        url = f"{base}/{package_name}"
        total = head_size(url)
        if total is None:
            if seen:
                missing_after_seen += 1
                if missing_after_seen >= MISS_BREAK:
                    break
            continue
        seen = True
        missing_after_seen = 0
        entries = zip_directory(url, total)
        bundle_count = 0
        candidate_count = 0
        for entry in entries:
            basename = norm(entry["name"]).rsplit("/", 1)[-1]
            if not basename.endswith(".b"):
                continue
            bundle_count += 1
            matched_stems = sorted(stem for stem in stems if basename.endswith(stem + ".b"))
            if not matched_stems:
                continue
            candidate_count += 1
            candidates.append({
                "packagePart": part,
                "packageName": package_name,
                "packageUrl": url,
                "packageBytes": total,
                "entry": entry,
                "bundleBasename": basename,
                "matchedStems": matched_stems,
            })
        packages.append({
            "part": part,
            "packageName": package_name,
            "sizeBytes": total,
            "entryCount": len(entries),
            "bundleEntryCount": bundle_count,
            "candidateBundleEntryCount": candidate_count,
        })
    if not packages:
        raise RuntimeError("no official installer packages were readable")
    return packages, candidates


def object_meta(obj):
    object_type = getattr(getattr(obj, "type", None), "name", None)
    path_id = int(getattr(obj, "path_id", 0) or 0)
    raw_hash = None
    raw_bytes = None
    try:
        raw = obj.get_raw_data()
        raw_hash = sha256(raw)
        raw_bytes = len(raw)
    except Exception:
        pass
    return {
        "objectType": object_type,
        "pathId": path_id,
        "rawObjectBytes": raw_bytes,
        "rawObjectSha256": raw_hash,
    }


def inspect_candidates(candidates, targets):
    by_stem = {}
    for target in targets:
        by_stem.setdefault(target["discoveryBundleStem"], []).append(target)
    hits_by_target = {index: [] for index in range(len(targets))}
    bundle_reports = []
    cache = {}

    for candidate in candidates:
        key = (candidate["packagePart"], candidate["entry"]["name"])
        if key not in cache:
            raw = fetch_zip_entry(candidate["packageUrl"], candidate["entry"])
            env = UnityPy.load(raw)
            container = [(path, obj) for path, obj in env.container.items()]
            cache[key] = (raw, container)
        raw, container = cache[key]
        report = {
            "packagePart": candidate["packagePart"],
            "packageName": candidate["packageName"],
            "bundleEntry": candidate["entry"]["name"],
            "bundleBasename": candidate["bundleBasename"],
            "bundleBytes": len(raw),
            "bundleSha256": sha256(raw),
            "containerCount": len(container),
            "matchedStems": candidate["matchedStems"],
            "exactHitCount": 0,
        }
        for stem in candidate["matchedStems"]:
            for target in by_stem[stem]:
                target_index = targets.index(target)
                expected = norm(target["exactRuntimePath"])
                for container_path, obj in container:
                    if norm(container_path) != expected:
                        continue
                    hit = {
                        "packagePart": candidate["packagePart"],
                        "packageName": candidate["packageName"],
                        "bundleEntry": candidate["entry"]["name"],
                        "bundleBasename": candidate["bundleBasename"],
                        "bundleBytes": len(raw),
                        "bundleSha256": sha256(raw),
                        "containerPath": str(container_path).replace("\\", "/"),
                        **object_meta(obj),
                    }
                    hits_by_target[target_index].append(hit)
                    report["exactHitCount"] += 1
        bundle_reports.append(report)

    classified = []
    for index, target in enumerate(targets):
        hits = hits_by_target[index]
        if len(hits) == 0:
            status = "NO_EXACT_HIT"
        elif len(hits) == 1:
            status = "EXACT_HIT_SINGLE_SOURCE"
        else:
            content_keys = {
                (hit.get("rawObjectBytes"), hit.get("rawObjectSha256"))
                for hit in hits
                if hit.get("rawObjectSha256")
            }
            status = "EXACT_HIT_MULTIPLE_EQUIVALENT_OBJECTS" if len(content_keys) == 1 and content_keys else "EXACT_HIT_MULTIPLE_SOURCES"
        classified.append({**target, "status": status, "exactHitCount": len(hits), "hits": hits})
    return classified, bundle_reports


def main():
    contract = read_json(CONTRACT_PATH)
    if contract.get("schemaId") != "asset-intake-skin-stage3-2-fresh-source-inventory/v1":
        raise RuntimeError("unexpected contract schema")
    readiness, model_map, targets, model_blob = build_targets(contract)
    stems = sorted({row["discoveryBundleStem"] for row in targets})
    packages, candidates = scan_package_catalog(contract, stems)
    classified, bundle_reports = inspect_candidates(candidates, targets)

    status_counts = {}
    role_counts = {}
    for row in classified:
        status_counts[row["status"]] = status_counts.get(row["status"], 0) + 1
        role_counts.setdefault(row["assetRole"], {"targets": 0, "withExactHit": 0})
        role_counts[row["assetRole"]]["targets"] += 1
        if row["exactHitCount"] > 0:
            role_counts[row["assetRole"]]["withExactHit"] += 1

    all_have_hit = all(row["exactHitCount"] > 0 for row in classified)
    blockers = []
    if not all_have_hit:
        blockers.append("ONE_OR_MORE_FROZEN_LOCATORS_HAVE_NO_EXACT_OFFICIAL_INSTALLER_HIT")
    ambiguous = [row for row in classified if row["exactHitCount"] > 1 and row["status"] != "EXACT_HIT_MULTIPLE_EQUIVALENT_OBJECTS"]
    if ambiguous:
        blockers.append("ONE_OR_MORE_FROZEN_LOCATORS_HAVE_MULTIPLE_NON_EQUIVALENT_EXACT_SOURCES")

    result = {
        "version": 1,
        "schemaId": "skin-stage3-2-fresh-source-inventory/v1",
        "status": "PASS_FRESH_SOURCE_INVENTORY" if not blockers else "PASS_FRESH_SOURCE_INVENTORY_WITH_BLOCKERS",
        "completion": "FRESH_OFFICIAL_INSTALLER_EXACT_PATH_INVENTORY_COMPLETE",
        "sourceContract": str(CONTRACT_PATH.relative_to(ROOT)).replace("\\", "/"),
        "currentAuthority": {
            "readinessStatus": readiness["status"],
            "representativeSkinIds": contract["currentAuthority"]["representativeSkinIds"],
            "locatorCount": len(targets),
            "projectStatusPromoted": False,
        },
        "freshSource": {
            "installVersion": contract["freshSource"]["installVersion"],
            "base": contract["freshSource"]["base"],
            "officialPackageCount": len(packages),
            "lastExistingPackagePart": max(row["part"] for row in packages),
            "candidateBundleEntryCount": len(candidates),
            "candidateBundleUniqueCount": len({(row["packagePart"], row["entry"]["name"]) for row in candidates}),
            "discoveryBundleStems": stems,
        },
        "modelResourceSource": {
            "path": contract["modelResourceSource"]["path"],
            "blobSha": model_blob,
            "selectedIdCount": len(model_map),
            "selected": [{"id": key, "model": model_map[key]} for key in sorted(model_map)],
        },
        "coverage": {
            "locatorCount": len(classified),
            "locatorsWithExactHit": sum(1 for row in classified if row["exactHitCount"] > 0),
            "allLocatorsHaveExactHit": all_have_hit,
            "statusCounts": status_counts,
            "roleCounts": role_counts,
        },
        "targets": classified,
        "candidateBundles": bundle_reports,
        "packageSummary": packages,
        "blockers": blockers,
        "boundaries": {
            "historicalCompletionEvidenceImported": False,
            "legacyDriveUsedAsAuthority": False,
            "nameJoin": False,
            "idArithmetic": False,
            "stage31Recomputed": False,
            "semanticMutationCount": 0,
            "projectStatusMutationCount": 0,
            "statusSourceMutationCount": 0,
        },
        "nextStart": "Selectively materialize only exact-hit official objects into a reviewable extraction root and feed them into the installed Skin Stage 3-2 Asset Intake runner. Multiple-source rows must be resolved by concrete content/provenance evidence, never by begin/current naming preference.",
    }
    OUTPUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": result["status"],
        "packages": result["freshSource"]["officialPackageCount"],
        "candidateBundles": result["freshSource"]["candidateBundleEntryCount"],
        "locatorCount": result["coverage"]["locatorCount"],
        "withExactHit": result["coverage"]["locatorsWithExactHit"],
        "statusCounts": status_counts,
        "blockers": blockers,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
