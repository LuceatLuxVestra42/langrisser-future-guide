import binascii
import hashlib
import io
import json
import os
import pathlib
import struct
import urllib.request
import zlib
from collections import Counter, deque

import UnityPy

VERSION = "1.1.113"
BASE = f"http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VERSION}"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
WORKSPACE = pathlib.Path(os.environ.get("GITHUB_WORKSPACE", "."))
OUTPUT = WORKSPACE / "skin-detail-spine-stage2-probe.json"
ARTIFACT_ROOT = WORKSPACE / "skin-detail-spine-stage2-artifacts"

# Frozen representative CHAR_SPINE evidence from Skin Stage 3-3/3-4.
# No identity, ownership, sourceOrder, or bundle selection is recomputed here.
TARGETS = {
    "102": {
        "heroId": 1,
        "bundle": "begin_spine_char_mathew_abs.b",
        "bundleSizeBytes": 4651863,
        "bundleSha256": "8d2525638331fe5b0e4af8801e32548a11d29de717d52cdf0471a0590b6cc5d3",
        "embeddedCab": "CAB-2e27f57877e44e80035e619df0caf9af",
        "runtimePath": "assets/gameproject/runtimeassets/spine/char/mathew_abs/mathew_skin01_prefab.prefab",
    },
    "1901": {
        "heroId": 19,
        "bundle": "spine_char_lista_abs.b",
        "bundleSizeBytes": 1497970,
        "bundleSha256": "38576ff406951938907e9f65a2cf34b54a31a1f23343d2eb8c91fdf1e77c67e1",
        "embeddedCab": "CAB-754c9f6f680c3fa2e538ec209e30c733",
        "runtimePath": "assets/gameproject/runtimeassets/spine/char/lista_abs/lista_skin01_prefab.prefab",
    },
    "3701": {
        "heroId": 37,
        "bundle": "spine_char_zigodlla_abs.b",
        "bundleSizeBytes": 8027088,
        "bundleSha256": "8addf342cf0ae3c5db5c3d5bcded4505d690df5fe37bafcfcc613b8cd412ae25",
        "embeddedCab": "CAB-f26dedd3e48d64b01421bdba222c7e76",
        "runtimePath": "assets/gameproject/runtimeassets/spine/char/zigodlla_abs/zigodlla_skin01_prefab.prefab",
    },
}

MAX_PACKAGE_PART = 68
INTERESTING_TOKENS = (
    "spine", "skeleton", "atlas", "material", "texture", "animation", "skin",
    "data", "asset", "renderer", "mesh", "slot", "attachment"
)


def norm(value):
    return str(value).replace("\\", "/").strip("/").lower()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_name(value: str) -> str:
    out = "".join(c if c.isalnum() or c in "._-" else "_" for c in value)
    return out.strip("._") or "asset"


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
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept-Encoding": "identity"},
        method="HEAD",
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return int(response.headers["Content-Length"])


def zip_directory(part: int):
    package_name = f"InstallPage_{VERSION}_{part}.zip"
    url = f"{BASE}/{package_name}"
    total = head_size(url)
    tail_size = min(1048576, total)
    tail = request(url, total - tail_size, total - 1)
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise RuntimeError(f"{package_name}: EOCD missing")
    _, _, _, _, central_size, central_offset, _ = struct.unpack_from("<HHHHIIH", tail, eocd + 4)
    central = request(url, central_offset, central_offset + central_size - 1)
    entries = []
    i = 0
    while i + 46 <= len(central) and central[i:i+4] == b"PK\x01\x02":
        flags, method = struct.unpack_from("<HH", central, i + 8)
        crc, compressed, uncompressed = struct.unpack_from("<III", central, i + 16)
        fn_len, extra_len, comment_len = struct.unpack_from("<HHH", central, i + 28)
        local_offset = struct.unpack_from("<I", central, i + 42)[0]
        name_bytes = central[i + 46:i + 46 + fn_len]
        name = name_bytes.decode("utf-8" if flags & 0x800 else "cp437", "replace")
        entries.append({
            "name": name,
            "normName": norm(name),
            "method": method,
            "crc32": f"{crc:08X}",
            "compressedSize": compressed,
            "uncompressedSize": uncompressed,
            "localOffset": local_offset,
        })
        i += 46 + fn_len + extra_len + comment_len
    return {"part": part, "packageName": package_name, "packageSizeBytes": total, "url": url, "entries": entries}


