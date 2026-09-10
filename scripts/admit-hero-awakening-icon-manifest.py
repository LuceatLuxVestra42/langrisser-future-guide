#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib

MANIFEST = pathlib.Path('data/generated/hero-skill-icon-assets.v1.json')
MATERIALIZATION = pathlib.Path('data/generated/hero-awakening-icon-materialization.v1.json')
PROVENANCE = pathlib.Path('data/generated/hero-awakening-icon-verification-provenance.v1.json')

EXPECTED_A7_1_COMMIT = '2dcd64fe4d1e9aa5801b8fb27030f23e0bc9a7fd'
EXPECTED_MATERIALIZATION_SHA = '2e7697a496ab54332de850baee8ab1d3637d568ced8e8db0b573d1da9fe196f6'
EXPECTED_PROVENANCE_SHA = 'bb689559967e8d7ceb9a6ccf0e9f0ac8fc97e58a50f1cf4566cde330adc7863d'
LEON_SOURCE = 'UI/Icon/Skill_ABS/Skill_Super4.png'
LEON_PUBLIC = '/images/heroes/skill-icons/Skill_Super4.png'
EXPECTED_PENDING = 256
EXPECTED_TOTAL_AWAKENING = 257


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def compact_sha(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest()


def file_sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_expected():
    manifest = load(MANIFEST)
    material = load(MATERIALIZATION)
    provenance = load(PROVENANCE)

    if manifest.get('schemaId') != 'hero-skill-icon-assets/v1' or manifest.get('status') != 'FROZEN':
        raise RuntimeError('base manifest contract mismatch')
    legacy = manifest.get('records')
    if not isinstance(legacy, list) or len(legacy) != 13:
        raise RuntimeError('legacy Hero 6 record contract mismatch')
    leon = [r for r in legacy if r.get('sourcePath') == LEON_SOURCE]
    if len(leon) != 1 or leon[0].get('publicPath') != LEON_PUBLIC or leon[0].get('role') != 'awakening':
        raise RuntimeError('existing Leon awakening admission mismatch')

    if material.get('schemaId') != 'hero-awakening-icon-materialization/v1' or material.get('status') != 'FROZEN' or material.get('completion') != 'COMPLETE':
        raise RuntimeError('A7-1 materialization contract mismatch')
    if material.get('materializationSetSha256') != EXPECTED_MATERIALIZATION_SHA:
        raise RuntimeError('A7-1 materialization hash mismatch')
    if material.get('summary') != {'targetCount': 256, 'materializedCount': 256, 'missingCount': 0, 'hashMismatchCount': 0, 'publicPathCollisionCount': 0}:
        raise RuntimeError('A7-1 materialization summary mismatch')

    if provenance.get('schemaId') != 'hero-awakening-icon-verification-provenance/v1' or provenance.get('status') != 'FROZEN' or provenance.get('completion') != 'COMPLETE':
        raise RuntimeError('A6-9 provenance contract mismatch')
    if provenance.get('provenanceSetSha256') != EXPECTED_PROVENANCE_SHA:
        raise RuntimeError('A6-9 provenance hash mismatch')

    prov_by_path = {r['sourcePath']: r for r in provenance.get('records', [])}
    mat_rows = material.get('records', [])
    if len(mat_rows) != EXPECTED_PENDING or len(prov_by_path) != EXPECTED_PENDING:
        raise RuntimeError('A7-2 input population mismatch')

    legacy_paths = {r.get('sourcePath') for r in legacy}
    new_records = []
    seen_public = set(r.get('publicPath') for r in legacy)
    for row in mat_rows:
        source = row['sourcePath']
        if source in legacy_paths:
            raise RuntimeError(f'A7-2 unexpected overlap with legacy record: {source}')
        prov = prov_by_path.get(source)
        if prov is None:
            raise RuntimeError(f'A7-2 missing provenance row: {source}')

        for key in ('packagePart','packageName','bundleEntry','bundleSha256'):
            if row.get(key) != prov.get(key):
                raise RuntimeError(f'A7-2 provenance/materialization mismatch {source} {key}')
        hits = prov.get('spriteHits') or []
        valid_hits = [h for h in hits if h.get('objectType') == 'Sprite' and h.get('nonEmptyAlpha') is True]
        if not valid_hits:
            raise RuntimeError(f'A7-2 missing valid Sprite hit: {source}')
        render_keys = {(h.get('runtimeContainerPath'), h.get('rawObjectSha256'), h.get('rgbaSha256'), h.get('width'), h.get('height')) for h in valid_hits}
        if len(render_keys) != 1:
            raise RuntimeError(f'A7-2 ambiguous Sprite proof: {source}')
        runtime_path, raw_sha, rgba_sha, width, height = next(iter(render_keys))
        expected_sprite = {
            'rawObjectSha256': raw_sha,
            'rgbaSha256': rgba_sha,
            'width': width,
            'height': height,
        }
        for key, value in expected_sprite.items():
            if row.get(key) != value:
                raise RuntimeError(f'A7-2 Sprite/materialization mismatch {source} {key}')

        public_path = row['publicPath']
        if public_path in seen_public:
            raise RuntimeError(f'A7-2 publicPath collision: {public_path}')
        seen_public.add(public_path)
        fs_path = pathlib.Path(row['filesystemPath'])
        if not fs_path.is_file():
            raise RuntimeError(f'A7-2 public asset missing: {fs_path}')
        if fs_path.stat().st_size != row.get('pngBytes') or file_sha(fs_path) != row.get('pngSha256'):
            raise RuntimeError(f'A7-2 PNG proof mismatch: {source}')

        new_records.append({
            'role': 'awakening',
            'sourcePath': source,
            'skillIds': prov.get('skillIds', []),
            'heroIds': prov.get('heroIds', []),
            'packagePart': row['packagePart'],
            'packageName': row['packageName'],
            'bundleEntry': row['bundleEntry'],
            'bundleSha256': row['bundleSha256'],
            'containerPath': runtime_path,
            'objectType': 'Sprite',
            'rawObjectSha256': row['rawObjectSha256'],
            'rgbaSha256': row['rgbaSha256'],
            'width': row['width'],
            'height': row['height'],
            'publicPath': public_path,
            'pngBytes': row['pngBytes'],
            'pngSha256': row['pngSha256'],
            'verificationOwner': row.get('verificationOwner'),
        })

    new_records.sort(key=lambda r: r['sourcePath'])
    if len(new_records) != EXPECTED_PENDING or len({r['sourcePath'] for r in new_records}) != EXPECTED_PENDING:
        raise RuntimeError('A7-2 new record uniqueness mismatch')

    awakening_map = [{'sourcePath': LEON_SOURCE, 'publicPath': LEON_PUBLIC, 'pngSha256': leon[0]['pngSha256']}]
    awakening_map.extend({'sourcePath': r['sourcePath'], 'publicPath': r['publicPath'], 'pngSha256': r['pngSha256']} for r in new_records)
    awakening_map.sort(key=lambda r: r['sourcePath'])
    if len(awakening_map) != EXPECTED_TOTAL_AWAKENING:
        raise RuntimeError('A7-2 total awakening admission mismatch')

    expected = dict(manifest)
    expected['awakeningAdmission'] = {
        'status': 'FROZEN',
        'completion': 'COMPLETE',
        'semanticReopen': False,
        'stage': 'A7_2_MANIFEST_ADMISSION',
        'predecessor': {
            'stage': 'A7_1_MATERIALIZE_VERIFIED_ASSETS',
            'commit': EXPECTED_A7_1_COMMIT,
            'materializationSetSha256': EXPECTED_MATERIALIZATION_SHA,
            'provenanceSetSha256': EXPECTED_PROVENANCE_SHA,
        },
        'lookupAuthority': 'exact sourcePath only',
        'legacyLeonAwakeningRecordCount': 1,
        'admittedNowCount': EXPECTED_PENDING,
        'totalAwakeningAdmittedCount': EXPECTED_TOTAL_AWAKENING,
        'publicMissingCount': 0,
        'publicPathCollisionCount': 0,
        'manifestArray': 'awakeningRecords',
        'awakeningMapSha256': compact_sha(awakening_map),
        'hashContract': 'sha256(UTF-8 compact JSON of sorted [{sourcePath,publicPath,pngSha256}])',
        'frontendMutation': False,
        'nextStage': 'A7_3_ASSET_VALIDATOR',
    }
    expected['awakeningRecords'] = new_records
    return expected


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    expected = build_expected()
    if args.write:
        MANIFEST.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    current = load(MANIFEST)
    if current != expected:
        raise RuntimeError('A7-2 manifest admission drift')
    admission = expected['awakeningAdmission']
    print(json.dumps({
        'checkpoint': 'AWAKENING_ICON_A7_2_MANIFEST_ADMISSION',
        'status': admission['status'],
        'completion': admission['completion'],
        'legacyLeonAwakeningRecordCount': admission['legacyLeonAwakeningRecordCount'],
        'admittedNowCount': admission['admittedNowCount'],
        'totalAwakeningAdmittedCount': admission['totalAwakeningAdmittedCount'],
        'publicMissingCount': admission['publicMissingCount'],
        'publicPathCollisionCount': admission['publicPathCollisionCount'],
        'awakeningMapSha256': admission['awakeningMapSha256'],
        'semanticReopen': False,
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
