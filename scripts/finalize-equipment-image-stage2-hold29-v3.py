import json
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path.cwd()
HELPER_SOURCE = ROOT / "scripts/finalize-equipment-image-stage2-hold29-v2.py"
CONTRACT_PATH = ROOT / "data/contracts/equipment-image-stage2-official-apk-finalization.v2.json"

# Reuse only the already-tested HTTP Range / ZIP / Unity bundle helper definitions.
helper_text = HELPER_SOURCE.read_text()
helper_marker = "# Frozen predecessor checks."
if helper_marker not in helper_text:
    raise RuntimeError("v2 helper marker not found")
helper_ns = {"__name__": "equipment_image_stage2_apk_helpers", "__file__": str(HELPER_SOURCE)}
exec(compile(helper_text.split(helper_marker, 1)[0], str(HELPER_SOURCE), "exec"), helper_ns)

IMAGE_DIR = helper_ns["IMAGE_DIR"]
STAGE1_CONTRACT = helper_ns["STAGE1_CONTRACT"]
STAGE2_SUBSET_SUMMARY = helper_ns["STAGE2_SUBSET_SUMMARY"]
STAGE2_SUBSET_EVIDENCE = helper_ns["STAGE2_SUBSET_EVIDENCE"]
APK_URL = helper_ns["APK_URL"]
APK_REF = helper_ns["APK_REF"]
BUNDLE_BY_ROOT = helper_ns["BUNDLE_BY_ROOT"]
CASE_MISMATCH_STATUS = helper_ns["CASE_MISMATCH_STATUS"]
COLLISION_STATUS = helper_ns["COLLISION_STATUS"]
MISSING_STATUS = helper_ns["MISSING_STATUS"]
sha256 = helper_ns["sha256"]
file_sha = helper_ns["file_sha"]
numeric_pngs = helper_ns["numeric_pngs"]
png_bytes = helper_ns["png_bytes"]
inspect_png_bytes = helper_ns["inspect_png_bytes"]
source_root = helper_ns["source_root"]
texture_name_from_locator = helper_ns["texture_name_from_locator"]
get_total_size = helper_ns["get_total_size"]
parse_zip_index = helper_ns["parse_zip_index"]
fetch_zip_entry = helper_ns["fetch_zip_entry"]
normalize_unity_bundle = helper_ns["normalize_unity_bundle"]
load_textures = helper_ns["load_textures"]

EXPECTED_TEXTURE_FORMAT_CODE = 47
EXPECTED_TEXTURE_FORMAT_NAME = "ETC2_RGBA8"
EXPECTED_SIZE = (172, 172)
EXPECTED_MIP_COUNT = 1
# ETC2_RGBA8 uses 8 bits per pixel. 172*172 pixels therefore occupy 29,584 bytes.
EXPECTED_COMPRESSED_IMAGE_BYTES = 172 * 172
REPRESENTATIVE_MAX_NORMALIZED_MAE = 0.02


def decoded_info(texture):
    image = texture.image
    original_bands = tuple(image.getbands())
    rgba = image.convert("RGBA")
    raw = rgba.tobytes()
    return {
        "image": rgba,
        "size": rgba.size,
        "bands": original_bands,
        "hasAlpha": "A" in original_bands,
        "pixelSha256": sha256(raw),
        "rawRgbaBytes": raw,
        "textureFormatCode": int(getattr(texture, "m_TextureFormat", -1)),
        "mipCount": int(getattr(texture, "m_MipCount", -1)),
        "completeImageSize": int(getattr(texture, "m_CompleteImageSize", -1)),
    }


def compare_rgba(left: bytes, right: bytes):
    if len(left) != len(right):
        return {
            "sameLength": False,
            "exactPixelParity": False,
            "differingBytes": None,
            "meanAbsByteDiff": None,
            "normalizedMeanAbsByteDiff": None,
            "maxAbsByteDiff": None,
        }
    diffs = [abs(a - b) for a, b in zip(left, right)]
    mean_abs = sum(diffs) / len(diffs) if diffs else 0.0
    return {
        "sameLength": True,
        "exactPixelParity": left == right,
        "differingBytes": sum(1 for diff in diffs if diff != 0),
        "meanAbsByteDiff": mean_abs,
        "normalizedMeanAbsByteDiff": mean_abs / 255.0,
        "maxAbsByteDiff": max(diffs) if diffs else 0,
    }


