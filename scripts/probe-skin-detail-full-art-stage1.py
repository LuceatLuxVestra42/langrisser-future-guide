import binascii
import hashlib
import io
import json
import os
import pathlib
import struct
import urllib.request
import zlib
from collections import deque

import UnityPy

VERSION = "1.1.113"
BASE = f"http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VERSION}"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
OUTPUT = pathlib.Path(os.environ.get("GITHUB_WORKSPACE", ".")) / "skin-detail-full-art-stage1-probe.json"

# Frozen H-A5 official-client HeroPainting provenance. This probe reuses it verbatim;
# it does not rediscover Hero ownership or alter any Skin/Hero relation.
# bundle: packageIndexZeroBased, packageBytes, bundleBytes, md5, sha256, crc32
BUNDLES = {
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

REPRESENTATIVES = {
    "102": {"heroId": 1, "tokens": ["matthew", "mathew"], "skinTokens": ["skin01", "skin_01", "skin1"]},
    "1901": {"heroId": 19, "tokens": ["lista", "lester"], "skinTokens": ["skin01", "skin_01", "skin1"]},
    "3701": {"heroId": 37, "tokens": ["zigodlla", "zillagod"], "skinTokens": ["skin01", "skin_01", "skin1"]},
}

ALLOWED = {"GameObject", "Transform", "RectTransform", "MonoBehaviour", "CanvasRenderer", "SpriteRenderer", "Sprite", "Texture2D", "Material", "Animator", "Animation"}
ZIP_CACHE = {}


def norm(value):
    return str(value).replace("\\", "/").strip("/").lower()


def obj_type(obj):
    return getattr(getattr(obj, "type", None), "name", None)


def refs(value):
    out = []
    def walk(node, path=""):
        if isinstance(node, dict):
            if "m_FileID" in node and "m_PathID" in node:
                try:
                    out.append((path, int(node["m_FileID"]), int(node["m_PathID"])))
                except Exception:
                    pass
            for key, child in node.items():
                walk(child, f"{path}.{key}" if path else str(key))
        elif isinstance(node, list):
            for index, child in enumerate(node):
                walk(child, f"{path}[{index}]")
    walk(value)
    return out


def request(url, start=None, end=None):
    headers = {"User-Agent": UA, "Accept-Encoding": "identity"}
    if start is not None:
        headers["Range"] = f"bytes={start}-{end}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=90) as response:
        data = response.read()
    if start is not None and len(data) != end - start + 1:
        raise RuntimeError(f"range mismatch {len(data)} != {end-start+1}")
    return data


def head_size(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"}, method="HEAD")
    with urllib.request.urlopen(req, timeout=60) as response:
        return int(response.headers["Content-Length"])


def zip_directory(package_name, expected_bytes):
    if package_name in ZIP_CACHE:
        return ZIP_CACHE[package_name]
    url = f"{BASE}/{package_name}"
    total = head_size(url)
    if total != expected_bytes:
        raise RuntimeError(f"{package_name} size drift {total} != {expected_bytes}")
    tail_size = min(1048576, total)
    tail = request(url, total-tail_size, total-1)
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise RuntimeError(f"{package_name}: EOCD missing")
    _, _, _, _, central_size, central_offset, _ = struct.unpack_from("<HHHHIIH", tail, eocd+4)
    central = request(url, central_offset, central_offset+central_size-1)
    entries = {}
    i = 0
    while i + 46 <= len(central) and central[i:i+4] == b"PK\x01\x02":
        flags, method = struct.unpack_from("<HH", central, i+8)
        crc, compressed, uncompressed = struct.unpack_from("<III", central, i+16)
        fn_len, extra_len, comment_len = struct.unpack_from("<HHH", central, i+28)
        local_offset = struct.unpack_from("<I", central, i+42)[0]
        name_bytes = central[i+46:i+46+fn_len]
        name = name_bytes.decode("utf-8" if flags & 0x800 else "cp437", "replace")
        entries[norm(name)] = (name, method, f"{crc:08X}", compressed, uncompressed, local_offset)
        i += 46 + fn_len + extra_len + comment_len
    ZIP_CACHE[package_name] = (url, entries)
    return ZIP_CACHE[package_name]


def fetch_bundle(bundle_name, meta):
    package_index, package_bytes, bundle_bytes, md5, sha256, crc32 = meta
    package_name = f"InstallPage_{VERSION}_{package_index+1}.zip"
    url, entries = zip_directory(package_name, package_bytes)
    hits = [entry for key, entry in entries.items() if key == norm(bundle_name) or key.endswith("/" + norm(bundle_name))]
    if len(hits) != 1:
        raise RuntimeError(f"{bundle_name}: zip hits {len(hits)}")
    _, method, zip_crc, compressed, _, local_offset = hits[0]
    header = request(url, local_offset, local_offset+4095)
    _, method2 = struct.unpack_from("<HH", header, 6)
    fn_len, extra_len = struct.unpack_from("<HH", header, 26)
    if method != method2:
        raise RuntimeError(f"{bundle_name}: method mismatch")
    start = local_offset + 30 + fn_len + extra_len
    payload = request(url, start, start+compressed-1)
    raw = payload if method == 0 else zlib.decompress(payload, -15)
    actual = (len(raw), hashlib.md5(raw).hexdigest().upper(), hashlib.sha256(raw).hexdigest().upper(), f"{binascii.crc32(raw)&0xffffffff:08X}")
    expected = (bundle_bytes, md5, sha256, crc32)
    if actual != expected or zip_crc != crc32:
        raise RuntimeError(f"{bundle_name}: integrity mismatch actual={actual}")
    return raw, package_name


def renderable_candidates(objects, root_obj):
    tree_cache = {}
    def tree(path_id):
        if path_id not in tree_cache:
            try:
                tree_cache[path_id] = objects[path_id].read_typetree()
            except Exception:
                tree_cache[path_id] = None
        return tree_cache[path_id]

    root = int(root_obj.path_id)
    queue = deque([(root, 0)])
    seen = set()
    sprites = set()
    direct_textures = set()
    external_refs = []
    while queue and len(seen) < 600:
        path_id, depth = queue.popleft()
        if path_id in seen or depth > 12 or path_id not in objects:
            continue
        seen.add(path_id)
        current = objects[path_id]
        if obj_type(current) == "Sprite":
            sprites.add(path_id)
        if obj_type(current) == "Texture2D":
            direct_textures.add(path_id)
        tr = tree(path_id)
        if tr is None:
            continue
        for field, file_id, child_id in refs(tr):
            if file_id == 0 and child_id in objects and obj_type(objects[child_id]) in ALLOWED and child_id not in seen:
                queue.append((child_id, depth+1))
            elif file_id != 0:
                external_refs.append({"fromPathId": path_id, "field": field, "fileId": file_id, "pathId": child_id})

    candidates = []
    for sprite_id in sorted(sprites):
        try:
            sprite = objects[sprite_id].read()
            image = sprite.image
            texture_ids = []
            tr = tree(sprite_id)
            if tr is not None:
                for field, file_id, texture_id in refs(tr):
                    if field == "m_RD.texture" and file_id == 0 and texture_id in objects and obj_type(objects[texture_id]) == "Texture2D":
                        texture_ids.append(texture_id)
            candidates.append({
                "assetKind": "Sprite",
                "pathId": sprite_id,
                "name": str(getattr(sprite, "m_Name", "")),
                "texturePathIds": sorted(set(texture_ids)),
                "width": image.width,
                "height": image.height,
                "pixelArea": image.width * image.height,
            })
        except Exception as error:
            candidates.append({"assetKind": "Sprite", "pathId": sprite_id, "readError": str(error)})
    if not sprites:
        for texture_id in sorted(direct_textures):
            try:
                texture = objects[texture_id].read()
                image = texture.image
                candidates.append({
                    "assetKind": "Texture2D",
                    "pathId": texture_id,
                    "name": str(getattr(texture, "m_Name", "")),
                    "texturePathIds": [texture_id],
                    "width": image.width,
                    "height": image.height,
                    "pixelArea": image.width * image.height,
                })
            except Exception as error:
                candidates.append({"assetKind": "Texture2D", "pathId": texture_id, "readError": str(error)})
    return candidates, external_refs


def main():
    result = {
        "schemaVersion": 1,
        "stage": "skin-detail-full-art-stage1",
        "status": "DIAGNOSTIC_COMPLETE",
        "purpose": "Test whether the frozen H-A5 official HeroPainting bundle set contains separate Skin full-art prefab/image candidates for representative canonical Skin records. Discovery tokens are diagnostic only and are not a resolver.",
        "installVersion": VERSION,
        "baseRef": "Skin PR #184 head 62b9cd3a68a0ce9bde40319e8e2ecb3ee9347522",
        "representatives": REPRESENTATIVES,
        "guardrails": {
            "semanticMutation": False,
            "heroSkinRelationRecomputed": False,
            "nameTokenMayPromoteToResolver": False,
            "numericIdArithmetic": False,
            "frontendMutation": False,
            "classFusionTouched": False,
        },
        "bundleReports": [],
        "allSkinNamedContainers": [],
        "representativeMatches": {skin_id: [] for skin_id in REPRESENTATIVES},
    }

    for bundle_name, meta in BUNDLES.items():
        raw, package_name = fetch_bundle(bundle_name, meta)
        env = UnityPy.load(raw)
        objects = {int(obj.path_id): obj for obj in env.objects}
        containers = {norm(path): obj for path, obj in env.container.items()}
        paths = sorted(containers)
        skin_paths = [path for path in paths if "skin" in path]
        result["bundleReports"].append({
            "bundleName": bundle_name,
            "packageName": package_name,
            "containerCount": len(paths),
            "skinNamedContainerCount": len(skin_paths),
        })
        for path in skin_paths:
            obj = containers[path]
            candidates, external_refs = renderable_candidates(objects, obj)
            result["allSkinNamedContainers"].append({
                "bundleName": bundle_name,
                "containerPath": path,
                "rootPathId": int(obj.path_id),
                "renderableCandidates": candidates,
                "externalRefs": external_refs[:50],
            })
        for skin_id, rep in REPRESENTATIVES.items():
            token_matches = []
            for path in paths:
                low = path.lower()
                if any(token in low for token in rep["tokens"]):
                    token_matches.append(path)
            for path in token_matches:
                obj = containers[path]
                candidates, external_refs = renderable_candidates(objects, obj)
                result["representativeMatches"][skin_id].append({
                    "bundleName": bundle_name,
                    "containerPath": path,
                    "rootPathId": int(obj.path_id),
                    "hasSkinToken": "skin" in path.lower() or any(token in path.lower() for token in rep["skinTokens"]),
                    "renderableCandidates": candidates,
                    "externalRefs": external_refs[:50],
                })

    result["counts"] = {
        "bundleCount": len(result["bundleReports"]),
        "skinNamedContainerCount": len(result["allSkinNamedContainers"]),
        "representativeMatchCounts": {key: len(value) for key, value in result["representativeMatches"].items()},
        "representativeSkinTokenMatchCounts": {
            key: sum(1 for row in value if row["hasSkinToken"])
            for key, value in result["representativeMatches"].items()
        },
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
