import binascii
import hashlib
import io
import json
import re
import struct
import urllib.request
import zlib
from pathlib import Path

from PIL import Image
import UnityPy

ROOT = Path.cwd()
APK_URL = 'https://mhmnzdownload.zlongame.com/MHMNZ/Clientdown/mz-client-formal-cn.apk'
APK_REF = 'https://mz.zlongame.com/main.shtml'
UA = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36'
BUNDLE_BY_ROOT = {
    'UI/Icon/Equip_ABS/': 'assets/ExportAssetBundle/ui_icon_equip_abs.b',
    'UI/Icon/Item04_ABS/': 'assets/ExportAssetBundle/ui_icon_item04_abs.b',
}
REPRESENTATIVES = {
    6: 'Equip_Dagger6',
    59: 'Equip_MetalArmor6',
    80: 'Equip_MetalHelmet6',
    99: 'Equip_Boots4',
    273: 'Equip_Sword13',
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def get_range(start: int, end: int):
    req = urllib.request.Request(APK_URL, headers={
        'User-Agent': UA,
        'Referer': APK_REF,
        'Range': f'bytes={start}-{end}',
    })
    with urllib.request.urlopen(req, timeout=180) as r:
        data = r.read()
        if len(data) != end - start + 1:
            raise RuntimeError(f'range {start}-{end}: got {len(data)} bytes, status={r.status}, Content-Range={r.headers.get("Content-Range")}')
        return data, r.headers


def get_total_size():
    data, headers = get_range(0, 1023)
    m = re.search(r'/([0-9]+)$', headers.get('Content-Range', ''))
    if not m:
        raise RuntimeError(f'No total in Content-Range: {headers.get("Content-Range")}')
    return int(m.group(1)), headers


def parse_zip_index(total):
    tail_start = max(0, total - 1024 * 1024)
    tail, _ = get_range(tail_start, total - 1)
    pos = tail.rfind(b'PK\x05\x06')
    if pos < 0:
        raise RuntimeError('EOCD not found')
    eocd_off = tail_start + pos
    e = tail[pos:pos + 22]
    _, _, _, total_entries, cd_size32, cd_off32, _ = struct.unpack_from('<HHHHIIH', e, 4)
    cd_size, cd_off = cd_size32, cd_off32
    if total_entries == 0xFFFF or cd_size32 == 0xFFFFFFFF or cd_off32 == 0xFFFFFFFF:
        loc, _ = get_range(eocd_off - 20, eocd_off - 1)
        if loc[:4] != b'PK\x06\x07':
            raise RuntimeError('Zip64 locator missing')
        zip64_eocd_off = struct.unpack_from('<Q', loc, 8)[0]
        z, _ = get_range(zip64_eocd_off, zip64_eocd_off + 55)
        if z[:4] != b'PK\x06\x06':
            raise RuntimeError('Zip64 EOCD missing')
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
        try:
            name = raw_name.decode('utf-8')
        except UnicodeDecodeError:
            name = raw_name.decode('cp437')
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
                        local_off = struct.unpack_from('<Q', payload, q)[0]; q += 8
                    break
                p += 4 + size
        entries[name] = {'method': method, 'crc32': crc, 'compressedSize': comp, 'uncompressedSize': uncomp, 'localOffset': local_off}
        i += 46 + fn + ex + cm
    return entries


def fetch_zip_entry(meta):
    local, _ = get_range(meta['localOffset'], meta['localOffset'] + 29)
    if local[:4] != b'PK\x03\x04':
        raise RuntimeError('bad local header')
    fn, ex = struct.unpack_from('<HH', local, 26)
    data_start = meta['localOffset'] + 30 + fn + ex
    comp, _ = get_range(data_start, data_start + meta['compressedSize'] - 1)
    if meta['method'] == 0:
        raw = comp
    elif meta['method'] == 8:
        raw = zlib.decompress(comp, -15)
    else:
        raise RuntimeError(f'unsupported ZIP method {meta["method"]}')
    if len(raw) != meta['uncompressedSize']:
        raise RuntimeError(f'uncompressed size mismatch {len(raw)} != {meta["uncompressedSize"]}')
    if (binascii.crc32(raw) & 0xffffffff) != meta['crc32']:
        raise RuntimeError('ZIP CRC mismatch')
    return raw


def normalize_unity_bundle(raw: bytes):
    for sig in (b'UnityFS', b'UnityWeb', b'UnityRaw'):
        pos = raw.find(sig, 0, 256)
        if pos >= 0:
            return raw[pos:], pos, sig.decode('ascii')
    raise RuntimeError(f'Unity bundle signature not found in first 256 bytes: {raw[:32].hex()}')


def load_textures(bundle_bytes: bytes):
    env = UnityPy.load(bundle_bytes)
    textures = {}
    duplicates = []
    for obj in env.objects:
        if obj.type.name != 'Texture2D':
            continue
        data = obj.read()
        name = getattr(data, 'm_Name', None) or getattr(data, 'name', None)
        if not name:
            continue
        if name in textures:
            duplicates.append(name)
        else:
            textures[name] = data
    if duplicates:
        # Exact duplicate names are unsafe for path resolution.
        raise RuntimeError(f'duplicate Texture2D names in one bundle: {sorted(set(duplicates))[:20]}')
    return textures


def rgba_pixel_sha(image: Image.Image):
    rgba = image.convert('RGBA')
    return sha256(rgba.tobytes()), rgba.size


def png_bytes(image: Image.Image):
    buf = io.BytesIO()
    image.save(buf, format='PNG')
    return buf.getvalue()


total, apk_headers = get_total_size()
index = parse_zip_index(total)
missing_entries = [p for p in BUNDLE_BY_ROOT.values() if p not in index]
if missing_entries:
    raise RuntimeError(f'missing bundle entries: {missing_entries}')

bundles = {}
bundle_evidence = {}
for root, entry in BUNDLE_BY_ROOT.items():
    raw = fetch_zip_entry(index[entry])
    normalized, prefix_bytes, sig = normalize_unity_bundle(raw)
    textures = load_textures(normalized)
    bundles[root] = textures
    bundle_evidence[root] = {
        'apkEntry': entry,
        'zipMethod': index[entry]['method'],
        'zipCrc32': f"{index[entry]['crc32']:08x}",
        'compressedBytes': index[entry]['compressedSize'],
        'sourceBundleBytes': len(raw),
        'sourceBundleSha256': sha256(raw),
        'unityPayloadOffset': prefix_bytes,
        'unitySignature': sig,
        'texture2DCount': len(textures),
    }
    print(root, json.dumps(bundle_evidence[root], ensure_ascii=False))

# Freeze extraction semantics only if current official bundle extraction reproduces
# the already-frozen Stage 1 representative pixels exactly.
representative_checks = []
for equipment_id, texture_name in REPRESENTATIVES.items():
    tex = bundles['UI/Icon/Equip_ABS/'].get(texture_name)
    if tex is None:
        raise RuntimeError(f'representative texture missing: {texture_name}')
    image = tex.image
    extracted_pixel_sha, extracted_size = rgba_pixel_sha(image)
    repo_path = ROOT / f'public/images/equipment/{equipment_id}.png'
    if not repo_path.exists():
        raise RuntimeError(f'frozen representative PNG missing: {repo_path}')
    with Image.open(repo_path) as prior:
        prior_pixel_sha, prior_size = rgba_pixel_sha(prior)
    representative_checks.append({
        'equipmentId': equipment_id,
        'textureName': texture_name,
        'officialSize': list(extracted_size),
        'frozenSize': list(prior_size),
        'officialPixelSha256': extracted_pixel_sha,
        'frozenPixelSha256': prior_pixel_sha,
        'pixelParity': extracted_size == prior_size and extracted_pixel_sha == prior_pixel_sha,
    })
if not all(x['pixelParity'] for x in representative_checks):
    raise RuntimeError('official APK Texture2D extraction does not reproduce frozen representative pixels exactly')

hold_index = json.loads((ROOT / 'data/generated/equipment-image-stage2-hold29-index.v1.json').read_text())
if hold_index.get('count') != 29 or len(hold_index.get('records', [])) != 29:
    raise RuntimeError('hold29 index is not 29 records')

records = []
for rec in hold_index['records']:
    source = rec['sourceIconPath']
    root = next((r for r in BUNDLE_BY_ROOT if source.startswith(r)), None)
    if root is None:
        raise RuntimeError(f'unsupported source root: {source}')
    basename = rec['sourceBasename']
    texture_name = re.sub(r'\.[^.]+$', '', basename)
    tex = bundles[root].get(texture_name)
    if tex is None:
        raise RuntimeError(f'ID {rec["equipmentId"]}: exact Texture2D {texture_name!r} not found in {BUNDLE_BY_ROOT[root]}')
    image = tex.image
    pixel_sha, size = rgba_pixel_sha(image)
    if size != (172, 172):
        raise RuntimeError(f'ID {rec["equipmentId"]}: unexpected texture size {size}')
    png = png_bytes(image)
    target = ROOT / rec['targetRepositoryPath']
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(png)
    with Image.open(target) as verify:
        written_pixel_sha, written_size = rgba_pixel_sha(verify)
    if written_size != size or written_pixel_sha != pixel_sha:
        raise RuntimeError(f'ID {rec["equipmentId"]}: written PNG pixel parity failed')
    records.append({
        'equipmentId': rec['equipmentId'],
        'nameCn': rec.get('nameCn'),
        'sourceIconPath': source,
        'sourceRoot': root,
        'sourceBasename': basename,
        'officialApkBundleEntry': BUNDLE_BY_ROOT[root],
        'texture2DName': texture_name,
        'texture2DExactNameMatch': True,
        'width': size[0],
        'height': size[1],
        'pixelSha256': pixel_sha,
        'repositoryPath': rec['targetRepositoryPath'],
        'repositoryPngBytes': len(png),
        'repositoryPngSha256': sha256(png),
        'holdStatusBefore': rec['holdStatus'],
        'resolutionStatus': 'VERIFIED_OFFICIAL_APK_FULL_ROOT_TEXTURE_EXTRACT',
    })

if len(records) != 29:
    raise RuntimeError(f'expected 29 resolved records, got {len(records)}')

out = {
    'evidence': 'equipment-image-stage2-hold29-official-apk-v1',
    'stage': 'Equipment Image Stage 2 hold29 resolution',
    'status': 'PASS_HOLD29_OFFICIAL_APK_EXTRACT',
    'sourceAuthority': {
        'officialPage': 'https://mz.zlongame.com/main.shtml',
        'officialApkUrl': APK_URL,
        'apkBytes': total,
        'apkLastModified': apk_headers.get('Last-Modified'),
        'apkEtag': apk_headers.get('ETag'),
        'apkContentType': apk_headers.get('Content-Type'),
        'method': 'HTTP Range ZIP central-directory resolution -> exact authoritative root bundle -> exact Texture2D stem -> PNG export',
    },
    'contract': {
        'productionJoinKey': 'equipmentId',
        'fullSourcePathAuthorityPreserved': True,
        'basenameOnlyResolutionUsed': False,
        'filenameSimilarityUsed': False,
        'crossRootFallbackUsed': False,
        'visualSimilarityUsed': False,
        'representativePixelParityRequired': True,
    },
    'bundles': bundle_evidence,
    'representativePixelParity': representative_checks,
    'resolvedCount': len(records),
    'records': records,
}
(ROOT / 'data/evidence').mkdir(parents=True, exist_ok=True)
(ROOT / 'data/evidence/equipment-image-stage2-hold29-official-apk.v1.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': out['status'], 'resolvedCount': len(records), 'representativePixelParity': [x['pixelParity'] for x in representative_checks]}, ensure_ascii=False))
