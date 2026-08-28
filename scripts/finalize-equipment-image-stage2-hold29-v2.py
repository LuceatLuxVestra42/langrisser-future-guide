import binascii
import hashlib
import io
import json
import os
import re
import struct
import tempfile
import urllib.request
import zlib
from pathlib import Path

from PIL import Image
import UnityPy

ROOT = Path.cwd()
IMAGE_DIR = ROOT / "public/images/equipment"
STAGE1_CONTRACT = ROOT / "data/contracts/equipment-image-stage1-representative-proof.v1.json"
STAGE2_SUBSET_SUMMARY = ROOT / "data/validation/equipment-image-stage2-acquisition-summary.v1.json"
STAGE2_SUBSET_EVIDENCE = ROOT / "data/evidence/equipment-image-stage2-source-evidence.v1.json"

APK_URL = "https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/mz-client-formal-cn.apk"
APK_REF = "https://mz.zlongame.com/main.shtml"
UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"

# Verified by the successful APK bundle diagnostic: the non-begin ui_icon_* bundles
# are small incremental bundles, while begin_ui_icon_* contains the authoritative
# full root population used by ConfigDataEquipmentInfo.Icon.
BUNDLE_BY_ROOT = {
    "UI/Icon/Equip_ABS/": "assets/ExportAssetBundle/begin_ui_icon_equip_abs.b",
    "UI/Icon/Item04_ABS/": "assets/ExportAssetBundle/begin_ui_icon_item04_abs.b",
}

CASE_MISMATCH_STATUS = "REVIEW_CASE_MISMATCH"
COLLISION_STATUS = "BLOCKED_BASENAME_COLLISION_REQUIRES_EXACT_PATH_EVIDENCE"
MISSING_STATUS = "MISSING_IN_LEGACY_DRIVE"


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


def rgba_pixel_info(image: Image.Image):
    has_alpha = "A" in image.getbands()
    rgba = image.convert("RGBA")
    return {
        "pixelSha256": sha256(rgba.tobytes()),
        "size": rgba.size,
        "hasAlpha": has_alpha,
    }


