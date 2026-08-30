#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
from PIL import Image

SOURCE_MANIFEST = Path('data/source/soldier-training-material-drive-evidence.v1.json')
INTAKE_VALIDATION = Path('data/validation/soldier-training-material-asset-intake.v1.json')
SOURCE_ROOT = Path('public/images/soldier-training-materials-source')
WEB_ROOT = Path('public/images/soldier-training-materials-webp')
MANIFEST_OUT = Path('data/generated/soldier-training-material-web-manifest.v1.json')
VALIDATION_OUT = Path('data/validation/soldier-training-material-webp.v1.json')
CHECKPOINT_OUT = Path('docs/checkpoints/soldier-training-material-webp.md')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(65536), b''):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    source = read_json(SOURCE_MANIFEST)
    intake = read_json(INTAKE_VALIDATION)
    if intake.get('status') != 'PASS_SOLDIER_TRAINING_MATERIAL_ASSET_INTAKE':
        raise RuntimeError(f"asset intake not admitted: {intake.get('status')}")
    if intake.get('scope', {}).get('exactResolvedCount') != 24:
        raise RuntimeError('asset intake coverage is not 24/24')

    intake_by_id = {record['itemId']: record for record in intake['records']}
    if len(intake_by_id) != 24:
        raise RuntimeError('asset intake contains duplicate/missing item IDs')

    WEB_ROOT.mkdir(parents=True, exist_ok=True)
    for child in WEB_ROOT.iterdir():
        if child.is_file():
            child.unlink()

    records = []
    failures = []
    source_total = 0
    web_total = 0

    for item in source['records']:
        item_id = item['itemId']
        source_path = SOURCE_ROOT / item['filename']
        web_file_name = f'{item_id}.webp'
        web_path = WEB_ROOT / web_file_name
        intake_record = intake_by_id.get(item_id)

        if not source_path.is_file():
            failures.append({'itemId': item_id, 'reason': 'SOURCE_FILE_MISSING', 'path': str(source_path)})
            continue

        source_sha = sha256(source_path)
        source_size = source_path.stat().st_size
        if intake_record is None or source_sha != intake_record.get('sha256') or source_size != intake_record.get('scannedByteSize'):
            failures.append({
                'itemId': item_id,
                'reason': 'SOURCE_INTAKE_PARITY_FAIL',
                'sourceSha256': source_sha,
                'intakeSha256': intake_record.get('sha256') if intake_record else None,
                'sourceSize': source_size,
                'intakeSize': intake_record.get('scannedByteSize') if intake_record else None,
            })
            continue

        with Image.open(source_path) as image:
            image.load()
            source_size_px = image.size
            source_rgba = image.convert('RGBA').tobytes()
            image.save(web_path, format='WEBP', lossless=True, method=6, exact=True)

        with Image.open(web_path) as web_image:
            web_image.load()
            web_size_px = web_image.size
            web_rgba = web_image.convert('RGBA').tobytes()

        dimension_equal = source_size_px == web_size_px
        pixel_equal = source_rgba == web_rgba
        web_sha = sha256(web_path)
        web_size = web_path.stat().st_size
        if not dimension_equal or not pixel_equal:
            failures.append({
                'itemId': item_id,
                'reason': 'LOSSLESS_PIXEL_PARITY_FAIL',
                'sourceDimensions': list(source_size_px),
                'webDimensions': list(web_size_px),
                'dimensionEqual': dimension_equal,
                'pixelEqual': pixel_equal,
            })
            continue

        source_total += source_size
        web_total += web_size
        records.append({
            'itemId': item_id,
            'name': item['name'],
            'iconPath': item['iconPath'],
            'sourceFileName': item['filename'],
            'sourceRepositoryPath': str(source_path).replace('\\', '/'),
            'sourceSha256': source_sha,
            'sourceSize': source_size,
            'fileName': web_file_name,
            'webRepositoryPath': str(web_path).replace('\\', '/'),
            'webPath': f'/images/soldier-training-materials-webp/{web_file_name}',
            'webSha256': web_sha,
            'webSize': web_size,
            'width': source_size_px[0],
            'height': source_size_px[1],
            'pixelParity': 'EXACT_RGBA',
        })

    records.sort(key=lambda row: row['itemId'])
    status = 'PASS_SOLDIER_TRAINING_MATERIAL_WEBP' if len(records) == 24 and not failures else 'FAIL_SOLDIER_TRAINING_MATERIAL_WEBP'
    manifest = {
        'schemaId': 'soldier-training-material-web-manifest/v1',
        'status': status,
        'assetsReady': status.startswith('PASS_'),
        'sourceRoot': 'images/soldier-training-materials-source',
        'publicRoot': 'images/soldier-training-materials-webp',
        'coverage': {
            'expectedCount': 24,
            'resolvedCount': len(records),
            'unresolvedCount': 24 - len(records),
        },
        'records': records,
    }
    validation = {
        'schemaId': 'soldier-training-material-webp-validation/v1',
        'status': status,
        'completion': 'WEBP_DELIVERY_READY_24_OF_24' if status.startswith('PASS_') else 'BLOCKED',
        'sourceAssetIntakeStatus': intake['status'],
        'coverage': manifest['coverage'],
        'checks': {
            'sourceShaParity': len(failures) == 0,
            'dimensionsEqual': len(failures) == 0,
            'rgbaPixelParity': len(failures) == 0,
            'uniqueWebSha256Count': len({row['webSha256'] for row in records}),
        },
        'bytes': {
            'sourcePngTotal': source_total,
            'webpTotal': web_total,
            'delta': web_total - source_total,
            'reductionBytes': max(source_total - web_total, 0),
            'reductionRate': ((source_total - web_total) / source_total) if source_total else 0,
        },
        'failures': failures,
        'semanticReopenAllowed': False,
        'next': 'Use generated web manifest through a frontend resolver; do not read raw ConfigData at runtime.' if status.startswith('PASS_') else 'Remain in asset/web-delivery owning layer.',
    }

    write_json(MANIFEST_OUT, manifest)
    write_json(VALIDATION_OUT, validation)

    CHECKPOINT_OUT.parent.mkdir(parents=True, exist_ok=True)
    CHECKPOINT_OUT.write_text(
        '# Soldier Training Material WebP Delivery\n\n'
        f'- status: {status}\n'
        f'- source Asset Intake: {intake["status"]}\n'
        f'- coverage: {len(records)} / 24\n'
        f'- exact RGBA pixel parity: {len(records) - len([f for f in failures if f.get("reason") == "LOSSLESS_PIXEL_PARITY_FAIL"])} / 24\n'
        f'- source PNG bytes: {source_total}\n'
        f'- WebP bytes: {web_total}\n'
        f'- reduction bytes: {max(source_total - web_total, 0)}\n'
        '- source PNG remains authoritative evidence; WebP is delivery-only derivative.\n'
        '- next: frontend resolver + Soldier training material icon consumer.\n'
        '- semantic reopen: forbidden unless predecessor Item ID/Icon population changes.\n',
        encoding='utf-8',
    )

    if failures or len(records) != 24:
        raise RuntimeError(json.dumps(validation, ensure_ascii=False))

    print(json.dumps({
        'status': status,
        'resolved': len(records),
        'sourcePngTotal': source_total,
        'webpTotal': web_total,
        'reductionRate': validation['bytes']['reductionRate'],
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