def discover_target_entries():
    remaining = {meta["bundle"] for meta in TARGETS.values()}
    found = {}
    scanned = []
    for part in range(1, MAX_PACKAGE_PART + 1):
        info = zip_directory(part)
        hits = []
        for entry in info["entries"]:
            base = pathlib.PurePosixPath(entry["normName"]).name
            if base in remaining:
                found[base] = {
                    **entry,
                    "part": part,
                    "packageName": info["packageName"],
                    "packageSizeBytes": info["packageSizeBytes"],
                    "url": info["url"],
                }
                hits.append(base)
        scanned.append({
            "part": part,
            "packageName": info["packageName"],
            "packageSizeBytes": info["packageSizeBytes"],
            "entryCount": len(info["entries"]),
            "targetHits": sorted(hits),
        })
        remaining -= set(hits)
        if not remaining:
            break
    if remaining:
        raise RuntimeError(f"official installer did not contain frozen CHAR_SPINE bundles: {sorted(remaining)}")
    return found, scanned


def fetch_zip_entry(meta):
    url = meta["url"]
    local_offset = meta["localOffset"]
    header = request(url, local_offset, local_offset + 4095)
    flags, method = struct.unpack_from("<HH", header, 6)
    fn_len, extra_len = struct.unpack_from("<HH", header, 26)
    if method != meta["method"]:
        raise RuntimeError(f"ZIP method mismatch for {meta['name']}")
    start = local_offset + 30 + fn_len + extra_len
    payload = request(url, start, start + meta["compressedSize"] - 1)
    if method == 0:
        raw = payload
    elif method == 8:
        raw = zlib.decompress(payload, -15)
    else:
        raise RuntimeError(f"unsupported ZIP method {method} for {meta['name']}")
    crc = f"{binascii.crc32(raw) & 0xffffffff:08X}"
    if crc != meta["crc32"]:
        raise RuntimeError(f"ZIP CRC mismatch for {meta['name']}: {crc} != {meta['crc32']}")
    if len(raw) != meta["uncompressedSize"]:
        raise RuntimeError(f"ZIP uncompressed size mismatch for {meta['name']}")
    return raw


def object_type(obj):
    return getattr(getattr(obj, "type", None), "name", None)


def resolve_container_value(value):
    deref = getattr(value, "deref", None)
    return deref() if callable(deref) else value


def pptr_refs(value):
    refs = []
    def walk(node, path=""):
        if isinstance(node, dict):
            if "m_FileID" in node and "m_PathID" in node:
                try:
                    refs.append({
                        "field": path,
                        "fileId": int(node["m_FileID"]),
                        "pathId": int(node["m_PathID"]),
                    })
                except Exception:
                    pass
            for key, child in node.items():
                walk(child, f"{path}.{key}" if path else str(key))
        elif isinstance(node, list):
            for index, child in enumerate(node):
                walk(child, f"{path}[{index}]")
    walk(value)
    return refs


def object_name(obj):
    try:
        parsed = obj.read()
        name = getattr(parsed, "m_Name", None)
        return str(name) if name is not None else None
    except Exception:
        return None


def mono_script_info(obj):
    if object_type(obj) != "MonoBehaviour":
        return None
    try:
        parsed = obj.read()
        script_ptr = getattr(parsed, "m_Script", None)
        if script_ptr is None:
            return {"status": "NO_SCRIPT_PTR"}
        file_id = getattr(script_ptr, "m_FileID", None)
        path_id = getattr(script_ptr, "m_PathID", None)
        deref = getattr(script_ptr, "deref", None)
        if callable(deref):
            script_obj = deref()
            script = script_obj.read()
            return {
                "status": "RESOLVED",
                "fileId": file_id,
                "pathId": path_id,
                "name": str(getattr(script, "m_Name", "")),
                "className": str(getattr(script, "m_ClassName", "")),
                "namespace": str(getattr(script, "m_Namespace", "")),
                "assemblyName": str(getattr(script, "m_AssemblyName", "")),
            }
        return {"status": "UNRESOLVED_PTR", "fileId": file_id, "pathId": path_id}
    except Exception as exc:
        return {"status": "ERROR", "error": str(exc)}


