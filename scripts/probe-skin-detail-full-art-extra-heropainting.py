import hashlib
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
OUTPUT = pathlib.Path(os.environ.get("GITHUB_WORKSPACE", ".")) / "skin-detail-full-art-stage1-extra-heropainting.json"

TARGETS = [
    {"packagePart": 26, "packageBytes": 113636260, "bundleName": "begin_ui_heropainting01_ssr_abs.b"},
    {"packagePart": 60, "packageBytes": 109932003, "bundleName": "ui_heropainting01_sr_abs.b"},
]
REPRESENTATIVES = {
    "102": ["matthew", "mathew"],
    "1901": ["lista", "lester"],
    "3701": ["zigodlla", "zillagod"],
}
ALLOWED = {"GameObject", "Transform", "RectTransform", "MonoBehaviour", "CanvasRenderer", "SpriteRenderer", "Sprite", "Texture2D", "Material", "Animator", "Animation"}


def norm(value):
    return str(value).replace("\\", "/").strip("/").lower()


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


def central_entries(package_part, expected_package_bytes):
    package_name = f"InstallPage_{VERSION}_{package_part}.zip"
    url = f"{BASE}/{package_name}"
    total = head_size(url)
    if total != expected_package_bytes:
        raise RuntimeError(f"{package_name} size drift {total} != {expected_package_bytes}")
    tail_size = min(131072, total)
    tail = request(url, total-tail_size, total-1)
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise RuntimeError("EOCD missing")
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
        entries[norm(name)] = {
            "name": name,
            "method": method,
            "crc32": f"{crc:08X}",
            "compressed": compressed,
            "uncompressed": uncompressed,
            "localOffset": local_offset,
        }
        i += 46 + fn_len + extra_len + comment_len
    return package_name, url, entries


def fetch_target(target):
    package_name, url, entries = central_entries(target["packagePart"], target["packageBytes"])
    bundle_name = target["bundleName"]
    hits = [row for key, row in entries.items() if key == norm(bundle_name) or key.endswith("/" + norm(bundle_name))]
    if len(hits) != 1:
        raise RuntimeError(f"{bundle_name}: zip hits {len(hits)}")
    row = hits[0]
    header = request(url, row["localOffset"], row["localOffset"]+4095)
    _, method2 = struct.unpack_from("<HH", header, 6)
    fn_len, extra_len = struct.unpack_from("<HH", header, 26)
    if row["method"] != method2:
        raise RuntimeError("compression method mismatch")
    start = row["localOffset"] + 30 + fn_len + extra_len
    payload = request(url, start, start+row["compressed"]-1)
    raw = payload if row["method"] == 0 else zlib.decompress(payload, -15)
    if len(raw) != row["uncompressed"]:
        raise RuntimeError(f"{bundle_name}: uncompressed length mismatch")
    return raw, {
        "packageName": package_name,
        "bundleName": bundle_name,
        "bundleBytes": len(raw),
        "bundleSha256": hashlib.sha256(raw).hexdigest().upper(),
        "zipCrc32": row["crc32"],
    }


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


def renderables(objects, root_obj):
    cache = {}
    def tree(path_id):
        if path_id not in cache:
            try:
                cache[path_id] = objects[path_id].read_typetree()
            except Exception:
                cache[path_id] = None
        return cache[path_id]
    queue = deque([(int(root_obj.path_id), 0)])
    seen = set()
    sprites = set()
    while queue and len(seen) < 600:
        path_id, depth = queue.popleft()
        if path_id in seen or depth > 12 or path_id not in objects:
            continue
        seen.add(path_id)
        obj = objects[path_id]
        if obj_type(obj) == "Sprite":
            sprites.add(path_id)
        tr = tree(path_id)
        if tr is None:
            continue
        for _, file_id, child_id in refs(tr):
            if file_id == 0 and child_id in objects and obj_type(objects[child_id]) in ALLOWED and child_id not in seen:
                queue.append((child_id, depth+1))
    rows = []
    for sprite_id in sorted(sprites):
        try:
            sprite = objects[sprite_id].read()
            image = sprite.image
            rows.append({"spritePathId": sprite_id, "name": str(getattr(sprite, "m_Name", "")), "width": image.width, "height": image.height})
        except Exception as error:
            rows.append({"spritePathId": sprite_id, "readError": str(error)})
    return rows


def main():
    result = {
        "schemaVersion": 1,
        "stage": "skin-detail-full-art-stage1",
        "substage": "remaining-heropainting-bundles",
        "status": "DIAGNOSTIC_COMPLETE",
        "guardrails": {"semanticMutation": False, "resolverInferred": False, "frontendMutation": False, "classFusionTouched": False},
        "bundles": [],
        "skinNamedContainers": [],
        "representativeMatches": {key: [] for key in REPRESENTATIVES},
    }
    for target in TARGETS:
        raw, provenance = fetch_target(target)
        env = UnityPy.load(raw)
        objects = {int(obj.path_id): obj for obj in env.objects}
        containers = {norm(path): obj for path, obj in env.container.items()}
        paths = sorted(containers)
        skin_paths = [path for path in paths if "skin" in path]
        result["bundles"].append({**provenance, "containerCount": len(paths), "skinNamedContainerCount": len(skin_paths)})
        for path in skin_paths:
            obj = containers[path]
            result["skinNamedContainers"].append({"bundleName": target["bundleName"], "containerPath": path, "rootPathId": int(obj.path_id), "renderables": renderables(objects, obj)})
        for skin_id, tokens in REPRESENTATIVES.items():
            for path in paths:
                if any(token in path for token in tokens):
                    obj = containers[path]
                    result["representativeMatches"][skin_id].append({"bundleName": target["bundleName"], "containerPath": path, "rootPathId": int(obj.path_id), "renderables": renderables(objects, obj)})
    result["counts"] = {
        "bundleCount": len(result["bundles"]),
        "skinNamedContainerCount": len(result["skinNamedContainers"]),
        "representativeMatchCounts": {key: len(value) for key, value in result["representativeMatches"].items()},
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