def png_bytes(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.convert("RGBA").save(out, format="PNG")
    return out.getvalue()


def inspect_png_bytes(data: bytes):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("bad PNG signature")
    with Image.open(io.BytesIO(data)) as probe:
        probe.verify()
    with Image.open(io.BytesIO(data)) as image:
        info = rgba_pixel_info(image)
        if image.width <= 0 or image.height <= 0:
            raise RuntimeError(f"non-positive PNG dimensions: {image.size}")
        return {
            "width": image.width,
            "height": image.height,
            "hasAlpha": "A" in image.getbands(),
            "pixelSha256": info["pixelSha256"],
            "pngSha256": sha256(data),
            "bytes": len(data),
        }


def source_root(path: str) -> str:
    roots = [root for root in BUNDLE_BY_ROOT if path.startswith(root)]
    if len(roots) != 1:
        raise RuntimeError(f"source path does not resolve to exactly one authoritative root: {path}")
    return roots[0]


def texture_name_from_locator(path: str) -> str:
    basename = path.rsplit("/", 1)[-1]
    return re.sub(r"\.[^.]+$", "", basename)


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


# Frozen predecessor checks.
stage1 = json.loads(STAGE1_CONTRACT.read_text())
subset = json.loads(STAGE2_SUBSET_SUMMARY.read_text())
prior_evidence = json.loads(STAGE2_SUBSET_EVIDENCE.read_text())

if subset.get("status") != "PASS_EQUIPMENT_IMAGE_STAGE2_EXACT_SOURCE_ACQUISITION":
    raise RuntimeError(f"unexpected Stage 2 subset status: {subset.get('status')}")
counts = subset.get("counts", {})
if counts.get("verifiedExactSourceAssets") != 344 or counts.get("unresolvedEquipment") != 29:
    raise RuntimeError(f"frozen Stage 2 subset drifted: {counts}")
if subset.get("productionJoinKey") != "equipmentId":
    raise RuntimeError("Stage 2 productionJoinKey drifted")
if len(prior_evidence.get("records", [])) != 344:
    raise RuntimeError("existing Stage 2 source evidence is not exactly 344 records")

holds = subset.get("unresolved", [])
if len(holds) != 29:
    raise RuntimeError(f"expected 29 HOLD records, got {len(holds)}")
hold_ids = [int(record["equipmentId"]) for record in holds]
if len(set(hold_ids)) != 29:
    raise RuntimeError("duplicate equipmentId in HOLD29 input")

status_counts = {
    CASE_MISMATCH_STATUS: sum(1 for item in holds if item.get("status") == CASE_MISMATCH_STATUS),
    COLLISION_STATUS: sum(1 for item in holds if item.get("status") == COLLISION_STATUS),
    MISSING_STATUS: sum(1 for item in holds if item.get("status") == MISSING_STATUS),
}
if status_counts != {
    CASE_MISMATCH_STATUS: 3,
    COLLISION_STATUS: 2,
    MISSING_STATUS: 24,
}:
    raise RuntimeError(f"HOLD29 reason counts drifted: {status_counts}")

for record in holds:
    source_root(record["sourceIconPath"])

collision_records = [record for record in holds if record.get("status") == COLLISION_STATUS]
if {int(record["equipmentId"]) for record in collision_records} != {547, 550}:
    raise RuntimeError("collision fixture IDs are no longer exactly 547/550")
if len({record["sourceIconPath"].rsplit("/", 1)[-1] for record in collision_records}) != 1:
    raise RuntimeError("collision fixture no longer shares one basename")
if len({source_root(record["sourceIconPath"]) for record in collision_records}) != 2:
    raise RuntimeError("collision fixture no longer resolves through two distinct full roots")

item04_ids = {
    int(record["equipmentId"])
    for record in holds
    if source_root(record["sourceIconPath"]) == "UI/Icon/Item04_ABS/"
}
if item04_ids != {549, 550}:
    raise RuntimeError(f"Item04 HOLD fixture drifted: {sorted(item04_ids)}")

before = numeric_pngs()
if len(before) != 344:
    raise RuntimeError(f"expected exactly 344 numeric Equipment PNGs before finalization, got {len(before)}")
if set(hold_ids).intersection(before):
    raise RuntimeError(f"HOLD IDs unexpectedly already present: {sorted(set(hold_ids).intersection(before))}")
baseline_sha = {equipment_id: file_sha(path) for equipment_id, path in before.items()}
prior_evidence_ids = {int(record["equipmentId"]) for record in prior_evidence["records"]}
if prior_evidence_ids != set(before):
    raise RuntimeError("existing 344 evidence ID set does not match repository PNG ID set")

# Read only the two authoritative APK entries by HTTP Range.
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

# Stage 2-H0: official APK decoder proof against five already-frozen Stage 1 images.
representatives = stage1.get("representatives", [])
if len(representatives) != 5:
    raise RuntimeError(f"Stage 1 representative contract must contain 5 fixtures, got {len(representatives)}")

representative_checks = []
for fixture in representatives:
    equipment_id = int(fixture["equipmentId"])
    locator = fixture["sourceIconPath"]
    root = source_root(locator)
    texture_name = texture_name_from_locator(locator)
    texture = bundles[root].get(texture_name)
    if texture is None:
        raise RuntimeError(
            f"representative ID {equipment_id}: exact Texture2D {texture_name!r} missing from {BUNDLE_BY_ROOT[root]}"
        )

    official_info = rgba_pixel_info(texture.image)
    frozen_path = ROOT / fixture["targetRepositoryPath"]
    if not frozen_path.exists():
        raise RuntimeError(f"representative ID {equipment_id}: frozen PNG missing")
    with Image.open(frozen_path) as frozen:
        frozen_info = rgba_pixel_info(frozen)

    pixel_parity = (
        official_info["size"] == frozen_info["size"]
        and official_info["pixelSha256"] == frozen_info["pixelSha256"]
    )
    alpha_parity = official_info["hasAlpha"] == frozen_info["hasAlpha"]
    passed = pixel_parity and alpha_parity

    representative_checks.append({
        "equipmentId": equipment_id,
        "sourceIconPath": locator,
        "sourceRoot": root,
        "officialApkBundleEntry": BUNDLE_BY_ROOT[root],
        "texture2DName": texture_name,
        "officialSize": list(official_info["size"]),
        "frozenSize": list(frozen_info["size"]),
        "officialPixelSha256": official_info["pixelSha256"],
        "frozenPixelSha256": frozen_info["pixelSha256"],
        "officialHasAlpha": official_info["hasAlpha"],
        "frozenHasAlpha": frozen_info["hasAlpha"],
        "pixelParity": pixel_parity,
        "alphaParity": alpha_parity,
        "passed": passed,
    })

if not all(item["passed"] for item in representative_checks):
    raise RuntimeError("official APK decoder proof failed: representative 5/5 parity not achieved")

# Stage 2-H1/H2/H3: resolve all 29 in a staging directory. Nothing is promoted until all pass.
staged_records = []
with tempfile.TemporaryDirectory(prefix=".equipment-image-stage2-hold29-", dir=ROOT) as tmp:
    staging = Path(tmp)

    for record in holds:
        equipment_id = int(record["equipmentId"])
        locator = record["sourceIconPath"]
        root = source_root(locator)
        texture_name = texture_name_from_locator(locator)
        texture = bundles[root].get(texture_name)
        if texture is None:
            raise RuntimeError(
                f"ID {equipment_id}: exact Texture2D {texture_name!r} not found in {BUNDLE_BY_ROOT[root]}"
            )

        image = texture.image.convert("RGBA")
        source_info = rgba_pixel_info(image)
        if source_info["size"] != (172, 172):
            raise RuntimeError(f"ID {equipment_id}: unexpected texture size {source_info['size']}")

        raw_png = png_bytes(image)
        png_info = inspect_png_bytes(raw_png)
        if (png_info["width"], png_info["height"]) != (172, 172):
            raise RuntimeError(f"ID {equipment_id}: staged PNG dimension mismatch")
        if not png_info["hasAlpha"]:
            raise RuntimeError(f"ID {equipment_id}: staged PNG lost alpha channel")
        if png_info["pixelSha256"] != source_info["pixelSha256"]:
            raise RuntimeError(f"ID {equipment_id}: staged PNG pixel parity failed")

        staged_path = staging / f"{equipment_id}.png"
        staged_path.write_bytes(raw_png)

        staged_records.append({
            "equipmentId": equipment_id,
            "previousHoldStatus": record["status"],
            "sourceIconPath": locator,
            "sourceRoot": root,
            "officialApkBundleEntry": BUNDLE_BY_ROOT[root],
            "texture2DName": texture_name,
            "texture2DExactNameMatch": True,
            "width": png_info["width"],
            "height": png_info["height"],
            "hasAlpha": png_info["hasAlpha"],
            "pixelSha256": png_info["pixelSha256"],
            "repositoryPath": f"public/images/equipment/{equipment_id}.png",
            "repositoryPngBytes": png_info["bytes"],
            "repositoryPngSha256": png_info["pngSha256"],
            "resolutionStatus": "VERIFIED_OFFICIAL_APK_FULL_ROOT_TEXTURE_EXTRACT",
        })

    staged_ids = {int(path.stem) for path in staging.glob("*.png") if path.stem.isdigit()}
    if staged_ids != set(hold_ids):
        raise RuntimeError(
            f"staging ID set mismatch; missing={sorted(set(hold_ids)-staged_ids)} "
            f"extra={sorted(staged_ids-set(hold_ids))}"
        )

    # Permanent regression fixture for same-basename/different-root collision.
    by_id = {record["equipmentId"]: record for record in staged_records}
    collision_fixture = {
        "equipmentIds": [547, 550],
        "sameTexture2DName": by_id[547]["texture2DName"] == by_id[550]["texture2DName"],
        "distinctSourceRoots": by_id[547]["sourceRoot"] != by_id[550]["sourceRoot"],
        "distinctBundleEntries": by_id[547]["officialApkBundleEntry"] != by_id[550]["officialApkBundleEntry"],
        "records": [
            {
                "equipmentId": 547,
                "sourceIconPath": by_id[547]["sourceIconPath"],
                "sourceRoot": by_id[547]["sourceRoot"],
                "bundle": by_id[547]["officialApkBundleEntry"],
                "texture2DName": by_id[547]["texture2DName"],
                "pixelSha256": by_id[547]["pixelSha256"],
            },
            {
                "equipmentId": 550,
                "sourceIconPath": by_id[550]["sourceIconPath"],
                "sourceRoot": by_id[550]["sourceRoot"],
                "bundle": by_id[550]["officialApkBundleEntry"],
                "texture2DName": by_id[550]["texture2DName"],
                "pixelSha256": by_id[550]["pixelSha256"],
            },
        ],
    }
    if not (
        collision_fixture["sameTexture2DName"]
        and collision_fixture["distinctSourceRoots"]
        and collision_fixture["distinctBundleEntries"]
    ):
        raise RuntimeError(f"547/550 collision fixture failed: {collision_fixture}")

    # Stage 2-H4: promote only after all 29 staged files and collision rules passed.
    for equipment_id in sorted(hold_ids):
        staged_path = staging / f"{equipment_id}.png"
        target = IMAGE_DIR / f"{equipment_id}.png"
        target.write_bytes(staged_path.read_bytes())

# Stage 2-H5/H6: final repository verification and immutable-344 regression.
after = numeric_pngs()
expected_ids = set(before).union(hold_ids)
if len(after) != 373 or set(after) != expected_ids:
    missing = sorted(expected_ids - set(after))
    extra = sorted(set(after) - expected_ids)
    raise RuntimeError(f"final Equipment PNG set mismatch; count={len(after)} missing={missing} extra={extra}")

changed_existing = [
    equipment_id
    for equipment_id, old_sha in baseline_sha.items()
    if file_sha(after[equipment_id]) != old_sha
]
if changed_existing:
    raise RuntimeError(f"frozen existing 344 assets changed: {changed_existing[:30]}")

invalid_png = []
for equipment_id, path in after.items():
    try:
        inspect_png_bytes(path.read_bytes())
    except Exception as exc:
        invalid_png.append({"equipmentId": equipment_id, "error": str(exc)})
if invalid_png:
    raise RuntimeError(f"invalid PNG assets: {invalid_png[:10]}")

for record in staged_records:
    target = ROOT / record["repositoryPath"]
    final_info = inspect_png_bytes(target.read_bytes())
    if (
        final_info["pngSha256"] != record["repositoryPngSha256"]
        or final_info["pixelSha256"] != record["pixelSha256"]
    ):
        raise RuntimeError(f"ID {record['equipmentId']}: staged-to-repository parity failed")

evidence = {
    "evidence": "equipment-image-stage2-final373-official-apk-v2",
    "stage": "Equipment Image Stage 2 finalization",
    "status": "PASS_EQUIPMENT_IMAGE_STAGE2_OFFICIAL_APK_HOLD29",
    "sourceAuthority": {
        "officialPage": APK_REF,
        "officialApkUrl": APK_URL,
        "apkBytes": total,
        "apkLastModified": apk_headers.get("Last-Modified"),
        "apkEtag": apk_headers.get("ETag"),
        "method": "HTTP Range ZIP -> begin_ui_icon authoritative root bundle -> exact Texture2D stem -> staged RGBA PNG -> equipmentId promotion",
    },
    "contract": {
        "productionJoinKey": "equipmentId",
        "fullSourcePathAuthorityPreserved": True,
        "basenameOnlyResolutionUsed": False,
        "filenameSimilarityUsed": False,
        "crossRootFallbackUsed": False,
        "visualSimilarityUsed": False,
        "representativePixelParityRequired": True,
        "stagingBeforePromotionRequired": True,
        "existing344ImmutableRequired": True,
    },
    "predecessor": {
        "existingEvidenceRecords": 344,
        "heldRecords": 29,
        "holdReasonCounts": {
            "caseMismatchReview": status_counts[CASE_MISMATCH_STATUS],
            "basenameCollisionReview": status_counts[COLLISION_STATUS],
            "missingInLegacyDrive": status_counts[MISSING_STATUS],
        },
    },
    "bundles": bundle_evidence,
    "representativeDecoderProof": representative_checks,
    "collisionFixture547_550": collision_fixture,
    "heldResolvedCount": len(staged_records),
    "records": staged_records,
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
        "heldResolved": len(staged_records),
        "verifiedRepositoryAssets": len(after),
        "verifiedEvidence": len(prior_evidence["records"]) + len(staged_records),
        "representativeDecoderProofPassed": sum(1 for item in representative_checks if item["passed"]),
        "alphaValidatedHolds": sum(1 for item in staged_records if item["hasAlpha"]),
        "existingAssetsChanged": len(changed_existing),
        "unexpectedDeleted": len(expected_ids - set(after)),
        "unexpectedAddedOutsideHold29": len(set(after) - expected_ids),
        "missing": 0,
        "invalidPng": len(invalid_png),
        "ambiguousLocator": 0,
        "hardErrors": 0,
    },
    "sourceResolution": {
        "caseMismatchResolved": status_counts[CASE_MISMATCH_STATUS],
        "fullPathCollisionResolved": status_counts[COLLISION_STATUS],
        "legacyDriveMissingResolved": status_counts[MISSING_STATUS],
        "officialRootBundles": list(BUNDLE_BY_ROOT.values()),
    },
    "collisionFixture547_550Passed": (
        collision_fixture["sameTexture2DName"]
        and collision_fixture["distinctSourceRoots"]
        and collision_fixture["distinctBundleEntries"]
    ),
    "hardErrors": [],
    "finalStage2Complete": True,
    "nextStage": "STAGE3_EQUIPMENT_FRONTEND_IMAGE_INTEGRATION_QA",
}