contract = json.loads(CONTRACT_PATH.read_text())
stage1 = json.loads(STAGE1_CONTRACT.read_text())
subset = json.loads(STAGE2_SUBSET_SUMMARY.read_text())
prior_evidence = json.loads(STAGE2_SUBSET_EVIDENCE.read_text())

# Frozen predecessor contract.
if subset.get("status") != "PASS_EQUIPMENT_IMAGE_STAGE2_EXACT_SOURCE_ACQUISITION":
    raise RuntimeError(f"unexpected Stage 2 subset status: {subset.get('status')}")
counts = subset.get("counts", {})
if counts.get("verifiedExactSourceAssets") != 344 or counts.get("unresolvedEquipment") != 29:
    raise RuntimeError(f"frozen 344/29 predecessor drifted: {counts}")
if subset.get("productionJoinKey") != "equipmentId":
    raise RuntimeError("production join key drifted")
if len(prior_evidence.get("records", [])) != 344:
    raise RuntimeError("existing source evidence is not exactly 344 records")

holds = subset.get("unresolved", [])
if len(holds) != 29:
    raise RuntimeError(f"expected 29 HOLD records, got {len(holds)}")
hold_ids = [int(record["equipmentId"]) for record in holds]
if len(set(hold_ids)) != 29:
    raise RuntimeError("duplicate equipmentId in HOLD29")

reason_counts = {
    CASE_MISMATCH_STATUS: sum(1 for item in holds if item.get("status") == CASE_MISMATCH_STATUS),
    COLLISION_STATUS: sum(1 for item in holds if item.get("status") == COLLISION_STATUS),
    MISSING_STATUS: sum(1 for item in holds if item.get("status") == MISSING_STATUS),
}
expected_reason_counts = {
    CASE_MISMATCH_STATUS: 3,
    COLLISION_STATUS: 2,
    MISSING_STATUS: 24,
}
if reason_counts != expected_reason_counts:
    raise RuntimeError(f"HOLD29 reason counts drifted: {reason_counts}")

for record in holds:
    source_root(record["sourceIconPath"])

collision_records = [record for record in holds if record.get("status") == COLLISION_STATUS]
if {int(record["equipmentId"]) for record in collision_records} != {547, 550}:
    raise RuntimeError("collision fixture IDs drifted from 547/550")
if len({record["sourceIconPath"].rsplit("/", 1)[-1] for record in collision_records}) != 1:
    raise RuntimeError("547/550 no longer share one basename")
if len({source_root(record["sourceIconPath"]) for record in collision_records}) != 2:
    raise RuntimeError("547/550 no longer resolve through two distinct full roots")

item04_ids = {
    int(record["equipmentId"])
    for record in holds
    if source_root(record["sourceIconPath"]) == "UI/Icon/Item04_ABS/"
}
if item04_ids != {549, 550}:
    raise RuntimeError(f"Item04 HOLD fixture drifted: {sorted(item04_ids)}")

# Freeze the current 344 repository assets before any official APK extraction.
before = numeric_pngs()
if len(before) != 344:
    raise RuntimeError(f"expected exactly 344 numeric Equipment PNGs before finalization, got {len(before)}")
if set(hold_ids).intersection(before):
    raise RuntimeError(f"HOLD IDs already present before finalization: {sorted(set(hold_ids).intersection(before))}")
baseline_sha = {equipment_id: file_sha(path) for equipment_id, path in before.items()}
prior_ids = {int(record["equipmentId"]) for record in prior_evidence["records"]}
if prior_ids != set(before):
    raise RuntimeError("existing 344 evidence IDs do not match repository PNG IDs")

# Read only the two required official APK AssetBundle entries via HTTP Range.
total_apk_bytes, apk_headers = get_total_size()
zip_index = parse_zip_index(total_apk_bytes)
missing_bundle_entries = [entry for entry in BUNDLE_BY_ROOT.values() if entry not in zip_index]
if missing_bundle_entries:
    raise RuntimeError(f"official APK missing required bundle entries: {missing_bundle_entries}")

