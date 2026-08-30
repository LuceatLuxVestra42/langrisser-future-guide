import binascii
import hashlib
import json
import pathlib
import struct
import urllib.request
import zlib

VERSION = '1.1.113'
BASE = f'http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VERSION}'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
OUT = pathlib.Path('skin-detail-spine-stage2-il2cpp-locator.json')
TMP = pathlib.Path('/tmp/skin-stage2-il2cpp')
CHECKPOINT = {
    'gameAssembly': {
        'part': 1,
        'entryName': 'Client/GameAssembly.dll',
        'crc32': '4968A383',
        'sha256': 'c7f803939dce955991a8e21611b79cbc4005d1152ee7934b903332150e1e8795',
        'filename': 'GameAssembly.dll',
    },
    'globalMetadata': {
        'part': 66,
        'entryName': 'Client/Langrisser_Data/il2cpp_data/Metadata/global-metadata.dat',
        'crc32': 'C19227F5',
        'sha256': '589b1684b17525edbec53b85c7bf13a05a8da0e38d360a05bee2f2950b76f6a2',
        'filename': 'global-metadata.dat',
    },
}


def norm(v):
    return str(v).replace('\\', '/').strip('/').lower()


def request(url, start=None, end=None):
    headers = {'User-Agent': UA, 'Accept-Encoding': 'identity'}
    if start is not None:
        headers['Range'] = f'bytes={start}-{end}'
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=120) as r:
        data = r.read()
    if start is not None and len(data) != end - start + 1:
        raise RuntimeError(f'range mismatch {len(data)} != {end-start+1}')
    return data


def head_size(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'identity'}, method='HEAD')
    with urllib.request.urlopen(req, timeout=90) as r:
        return int(r.headers['Content-Length'])


def zip_directory(part):
    package_name = f'InstallPage_{VERSION}_{part}.zip'
    url = f'{BASE}/{package_name}'
    total = head_size(url)
    tail_size = min(1048576, total)
    tail = request(url, total - tail_size, total - 1)
    eocd = tail.rfind(b'PK\x05\x06')
    if eocd < 0:
        raise RuntimeError(f'{package_name}: EOCD missing')
    _, _, _, _, central_size, central_offset, _ = struct.unpack_from('<HHHHIIH', tail, eocd + 4)
    central = request(url, central_offset, central_offset + central_size - 1)
    entries = []
    i = 0
    while i + 46 <= len(central) and central[i:i+4] == b'PK\x01\x02':
        flags, method = struct.unpack_from('<HH', central, i + 8)
        crc, compressed, uncompressed = struct.unpack_from('<III', central, i + 16)
        fn_len, extra_len, comment_len = struct.unpack_from('<HHH', central, i + 28)
        local_offset = struct.unpack_from('<I', central, i + 42)[0]
        name_bytes = central[i+46:i+46+fn_len]
        name = name_bytes.decode('utf-8' if flags & 0x800 else 'cp437', 'replace')
        entries.append({
            'name': name,
            'normName': norm(name),
            'method': method,
            'crc32': f'{crc:08X}',
            'compressedSize': compressed,
            'uncompressedSize': uncompressed,
            'localOffset': local_offset,
        })
        i += 46 + fn_len + extra_len + comment_len
    return {'part': part, 'packageName': package_name, 'packageSizeBytes': total, 'url': url, 'entries': entries}


def fetch_entry(package, entry):
    local_offset = entry['localOffset']
    header = request(package['url'], local_offset, local_offset + 4095)
    flags, method = struct.unpack_from('<HH', header, 6)
    fn_len, extra_len = struct.unpack_from('<HH', header, 26)
    if method != entry['method']:
        raise RuntimeError('ZIP method mismatch')
    start = local_offset + 30 + fn_len + extra_len
    payload = request(package['url'], start, start + entry['compressedSize'] - 1)
    if method == 0:
        raw = payload
    elif method == 8:
        raw = zlib.decompress(payload, -15)
    else:
        raise RuntimeError(f'unsupported ZIP method {method}')
    crc = f'{binascii.crc32(raw) & 0xffffffff:08X}'
    if crc != entry['crc32']:
        raise RuntimeError(f'CRC mismatch {crc} != {entry["crc32"]}')
    return raw


def main():
    packages = {part: zip_directory(part) for part in sorted({v['part'] for v in CHECKPOINT.values()})}
    TMP.mkdir(parents=True, exist_ok=True)
    rows = {}
    for key, cp in CHECKPOINT.items():
        pkg = packages[cp['part']]
        exact = [e for e in pkg['entries'] if e['name'] == cp['entryName']]
        if len(exact) != 1:
            raise RuntimeError(f'{key}: checkpoint entry missing or ambiguous')
        e = exact[0]
        if e['crc32'] != cp['crc32']:
            raise RuntimeError(f'{key}: central-directory CRC changed {e["crc32"]} != {cp["crc32"]}')
        raw = fetch_entry(pkg, e)
        sha = hashlib.sha256(raw).hexdigest()
        if sha != cp['sha256']:
            raise RuntimeError(f'{key}: SHA changed {sha} != {cp["sha256"]}')
        path = TMP / cp['filename']
        path.write_bytes(raw)
        rows[key] = {
            'part': cp['part'],
            'packageName': pkg['packageName'],
            'entryName': e['name'],
            'uncompressedSize': e['uncompressedSize'],
            'actualSizeBytes': len(raw),
            'crc32': e['crc32'],
            'sha256': sha,
            'temporaryPath': str(path),
        }

    result = {
        'schemaVersion': 2,
        'stage': 'skin-detail-spine-stage2',
        'substage': 'authoritative-il2cpp-runtime-inputs',
        'status': 'PASS',
        'installVersion': VERSION,
        'checkpointReused': True,
        'packageCountScanned': len(packages),
        'inputs': rows,
        'guardrails': {
            'fullConfigDataRead': False,
            'all68PackageRescan': False,
            'gameBinaryCommitted': False,
            'gameBinaryUploaded': False,
            'frontendMutation': False,
            'publicSkinAssetMutation': False,
            'classFusionTouched': False,
        },
    }
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
