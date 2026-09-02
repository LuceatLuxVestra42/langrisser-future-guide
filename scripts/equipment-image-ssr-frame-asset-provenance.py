import binascii
import hashlib
import io
import json
import re
import struct
import urllib.request
import zlib
from collections import Counter
from pathlib import Path

from PIL import Image
import UnityPy

ROOT = Path.cwd()
APK_URL = "https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/mz-client-formal-cn.apk"
APK_REF = "https://mz.zlongame.com/main.shtml"
UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"
TARGET_SOURCE_PATH = "UI/Common_New_ABS/Border_Icon_Colour.png"
TARGET_ROOT = "UI/Common_New_ABS/"
TARGET_OBJECT_NAME = "Border_Icon_Colour"
CONFIG_PATH = ROOT / "data/configdata/ConfigDataEquipmentInfo.json"
FROZEN_CHECKPOINT = ROOT / "data/checkpoints/equipment-image-stage2-final.v3.json"
PUBLIC_IMAGE_DIR = ROOT / "public/images/equipment"
TRACE_REPORT = ROOT / "artifacts/equipment-ssr-frame-provenance-v2.json"
OUTPUT_REPORT = ROOT / "artifacts/equipment-ssr-frame-asset-provenance.v1.json"
PREVIEW_DIR = ROOT / "artifacts/equipment-ssr-frame-previews"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def png_bytes(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.convert("RGBA").save(out, format="PNG")
    return out.getvalue()


def get_range(start: int, end: int):
    req = urllib.request.Request(
        APK_URL,
        headers={
            "User-Agent": UA,
            "Referer": APK_REF,
            "Range": f"bytes={start}-{end}",
        },
    )
    with urllib.request.urlopen(req, timeout=180) as response:
        data = response.read()
        expected = end - start + 1
        if len(data) != expected:
            raise RuntimeError(
                f"range {start}-{end}: got {len(data)} bytes, expected {expected}, "
                f"status={response.status}, Content-Range={response.headers.get('Content-Range')}"
            )
        return data, response.headers


def get_total_size():
    _, headers = get_range(0, 1023)
    match = re.search(r"/([0-9]+)$", headers.get("Content-Range", ""))
    if not match:
        raise RuntimeError(f"No total in Content-Range: {headers.get('Content-Range')}")
    return int(match.group(1)), headers


def parse_zip_index(total: int):
    tail_start = max(0, total - 1024 * 1024)
    tail, _ = get_range(tail_start, total - 1)
    pos = tail.rfind(b"PK\x05\x06")
    if pos < 0:
        raise RuntimeError("EOCD not found")

    eocd_off = tail_start + pos
    eocd = tail[pos : pos + 22]
    _, _, _, total_entries, cd_size32, cd_off32, _ = struct.unpack_from("<HHHHIIH", eocd, 4)
    cd_size, cd_off = cd_size32, cd_off32

    if total_entries == 0xFFFF or cd_size32 == 0xFFFFFFFF or cd_off32 == 0xFFFFFFFF:
        locator, _ = get_range(eocd_off - 20, eocd_off - 1)
        if locator[:4] != b"PK\x06\x07":
            raise RuntimeError("Zip64 locator missing")
        zip64_eocd_off = struct.unpack_from("<Q", locator, 8)[0]
        zip64_eocd, _ = get_range(zip64_eocd_off, zip64_eocd_off + 55)
        if zip64_eocd[:4] != b"PK\x06\x06":
            raise RuntimeError("Zip64 EOCD missing")
        total_entries = struct.unpack_from("<Q", zip64_eocd, 32)[0]
        cd_size = struct.unpack_from("<Q", zip64_eocd, 40)[0]
        cd_off = struct.unpack_from("<Q", zip64_eocd, 48)[0]

    cd, _ = get_range(cd_off, cd_off + cd_size - 1)
    entries = {}
    i = 0
    while i + 46 <= len(cd):
        if cd[i : i + 4] != b"PK\x01\x02":
            raise RuntimeError(f"bad central header at {i}")
        method = struct.unpack_from("<H", cd, i + 10)[0]
        crc = struct.unpack_from("<I", cd, i + 16)[0]
        compressed = struct.unpack_from("<I", cd, i + 20)[0]
        uncompressed = struct.unpack_from("<I", cd, i + 24)[0]
        fn, ex, cm = struct.unpack_from("<HHH", cd, i + 28)
        local_off = struct.unpack_from("<I", cd, i + 42)[0]
        raw_name = cd[i + 46 : i + 46 + fn]
        try:
            name = raw_name.decode("utf-8")
        except UnicodeDecodeError:
            name = raw_name.decode("cp437")
        extra = cd[i + 46 + fn : i + 46 + fn + ex]

        if compressed == 0xFFFFFFFF or uncompressed == 0xFFFFFFFF or local_off == 0xFFFFFFFF:
            p = 0
            while p + 4 <= len(extra):
                tag, size = struct.unpack_from("<HH", extra, p)
                payload = extra[p + 4 : p + 4 + size]
                if tag == 0x0001:
                    q = 0
                    if uncompressed == 0xFFFFFFFF:
                        uncompressed = struct.unpack_from("<Q", payload, q)[0]
                        q += 8
                    if compressed == 0xFFFFFFFF:
                        compressed = struct.unpack_from("<Q", payload, q)[0]
                        q += 8
                    if local_off == 0xFFFFFFFF:
                        local_off = struct.unpack_from("<Q", payload, q)[0]
                    break
                p += 4 + size

        entries[name] = {
            "method": method,
            "crc32": crc,
            "compressedSize": compressed,
            "uncompressedSize": uncompressed,
            "localOffset": local_off,
        }
        i += 46 + fn + ex + cm

    if len(entries) != total_entries:
        raise RuntimeError(f"ZIP entry count mismatch: parsed={len(entries)} reported={total_entries}")
    return entries


def fetch_zip_entry(meta):
    local, _ = get_range(meta["localOffset"], meta["localOffset"] + 29)
    if local[:4] != b"PK\x03\x04":
        raise RuntimeError("bad local header")
    fn, ex = struct.unpack_from("<HH", local, 26)
    data_start = meta["localOffset"] + 30 + fn + ex
    compressed, _ = get_range(data_start, data_start + meta["compressedSize"] - 1)
    if meta["method"] == 0:
        raw = compressed
    elif meta["method"] == 8:
        raw = zlib.decompress(compressed, -15)
    else:
        raise RuntimeError(f"unsupported ZIP method {meta['method']}")
    if len(raw) != meta["uncompressedSize"]:
        raise RuntimeError(f"uncompressed size mismatch {len(raw)} != {meta['uncompressedSize']}")
    if (binascii.crc32(raw) & 0xFFFFFFFF) != meta["crc32"]:
        raise RuntimeError("ZIP CRC mismatch")
    return raw


def normalize_unity_bundle(raw: bytes):
    for signature in (b"UnityFS", b"UnityWeb", b"UnityRaw"):
        pos = raw.find(signature, 0, 256)
        if pos >= 0:
            return raw[pos:], pos, signature.decode("ascii")
    raise RuntimeError(f"Unity bundle signature not found in first 256 bytes: {raw[:32].hex()}")


def all_offsets(data: bytes, needle: bytes, limit=100):
    hits = []
    start = 0
    while len(hits) < limit:
        pos = data.find(needle, start)
        if pos < 0:
            break
        hits.append(pos)
        start = pos + 1
    return hits


def selected_equipment_fields(record):
    return {
        "ID": int(record["ID"]),
        "Rank": int(record["Rank"]),
        "Icon": record.get("Icon"),
    }


def inspect_configdata():
    checkpoint = json.loads(FROZEN_CHECKPOINT.read_text(encoding="utf-8"))
    if checkpoint.get("status") != "PASS_EQUIPMENT_IMAGE_STAGE2":
        raise RuntimeError(f"unexpected frozen Equipment image checkpoint: {checkpoint.get('status')}")
    if checkpoint.get("completion") != "COMPLETE" or checkpoint.get("freezeState") != "EQUIPMENT_IMAGE_STAGE2_FROZEN":
        raise RuntimeError("Equipment image predecessor is not frozen COMPLETE")

    payload = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    rows = payload.get("Data") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise RuntimeError("ConfigDataEquipmentInfo does not expose a Data list")

    by_id = {}
    rank_counts_all = Counter()
    for record in rows:
        if not isinstance(record, dict) or "ID" not in record or "Rank" not in record:
            continue
        equipment_id = int(record["ID"])
        if equipment_id in by_id:
            raise RuntimeError(f"duplicate ConfigDataEquipmentInfo ID {equipment_id}")
        by_id[equipment_id] = record
        rank_counts_all[int(record["Rank"])] += 1

    public_ids = sorted(
        int(path.stem)
        for path in PUBLIC_IMAGE_DIR.glob("*.png")
        if path.stem.isdigit()
    )
    if len(public_ids) != 373 or len(set(public_ids)) != 373:
        raise RuntimeError(f"frozen public Equipment image population drifted: {len(public_ids)}")

    missing_ids = [equipment_id for equipment_id in public_ids if equipment_id not in by_id]
    if missing_ids:
        raise RuntimeError(f"public Equipment IDs missing from ConfigDataEquipmentInfo: {missing_ids[:20]}")

    public_records = [by_id[equipment_id] for equipment_id in public_ids]
    rank_counts_public = Counter(int(record["Rank"]) for record in public_records)
    rank4 = [selected_equipment_fields(record) for record in public_records if int(record["Rank"]) == 4]
    rank5 = [selected_equipment_fields(record) for record in public_records if int(record["Rank"]) == 5]

    if not rank4:
        raise RuntimeError("current 373 Equipment population contains no explicit Rank=4 records")

    return {
        "configPath": str(CONFIG_PATH.relative_to(ROOT)),
        "joinKey": "ID/equipmentId",
        "joinMethod": "exact numeric ID only",
        "publicPopulation": len(public_ids),
        "configPopulationWithIdAndRank": len(by_id),
        "allRankCounts": {str(k): v for k, v in sorted(rank_counts_all.items())},
        "publicRankCounts": {str(k): v for k, v in sorted(rank_counts_public.items())},
        "rank4PublicCount": len(rank4),
        "rank4PublicEquipment": rank4,
        "rank5PublicCount": len(rank5),
        "rank5PublicEquipment": rank5,
        "missingPublicIds": missing_ids,
        "semanticBoundary": {
            "nameJoinUsed": False,
            "idArithmeticUsed": False,
            "filenameSimilarityUsedForRank": False,
            "rankReadDirectlyFromConfigDataEquipmentInfo": True,
        },
    }


def object_identity(reader, data):
    path_id = getattr(reader, "path_id", None)
    if path_id is None:
        path_id = getattr(reader, "m_PathID", None)
    name = getattr(data, "m_Name", None) or getattr(data, "name", None)
    return {
        "pathId": path_id,
        "type": reader.type.name,
        "name": name,
    }


def decode_image(reader, data, bundle_tag: str):
    try:
        image = data.image
        rgba = image.convert("RGBA")
    except Exception as exc:
        return {
            **object_identity(reader, data),
            "decoded": False,
            "decodeError": f"{type(exc).__name__}: {exc}",
        }

    raw_rgba = rgba.tobytes()
    encoded = png_bytes(rgba)
    path_id = getattr(reader, "path_id", None)
    if path_id is None:
        path_id = getattr(reader, "m_PathID", "unknown")
    safe_type = re.sub(r"[^A-Za-z0-9_.-]+", "_", reader.type.name)
    preview_name = f"{bundle_tag}--{safe_type}--{path_id}.png"
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    preview_path = PREVIEW_DIR / preview_name
    preview_path.write_bytes(encoded)

    return {
        **object_identity(reader, data),
        "decoded": True,
        "width": rgba.width,
        "height": rgba.height,
        "sourceBands": list(image.getbands()),
        "hasAlpha": "A" in image.getbands(),
        "pixelSha256": sha256(raw_rgba),
        "pngSha256": sha256(encoded),
        "pngBytes": len(encoded),
        "previewPath": str(preview_path.relative_to(ROOT)),
        "textureFormatCode": int(getattr(data, "m_TextureFormat", -1)) if hasattr(data, "m_TextureFormat") else None,
        "mipCount": int(getattr(data, "m_MipCount", -1)) if hasattr(data, "m_MipCount") else None,
    }


def inspect_bundle(entry_name, meta):
    raw_bundle = fetch_zip_entry(meta)
    normalized, payload_offset, unity_signature = normalize_unity_bundle(raw_bundle)
    exact_path_bytes = TARGET_SOURCE_PATH.encode("utf-8")
    lower_path_bytes = TARGET_SOURCE_PATH.lower().encode("utf-8")
    exact_path_offsets = all_offsets(normalized, exact_path_bytes)
    lower_path_offsets = all_offsets(normalized.lower(), lower_path_bytes)

    env = UnityPy.load(normalized)
    bundle_tag = re.sub(r"[^A-Za-z0-9_.-]+", "_", Path(entry_name).name)

    exact_container = []
    casefold_container = []
    try:
        container_items = list(env.container.items())
    except Exception as exc:
        container_items = []
        container_error = f"{type(exc).__name__}: {exc}"
    else:
        container_error = None

    container_by_path_id = {}
    for key, reader in container_items:
        key_text = str(key)
        path_id = getattr(reader, "path_id", None)
        container_by_path_id.setdefault(path_id, []).append(key_text)
        record = {
            "key": key_text,
            "pathId": path_id,
            "type": reader.type.name,
        }
        if key_text == TARGET_SOURCE_PATH:
            exact_container.append(record)
        elif key_text.lower() == TARGET_SOURCE_PATH.lower():
            casefold_container.append(record)

    exact_objects = []
    for reader in env.objects:
        if reader.type.name not in {"Sprite", "Texture2D"}:
            continue
        try:
            data = reader.read()
        except Exception:
            continue
        name = getattr(data, "m_Name", None) or getattr(data, "name", None)
        if name != TARGET_OBJECT_NAME:
            continue
        decoded = decode_image(reader, data, bundle_tag)
        decoded["containerKeys"] = container_by_path_id.get(decoded.get("pathId"), [])
        exact_objects.append(decoded)

    return {
        "apkEntry": entry_name,
        "zipMethod": meta["method"],
        "zipCrc32": f"{meta['crc32']:08x}",
        "sourceBundleBytes": len(raw_bundle),
        "sourceBundleSha256": sha256(raw_bundle),
        "unityPayloadOffset": payload_offset,
        "unitySignature": unity_signature,
        "exactSourcePathByteOffsets": exact_path_offsets,
        "caseFoldedSourcePathByteOffsets": lower_path_offsets,
        "containerError": container_error,
        "exactContainerMatches": exact_container,
        "caseFoldedContainerMatches": casefold_container,
        "exactObjectMatches": exact_objects,
    }


def extract_static_rank_evidence():
    if not TRACE_REPORT.exists():
        raise RuntimeError(f"missing predecessor trace report: {TRACE_REPORT}")
    trace = json.loads(TRACE_REPORT.read_text(encoding="utf-8"))
    rank4 = next((record for record in trace.get("fallbackRankTable", []) if int(record.get("rank", -1)) == 4), None)
    if not rank4:
        raise RuntimeError("rank 4 fallback record missing from predecessor trace")
    literals = [record.get("literal") for record in rank4.get("literalCandidates", [])]
    if TARGET_SOURCE_PATH not in literals:
        raise RuntimeError(f"rank 4 fallback did not resolve to target source path: {literals}")
    return {
        "targetMethod": trace.get("targetMethod"),
        "rank4Fallback": rank4,
        "rank4SourcePath": TARGET_SOURCE_PATH,
        "rank4SourcePathResolvedByRelocation": True,
    }


def main():
    static_rank_evidence = extract_static_rank_evidence()
    config_evidence = inspect_configdata()

    total, headers = get_total_size()
    entries = parse_zip_index(total)
    all_common_new = sorted(
        name for name in entries
        if name.startswith("assets/ExportAssetBundle/") and "common_new" in Path(name).name.lower()
    )
    exact_root_candidate_names = {
        "begin_ui_common_new_abs.b",
        "ui_common_new_abs.b",
    }
    exact_root_candidates = [
        name for name in all_common_new
        if Path(name).name.lower() in exact_root_candidate_names
    ]
    candidate_mode = "EXACT_ROOT_NORMALIZED_LOCATOR"
    candidates = exact_root_candidates
    if not candidates:
        candidate_mode = "BROAD_COMMON_NEW_LOCATOR_REVIEW"
        candidates = all_common_new

    if not candidates:
        raise RuntimeError("official APK contains no Common_New AssetBundle locator candidates")

    inspected = [inspect_bundle(name, entries[name]) for name in candidates]
    target_bundles = [
        record for record in inspected
        if record["exactObjectMatches"]
        and (record["exactSourcePathByteOffsets"] or record["exactContainerMatches"])
    ]

    decoded_by_type = {}
    for bundle in target_bundles:
        for obj in bundle["exactObjectMatches"]:
            if not obj.get("decoded"):
                continue
            decoded_by_type.setdefault(obj["type"], []).append({
                "apkEntry": bundle["apkEntry"],
                "pixelSha256": obj["pixelSha256"],
                "pngSha256": obj["pngSha256"],
                "width": obj["width"],
                "height": obj["height"],
            })

    divergent_types = {
        object_type: records
        for object_type, records in decoded_by_type.items()
        if len({record["pixelSha256"] for record in records}) > 1
    }

    exact_container_bundle_count = sum(bool(record["exactContainerMatches"]) for record in target_bundles)
    exact_path_byte_bundle_count = sum(bool(record["exactSourcePathByteOffsets"]) for record in target_bundles)
    decoded_match_count = sum(
        1 for bundle in target_bundles for obj in bundle["exactObjectMatches"] if obj.get("decoded")
    )

    if divergent_types:
        status = "BLOCKED_DIVERGENT_EXACT_SOURCE_ASSETS"
    elif not target_bundles or decoded_match_count == 0:
        status = "REVIEW_EXACT_SOURCE_ASSET_NOT_RESOLVED"
    else:
        status = "PASS_EXACT_SSR_FRAME_ASSET_PROVENANCE"

    report = {
        "schemaId": "equipment-ssr-frame-asset-provenance/v1",
        "status": status,
        "sourceAuthority": {
            "officialPage": APK_REF,
            "officialApkUrl": APK_URL,
            "apkBytes": total,
            "lastModified": headers.get("Last-Modified"),
            "etag": headers.get("ETag"),
        },
        "semanticProof": static_rank_evidence,
        "configDataProof": config_evidence,
        "target": {
            "rank": 4,
            "sourcePath": TARGET_SOURCE_PATH,
            "sourceRoot": TARGET_ROOT,
            "objectName": TARGET_OBJECT_NAME,
        },
        "bundleDiscovery": {
            "candidateSelectionMode": candidate_mode,
            "candidatePathsAreSemanticEvidence": False,
            "allCommonNewLocatorCandidates": all_common_new,
            "inspectedCandidates": candidates,
        },
        "bundleEvidence": inspected,
        "resolution": {
            "resolvedBundleCount": len(target_bundles),
            "exactContainerBundleCount": exact_container_bundle_count,
            "exactPathByteBundleCount": exact_path_byte_bundle_count,
            "decodedExactObjectCount": decoded_match_count,
            "divergentObjectTypes": divergent_types,
            "resolvedBundles": [record["apkEntry"] for record in target_bundles],
        },
        "boundaries": {
            "productionEquipmentAssetsMutated": False,
            "canonicalEquipmentMutated": False,
            "sourcePathFromRuntimeRelocation": True,
            "bundleFilenameUsedOnlyAsLocator": True,
            "exactObjectNameRequired": True,
            "exactPathOrContainerEvidenceRequired": True,
            "crossRootFallbackUsed": False,
            "nameJoinUsed": False,
            "idArithmeticUsed": False,
        },
    }

    OUTPUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": status,
        "configDataProof": {
            "publicPopulation": config_evidence["publicPopulation"],
            "publicRankCounts": config_evidence["publicRankCounts"],
            "rank4PublicCount": config_evidence["rank4PublicCount"],
            "rank5PublicCount": config_evidence["rank5PublicCount"],
        },
        "bundleDiscovery": report["bundleDiscovery"],
        "resolution": report["resolution"],
        "targetBundleSummaries": [
            {
                "apkEntry": record["apkEntry"],
                "exactPathByteOffsets": record["exactSourcePathByteOffsets"],
                "exactContainerMatches": record["exactContainerMatches"],
                "exactObjectMatches": record["exactObjectMatches"],
            }
            for record in target_bundles
        ],
    }, ensure_ascii=False, indent=2))

    if status.startswith("BLOCKED_"):
        raise SystemExit(2)
    if status.startswith("REVIEW_"):
        raise SystemExit(3)


if __name__ == "__main__":
    main()
