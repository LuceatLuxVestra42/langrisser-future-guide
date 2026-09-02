import argparse
import binascii
import bisect
import hashlib
import json
import re
import struct
import subprocess
import urllib.request
import zlib
from pathlib import Path

APK_URL = "https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/mz-client-formal-cn.apk"
APK_REF = "https://mz.zlongame.com/main.shtml"
UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36"
TARGETS = {
    "global-metadata.dat": "assets/bin/Data/Managed/Metadata/global-metadata.dat",
    "libil2cpp.so": "lib/arm64-v8a/libil2cpp.so",
}
TARGET_METHOD = "BlackJack.ProjectL.UI.UIUtility$$GetGoodsFrameNameByRank"
TARGET_TABLE = [0x68CE438, 0x68CE440, 0x68CE448, 0x68CE450]
TARGET_DEFAULT_SLOT = 0x6BF1788


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def get_range(start: int, end: int):
    req = urllib.request.Request(
        APK_URL,
        headers={"User-Agent": UA, "Referer": APK_REF, "Range": f"bytes={start}-{end}"},
    )
    with urllib.request.urlopen(req, timeout=180) as response:
        data = response.read()
        expected = end - start + 1
        if len(data) != expected:
            raise RuntimeError(f"range {start}-{end}: got {len(data)}, expected {expected}")
        return data, response.headers


def get_total_size():
    _, headers = get_range(0, 1023)
    m = re.search(r"/([0-9]+)$", headers.get("Content-Range", ""))
    if not m:
        raise RuntimeError(f"missing Content-Range total: {headers.get('Content-Range')}")
    return int(m.group(1)), headers


def parse_zip_index(total: int):
    tail_start = max(0, total - 1024 * 1024)
    tail, _ = get_range(tail_start, total - 1)
    pos = tail.rfind(b"PK\x05\x06")
    if pos < 0:
        raise RuntimeError("EOCD not found")
    eocd_off = tail_start + pos
    eocd = tail[pos : pos + 22]
    _, _, _, count, cd_size32, cd_off32, _ = struct.unpack_from("<HHHHIIH", eocd, 4)
    cd_size, cd_off = cd_size32, cd_off32
    if count == 0xFFFF or cd_size32 == 0xFFFFFFFF or cd_off32 == 0xFFFFFFFF:
        locator, _ = get_range(eocd_off - 20, eocd_off - 1)
        if locator[:4] != b"PK\x06\x07":
            raise RuntimeError("Zip64 locator missing")
        zip64_off = struct.unpack_from("<Q", locator, 8)[0]
        zip64, _ = get_range(zip64_off, zip64_off + 55)
        if zip64[:4] != b"PK\x06\x06":
            raise RuntimeError("Zip64 EOCD missing")
        cd_size = struct.unpack_from("<Q", zip64, 40)[0]
        cd_off = struct.unpack_from("<Q", zip64, 48)[0]
    cd, _ = get_range(cd_off, cd_off + cd_size - 1)
    wanted = set(TARGETS.values())
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
        name = raw_name.decode("utf-8", errors="replace")
        extra = cd[i + 46 + fn : i + 46 + fn + ex]
        if compressed == 0xFFFFFFFF or uncompressed == 0xFFFFFFFF or local_off == 0xFFFFFFFF:
            p = 0
            while p + 4 <= len(extra):
                tag, size = struct.unpack_from("<HH", extra, p)
                payload = extra[p + 4 : p + 4 + size]
                if tag == 0x0001:
                    q = 0
                    if uncompressed == 0xFFFFFFFF:
                        uncompressed = struct.unpack_from("<Q", payload, q)[0]; q += 8
                    if compressed == 0xFFFFFFFF:
                        compressed = struct.unpack_from("<Q", payload, q)[0]; q += 8
                    if local_off == 0xFFFFFFFF:
                        local_off = struct.unpack_from("<Q", payload, q)[0]
                    break
                p += 4 + size
        if name in wanted:
            entries[name] = {
                "method": method,
                "crc32": crc,
                "compressedSize": compressed,
                "uncompressedSize": uncompressed,
                "localOffset": local_off,
            }
        i += 46 + fn + ex + cm
    missing = wanted - entries.keys()
    if missing:
        raise RuntimeError(f"missing APK entries: {sorted(missing)}")
    return entries


def fetch_zip_entry(meta):
    local, _ = get_range(meta["localOffset"], meta["localOffset"] + 29)
    if local[:4] != b"PK\x03\x04":
        raise RuntimeError("bad local header")
    fn, ex = struct.unpack_from("<HH", local, 26)
    start = meta["localOffset"] + 30 + fn + ex
    compressed, _ = get_range(start, start + meta["compressedSize"] - 1)
    if meta["method"] == 0:
        raw = compressed
    elif meta["method"] == 8:
        raw = zlib.decompress(compressed, -15)
    else:
        raise RuntimeError(f"unsupported zip method {meta['method']}")
    if len(raw) != meta["uncompressedSize"]:
        raise RuntimeError("uncompressed size mismatch")
    if (binascii.crc32(raw) & 0xFFFFFFFF) != meta["crc32"]:
        raise RuntimeError("CRC mismatch")
    return raw


