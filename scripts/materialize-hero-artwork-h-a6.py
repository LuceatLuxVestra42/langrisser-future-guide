import binascii
import gc
import hashlib
import io
import json
import pathlib
import struct
import urllib.request
import zlib
from collections import Counter, defaultdict

import UnityPy
import PIL

VER = "1.1.113"
HA5_PREDECESSOR_COMMIT = "9e78ea1f9f6624636d4028dde826f9b79023c355"
BASE = f"http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VER}"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"

INDEX_DIR = pathlib.Path("data/generated/hero-artwork-h-a5-index.v1")
INDEX_MANIFEST = INDEX_DIR / "manifest.json"
HA5_VALIDATION = pathlib.Path("data/validation/hero-artwork-h-a5-final.v1.json")
OUT_DIR = pathlib.Path("public/images/heroes/cards")
WEB_MANIFEST = pathlib.Path("data/generated/hero-artwork-h-a6-web-assets.v1.json")
VALIDATION = pathlib.Path("data/validation/hero-artwork-h-a6-materialization.v1.json")
CHECKPOINT = pathlib.Path("data/checkpoints/hero-artwork-h-a6.txt")

# H-A5 frozen package/bundle provenance:
# bundle -> (package index, package bytes, bundle bytes, md5, sha256, crc32)
P = {
    "ui_heropainting_r_abs.b": (60, 109027105, 1234370, "19C940F7E635EC502768E701496F92B9", "4F5E6D8202DC62E483CB090973BE9FFB80B0B96B0354358259EEF62BC8BBCA25", "CE79F47D"),
    "begin_ui_heropainting_r_abs.b": (25, 113636260, 509982, "9D18E3360DE378C6FB8F5758F507D1A8", "71A830A444269E9611D74D8F9E880783FFEF291E2F2D9E34F29EF1CB0E21AB49", "98999A3B"),
    "ui_heropainting_sr_abs.b": (60, 109027105, 4204670, "50C4FFD5AB6F7CBD8A0B39117F9CA101", "294750FF12725BF5B8DF906B6CFAB702AF6352F7BAAF2203553E3E5EACDE8ED2", "BD688F0F"),
    "begin_ui_heropainting_sr_abs.b": (25, 113636260, 542747, "28C0FF4A9DD4B9E0E32CECDCFEB65465", "93D7B9BF9B51D4150AB99002AD5DC9BEDEE774BFCE03A9E0FF3CFC600E350654", "44BCA97B"),
    "ui_heropainting_ssr_abs.b": (60, 109027105, 25793935, "168B2D54E39D62B98CD1E92BDE9F787B", "818942EA601B584D007D97A0E2A388554AFBAF6A83A36302E241601015D87492", "4682CEA2"),
    "begin_ui_heropainting_ssr_abs.b": (25, 113636260, 3710837, "16CF10B79FF22F3CE1BF78B45D05DFA8", "7C1551C8A4626CAA0BAB5E83A6A5BC4B3EF804E831D570C724D94193C4569F8A", "A06A3B3B"),
    "ui_heropainting01_ssr_abs.b": (59, 109932003, 1691149, "62B9FBBF127C06DEB2DF05AAA7B27B45", "D6D6703231462DF82E0EFE4E04EF6DF007B040E64458C512BDB5A6A98BEFF085", "443949F3"),
    "ui_heropainting2_sr_abs.b": (59, 109932003, 129396, "A3562B74ED28963AB28C094F5D35D3AA", "26D42F36307FD0D2956852FE7578FAA86B5C93B5CDEEEC677422F2F69D0AF2F9", "2213DF27"),
    "ui_heropainting2_ssr_abs.b": (59, 109932003, 22281425, "F761441E61BDD29E4A15511AB586D010", "15C8BF6DA53E44FC6D252DAB82D2AED8320618A507F5AA24BA421E8ACF91A73C", "9E9468FC"),
    "begin_ui_heropainting2_ssr_abs.b": (25, 113636260, 2199501, "A147491BCABEA405E11C6B38CE341414", "60DEE0C7B95366FAA2A72FCB307674C0DF86CBD4334813A2831520C070C6E422", "0A6C0CCE"),
    "ui_heropainting3_ssr_abs.b": (60, 109027105, 5134422, "74E60EFC2536FC98EC1CD38CF099A043", "BDEA49BC1F33B76D39C68751A0B1A085DAF7300643BF1024562F5E9013B8B51E", "12D207E7"),
    "begin_ui_heropainting3_ssr_abs.b": (25, 113636260, 1185839, "497DA317E1BEF7118265BE556BC71C94", "EC8FB4D57ACDEEBC724AEBC183FA4A6B5AB2E7F08F196AA11536C24B7C33A1E1", "B048BBA2"),
}


