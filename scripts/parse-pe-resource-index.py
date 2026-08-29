#!/usr/bin/env python3
import argparse
import json
import struct
from pathlib import Path

RESOURCE_TYPES = {
    1: "CURSOR", 2: "BITMAP", 3: "ICON", 4: "MENU", 5: "DIALOG", 6: "STRING",
    7: "FONTDIR", 8: "FONT", 9: "ACCELERATOR", 10: "RCDATA", 11: "MESSAGETABLE",
    12: "GROUP_CURSOR", 14: "GROUP_ICON", 16: "VERSION", 17: "DLGINCLUDE",
    19: "PLUGPLAY", 20: "VXD", 21: "ANICURSOR", 22: "ANIICON", 23: "HTML", 24: "MANIFEST",
}


def u16(buf, off):
    if off < 0 or off + 2 > len(buf):
        raise ValueError(f"u16 out of prefix at {off}")
    return struct.unpack_from("<H", buf, off)[0]


def u32(buf, off):
    if off < 0 or off + 4 > len(buf):
        raise ValueError(f"u32 out of prefix at {off}")
    return struct.unpack_from("<I", buf, off)[0]


def parse_name(buf, resource_base_raw, value):
    if value & 0x80000000:
        rel = value & 0x7FFFFFFF
        off = resource_base_raw + rel
        length = u16(buf, off)
        start = off + 2
        end = start + length * 2
        if end > len(buf):
            return f"<name-outside-prefix:{rel}>"
        return buf[start:end].decode("utf-16le", errors="replace")
    return value & 0xFFFF


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prefix")
    ap.add_argument("output_dir")
    args = ap.parse_args()

    prefix_path = Path(args.prefix)
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    data = prefix_path.read_bytes()

    if data[:2] != b"MZ":
        raise SystemExit("prefix is not MZ")
    pe = u32(data, 0x3C)
    if data[pe:pe+4] != b"PE\0\0":
        raise SystemExit("PE signature missing")

    coff = pe + 4
    machine = u16(data, coff)
    section_count = u16(data, coff + 2)
    optional_size = u16(data, coff + 16)
    opt = coff + 20
    magic = u16(data, opt)
    if magic == 0x10B:
        data_dir_off = opt + 96
    elif magic == 0x20B:
        data_dir_off = opt + 112
    else:
        raise SystemExit(f"unsupported optional-header magic 0x{magic:04x}")

    resource_rva = u32(data, data_dir_off + 2 * 8)
    resource_size = u32(data, data_dir_off + 2 * 8 + 4)

    section_table = opt + optional_size
    sections = []
    for i in range(section_count):
        off = section_table + i * 40
        name = data[off:off+8].split(b"\0", 1)[0].decode("ascii", errors="replace")
        virtual_size = u32(data, off + 8)
        virtual_address = u32(data, off + 12)
        raw_size = u32(data, off + 16)
        raw_pointer = u32(data, off + 20)
        sections.append({
            "name": name,
            "virtualSize": virtual_size,
            "virtualAddress": virtual_address,
            "rawSize": raw_size,
            "rawPointer": raw_pointer,
        })

    def rva_to_raw(rva):
        for s in sections:
            span = max(s["virtualSize"], s["rawSize"])
            if s["virtualAddress"] <= rva < s["virtualAddress"] + span:
                return s["rawPointer"] + (rva - s["virtualAddress"])
        return None

    resource_base_raw = rva_to_raw(resource_rva)
    if resource_base_raw is None:
        raise SystemExit("resource RVA not mappable")
    if resource_base_raw >= len(data):
        raise SystemExit(f"resource root not in prefix: raw={resource_base_raw}, prefix={len(data)}")

    inventory = []
    visited_dirs = set()
    max_metadata_raw = resource_base_raw

    def parse_dir(rel_off, path, depth=0):
        nonlocal max_metadata_raw
        if depth > 8:
            raise ValueError("resource directory recursion too deep")
        key = (rel_off, tuple(map(str, path)))
        if key in visited_dirs:
            return
        visited_dirs.add(key)
        base = resource_base_raw + rel_off
        if base + 16 > len(data):
            raise ValueError(f"resource directory outside prefix: rel={rel_off}, raw={base}")
        named = u16(data, base + 12)
        ids = u16(data, base + 14)
        count = named + ids
        max_metadata_raw = max(max_metadata_raw, base + 16 + count * 8)
        for idx in range(count):
            eoff = base + 16 + idx * 8
            name_field = u32(data, eoff)
            target = u32(data, eoff + 4)
            name = parse_name(data, resource_base_raw, name_field)
            if target & 0x80000000:
                parse_dir(target & 0x7FFFFFFF, path + [name], depth + 1)
            else:
                de_rel = target
                de = resource_base_raw + de_rel
                if de + 16 > len(data):
                    raise ValueError(f"resource data entry outside prefix: rel={de_rel}, raw={de}")
                max_metadata_raw = max(max_metadata_raw, de + 16)
                data_rva = u32(data, de)
                size = u32(data, de + 4)
                code_page = u32(data, de + 8)
                raw = rva_to_raw(data_rva)
                full_path = path + [name]
                type_value = full_path[0] if full_path else None
                if isinstance(type_value, int):
                    type_name = RESOURCE_TYPES.get(type_value, f"TYPE_{type_value}")
                else:
                    type_name = str(type_value)
                inventory.append({
                    "path": full_path,
                    "type": type_value,
                    "typeName": type_name,
                    "name": full_path[1] if len(full_path) > 1 else None,
                    "language": full_path[2] if len(full_path) > 2 else None,
                    "dataRva": data_rva,
                    "dataRawOffset": raw,
                    "size": size,
                    "codePage": code_page,
                    "metadataRelativeOffset": de_rel,
                })

    parse_dir(0, [])
    inventory.sort(key=lambda x: (-(x["size"] or 0), x["typeName"], str(x["name"])))

    summary = {
        "status": "PE_RESOURCE_INDEX_PARSED",
        "machine": machine,
        "optionalHeaderMagic": magic,
        "sectionCount": section_count,
        "resourceRva": resource_rva,
        "resourceSize": resource_size,
        "resourceBaseRaw": resource_base_raw,
        "resourceEntryCount": len(inventory),
        "maxMetadataRawOffset": max_metadata_raw,
        "prefixBytes": len(data),
        "metadataFitsPrefix": max_metadata_raw <= len(data),
        "typeCounts": {},
        "typeBytes": {},
        "largestResources": inventory[:30],
    }
    for item in inventory:
        key = item["typeName"]
        summary["typeCounts"][key] = summary["typeCounts"].get(key, 0) + 1
        summary["typeBytes"][key] = summary["typeBytes"].get(key, 0) + item["size"]

    (out / "resource-inventory.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "resource-index-summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