def extract(out_dir: Path):
    total, headers = get_total_size()
    entries = parse_zip_index(total)
    out_dir.mkdir(parents=True, exist_ok=True)
    records = []
    for out_name, apk_path in TARGETS.items():
        raw = fetch_zip_entry(entries[apk_path])
        path = out_dir / out_name
        path.write_bytes(raw)
        records.append({"apkPath": apk_path, "output": str(path), "bytes": len(raw), "sha256": sha256(raw)})
    report = {
        "sourceAuthority": {
            "officialPage": APK_REF,
            "officialApkUrl": APK_URL,
            "apkBytes": total,
            "lastModified": headers.get("Last-Modified"),
            "etag": headers.get("ETag"),
        },
        "records": records,
    }
    (out_dir.parent / "equipment-ssr-frame-apk-inputs.v2.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


def load_script_methods(path: Path):
    obj = json.loads(path.read_text(encoding="utf-8-sig"))
    methods = obj.get("ScriptMethod", []) if isinstance(obj, dict) else []
    return [x for x in methods if isinstance(x, dict) and isinstance(x.get("Address"), int)]


def elf_load_segments(data: bytes):
    if data[:4] != b"\x7fELF" or data[4] != 2 or data[5] != 1:
        raise RuntimeError("expected ELF64 little-endian")
    phoff = struct.unpack_from("<Q", data, 32)[0]
    phentsize = struct.unpack_from("<H", data, 54)[0]
    phnum = struct.unpack_from("<H", data, 56)[0]
    segs = []
    for i in range(phnum):
        off = phoff + i * phentsize
        p_type, p_flags = struct.unpack_from("<II", data, off)
        if p_type != 1:
            continue
        p_offset, p_vaddr = struct.unpack_from("<QQ", data, off + 8)
        p_filesz, p_memsz = struct.unpack_from("<QQ", data, off + 32)
        segs.append({"flags": p_flags, "offset": p_offset, "vaddr": p_vaddr, "filesz": p_filesz, "memsz": p_memsz})
    return segs


def va_to_file_offset(segs, va):
    for seg in segs:
        if seg["vaddr"] <= va < seg["vaddr"] + seg["filesz"]:
            return seg["offset"] + (va - seg["vaddr"])
    return None


def read_u64_va(data, segs, va):
    off = va_to_file_offset(segs, va)
    if off is None or off + 8 > len(data):
        return None
    return struct.unpack_from("<Q", data, off)[0]


def collect_relocations(native: Path, targets):
    wanted = set(targets)
    records = {x: [] for x in targets}
    proc = subprocess.Popen(["llvm-readelf", "-Wr", str(native)], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    assert proc.stdout is not None
    for line in proc.stdout:
        m = re.match(r"\s*([0-9A-Fa-f]+)\s+", line)
        if not m:
            continue
        off = int(m.group(1), 16)
        if off in wanted:
            records[off].append(line.strip())
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"llvm-readelf failed: {rc}")
    return records


def scan_bl_callers(native_bytes, segs, target_va):
    callers = []
    for seg in segs:
        if not (seg["flags"] & 1):
            continue
        start = seg["offset"]
        end = min(len(native_bytes), start + seg["filesz"])
        vbase = seg["vaddr"]
        for off in range(start, end - 3, 4):
            insn = struct.unpack_from("<I", native_bytes, off)[0]
            if (insn & 0xFC000000) != 0x94000000:
                continue
            imm = insn & 0x03FFFFFF
            if imm & 0x02000000:
                imm -= 0x04000000
            pc = vbase + (off - start)
            if pc + imm * 4 == target_va:
                callers.append(pc)
    return callers


def disasm_window(native: Path, va, before=0x40, after=0x20):
    proc = subprocess.run(
        ["llvm-objdump", "-d", f"--start-address=0x{max(0, va-before):x}", f"--stop-address=0x{va+after:x}", str(native)],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    return {"exitCode": proc.returncode, "text": proc.stdout[-20000:]}


def dump_context(lines, needle, radius=8, limit=20):
    hits = []
    for i, line in enumerate(lines):
        if needle.lower() in line.lower():
            lo, hi = max(0, i-radius), min(len(lines), i+radius+1)
            hits.append({"line": i+1, "text": "\n".join(f"{n+1}: {lines[n]}" for n in range(lo, hi))})
            if len(hits) >= limit:
                break
    return hits


def analyze(input_dir: Path, dump_dir: Path, out_path: Path):
    native = input_dir / "libil2cpp.so"
    native_bytes = native.read_bytes()
    segs = elf_load_segments(native_bytes)
    methods = load_script_methods(dump_dir / "script.json")
    methods_sorted = sorted(methods, key=lambda x: x["Address"])
    method_addrs = [x["Address"] for x in methods_sorted]
    target_methods = [x for x in methods_sorted if x.get("Name") == TARGET_METHOD]
    if len(target_methods) != 1:
        raise RuntimeError(f"expected one target method, got {target_methods}")
    target_method = target_methods[0]
    target_va = target_method["Address"]

    literals_obj = json.loads((dump_dir / "stringliteral.json").read_text(encoding="utf-8-sig"))
    literals = literals_obj if isinstance(literals_obj, list) else []
    literal_by_addr = {}
    for item in literals:
        if not isinstance(item, dict):
            continue
        addr = item.get("address") or item.get("Address")
        value = item.get("value") or item.get("Value")
        if isinstance(addr, str) and isinstance(value, str):
            try:
                literal_by_addr[int(addr, 0)] = value
            except ValueError:
                pass

    reloc_targets = TARGET_TABLE + [TARGET_DEFAULT_SLOT]
    relocations = collect_relocations(native, reloc_targets)
    table = []
    for rank, va in zip(range(2, 6), TARGET_TABLE):
        raw = read_u64_va(native_bytes, segs, va)
        candidates = []
        if raw in literal_by_addr:
            candidates.append({"source": "rawPointer", "address": f"0x{raw:x}", "literal": literal_by_addr[raw]})
        for line in relocations.get(va, []):
            for token in re.findall(r"(?<![0-9A-Fa-f])(?:0x)?([0-9A-Fa-f]{6,16})(?![0-9A-Fa-f])", line):
                value = int(token, 16)
                if value in literal_by_addr:
                    candidates.append({"source": "relocation", "address": f"0x{value:x}", "literal": literal_by_addr[value]})
        table.append({
            "rank": rank,
            "tableVA": f"0x{va:x}",
            "rawU64": None if raw is None else f"0x{raw:x}",
            "relocations": relocations.get(va, []),
            "literalCandidates": candidates,
        })

    callers = scan_bl_callers(native_bytes, segs, target_va)
    caller_records = []
    for caller in callers[:100]:
        idx = bisect.bisect_right(method_addrs, caller) - 1
        owner = methods_sorted[idx] if idx >= 0 else None
        next_addr = method_addrs[idx+1] if idx + 1 < len(method_addrs) else None
        if owner and next_addr and caller >= next_addr:
            owner = None
        caller_records.append({
            "callVA": f"0x{caller:x}",
            "ownerMethod": owner,
            "disassembly": disasm_window(native, caller),
        })

    dump_text = (dump_dir / "dump.cs").read_text(encoding="utf-8-sig", errors="replace")
    lines = dump_text.splitlines()
    ssr_enum_blocks = []
    enum_re = re.compile(r"(?:public|private|protected|internal)?\s*(?:sealed\s+)?enum\s+[^\n{]+\{.*?\n\}", re.S)
    for m in enum_re.finditer(dump_text):
        block = m.group(0)
        if "SSR" in block and len(block) < 30000:
            ssr_enum_blocks.append(block)
            if len(ssr_enum_blocks) >= 100:
                break

    rank_frame_context = []
    for needle in ["Rank1Frame", "Rank2Frame", "Rank3Frame", "Rank4Frame", "Rank5Frame", "GetGoodsFrameNameByRank"]:
        rank_frame_context.extend({"needle": needle, **x} for x in dump_context(lines, needle, radius=12, limit=10))

    default_raw = read_u64_va(native_bytes, segs, TARGET_DEFAULT_SLOT)
    report = {
        "stage": "Equipment SSR Frame Provenance V2",
        "status": "TRACE_COMPLETE",
        "targetMethod": target_method,
        "fallbackRankTable": table,
        "defaultSlot": {
            "slotVA": f"0x{TARGET_DEFAULT_SLOT:x}",
            "rawU64": None if default_raw is None else f"0x{default_raw:x}",
            "relocations": relocations.get(TARGET_DEFAULT_SLOT, []),
            "literal": literal_by_addr.get(default_raw),
        },
        "callerCount": len(callers),
        "callers": caller_records,
        "ssrEnumBlocks": ssr_enum_blocks,
        "rankFrameContexts": rank_frame_context,
        "semanticBoundary": {
            "filenameSimilarityUsed": False,
            "nameJoinUsed": False,
            "idArithmeticUsed": False,
            "tableOrderingAloneDefinesSSR": False,
            "requiredConclusion": "SSR requires explicit enum/constant evidence for rank value plus exact fallback table literal resolution.",
        },
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "targetMethod": target_method,
        "fallbackRankTable": table,
        "defaultSlot": report["defaultSlot"],
        "callerCount": len(callers),
        "ssrEnumBlockCount": len(ssr_enum_blocks),
        "rankFrameContextCount": len(rank_frame_context),
    }, ensure_ascii=False, indent=2))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    ex = sub.add_parser("extract")
    ex.add_argument("--out-dir", default="artifacts/il2cpp-inputs")
    an = sub.add_parser("analyze")
    an.add_argument("--input-dir", default="artifacts/il2cpp-inputs")
    an.add_argument("--dump-dir", default="artifacts/il2cpp-dump")
    an.add_argument("--out", default="artifacts/equipment-ssr-frame-provenance-v2.json")
    args = ap.parse_args()
    if args.cmd == "extract":
        extract(Path(args.out_dir))
    else:
        analyze(Path(args.input_dir), Path(args.dump_dir), Path(args.out))


if __name__ == "__main__":
    main()