bundles = {}
bundle_evidence = {}
for root, entry in BUNDLE_BY_ROOT.items():
    raw_bundle = fetch_zip_entry(zip_index[entry])
    normalized, payload_offset, unity_signature = normalize_unity_bundle(raw_bundle)
    textures = load_textures(normalized)
    bundles[root] = textures
    bundle_evidence[root] = {
        "apkEntry": entry,
        "zipMethod": zip_index[entry]["method"],
        "zipCrc32": f"{zip_index[entry]['crc32']:08x}",
        "sourceBundleBytes": len(raw_bundle),
        "sourceBundleSha256": sha256(raw_bundle),
        "unityPayloadOffset": payload_offset,
        "unitySignature": unity_signature,
        "texture2DCount": len(textures),
    }
    print(root, json.dumps(bundle_evidence[root], ensure_ascii=False))

# Stage 2-H0: five-fixture decoder/resolution proof.
# Exact legacy PNG pixel parity is recorded but is not a valid invariant because the
# current official APK stores the runtime icons as ETC2_RGBA8 (TextureFormat 47).
representatives = stage1.get("representatives", [])
if len(representatives) != 5:
    raise RuntimeError(f"Stage 1 representative fixture count drifted: {len(representatives)}")

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

    official = decoded_info(texture)
    frozen_path = ROOT / fixture["targetRepositoryPath"]
    if not frozen_path.exists():
        raise RuntimeError(f"representative ID {equipment_id}: frozen PNG missing")
    with Image.open(frozen_path) as frozen_source:
        frozen_rgba = frozen_source.convert("RGBA")
        frozen_raw = frozen_rgba.tobytes()
        frozen_size = frozen_rgba.size
        frozen_hash = sha256(frozen_raw)

    comparison = compare_rgba(official["rawRgbaBytes"], frozen_raw)
    structural_pass = (
        official["size"] == EXPECTED_SIZE
        and frozen_size == EXPECTED_SIZE
        and official["textureFormatCode"] == EXPECTED_TEXTURE_FORMAT_CODE
        and official["mipCount"] == EXPECTED_MIP_COUNT
        and official["completeImageSize"] == EXPECTED_COMPRESSED_IMAGE_BYTES
        and official["hasAlpha"]
    )
    similarity_pass = (
        comparison["sameLength"]
        and comparison["normalizedMeanAbsByteDiff"] is not None
        and comparison["normalizedMeanAbsByteDiff"] <= REPRESENTATIVE_MAX_NORMALIZED_MAE
    )
    passed = structural_pass and similarity_pass

    representative_checks.append({
        "equipmentId": equipment_id,
        "sourceIconPath": locator,
        "sourceRoot": root,
        "officialApkBundleEntry": BUNDLE_BY_ROOT[root],
        "texture2DName": texture_name,
        "textureFormatCode": official["textureFormatCode"],
        "textureFormatName": EXPECTED_TEXTURE_FORMAT_NAME,
        "mipCount": official["mipCount"],
        "completeImageSize": official["completeImageSize"],
        "officialSize": list(official["size"]),
        "legacyFrozenSize": list(frozen_size),
        "officialHasAlpha": official["hasAlpha"],
        "officialPixelSha256": official["pixelSha256"],
        "legacyFrozenPixelSha256": frozen_hash,
        "legacyComparison": comparison,
        "legacyExactPixelParityRequired": False,
        "structuralPass": structural_pass,
        "similarityValidationPass": similarity_pass,
        "passed": passed,
    })

if not all(item["passed"] for item in representative_checks):
    raise RuntimeError(
        "official APK representative proof failed: "
        + json.dumps(representative_checks, ensure_ascii=False)
    )

