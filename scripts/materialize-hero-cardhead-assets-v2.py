import json
import pathlib
import struct
import urllib.request
import zlib
from collections import defaultdict

import UnityPy

VER = "1.1.113"
BASE = f"http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VER}"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
PACKAGE_NUMBER = 26
PACKAGE_NAME = f"InstallPage_{VER}_{PACKAGE_NUMBER}.zip"
PACKAGE_URL = f"{BASE}/{PACKAGE_NAME}"
HERO_INFO = pathlib.Path("data/configdata/ConfigDataHeroInfo.json")
CHAR_IMAGE = pathlib.Path("data/configdata/ConfigDataCharImageInfo.json")
MASTER = pathlib.Path("data/hero-name-master.v1.json")
OUT_DIR = pathlib.Path("public/images/heroes/card-head")
MANIFEST = pathlib.Path("data/generated/hero-cardhead-web-assets.v1.json")
VALIDATION = pathlib.Path("data/validation/hero-cardhead-materialization.v1.json")

BUNDLE_BY_PREFIX = {
    "UI/Card_ABS/": "begin_ui_card_abs.b",
    "UI/Card02_ABS/": "begin_ui_card02_abs.b",
    "UI/Card03_ABS/": "begin_ui_card03_abs.b",
    "UI/Card04_ABS/": "begin_ui_card04_abs.b",
    "UI/Card05_ABS/": "begin_ui_card05_abs.b",
    "UI/Card06_ABS/": "begin_ui_card06_abs.b",
    "UI/Card07_ABS/": "begin_ui_card07_abs.b",
    "UI/Card08_ABS/": "begin_ui_card08_abs.b",
    "UI/Card09_ABS/": "begin_ui_card09_abs.b",
}


def normalize_path(value):
    return str(value or "").replace("\\", "/").strip("/").lower()


def req(url, start=None, end=None):
    headers = {"User-Agent": UA, "Accept-Encoding": "identity"}
    if start is not None:
        headers["Range"] = f"bytes={start}-{end}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read()
    if start is not None and len(data) != end - start + 1:
        raise RuntimeError(f"range mismatch {len(data)} != {end - start + 1}")
    return data


def head_size(url):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept-Encoding": "identity"},
        method="HEAD",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return int(response.headers["Content-Length"])


def zip_directory(url):
    size = head_size(url)
    tail_size = min(1048576, size)
    tail = req(url, size - tail_size, size - 1)
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise RuntimeError("EOCD missing")
    _, _, _, _, central_size, central_offset, _ = struct.unpack_from("<HHHHIIH", tail, eocd + 4)
    central = req(url, central_offset, central_offset + central_size - 1)
    entries = {}
    offset = 0
    while offset + 46 <= len(central) and central[offset:offset + 4] == b"PK\x01\x02":
        flags, method = struct.unpack_from("<HH", central, offset + 8)
        compressed_size, uncompressed_size = struct.unpack_from("<II", central, offset + 20)
        filename_len, extra_len, comment_len = struct.unpack_from("<HHH", central, offset + 28)
        local_offset = struct.unpack_from("<I", central, offset + 42)[0]
        raw_name = central[offset + 46: offset + 46 + filename_len]
        name = raw_name.decode("utf-8" if flags & 0x800 else "cp437", "replace")
        entries[pathlib.PurePosixPath(name).name.lower()] = {
            "name": name,
            "method": method,
            "compressedSize": compressed_size,
            "uncompressedSize": uncompressed_size,
            "localOffset": local_offset,
        }
        offset += 46 + filename_len + extra_len + comment_len
    return size, entries


def extract_zip_entry(url, entry):
    local_offset = entry["localOffset"]
    header = req(url, local_offset, local_offset + 4095)
    method = struct.unpack_from("<H", header, 8)[0]
    filename_len, extra_len = struct.unpack_from("<HH", header, 26)
    start = local_offset + 30 + filename_len + extra_len
    end = start + entry["compressedSize"] - 1
    compressed = req(url, start, end)
    if method == 0:
        return compressed
    if method == 8:
        return zlib.decompress(compressed, -15)
    raise RuntimeError(f"unsupported ZIP method {method}")


def object_type(obj):
    return getattr(getattr(obj, "type", None), "name", None)


master_root = json.loads(MASTER.read_text(encoding="utf-8"))
heroes = master_root if isinstance(master_root, list) else master_root.get("records", [])
hero_info = json.loads(HERO_INFO.read_text(encoding="utf-8"))
char_info = json.loads(CHAR_IMAGE.read_text(encoding="utf-8"))
hero_by_id = {int(row["ID"]): row for row in hero_info if isinstance(row, dict) and isinstance(row.get("ID"), int)}
char_by_id = {int(row["ID"]): row for row in char_info if isinstance(row, dict) and isinstance(row.get("ID"), int)}

rows = []
errors = []
for hero in heroes:
    hero_id = int(hero["heroId"])
    h = hero_by_id.get(hero_id)
    if not h:
        errors.append(f"HeroInfo missing {hero_id}")
        continue
    c = char_by_id.get(int(h.get("CharImage_ID", 0)))
    if not c:
        errors.append(f"CharImageInfo missing {hero_id}")
        continue
    source = str(c.get("CardHeadImage") or "")
    prefix = next((p for p in BUNDLE_BY_PREFIX if source.startswith(p)), None)
    if prefix is None:
        errors.append(f"unsupported CardHeadImage prefix {hero_id}: {source}")
        continue
    rows.append({
        "heroId": hero_id,
        "nameKr": hero.get("nameKr"),
        "sourceCardHeadPath": source,
        "sourcePrefix": prefix,
        "bundleName": BUNDLE_BY_PREFIX[prefix],
        "webAssetPath": f"/images/heroes/card-head/{hero_id}.png",
    })