def text_asset_bytes(obj):
    parsed = obj.read()
    for attr in ("m_Script", "script"):
        value = getattr(parsed, attr, None)
        if isinstance(value, bytes):
            return value
        if isinstance(value, bytearray):
            return bytes(value)
        if isinstance(value, str):
            return value.encode("utf-8", "replace")
    raw = obj.get_raw_data()
    return bytes(raw)


def flatten_interesting(tree):
    out = []
    def walk(node, path=""):
        if isinstance(node, dict):
            for key, value in node.items():
                child_path = f"{path}.{key}" if path else str(key)
                if any(token in key.lower() for token in INTERESTING_TOKENS):
                    if isinstance(value, (str, int, float, bool)) or value is None:
                        out.append({"field": child_path, "value": value})
                    elif isinstance(value, dict) and "m_FileID" in value and "m_PathID" in value:
                        out.append({
                            "field": child_path,
                            "pptr": {
                                "fileId": value.get("m_FileID"),
                                "pathId": value.get("m_PathID"),
                            },
                        })
                    else:
                        out.append({"field": child_path, "valueType": type(value).__name__})
                walk(value, child_path)
        elif isinstance(node, list):
            for index, value in enumerate(node):
                walk(value, f"{path}[{index}]")
    walk(tree)
    return out[:200]


def assets_file_name(obj):
    af = getattr(obj, "assets_file", None)
    if af is None:
        return None
    name = getattr(af, "name", None)
    if isinstance(name, str) and name:
        return pathlib.PurePosixPath(name.replace("\\", "/")).name
    parent = getattr(af, "parent", None)
    files = getattr(parent, "files", None)
    if hasattr(files, "items"):
        for key, value in files.items():
            if value is af:
                return pathlib.PurePosixPath(str(key).replace("\\", "/")).name
    return None


