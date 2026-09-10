#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib

TARGET_PATH = pathlib.Path('data/generated/hero-awakening-icon-verification-targets.v1.json')
BULK_PATH = pathlib.Path('data/generated/hero-awakening-icon-official-bulk-verification.v1.json')
GAP_PATH = pathlib.Path('data/generated/hero-awakening-icon-source-snapshot-gap.v1.json')
OUTPUT = pathlib.Path('data/generated/hero-awakening-icon-verification-provenance.v1.json')

EXPECTED_TARGET_SHA = '78e566b736e3b5b13a4c29186a283a05951383ba6ac84739f296b91c740a4723'
EXPECTED_BULK_SHA = 'b0a594ab0a2c2ae31c61534915ffdc1581e751a56b27d70c9cd8be861b8d0365'
EXPECTED_GAP_SHA = 'bd58ec2509e50ed1c2d686712c2858165296389efcadfd3c2df012dc5ee8ecb7'
A6_7_COMMIT = '0dadbdc1c1f99e60ee8936727a7722e42edc9c24'
EXPECTED_TARGET_COUNT = 256


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def compact_sha(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')).hexdigest()


def validate_inputs():
    targets = load(TARGET_PATH)
    bulk = load(BULK_PATH)
    gap = load(GAP_PATH)
    if targets.get('schemaId') != 'hero-awakening-icon-verification-targets/v1' or targets.get('status') != 'FROZEN' or targets.get('completion') != 'COMPLETE':
        raise RuntimeError('A6-1 target contract mismatch')
    if targets.get('targetSetSha256') != EXPECTED_TARGET_SHA or len(targets.get('targets', [])) != EXPECTED_TARGET_COUNT:
        raise RuntimeError('A6-1 target hash/count mismatch')
    if bulk.get('schemaId') != 'hero-awakening-icon-official-bulk-verification/v1' or bulk.get('completion') != 'COMPLETE' or bulk.get('bulkResultSha256') != EXPECTED_BULK_SHA:
        raise RuntimeError('A6-6 bulk contract mismatch')
    if bulk.get('summary') != {'targetCount': 256, 'verifiedCount': 253, 'reviewCount': 3, 'blockerCount': 0, 'shardCount': 8}:
        raise RuntimeError(f"A6-6 summary drift: {bulk.get('summary')}")
    if gap.get('schemaId') != 'hero-awakening-icon-source-snapshot-gap/v1' or gap.get('status') != 'PASS' or gap.get('completion') != 'COMPLETE' or gap.get('semanticReopen') is not False:
        raise RuntimeError('A6-7 gap contract mismatch')
    if gap.get('gapResultSha256') != EXPECTED_GAP_SHA:
        raise RuntimeError('A6-7 gap hash mismatch')
    expected_gap_summary = {'reviewInputCount': 3, 'packageScanCount': 68, 'bundleScanCount': 3045, 'verifiedCount': 3, 'notInSourceSnapshotCount': 0, 'blockerCount': 0, 'scanErrorCount': 0}
    if gap.get('summary') != expected_gap_summary:
        raise RuntimeError(f"A6-7 summary drift: {gap.get('summary')}")
    return targets, bulk, gap


def sprite_projection(hit):
    return {
        'runtimeContainerPath': hit.get('runtimeContainerPath'),
        'objectType': hit.get('objectType'),
        'pathId': hit.get('pathId'),
        'width': hit.get('width'),
        'height': hit.get('height'),
        'rawObjectSha256': hit.get('rawObjectSha256'),
        'rgbaSha256': hit.get('rgbaSha256'),
        'nonEmptyAlpha': hit.get('nonEmptyAlpha'),
    }


def build():
    targets, bulk, gap = validate_inputs()
    bulk_rows = {row['sourcePath']: row for row in bulk.get('results', [])}
    gap_rows = {row['sourcePath']: row for row in gap.get('results', [])}
    if len(bulk_rows) != EXPECTED_TARGET_COUNT:
        raise RuntimeError('A6-6 unique sourcePath coverage mismatch')
    records = []
    from_bulk = 0
    from_gap = 0
    for target in targets['targets']:
        path = target['sourcePath']
        row = bulk_rows.get(path)
        if row is None:
            raise RuntimeError(f'missing A6-6 row: {path}')
        base = {
            'sourcePath': path,
            'heroReferenceCount': target['heroReferenceCount'],
            'heroIds': target['heroIds'],
            'skillIds': target['skillIds'],
            'status': 'VERIFIED',
        }
        if row.get('status') == 'VERIFIED':
            sprites = row.get('spriteHits', [])
            valid = [h for h in sprites if h.get('objectType') == 'Sprite' and h.get('nonEmptyAlpha') is True]
            if not valid:
                raise RuntimeError(f'A6-6 VERIFIED lacks valid Sprite: {path}')
            render_keys = {(h.get('width'), h.get('height'), h.get('rgbaSha256')) for h in valid}
            if len(render_keys) != 1:
                raise RuntimeError(f'A6-6 non-equivalent Sprite hits: {path}')
            candidate = row.get('candidate') or {}
            base.update({
                'verificationOwner': 'A6_6_BULK_256_VERIFICATION',
                'packagePart': candidate.get('packagePart'),
                'packageName': candidate.get('packageName'),
                'bundleEntry': candidate.get('bundleEntry'),
                'bundleSha256': candidate.get('bundleSha256'),
                'spriteHits': [sprite_projection(h) for h in valid],
                'companions': row.get('companions', []),
            })
            if None in [base['packagePart'], base['packageName'], base['bundleEntry'], base['bundleSha256']]:
                raise RuntimeError(f'A6-6 provenance incomplete: {path}')
            from_bulk += 1
        elif row.get('status') == 'REVIEW':
            gap_row = gap_rows.get(path)
            if gap_row is None or gap_row.get('status') != 'VERIFIED':
                raise RuntimeError(f'A6-7 did not resolve A6-6 REVIEW: {path}')
            exact = gap_row.get('exactHits', [])
            valid = [h for h in exact if h.get('objectType') == 'Sprite' and h.get('nonEmptyAlpha') is True]
            companions = [
                {'runtimeContainerPath': h.get('runtimeContainerPath'), 'objectType': h.get('objectType')}
                for h in exact if h.get('objectType') != 'Sprite'
            ]
            if not valid:
                raise RuntimeError(f'A6-7 VERIFIED lacks valid Sprite: {path}')
            source_keys = {(h.get('packagePart'), h.get('packageName'), h.get('bundleEntry'), h.get('bundleSha256')) for h in valid}
            render_keys = {(h.get('width'), h.get('height'), h.get('rgbaSha256')) for h in valid}
            if len(source_keys) != 1 or len(render_keys) != 1:
                raise RuntimeError(f'A6-7 ambiguous provenance: {path}')
            package_part, package_name, bundle_entry, bundle_sha = next(iter(source_keys))
            base.update({
                'verificationOwner': 'A6_7_SOURCE_SNAPSHOT_GAP_CLASSIFICATION',
                'packagePart': package_part,
                'packageName': package_name,
                'bundleEntry': bundle_entry,
                'bundleSha256': bundle_sha,
                'spriteHits': [sprite_projection(h) for h in valid],
                'companions': companions,
            })
            from_gap += 1
        else:
            raise RuntimeError(f'unresolved A6-6 status for {path}: {row.get("status")}')
        records.append(base)
    records.sort(key=lambda row: row['sourcePath'])
    paths = [r['sourcePath'] for r in records]
    if len(records) != EXPECTED_TARGET_COUNT or len(set(paths)) != EXPECTED_TARGET_COUNT or paths != sorted(paths):
        raise RuntimeError('A6-9 record population/order mismatch')
    if from_bulk != 253 or from_gap != 3:
        raise RuntimeError(f'A6-9 owner counts mismatch: bulk={from_bulk}, gap={from_gap}')
    result = {
        'version': 1,
        'schemaId': 'hero-awakening-icon-verification-provenance/v1',
        'status': 'FROZEN',
        'completion': 'COMPLETE',
        'semanticReopen': False,
        'stage': 'A6_9_FREEZE_VERIFICATION_PROVENANCE',
        'predecessor': {
            'stage': 'A6_7_SOURCE_SNAPSHOT_GAP_CLASSIFICATION',
            'commit': A6_7_COMMIT,
            'gapResultSha256': EXPECTED_GAP_SHA,
        },
        'inputs': {
            'targetSetSha256': EXPECTED_TARGET_SHA,
            'bulkResultSha256': EXPECTED_BULK_SHA,
            'gapResultSha256': EXPECTED_GAP_SHA,
        },
        'source': {
            'kind': 'OFFICIAL_INSTALLER',
            'installVersion': '1.1.113',
            'unityParser': 'UnityPy 1.25.3',
        },
        'authorityBoundary': {
            'lookupKey': 'sourcePath',
            'proofMatch': 'full normalized runtime relative path equality',
            'heroIdsAndSkillIds': 'provenance_only',
            'semanticRecomputation': False,
            'forbiddenInference': ['name JOIN', 'ID arithmetic', 'basename fallback', 'filename similarity', 'Hero ID to icon inference', 'skill ID to filename inference'],
        },
        'summary': {
            'targetCount': EXPECTED_TARGET_COUNT,
            'verifiedCount': EXPECTED_TARGET_COUNT,
            'fromA6_6Count': from_bulk,
            'fromA6_7Count': from_gap,
            'notInSourceSnapshotCount': 0,
            'reviewCount': 0,
            'blockerCount': 0,
        },
        'records': records,
        'nextStage': 'A7_1_MATERIALIZE_VERIFIED_ASSETS',
    }
    result['provenanceSetSha256'] = compact_sha(records)
    result['provenanceHashContract'] = 'sha256(UTF-8 compact JSON of records array in lexicographic exact sourcePath order)'
    return result


def validate_frozen(expected):
    if not OUTPUT.exists():
        raise RuntimeError('A6-9 frozen provenance missing')
    frozen = load(OUTPUT)
    if frozen != expected:
        raise RuntimeError('A6-9 frozen provenance drift')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    expected = build()
    if args.write:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    validate_frozen(expected)
    print(json.dumps({
        'checkpoint': 'AWAKENING_ICON_A6_9_VERIFICATION_PROVENANCE',
        'status': expected['status'],
        'completion': expected['completion'],
        **expected['summary'],
        'provenanceSetSha256': expected['provenanceSetSha256'],
        'semanticReopen': False,
        'networkUsed': False,
    }, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
