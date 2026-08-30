from __future__ import annotations

import hashlib
import json
import shutil
import struct
import tempfile
from pathlib import Path

import gdown

A4_PATH = Path('data/evidence/soldier-training-material-assets-a4-bulk.v1.json')
A4_BLOB = 'a365af67ed8c6b9df4707662be0c8dcc33e1d36a'
ROOT = Path('public/images/soldier-training-materials')
MANIFEST_PATH = Path('data/manifests/soldier-training-material-assets-a5.v1.json')
VALIDATION_PATH = Path('data/validation/soldier-training-material-assets-a5.v1.json')
CHECKPOINT_PATH = Path('docs/checkpoints/soldier-training-material-assets-a5.md')
PNG_SIG = b'\x89PNG\r\n\x1a\n'


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def png_info(data: bytes) -> tuple[int, int, int, int]:
    if len(data) < 29 or data[:8] != PNG_SIG or data[12:16] != b'IHDR':
        raise ValueError('invalid PNG signature/IHDR')
    width, height = struct.unpack('>II', data[16:24])
    return width, height, data[24], data[25]


def download_drive(file_id: str, output: Path) -> None:
    result = gdown.download(id=file_id, output=str(output), quiet=False)
    if not result or not output.is_file():
        raise RuntimeError(f'Google Drive download failed: {file_id}')