def graph_probe(env, root_obj, skin_id):
    all_objects = {int(obj.path_id): obj for obj in env.objects}
    queue = deque([(int(root_obj.path_id), 0)])
    seen = set()
    edges = []
    external_refs = []
    object_rows = []
    type_counts = Counter()
    mono_scripts = []
    export_dir = ARTIFACT_ROOT / skin_id
    export_dir.mkdir(parents=True, exist_ok=True)
    exported = []

    tree_cache = {}
    def tree_for(obj):
        pid = int(obj.path_id)
        if pid not in tree_cache:
            try:
                tree_cache[pid] = obj.read_typetree()
            except Exception as exc:
                tree_cache[pid] = {"__typetreeError": str(exc)}
        return tree_cache[pid]

    while queue and len(seen) < 1200:
        path_id, depth = queue.popleft()
        if path_id in seen or path_id not in all_objects or depth > 18:
            continue
        seen.add(path_id)
        obj = all_objects[path_id]
        typ = object_type(obj)
        type_counts[typ or "UNKNOWN"] += 1
        tree = tree_for(obj)
        refs = [] if "__typetreeError" in tree else pptr_refs(tree)
        interesting = [] if "__typetreeError" in tree else flatten_interesting(tree)
        row = {
            "pathId": path_id,
            "type": typ,
            "name": object_name(obj),
            "assetsFile": assets_file_name(obj),
            "depth": depth,
            "refCount": len(refs),
            "interestingFields": interesting,
        }
        if "__typetreeError" in tree:
            row["typetreeError"] = tree["__typetreeError"]
        if typ == "MonoBehaviour":
            script = mono_script_info(obj)
            row["script"] = script
            mono_scripts.append(script)
        if typ == "TextAsset":
            try:
                data = text_asset_bytes(obj)
                row["textAsset"] = {
                    "sizeBytes": len(data),
                    "sha256": sha256_bytes(data),
                    "headHex": data[:48].hex(),
                    "headAscii": "".join(chr(b) if 32 <= b <= 126 else "." for b in data[:96]),
                }
                filename = f"text-{path_id}-{safe_name(row['name'] or 'unnamed')}.bin"
                path = export_dir / filename
                path.write_bytes(data)
                exported.append({"role": "TEXT_ASSET", "path": path.relative_to(WORKSPACE).as_posix(), "sizeBytes": len(data), "sha256": sha256_bytes(data)})
            except Exception as exc:
                row["textAssetError"] = str(exc)
        elif typ == "Texture2D":
            try:
                parsed = obj.read()
                image = parsed.image
                buf = io.BytesIO()
                image.save(buf, format="PNG")
                png = buf.getvalue()
                row["texture"] = {
                    "width": image.width,
                    "height": image.height,
                    "pngSha256": sha256_bytes(png),
                }
                filename = f"texture-{path_id}-{safe_name(row['name'] or 'unnamed')}.png"
                path = export_dir / filename
                path.write_bytes(png)
                exported.append({"role": "TEXTURE", "path": path.relative_to(WORKSPACE).as_posix(), "sizeBytes": len(png), "sha256": sha256_bytes(png), "width": image.width, "height": image.height})
            except Exception as exc:
                row["textureError"] = str(exc)
        elif typ == "Sprite":
            try:
                parsed = obj.read()
                image = parsed.image
                row["sprite"] = {"width": image.width, "height": image.height}
            except Exception as exc:
                row["spriteError"] = str(exc)
        object_rows.append(row)

        for ref in refs:
            edge = {"fromPathId": path_id, **ref}
            if ref["fileId"] == 0 and ref["pathId"] in all_objects:
                target = all_objects[ref["pathId"]]
                edge["toType"] = object_type(target)
                edge["toName"] = object_name(target)
                if ref["pathId"] not in seen:
                    queue.append((ref["pathId"], depth + 1))
            else:
                external_refs.append(edge)
            edges.append(edge)

    spine_script_rows = []
    for script in mono_scripts:
        if not isinstance(script, dict):
            continue
        combined = " ".join(str(script.get(k, "")) for k in ("name", "className", "namespace", "assemblyName")).lower()
        if "spine" in combined or "skeleton" in combined:
            spine_script_rows.append(script)

    graph_text_assets = [row for row in object_rows if row.get("type") == "TextAsset"]
    graph_textures = [row for row in object_rows if row.get("type") == "Texture2D"]
    graph_materials = [row for row in object_rows if row.get("type") == "Material"]
    graph_meshes = [row for row in object_rows if row.get("type") == "Mesh"]

    if not spine_script_rows:
        feasibility = "NO_CONFIRMED_SPINE_RUNTIME_COMPONENT"
    elif external_refs:
        feasibility = "SPINE_COMPONENT_WITH_EXTERNAL_DEPENDENCIES"
    elif graph_text_assets and graph_textures:
        feasibility = "LOCAL_SPINE_RENDER_INPUTS_PRESENT"
    elif graph_textures:
        feasibility = "SPINE_COMPONENT_TEXTURES_PRESENT_DATA_UNRESOLVED"
    else:
        feasibility = "SPINE_COMPONENT_PRESENT_RENDER_INPUTS_UNRESOLVED"

    return {
        "rootPathId": int(root_obj.path_id),
        "visitedObjectCount": len(seen),
        "objectTypeCounts": dict(sorted(type_counts.items())),
        "spineScriptCount": len(spine_script_rows),
        "spineScripts": spine_script_rows,
        "textAssetCount": len(graph_text_assets),
        "textureCount": len(graph_textures),
        "materialCount": len(graph_materials),
        "meshCount": len(graph_meshes),
        "externalRefCount": len(external_refs),
        "externalRefs": external_refs[:300],
        "feasibilityClass": feasibility,
        "objects": object_rows,
        "edges": edges,
        "exportedArtifacts": exported,
        "traversalTruncated": bool(queue),
    }


def asset_bundle_dependencies(env):
    deps = []
    reports = []
    for obj in env.objects:
        if object_type(obj) != "AssetBundle":
            continue
        try:
            parsed = obj.read()
            values = getattr(parsed, "m_Dependencies", None)
            if values is not None:
                for item in values:
                    deps.append(str(item))
            reports.append({
                "pathId": int(obj.path_id),
                "name": str(getattr(parsed, "m_Name", "")),
                "dependencies": [str(x) for x in (values or [])],
            })
        except Exception as exc:
            reports.append({"pathId": int(obj.path_id), "error": str(exc)})
    return sorted(set(deps)), reports


