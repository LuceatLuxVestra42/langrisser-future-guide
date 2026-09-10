#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
import struct
import urllib.request

PACKAGE_INVENTORY = pathlib.Path("data/generated/hero-awakening-icon-official-package-inventory.v1.json")
TARGETS = pathlib.Path("data/generated/hero-awakening-icon-verification-targets.v1.json")
OUTPUT = pathlib.Path("data/generated/hero-awakening-icon-official-bundle-locator.v1.json")
EXPECTED_PACKAGE_HASH = "2b1e622601af5f3b35dd39aa546b23265813b30174367b11c6467beaf01d7fe1"
EXPECTED_TARGET_HASH = "78e566b736e3b5b13a4c29186a283a05951383ba6ac84739f296b91c740a4723"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"

PREFIX_TO_BUNDLE_LEAF = {
    "UI/Icon/Skill_ABS/": "ui_icon_skill_abs.b",
    "UI/Icon/Skill2_ABS/": "ui_icon_skill2_abs.b",
    "UI/Icon/Item05_ABS/": "ui_icon_item05_abs.b",
}


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_compact(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def request_bytes(url, start, end):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity", "Range": f"bytes={start}-{end}"})
    with urllib.request.urlopen(req, timeout=90) as response:
        data = response.read()
    if len(data) != end - start + 1:
        raise RuntimeError(f"range mismatch {url} {start}-{end}: {len(data)}")
    return data


def zip_directory(url, total):
    tail_size = min(131072, total)
    tail = request_bytes(url, total - tail_size, total - 1)
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise RuntimeError(f"EOCD missing: {url}")
    _, _, _, _, central_size, central_offset, _ = struct.unpack_from("<HHHHIIH", tail, eocd + 4)
    central = request_bytes(url, central_offset, central_offset + central_size - 1)
    entries = []
    i = 0
    while i + 46 <= len(central) and central[i:i+4] == b"PK\x01\x02":
        flags, method = struct.unpack_from("<HH", central, i + 8)
        crc, compressed, uncompressed = struct.unpack_from("<III", central, i + 16)
        fn_len, extra_len, comment_len = struct.unpack_from("<HHH", central, i + 28)
        local_offset = struct.unpack_from("<I", central, i + 42)[0]
        name_bytes = central[i+46:i+46+fn_len]
        name = name_bytes.decode("utf-8" if flags & 0x800 else "cp437", "replace")
        entries.append({
            "name": name.replace("\\", "/"),
            "method": method,
            "crc32": f"{crc:08X}",
            "compressedBytes": compressed,
            "uncompressedBytes": uncompressed,
            "localOffset": local_offset,
        })
        i += 46 + fn_len + extra_len + comment_len
    return entries


def validate_inputs():
    packages = load_json(PACKAGE_INVENTORY)
    if packages.get("schemaId") != "hero-awakening-icon-official-package-inventory/v1" or packages.get("status") != "FROZEN" or packages.get("completion") != "COMPLETE":
        raise RuntimeError("A6-3 package inventory contract mismatch")
    if packages.get("packageInventorySha256") != EXPECTED_PACKAGE_HASH:
        raise RuntimeError("A6-3 package inventory hash mismatch")
    if packages.get("summary", {}).get("officialPackageCount") != 68:
        raise RuntimeError("A6-3 package count mismatch")

    targets = load_json(TARGETS)
    if targets.get("schemaId") != "hero-awakening-icon-verification-targets/v1" or targets.get("status") != "FROZEN" or targets.get("completion") != "COMPLETE":
        raise RuntimeError("A6-1 target contract mismatch")
    if targets.get("targetSetSha256") != EXPECTED_TARGET_HASH or len(targets.get("targets", [])) != 256:
        raise RuntimeError("A6-1 target hash/count mismatch")
    return packages, targets


def target_locator_groups(targets):
    groups = []
    assigned = set()
    for prefix, leaf in PREFIX_TO_BUNDLE_LEAF.items():
        rows = [row for row in targets["targets"] if row["sourcePath"].startswith(prefix)]
        for row in rows:
            assigned.add(row["sourcePath"])
        groups.append({
            "sourcePathPrefix": prefix,
            "candidateBundleLeaf": leaf,
            "targetCount": len(rows),
            "sourcePaths": [row["sourcePath"] for row in rows],
        })
    unmapped = [row["sourcePath"] for row in targets["targets"] if row["sourcePath"] not in assigned]
    if unmapped:
        raise RuntimeError(f"unmapped target prefixes: {unmapped[:5]}")
    return groups


def build_inventory(packages, targets):
    all_bundles = []
    package_summaries = []
    for pkg in packages["packages"]:
        entries = zip_directory(pkg["url"], pkg["contentLength"])
        bundle_entries = [entry for entry in entries if entry["name"].lower().endswith(".b")]
        package_summaries.append({"part": pkg["part"], "packageName": pkg["packageName"], "zipEntryCount": len(entries), "bundleEntryCount": len(bundle_entries)})
        for entry in bundle_entries:
            all_bundles.append({
                "packagePart": pkg["part"],
                "packageName": pkg["packageName"],
                "packageUrl": pkg["url"],
                "bundleEntry": entry["name"],
                "bundleLeaf": entry["name"].rsplit("/", 1)[-1].lower(),
                "method": entry["method"],
                "crc32": entry["crc32"],
                "compressedBytes": entry["compressedBytes"],
                "uncompressedBytes": entry["uncompressedBytes"],
                "localOffset": entry["localOffset"],
            })
    all_bundles.sort(key=lambda x: (x["packagePart"], x["bundleEntry"].lower()))

    groups = target_locator_groups(targets)
    exact_leaf_index = {}
    for bundle in all_bundles:
        exact_leaf_index.setdefault(bundle["bundleLeaf"], []).append(bundle)

    locator_groups = []
    for group in groups:
        candidates = exact_leaf_index.get(group["candidateBundleLeaf"], [])
        locator_groups.append({
            **group,
            "status": "CANDIDATE_FOUND" if candidates else "REVIEW_CANDIDATE_LEAF_NOT_FOUND",
            "candidateCount": len(candidates),
            "candidates": candidates,
            "proofStatus": "UNPROVEN_UNTIL_EXACT_RUNTIME_PATH_MATCH",
        })

    candidate_bundle_keys = sorted({(c["packagePart"], c["bundleEntry"]) for g in locator_groups for c in g["candidates"]})
    summary = {
        "officialPackageCount": len(packages["packages"]),
        "zipPackageScanCount": len(package_summaries),
        "allBundleEntryCount": len(all_bundles),
        "targetCount": len(targets["targets"]),
        "locatorGroupCount": len(locator_groups),
        "candidateBundleEntryCount": len(candidate_bundle_keys),
        "groupsWithCandidates": sum(1 for g in locator_groups if g["candidateCount"] > 0),
        "groupsWithoutCandidates": sum(1 for g in locator_groups if g["candidateCount"] == 0),
    }
    result = {
        "version": 1,
        "schemaId": "hero-awakening-icon-official-bundle-locator/v1",
        "status": "FROZEN",
        "completion": "COMPLETE",
        "semanticReopen": False,
        "predecessor": {
            "stage": "A6_3_OFFICIAL_PACKAGE_INVENTORY",
            "commit": "6af98acdce053a607b3a78983b1ad44d503a40ba",
            "packageInventorySha256": EXPECTED_PACKAGE_HASH,
        },
        "targetInput": {"targetSetSha256": EXPECTED_TARGET_HASH, "targetCount": 256},
        "locatorPolicy": {
            "role": "candidate locator only",
            "bundleLeafMatch": "exact lowercase bundle leaf against explicit prefix rule",
            "noSemanticInference": True,
            "noNotInSourceSnapshotFromLocatorMiss": True,
            "proofRequirement": "full normalized runtime relative path equality inside decoded candidate bundle",
            "rules": [{"sourcePathPrefix": p, "candidateBundleLeaf": l} for p, l in PREFIX_TO_BUNDLE_LEAF.items()],
        },
        "summary": summary,
        "packageSummaries": package_summaries,
        "locatorGroups": locator_groups,
    }
    result["bundleLocatorSha256"] = sha256_compact({"packageSummaries": package_summaries, "locatorGroups": locator_groups})
    result["bundleLocatorHashContract"] = "sha256(UTF-8 compact JSON of {packageSummaries,locatorGroups}, preserve array/key insertion order)"
    return result


def validate_frozen(expected):
    if not OUTPUT.exists():
        raise RuntimeError(f"frozen locator missing: {OUTPUT}")
    frozen = load_json(OUTPUT)
    for key in ("schemaId", "status", "completion", "semanticReopen", "predecessor", "targetInput", "locatorPolicy", "summary", "packageSummaries", "locatorGroups", "bundleLocatorSha256", "bundleLocatorHashContract"):
        if frozen.get(key) != expected.get(key):
            raise RuntimeError(f"frozen locator drift: {key}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    packages, targets = validate_inputs()
    expected = build_inventory(packages, targets)
    if args.write:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    validate_frozen(expected)
    print(json.dumps({
        "status": "PASS",
        "checkpoint": "AWAKENING_ICON_A6_4_GENERIC_BUNDLE_LOCATOR",
        **expected["summary"],
        "bundleLocatorSha256": expected["bundleLocatorSha256"],
        "semanticReopen": False,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
