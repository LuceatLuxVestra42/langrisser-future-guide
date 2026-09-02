import binascii
import hashlib
import json
import os
import re
import struct
import urllib.request
import zlib
from pathlib import Path

APK_URL = "https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/mz-client-formal-cn.apk"
APK_REF = "https://mz.zlongame.com/main.shtml"
UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"
OUTPUT_PATH = Path(os.environ.get("OUTPUT_PATH", "equipment-ssr-frame-apk-probe.json"))
EXTRACT_INPUT_DIR = os.environ.get("EXTRACT_INPUT_DIR")

TARGET_METADATA_BASENAME = "global-metadata.dat"
TARGET_NATIVE_BASENAME = "libil2cpp.so"
TARGET_METADATA_STRINGS = [
    b"GetGoodsFrameNameByRank",
    b"FrameImage",
    b"SSREffect",
    b"IconImage",
]

# Locator-only hints. These are never treated as semantic evidence.
ASSET_LOCATOR_TERMS = (
    "frame",
    "quality",
    "rank",
    "goods",
    "equip",
    "item",
    "ui_icon",
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def get_range(start: int, end: int):
    req = urllib.request.Request(
        APK_URL,
        headers={
            "User-Agent": UA,
            "Referer": APK_REF,
            "Range": f"bytes={start}-{end}",
        },
    )
    with urllib.request.urlopen(req, timeout=180) as response:
        data = response.read()
        expected = end - start + 1
        if len(data) != expected:
            raise RuntimeError(
                f"range {start}-{end}: got {len(data)} bytes, expected {expected}, "
                f"status={response.status}, Content-Range={response.headers.get('Content-Range')}"
            )
        return data, response.headers


def get_total_size():
    _, headers = get_range(0, 1023)
    match = re.search(r"/([0-9]+)$", headers.get("Content-Range", ""))
    if not match:
        raise RuntimeError(f"No total in Content-Range: {headers.get('Content-Range')}")
    return int(match.group(1)), dict(headers)


def parse_zip_index(total: int):
    tail_start = max(0, total - 1024 * 1024)
    tail, _ = get_range(tail_start, total - 1)
    pos = tail.rfind(b"PK\x05\x06")
    if pos < 0:
        raise RuntimeError("EOCD not found")

    eocd_off = tail_start + pos
    eocd = tail[pos : pos + 22]
    _, _, _, total_entries, cd_size32, cd_off32, _ = struct.unpack_from("<HHHHIIH", eocd, 4)
    cd_size, cd_off = cd_size32, cd_off32

    if total_entries == 0xFFFF or cd_size32 == 0xFFFFFFFF or cd_off32 == 0xFFFFFFFF:
        locator, _ = get_range(eocd_off - 20, eocd_off - 1)
        if locator[:4] != b"PK\x06\x07":
            raise RuntimeError("Zip64 locator missing")
        zip64_eocd_off = struct.unpack_from("<Q", locator, 8)[0]
        zip64_eocd, _ = get_range(zip64_eocd_off, zip64_eocd_off + 55)
        if zip64_eocd[:4] != b"PK\x06\x06":
            raise RuntimeError("Zip64 EOCD missing")
        total_entries = struct.unpack_from("<Q", zip64_eocd, 32)[0]
        cd_size = struct.unpack_from("<Q", zip64_eocd, 40)[0]
        cd_off = struct.unpack_from("<Q", zip64_eocd, 48)[0]

    cd, _ = get_range(cd_off, cd_off + cd_size - 1)
    entries = {}
    i = 0
    while i + 46 <= len(cd):
        if cd[i : i + 4] != b"PK\x01\x02":
            raise RuntimeError(f"bad central header at {i}")
        method = struct.unpack_from("<H", cd, i + 10)[0]
        crc = struct.unpack_from("<I", cd, i + 16)[0]
        compressed = struct.unpack_from("<I", cd, i + 20)[0]
        uncompressed = struct.unpack_from("<I", cd, i + 24)[0]
        fn, ex, cm = struct.unpack_from("<HHH", cd, i + 28)
        local_off = struct.unpack_from("<I", cd, i + 42)[0]
        raw_name = cd[i + 46 : i + 46 + fn]
        try:
            name = raw_name.decode("utf-8")
        except UnicodeDecodeError:
            name = raw_name.decode("cp437")
        extra = cd[i + 46 + fn : i + 46 + fn + ex]

        if compressed == 0xFFFFFFFF or uncompressed == 0xFFFFFFFF or local_off == 0xFFFFFFFF:
            p = 0
            while p + 4 <= len(extra):
                tag, size = struct.unpack_from("<HH", extra, p)
                payload = extra[p + 4 : p + 4 + size]
                if tag == 0x0001:
                    q = 0
                    if uncompressed == 0xFFFFFFFF:
                        uncompressed = struct.unpack_from("<Q", payload, q)[0]
                        q += 8
                    if compressed == 0xFFFFFFFF:
                        compressed = struct.unpack_from("<Q", payload, q)[0]
                        q += 8
                    if local_off == 0xFFFFFFFF:
                        local_off = struct.unpack_from("<Q", payload, q)[0]
                    break
                p += 4 + size

        entries[name] = {
            "method": method,
            "crc32": f"{crc:08x}",
            "compressedSize": compressed,
            "uncompressedSize": uncompressed,
            "localOffset": local_off,
        }
        i += 46 + fn + ex + cm

    return entries, {
        "reportedEntryCount": total_entries,
        "parsedEntryCount": len(entries),
        "centralDirectoryOffset": cd_off,
        "centralDirectoryBytes": cd_size,
    }


def fetch_zip_entry(meta):
    local, _ = get_range(meta["localOffset"], meta["localOffset"] + 29)
    if local[:4] != b"PK\x03\x04":
        raise RuntimeError("bad local header")
    fn, ex = struct.unpack_from("<HH", local, 26)
    data_start = meta["localOffset"] + 30 + fn + ex
    compressed, _ = get_range(data_start, data_start + meta["compressedSize"] - 1)
    if meta["method"] == 0:
        raw = compressed
    elif meta["method"] == 8:
        raw = zlib.decompress(compressed, -15)
    else:
        raise RuntimeError(f"unsupported ZIP method {meta['method']}")
    if len(raw) != meta["uncompressedSize"]:
        raise RuntimeError(f"uncompressed size mismatch {len(raw)} != {meta['uncompressedSize']}")
    if (binascii.crc32(raw) & 0xFFFFFFFF) != int(meta["crc32"], 16):
        raise RuntimeError("ZIP CRC mismatch")
    return raw


def entry_record(name, meta):
    return {"path": name, **meta}


def write_il2cpp_inputs(metadata_candidates, native_candidates):
    if not EXTRACT_INPUT_DIR:
        return None
    if len(metadata_candidates) != 1:
        raise RuntimeError(f"expected exactly one global-metadata.dat, got {len(metadata_candidates)}")
    if len(native_candidates) != 1:
        raise RuntimeError(f"expected exactly one libil2cpp.so, got {len(native_candidates)}")

    output_dir = Path(EXTRACT_INPUT_DIR)
    output_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for candidate, out_name in (
        (metadata_candidates[0], TARGET_METADATA_BASENAME),
        (native_candidates[0], TARGET_NATIVE_BASENAME),
    ):
        raw = fetch_zip_entry(candidate)
        out_path = output_dir / out_name
        out_path.write_bytes(raw)
        written.append(
            {
                "sourcePath": candidate["path"],
                "outputName": out_name,
                "bytes": len(raw),
                "sha256": sha256(raw),
            }
        )
    return written


def main():
    total, headers = get_total_size()
    entries, zip_info = parse_zip_index(total)

    metadata_candidates = [
        entry_record(name, meta)
        for name, meta in entries.items()
        if name.rsplit("/", 1)[-1].lower() == TARGET_METADATA_BASENAME
    ]
    native_candidates = [
        entry_record(name, meta)
        for name, meta in entries.items()
        if name.rsplit("/", 1)[-1].lower() == TARGET_NATIVE_BASENAME
    ]
    asset_locator_candidates = [
        entry_record(name, meta)
        for name, meta in entries.items()
        if name.startswith("assets/ExportAssetBundle/")
        and any(term in name.lower() for term in ASSET_LOCATOR_TERMS)
    ]

    metadata_probes = []
    for candidate in metadata_candidates:
        raw = fetch_zip_entry(candidate)
        string_hits = {}
        for target in TARGET_METADATA_STRINGS:
            offsets = []
            start = 0
            while True:
                pos = raw.find(target, start)
                if pos < 0:
                    break
                offsets.append(pos)
                start = pos + 1
            string_hits[target.decode("ascii")] = offsets[:20]
        metadata_probes.append(
            {
                "path": candidate["path"],
                "bytes": len(raw),
                "sha256": sha256(raw),
                "targetStringOffsets": string_hits,
            }
        )

    extracted_inputs = write_il2cpp_inputs(metadata_candidates, native_candidates)

    report = {
        "stage": "Equipment SSR Frame APK Provenance Probe",
        "status": "PROBE_COMPLETE",
        "scope": "Locator-only APK inspection; no semantic mapping is inferred from filenames or ordering.",
        "sourceAuthority": {
            "officialPage": APK_REF,
            "officialApkUrl": APK_URL,
            "apkBytes": total,
            "contentRange": headers.get("Content-Range"),
            "lastModified": headers.get("Last-Modified"),
            "etag": headers.get("ETag"),
        },
        "zip": zip_info,
        "metadataCandidates": metadata_candidates,
        "nativeCandidates": native_candidates,
        "metadataProbes": metadata_probes,
        "extractedIl2CppInputs": extracted_inputs,
        "assetLocatorCandidates": asset_locator_candidates,
        "locatorBoundary": {
            "candidatePathsAreSemanticEvidence": False,
            "filenameSimilarityUsedForMapping": False,
            "idArithmeticUsed": False,
            "nameJoinUsed": False,
            "requiredNextEvidence": "Resolve GetGoodsFrameNameByRank implementation against exact IL2CPP metadata/native pair before assigning SSR to any asset.",
        },
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
