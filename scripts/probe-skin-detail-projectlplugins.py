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
MAX_PACKAGE_PART = 68
OUTPUT = pathlib.Path('skin-detail-spine-stage2-runtime-catalog.json')
RUNTIME_DIR = pathlib.Path('/tmp/skin-stage2-runtime')


def norm(value):
    return str(value).replace('\\', '/').strip('/').lower()


def request(url, start=None, end=None):
    headers = {'User-Agent': UA, 'Accept-Encoding': 'identity'}
    if start is not None:
        headers['Range'] = f'bytes={start}-{end}'
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=90) as response:
        data = response.read()
    if start is not None and len(data) != end - start + 1:
        raise RuntimeError(f'range mismatch {len(data)} != {end-start+1}')
    return data


def head_size(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'identity'}, method='HEAD')
    with urllib.request.urlopen(req, timeout=60) as response:
        return int(response.headers['Content-Length'])


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


def classify(name):
    lower = name.lower()
    hits = []
    for token in ('projectlplugins', 'spine', 'assembly-csharp', '/managed/', '.dll', '.exe'):
        if token in lower:
            hits.append(token)
    return hits


def main():
    packages = []
    matches = []
    exact_projectl = []
    for part in range(1, MAX_PACKAGE_PART + 1):
        package = zip_directory(part)
        package_hits = []
        for entry in package['entries']:
            tokens = classify('/' + entry['normName'])
            if not tokens:
                continue
            row = {
                'part': part,
                'packageName': package['packageName'],
                'packageSizeBytes': package['packageSizeBytes'],
                'entryName': entry['name'],
                'uncompressedSize': entry['uncompressedSize'],
                'compressedSize': entry['compressedSize'],
                'crc32': entry['crc32'],
                'matchedTokens': tokens,
            }
            matches.append(row)
            package_hits.append(row)
            if 'projectlplugins' in entry['normName'] and entry['normName'].endswith('.dll'):
                exact_projectl.append((package, entry, row))
        packages.append({'part': part, 'packageName': package['packageName'], 'entryCount': len(package['entries']), 'matchCount': len(package_hits)})

    extracted = []
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    for package, entry, row in exact_projectl:
        raw = fetch_entry(package, entry)
        sha = hashlib.sha256(raw).hexdigest()
        out = RUNTIME_DIR / f'part-{package["part"]}-ProjectLPlugins.dll'
        out.write_bytes(raw)
        extracted.append({**row, 'sha256': sha, 'actualSizeBytes': len(raw), 'temporaryPath': str(out)})

    result = {
        'schemaVersion': 1,
        'stage': 'skin-detail-spine-stage2',
        'substage': 'authoritative-runtime-discovery',
        'status': 'DIAGNOSTIC_COMPLETE',
        'installVersion': VERSION,
        'purpose': 'Locate the exact game-side ProjectLPlugins assembly referenced by the three frozen CHAR_SPINE representative prefabs. The DLL is kept only in runner temp and is not committed or uploaded.',
        'guardrails': {
            'allPackageCentralDirectoriesScanned': True,
            'runtimeAssemblyNameFromSerializedMonoScript': 'ProjectLPlugins',
            'fuzzyCanonicalRelationUsed': False,
            'dllCommitted': False,
            'dllUploaded': False,
            'frontendMutation': False,
            'publicSkinAssetMutation': False,
            'classFusionTouched': False,
        },
        'packageCount': len(packages),
        'packages': packages,
        'interestingEntryCount': len(matches),
        'interestingEntries': matches,
        'exactProjectLPluginsDllCount': len(extracted),
        'projectLPluginsAssemblies': extracted,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({
        'status': result['status'],
        'packageCount': result['packageCount'],
        'interestingEntryCount': result['interestingEntryCount'],
        'exactProjectLPluginsDllCount': result['exactProjectLPluginsDllCount'],
        'projectLPluginsAssemblies': extracted,
        'output': str(OUTPUT),
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
