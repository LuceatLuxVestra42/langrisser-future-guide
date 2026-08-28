import binascii
import json
import re
import struct
import urllib.request
import zlib
import UnityPy

APK_URL = 'https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/mz-client-formal-cn.apk'
APK_REF = 'https://mz.zlongame.com/main.shtml'
UA = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36'
TARGET_MARKERS = ('equip_abs', 'item04_abs')


def get_range(start, end):
    req = urllib.request.Request(APK_URL, headers={
        'User-Agent': UA,
        'Referer': APK_REF,
        'Range': f'bytes={start}-{end}',
    })
    with urllib.request.urlopen(req, timeout=180) as r:
        data = r.read()
        if len(data) != end - start + 1:
            raise RuntimeError(f'range mismatch {start}-{end}: {len(data)}')
        return data, r.headers


def get_total_size():
    _, headers = get_range(0, 1023)
    m = re.search(r'/([0-9]+)$', headers.get('Content-Range', ''))
    if not m:
        raise RuntimeError('missing Content-Range total')
    return int(m.group(1))


def parse_zip_index(total):
    tail_start = max(0, total - 1024 * 1024)
    tail, _ = get_range(tail_start, total - 1)
    pos = tail.rfind(b'PK\x05\x06')
    if pos < 0:
        raise RuntimeError('EOCD not found')
    eocd_off = tail_start + pos
    e = tail[pos:pos + 22]
    _, _, _, total_entries, cd_size, cd_off, _ = struct.unpack_from('<HHHHIIH', e, 4)
    if total_entries == 0xFFFF or cd_size == 0xFFFFFFFF or cd_off == 0xFFFFFFFF:
        loc, _ = get_range(eocd_off - 20, eocd_off - 1)
        zip64_off = struct.unpack_from('<Q', loc, 8)[0]
        z, _ = get_range(zip64_off, zip64_off + 55)
        cd_size = struct.unpack_from('<Q', z, 40)[0]
        cd_off = struct.unpack_from('<Q', z, 48)[0]
    cd, _ = get_range(cd_off, cd_off + cd_size - 1)
    entries = {}
    i = 0
    while i + 46 <= len(cd):
        if cd[i:i + 4] != b'PK\x01\x02':
            raise RuntimeError(f'bad central header at {i}')
        method = struct.unpack_from('<H', cd, i + 10)[0]
        crc = struct.unpack_from('<I', cd, i + 16)[0]
        comp = struct.unpack_from('<I', cd, i + 20)[0]
        uncomp = struct.unpack_from('<I', cd, i + 24)[0]
        fn, ex, cm = struct.unpack_from('<HHH', cd, i + 28)
        local_off = struct.unpack_from('<I', cd, i + 42)[0]
        raw_name = cd[i + 46:i + 46 + fn]
        name = raw_name.decode('utf-8', errors='replace')
        extra = cd[i + 46 + fn:i + 46 + fn + ex]
        if comp == 0xFFFFFFFF or uncomp == 0xFFFFFFFF or local_off == 0xFFFFFFFF:
            p = 0
            while p + 4 <= len(extra):
                tag, size = struct.unpack_from('<HH', extra, p)
                payload = extra[p + 4:p + 4 + size]
                if tag == 0x0001:
                    q = 0
                    if uncomp == 0xFFFFFFFF:
                        uncomp = struct.unpack_from('<Q', payload, q)[0]; q += 8
                    if comp == 0xFFFFFFFF:
                        comp = struct.unpack_from('<Q', payload, q)[0]; q += 8
                    if local_off == 0xFFFFFFFF:
                        local_off = struct.unpack_from('<Q', payload, q)[0]
                    break
                p += 4 + size
        entries[name] = {'method': method, 'crc32': crc, 'compressedSize': comp, 'uncompressedSize': uncomp, 'localOffset': local_off}
        i += 46 + fn + ex + cm
    return entries


def fetch_entry(meta):
    local, _ = get_range(meta['localOffset'], meta['localOffset'] + 29)
    fn, ex = struct.unpack_from('<HH', local, 26)
    start = meta['localOffset'] + 30 + fn + ex
    comp, _ = get_range(start, start + meta['compressedSize'] - 1)
    if meta['method'] == 0:
        raw = comp
    elif meta['method'] == 8:
        raw = zlib.decompress(comp, -15)
    else:
        raise RuntimeError(f"unsupported method {meta['method']}")
    if (binascii.crc32(raw) & 0xffffffff) != meta['crc32']:
        raise RuntimeError('CRC mismatch')
    return raw


def inspect_bundle(name, raw):
    env = UnityPy.load(raw)
    type_counts = {}
    named = []
    for obj in env.objects:
        type_counts[obj.type.name] = type_counts.get(obj.type.name, 0) + 1
        try:
            data = obj.read()
            obj_name = getattr(data, 'm_Name', None) or getattr(data, 'name', None)
        except Exception as exc:
            obj_name = f'<READ_ERROR:{type(exc).__name__}>'
        if obj_name:
            named.append({'type': obj.type.name, 'name': obj_name})
    print('BUNDLE_OBJECTS=' + json.dumps({'entry': name, 'typeCounts': type_counts, 'namedObjects': named}, ensure_ascii=False))


total = get_total_size()
index = parse_zip_index(total)
candidates = [name for name in index if any(marker in name.lower() for marker in TARGET_MARKERS)]
print('APK_CANDIDATES=' + json.dumps(candidates, ensure_ascii=False))
for name in candidates:
    if name.endswith('.b'):
        inspect_bundle(name, fetch_entry(index[name]))