# Stage 2-H1/H2/H3: resolve every HOLD into a temporary staging area first.
staged_records = []
with tempfile.TemporaryDirectory(prefix=".equipment-image-stage2-hold29-v3-", dir=ROOT) as tmp:
    staging = Path(tmp)

    for record in holds:
        equipment_id = int(record["equipmentId"])
        locator = record["sourceIconPath"]
        root = source_root(locator)
        texture_name = texture_name_from_locator(locator)
        texture = bundles[root].get(texture_name)
        if texture is None:
            raise RuntimeError(
                f"ID {equipment_id}: exact Texture2D {texture_name!r} missing from {BUNDLE_BY_ROOT[root]}"
            )

        decoded = decoded_info(texture)
        if decoded["size"] != EXPECTED_SIZE:
            raise RuntimeError(f"ID {equipment_id}: unexpected decoded size {decoded['size']}")
        if decoded["textureFormatCode"] != EXPECTED_TEXTURE_FORMAT_CODE:
            raise RuntimeError(
                f"ID {equipment_id}: unexpected TextureFormat {decoded['textureFormatCode']}"
            )
        if decoded["mipCount"] != EXPECTED_MIP_COUNT:
            raise RuntimeError(f"ID {equipment_id}: unexpected mip count {decoded['mipCount']}")
        if decoded["completeImageSize"] != EXPECTED_COMPRESSED_IMAGE_BYTES:
            raise RuntimeError(
                f"ID {equipment_id}: unexpected compressed image size {decoded['completeImageSize']}"
            )
        if not decoded["hasAlpha"]:
            raise RuntimeError(f"ID {equipment_id}: decoded image has no alpha channel")

        extracted_png = png_bytes(decoded["image"])
        png_info = inspect_png_bytes(extracted_png)
        if (png_info["width"], png_info["height"]) != EXPECTED_SIZE:
            raise RuntimeError(f"ID {equipment_id}: extracted PNG dimension mismatch")
        if not png_info["hasAlpha"]:
            raise RuntimeError(f"ID {equipment_id}: extracted PNG lost alpha")
        if png_info["pixelSha256"] != decoded["pixelSha256"]:
            raise RuntimeError(f"ID {equipment_id}: decoded Texture2D -> staged PNG pixel parity failed")

        staged_path = staging / f"{equipment_id}.png"
        staged_path.write_bytes(extracted_png)

        staged_records.append({
            "equipmentId": equipment_id,
            "previousHoldStatus": record["status"],
            "sourceIconPath": locator,
            "sourceRoot": root,
            "officialApkBundleEntry": BUNDLE_BY_ROOT[root],
            "texture2DName": texture_name,
            "texture2DExactNameMatch": True,
            "textureFormatCode": decoded["textureFormatCode"],
            "textureFormatName": EXPECTED_TEXTURE_FORMAT_NAME,
            "mipCount": decoded["mipCount"],
            "compressedImageBytes": decoded["completeImageSize"],
            "width": png_info["width"],
            "height": png_info["height"],
            "hasAlpha": png_info["hasAlpha"],
            "decodedPixelSha256": decoded["pixelSha256"],
            "stagedPngSha256": png_info["pngSha256"],
            "repositoryPath": f"public/images/equipment/{equipment_id}.png",
            "repositoryPngBytes": png_info["bytes"],
            "resolutionStatus": "VERIFIED_OFFICIAL_APK_ETC2_TEXTURE_EXTRACT",
        })

    staged_ids = {int(path.stem) for path in staging.glob("*.png") if path.stem.isdigit()}
    if staged_ids != set(hold_ids):
        raise RuntimeError(
            f"staging ID set mismatch; missing={sorted(set(hold_ids)-staged_ids)} "
            f"extra={sorted(staged_ids-set(hold_ids))}"
        )

    by_id = {record["equipmentId"]: record for record in staged_records}
    collision_fixture = {
        "equipmentIds": [547, 550],
        "sameTexture2DName": by_id[547]["texture2DName"] == by_id[550]["texture2DName"],
        "distinctSourceRoots": by_id[547]["sourceRoot"] != by_id[550]["sourceRoot"],
        "distinctBundleEntries": by_id[547]["officialApkBundleEntry"] != by_id[550]["officialApkBundleEntry"],
        "records": [
            {
                "equipmentId": equipment_id,
                "sourceIconPath": by_id[equipment_id]["sourceIconPath"],
                "sourceRoot": by_id[equipment_id]["sourceRoot"],
                "bundle": by_id[equipment_id]["officialApkBundleEntry"],
                "texture2DName": by_id[equipment_id]["texture2DName"],
                "decodedPixelSha256": by_id[equipment_id]["decodedPixelSha256"],
            }
            for equipment_id in (547, 550)
        ],
    }
    if not (
        collision_fixture["sameTexture2DName"]
        and collision_fixture["distinctSourceRoots"]
        and collision_fixture["distinctBundleEntries"]
    ):
        raise RuntimeError(f"547/550 collision fixture failed: {collision_fixture}")

    # Stage 2-H4: atomic-at-workflow-level promotion only after all 29 staged checks pass.
    for equipment_id in sorted(hold_ids):
        target = IMAGE_DIR / f"{equipment_id}.png"
        target.write_bytes((staging / f"{equipment_id}.png").read_bytes())