checkpoint = {
    "checkpoint": "EQUIPMENT-IMAGE-STAGE2-FINAL-V2",
    "status": summary["status"],
    "completion": summary["completion"],
    "freezeState": summary["freezeState"],
    "completedScope": "public Equipment image assets 373/373",
    "confirmedJoinKey": "equipmentId",
    "confirmedSourceRoots": list(BUNDLE_BY_ROOT),
    "confirmedOfficialApkBundles": list(BUNDLE_BY_ROOT.values()),
    "representativeDecoderProof": "5/5",
    "frozenExistingSubset": 344,
    "resolvedHeldSubset": 29,
    "repositoryAssets": 373,
    "verifiedEvidence": 373,
    "existing344Changed": 0,
    "sourceUnresolved": 0,
    "nextStartPoint": "Stage 3 Equipment frontend image integration and Hosted QA; do not reopen Equipment semantics or Stage 2 source resolution without integrity/regression evidence.",
}

(ROOT / "data/evidence").mkdir(parents=True, exist_ok=True)
(ROOT / "data/validation").mkdir(parents=True, exist_ok=True)
(ROOT / "data/checkpoints").mkdir(parents=True, exist_ok=True)
(ROOT / "data/evidence/equipment-image-stage2-final373-official-apk.v2.json").write_text(
    json.dumps(evidence, ensure_ascii=False, indent=2) + "\n"
)
(ROOT / "data/validation/equipment-image-stage2-final-summary.v2.json").write_text(
    json.dumps(summary, ensure_ascii=False, indent=2) + "\n"
)
(ROOT / "data/checkpoints/equipment-image-stage2-final.v2.json").write_text(
    json.dumps(checkpoint, ensure_ascii=False, indent=2) + "\n"
)

print(json.dumps(summary, ensure_ascii=False, indent=2))
