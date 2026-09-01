from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, features

A5_MANIFEST_PATH = Path('data/manifests/soldier-training-material-assets-a5.v1.json')
A5_MANIFEST_BLOB = 'a50f35c6f46aae5b2dfd243df70092706ba87093'
A5_VALIDATION_PATH = Path('data/validation/soldier-training-material-assets-a5.v1.json')
SOURCE_ROOT = Path('public/images/soldier-training-materials')
WEBP_ROOT = Path('public/images/soldier-training-materials-webp')
MANIFEST_PATH = Path('data/manifests/soldier-training-material-assets-a6-webp.v1.json')
VALIDATION_PATH = Path('data/validation/soldier-training-material-assets-a6.v1.json')
CHECKPOINT_PATH = Path('docs/checkpoints/soldier-training-material-assets-a6.md')


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_blob_sha(data: bytes) -> str:
    header = f'blob {len(data)}\0'.encode('ascii')
    return hashlib.sha1(header + data).hexdigest()


def stable_write(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def is_webp(data: bytes) -> bool:
    return len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP'


a5_bytes = A5_MANIFEST_PATH.read_bytes()
a5 = json.loads(a5_bytes.decode('utf-8'))
a5_validation = json.loads(A5_VALIDATION_PATH.read_text(encoding='utf-8'))
errors: list[str] = []


def fail(ok: bool, message: str) -> None:
    if not ok:
        errors.append(message)


fail(git_blob_sha(a5_bytes) == A5_MANIFEST_BLOB, f'A5 manifest blob freshness mismatch: {git_blob_sha(a5_bytes)}')
fail(a5.get('status') == 'PASS' and a5.get('completion') == 'COMPLETE', 'A5 manifest is not PASS/COMPLETE')
fail(a5_validation.get('status') == 'PASS' and a5_validation.get('completion') == 'COMPLETE', 'A5 validation is not PASS/COMPLETE')
fail(a5_validation.get('admissionStatus') == 'READY_FOR_A6_WEBP_DELIVERY', f"A5 admissionStatus={a5_validation.get('admissionStatus')}")
records = a5.get('records', [])
fail(len(records) == 24, f'A5 record count={len(records)}')
fail(a5.get('repository', {}).get('root') == SOURCE_ROOT.as_posix(), f"A5 source root={a5.get('repository', {}).get('root')}")
fail(a5.get('repository', {}).get('namingRule') == '{itemId}.png', 'A5 naming rule mismatch')
fail(a5.get('repository', {}).get('sourceBytesPreservedExactly') is True, 'A5 exact source-byte preservation not confirmed')
fail(features.check('webp'), 'Pillow WebP support unavailable')

WEBP_ROOT.mkdir(parents=True, exist_ok=True)
manifest_records: list[dict[str, object]] = []
seen_items: set[int] = set()
seen_source_paths: set[str] = set()
seen_webp_paths: set[str] = set()

for source in sorted(records, key=lambda row: int(row['itemId'])):
    item_id = int(source['itemId'])
    source_path = Path(str(source['repositoryPath']))
    webp_path = WEBP_ROOT / f'{item_id}.webp'
    expected_source_path = SOURCE_ROOT / f'{item_id}.png'

    fail(item_id not in seen_items, f'duplicate itemId {item_id}')
    fail(source_path.as_posix() not in seen_source_paths, f'duplicate source path {source_path}')
    fail(webp_path.as_posix() not in seen_webp_paths, f'duplicate WebP path {webp_path}')
    seen_items.add(item_id)
    seen_source_paths.add(source_path.as_posix())
    seen_webp_paths.add(webp_path.as_posix())

    fail(source_path == expected_source_path, f'A5 repository path mismatch: {item_id}')
    fail(source.get('admissionStatus') == 'ADMITTED_EXACT', f'A5 asset not ADMITTED_EXACT: {item_id}')
    if not source_path.is_file():
        errors.append(f'missing source PNG: {source_path}')
        continue

    png_bytes = source_path.read_bytes()
    png_sha = sha256_bytes(png_bytes)
    fail(png_sha == source.get('repositorySha256'), f'A5 PNG SHA-256 mismatch: {item_id}')
    fail(len(png_bytes) == int(source.get('repositoryByteSize', -1)), f'A5 PNG byte-size mismatch: {item_id}')

    with Image.open(source_path) as image:
        png_rgba = image.convert('RGBA')
        width, height = png_rgba.size
        png_pixels = png_rgba.tobytes()
        png_pixel_sha = sha256_bytes(png_pixels)
        fail(width == 172 and height == 172, f'PNG dimensions mismatch: {item_id}')
        png_rgba.save(
            webp_path,
            format='WEBP',
            lossless=True,
            quality=100,
            method=6,
            exact=True,
        )

    webp_bytes = webp_path.read_bytes()
    webp_sha = sha256_bytes(webp_bytes)
    fail(is_webp(webp_bytes), f'WebP RIFF signature mismatch: {item_id}')

    with Image.open(webp_path) as decoded:
        webp_rgba = decoded.convert('RGBA')
        webp_width, webp_height = webp_rgba.size
        webp_pixels = webp_rgba.tobytes()
        webp_pixel_sha = sha256_bytes(webp_pixels)

    pixel_parity = png_pixels == webp_pixels
    alpha_parity = png_pixels[3::4] == webp_pixels[3::4]
    fail(webp_width == width and webp_height == height, f'WebP dimensions mismatch: {item_id}')
    fail(pixel_parity, f'PNG/WebP decoded RGBA pixel mismatch: {item_id}')
    fail(alpha_parity, f'PNG/WebP alpha mismatch: {item_id}')
    fail(png_pixel_sha == webp_pixel_sha, f'decoded pixel SHA mismatch: {item_id}')

    manifest_records.append({
        'itemId': item_id,
        'sourcePngPath': source_path.as_posix(),
        'sourcePngByteSize': len(png_bytes),
        'sourcePngSha256': png_sha,
        'sourcePixelSha256': png_pixel_sha,
        'webpPath': webp_path.as_posix(),
        'webpByteSize': len(webp_bytes),
        'webpSha256': webp_sha,
        'webpDecodedPixelSha256': webp_pixel_sha,
        'width': width,
        'height': height,
        'sourceMode': 'RGBA',
        'decodedWebpMode': 'RGBA',
        'lossless': True,
        'exactTransparentRgb': True,
        'pixelParity': pixel_parity,
        'alphaParity': alpha_parity,
        'deliveryStatus': 'DELIVERED_LOSSLESS' if pixel_parity and alpha_parity else 'INVALID',
    })

expected_webp_names = {f'{row["itemId"]}.webp' for row in manifest_records}
actual_webp_names = {p.name for p in WEBP_ROOT.iterdir() if p.is_file()}
missing_webp = sorted(expected_webp_names - actual_webp_names)
extra_webp = sorted(actual_webp_names - expected_webp_names)
fail(not missing_webp, f'missing WebP files: {missing_webp}')
fail(not extra_webp, f'unexpected WebP files: {extra_webp}')

status = 'PASS' if not errors else 'FAIL'
completion = 'COMPLETE' if not errors else 'INCOMPLETE'
total_png_bytes = sum(int(row['sourcePngByteSize']) for row in manifest_records)
total_webp_bytes = sum(int(row['webpByteSize']) for row in manifest_records)
bytes_saved = total_png_bytes - total_webp_bytes
savings_ratio = (bytes_saved / total_png_bytes) if total_png_bytes else 0.0

manifest = {
    'version': 1,
    'schemaId': 'soldier-training-material-assets-a6-webp-delivery/v1',
    'stage': 'A6 - WebP Delivery',
    'status': status,
    'completion': completion,
    'predecessor': {
        'a5ManifestPath': A5_MANIFEST_PATH.as_posix(),
        'a5ManifestBlobSha': A5_MANIFEST_BLOB,
        'a5ValidationPath': A5_VALIDATION_PATH.as_posix(),
        'a5Status': a5.get('status'),
        'a5RepositoryPng': a5_validation.get('counts', {}).get('repositoryPng'),
    },
    'delivery': {
        'sourceRoot': SOURCE_ROOT.as_posix(),
        'webpRoot': WEBP_ROOT.as_posix(),
        'sourceNamingRule': '{itemId}.png',
        'webpNamingRule': '{itemId}.webp',
        'format': 'WebP',
        'encoder': 'Pillow',
        'encoderVersion': Image.__version__,
        'lossless': True,
        'quality': 100,
        'method': 6,
        'exactTransparentRgb': True,
        'decodedPixelParityRequired': True,
    },
    'records': manifest_records,
    'summary': {
        'target': 24,
        'sourcePng': len(manifest_records),
        'webpGenerated': len(manifest_records),
        'webpVerified': sum(bool(row['webpSha256']) for row in manifest_records),
        'dimensions172x172': sum(row['width'] == 172 and row['height'] == 172 for row in manifest_records),
        'losslessPixelParity': sum(row['pixelParity'] is True for row in manifest_records),
        'alphaParity': sum(row['alphaParity'] is True for row in manifest_records),
        'uniqueItemIds': len(seen_items),
        'uniqueSourcePaths': len(seen_source_paths),
        'uniqueWebpPaths': len(seen_webp_paths),
        'missing': len(missing_webp),
        'extras': len(extra_webp),
        'errors': len(errors),
        'totalPngBytes': total_png_bytes,
        'totalWebpBytes': total_webp_bytes,
        'bytesSaved': bytes_saved,
        'savingsRatio': round(savings_ratio, 6),
    },
    'boundaries': {
        'semanticRecomputed': False,
        'a5SourcePngChanged': False,
        'sourceRelationChanged': False,
        'nameJoinUsed': False,
        'idArithmeticUsed': False,
        'fuzzyOrVisualMatchingUsed': False,
        'webpGenerated': True,
        'resolverChanged': False,
        'frontendChanged': False,
    },
}

validation = {
    'version': 1,
    'schemaId': 'soldier-training-material-assets-a6-validation/v1',
    'stage': 'A6 - WebP Delivery',
    'status': status,
    'completion': completion,
    'counts': {
        'target': 24,
        'sourcePng': len(manifest_records),
        'webpGenerated': len(manifest_records),
        'webpVerified': sum(bool(row['webpSha256']) for row in manifest_records),
        'dimensions172x172': sum(row['width'] == 172 and row['height'] == 172 for row in manifest_records),
        'losslessPixelParity': sum(row['pixelParity'] is True for row in manifest_records),
        'alphaParity': sum(row['alphaParity'] is True for row in manifest_records),
        'uniqueItemIds': len(seen_items),
        'uniqueSourcePaths': len(seen_source_paths),
        'uniqueWebpPaths': len(seen_webp_paths),
        'missing': len(missing_webp),
        'extras': len(extra_webp),
        'errors': len(errors),
    },
    'deliveryStatus': 'READY_FOR_A7_SOLDIER_UI_INTEGRATION' if not errors else 'BLOCKED_A6_WEBP_DELIVERY',
    'hardErrors': errors,
}

stable_write(MANIFEST_PATH, manifest)
stable_write(VALIDATION_PATH, validation)
CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
CHECKPOINT_PATH.write_text(f'''# Soldier Training Material Assets A6 — WebP Delivery

상태: `{status} / {completion} / {validation['deliveryStatus']}`

## 목적

A5에서 repository-owned source asset으로 admission한 PNG 24개만 authoritative source로 사용해 lossless WebP delivery asset을 생성하고, decoded RGBA pixel parity를 24/24 검증한다. semantic relation, resolver, frontend는 이 단계에서 변경하지 않는다.

## authoritative predecessor

- `{A5_MANIFEST_PATH.as_posix()}` — blob `{A5_MANIFEST_BLOB}`
- `{A5_VALIDATION_PATH.as_posix()}` — `PASS / COMPLETE / READY_FOR_A6_WEBP_DELIVERY`
- source root: `{SOURCE_ROOT.as_posix()}`

## delivery contract

- output root: `{WEBP_ROOT.as_posix()}`
- naming: `{{itemId}}.webp`
- encoder: Pillow `{Image.__version__}`
- WebP: `lossless=True / quality=100 / method=6 / exact=True`
- acceptance: PNG/WebP decoded `RGBA` bytes exact parity + alpha parity

## 결과

`target=24 / source PNG=24 / WebP=24 / 172x172=24 / decoded pixel parity=24 / alpha parity=24 / missing=0 / extras=0 / errors=0`

PNG total bytes: `{total_png_bytes}`
WebP total bytes: `{total_webp_bytes}`
bytes saved: `{bytes_saved}`

## artifacts

- `{MANIFEST_PATH.as_posix()}`
- `{VALIDATION_PATH.as_posix()}`
- `{WEBP_ROOT.as_posix()}/{{itemId}}.webp` (24 files)
- `scripts/deliver-soldier-training-material-assets-a6.py`
- `.github/workflows/soldier-training-material-assets-a6.yml`

## boundaries

- semantic/ConfigData 재계산 없음
- A5 PNG 24개 변경 없음
- itemId/source relation 변경 없음
- name JOIN / ID arithmetic / fuzzy / visual matching 없음
- resolver/frontend 변경 없음

## 다음 시작점

A7 Soldier UI integration. A6 manifest와 ID 기반 WebP path를 presentation consumer에 연결하고 Preflight -> Build -> Hosted/Deployment -> Browser/UI 순서로 검증한다.

## 다시 열리는 조건

- A5 manifest blob 또는 source PNG SHA-256 변경
- WebP decoded RGBA pixel parity 파손
- 24개 ID/path 1:1 delivery parity 파손
''', encoding='utf-8')

print(json.dumps(validation, ensure_ascii=False, indent=2))
if errors:
    raise SystemExit(1)