def main():
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    discovered, package_scan = discover_target_entries()
    result = {
        "schemaVersion": 1,
        "stage": "skin-detail-spine-stage2",
        "status": "DIAGNOSTIC_COMPLETE",
        "purpose": "Determine whether the frozen representative CHAR_SPINE prefabs expose exact dependency inputs sufficient for a separate full-body render feasibility path. This does not claim equivalence to HeroPainting static illustration.",
        "installVersion": VERSION,
        "authoritativePredecessors": {
            "skinPr": 184,
            "skinHeadSha": "62b9cd3a68a0ce9bde40319e8e2ecb3ee9347522",
            "stage1Checkpoint": "data/checkpoints/skin-detail-full-art-stage1.v1.json",
            "stage1Status": "SKIN_DETAIL_FULL_ART_STAGE1_COMPLETE_NO_STATIC_SOURCE",
        },
        "guardrails": {
            "canonicalSkinRecomputed": False,
            "heroSkinOwnershipRecomputed": False,
            "sourceOrderRecomputed": False,
            "bundleSelectionRecomputed": False,
            "nameJoinUsed": False,
            "numericIdArithmetic": False,
            "frontendMutation": False,
            "publicSkinAssetMutation": False,
            "classFusionTouched": False,
            "charSpineMayBeRelabeledAsStaticIllustration": False,
        },
        "packageScan": package_scan,
        "records": [],
    }

    for skin_id, target in TARGETS.items():
        entry = discovered[target["bundle"]]
        raw = fetch_zip_entry(entry)
        actual_sha = sha256_bytes(raw)
        if len(raw) != target["bundleSizeBytes"]:
            raise RuntimeError(f"Skin {skin_id}: frozen bundle size mismatch {len(raw)} != {target['bundleSizeBytes']}")
        if actual_sha.lower() != target["bundleSha256"].lower():
            raise RuntimeError(f"Skin {skin_id}: frozen bundle SHA mismatch {actual_sha} != {target['bundleSha256']}")

        env = UnityPy.load(raw)
        container_index = {}
        for path, value in env.container.items():
            if not isinstance(path, str):
                continue
            container_index.setdefault(norm(path), []).append((path, resolve_container_value(value)))
        matches = container_index.get(norm(target["runtimePath"]), [])
        if len(matches) != 1:
            raise RuntimeError(f"Skin {skin_id}: exact CHAR_SPINE container match count {len(matches)}")
        actual_path, root_obj = matches[0]
        if object_type(root_obj) != "GameObject":
            raise RuntimeError(f"Skin {skin_id}: CHAR_SPINE root is {object_type(root_obj)}, expected GameObject")
        cab_name = assets_file_name(root_obj)
        if cab_name is None or cab_name.lower() != target["embeddedCab"].lower():
            raise RuntimeError(f"Skin {skin_id}: embedded CAB mismatch {cab_name} != {target['embeddedCab']}")

        deps, dependency_reports = asset_bundle_dependencies(env)
        graph = graph_probe(env, root_obj, skin_id)
        result["records"].append({
            "skinId": int(skin_id),
            "heroId": target["heroId"],
            "frozenRuntimePath": target["runtimePath"],
            "actualContainerPath": actual_path,
            "source": {
                "bundle": target["bundle"],
                "bundleSizeBytes": len(raw),
                "bundleSha256": actual_sha,
                "embeddedCab": cab_name,
                "officialPackagePart": entry["part"],
                "officialPackageName": entry["packageName"],
                "zipEntryName": entry["name"],
                "zipCrc32": entry["crc32"],
            },
            "assetBundleDependencies": deps,
            "assetBundleDependencyReports": dependency_reports,
            "graph": graph,
        })

    classes = Counter(r["graph"]["feasibilityClass"] for r in result["records"])
    result["summary"] = {
        "representativeCount": len(result["records"]),
        "exactBundleVerified": len(result["records"]),
        "exactPrefabVerified": len(result["records"]),
        "feasibilityClasses": dict(sorted(classes.items())),
        "allHaveConfirmedSpineRuntimeComponent": all(r["graph"]["spineScriptCount"] > 0 for r in result["records"]),
        "allHaveLocalTextAsset": all(r["graph"]["textAssetCount"] > 0 for r in result["records"]),
        "allHaveLocalTexture": all(r["graph"]["textureCount"] > 0 for r in result["records"]),
        "allExternalRefFree": all(r["graph"]["externalRefCount"] == 0 for r in result["records"]),
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": result["status"], "summary": result["summary"], "output": str(OUTPUT)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
