from __future__ import annotations

import hashlib
import json
import pathlib
import struct
import urllib.request
import zlib

import UnityPy

VER = "1.1.113"
PACKAGE_NUMBER = 61
BUNDLE_NAME = "ui_icon_keyword_abs.b"
BASE = f"http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VER}"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
PROJECTION = pathlib.Path("data/generated/hero-fusion-power-presentation.v1.json")
OUT_DIR = pathlib.Path("public/images/factions")
MANIFEST = pathlib.Path("data/generated/hero-fusion-faction-assets.v1.json")
VALIDATION = pathlib.Path("data/validation/hero-fusion-faction-assets.v1.json")


def norm(value: object) -> str:
    return str(value or "").replace("\\", "/").strip("/").lower()


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def request(url: str, start: int | None = None, end: int | None = None, method: str | None = None):
    headers = {"User-Agent": UA, "Accept-Encoding": "identity"}
    if start is not None:
        headers["Range"] = f"bytes={start}-{end}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers, method=method), timeout=90) as response:
        data = response.read()
        if start is not None and len(data) != end - start + 1:
            raise RuntimeError(f"range mismatch {len(data)} != {end - start + 1}")
        return data, dict(response.headers)


def zip_directory(package_number: int):
    package_name = f"InstallPage_{VER}_{package_number}.zip"
    url = f"{BASE}/{package_name}"
    _, headers = request(url, method="HEAD")
    size = int(headers["Content-Length"])
    tail_size = min(1024 * 1024, size)
    tail, _ = request(url, size - tail_size, size - 1)
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise RuntimeError(f"EOCD missing {package_name}")
    _, _, _, _, central_size, central_offset, _ = struct.unpack_from("<HHHHIIH", tail, eocd + 4)
    central, _ = request(url, central_offset, central_offset + central_size - 1)
    entries = {}
    offset = 0
    while offset + 46 <= len(central) and central[offset : offset + 4] == b"PK\x01\x02":
        flags, method = struct.unpack_from("<HH", central, offset + 8)
        compressed_size, uncompressed_size = struct.unpack_from("<II", central, offset + 20)
        file_len, extra_len, comment_len = struct.unpack_from("<HHH", central, offset + 28)
        local_offset = struct.unpack_from("<I", central, offset + 42)[0]
        raw_name = central[offset + 46 : offset + 46 + file_len]
        name = raw_name.decode("utf-8" if flags & 0x800 else "cp437", "replace")
        entries[pathlib.PurePosixPath(name).name.lower()] = {
            "name": name,
            "method": method,
            "compressedSize": compressed_size,
            "uncompressedSize": uncompressed_size,
            "localOffset": local_offset,
        }
        offset += 46 + file_len + extra_len + comment_len
    return {"number": package_number, "name": package_name, "url": url, "entries": entries}


def extract_bundle(package, bundle_name: str) -> bytes:
    entry = package["entries"].get(bundle_name.lower())
    if not entry:
        raise RuntimeError(f"bundle missing: {bundle_name}")
    local_offset = entry["localOffset"]
    header, _ = request(package["url"], local_offset, local_offset + 4095)
    method = struct.unpack_from("<H", header, 8)[0]
    file_len, extra_len = struct.unpack_from("<HH", header, 26)
    data_start = local_offset + 30 + file_len + extra_len
    compressed, _ = request(package["url"], data_start, data_start + entry["compressedSize"] - 1)
    return compressed if method == 0 else zlib.decompress(compressed, -15)


def object_type(obj) -> str | None:
    return getattr(getattr(obj, "type", None), "name", None)


projection = json.loads(PROJECTION.read_text(encoding="utf-8"))
if (
    projection.get("status") != "PASS"
    or projection.get("completion") != "COMPLETE"
    or projection.get("freezeState") != "HERO_FUSION_POWER_PRESENTATION_FROZEN"
    or projection.get("summary", {}).get("fusionPowerHeroCount") != 35
    or projection.get("summary", {}).get("factionAssetCount") != 12
):
    raise RuntimeError("fusion projection is not frozen/complete")

faction_sources = {}
for row in projection["records"]:
    faction_id = int(row["targetFactionId"])
    source_path = row["iconSourcePath"]
    existing = faction_sources.get(faction_id)
    if existing and existing["iconSourcePath"] != source_path:
        raise RuntimeError(f"faction {faction_id} has multiple exact icon paths")
    faction_sources[faction_id] = {
        "factionId": faction_id,
        "nameCn": row.get("factionNameCn"),
        "nameKr": row.get("factionNameKr"),
        "iconSourcePath": source_path,
    }

