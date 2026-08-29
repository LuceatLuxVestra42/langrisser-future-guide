import binascii
import hashlib
import json
import os
import pathlib
import re
import struct
import urllib.request
import zlib
from collections import defaultdict

import UnityPy

ROOT = pathlib.Path(os.environ.get('RUNNER_TEMP', '.')) / 'langrisser-hero-artwork-bundle-ownership'
REPORT = ROOT / 'report'
REPORT.mkdir(parents=True, exist_ok=True)
DETAIL_DIR = pathlib.Path('data/generated/hero-detail/by-id')
VERSION = '1.1.113'
BASE = f'http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VERSION}'
MANIFEST_URL = f'{BASE}/intallinfo_{VERSION}.ini'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
EXPECTED_HERO_COUNT = 267
EXPECTED_FAMILY_COUNT = 7
EXPECTED_FINAL_TOTAL = 240
EXPECTED_BEGIN_ONLY_TOTAL = 27
EXPECTED_FINAL_BY_FAMILY = {
    'ui/heropainting/r_abs/prefab': 10,
    'ui/heropainting/sr_abs/prefab': 31,
    'ui/heropainting/ssr_abs/prefab': 115,
    'ui/heropainting01/ssr_abs/prefab': 2,
    'ui/heropainting2/sr_abs/prefab': 1,
    'ui/heropainting2/ssr_abs/prefab': 64,
    'ui/heropainting3/ssr_abs/prefab': 17,
}


def norm(value):
    return str(value).replace('\\', '/').strip('/').lower()


def family_of(path):
    parts = str(path).replace('\\', '/').split('/')
    try:
        idx = next(i for i, part in enumerate(parts) if part.lower() == 'prefab')
    except StopIteration:
        raise RuntimeError(f'non-Prefab artwork path: {path}')
    return '/'.join(parts[:idx + 1])


def final_bundle_for_family(family):
    parts = family.replace('\\', '/').split('/')
    if len(parts) != 4 or parts[0].lower() != 'ui' or parts[3].lower() != 'prefab':
        raise RuntimeError(f'unexpected family form: {family}')
    return f"ui_{parts[1].lower()}_{parts[2].lower()}.b"


def request_bytes(url, start=None, end=None):
    headers = {'User-Agent': UA, 'Accept-Encoding': 'identity'}
    if start is not None:
        headers['Range'] = f'bytes={start}-{end}'
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=90) as response:
        data = response.read()
        if start is not None and len(data) != end - start + 1:
            raise RuntimeError(f'range ignored/mismatch for {url}: {len(data)} != {end-start+1}')
        return data


