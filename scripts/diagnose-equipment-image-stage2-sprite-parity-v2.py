import hashlib
import json
from pathlib import Path

from PIL import Image
import UnityPy

ROOT = Path.cwd()
FINALIZER = ROOT / "scripts/finalize-equipment-image-stage2-hold29-v2.py"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# Reuse the already-tested APK Range/ZIP/bootstrap code and stop before HOLD extraction.
source = FINALIZER.read_text()
marker = "# Stage 2-H1/H2/H3: resolve all 29 in a staging directory. Nothing is promoted until all pass."
if marker not in source:
    raise RuntimeError("diagnostic marker not found")
source = source.replace(marker, 'raise RuntimeError("SPRITE_DIAGNOSTIC_STOP")\n\n' + marker, 1)

ns = {"__name__": "__main__", "__file__": str(FINALIZER)}
try:
    exec(compile(source, str(FINALIZER), "exec"), ns)
except RuntimeError:
    pass

required = [
    "zip_index",
    "fetch_zip_entry",
    "normalize_unity_bundle",
    "BUNDLE_BY_ROOT",
    "representatives",
    "source_root",
    "texture_name_from_locator",
]
missing = [name for name in required if name not in ns]
if missing:
    raise RuntimeError(f"diagnostic context unavailable: {missing}")

zip_index = ns["zip_index"]
fetch_zip_entry = ns["fetch_zip_entry"]
normalize_unity_bundle = ns["normalize_unity_bundle"]
bundle_by_root = ns["BUNDLE_BY_ROOT"]
representatives = ns["representatives"]
source_root = ns["source_root"]
texture_name_from_locator = ns["texture_name_from_locator"]

needed_roots = sorted({source_root(item["sourceIconPath"]) for item in representatives})
sprite_indexes = {}
sprite_counts = {}
texture_counts = {}

for root in needed_roots:
    entry = bundle_by_root[root]
    raw = fetch_zip_entry(zip_index[entry])
    normalized, _, _ = normalize_unity_bundle(raw)
    env = UnityPy.load(normalized)
    sprites = {}
    sprite_duplicates = []
    texture_count = 0
    for obj in env.objects:
        if obj.type.name == "Texture2D":
            texture_count += 1
            continue
        if obj.type.name != "Sprite":
            continue
        data = obj.read()
        name = getattr(data, "m_Name", None) or getattr(data, "name", None)
        if not name:
            continue
        if name in sprites:
            sprite_duplicates.append(name)
        else:
            sprites[name] = data
    if sprite_duplicates:
        raise RuntimeError(f"duplicate Sprite names in {entry}: {sorted(set(sprite_duplicates))[:20]}")
    sprite_indexes[root] = sprites
    sprite_counts[root] = len(sprites)
    texture_counts[root] = texture_count

results = []
for fixture in representatives:
    equipment_id = int(fixture["equipmentId"])
    locator = fixture["sourceIconPath"]
    root = source_root(locator)
    asset_name = texture_name_from_locator(locator)
    sprite = sprite_indexes[root].get(asset_name)
    if sprite is None:
        results.append({
            "equipmentId": equipment_id,
            "assetName": asset_name,
            "spriteFound": False,
            "passed": False,
        })
        continue

    try:
        sprite_image = sprite.image.convert("RGBA")
    except Exception as exc:
        results.append({
            "equipmentId": equipment_id,
            "assetName": asset_name,
            "spriteFound": True,
            "spriteImageError": f"{type(exc).__name__}: {exc}",
            "passed": False,
        })
        continue

    frozen_path = ROOT / fixture["targetRepositoryPath"]
    with Image.open(frozen_path) as frozen_source:
        frozen = frozen_source.convert("RGBA")

    sprite_hash = sha256(sprite_image.tobytes())
    frozen_hash = sha256(frozen.tobytes())
    pixel_parity = sprite_image.size == frozen.size and sprite_hash == frozen_hash

    sprite_alpha = sprite_image.getchannel("A").tobytes()
    frozen_alpha = frozen.getchannel("A").tobytes()
    sprite_rgb = sprite_image.convert("RGB").tobytes()
    frozen_rgb = frozen.convert("RGB").tobytes()

    results.append({
        "equipmentId": equipment_id,
        "sourceIconPath": locator,
        "root": root,
        "bundle": bundle_by_root[root],
        "assetName": asset_name,
        "spriteFound": True,
        "spriteSize": list(sprite_image.size),
        "frozenSize": list(frozen.size),
        "spritePixelSha256": sprite_hash,
        "frozenPixelSha256": frozen_hash,
        "pixelParity": pixel_parity,
        "rgbParity": sha256(sprite_rgb) == sha256(frozen_rgb),
        "alphaParity": sha256(sprite_alpha) == sha256(frozen_alpha),
        "passed": pixel_parity,
    })

summary = {
    "status": "PASS_SPRITE_PARITY_DIAGNOSTIC",
    "holdPromotionPerformed": False,
    "neededRoots": needed_roots,
    "spriteCounts": sprite_counts,
    "texture2DCounts": texture_counts,
    "representatives": len(results),
    "spritesFound": sum(1 for item in results if item.get("spriteFound")),
    "pixelParityPassed": sum(1 for item in results if item.get("pixelParity")),
    "rgbParityPassed": sum(1 for item in results if item.get("rgbParity")),
    "alphaParityPassed": sum(1 for item in results if item.get("alphaParity")),
    "results": results,
}

print(json.dumps(summary, ensure_ascii=False, indent=2))