# Stage 2-H5/H6: verify 373/373 and prove the frozen 344 did not change.
after = numeric_pngs()
expected_ids = set(before).union(hold_ids)
if len(after) != 373 or set(after) != expected_ids:
    raise RuntimeError(
        f"final Equipment PNG set mismatch; count={len(after)} "
        f"missing={sorted(expected_ids-set(after))} extra={sorted(set(after)-expected_ids)}"
    )

changed_existing = [
    equipment_id
    for equipment_id, old_sha in baseline_sha.items()
    if file_sha(after[equipment_id]) != old_sha
]
if changed_existing:
    raise RuntimeError(f"existing frozen 344 assets changed: {changed_existing[:30]}")

invalid_png = []
for equipment_id, path in after.items():
    try:
        inspect_png_bytes(path.read_bytes())
    except Exception as exc:
        invalid_png.append({"equipmentId": equipment_id, "error": str(exc)})
if invalid_png:
    raise RuntimeError(f"invalid PNG assets: {invalid_png[:10]}")

# Exact byte parity is required from the extracted/staged official PNG to repository copy.
for record in staged_records:
    target_info = inspect_png_bytes((ROOT / record["repositoryPath"]).read_bytes())
    if target_info["pngSha256"] != record["stagedPngSha256"]:
        raise RuntimeError(f"ID {record['equipmentId']}: staged PNG -> repository SHA parity failed")
    if target_info["pixelSha256"] != record["decodedPixelSha256"]:
        raise RuntimeError(f"ID {record['equipmentId']}: official decode -> repository pixel parity failed")
    record["repositoryPngSha256"] = target_info["pngSha256"]
    record["stagedToRepositoryShaParity"] = True

representative_pass_count = sum(1 for item in representative_checks if item["passed"])
legacy_exact_count = sum(
    1 for item in representative_checks if item["legacyComparison"]["exactPixelParity"]
)