def head_size(url):
    req = urllib.request.Request(
        url,
        headers={'User-Agent': UA, 'Accept-Encoding': 'identity'},
        method='HEAD',
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        size = response.headers.get('Content-Length')
        if not size:
            raise RuntimeError(f'HEAD missing Content-Length: {url}')
        return int(size)


def parse_manifest(text):
    package = None
    rows = []
    for raw in text.splitlines():
        line = raw.strip()
        section = re.fullmatch(r'\[Package(\d+)\]', line, re.I)
        if section:
            package = int(section.group(1))
            continue
        if package is None or not re.match(r'^File\d+=', line, re.I):
            continue
        parts = [part.strip() for part in line.split('=', 1)[1].split(',')]
        if len(parts) < 3:
            continue
        md5_index = next(
            (i for i, token in enumerate(parts[1:], 1) if re.fullmatch(r'[0-9A-Fa-f]{32}', token)),
            None,
        )
        if md5_index is None:
            continue
        numeric = [int(token) for token in parts[1:md5_index] if token.isdigit()]
        if not numeric:
            continue
        rows.append({
            'packageIndex': package,
            'path': parts[0].replace('\\', '/'),
            'bytes': numeric[-1],
            'md5': parts[md5_index].upper(),
            'rawManifestLine': line,
        })
    return rows


def package_meta(package_index, size_cache):
    if package_index in size_cache:
        return size_cache[package_index]
    name = f'InstallPage_{VERSION}_{package_index + 1}.zip'
    url = f'{BASE}/{name}'
    result = {'packageIndex': package_index, 'packageName': name, 'url': url, 'bytes': head_size(url)}
    size_cache[package_index] = result
    return result


def zip_directory(pkg, cache):
    key = pkg['packageIndex']
    if key in cache:
        return cache[key]
    total_size = pkg['bytes']
    tail_size = min(1_048_576, total_size)
    tail_start = total_size - tail_size
    tail = request_bytes(pkg['url'], tail_start, total_size - 1)
    pos = tail.rfind(b'PK\x05\x06')
    if pos < 0:
        raise RuntimeError(f"EOCD not found in {pkg['packageName']}")
    disk, cd_disk, _, _, cd_size, cd_offset, _ = struct.unpack_from('<HHHHIIH', tail, pos + 4)
    if disk or cd_disk:
        raise RuntimeError('multi-disk ZIP unsupported')
    cd = request_bytes(pkg['url'], cd_offset, cd_offset + cd_size - 1)
    entries = {}
    offset = 0
    while offset + 46 <= len(cd):
        if cd[offset:offset + 4] != b'PK\x01\x02':
            break
        flags, method = struct.unpack_from('<HH', cd, offset + 8)
        crc, compressed_size, uncompressed_size = struct.unpack_from('<III', cd, offset + 16)
        filename_len, extra_len, comment_len = struct.unpack_from('<HHH', cd, offset + 28)
        local_offset = struct.unpack_from('<I', cd, offset + 42)[0]
        raw_name = cd[offset + 46:offset + 46 + filename_len]
        name = raw_name.decode('utf-8' if flags & 0x800 else 'cp437', 'replace')
        entries[norm(name)] = {
            'name': name,
            'flags': flags,
            'method': method,
            'crc32': f'{crc:08X}',
            'compressedSize': compressed_size,
            'uncompressedSize': uncompressed_size,
            'localHeaderOffset': local_offset,
        }
        offset += 46 + filename_len + extra_len + comment_len
    cache[key] = {
        'entries': entries,
        'tailBytesFetched': tail_size,
        'centralDirectoryBytesFetched': cd_size,
    }
    return cache[key]


def extract_bundle(manifest_row, bundle_name, size_cache, zip_cache):
    pkg = package_meta(manifest_row['packageIndex'], size_cache)
    zd = zip_directory(pkg, zip_cache)
    hits = [
        entry for key, entry in zd['entries'].items()
        if key == bundle_name.lower() or key.endswith('/' + bundle_name.lower())
    ]
    if len(hits) != 1:
        raise RuntimeError(f"{bundle_name}: ZIP entry count {len(hits)} in {pkg['packageName']}")
    entry = hits[0]
    local_offset = entry['localHeaderOffset']
    local = request_bytes(pkg['url'], local_offset, local_offset + 4095)
    if local[:4] != b'PK\x03\x04':
        raise RuntimeError(f'{bundle_name}: bad local header')
    _, method = struct.unpack_from('<HH', local, 6)
    filename_len, extra_len = struct.unpack_from('<HH', local, 26)
    data_start = local_offset + 30 + filename_len + extra_len
    compressed = request_bytes(
        pkg['url'],
        data_start,
        data_start + entry['compressedSize'] - 1,
    )
    if method == 0:
        data = compressed
    elif method == 8:
        data = zlib.decompress(compressed, -15)
    else:
        raise RuntimeError(f'{bundle_name}: unsupported ZIP method {method}')
    md5 = hashlib.md5(data).hexdigest().upper()
    crc = f'{binascii.crc32(data) & 0xffffffff:08X}'
    if len(data) != manifest_row['bytes']:
        raise RuntimeError(f'{bundle_name}: size mismatch {len(data)} != {manifest_row["bytes"]}')
    if md5 != manifest_row['md5']:
        raise RuntimeError(f'{bundle_name}: MD5 mismatch {md5} != {manifest_row["md5"]}')
    if crc != entry['crc32']:
        raise RuntimeError(f'{bundle_name}: CRC mismatch {crc} != {entry["crc32"]}')
    provenance = {
        'packageIndex': pkg['packageIndex'],
        'packageName': pkg['packageName'],
        'packageBytes': pkg['bytes'],
        'bundleName': bundle_name,
        'bundleBytes': len(data),
        'bundleMd5': md5,
        'bundleSha256': hashlib.sha256(data).hexdigest().upper(),
        'bundleCrc32': crc,
        'compressedBytesFetched': len(compressed),
    }
    return data, provenance


def exact_prefab_index(bundle_bytes):
    env = UnityPy.load(bundle_bytes)
    index = {}
    for path, reader in env.container.items():
        key = norm(path)
        if '/prefab/' in key and key.endswith('.prefab'):
            index[key] = {
                'containerPath': str(path),
                'pathId': int(reader.path_id),
                'type': getattr(getattr(reader, 'type', None), 'name', None),
            }
    return index


heroes = []
for path in sorted(DETAIL_DIR.glob('*.json'), key=lambda item: int(item.stem)):
    data = json.loads(path.read_text(encoding='utf-8'))
    source_path = data.get('presentation', {}).get('artwork', {}).get('sourceAssetPath')
    if not source_path:
        raise RuntimeError(f'missing sourceAssetPath: {path}')
    heroes.append({
        'heroId': int(data['heroId']),
        'nameKr': data.get('identity', {}).get('nameKr'),
        'nameCn': data.get('identity', {}).get('nameCn'),
        'nameEn': data.get('identity', {}).get('nameEn'),
        'sourceAssetPath': source_path,
        'family': family_of(source_path),
        'containerPath': 'assets/gameproject/runtimeassets/' + norm(source_path),
    })

if len(heroes) != EXPECTED_HERO_COUNT:
    raise RuntimeError(f'expected {EXPECTED_HERO_COUNT} Heroes, got {len(heroes)}')

families = defaultdict(list)
for hero in heroes:
    families[hero['family']].append(hero)
if len(families) != EXPECTED_FAMILY_COUNT:
    raise RuntimeError(f'expected {EXPECTED_FAMILY_COUNT} families, got {len(families)}')

manifest_text = request_bytes(MANIFEST_URL).decode('utf-8-sig', 'replace')
manifest_rows = parse_manifest(manifest_text)
manifest_by_basename = defaultdict(list)
for row in manifest_rows:
    manifest_by_basename[norm(row['path']).split('/')[-1]].append(row)

size_cache = {}
zip_cache = {}
family_results = []
hero_results = []
bundle_provenance = []

for family in sorted(families):
    canonical = sorted(families[family], key=lambda hero: hero['heroId'])
    final_name = final_bundle_for_family(family)
    begin_name = 'begin_' + final_name

    final_hits = manifest_by_basename.get(final_name.lower(), [])
    if len(final_hits) != 1:
        raise RuntimeError(f'{final_name}: manifest hit count {len(final_hits)}')
    final_bytes, final_provenance = extract_bundle(final_hits[0], final_name, size_cache, zip_cache)
    final_index = exact_prefab_index(final_bytes)
    bundle_provenance.append({'layer': 'final', **final_provenance})
    del final_bytes

    begin_hits = manifest_by_basename.get(begin_name.lower(), [])
    begin_index = {}
    begin_provenance = None
    if len(begin_hits) > 1:
        raise RuntimeError(f'{begin_name}: manifest hit count {len(begin_hits)}')
    if len(begin_hits) == 1:
        begin_bytes, begin_provenance = extract_bundle(begin_hits[0], begin_name, size_cache, zip_cache)
        begin_index = exact_prefab_index(begin_bytes)
        bundle_provenance.append({'layer': 'begin', **begin_provenance})
        del begin_bytes

    family_rows = []
    for hero in canonical:
        final_hit = final_index.get(hero['containerPath'])
        begin_hit = begin_index.get(hero['containerPath'])
        if final_hit and begin_hit:
            classification = 'BOTH'
        elif final_hit:
            classification = 'FINAL_ONLY'
        elif begin_hit:
            classification = 'BEGIN_ONLY'
        else:
            classification = 'NONE'
        row = {
            **hero,
            'classification': classification,
            'final': final_hit,
            'begin': begin_hit,
            'finalBundleName': final_name,
            'beginBundleName': begin_name if begin_provenance else None,
        }
        family_rows.append(row)
        hero_results.append(row)

    counts = {key: sum(1 for row in family_rows if row['classification'] == key) for key in ['FINAL_ONLY', 'BEGIN_ONLY', 'BOTH', 'NONE']}
    final_present = counts['FINAL_ONLY'] + counts['BOTH']
    begin_present = counts['BEGIN_ONLY'] + counts['BOTH']
    expected_final = EXPECTED_FINAL_BY_FAMILY[norm(family)]
    if final_present != expected_final:
        raise RuntimeError(f'{family}: final checkpoint drift {final_present} != {expected_final}')
    family_results.append({
        'family': family,
        'heroCount': len(canonical),
        'finalBundleName': final_name,
        'beginBundleName': begin_name if begin_provenance else None,
        'finalPresent': final_present,
        'beginPresent': begin_present,
        'unionPresent': len(canonical) - counts['NONE'],
        'classificationCounts': counts,
        'beginBundlePresentInManifest': begin_provenance is not None,
    })

classification_totals = {key: sum(1 for row in hero_results if row['classification'] == key) for key in ['FINAL_ONLY', 'BEGIN_ONLY', 'BOTH', 'NONE']}
final_total = classification_totals['FINAL_ONLY'] + classification_totals['BOTH']
begin_total = classification_totals['BEGIN_ONLY'] + classification_totals['BOTH']
union_total = EXPECTED_HERO_COUNT - classification_totals['NONE']

status = 'H_A4_BUNDLE_OWNERSHIP_RESOLVED' if (
    final_total == EXPECTED_FINAL_TOTAL
    and classification_totals['BEGIN_ONLY'] == EXPECTED_BEGIN_ONLY_TOTAL
    and union_total == EXPECTED_HERO_COUNT
) else 'H_A4_BUNDLE_OWNERSHIP_INCOMPLETE'

summary = {
    'status': status,
    'installVersion': VERSION,
    'canonicalHeroCount': EXPECTED_HERO_COUNT,
    'familyCount': EXPECTED_FAMILY_COUNT,
    'previousFinalCheckpointExpected': EXPECTED_FINAL_TOTAL,
    'finalPresent': final_total,
    'beginPresent': begin_total,
    'unionPresent': union_total,
    'classificationTotals': classification_totals,
    'familyResults': family_results,
    'beginOnlyHeroes': [
        {
            'heroId': row['heroId'],
            'nameKr': row['nameKr'],
            'nameCn': row['nameCn'],
            'nameEn': row['nameEn'],
            'family': row['family'],
            'sourceAssetPath': row['sourceAssetPath'],
            'beginBundleName': row['beginBundleName'],
            'beginPrefabPathId': row['begin']['pathId'],
        }
        for row in hero_results if row['classification'] == 'BEGIN_ONLY'
    ],
    'unresolvedHeroes': [
        {
            'heroId': row['heroId'],
            'nameKr': row['nameKr'],
            'family': row['family'],
            'sourceAssetPath': row['sourceAssetPath'],
        }
        for row in hero_results if row['classification'] == 'NONE'
    ],
    'operationalExtractionRule': 'Use exact canonical prefab presence. Final-present Heroes can be extracted from the final family bundle; final-missing Heroes are resolved only when the exact prefab exists in the matching begin_ family bundle. This is an extraction rule, not a claim about client runtime merge semantics.',
}

(REPORT / 'hero-artwork-bundle-ownership-summary.json').write_text(
    json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8'
)
(REPORT / 'hero-artwork-bundle-ownership-index.json').write_text(
    json.dumps(hero_results, ensure_ascii=False, indent=2), encoding='utf-8'
)
(REPORT / 'hero-artwork-bundle-provenance.json').write_text(
    json.dumps(bundle_provenance, ensure_ascii=False, indent=2), encoding='utf-8'
)

compact = {
    'status': status,
    'canonicalHeroCount': EXPECTED_HERO_COUNT,
    'finalPresent': final_total,
    'beginPresent': begin_total,
    'unionPresent': union_total,
    'classificationTotals': classification_totals,
    'families': family_results,
    'beginOnlyHeroIds': [row['heroId'] for row in hero_results if row['classification'] == 'BEGIN_ONLY'],
    'unresolvedHeroIds': [row['heroId'] for row in hero_results if row['classification'] == 'NONE'],
}
(REPORT / 'hero-artwork-bundle-ownership-compact.json').write_text(
    json.dumps(compact, ensure_ascii=False, indent=2), encoding='utf-8'
)
print(json.dumps(compact, ensure_ascii=True))
if status != 'H_A4_BUNDLE_OWNERSHIP_RESOLVED':
    raise SystemExit(4)
