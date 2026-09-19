#!/usr/bin/env python3
import argparse
import binascii
import hashlib
import json
import pathlib
import struct
import urllib.request
import zlib

CATALOG_PATH = pathlib.Path("data/generated/hero-casting-law-materials.v1.json")
PACKAGE_INVENTORY_PATH = pathlib.Path("data/generated/hero-awakening-icon-official-package-inventory.v1.json")
OUTPUT_PATH = pathlib.Path("data/generated/hero-casting-law-material-icon-assets.v1.json")
SUMMARY_PATH = pathlib.Path("data/validation/hero-casting-law-material-icon-assets-summary.v1.json")
PUBLIC_ROOT = pathlib.Path("public/images/heroes/casting-law-material-icons")

EXPECTED_ITEM_COUNT = 45
EXPECTED_PACKAGE_SCHEMA = "hero-awakening-icon-official-package-inventory/v1"
EXPECTED_PACKAGE_HASH = "2b1e622601af5f3b35dd39aa546b23265813b30174367b11c6467beaf01d7fe1"
EXPECTED_BUNDLE_BASENAME = "ui_icon_item04_abs.b"
ROOT_PREFIX = "assets/gameproject/runtimeassets"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def compact_sha(value):
    return sha256_bytes(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def norm(value):
    return str(value).replace("\\", "/").strip("/").lower()


def runtime_relative(container_path):
    actual = norm(container_path)
    prefix = norm(ROOT_PREFIX)
    if not actual.startswith(prefix + "/"):
        return None
    return actual[len(prefix) + 1 :]


def request_bytes(url, start=None, end=None, timeout=90):
    headers = {"User-Agent": UA, "Accept-Encoding": "identity"}
    if start is not None:
        headers["Range"] = f"bytes={start}-{end}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        data = response.read()
    if start is not None and len(data) != end - start + 1:
        raise RuntimeError(f"range mismatch for {url}: {len(data)} != {end - start + 1}")
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
        raise RuntimeError(f"unsupported ZIP compression {method}")
    if len(raw) != entry["uncompressedBytes"]:
        raise RuntimeError("uncompressed size mismatch")
    if f"{binascii.crc32(raw) & 0xffffffff:08X}" != entry["crc32"]:
        raise RuntimeError("CRC mismatch")
    return raw


def reader_of(value):
    return value.deref() if hasattr(value, "deref") else value


def collect_targets():
    catalog = load_json(CATALOG_PATH)
    if catalog.get("version") != 1 or catalog.get("domain") != "hero-casting-law-materials" or catalog.get("status") != "PASS":
        raise RuntimeError("Casting Law material catalog contract mismatch")
    if catalog.get("summary", {}).get("distinctMaterialItemCount") != EXPECTED_ITEM_COUNT:
        raise RuntimeError("Casting Law material distinct item count mismatch")

    by_id = {}
    for template in catalog.get("templates", []):
        for level in template.get("levels", []):
            for material in level.get("materials", []):
                item = material.get("item") or {}
                item_id = item.get("itemId")
                source_path = item.get("icon")
                if not isinstance(item_id, int) or item_id <= 0:
                    raise RuntimeError(f"invalid material itemId={item_id}")
                if not isinstance(source_path, str) or not source_path:
                    raise RuntimeError(f"item {item_id}: missing exact icon sourcePath")
                if not norm(source_path).startswith("ui/icon/item04_abs/"):
                    raise RuntimeError(f"item {item_id}: unexpected source folder {source_path}")
                row = {
                    "itemId": item_id,
                    "nameCn": item.get("nameCn") or "",
                    "rank": item.get("rank"),
                    "sourcePath": source_path,
                }
                existing = by_id.get(item_id)
                if existing is not None and existing != row:
                    raise RuntimeError(f"item {item_id}: conflicting catalog icon snapshot")
                by_id[item_id] = row

    targets = [by_id[item_id] for item_id in sorted(by_id)]
    if len(targets) != EXPECTED_ITEM_COUNT:
        raise RuntimeError(f"target count={len(targets)}, expected={EXPECTED_ITEM_COUNT}")
    source_paths = [row["sourcePath"] for row in targets]
    if len(set(source_paths)) != EXPECTED_ITEM_COUNT:
        raise RuntimeError("duplicate sourcePath across Casting Law material items")
    return targets


def load_packages():
    frozen = load_json(PACKAGE_INVENTORY_PATH)
    if (
        frozen.get("schemaId") != EXPECTED_PACKAGE_SCHEMA
        or frozen.get("status") != "FROZEN"
        or frozen.get("completion") != "COMPLETE"
        or frozen.get("packageInventorySha256") != EXPECTED_PACKAGE_HASH
    ):
        raise RuntimeError("official package inventory contract mismatch")
    packages = frozen.get("packages")
    if not isinstance(packages, list) or len(packages) != 68:
        raise RuntimeError("official package inventory population mismatch")
    return packages, frozen


def locate_bundle(packages):
    hits = []
    for package in packages:
        entries = zip_directory(package["url"], package["contentLength"])
        for entry in entries:
            if entry["name"].replace("\\", "/").rsplit("/", 1)[-1].lower() == EXPECTED_BUNDLE_BASENAME:
                hits.append((package, entry))
    if len(hits) != 1:
        raise RuntimeError(f"official bundle locator hit count={len(hits)}, expected=1")
    return hits[0]


def public_path_for(source_path):
    leaf = source_path.replace("\\", "/").rsplit("/", 1)[-1]
    return "/" + (PUBLIC_ROOT / leaf).as_posix().replace("public/", "", 1)


def materialize(targets, packages):
    try:
        import UnityPy
    except ImportError as exc:
        raise RuntimeError("UnityPy is required for materialization") from exc

    package, entry = locate_bundle(packages)
    raw_bundle = fetch_zip_entry(package["url"], entry)
    bundle_sha = sha256_bytes(raw_bundle)
    env = UnityPy.load(raw_bundle)

    target_by_norm = {norm(row["sourcePath"]): row for row in targets}
    candidates = {key: [] for key in target_by_norm}

    for container_path, value in env.container.items():
        rel = runtime_relative(container_path)
        if rel is None or rel not in candidates:
            continue
        reader = reader_of(value)
        if getattr(getattr(reader, "type", None), "name", None) != "Sprite":
            continue
        raw_object = reader.get_raw_data()
        image = reader.read().image.convert("RGBA")
        if image.getchannel("A").getbbox() is None:
            raise RuntimeError(f"empty alpha Sprite: {container_path}")
        candidates[rel].append({
            "runtimeContainerPath": str(container_path).replace("\\", "/"),
            "pathId": int(getattr(reader, "path_id", 0) or 0),
            "image": image,
            "rawObjectSha256": sha256_bytes(raw_object),
            "rgbaSha256": sha256_bytes(image.tobytes()),
        })

    records = []
    for target in targets:
        key = norm(target["sourcePath"])
        matches = candidates.get(key, [])
        if len(matches) != 1:
            raise RuntimeError(f"{target['sourcePath']}: exact Sprite hit count={len(matches)}, expected=1")
        hit = matches[0]
        public_path = public_path_for(target["sourcePath"])
        filesystem_path = pathlib.Path("public") / public_path.lstrip("/")
        filesystem_path.parent.mkdir(parents=True, exist_ok=True)
        hit["image"].save(filesystem_path, format="PNG", optimize=False, compress_level=9)
        png = filesystem_path.read_bytes()
        records.append({
            "itemId": target["itemId"],
            "nameCn": target["nameCn"],
            "rank": target["rank"],
            "sourcePath": target["sourcePath"],
            "publicPath": public_path,
            "filesystemPath": filesystem_path.as_posix(),
            "packagePart": package["part"],
            "packageName": package["packageName"],
            "bundleEntry": entry["name"],
            "bundleSha256": bundle_sha,
            "runtimeContainerPath": hit["runtimeContainerPath"],
            "pathId": hit["pathId"],
            "width": hit["image"].width,
            "height": hit["image"].height,
            "rawObjectSha256": hit["rawObjectSha256"],
            "rgbaSha256": hit["rgbaSha256"],
            "pngBytes": len(png),
            "pngSha256": sha256_bytes(png),
        })

    return records, package, entry, bundle_sha


def build_manifest(records, package, entry, bundle_sha, package_inventory):
    if len(records) != EXPECTED_ITEM_COUNT:
        raise RuntimeError("materialized record count mismatch")
    if len({row["itemId"] for row in records}) != EXPECTED_ITEM_COUNT:
        raise RuntimeError("materialized itemId uniqueness mismatch")
    if len({row["sourcePath"] for row in records}) != EXPECTED_ITEM_COUNT:
        raise RuntimeError("materialized sourcePath uniqueness mismatch")
    if len({row["publicPath"] for row in records}) != EXPECTED_ITEM_COUNT:
        raise RuntimeError("materialized publicPath uniqueness mismatch")
    ordered = sorted(records, key=lambda row: row["itemId"])
    return {
        "version": 1,
        "schemaId": "hero-casting-law-material-icon-assets/v1",
        "status": "FROZEN",
        "completion": "COMPLETE",
        "semanticReopen": False,
        "authority": {
            "itemIdentity": "hero-casting-law-materials itemId",
            "lookupKey": "sourcePath",
            "lookupRule": "exact normalized runtime relative path equality",
            "basenameFallback": False,
            "nameJoin": False,
        },
        "source": {
            "kind": "OFFICIAL_INSTALLER",
            "installVersion": package_inventory.get("source", {}).get("installVersion"),
            "packageInventorySha256": package_inventory.get("packageInventorySha256"),
            "packagePart": package["part"],
            "packageName": package["packageName"],
            "bundleEntry": entry["name"],
            "bundleSha256": bundle_sha,
        },
        "summary": {
            "targetCount": EXPECTED_ITEM_COUNT,
            "materializedCount": EXPECTED_ITEM_COUNT,
            "missingCount": 0,
            "duplicateSourcePathCount": 0,
            "publicPathCollisionCount": 0,
        },
        "records": ordered,
        "assetSetSha256": compact_sha([
            {
                "itemId": row["itemId"],
                "sourcePath": row["sourcePath"],
                "publicPath": row["publicPath"],
                "pngBytes": row["pngBytes"],
                "pngSha256": row["pngSha256"],
            }
            for row in ordered
        ]),
    }


def validate_frozen():
    targets = collect_targets()
    manifest = load_json(OUTPUT_PATH)
    if (
        manifest.get("schemaId") != "hero-casting-law-material-icon-assets/v1"
        or manifest.get("status") != "FROZEN"
        or manifest.get("completion") != "COMPLETE"
        or manifest.get("semanticReopen") is not False
    ):
        raise RuntimeError("frozen icon manifest contract mismatch")
    records = manifest.get("records") or []
    if len(records) != EXPECTED_ITEM_COUNT:
        raise RuntimeError("frozen icon manifest population mismatch")

    target_by_id = {row["itemId"]: row for row in targets}
    missing = 0
    size_mismatch = 0
    hash_mismatch = 0
    relation_mismatch = 0
    public_paths = set()
    validation_rows = []

    for row in records:
        target = target_by_id.get(row.get("itemId"))
        if target is None or target["sourcePath"] != row.get("sourcePath") or target["nameCn"] != row.get("nameCn"):
            relation_mismatch += 1
        public_path = row.get("publicPath")
        if not isinstance(public_path, str) or public_path in public_paths:
            relation_mismatch += 1
            continue
        public_paths.add(public_path)
        fs_path = pathlib.Path("public") / public_path.lstrip("/")
        if not fs_path.is_file():
            missing += 1
            continue
        raw = fs_path.read_bytes()
        if len(raw) != row.get("pngBytes"):
            size_mismatch += 1
        if sha256_bytes(raw) != row.get("pngSha256"):
            hash_mismatch += 1
        validation_rows.append({
            "itemId": row["itemId"],
            "sourcePath": row["sourcePath"],
            "publicPath": public_path,
            "pngBytes": len(raw),
            "pngSha256": sha256_bytes(raw),
        })

    status = "PASS" if not (missing or size_mismatch or hash_mismatch or relation_mismatch) else "FAIL"
    summary = {
        "version": 1,
        "domain": "hero-casting-law-material-icon-assets",
        "status": status,
        "targetCount": EXPECTED_ITEM_COUNT,
        "manifestRecordCount": len(records),
        "publicFileCount": len(validation_rows),
        "missingCount": missing,
        "sizeMismatchCount": size_mismatch,
        "hashMismatchCount": hash_mismatch,
        "relationMismatchCount": relation_mismatch,
        "assetSetSha256": manifest.get("assetSetSha256"),
        "hardErrors": [] if status == "PASS" else [
            f"missing={missing}",
            f"sizeMismatch={size_mismatch}",
            f"hashMismatch={hash_mismatch}",
            f"relationMismatch={relation_mismatch}",
        ],
    }
    write_json(SUMMARY_PATH, summary)
    print(json.dumps({
        "checkpoint": "HERO_CASTING_LAW_MATERIAL_ICON_ASSETS",
        **summary,
    }, ensure_ascii=False, indent=2))
    if status != "PASS":
        raise RuntimeError("Casting Law material icon frozen validation failed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--validate-frozen-only", action="store_true")
    args = parser.parse_args()

    if args.write:
        targets = collect_targets()
        packages, inventory = load_packages()
        records, package, entry, bundle_sha = materialize(targets, packages)
        manifest = build_manifest(records, package, entry, bundle_sha, inventory)
        write_json(OUTPUT_PATH, manifest)
        validate_frozen()
        return

    if args.validate_frozen_only:
        validate_frozen()
        return

    raise RuntimeError("use --write or --validate-frozen-only")


if __name__ == "__main__":
    main()