final_evidence = {
    "evidence": "equipment-image-stage2-final373-official-apk-v3",
    "contract": contract["contract"],
    "status": "PASS_EQUIPMENT_IMAGE_STAGE2_OFFICIAL_APK_HOLD29",
    "sourceAuthority": {
        "officialPage": APK_REF,
        "officialApkUrl": APK_URL,
        "apkBytes": total_apk_bytes,
        "apkLastModified": apk_headers.get("Last-Modified"),
        "apkEtag": apk_headers.get("ETag"),
        "method": "HTTP Range ZIP -> begin_ui_icon authoritative root bundle -> exact ETC2_RGBA8 Texture2D stem -> RGBA decode -> staged PNG -> equipmentId repository path",
    },
    "identityBoundary": {
        "productionJoinKey": "equipmentId",
        "sourceLocatorAuthority": "ConfigDataEquipmentInfo.Icon full path",
        "basenameOnlyResolutionUsed": False,
        "filenameSimilarityUsed": False,
        "visualSimilarityResolutionUsed": False,
        "crossRootFallbackUsed": False,
        "canonicalIdentityChanged": False,
        "semanticStageReopened": False,
    },
    "runtimeTextureFormat": {
        "code": EXPECTED_TEXTURE_FORMAT_CODE,
        "name": EXPECTED_TEXTURE_FORMAT_NAME,
        "bitsPerPixel": 8,
        "decodedCanvas": [172, 172],
        "compressedBytesPerIcon": EXPECTED_COMPRESSED_IMAGE_BYTES,
    },
    "bundles": bundle_evidence,
    "representativeProof": {
        "fixtures": 5,
        "passed": representative_pass_count,
        "legacyExactPixelMatches": legacy_exact_count,
        "legacyExactPixelParityRequired": False,
        "maxNormalizedMeanAbsByteDiff": REPRESENTATIVE_MAX_NORMALIZED_MAE,
        "records": representative_checks,
    },
    "holdReasonCounts": {
        "caseMismatchReview": reason_counts[CASE_MISMATCH_STATUS],
        "basenameCollisionReview": reason_counts[COLLISION_STATUS],
        "missingInLegacyDrive": reason_counts[MISSING_STATUS],
    },
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
        "representativeDecoderProofPassed": representative_pass_count,
        "representativeLegacyExactPixelMatches": legacy_exact_count,
        "officialEtc2AssetsResolved": len(staged_records),
        "alphaValidatedHolds": sum(1 for item in staged_records if item["hasAlpha"]),
        "existingAssetsChanged": len(changed_existing),
        "unexpectedDeleted": len(expected_ids - set(after)),
        "unexpectedAddedOutsideHold29": len(set(after) - expected_ids),
        "missing": 0,
        "invalidPng": len(invalid_png),
        "ambiguousLocator": 0,
        "hardErrors": 0
    },
    "sourceResolution": {
        "caseMismatchResolved": reason_counts[CASE_MISMATCH_STATUS],
        "fullPathCollisionResolved": reason_counts[COLLISION_STATUS],
        "legacyDriveMissingResolved": reason_counts[MISSING_STATUS],
        "officialRootBundles": list(BUNDLE_BY_ROOT.values()),
        "textureFormatCode": EXPECTED_TEXTURE_FORMAT_CODE,
        "textureFormatName": EXPECTED_TEXTURE_FORMAT_NAME
    },
    "collisionFixture547_550Passed": (
        collision_fixture["sameTexture2DName"]
        and collision_fixture["distinctSourceRoots"]
        and collision_fixture["distinctBundleEntries"]
    ),
    "hardErrors": [],
    "finalStage2Complete": True,
    "nextStage": "STAGE3_EQUIPMENT_FRONTEND_IMAGE_INTEGRATION_QA"
}

checkpoint = {
    "checkpoint": "EQUIPMENT-IMAGE-STAGE2-FINAL-V3",
    "status": summary["status"],
    "completion": summary["completion"],
    "freezeState": summary["freezeState"],
    "completedScope": "public Equipment image assets 373/373",
    "confirmedJoinKey": "equipmentId",
    "confirmedSourceRoots": list(BUNDLE_BY_ROOT),
    "confirmedOfficialApkBundles": list(BUNDLE_BY_ROOT.values()),
    "confirmedRuntimeTextureFormat": "ETC2_RGBA8 (47)",
    "representativeDecoderProof": f"{representative_pass_count}/5",
    "representativeLegacyExactPixelMatches": f"{legacy_exact_count}/5 (not required for compressed runtime source)",
    "frozenExistingSubset": 344,
    "resolvedHeldSubset": 29,
    "repositoryAssets": 373,
    "verifiedEvidence": 373,
    "existing344Changed": 0,
    "sourceUnresolved": 0,
    "nextStartPoint": "Stage 3 Equipment frontend image integration and Hosted QA; do not reopen Equipment semantics or Stage 2 source resolution without integrity/regression evidence."
}

(ROOT / "data/evidence").mkdir(parents=True, exist_ok=True)
(ROOT / "data/validation").mkdir(parents=True, exist_ok=True)
(ROOT / "data/checkpoints").mkdir(parents=True, exist_ok=True)
(ROOT / "data/evidence/equipment-image-stage2-final373-official-apk.v3.json").write_text(
    json.dumps(final_evidence, ensure_ascii=False, indent=2) + "\n"
)
(ROOT / "data/validation/equipment-image-stage2-final-summary.v3.json").write_text(
    json.dumps(summary, ensure_ascii=False, indent=2) + "\n"
)
(ROOT / "data/checkpoints/equipment-image-stage2-final.v3.json").write_text(
    json.dumps(checkpoint, ensure_ascii=False, indent=2) + "\n"
)

print(json.dumps(summary, ensure_ascii=False, indent=2))