if set(faction_sources) != set(range(1, 13)):
    raise RuntimeError(f"expected faction IDs 1..12, got {sorted(faction_sources)}")

package = zip_directory(PACKAGE_NUMBER)
bundle_raw = extract_bundle(package, BUNDLE_NAME)
env = UnityPy.load(bundle_raw)
container = [(norm(key), str(key), obj) for key, obj in env.container.items()]

OUT_DIR.mkdir(parents=True, exist_ok=True)
for stale in OUT_DIR.glob("*.png"):
    stale.unlink()

records = []
for faction_id in range(1, 13):
    source = faction_sources[faction_id]
    target = norm(source["iconSourcePath"])
    hits = [(key, original, obj) for key, original, obj in container if key == target or key.endswith("/" + target)]
    sprites = [(original, obj) for _, original, obj in hits if object_type(obj) == "Sprite"]
    if len(sprites) != 1:
        raise RuntimeError(
            f"faction {faction_id} exact Sprite ownership mismatch: source={source['iconSourcePath']} "
            f"hits={[(original, object_type(obj), int(getattr(obj, 'path_id', 0))) for _, original, obj in hits]}"
        )
    container_path, sprite_obj = sprites[0]
    sprite = sprite_obj.read()
    image = sprite.image
    if image is None:
        raise RuntimeError(f"faction {faction_id} Sprite has no image")
    output = OUT_DIR / f"{faction_id}.png"
    image.save(output, format="PNG", optimize=True)
    records.append(
        {
            **source,
            "gameVersion": VER,
            "sourcePackageNumber": PACKAGE_NUMBER,
            "sourcePackageName": package["name"],
            "sourceBundleName": BUNDLE_NAME,
            "containerPath": container_path,
            "spriteName": getattr(sprite, "m_Name", None),
            "spritePathId": int(getattr(sprite_obj, "path_id", 0)),
            "width": image.size[0],
            "height": image.size[1],
            "webAssetPath": f"/images/factions/{faction_id}.png",
            "localAssetPath": f"public/images/factions/{faction_id}.png",
            "sha256": sha256(output),
            "byteLength": output.stat().st_size,
            "assetStatus": "RESOLVED",
        }
    )

if len(list(OUT_DIR.glob("*.png"))) != 12 or len(records) != 12:
    raise RuntimeError("faction asset materialization count mismatch")
if len({row["spritePathId"] for row in records}) != 12:
    raise RuntimeError("faction Sprite identity uniqueness mismatch")

manifest = {
    "version": 1,
    "stage": "hero-fusion-faction-assets",
    "schemaId": "hero-fusion-faction-assets/v1",
    "status": "PASS",
    "completion": "COMPLETE",
    "freezeState": "HERO_FUSION_FACTION_ASSETS_FROZEN",
    "sourceFreezeState": projection["freezeState"],
    "gameVersion": VER,
    "sourcePolicy": {
        "exactConfigDataFactionIconPath": True,
        "exactBundleContainerPath": True,
        "remoteRuntimeHotlink": False,
        "nameJoin": False,
        "idArithmetic": False,
        "semanticStageReopened": False,
    },
    "summary": {
        "targetFactionCount": 12,
        "resolvedCount": 12,
        "fileCount": 12,
        "pendingCount": 0,
        "hardErrorCount": 0,
    },
    "records": records,
}
validation = {
    "version": 1,
    "status": "PASS_HERO_FUSION_FACTION_ASSETS",
    "sourceGameVersion": VER,
    "packageNumber": PACKAGE_NUMBER,
    "bundleName": BUNDLE_NAME,
    "targetFactionCount": 12,
    "materializedCount": 12,
    "fileCount": 12,
    "uniqueSpriteCount": 12,
    "semanticStageReopened": False,
    "representative": [row for row in records if row["factionId"] in {1, 2, 4, 7, 12}],
}
MANIFEST.parent.mkdir(parents=True, exist_ok=True)
VALIDATION.parent.mkdir(parents=True, exist_ok=True)
MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
VALIDATION.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": validation["status"], "resolved": 12, "records": validation["representative"]}, ensure_ascii=False, indent=2))
