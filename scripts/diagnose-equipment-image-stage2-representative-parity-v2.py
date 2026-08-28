import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path.cwd()
FINALIZER = ROOT / "scripts/finalize-equipment-image-stage2-hold29-v2.py"


class DiagnosticStop(RuntimeError):
    pass


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


source = FINALIZER.read_text()
marker = "# Stage 2-H1/H2/H3: resolve all 29 in a staging directory. Nothing is promoted until all pass."
if marker not in source:
    raise RuntimeError("diagnostic marker not found in finalizer")

# Guarantee this diagnostic never reaches HOLD29 extraction/promotion even if representative
# identity parity unexpectedly succeeds.
source = source.replace(
    marker,
    'raise DiagnosticStop("REPRESENTATIVE_DIAGNOSTIC_STOP")\n\n' + marker,
    1,
)

ns = {
    "__name__": "__main__",
    "__file__": str(FINALIZER),
    "DiagnosticStop": DiagnosticStop,
}

caught = None
try:
    exec(compile(source, str(FINALIZER), "exec"), ns)
except Exception as exc:
    caught = exc

if caught is None:
    raise RuntimeError("diagnostic execution unexpectedly completed")
if not isinstance(caught, (RuntimeError, DiagnosticStop)):
    raise caught

bundles = ns.get("bundles")
bundle_by_root = ns.get("BUNDLE_BY_ROOT")
representatives = ns.get("representatives")
source_root = ns.get("source_root")
texture_name_from_locator = ns.get("texture_name_from_locator")

if not all([bundles, bundle_by_root, representatives, source_root, texture_name_from_locator]):
    raise RuntimeError(f"representative diagnostic context unavailable after: {caught!r}")

results = []
for fixture in representatives:
    equipment_id = int(fixture["equipmentId"])
    locator = fixture["sourceIconPath"]
    root = source_root(locator)
    texture_name = texture_name_from_locator(locator)
    texture = bundles[root].get(texture_name)
    if texture is None:
        raise RuntimeError(f"diagnostic texture missing: {texture_name}")

    official = texture.image.convert("RGBA")
    frozen_path = ROOT / fixture["targetRepositoryPath"]
    with Image.open(frozen_path) as frozen_image:
        frozen = frozen_image.convert("RGBA")
        frozen_source_bands = list(frozen_image.getbands())

    official_bytes = official.tobytes()
    frozen_bytes = frozen.tobytes()
    official_hash = sha256(official_bytes)
    frozen_hash = sha256(frozen_bytes)

    candidates = {
        "identity": official,
        "flipTopBottom": official.transpose(Image.Transpose.FLIP_TOP_BOTTOM),
        "flipLeftRight": official.transpose(Image.Transpose.FLIP_LEFT_RIGHT),
        "rotate180": official.transpose(Image.Transpose.ROTATE_180),
        "rotate90": official.transpose(Image.Transpose.ROTATE_90),
        "rotate270": official.transpose(Image.Transpose.ROTATE_270),
    }
    r, g, b, a = official.split()
    candidates["swapRB"] = Image.merge("RGBA", (b, g, r, a))

    transform_matches = {
        name: (image.size == frozen.size and sha256(image.tobytes()) == frozen_hash)
        for name, image in candidates.items()
    }

    official_rgb = official.convert("RGB").tobytes()
    frozen_rgb = frozen.convert("RGB").tobytes()
    official_alpha = official.getchannel("A").tobytes()
    frozen_alpha = frozen.getchannel("A").tobytes()

    same_len = len(official_bytes) == len(frozen_bytes)
    differing_bytes = (
        sum(1 for left, right in zip(official_bytes, frozen_bytes) if left != right)
        if same_len
        else None
    )
    mean_abs_byte_diff = (
        sum(abs(left - right) for left, right in zip(official_bytes, frozen_bytes)) / len(official_bytes)
        if same_len and official_bytes
        else None
    )
    max_abs_byte_diff = (
        max(abs(left - right) for left, right in zip(official_bytes, frozen_bytes))
        if same_len and official_bytes
        else None
    )

    results.append({
        "equipmentId": equipment_id,
        "sourceIconPath": locator,
        "bundle": bundle_by_root[root],
        "texture2DName": texture_name,
        "officialSize": list(official.size),
        "frozenSize": list(frozen.size),
        "frozenSourceBands": frozen_source_bands,
        "officialPixelSha256": official_hash,
        "frozenPixelSha256": frozen_hash,
        "identityPixelParity": official_hash == frozen_hash and official.size == frozen.size,
        "rgbParity": sha256(official_rgb) == sha256(frozen_rgb),
        "alphaPlaneParity": sha256(official_alpha) == sha256(frozen_alpha),
        "officialAlphaSha256": sha256(official_alpha),
        "frozenAlphaSha256": sha256(frozen_alpha),
        "transformMatches": transform_matches,
        "differingBytes": differing_bytes,
        "totalRgbaBytes": len(official_bytes),
        "meanAbsByteDiff": mean_abs_byte_diff,
        "maxAbsByteDiff": max_abs_byte_diff,
    })

summary = {
    "status": "PASS_REPRESENTATIVE_PARITY_DIAGNOSTIC",
    "finalizerStoppedBeforeHoldExtraction": True,
    "triggeringException": type(caught).__name__,
    "triggeringMessage": str(caught),
    "exactIdentityMatches": sum(1 for item in results if item["identityPixelParity"]),
    "rgbMatches": sum(1 for item in results if item["rgbParity"]),
    "alphaMatches": sum(1 for item in results if item["alphaPlaneParity"]),
    "anySimpleTransformMatches": sum(
        1 for item in results if any(item["transformMatches"].values())
    ),
    "results": results,
}

print(json.dumps(summary, ensure_ascii=False, indent=2))
