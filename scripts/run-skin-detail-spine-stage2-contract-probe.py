import importlib.util
import pathlib
import struct


ROOT = pathlib.Path(__file__).resolve().parent
PROBE_PATH = ROOT / "probe-skin-detail-spine-stage2.py"


def load_probe_module():
    spec = importlib.util.spec_from_file_location("skin_detail_spine_stage2_probe", PROBE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {PROBE_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def exact_text_asset_bytes(module, obj):
    # TextAsset.m_Script is an arbitrary byte array for .skel assets.
    # Never round-trip it through str/UTF-8. Read the serialized byte array.
    raw = bytes(obj.get_raw_data())
    for endian in ("<", ">"):
        try:
            off = 0
            name_len = struct.unpack_from(endian + "I", raw, off)[0]
            off += 4
            if name_len > len(raw) - off:
                continue
            name_bytes = raw[off:off + name_len]
            off += name_len
            off = (off + 3) & ~3
            if off + 4 > len(raw):
                continue
            script_len = struct.unpack_from(endian + "I", raw, off)[0]
            off += 4
            if script_len > len(raw) - off:
                continue
            script = raw[off:off + script_len]
            parsed_name = name_bytes.decode("utf-8", "replace")
            expected_name = module.object_name(obj)
            if expected_name is not None and parsed_name != expected_name:
                continue
            return script
        except Exception:
            continue

    parsed = obj.read()
    for attr in ("m_Script", "script"):
        value = getattr(parsed, attr, None)
        if isinstance(value, bytes):
            return value
        if isinstance(value, bytearray):
            return bytes(value)
    raise RuntimeError("unable to recover exact TextAsset byte array without text transcoding")


def main():
    module = load_probe_module()
    module.text_asset_bytes = lambda obj: exact_text_asset_bytes(module, obj)
    module.main()


if __name__ == "__main__":
    main()
