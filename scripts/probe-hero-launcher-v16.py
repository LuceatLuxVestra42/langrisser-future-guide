import binascii
import hashlib
import json
import pathlib
import struct
import sys
import urllib.request
import zlib

import UnityPy

ROOT = pathlib.Path(__import__('os').environ.get('RUNNER_TEMP', '.')) / 'langrisser-launcher-probe-v16'
REPORT = ROOT / 'report'
ROOT.mkdir(parents=True, exist_ok=True)
REPORT.mkdir(parents=True, exist_ok=True)

VERSION = '1.1.113'
PACKAGE_INDEX = 60
PACKAGE_NAME = 'InstallPage_1.1.113_61.zip'
PACKAGE_URL = f'http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{VERSION}/{PACKAGE_NAME}'
EXPECTED_PACKAGE_BYTES = 109_027_105
EXPECTED_PACKAGE_MD5 = '77EA43E878D2A50E18EE96C814F34FD2'
BUNDLE_NAME = 'ui_heropainting_ssr_abs.b'
EXPECTED_BUNDLE_BYTES = 25_793_935
EXPECTED_BUNDLE_MD5 = '168B2D54E39D62B98CD1E92BDE9F787B'
CANONICAL_SOURCE = 'UI/HeroPainting/SSR_ABS/Prefab/Leon.prefab'
EXPECTED_CONTAINER_PATH = 'assets/gameproject/runtimeassets/ui/heropainting/ssr_abs/prefab/leon.prefab'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36'


