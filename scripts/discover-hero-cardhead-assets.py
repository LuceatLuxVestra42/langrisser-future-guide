import json
import pathlib
import struct
import urllib.request

VER = "1.1.113"
BASE = f"http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VER}"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
OUT = pathlib.Path("data/validation/hero-cardhead-asset-discovery.v1.json")
PACKAGES = [26, 60, 61]


def req(url, start=None, end=None):
    headers = {"User-Agent": UA, "Accept-Encoding": "identity"}
    if start is not None:
        headers["Range"] = f"bytes={start}-{end}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read(), response.headers


def head_size(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"}, method="HEAD")
    with urllib.request.urlopen(request, timeout=60) as response:
        return int(response.headers["Content-Length"])


def list_zip_entries(url):
    size = head_size(url)
    tail_size = min(1048576, size)
    tail, _ = req(url, size - tail_size, size - 1)
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise RuntimeError(f"EOCD missing: {url}")
    _, _, _, _, central_size, central_offset, _ = struct.unpack_from("<HHHHIIH", tail, eocd + 4)
    central, _ = req(url, central_offset, central_offset + central_size - 1)
    entries = []
    offset = 0
    while offset + 46 <= len(central) and central[offset:offset+4] == b"PK\x01\x02":
        flags = struct.unpack_from("<H", central, offset + 8)[0]
        compressed_size, uncompressed_size = struct.unpack_from("<II", central, offset + 20)
        filename_len, extra_len, comment_len = struct.unpack_from("<HHH", central, offset + 28)
        local_offset = struct.unpack_from("<I", central, offset + 42)[0]
        raw_name = central[offset + 46: offset + 46 + filename_len]
        name = raw_name.decode("utf-8" if flags & 0x800 else "cp437", "replace")
        entries.append({
            "name": name,
            "compressedSize": compressed_size,
            "uncompressedSize": uncompressed_size,
            "localOffset": local_offset,
        })
        offset += 46 + filename_len + extra_len + comment_len
    return size, entries


report = {
    "version": 1,
    "status": "DISCOVERY",
    "gameVersion": VER,
    "purpose": "Locate exact updater bundles that own ConfigDataCharImageInfo.CardHeadImage and SummonHeadImage assets without reopening Hero semantics.",
    "packages": [],
    "candidateBundles": [],
}

for package_number in PACKAGES:
    package_name = f"InstallPage_{VER}_{package_number}.zip"
    url = f"{BASE}/{package_name}"
    try:
        size, entries = list_zip_entries(url)
        matches = []
        for row in entries:
            low = row["name"].lower()
            if "ui_card" in low or "ui_icon_card" in low or "head" in low and "ui_" in low:
                matches.append(row)
        report["packages"].append({
            "packageNumber": package_number,
            "packageName": package_name,
            "packageBytes": size,
            "entryCount": len(entries),
            "matchCount": len(matches),
            "matches": matches,
        })
        for row in matches:
            name = row["name"].split("/")[-1]
            low = name.lower()
            if low.endswith(".b") and ("ui_card" in low or "ui_icon_card" in low):
                report["candidateBundles"].append({"packageNumber": package_number, **row})
    except Exception as exc:
        report["packages"].append({"packageNumber": package_number, "error": repr(exc)})

report["candidateBundles"] = sorted(report["candidateBundles"], key=lambda r: (r["packageNumber"], r["name"].lower()))
report["candidateBundleCount"] = len(report["candidateBundles"])
report["status"] = "PASS_DISCOVERY" if report["candidateBundles"] else "REVIEW_NO_CARD_BUNDLE_IN_SCANNED_PACKAGES"
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": report["status"], "candidateBundleCount": report["candidateBundleCount"], "candidates": report["candidateBundles"]}, ensure_ascii=False, indent=2))
