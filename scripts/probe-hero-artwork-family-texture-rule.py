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

ROOT = pathlib.Path(os.environ.get('RUNNER_TEMP', '.')) / 'langrisser-hero-artwork-family-texture-rule'
REPORT = ROOT / 'report'
REPORT.mkdir(parents=True, exist_ok=True)
DETAIL_DIR = pathlib.Path('data/generated/hero-detail/by-id')
VERSION = '1.1.113'
BASE = f'http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VERSION}'
MANIFEST_URL = f'{BASE}/intallinfo_{VERSION}.ini'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'
EXPECTED_FAMILY_COUNT = 7


def norm(s):
    return str(s).replace('\\', '/').strip('/').lower()


def family_of(path):
    parts = str(path).replace('\\', '/').split('/')
    try:
        i = next(i for i, p in enumerate(parts) if p.lower() == 'prefab')
    except StopIteration:
        raise RuntimeError(f'non-Prefab artwork path: {path}')
    return '/'.join(parts[:i + 1])


def bundle_name_for_family(family):
    parts = family.replace('\\', '/').split('/')
    if len(parts) != 4 or parts[0].lower() != 'ui' or parts[3].lower() != 'prefab':
        raise RuntimeError(f'unexpected family form: {family}')
    return f"ui_{parts[1].lower()}_{parts[2].lower()}.b"


def request_bytes(url, start=None, end=None):
    headers = {'User-Agent': UA, 'Accept-Encoding': 'identity'}
    if start is not None:
        headers['Range'] = f'bytes={start}-{end}'
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = resp.read()
        if start is not None and len(data) != end - start + 1:
            raise RuntimeError(f'range ignored/mismatch for {url}: {len(data)} != {end-start+1}')
        return data


def head_size(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'identity'}, method='HEAD')
    with urllib.request.urlopen(req, timeout=60) as resp:
        n = resp.headers.get('Content-Length')
        if not n:
            raise RuntimeError(f'HEAD missing Content-Length: {url}')
        return int(n)


def parse_manifest(text):
    package = None
    rows = []
    for raw in text.splitlines():
        line = raw.strip()
        m = re.fullmatch(r'\[Package(\d+)\]', line, re.I)
        if m:
            package = int(m.group(1))
            continue
        if package is None or not re.match(r'^File\d+=', line, re.I):
            continue
        value = line.split('=', 1)[1]
        parts = value.rsplit(',', 3)
        if len(parts) != 4:
            continue
        path, flag, size, md5 = parts
        rows.append({
            'packageIndex': package,
            'path': path.replace('\\', '/'),
            'flag': flag,
            'bytes': int(size),
            'md5': md5.upper(),
        })
    return rows


def zip_directory(url, total_size, cache, package_index):
    if package_index in cache:
        return cache[package_index]
    tail_size = min(1_048_576, total_size)
    tail_start = total_size - tail_size
    tail = request_bytes(url, tail_start, total_size - 1)
    pos = tail.rfind(b'PK\x05\x06')
    if pos < 0:
        raise RuntimeError(f'EOCD not found in package {package_index}')
    disk, cd_disk, n_disk, n_total, cd_size, cd_off, comment_len = struct.unpack_from('<HHHHIIH', tail, pos + 4)
    if disk or cd_disk:
        raise RuntimeError('multi-disk ZIP unsupported')
    cd = request_bytes(url, cd_off, cd_off + cd_size - 1)
    entries = {}
    p = 0
    while p + 46 <= len(cd):
        if cd[p:p+4] != b'PK\x01\x02':
            break
        flags, method = struct.unpack_from('<HH', cd, p + 8)
        crc, csize, usize = struct.unpack_from('<III', cd, p + 16)
        fn, ex, cm = struct.unpack_from('<HHH', cd, p + 28)
        local = struct.unpack_from('<I', cd, p + 42)[0]
        nameb = cd[p+46:p+46+fn]
        name = nameb.decode('utf-8' if flags & 0x800 else 'cp437', 'replace')
        entries[norm(name)] = {
            'name': name, 'flags': flags, 'method': method, 'crc32': f'{crc:08X}',
            'compressedSize': csize, 'uncompressedSize': usize, 'localHeaderOffset': local,
        }
        p += 46 + fn + ex + cm
    cache[package_index] = {'entries': entries, 'tailSize': tail_size, 'centralDirectorySize': cd_size}
    return cache[package_index]