def fetch_range(start: int, end: int) -> bytes:
    req = urllib.request.Request(
        PACKAGE_URL,
        headers={'User-Agent': UA, 'Accept-Encoding': 'identity', 'Range': f'bytes={start}-{end}'},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
        if resp.status not in (200, 206):
            raise RuntimeError(f'HTTP {resp.status} for range {start}-{end}')
    expected = end - start + 1
    if len(data) != expected:
        raise RuntimeError(f'range size mismatch {len(data)} != {expected} for {start}-{end}')
    return data


def norm(path: str) -> str:
    return str(path).replace('\\', '/').lower().strip('/')


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
            child = f'{prefix}.{k}' if prefix else str(k)
            out.extend(pptrs(v, child))
    elif isinstance(value, list):
        for i, v in enumerate(value):
            child = f'{prefix}[{i}]'
            out.extend(pptrs(v, child))
    return out


# 1) Range-extract only the known owning bundle from Package60.
tail_size = 1_048_576
tail_start = EXPECTED_PACKAGE_BYTES - tail_size
tail = fetch_range(tail_start, EXPECTED_PACKAGE_BYTES - 1)
eocd_pos = tail.rfind(b'PK\x05\x06')
if eocd_pos < 0:
    raise RuntimeError('EOCD not found')
_, _, _, entry_count, cd_size, cd_off, comment_len = struct.unpack_from('<HHHHIIH', tail, eocd_pos + 4)
cd = fetch_range(cd_off, cd_off + cd_size - 1)

pos = 0
target = None
entries = []
while pos + 46 <= len(cd):
    if cd[pos:pos+4] != b'PK\x01\x02':
        break
    flags, method = struct.unpack_from('<HH', cd, pos + 8)
    crc, csize, usize = struct.unpack_from('<III', cd, pos + 16)
    fn, ex, cm = struct.unpack_from('<HHH', cd, pos + 28)
    local_off = struct.unpack_from('<I', cd, pos + 42)[0]
    name_b = cd[pos+46:pos+46+fn]
    name = name_b.decode('utf-8' if flags & 0x800 else 'cp437', 'replace')
    row = {
        'name': name, 'flags': flags, 'method': method, 'crc32': f'{crc:08X}',
        'compressedSize': csize, 'uncompressedSize': usize, 'localHeaderOffset': local_off,
    }
    entries.append(row)
    if norm(name).endswith('/' + BUNDLE_NAME) or norm(name) == BUNDLE_NAME:
        target = row
    pos += 46 + fn + ex + cm
if target is None:
    raise RuntimeError('owning bundle ZIP entry not found')

local = fetch_range(target['localHeaderOffset'], target['localHeaderOffset'] + 4095)
if local[:4] != b'PK\x03\x04':
    raise RuntimeError('local ZIP header signature mismatch')
flags, method = struct.unpack_from('<HH', local, 6)
fn, ex = struct.unpack_from('<HH', local, 26)
local_name = local[30:30+fn].decode('utf-8' if flags & 0x800 else 'cp437', 'replace')
data_start = target['localHeaderOffset'] + 30 + fn + ex
compressed = fetch_range(data_start, data_start + target['compressedSize'] - 1)
if method == 0:
    bundle_bytes = compressed
elif method == 8:
    bundle_bytes = zlib.decompress(compressed, -15)
else:
    raise RuntimeError(f'unsupported ZIP method {method}')

bundle_md5 = hashlib.md5(bundle_bytes).hexdigest().upper()
bundle_sha256 = hashlib.sha256(bundle_bytes).hexdigest().upper()
bundle_crc = f'{binascii.crc32(bundle_bytes) & 0xffffffff:08X}'
if len(bundle_bytes) != EXPECTED_BUNDLE_BYTES:
    raise RuntimeError(f'bundle size mismatch {len(bundle_bytes)} != {EXPECTED_BUNDLE_BYTES}')
if bundle_md5 != EXPECTED_BUNDLE_MD5:
    raise RuntimeError(f'bundle MD5 mismatch {bundle_md5} != {EXPECTED_BUNDLE_MD5}')
if bundle_crc != target['crc32']:
    raise RuntimeError(f'bundle CRC mismatch {bundle_crc} != {target["crc32"]}')

bundle_path = ROOT / BUNDLE_NAME
bundle_path.write_bytes(bundle_bytes)

# 2) Resolve exact Leon prefab from the AssetBundle container.
env = UnityPy.load(str(bundle_path))
objects_by_pid = {int(o.path_id): o for o in env.objects}
container_by_pid = {}
prefab_reader = None
for path, reader in env.container.items():
    pid = int(reader.path_id)
    container_by_pid.setdefault(pid, []).append(str(path))
    if norm(path) == EXPECTED_CONTAINER_PATH:
        prefab_reader = reader
if prefab_reader is None:
    raise RuntimeError('exact Leon.prefab container path missing')
if obj_type(prefab_reader) != 'GameObject':
    raise RuntimeError(f'Leon.prefab container type is {obj_type(prefab_reader)}, expected GameObject')

# 3) Traverse serialized object references from Leon.prefab. This is the selection rule;
#    asset filenames are recorded only after a referenced object is reached.
queue = [(int(prefab_reader.path_id), 0)]
seen = set()
parent = {int(prefab_reader.path_id): None}
edge_meta = {}
visited_rows = []
sprite_pids = set()
texture_pids = set()
MAX_DEPTH = 12
MAX_OBJECTS = 500

while queue and len(seen) < MAX_OBJECTS:
    pid, depth = queue.pop(0)
    if pid in seen or depth > MAX_DEPTH:
        continue
    reader = objects_by_pid.get(pid)
    if reader is None:
        continue
    seen.add(pid)
    typ = obj_type(reader)
    visited_rows.append({'pathId': pid, 'type': typ, 'depth': depth, 'containerPaths': container_by_pid.get(pid, [])})
    if typ == 'Sprite':
        sprite_pids.add(pid)
    if typ == 'Texture2D':
        texture_pids.add(pid)
    try:
        tree = reader.read_typetree()
    except Exception as exc:
        visited_rows[-1]['typetreeError'] = f'{type(exc).__name__}: {exc}'
        continue
    refs = pptrs(tree)
    for field_path, file_id, child_pid in refs:
        if file_id != 0 or child_pid == 0 or child_pid not in objects_by_pid:
            continue
        child = objects_by_pid[child_pid]
        child_type = obj_type(child)
        # Follow prefab structure/components plus direct image assets. Avoid unrelated script graphs.
        allowed = child_type in {
            'GameObject', 'Transform', 'RectTransform', 'MonoBehaviour', 'CanvasRenderer',
            'SpriteRenderer', 'Sprite', 'Texture2D', 'Material', 'Animator', 'Animation',
        }
        if not allowed:
            continue
        if child_pid not in parent:
            parent[child_pid] = pid
            edge_meta[child_pid] = {'fromPathId': pid, 'fieldPath': field_path, 'toType': child_type}
        if child_pid not in seen:
            queue.append((child_pid, depth + 1))

# 4) For every Sprite reached by actual prefab references, follow the Sprite's own serialized
#    references to Texture2D and export the Sprite-rendered PNG. No filename-based candidate choice.
def chain_for(pid):
    chain = []
    cur = pid
    while cur is not None:
        reader = objects_by_pid.get(cur)
        item = {'pathId': cur, 'type': obj_type(reader) if reader else None, 'containerPaths': container_by_pid.get(cur, [])}
        if cur in edge_meta:
            item['incoming'] = edge_meta[cur]
        chain.append(item)
        cur = parent.get(cur)
    return list(reversed(chain))

sprite_rows = []
for pid in sorted(sprite_pids):
    reader = objects_by_pid[pid]
    row = {'pathId': pid, 'containerPaths': container_by_pid.get(pid, []), 'referenceChain': chain_for(pid)}
    try:
        tree = reader.read_typetree()
        tex_refs = []
        for field_path, file_id, child_pid in pptrs(tree):
            child = objects_by_pid.get(child_pid) if file_id == 0 else None
            if child is not None and obj_type(child) == 'Texture2D':
                tex_refs.append({'fieldPath': field_path, 'pathId': child_pid, 'containerPaths': container_by_pid.get(child_pid, [])})
                texture_pids.add(child_pid)
        row['textureRefs'] = tex_refs
    except Exception as exc:
        row['spriteTypetreeError'] = f'{type(exc).__name__}: {exc}'
    try:
        data = reader.read()
        name = str(getattr(data, 'm_Name', ''))
        image = data.image
        out_png = REPORT / f'leon-sprite-{pid}.png'
        image.save(out_png, 'PNG')
        raw = out_png.read_bytes()
        row.update({
            'name': name, 'pngFile': out_png.name, 'width': image.width, 'height': image.height,
            'pngBytes': len(raw), 'pngSha256': hashlib.sha256(raw).hexdigest().upper(),
        })
    except Exception as exc:
        row['exportError'] = f'{type(exc).__name__}: {exc}'
    sprite_rows.append(row)

# Prefer an unambiguous single referenced Sprite. If there are multiple, do not guess.
exported = [r for r in sprite_rows if r.get('pngFile') and not r.get('exportError')]
selection_status = 'UNIQUE_REFERENCED_SPRITE_EXPORTED' if len(exported) == 1 else 'AMBIGUOUS_REFERENCED_SPRITES'
selected = exported[0] if len(exported) == 1 else None

summary = {
    'status': 'LEON_REPRESENTATIVE_ARTWORK_EXTRACTED' if selected else selection_status,
    'heroId': 6,
    'canonicalSourceArtworkPath': CANONICAL_SOURCE,
    'installVersion': VERSION,
    'packageIndex': PACKAGE_INDEX,
    'packageName': PACKAGE_NAME,
    'packageExpectedBytes': EXPECTED_PACKAGE_BYTES,
    'packageExpectedMd5': EXPECTED_PACKAGE_MD5,
    'bundleName': BUNDLE_NAME,
    'bundleBytes': len(bundle_bytes),
    'bundleMd5': bundle_md5,
    'bundleSha256': bundle_sha256,
    'bundleCrc32': bundle_crc,
    'bundleZipEntry': target,
    'bundleLocalName': local_name,
    'compressedBytes': len(compressed),
    'totalPayloadFetchedApprox': tail_size + cd_size + 4096 + len(compressed),
    'prefabContainerPath': EXPECTED_CONTAINER_PATH,
    'prefabPathId': int(prefab_reader.path_id),
    'unityPyVersion': getattr(UnityPy, '__version__', None),
    'visitedObjectCount': len(seen),
    'referencedSpriteCount': len(sprite_rows),
    'referencedTextureCount': len(texture_pids),
    'selectionRule': 'serialized PPtr traversal from exact Leon.prefab; no filename-similarity selection',
    'selectionStatus': selection_status,
    'selectedSprite': selected,
    'allReferencedSprites': sprite_rows,
}
(REPORT / 'leon-artwork-provenance.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
(REPORT / 'leon-prefab-reference-graph.json').write_text(json.dumps(visited_rows, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(summary, ensure_ascii=True))

if selected is None:
    raise SystemExit(4)