def norm(value):
    return str(value).replace("\\", "/").strip("/").lower()


def obj_type(obj):
    return getattr(getattr(obj, "type", None), "name", None)


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest().upper()


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, doc):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes((json.dumps(doc, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


def req(url, start=None, end=None):
    headers = {"User-Agent": UA, "Accept-Encoding": "identity"}
    if start is not None:
        headers["Range"] = f"bytes={start}-{end}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=90) as response:
        data = response.read()
    if start is not None and len(data) != end - start + 1:
        raise RuntimeError(f"range mismatch {url}: {len(data)} != {end - start + 1}")
    return data


def head(url):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept-Encoding": "identity"},
        method="HEAD",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return int(response.headers["Content-Length"])


ZIP_CACHE = {}


def zipdir(package_name, expected_package_bytes):
    if package_name in ZIP_CACHE:
        return ZIP_CACHE[package_name]
    url = f"{BASE}/{package_name}"
    size = head(url)
    if size != expected_package_bytes:
        raise RuntimeError(f"{package_name} size drift {size} != {expected_package_bytes}")
    tail_size = min(1048576, size)
    tail = req(url, size - tail_size, size - 1)
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise RuntimeError(f"{package_name} EOCD missing")
    _, _, _, _, central_size, central_offset, _ = struct.unpack_from("<HHHHIIH", tail, eocd + 4)
    central = req(url, central_offset, central_offset + central_size - 1)
    entries = {}
    offset = 0
    while offset + 46 <= len(central) and central[offset : offset + 4] == b"PK\x01\x02":
        flags, method = struct.unpack_from("<HH", central, offset + 8)
        crc32, compressed_size, uncompressed_size = struct.unpack_from("<III", central, offset + 16)
        filename_len, extra_len, comment_len = struct.unpack_from("<HHH", central, offset + 28)
        local_offset = struct.unpack_from("<I", central, offset + 42)[0]
        name_bytes = central[offset + 46 : offset + 46 + filename_len]
        name = name_bytes.decode("utf-8" if flags & 0x800 else "cp437", "replace")
        entries[norm(name)] = {
            "name": name,
            "method": method,
            "crc32": f"{crc32:08X}",
            "compressedSize": compressed_size,
            "uncompressedSize": uncompressed_size,
            "localOffset": local_offset,
        }
        offset += 46 + filename_len + extra_len + comment_len
    result = {
        "url": url,
        "entries": entries,
        "directoryBytesFetched": tail_size + central_size,
    }
    ZIP_CACHE[package_name] = result
    return result


def extract_bundle(bundle_name):
    if bundle_name not in P:
        raise RuntimeError(f"missing frozen provenance for {bundle_name}")
    package_index, package_bytes, bundle_bytes, md5, sha256, crc32 = P[bundle_name]
    package_name = f"InstallPage_{VER}_{package_index + 1}.zip"
    directory = zipdir(package_name, package_bytes)
    hits = [
        entry
        for key, entry in directory["entries"].items()
        if key == norm(bundle_name) or key.endswith("/" + norm(bundle_name))
    ]
    if len(hits) != 1:
        raise RuntimeError(f"{bundle_name} zip hits {len(hits)}")
    hit = hits[0]
    local_offset = hit["localOffset"]
    local_header = req(directory["url"], local_offset, local_offset + 4095)
    method = struct.unpack_from("<H", local_header, 8)[0]
    filename_len, extra_len = struct.unpack_from("<HH", local_header, 26)
    compressed_start = local_offset + 30 + filename_len + extra_len
    compressed_end = compressed_start + hit["compressedSize"] - 1
    compressed = req(directory["url"], compressed_start, compressed_end)
    if method == 0:
        raw = compressed
    elif method == 8:
        raw = zlib.decompress(compressed, -15)
    else:
        raise RuntimeError(f"unsupported ZIP method {method} for {bundle_name}")
    actual = (
        len(raw),
        hashlib.md5(raw).hexdigest().upper(),
        sha256_bytes(raw),
        f"{binascii.crc32(raw) & 0xFFFFFFFF:08X}",
    )
    expected = (bundle_bytes, md5, sha256, crc32)
    if actual != expected or hit["crc32"] != crc32:
        raise RuntimeError(f"{bundle_name} integrity mismatch actual={actual} expected={expected}")
    return raw, {
        "packageIndex": package_index,
        "packageName": package_name,
        "packageBytes": package_bytes,
        "bundleName": bundle_name,
        "bundleBytes": bundle_bytes,
        "bundleMd5": md5,
        "bundleSha256": sha256,
        "bundleCrc32": crc32,
        "compressedBytesFetched": hit["compressedSize"],
        "directoryBytesFetched": directory["directoryBytesFetched"],
    }


def load_frozen_index():
    validation = read_json(HA5_VALIDATION)
    if validation.get("status") != "PASS_H_A5_BULK_EXTRACTION_INDEX_FINAL":
        raise RuntimeError(f"H-A5 validation not PASS: {validation.get('status')}")
    repair = validation.get("hashMetadataRepair", {})
    if repair.get("status") != "PASS_H_A5_HASH_METADATA_REPAIRED":
        raise RuntimeError(f"H-A5 hash metadata repair not PASS: {repair.get('status')}")
    if repair.get("semanticDataChanged") is not False or repair.get("rowDataChanged") is not False:
        raise RuntimeError("H-A5 repair unexpectedly changed semantic/row data")
    if validation.get("textHashBasis") != "REPOSITORY_UTF8_LF_BYTES":
        raise RuntimeError(f"unexpected H-A5 hash basis: {validation.get('textHashBasis')}")

    manifest_bytes = INDEX_MANIFEST.read_bytes()
    manifest_sha = sha256_bytes(manifest_bytes)
    if validation.get("manifestSha256") != manifest_sha:
        raise RuntimeError(
            f"H-A5 manifest freshness fail {manifest_sha} != {validation.get('manifestSha256')}"
        )
    manifest = json.loads(manifest_bytes.decode("utf-8"))
    if manifest.get("status") != "H_A5_BULK_EXTRACTION_INDEX_COMPLETE":
        raise RuntimeError(f"H-A5 manifest not complete: {manifest.get('status')}")
    if manifest.get("textHashBasis") != "REPOSITORY_UTF8_LF_BYTES":
        raise RuntimeError("H-A5 manifest hash basis drift")
    if manifest.get("canonicalHeroCount") != 267 or manifest.get("owningBundleCount") != 12:
        raise RuntimeError("H-A5 population/bundle count drift")

    rows = []
    for descriptor in manifest.get("bundles", []):
        path = pathlib.Path(descriptor["path"])
        data = path.read_bytes()
        actual_sha = sha256_bytes(data)
        if actual_sha != descriptor.get("sha256"):
            raise RuntimeError(f"H-A5 shard freshness fail {path}: {actual_sha} != {descriptor.get('sha256')}")
        shard = json.loads(data.decode("utf-8"))
        if shard.get("status") != "H_A5_BUNDLE_SHARD_COMPLETE":
            raise RuntimeError(f"incomplete H-A5 shard {path}")
        if shard.get("bundleName") != descriptor.get("bundleName"):
            raise RuntimeError(f"bundle descriptor mismatch {path}")
        if shard.get("heroCount") != descriptor.get("heroCount") or len(shard.get("heroes", [])) != descriptor.get("heroCount"):
            raise RuntimeError(f"Hero count mismatch {path}")
        rows.extend(shard["heroes"])

    if len(rows) != 267 or len({int(row["heroId"]) for row in rows}) != 267:
        raise RuntimeError("H-A5 row/hero uniqueness drift")
    if len({row["sourceArtworkPath"].lower() for row in rows}) != 267:
        raise RuntimeError("H-A5 sourceArtworkPath uniqueness drift")
    if len({row["targetWebPath"] for row in rows}) != 267:
        raise RuntimeError("H-A5 targetWebPath uniqueness drift")

    selection_counts = Counter(row["selectionStatus"] for row in rows)
    expected_selection = Counter({
        "UNIQUE_REFERENCED_SPRITE": 237,
        "DOMINANT_REFERENCED_SPRITE": 23,
        "EXTERNAL_DEPENDENCY_SPRITE_FILEID1": 7,
    })
    if selection_counts != expected_selection:
        raise RuntimeError(f"H-A5 selection count drift {dict(selection_counts)}")

    for row in rows:
        hero_id = int(row["heroId"])
        target = f"public/images/heroes/cards/{hero_id}.png"
        if row.get("targetWebPath") != target:
            raise RuntimeError(f"Hero {hero_id} target path drift")
        if row.get("spritePathId") is None or not row.get("texturePathIds"):
            raise RuntimeError(f"Hero {hero_id} missing frozen render path IDs")
        if row.get("selectionStatus") == "EXTERNAL_DEPENDENCY_SPRITE_FILEID1":
            render_bundle = row.get("dependencyBundleName")
            expected_sha = row.get("dependencyBundleSha256")
            if row.get("externalFileId") != 1:
                raise RuntimeError(f"Hero {hero_id} external fileID drift")
        else:
            render_bundle = row.get("bundleName")
            expected_sha = row.get("bundleSha256")
        if render_bundle not in P or P[render_bundle][4] != expected_sha:
            raise RuntimeError(f"Hero {hero_id} render bundle provenance drift: {render_bundle}")
        row["renderBundleName"] = render_bundle

    return validation, manifest, manifest_sha, rows


def main():
    ha5_validation, ha5_manifest, manifest_sha, rows = load_frozen_index()
    by_bundle = defaultdict(list)
    for row in rows:
        by_bundle[row["renderBundleName"]].append(row)
    if len(by_bundle) != 12:
        raise RuntimeError(f"render bundle count drift {len(by_bundle)} != 12")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for existing in OUT_DIR.glob("*.png"):
        existing.unlink()

    records = []
    bundle_results = []
    total_png_bytes = 0
    total_range_bytes = 0

    for bundle_name in sorted(by_bundle):
        raw, provenance = extract_bundle(bundle_name)
        env = UnityPy.load(raw)
        objects = {int(obj.path_id): obj for obj in env.objects}
        materialized = 0
        for row in sorted(by_bundle[bundle_name], key=lambda item: int(item["heroId"])):
            hero_id = int(row["heroId"])
            sprite_path_id = int(row["spritePathId"])
            sprite_obj = objects.get(sprite_path_id)
            if sprite_obj is None or obj_type(sprite_obj) != "Sprite":
                raise RuntimeError(
                    f"Hero {hero_id} exact Sprite {sprite_path_id} missing in {bundle_name}; "
                    f"type={obj_type(sprite_obj) if sprite_obj else None}"
                )
            for texture_path_id in row["texturePathIds"]:
                texture_obj = objects.get(int(texture_path_id))
                if texture_obj is None or obj_type(texture_obj) != "Texture2D":
                    raise RuntimeError(
                        f"Hero {hero_id} exact Texture2D {texture_path_id} missing in {bundle_name}"
                    )

            sprite = sprite_obj.read()
            image = sprite.image
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            png = buffer.getvalue()
            rgba = image.convert("RGBA").tobytes()
            width, height = image.width, image.height
            png_sha = sha256_bytes(png)
            rgba_sha = sha256_bytes(rgba)

            if width != int(row["width"]) or height != int(row["height"]):
                raise RuntimeError(
                    f"Hero {hero_id} dimensions {(width, height)} != {(row['width'], row['height'])}"
                )
            if png_sha != row["pngSha256"]:
                raise RuntimeError(f"Hero {hero_id} PNG SHA {png_sha} != {row['pngSha256']}")
            if rgba_sha != row["rgbaSha256"]:
                raise RuntimeError(f"Hero {hero_id} RGBA SHA {rgba_sha} != {row['rgbaSha256']}")

            output_path = pathlib.Path(row["targetWebPath"])
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(png)
            total_png_bytes += len(png)
            materialized += 1
            records.append({
                "heroId": hero_id,
                "path": row["targetWebPath"],
                "width": width,
                "height": height,
                "pngBytes": len(png),
                "pngSha256": png_sha,
                "rgbaSha256": rgba_sha,
                "selectionStatus": row["selectionStatus"],
                "renderBundleName": bundle_name,
                "spritePathId": sprite_path_id,
                "texturePathIds": [int(value) for value in row["texturePathIds"]],
                "status": "VERIFIED_EXACT_H_A5_HASH",
            })

        provenance["materializedHeroCount"] = materialized
        bundle_results.append(provenance)
        total_range_bytes += provenance["compressedBytesFetched"] + provenance["directoryBytesFetched"] + 4096
        del objects
        del env
        del raw
        gc.collect()

    records.sort(key=lambda item: item["heroId"])
    actual_files = sorted(OUT_DIR.glob("*.png"), key=lambda path: int(path.stem))
    expected_paths = {pathlib.Path(row["targetWebPath"]) for row in rows}
    actual_paths = set(actual_files)
    missing = sorted(path.as_posix() for path in expected_paths - actual_paths)
    extra = sorted(path.as_posix() for path in actual_paths - expected_paths)
    if len(records) != 267 or len(actual_files) != 267 or missing or extra:
        raise RuntimeError(
            f"coverage fail records={len(records)} files={len(actual_files)} missing={len(missing)} extra={len(extra)}"
        )

    selection_counts = dict(sorted(Counter(row["selectionStatus"] for row in rows).items()))
    web_manifest = {
        "schemaVersion": 1,
        "status": "H_A6_WEB_ASSETS_MATERIALIZED",
        "sourceIndexStatus": ha5_manifest["status"],
        "sourceIndexCommit": HA5_PREDECESSOR_COMMIT,
        "sourceIndexManifestPath": INDEX_MANIFEST.as_posix(),
        "sourceIndexManifestSha256": manifest_sha,
        "installVersion": VER,
        "heroCount": 267,
        "renderBundleCount": len(by_bundle),
        "targetWebContract": "public/images/heroes/cards/{heroId}.png",
        "selectionCounts": selection_counts,
        "records": records,
    }
    write_json(WEB_MANIFEST, web_manifest)
    web_manifest_sha = sha256_bytes(WEB_MANIFEST.read_bytes())

    package_names = sorted({item["packageName"] for item in bundle_results})
    validation = {
        "schemaVersion": 1,
        "status": "PASS_H_A6_HERO_ARTWORK_MATERIALIZATION",
        "sourceIndexStatus": ha5_manifest["status"],
        "sourceIndexValidationStatus": ha5_validation["status"],
        "sourceIndexHashRepairStatus": ha5_validation["hashMetadataRepair"]["status"],
        "sourceIndexCommit": HA5_PREDECESSOR_COMMIT,
        "sourceIndexManifestSha256": manifest_sha,
        "canonicalHeroCount": 267,
        "materializedHeroCount": len(records),
        "exactPngHashMatchCount": len(records),
        "exactRgbaHashMatchCount": len(records),
        "exactDimensionMatchCount": len(records),
        "missingAssetCount": len(missing),
        "extraAssetCount": len(extra),
        "uniqueWebPathCount": len({record["path"] for record in records}),
        "renderBundleCount": len(by_bundle),
        "packageCount": len(package_names),
        "packageNames": package_names,
        "selectionCounts": selection_counts,
        "totalPngBytes": total_png_bytes,
        "approxRangeBytesFetched": total_range_bytes,
        "webManifestPath": WEB_MANIFEST.as_posix(),
        "webManifestSha256": web_manifest_sha,
        "unityPyVersion": getattr(UnityPy, "__version__", None),
        "pillowVersion": PIL.__version__,
        "binaryCommitPerformedByWorkflow": True,
        "semanticRecomputationPerformed": False,
        "sourceArtworkPathRediscoveryPerformed": False,
        "prefabTraversalPerformed": False,
        "filenameSimilaritySelectionPerformed": False,
        "nameJoinPerformed": False,
        "idArithmeticPerformed": False,
        "bundleResults": bundle_results,
    }
    write_json(VALIDATION, validation)

    checkpoint = f"""Hero Artwork Asset Pipeline — H-A6 actual PNG materialization checkpoint
기준일: 2026-08-29

============================================================
1. 최종 판정
============================================================

status: PASS_H_A6_HERO_ARTWORK_MATERIALIZATION
completion: COMPLETE
canonical Hero: 267 / 267
materialized PNG: 267 / 267
exact PNG SHA-256 match: 267 / 267
exact RGBA SHA-256 match: 267 / 267
exact dimensions match: 267 / 267
missing asset: 0
extra asset: 0
render bundle: {len(by_bundle)}
package: {len(package_names)}
target web contract: public/images/heroes/cards/{{heroId}}.png

============================================================
2. authoritative predecessor
============================================================

H-A5 commit: {HA5_PREDECESSOR_COMMIT}
H-A5 validation: PASS_H_A5_BULK_EXTRACTION_INDEX_FINAL
H-A5 hash repair: PASS_H_A5_HASH_METADATA_REPAIRED
H-A5 manifest: {INDEX_MANIFEST.as_posix()}
H-A5 manifest SHA256: {manifest_sha}

H-A5의 exact Sprite pathId / dependency bundle / dimensions / PNG·RGBA hash를 그대로 소비했다.
sourceArtworkPath 재탐색, prefab PPtr 재순회, filename similarity, name JOIN, ID arithmetic은 수행하지 않았다.

============================================================
3. materialization 규칙
============================================================

- UNIQUE_REFERENCED_SPRITE: 237
- DOMINANT_REFERENCED_SPRITE: 23
- EXTERNAL_DEPENDENCY_SPRITE_FILEID1: 7

normal/dominant record:
H-A5 bundleName -> exact spritePathId -> Sprite.image -> PNG

external dependency 7:
H-A5 dependencyBundleName -> exact spritePathId -> Sprite.image -> PNG

각 render bundle은 이 run에서 1회 fetch/decompress/decode했다.
각 PNG는 H-A5 width/height, PNG SHA-256, RGBA SHA-256 모두 일치해야만 admission했다.

============================================================
4. generated / validation
============================================================

web manifest: {WEB_MANIFEST.as_posix()}
web manifest SHA256: {web_manifest_sha}
validation: {VALIDATION.as_posix()}
actual binaries: public/images/heroes/cards/{{heroId}}.png
PNG total bytes: {total_png_bytes}

============================================================
5. 다시 열지 않는 범위
============================================================

다음은 H-A5/H-A6 upstream evidence 변경 없이는 재조사하지 않는다.
- canonical Hero 267 artwork locator
- 7 family / 12 bundle extraction mapping
- H-A4 prefab ownership final 240 / begin 27
- H-A5 exact Sprite/Texture path IDs
- dominant 23 selection rule
- external dependency 7 relation
- 267 PNG bytes/hash materialization

============================================================
6. 다시 열리는 조건
============================================================

- H-A5 frozen index manifest/row 내용 변경
- canonical Hero population 또는 ID 변경
- official package/bundle provenance가 frozen hash와 불일치
- committed PNG가 H-A5 width/PNG hash/RGBA hash 검증 실패
- Hero artwork web-path contract 변경

============================================================
7. 다음 시작점
============================================================

Hero frontend에서 canonical artwork resolver의 267/267 RESOLVED coverage를 검증한다.
그 뒤 presentation 계층으로만 진행한다.

Preflight -> Build -> Deployment/Hosted -> Browser/UI

asset/frontend 문제만으로 Hero FINAL_FROZEN semantic stages는 다시 열지 않는다.
"""
    CHECKPOINT.parent.mkdir(parents=True, exist_ok=True)
    CHECKPOINT.write_bytes(checkpoint.encode("utf-8"))

    print(json.dumps({
        "status": validation["status"],
        "materializedHeroCount": len(records),
        "exactPngHashMatchCount": len(records),
        "exactRgbaHashMatchCount": len(records),
        "exactDimensionMatchCount": len(records),
        "missingAssetCount": len(missing),
        "extraAssetCount": len(extra),
        "renderBundleCount": len(by_bundle),
        "packageCount": len(package_names),
        "totalPngBytes": total_png_bytes,
        "webManifestSha256": web_manifest_sha,
    }, ensure_ascii=True))


if __name__ == "__main__":
    main()