def extract_bundle(url, total_size, package_index, bundle_name, expected_size, expected_md5, cache):
    zd = zip_directory(url, total_size, cache, package_index)
    hits = [v for k, v in zd['entries'].items() if k == bundle_name.lower() or k.endswith('/' + bundle_name.lower())]
    if len(hits) != 1:
        raise RuntimeError(f'{bundle_name}: ZIP entry count {len(hits)}')
    ent = hits[0]
    off = ent['localHeaderOffset']
    local = request_bytes(url, off, off + 4095)
    if local[:4] != b'PK\x03\x04':
        raise RuntimeError('bad local header')
    flags, method = struct.unpack_from('<HH', local, 6)
    fn, ex = struct.unpack_from('<HH', local, 26)
    data_start = off + 30 + fn + ex
    compressed = request_bytes(url, data_start, data_start + ent['compressedSize'] - 1)
    if method == 0:
        data = compressed
    elif method == 8:
        data = zlib.decompress(compressed, -15)
    else:
        raise RuntimeError(f'unsupported ZIP method {method}')
    md5 = hashlib.md5(data).hexdigest().upper()
    crc = f'{binascii.crc32(data) & 0xffffffff:08X}'
    if len(data) != expected_size or md5 != expected_md5 or crc != ent['crc32']:
        raise RuntimeError(f'{bundle_name}: integrity mismatch size/md5/crc')
    return data, {
        'packageIndex': package_index,
        'packageName': f'InstallPage_{VERSION}_{package_index + 1}.zip',
        'packageBytes': total_size,
        'bundleName': bundle_name,
        'bundleBytes': len(data),
        'bundleMd5': md5,
        'bundleSha256': hashlib.sha256(data).hexdigest().upper(),
        'bundleCrc32': crc,
        'compressedBytes': len(compressed),
    }


def obj_type(reader):
    return getattr(getattr(reader, 'type', None), 'name', None)


def pptrs(value, prefix=''):
    out = []
    if isinstance(value, dict):
        if 'm_FileID' in value and 'm_PathID' in value:
            try:
                out.append((prefix or '$', int(value['m_FileID']), int(value['m_PathID'])))
            except Exception:
                pass
        for k, v in value.items():
            out.extend(pptrs(v, f'{prefix}.{k}' if prefix else str(k)))
    elif isinstance(value, list):
        for i, v in enumerate(value):
            out.extend(pptrs(v, f'{prefix}[{i}]'))
    return out


def validate_prefab(bundle_bytes, source_path):
    env = UnityPy.load(bundle_bytes)
    by_pid = {int(o.path_id): o for o in env.objects}
    container = defaultdict(list)
    wanted = 'assets/gameproject/runtimeassets/' + norm(source_path)
    prefab = None
    for path, reader in env.container.items():
        container[int(reader.path_id)].append(str(path))
        if norm(path) == wanted:
            prefab = reader
    if prefab is None:
        raise RuntimeError(f'exact prefab missing: {wanted}')

    allowed = {'GameObject','Transform','RectTransform','MonoBehaviour','CanvasRenderer','SpriteRenderer','Sprite','Texture2D','Material','Animator','Animation'}
    root = int(prefab.path_id)
    queue = [(root, 0)]
    seen = set()
    parent = {root: None}
    edge = {}
    sprite_ids = set()
    max_depth = 12
    while queue and len(seen) < 500:
        pid, depth = queue.pop(0)
        if pid in seen or depth > max_depth or pid not in by_pid:
            continue
        seen.add(pid)
        reader = by_pid[pid]
        if obj_type(reader) == 'Sprite':
            sprite_ids.add(pid)
        try:
            tree = reader.read_typetree()
        except Exception:
            continue
        for field, file_id, child_pid in pptrs(tree):
            if file_id != 0 or child_pid == 0 or child_pid not in by_pid:
                continue
            typ = obj_type(by_pid[child_pid])
            if typ not in allowed:
                continue
            if child_pid not in parent:
                parent[child_pid] = pid
                edge[child_pid] = {'fromPathId': pid, 'fieldPath': field, 'toType': typ}
            if child_pid not in seen:
                queue.append((child_pid, depth + 1))

    def chain(pid):
        rows = []
        cur = pid
        while cur is not None:
            r = by_pid[cur]
            item = {'pathId': cur, 'type': obj_type(r), 'containerPaths': container.get(cur, [])}
            if cur in edge:
                item['incoming'] = edge[cur]
            rows.append(item)
            cur = parent.get(cur)
        return list(reversed(rows))

    sprites = []
    texture_ids = set()
    for sid in sorted(sprite_ids):
        sr = by_pid[sid]
        direct = []
        try:
            tree = sr.read_typetree()
            for field, file_id, pid in pptrs(tree):
                if file_id == 0 and pid in by_pid and obj_type(by_pid[pid]) == 'Texture2D':
                    tex = by_pid[pid]
                    tex_data = tex.read()
                    direct.append({
                        'fieldPath': field,
                        'pathId': pid,
                        'containerPaths': container.get(pid, []),
                        'name': str(getattr(tex_data, 'm_Name', '')),
                        'width': int(getattr(tex_data, 'm_Width', 0)),
                        'height': int(getattr(tex_data, 'm_Height', 0)),
                    })
                    texture_ids.add(pid)
        except Exception as exc:
            direct.append({'error': f'{type(exc).__name__}: {exc}'})
        sprites.append({
            'pathId': sid,
            'containerPaths': container.get(sid, []),
            'referenceChain': chain(sid),
            'textureRefs': direct,
            'hasMRDTexture': any(x.get('fieldPath') == 'm_RD.texture' and x.get('pathId') for x in direct),
        })

    valid_sprites = [s for s in sprites if s['hasMRDTexture']]
    return {
        'prefabContainerPath': wanted,
        'prefabPathId': root,
        'visitedObjectCount': len(seen),
        'referencedSpriteCount': len(sprites),
        'referencedTextureCount': len(texture_ids),
        'sprites': sprites,
        'rulePass': bool(valid_sprites),
        'rule': 'exact prefab serialized PPtr traversal reaches Sprite; Sprite has direct m_RD.texture PPtr resolving to Texture2D',
    }


