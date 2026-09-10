#!/usr/bin/env python3
import argparse
import binascii
import hashlib
import json
import pathlib
import struct
import sys
import traceback
import urllib.error
import urllib.request
import zlib

TARGETS_PATH = pathlib.Path("data/generated/hero-awakening-icon-verification-targets.v1.json")
CONTRACT_PATH = pathlib.Path("data/contracts/hero-awakening-icon-official-verifier.v1.json")
EXPECTED_TARGET_HASH = "78e566b736e3b5b13a4c29186a283a05951383ba6ac84739f296b91c740a4723"
EXPECTED_TARGET_COUNT = 256
ROOT_PREFIX = "assets/gameproject/runtimeassets"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def canonical_targets_sha(targets):
    raw = json.dumps(targets, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return sha256_bytes(raw)


def norm(value):
    return str(value).replace("\\", "/").strip("/").lower()


def runtime_relative(container_path):
    actual = norm(container_path)
    prefix = norm(ROOT_PREFIX)
    if not actual.startswith(prefix + "/"):
        return None
    return actual[len(prefix) + 1 :]


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_frozen_targets():
    frozen = load_json(TARGETS_PATH)
    if frozen.get("schemaId") != "hero-awakening-icon-verification-targets/v1":
        raise RuntimeError("TARGET_CONTRACT_MISMATCH:schemaId")
    if frozen.get("status") != "FROZEN" or frozen.get("completion") != "COMPLETE":
        raise RuntimeError("TARGET_CONTRACT_MISMATCH:not frozen/complete")
    if frozen.get("semanticReopen") is not False:
        raise RuntimeError("TARGET_CONTRACT_MISMATCH:semanticReopen")
    targets = frozen.get("targets")
    if not isinstance(targets, list) or len(targets) != EXPECTED_TARGET_COUNT:
        raise RuntimeError(f"TARGET_CONTRACT_MISMATCH:target count {len(targets) if isinstance(targets, list) else 'invalid'}")
    digest = canonical_targets_sha(targets)
    if frozen.get("targetSetSha256") != EXPECTED_TARGET_HASH or digest != EXPECTED_TARGET_HASH:
        raise RuntimeError(f"TARGET_CONTRACT_MISMATCH:target hash {digest}")
    paths = [row.get("sourcePath") for row in targets]
    if any(not isinstance(p, str) or not p for p in paths):
        raise RuntimeError("TARGET_CONTRACT_MISMATCH:empty sourcePath")
    if len(set(paths)) != EXPECTED_TARGET_COUNT:
        raise RuntimeError("TARGET_CONTRACT_MISMATCH:duplicate sourcePath")
    if "UI/Icon/Skill_ABS/Skill_Super4.png" in paths:
        raise RuntimeError("TARGET_CONTRACT_MISMATCH:Leon fixture leaked into A6-1 targets")
    return frozen


def contract_check():
    frozen = load_frozen_targets()
    contract = load_json(CONTRACT_PATH)
    if contract.get("schemaId") != "hero-awakening-icon-official-verifier/v1":
        raise RuntimeError("verifier contract schema mismatch")
    predecessor = contract.get("predecessor", {})
    if predecessor.get("commit") != "447e6b4a51269cdeae42dd04b33ac3ce76dae8e4":
        raise RuntimeError("A6-1 predecessor mismatch")
    if predecessor.get("targetSetSha256") != EXPECTED_TARGET_HASH or predecessor.get("targetCount") != EXPECTED_TARGET_COUNT:
        raise RuntimeError("A6-1 frozen target pin mismatch")
    if runtime_relative("Assets/GameProject/RuntimeAssets/UI/Icon/Skill_ABS/Skill_Super1.png") != norm("UI/Icon/Skill_ABS/Skill_Super1.png"):
        raise RuntimeError("normalized exact runtime-path match regression")
    if runtime_relative("Assets/GameProject/RuntimeAssets/UI/Icon/Other/Skill_Super1.png") == norm("UI/Icon/Skill_ABS/Skill_Super1.png"):
        raise RuntimeError("basename fallback regression")
    first = frozen["targets"][0]
    print(json.dumps({
        "status": "PASS",
        "checkpoint": "AWAKENING_ICON_A6_2_OFFICIAL_VERIFIER_CONTRACT",
        "targetCount": len(frozen["targets"]),
        "targetSetSha256": frozen["targetSetSha256"],
        "lookupKey": "sourcePath",
        "proofMatch": "full normalized runtime relative path equality",
        "firstTarget": first["sourcePath"],
        "semanticReopen": False,
        "networkUsed": False,
    }, ensure_ascii=False, indent=2))


def request_bytes(url, start=None, end=None, timeout=90):
    headers = {"User-Agent": UA, "Accept-Encoding": "identity"}
    if start is not None:
        headers["Range"] = f"bytes={start}-{end}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        data = response.read()
    if start is not None and len(data) != end - start + 1:
        raise RuntimeError("range mismatch")
    return data


def head_size(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"}, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            return int(response.headers["Content-Length"])
    except urllib.error.HTTPError as exc:
        if exc.code in (403, 404):
            return None
        raise


def zip_directory(url, total):
    tail_size = min(131072, total)
    tail = request_bytes(url, total - tail_size, total - 1)
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise RuntimeError("EOCD missing")
    _, _, _, _, central_size, central_offset, _ = struct.unpack_from("<HHHHIIH", tail, eocd + 4)
    central = request_bytes(url, central_offset, central_offset + central_size - 1)
    entries = []
    i = 0
    while i + 46 <= len(central) and central[i : i + 4] == b"PK\x01\x02":
        flags, method = struct.unpack_from("<HH", central, i + 8)
        crc, compressed, uncompressed = struct.unpack_from("<III", central, i + 16)
        fn_len, extra_len, comment_len = struct.unpack_from("<HHH", central, i + 28)
        local_offset = struct.unpack_from("<I", central, i + 42)[0]
        name_bytes = central[i + 46 : i + 46 + fn_len]
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
    header = request_bytes(url, offset, offset + 4095)
    method = struct.unpack_from("<H", header, 8)[0]
    fn_len, extra_len = struct.unpack_from("<HH", header, 26)
    start = offset + 30 + fn_len + extra_len
    compressed = request_bytes(url, start, start + entry["compressedBytes"] - 1)
    if method == 0:
        raw = compressed
    elif method == 8:
        raw = zlib.decompress(compressed, -15)
    else:
        raise RuntimeError(f"unsupported compression {method}")
    if len(raw) != entry["uncompressedBytes"]:
        raise RuntimeError("uncompressed size mismatch")
    if f"{binascii.crc32(raw) & 0xffffffff:08X}" != entry["crc32"]:
        raise RuntimeError("CRC mismatch")
    return raw


def select_target(frozen, source_path):
    by_path = {row["sourcePath"]: row for row in frozen["targets"]}
    target = by_path.get(source_path)
    if target is None:
        raise RuntimeError("TARGET_CONTRACT_MISMATCH:sourcePath is not in frozen A6-1 targets")
    return target


def reader_of(value):
    return value.deref() if hasattr(value, "deref") else value


def verify_one(args):
    frozen = load_frozen_targets()
    target = select_target(frozen, args.source_path)
    try:
        import UnityPy
    except ImportError as exc:
        raise RuntimeError("UnityPy is required for network verification") from exc

    version = args.install_version
    base = f"http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{version}"
    result = {
        "version": 1,
        "schemaId": "hero-awakening-icon-official-verification-result/v1",
        "status": "RUNNING",
        "reason": None,
        "semanticReopen": False,
        "targetSetSha256": frozen["targetSetSha256"],
        "target": target,
        "source": {
            "kind": "OFFICIAL_INSTALLER",
            "installVersion": version,
            "base": base,
            "unityParser": getattr(UnityPy, "__version__", "unknown"),
        },
        "searchCoverage": "FILTERED_BUNDLES" if args.bundle_stem else "EXHAUSTIVE_ALL_BUNDLES",
        "packageCatalog": {},
        "hits": [],
        "scanErrors": [],
    }

    seen = False
    miss = 0
    packages = []
    for part in range(1, args.max_part + 1):
        package_name = f"InstallPage_{version}_{part}.zip"
        url = f"{base}/{package_name}"
        total = head_size(url)
        if total is None:
            if seen:
                miss += 1
                if miss >= args.miss_break:
                    break
            continue
        seen = True
        miss = 0
        packages.append((part, package_name, url, total))
    result["packageCatalog"]["officialPackageCount"] = len(packages)
    if not packages:
        result["status"] = "BLOCKER"
        result["reason"] = "PACKAGE_UNAVAILABLE"
        return result, 2

    candidates = []
    for part, package_name, url, total in packages:
        try:
            entries = zip_directory(url, total)
        except Exception as exc:
            result["scanErrors"].append({"packagePart": part, "reason": f"PACKAGE_CATALOG_INCOMPLETE:{type(exc).__name__}:{exc}"})
            continue
        for entry in entries:
            leaf = norm(entry["name"]).rsplit("/", 1)[-1]
            if not leaf.endswith(".b"):
                continue
            if args.bundle_stem and not leaf.endswith(norm(args.bundle_stem) + ".b"):
                continue
            candidates.append((part, package_name, url, entry))
    result["packageCatalog"]["candidateBundleCount"] = len(candidates)

    target_norm = norm(target["sourcePath"])
    for part, package_name, url, entry in candidates:
        try:
            raw = fetch_zip_entry(url, entry)
            bundle_sha = sha256_bytes(raw)
        except Exception as exc:
            result["scanErrors"].append({"packagePart": part, "bundleEntry": entry["name"], "reason": f"BUNDLE_READ_FAIL:{type(exc).__name__}:{exc}"})
            continue
        try:
            env = UnityPy.load(raw)
        except Exception as exc:
            result["scanErrors"].append({"packagePart": part, "bundleEntry": entry["name"], "reason": f"UNITY_DECODE_FAIL:{type(exc).__name__}:{exc}"})
            continue
        for container_path, value in env.container.items():
            rel = runtime_relative(container_path)
            if rel != target_norm:
                continue
            try:
                reader = reader_of(value)
                raw_obj = reader.get_raw_data()
                data = reader.read()
                object_type = getattr(getattr(reader, "type", None), "name", None)
                image = data.image.convert("RGBA") if object_type == "Sprite" else None
                if object_type != "Sprite":
                    result["hits"].append({
                        "packagePart": part,
                        "packageName": package_name,
                        "bundleEntry": entry["name"],
                        "bundleSha256": bundle_sha,
                        "runtimeContainerPath": str(container_path).replace("\\", "/"),
                        "objectType": object_type,
                        "status": "BLOCKER",
                        "reason": "TYPE_MISMATCH",
                    })
                    continue
                rgba = image.tobytes()
                alpha_bbox = image.getchannel("A").getbbox()
                result["hits"].append({
                    "sourcePath": target["sourcePath"],
                    "installVersion": version,
                    "packagePart": part,
                    "packageName": package_name,
                    "bundleEntry": entry["name"],
                    "bundleSha256": bundle_sha,
                    "runtimeContainerPath": str(container_path).replace("\\", "/"),
                    "objectType": object_type,
                    "pathId": int(getattr(reader, "path_id", 0) or 0),
                    "width": image.width,
                    "height": image.height,
                    "rawObjectSha256": sha256_bytes(raw_obj),
                    "rgbaSha256": sha256_bytes(rgba),
                    "nonEmptyAlpha": alpha_bbox is not None,
                    "status": "VERIFIED" if alpha_bbox is not None else "BLOCKER",
                    "reason": None if alpha_bbox is not None else "EMPTY_ALPHA",
                })
            except Exception as exc:
                result["hits"].append({
                    "packagePart": part,
                    "packageName": package_name,
                    "bundleEntry": entry["name"],
                    "runtimeContainerPath": str(container_path).replace("\\", "/"),
                    "status": "BLOCKER",
                    "reason": f"UNITY_DECODE_FAIL:{type(exc).__name__}:{exc}",
                })

    if result["hits"]:
        invalid = [hit for hit in result["hits"] if hit.get("status") != "VERIFIED"]
        if invalid:
            result["status"] = "BLOCKER"
            result["reason"] = invalid[0].get("reason") or "UNITY_DECODE_FAIL"
            return result, 2
        render_keys = {(hit["width"], hit["height"], hit["rgbaSha256"]) for hit in result["hits"]}
        if len(render_keys) != 1:
            result["status"] = "BLOCKER"
            result["reason"] = "AMBIGUOUS_NON_EQUIVALENT_EXACT_SOURCES"
            return result, 2
        result["status"] = "VERIFIED"
        result["reason"] = None
        return result, 0

    if result["scanErrors"]:
        result["status"] = "BLOCKER"
        result["reason"] = "PACKAGE_CATALOG_INCOMPLETE" if any(str(e.get("reason", "")).startswith("PACKAGE_CATALOG_INCOMPLETE") for e in result["scanErrors"]) else "BUNDLE_READ_FAIL"
        return result, 2

    if result["searchCoverage"] == "EXHAUSTIVE_ALL_BUNDLES":
        result["status"] = "NOT_IN_SOURCE_SNAPSHOT"
        result["reason"] = "NO_EXACT_RUNTIME_PATH_HIT"
        return result, 0

    result["status"] = "REVIEW"
    result["reason"] = "NON_EXHAUSTIVE_NO_HIT"
    return result, 0


def main():
    parser = argparse.ArgumentParser(description="Verify frozen Hero awakening icon sourcePath against official installer assets.")
    parser.add_argument("--contract-check", action="store_true", help="Validate A6-2 contract and frozen A6-1 input without network access.")
    parser.add_argument("--source-path", help="Exact sourcePath from the frozen A6-1 target set.")
    parser.add_argument("--install-version", default="1.1.113")
    parser.add_argument("--bundle-stem", help="Optional locator-only bundle stem without .b. A no-hit result is REVIEW, never NOT_IN_SOURCE_SNAPSHOT.")
    parser.add_argument("--max-part", type=int, default=90)
    parser.add_argument("--miss-break", type=int, default=8)
    parser.add_argument("--output")
    args = parser.parse_args()

    if args.contract_check:
        contract_check()
        return 0
    if not args.source_path:
        parser.error("--source-path is required unless --contract-check is used")

    try:
        result, code = verify_one(args)
    except Exception as exc:
        result = {
            "version": 1,
            "schemaId": "hero-awakening-icon-official-verification-result/v1",
            "status": "BLOCKER",
            "reason": f"{type(exc).__name__}:{exc}",
            "semanticReopen": False,
            "traceback": traceback.format_exc(),
        }
        code = 3
    serialized = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        output = pathlib.Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(serialized, encoding="utf-8")
    print(serialized, end="")
    return code


if __name__ == "__main__":
    sys.exit(main())