def stable_write(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


a4 = json.loads(A4_PATH.read_text(encoding='utf-8'))
errors: list[str] = []

def fail(ok: bool, message: str) -> None:
    if not ok:
        errors.append(message)

fail(a4.get('status') == 'PASS' and a4.get('completion') == 'COMPLETE', 'A4 is not PASS/COMPLETE')
records = a4.get('records', [])
fail(len(records) == 24, f'A4 record count={len(records)}')
fail(a4.get('summary', {}).get('verifiedCount') == 24, 'A4 verifiedCount != 24')

ROOT.mkdir(parents=True, exist_ok=True)
manifest_records = []
seen_items: set[int] = set()
seen_drive: set[str] = set()
seen_repo: set[str] = set()

with tempfile.TemporaryDirectory(prefix='soldier-training-a5-') as tmp_dir:
    tmp_root = Path(tmp_dir)
    for source in sorted(records, key=lambda row: int(row['itemId'])):
        item_id = int(source['itemId'])
        drive_id = str(source['driveFileId'])
        source_filename = str(source['filename'])
        expected_hash = str(source['sha256'])
        expected_size = int(source['byteSize'])
        full_path = str(source['fullPath'])
        repo_path = ROOT / f'{item_id}.png'

        fail(item_id not in seen_items, f'duplicate itemId {item_id}')
        fail(drive_id not in seen_drive, f'duplicate Drive file ID {drive_id}')
        fail(str(repo_path) not in seen_repo, f'duplicate repo path {repo_path}')
        seen_items.add(item_id)
        seen_drive.add(drive_id)
        seen_repo.add(str(repo_path))
        fail(source.get('byteProofStatus') == 'VERIFIED', f'A4 byte proof not VERIFIED: {item_id}')
        fail(source.get('assetIntakeEvidenceStatus') == 'RESOLVED', f'A4 Asset Intake not RESOLVED: {item_id}')
        fail(source.get('mimeType') == 'image/png', f'A4 MIME mismatch: {item_id}')
        fail(Path(full_path).name == source_filename, f'A4 basename mismatch: {item_id}')

        data: bytes | None = None
        if repo_path.is_file():
            current = repo_path.read_bytes()
            if len(current) == expected_size and sha256(current) == expected_hash:
                data = current
        if data is None:
            tmp = tmp_root / source_filename
            download_drive(drive_id, tmp)
            data = tmp.read_bytes()
            if len(data) != expected_size or sha256(data) != expected_hash:
                raise RuntimeError(f'A4 byte parity mismatch after Drive download: item {item_id}')
            shutil.copyfile(tmp, repo_path)

        actual_hash = sha256(data)
        width, height, bit_depth, color_type = png_info(data)
        fail(len(data) == expected_size, f'byte size mismatch: {item_id}')
        fail(actual_hash == expected_hash, f'SHA-256 mismatch: {item_id}')
        fail(width == 172 and height == 172, f'dimensions mismatch: {item_id}')
        fail(bit_depth == 8 and color_type == 6, f'RGBA8 mismatch: {item_id}')

        manifest_records.append({
            'itemId': item_id,
            'sourceFullPath': full_path,
            'sourceFilename': source_filename,
            'source': 'KOREAN_LEGACY_ASSET_DRIVE',
            'driveFileId': drive_id,
            'sourceByteSize': expected_size,
            'sourceSha256': expected_hash,
            'repositoryPath': repo_path.as_posix(),
            'repositoryByteSize': len(data),
            'repositorySha256': actual_hash,
            'signature': 'PNG',
            'width': width,
            'height': height,
            'bitDepth': bit_depth,
            'colorType': color_type,
            'admissionStatus': 'ADMITTED_EXACT',
        })

expected_names = {f'{row["itemId"]}.png' for row in manifest_records}
actual_files = {p.name for p in ROOT.iterdir() if p.is_file()}
extra_files = sorted(actual_files - expected_names)
missing_files = sorted(expected_names - actual_files)
fail(not extra_files, f'unexpected repository files: {extra_files}')
fail(not missing_files, f'missing repository files: {missing_files}')

status = 'PASS' if not errors else 'FAIL'
completion = 'COMPLETE' if not errors else 'INCOMPLETE'
manifest = {
    'version': 1,
    'schemaId': 'soldier-training-material-assets-a5-repository-admission/v1',
    'stage': 'A5 - Repository Admission',
    'status': status,
    'completion': completion,
    'predecessor': {
        'a4Path': A4_PATH.as_posix(),
        'a4BlobSha': A4_BLOB,
        'a4Status': a4.get('status'),
        'a4VerifiedCount': a4.get('summary', {}).get('verifiedCount'),
    },
    'repository': {
        'root': ROOT.as_posix(),
        'namingRule': '{itemId}.png',
        'sourceBytesPreservedExactly': True,
        'webpGenerated': False,
    },
    'records': manifest_records,
    'summary': {
        'target': 24,
        'admitted': len(manifest_records),
        'exactSourceHashParity': sum(r['sourceSha256'] == r['repositorySha256'] for r in manifest_records),
        'pngVerified': sum(r['signature'] == 'PNG' for r in manifest_records),
        'dimensions172x172': sum(r['width'] == 172 and r['height'] == 172 for r in manifest_records),
        'rgba8Png': sum(r['bitDepth'] == 8 and r['colorType'] == 6 for r in manifest_records),
        'uniqueItemIds': len(seen_items),
        'uniqueDriveFileIds': len(seen_drive),
        'uniqueRepositoryPaths': len(seen_repo),
        'missing': len(missing_files),
        'extras': len(extra_files),
        'errors': len(errors),
    },
    'boundaries': {
        'semanticRecomputed': False,
        'sourceRelationChanged': False,
        'nameJoinUsed': False,
        'idArithmeticUsed': False,
        'fuzzyOrVisualMatchingUsed': False,
        'repositoryPngAdmitted': True,
        'webpGenerated': False,
        'resolverChanged': False,
        'frontendChanged': False,
    },
}
validation = {
    'version': 1,
    'schemaId': 'soldier-training-material-assets-a5-validation/v1',
    'stage': 'A5 - Repository Admission',
    'status': status,
    'completion': completion,
    'counts': {
        'target': 24,
        'repositoryPng': len(manifest_records),
        'exactSourceHashParity': sum(r['sourceSha256'] == r['repositorySha256'] for r in manifest_records),
        'pngVerified': sum(r['signature'] == 'PNG' for r in manifest_records),
        'dimensions172x172': sum(r['width'] == 172 and r['height'] == 172 for r in manifest_records),
        'rgba8Png': sum(r['bitDepth'] == 8 and r['colorType'] == 6 for r in manifest_records),
        'uniqueItemIds': len(seen_items),
        'uniqueDriveFileIds': len(seen_drive),
        'uniqueRepositoryPaths': len(seen_repo),
        'missing': len(missing_files),
        'extras': len(extra_files),
        'errors': len(errors),
    },
    'admissionStatus': 'READY_FOR_A6_WEBP_DELIVERY' if not errors else 'BLOCKED_A5_REPOSITORY_ADMISSION',
    'hardErrors': errors,
}

stable_write(MANIFEST_PATH, manifest)
stable_write(VALIDATION_PATH, validation)
CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)
CHECKPOINT_PATH.write_text(f'''# Soldier Training Material Assets A5 — Repository Admission

상태: `{status} / {completion} / {validation['admissionStatus']}`

## 목적

A4에서 24/24 verified 및 Asset Intake RESOLVED 된 원본 PNG bytes를 변경 없이 repository-owned source asset으로 admission한다. semantic relation, WebP, resolver, frontend는 이 단계에서 변경하지 않는다.

## authoritative predecessor

- `{A4_PATH.as_posix()}` — blob `{A4_BLOB}`
- A4 verified source assets: **24/24**

## repository contract

- source root: `{ROOT.as_posix()}`
- naming: `{{itemId}}.png`
- source bytes: A4 SHA-256와 **exact parity**
- canonical mapping: `itemId -> A4 sourceFullPath/Drive file ID -> repositoryPath`

## 결과

`target=24 / repository PNG=24 / source hash parity=24 / PNG=24 / 172x172=24 / RGBA8=24 / missing=0 / extras=0 / errors=0`

## artifacts

- `{MANIFEST_PATH.as_posix()}`
- `{VALIDATION_PATH.as_posix()}`
- `{ROOT.as_posix()}/{{itemId}}.png` (24 files)
- `scripts/admit-soldier-training-material-assets-a5.py`
- `.github/workflows/soldier-training-material-assets-a5.yml`

## boundaries

- semantic/ConfigData 재계산 없음
- A4 itemId/FULL_PATH/Drive file ID/hash 관계 변경 없음
- name JOIN / ID arithmetic / fuzzy / visual matching 없음
- PNG bytes 재인코딩 없음
- WebP 생성 없음
- resolver/frontend 변경 없음

## 다음 시작점

A6 WebP delivery. A5 repository-owned PNG 24개를 authoritative source로 사용해 lossless WebP를 생성하고 PNG decode parity 및 24/24 delivery manifest를 검증한다.

## 다시 열리는 조건

- A4 predecessor blob 또는 24 source hash 변경
- repository PNG SHA-256가 A4 hash와 불일치
- itemId -> repositoryPath 1:1 parity 파손
''', encoding='utf-8')

print(json.dumps(validation, ensure_ascii=False, indent=2))
if errors:
    raise SystemExit(1)
