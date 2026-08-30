import json
import os
import pathlib
import struct
import urllib.error
import urllib.request

VERSION = "1.1.113"
BASE = f"http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VERSION}"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
OUTPUT = pathlib.Path(os.environ.get("GITHUB_WORKSPACE", ".")) / "skin-detail-full-art-stage1-catalog.json"
MAX_PART = 90


def norm(value):
    return str(value).replace("\\", "/").strip("/").lower()


def request(url, start=None, end=None):
    headers = {"User-Agent": UA, "Accept-Encoding": "identity"}
    if start is not None:
        headers["Range"] = f"bytes={start}-{end}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as response:
        data = response.read()
    if start is not None and len(data) != end - start + 1:
        raise RuntimeError(f"range mismatch {len(data)} != {end-start+1}")
    return data


def head_size(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"}, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return int(response.headers["Content-Length"])
    except urllib.error.HTTPError as error:
        if error.code in (403, 404):
            return None
        raise


def list_zip_entries(url, total):
    # ZIP EOCD is within the final 65,557 bytes unless a non-standard archive is used.
    tail_size = min(131072, total)
    tail = request(url, total-tail_size, total-1)
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise RuntimeError("EOCD missing")
    _, _, _, _, central_size, central_offset, _ = struct.unpack_from("<HHHHIIH", tail, eocd+4)
    central = request(url, central_offset, central_offset+central_size-1)
    names = []
    i = 0
    while i + 46 <= len(central) and central[i:i+4] == b"PK\x01\x02":
        flags = struct.unpack_from("<H", central, i+8)[0]
        fn_len, extra_len, comment_len = struct.unpack_from("<HHH", central, i+28)
        name_bytes = central[i+46:i+46+fn_len]
        name = name_bytes.decode("utf-8" if flags & 0x800 else "cp437", "replace")
        names.append(name)
        i += 46 + fn_len + extra_len + comment_len
    return names


def classify(name):
    low = norm(name)
    base = low.rsplit("/", 1)[-1]
    tags = []
    if "heropainting" in base:
        tags.append("HERO_PAINTING")
    if "heroskin" in base:
        tags.append("HERO_SKIN")
    if "skin" in base and ("paint" in base or "painting" in base):
        tags.append("SKIN_PAINTING_NAME")
    if "skin" in base:
        tags.append("SKIN_NAME")
    if "paint" in base or "painting" in base:
        tags.append("PAINTING_NAME")
    return tags


def main():
    packages = []
    matches = []
    seen_existing = False
    missing_after_existing = 0
    for part in range(1, MAX_PART + 1):
        package_name = f"InstallPage_{VERSION}_{part}.zip"
        url = f"{BASE}/{package_name}"
        size = head_size(url)
        if size is None:
            if seen_existing:
                missing_after_existing += 1
                if missing_after_existing >= 8:
                    break
            continue
        seen_existing = True
        missing_after_existing = 0
        names = list_zip_entries(url, size)
        bundle_names = [name for name in names if norm(name).endswith(".b")]
        tagged = []
        for name in bundle_names:
            tags = classify(name)
            if tags:
                row = {"packagePart": part, "packageName": package_name, "entry": name, "basename": norm(name).rsplit("/", 1)[-1], "tags": tags}
                matches.append(row)
                tagged.append(row)
        packages.append({
            "part": part,
            "packageName": package_name,
            "sizeBytes": size,
            "entryCount": len(names),
            "bundleEntryCount": len(bundle_names),
            "taggedBundleEntryCount": len(tagged),
        })

    unique_basenames = sorted({row["basename"] for row in matches})
    by_tag = {}
    for row in matches:
        for tag in row["tags"]:
            by_tag[tag] = by_tag.get(tag, 0) + 1
    result = {
        "schemaVersion": 1,
        "stage": "skin-detail-full-art-stage1",
        "substage": "official-installer-bundle-catalog",
        "status": "DIAGNOSTIC_COMPLETE",
        "purpose": "Enumerate official InstallPage bundle filenames carrying Skin/Painting terms so a separate Skin full-art bundle family is not missed after the frozen HeroPainting 12-bundle probe.",
        "installVersion": VERSION,
        "guardrails": {
            "filenameEvidenceIsDiscoveryOnly": True,
            "filenameEvidenceIsResolver": False,
            "semanticMutation": False,
            "numericIdArithmetic": False,
            "frontendMutation": False,
            "classFusionTouched": False,
        },
        "counts": {
            "existingPackageCount": len(packages),
            "lastExistingPackagePart": max((row["part"] for row in packages), default=None),
            "taggedBundleEntryCount": len(matches),
            "uniqueTaggedBundleBasenameCount": len(unique_basenames),
            "byTag": by_tag,
        },
        "packages": packages,
        "uniqueTaggedBundleBasenames": unique_basenames,
        "matches": matches,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result["counts"], ensure_ascii=False))
    print("candidate basenames:")
    for name in unique_basenames:
        print(name)


if __name__ == "__main__":
    main()