# Canonical 267 census + deterministic representative (lowest heroId) per family.
heroes = []
for p in sorted(DETAIL_DIR.glob('*.json'), key=lambda x: int(x.stem)):
    data = json.loads(p.read_text(encoding='utf-8'))
    path = data.get('presentation', {}).get('artwork', {}).get('sourceAssetPath')
    if not path:
        raise RuntimeError(f'missing artwork path: {p}')
    fam = family_of(path)
    heroes.append({
        'heroId': int(data['heroId']),
        'nameKr': data.get('identity', {}).get('nameKr'),
        'nameEn': data.get('identity', {}).get('nameEn'),
        'sourceAssetPath': path,
        'family': fam,
    })
if len(heroes) != 267:
    raise RuntimeError(f'expected 267 hero details, got {len(heroes)}')

families = defaultdict(list)
for h in heroes:
    families[h['family']].append(h)
if len(families) != EXPECTED_FAMILY_COUNT:
    raise RuntimeError(f'expected {EXPECTED_FAMILY_COUNT} families, got {len(families)}')
representatives = [sorted(v, key=lambda h: h['heroId'])[0] for _, v in sorted(families.items())]

manifest_text = request_bytes(MANIFEST_URL).decode('utf-8-sig', 'replace')
manifest_rows = parse_manifest(manifest_text)
manifest_by_bundle = {}
for row in manifest_rows:
    name = norm(row['path']).split('/')[-1]
    manifest_by_bundle.setdefault(name, []).append(row)

zip_cache = {}
bundle_cache = {}
results = []
for rep in representatives:
    bundle_name = bundle_name_for_family(rep['family'])
    hits = manifest_by_bundle.get(bundle_name.lower(), [])
    if len(hits) != 1:
        raise RuntimeError(f'{bundle_name}: manifest hit count {len(hits)}')
    m = hits[0]
    package_index = m['packageIndex']
    package_name = f'InstallPage_{VERSION}_{package_index + 1}.zip'
    package_url = f'{BASE}/{package_name}'
    package_bytes = head_size(package_url)
    if bundle_name not in bundle_cache:
        bundle_cache[bundle_name] = extract_bundle(
            package_url, package_bytes, package_index, bundle_name, m['bytes'], m['md5'], zip_cache
        )
    bundle_bytes, provenance = bundle_cache[bundle_name]
    validation = validate_prefab(bundle_bytes, rep['sourceAssetPath'])
    row = {
        **rep,
        'familyHeroCount': len(families[rep['family']]),
        'bundleProvenance': provenance,
        'textureRuleValidation': validation,
        'status': 'PASS' if validation['rulePass'] else 'FAIL',
    }
    results.append(row)

summary = {
    'status': 'H_A3_TEXTURE2D_RULE_VALIDATED' if all(r['status'] == 'PASS' for r in results) else 'H_A3_TEXTURE2D_RULE_FAILED',
    'inputHeroCount': len(heroes),
    'distinctFamilyCount': len(families),
    'representativeSelectionRule': 'lowest heroId in each exact /Prefab family',
    'validationRule': 'exact prefab serialized PPtr traversal -> Sprite -> direct m_RD.texture PPtr -> Texture2D',
    'familyResults': results,
}
(REPORT / 'family-texture2d-rule-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
(REPORT / 'family-texture2d-rule-compact.json').write_text(json.dumps({
    'status': summary['status'],
    'inputHeroCount': 267,
    'distinctFamilyCount': len(families),
    'families': [
        {
            'family': r['family'], 'heroCount': r['familyHeroCount'],
            'representativeHeroId': r['heroId'], 'representativeNameKr': r['nameKr'],
            'sourceAssetPath': r['sourceAssetPath'],
            'bundleName': r['bundleProvenance']['bundleName'],
            'packageIndex': r['bundleProvenance']['packageIndex'],
            'packageName': r['bundleProvenance']['packageName'],
            'prefabPathId': r['textureRuleValidation']['prefabPathId'],
            'referencedSpriteCount': r['textureRuleValidation']['referencedSpriteCount'],
            'referencedTextureCount': r['textureRuleValidation']['referencedTextureCount'],
            'status': r['status'],
        } for r in results
    ],
}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(summary, ensure_ascii=True))
if summary['status'] != 'H_A3_TEXTURE2D_RULE_VALIDATED':
    raise SystemExit(4)