if errors or len(rows) != 267 or len({r["heroId"] for r in rows}) != 267:
    raise RuntimeError(f"input contract failed rows={len(rows)} errors={errors[:10]}")

package_size, directory = zip_directory(PACKAGE_URL)
by_bundle = defaultdict(list)
for row in rows:
    by_bundle[row["bundleName"]].append(row)

OUT_DIR.mkdir(parents=True, exist_ok=True)
for old in OUT_DIR.glob("*.png"):
    old.unlink()

bundle_reports = []
materialized = []
for bundle_name in sorted(by_bundle):
    entry = directory.get(bundle_name.lower())
    if not entry:
        raise RuntimeError(f"bundle missing from {PACKAGE_NAME}: {bundle_name}")
    raw = extract_zip_entry(PACKAGE_URL, entry)
    env = UnityPy.load(raw)

    container_rows = []
    for container_path, obj in env.container.items():
        key = normalize_path(container_path)
        container_rows.append((key, str(container_path), obj))

    matched = 0
    for row in by_bundle[bundle_name]:
        target = normalize_path(row["sourceCardHeadPath"])
        hits = [
            (key, original, obj)
            for key, original, obj in container_rows
            if key == target or key.endswith("/" + target)
        ]
        if len(hits) != 1:
            same_basename = [
                original for key, original, _ in container_rows
                if pathlib.PurePosixPath(key).name == pathlib.PurePosixPath(target).name
            ]
            raise RuntimeError(
                f"Hero {row['heroId']} exact container mismatch in {bundle_name}: "
                f"source={row['sourceCardHeadPath']} hits={len(hits)} sameBasename={same_basename[:8]} "
                f"containerSample={[original for _, original, _ in container_rows[:20]]}"
            )

        container_key, container_path, obj = hits[0]
        data = obj.read()
        image = getattr(data, "image", None)
        if image is None:
            raise RuntimeError(
                f"Hero {row['heroId']} exact container has no image: "
                f"path={container_path} type={object_type(obj)} name={getattr(data, 'm_Name', None)}"
            )

        out = OUT_DIR / f"{row['heroId']}.png"
        image.save(out, format="PNG", optimize=True)
        row["width"], row["height"] = image.size
        row["sourcePackageNumber"] = PACKAGE_NUMBER
        row["sourcePackageName"] = PACKAGE_NAME
        row["sourceBundleName"] = bundle_name
        row["containerPath"] = container_path
        row["containerObjectType"] = object_type(obj)
        row["containerPathId"] = int(getattr(obj, "path_id", 0))
        row["containerObjectName"] = getattr(data, "m_Name", None)
        materialized.append(row)
        matched += 1

    bundle_reports.append({
        "bundleName": bundle_name,
        "expectedCount": len(by_bundle[bundle_name]),
        "containerCount": len(container_rows),
        "matchedCount": matched,
        "compressedSize": entry["compressedSize"],
        "uncompressedSize": entry["uncompressedSize"],
    })

file_count = len(list(OUT_DIR.glob("*.png")))
if file_count != 267 or len(materialized) != 267:
    raise RuntimeError(f"materialization count mismatch files={file_count} rows={len(materialized)}")
if any(r.get("width", 0) <= 0 or r.get("height", 0) <= 0 for r in materialized):
    raise RuntimeError("invalid image dimension")
if len({normalize_path(r["sourceCardHeadPath"]) for r in materialized}) != 267:
    raise RuntimeError("CardHeadImage source path uniqueness drift")
if len({r["containerPathId"] for r in materialized}) != 267:
    raise RuntimeError("resolved container object pathId uniqueness drift")

materialized.sort(key=lambda r: r["heroId"])
manifest = {
    "version": 1,
    "status": "HERO_CARDHEAD_WEB_ASSETS_COMPLETE",
    "gameVersion": VER,
    "sourceContract": "ConfigDataHeroInfo.CharImage_ID -> ConfigDataCharImageInfo.ID -> CardHeadImage -> exact Unity AssetBundle container path",
    "sourcePackage": {
        "packageNumber": PACKAGE_NUMBER,
        "packageName": PACKAGE_NAME,
        "packageBytes": package_size,
    },
    "heroCount": len(materialized),
    "records": materialized,
}
validation = {
    "version": 1,
    "status": "PASS_HERO_CARDHEAD_MATERIALIZATION",
    "semanticStageReopened": False,
    "canonicalHeroCount": 267,
    "materializedCount": len(materialized),
    "fileCount": file_count,
    "distinctSourcePathCount": len({normalize_path(r["sourceCardHeadPath"]) for r in materialized}),
    "distinctContainerPathIdCount": len({r["containerPathId"] for r in materialized}),
    "distinctWebPathCount": len({r["webAssetPath"] for r in materialized}),
    "bundleReports": bundle_reports,
    "representative": [r for r in materialized if r["heroId"] in {1, 6, 12, 25, 69, 99284}],
    "rule": "Exact ConfigData CardHeadImage path -> exact updater bundle family -> exact Unity container path. No name JOIN, filename similarity, ID arithmetic, suffix guessing, or Hero semantic recomputation.",
}
MANIFEST.parent.mkdir(parents=True, exist_ok=True)
VALIDATION.parent.mkdir(parents=True, exist_ok=True)
MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
VALIDATION.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({
    "status": validation["status"],
    "materializedCount": len(materialized),
    "fileCount": file_count,
    "representative": validation["representative"],
    "bundleReports": bundle_reports,
}, ensure_ascii=False, indent=2))
