import binascii
import hashlib
import io
import json
import re
import struct
import urllib.request
import zlib
from pathlib import Path

from PIL import Image
import UnityPy

ROOT = Path.cwd()
IMAGE_DIR = ROOT / "public/images/equipment"
APK_URL = "https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/mz-client-formal-cn.apk"
APK_REF = "https://mz.zlongame.com/main.shtml"
UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"

BUNDLE_BY_ROOT = {
    "UI/Icon/Equip_ABS/": "assets/ExportAssetBundle/ui_icon_equip_abs.b",
    "UI/Icon/Item04_ABS/": "assets/ExportAssetBundle/ui_icon_item04_abs.b",
}

REPRESENTATIVES = {
    6: "Equip_Dagger6",
    59: "Equip_MetalArmor6",
    80: "Equip_MetalHelmet6",
    99: "Equip_Boots4",
    273: "Equip_Sword13",
}

HOLD_PATHS = {
    106: "UI/Icon/Equip_ABS/Equip_Ring6.PNG",
    107: "UI/Icon/Equip_ABS/Equip_Ring7.PNG",
    108: "UI/Icon/Equip_ABS/Equip_Ring8.PNG",
    547: "UI/Icon/Equip_ABS/Equip_LeatherHelmet43.png",
    549: "UI/Icon/Item04_ABS/Equip_Hat55.png",
    550: "UI/Icon/Item04_ABS/Equip_LeatherHelmet43.png",
    621: "UI/Icon/Equip_ABS/Equip_MetalHelmet45.png",
    622: "UI/Icon/Equip_ABS/Equip_Dagger13.png",
    623: "UI/Icon/Equip_ABS/Equip_Spear22.png",
    624: "UI/Icon/Equip_ABS/Equip_MetalArmor39.png",
    625: "UI/Icon/Equip_ABS/Equip_Hat62.png",
    626: "UI/Icon/Equip_ABS/Equip_Attackgem29.png",
    627: "UI/Icon/Equip_ABS/Equip_MetalHelmet46.png",
    628: "UI/Icon/Equip_ABS/Equip_Wand33.png",
    629: "UI/Icon/Equip_ABS/Equip_MetalHelmet47.png",
    630: "UI/Icon/Equip_ABS/Equip_Sword26.png",
    631: "UI/Icon/Equip_ABS/Equip_LeatherArmor28.png",
    632: "UI/Icon/Equip_ABS/Equip_MetalHelmet48.png",
    633: "UI/Icon/Equip_ABS/Equip_Attackgem30.png",
    634: "UI/Icon/Equip_ABS/Equip_MetalHelmet49.png",
    635: "UI/Icon/Equip_ABS/Equip_Sword27.png",
    636: "UI/Icon/Equip_ABS/Equip_Hat63.png",
    637: "UI/Icon/Equip_ABS/Equip_MetalHelmet50.png",
    638: "UI/Icon/Equip_ABS/Equip_Sword28.png",
    639: "UI/Icon/Equip_ABS/Equip_Dagger14.png",
    640: "UI/Icon/Equip_ABS/Equip_LeatherArmor29.png",
    641: "UI/Icon/Equip_ABS/Equip_Hat64.png",
    642: "UI/Icon/Equip_ABS/Equip_Attackgem31.png",
    643: "UI/Icon/Equip_ABS/Equip_MetalHelmet51.png",
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha(path: Path) -> str:
    return sha256(path.read_bytes())


def numeric_pngs():
    return {
        int(path.stem): path
        for path in IMAGE_DIR.glob("*.png")
        if path.stem.isdigit()
    }


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


def load_textures(bundle_bytes: bytes):
    env = UnityPy.load(bundle_bytes)
    textures = {}
    duplicates = []
    for obj in env.objects:
        if obj.type.name != "Texture2D":
            continue
        data = obj.read()
        name = getattr(data, "m_Name", None) or getattr(data, "name", None)
        if not name:
            continue
        if name in textures:
            duplicates.append(name)
        else:
            textures[name] = data
    if duplicates:
        raise RuntimeError(f"duplicate Texture2D names in one bundle: {sorted(set(duplicates))[:20]}")
    return textures


def rgba_pixel_sha(image: Image.Image):
    rgba = image.convert("RGBA")
    return sha256(rgba.tobytes()), rgba.size


def png_bytes(image: Image.Image):
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def source_root(path: str):
    matches = [root for root in BUNDLE_BY_ROOT if path.startswith(root)]
    if len(matches) != 1:
        raise RuntimeError(f"source path does not resolve to exactly one authoritative root: {path}")
    return matches[0]


if len(HOLD_PATHS) != 29:
    raise RuntimeError(f"HOLD mapping must be 29 records, got {len(HOLD_PATHS)}")

stage2_summary_path = ROOT / "data/validation/equipment-image-stage2-acquisition-summary.v1.json"
stage2_summary = json.loads(stage2_summary_path.read_text())
if stage2_summary.get("status") != "PASS_EQUIPMENT_IMAGE_STAGE2_EXACT_SOURCE_ACQUISITION":
    raise RuntimeError(f"unexpected Stage2 subset status: {stage2_summary.get('status')}")
if stage2_summary.get("counts", {}).get("verifiedExactSourceAssets") != 344:
    raise RuntimeError("frozen Stage2 subset is not 344 assets")
if stage2_summary.get("counts", {}).get("unresolvedEquipment") != 29:
    raise RuntimeError("frozen Stage2 subset is not holding exactly 29 assets")

before = numeric_pngs()
hold_ids = set(HOLD_PATHS)
if len(before) != 344:
    raise RuntimeError(f"expected exactly 344 numeric Equipment PNGs before finalization, got {len(before)}")
if hold_ids.intersection(before):
    raise RuntimeError(f"HOLD IDs unexpectedly already present before finalization: {sorted(hold_ids.intersection(before))}")
baseline_sha = {equipment_id: file_sha(path) for equipment_id, path in before.items()}

total, apk_headers = get_total_size()
zip_index = parse_zip_index(total)
missing_entries = [entry for entry in BUNDLE_BY_ROOT.values() if entry not in zip_index]
if missing_entries:
    raise RuntimeError(f"official APK is missing authoritative bundle entries: {missing_entries}")

bundles = {}
bundle_evidence = {}
for root, entry in BUNDLE_BY_ROOT.items():
    raw = fetch_zip_entry(zip_index[entry])
    normalized, prefix_bytes, signature = normalize_unity_bundle(raw)
    textures = load_textures(normalized)
    bundles[root] = textures
    bundle_evidence[root] = {
        "apkEntry": entry,
        "zipMethod": zip_index[entry]["method"],
        "zipCrc32": f"{zip_index[entry]['crc32']:08x}",
        "compressedBytes": zip_index[entry]["compressedSize"],
        "sourceBundleBytes": len(raw),
        "sourceBundleSha256": sha256(raw),
        "unityPayloadOffset": prefix_bytes,
        "unitySignature": signature,
        "texture2DCount": len(textures),
    }
    print(root, json.dumps(bundle_evidence[root], ensure_ascii=False))

representative_checks = []
for equipment_id, texture_name in REPRESENTATIVES.items():
    texture = bundles["UI/Icon/Equip_ABS/"].get(texture_name)
    if texture is None:
        raise RuntimeError(f"representative texture missing: {texture_name}")
    official_sha, official_size = rgba_pixel_sha(texture.image)
    frozen_path = IMAGE_DIR / f"{equipment_id}.png"
    if not frozen_path.exists():
        raise RuntimeError(f"frozen representative PNG missing: {frozen_path}")
    with Image.open(frozen_path) as frozen:
        frozen_sha, frozen_size = rgba_pixel_sha(frozen)
    parity = official_size == frozen_size and official_sha == frozen_sha
    representative_checks.append({
        "equipmentId": equipment_id,
        "texture2DName": texture_name,
        "officialSize": list(official_size),
        "frozenSize": list(frozen_size),
        "officialPixelSha256": official_sha,
        "frozenPixelSha256": frozen_sha,
        "pixelParity": parity,
    })

if not all(item["pixelParity"] for item in representative_checks):
    raise RuntimeError("official APK extraction does not reproduce all 5 frozen representative pixels")

resolved_records = []
for equipment_id, path in HOLD_PATHS.items():
    root = source_root(path)
    basename = path.rsplit("/", 1)[-1]
    texture_name = re.sub(r"\.[^.]+$", "", basename)
    texture = bundles[root].get(texture_name)
    if texture is None:
        raise RuntimeError(
            f"ID {equipment_id}: exact Texture2D {texture_name!r} not found in authoritative bundle {BUNDLE_BY_ROOT[root]}"
        )
    image = texture.image
    pixel_hash, size = rgba_pixel_sha(image)
    if size != (172, 172):
        raise RuntimeError(f"ID {equipment_id}: unexpected texture size {size}")

    raw_png = png_bytes(image)
    target = IMAGE_DIR / f"{equipment_id}.png"
    target.write_bytes(raw_png)
    with Image.open(target) as written:
        written_hash, written_size = rgba_pixel_sha(written)
    if written_size != size or written_hash != pixel_hash:
        raise RuntimeError(f"ID {equipment_id}: repository PNG pixel parity failed")

    resolved_records.append({
        "equipmentId": equipment_id,
        "sourceIconPath": path,
        "sourceRoot": root,
        "officialApkBundleEntry": BUNDLE_BY_ROOT[root],
        "texture2DName": texture_name,
        "texture2DExactNameMatch": True,
        "width": size[0],
        "height": size[1],
        "pixelSha256": pixel_hash,
        "repositoryPath": f"public/images/equipment/{equipment_id}.png",
        "repositoryPngBytes": len(raw_png),
        "repositoryPngSha256": sha256(raw_png),
        "resolutionStatus": "VERIFIED_OFFICIAL_APK_FULL_ROOT_TEXTURE_EXTRACT",
    })

after = numeric_pngs()
if len(after) != 373:
    raise RuntimeError(f"expected exactly 373 numeric Equipment PNGs after finalization, got {len(after)}")
if set(after) != set(before).union(hold_ids):
    missing = sorted(set(before).union(hold_ids) - set(after))
    extra = sorted(set(after) - set(before).union(hold_ids))
    raise RuntimeError(f"final Equipment PNG ID set mismatch; missing={missing}, extra={extra}")

changed_existing = [
    equipment_id
    for equipment_id, old_sha in baseline_sha.items()
    if file_sha(after[equipment_id]) != old_sha
]
if changed_existing:
    raise RuntimeError(f"frozen existing Equipment assets changed: {changed_existing[:30]}")

invalid_png = []
for equipment_id, path in after.items():
    try:
        if path.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError("bad PNG signature")
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            if image.width <= 0 or image.height <= 0:
                raise ValueError(f"non-positive dimensions {image.size}")
    except Exception as exc:
        invalid_png.append({"equipmentId": equipment_id, "error": str(exc)})
if invalid_png:
    raise RuntimeError(f"invalid PNG assets: {invalid_png[:10]}")

evidence = {
    "evidence": "equipment-image-stage2-final373-official-apk-v1",
    "stage": "Equipment Image Stage 2 finalization",
    "status": "PASS_EQUIPMENT_IMAGE_STAGE2_OFFICIAL_APK_HOLD29",
    "sourceAuthority": {
        "officialPage": APK_REF,
        "officialApkUrl": APK_URL,
        "apkBytes": total,
        "apkLastModified": apk_headers.get("Last-Modified"),
        "apkEtag": apk_headers.get("ETag"),
        "method": "HTTP Range ZIP -> exact authoritative root bundle -> exact Texture2D stem -> PNG export",
    },
    "contract": {
        "productionJoinKey": "equipmentId",
        "fullSourcePathAuthorityPreserved": True,
        "basenameOnlyResolutionUsed": False,
        "filenameSimilarityUsed": False,
        "crossRootFallbackUsed": False,
        "visualSimilarityUsed": False,
        "representativePixelParityRequired": True,
        "existing344ImmutableRequired": True,
    },
    "bundles": bundle_evidence,
    "representativePixelParity": representative_checks,
    "heldResolvedCount": len(resolved_records),
    "records": resolved_records,
}

summary = {
    "status": "PASS_EQUIPMENT_IMAGE_STAGE2",
    "completion": "COMPLETE",
    "freezeState": "EQUIPMENT_IMAGE_STAGE2_FROZEN",
    "semanticStageReopened": False,
    "canonicalIdentityChanged": False,
    "productionJoinKey": "equipmentId",
    "counts": {
        "publicEquipment": 373,
        "existingExactSourceAssets": 344,
        "heldEquipment": 29,
        "heldResolved": len(resolved_records),
        "verifiedRepositoryAssets": len(after),
        "representativePixelParity": sum(1 for item in representative_checks if item["pixelParity"]),
        "existingAssetsChanged": len(changed_existing),
        "missing": 0,
        "invalidPng": len(invalid_png),
        "hardErrors": 0,
    },
    "sourceResolution": {
        "caseMismatchResolved": 3,
        "fullPathCollisionResolved": 2,
        "legacyDriveMissingResolved": 24,
        "officialRootBundles": list(BUNDLE_BY_ROOT.values()),
    },
    "hardErrors": [],
    "finalStage2Complete": True,
    "nextStage": "STAGE3_EQUIPMENT_FRONTEND_IMAGE_INTEGRATION_QA",
}

checkpoint = {
    "checkpoint": "equipment-image-stage2-final-v1",
    "status": summary["status"],
    "completion": summary["completion"],
    "freezeState": summary["freezeState"],
    "completedScope": "public Equipment image assets 373/373",
    "confirmedJoinKey": "equipmentId",
    "confirmedSourceRoots": list(BUNDLE_BY_ROOT),
    "confirmedOfficialApkBundles": list(BUNDLE_BY_ROOT.values()),
    "frozenExistingSubset": 344,
    "resolvedHeldSubset": 29,
    "repositoryAssets": 373,
    "nextStartPoint": "Stage 3 Equipment frontend image integration and Hosted QA; do not reopen Stage 2 source resolution without integrity/regression evidence.",
}

(ROOT / "data/evidence").mkdir(parents=True, exist_ok=True)
(ROOT / "data/validation").mkdir(parents=True, exist_ok=True)
(ROOT / "data/checkpoints").mkdir(parents=True, exist_ok=True)
(ROOT / "data/evidence/equipment-image-stage2-final373-official-apk.v1.json").write_text(
    json.dumps(evidence, ensure_ascii=False, indent=2) + "\n"
)
(ROOT / "data/validation/equipment-image-stage2-final-summary.v1.json").write_text(
    json.dumps(summary, ensure_ascii=False, indent=2) + "\n"
)
(ROOT / "data/checkpoints/equipment-image-stage2-final.v1.json").write_text(
    json.dumps(checkpoint, ensure_ascii=False, indent=2) + "\n"
)

print(json.dumps(summary, ensure_ascii=False, indent=2))
