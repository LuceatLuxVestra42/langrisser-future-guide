import json
from pathlib import Path

ROOT = Path.cwd()
FINALIZER = ROOT / "scripts/finalize-equipment-image-stage2-hold29-v2.py"

source = FINALIZER.read_text()
marker = "# Stage 2-H1/H2/H3: resolve all 29 in a staging directory. Nothing is promoted until all pass."
if marker not in source:
    raise RuntimeError("diagnostic marker not found")
source = source.replace(marker, 'raise RuntimeError("TEXTURE_FORMAT_DIAGNOSTIC_STOP")\n\n' + marker, 1)

ns = {"__name__": "__main__", "__file__": str(FINALIZER)}
try:
    exec(compile(source, str(FINALIZER), "exec"), ns)
except RuntimeError:
    pass

for required in ("bundles", "representatives", "source_root", "texture_name_from_locator", "BUNDLE_BY_ROOT"):
    if required not in ns:
        raise RuntimeError(f"missing diagnostic context: {required}")

bundles = ns["bundles"]
representatives = ns["representatives"]
source_root = ns["source_root"]
texture_name_from_locator = ns["texture_name_from_locator"]
bundle_by_root = ns["BUNDLE_BY_ROOT"]


def value_repr(value):
    if value is None:
        return None
    result = {"repr": repr(value), "str": str(value), "type": type(value).__name__}
    for attr in ("name", "value"):
        if hasattr(value, attr):
            try:
                result[attr] = getattr(value, attr)
            except Exception as exc:
                result[attr] = f"ERROR:{type(exc).__name__}:{exc}"
    try:
        result["int"] = int(value)
    except Exception:
        pass
    return result


results = []
for fixture in representatives:
    equipment_id = int(fixture["equipmentId"])
    locator = fixture["sourceIconPath"]
    root = source_root(locator)
    name = texture_name_from_locator(locator)
    texture = bundles[root][name]

    stream_data = getattr(texture, "m_StreamData", None)
    stream_info = None
    if stream_data is not None:
        stream_info = {}
        for field in ("offset", "size", "path"):
            if hasattr(stream_data, field):
                try:
                    stream_info[field] = getattr(stream_data, field)
                except Exception as exc:
                    stream_info[field] = f"ERROR:{type(exc).__name__}:{exc}"

    image_data = None
    for attr in ("image_data", "m_ImageData"):
        if hasattr(texture, attr):
            try:
                candidate = getattr(texture, attr)
                if candidate is not None:
                    image_data = candidate
                    break
            except Exception:
                pass

    results.append({
        "equipmentId": equipment_id,
        "sourceIconPath": locator,
        "bundle": bundle_by_root[root],
        "texture2DName": name,
        "width": getattr(texture, "m_Width", None),
        "height": getattr(texture, "m_Height", None),
        "textureFormat": value_repr(getattr(texture, "m_TextureFormat", None)),
        "mipCount": getattr(texture, "m_MipCount", None),
        "completeImageSize": getattr(texture, "m_CompleteImageSize", None),
        "colorSpace": value_repr(getattr(texture, "m_ColorSpace", None)),
        "isReadable": getattr(texture, "m_IsReadable", None),
        "streamData": stream_info,
        "rawImageDataBytes": len(image_data) if isinstance(image_data, (bytes, bytearray, memoryview)) else None,
        "decodedMode": texture.image.mode,
        "decodedSize": list(texture.image.size),
    })

formats = sorted({
    item["textureFormat"].get("name") or item["textureFormat"].get("str")
    for item in results
    if item["textureFormat"]
})

summary = {
    "status": "PASS_TEXTURE_FORMAT_DIAGNOSTIC",
    "holdPromotionPerformed": False,
    "formats": formats,
    "allDecoded172": all(item["decodedSize"] == [172, 172] for item in results),
    "results": results,
}
print(json.dumps(summary, ensure_ascii=False, indent=2, default=str))
