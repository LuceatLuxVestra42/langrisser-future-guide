#!/usr/bin/env python3
import argparse
import hashlib
import importlib.util
import json
import pathlib

BULK_PATH = pathlib.Path('data/generated/hero-awakening-icon-official-bulk-verification.v1.json')
PKG_PATH = pathlib.Path('data/generated/hero-awakening-icon-official-package-inventory.v1.json')
LOCATOR_PATH = pathlib.Path('data/generated/hero-awakening-icon-official-bundle-locator.v1.json')
OUTPUT = pathlib.Path('data/generated/hero-awakening-icon-source-snapshot-gap.v1.json')
VERIFIER_PATH = pathlib.Path('scripts/verify-hero-awakening-icon-official.py')
EXPECTED_BULK = 'b0a594ab0a2c2ae31c61534915ffdc1581e751a56b27d70c9cd8be861b8d0365'
EXPECTED_PKG = '2b1e622601af5f3b35dd39aa546b23265813b30174367b11c6467beaf01d7fe1'
EXPECTED_LOCATOR = 'acca558af1d48524e0f03094f0d760e1ecf312c55c9390d50f162e6484ff86e3'
EXPECTED_PACKAGE_COUNT = 68
EXPECTED_BUNDLE_COUNT = 3045
EXPECTED_SHARD_COUNT = 8
PREDECESSOR_COMMIT = '9e3d4050e463885b65666e5c8efebc27176217aa'
REVIEW_PATHS = [
    'UI/Icon/Skill2_ABS/Skill_CaptainBaby_3.png',
    'UI/Icon/Skill_ABS/Skill_Super140.png',
    'UI/Icon/Skill_ABS/Skill_Super15.png',
]


def load_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def compact_sha(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def load_verifier():
    spec = importlib.util.spec_from_file_location('a6_verifier', VERIFIER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_inputs():
    bulk = load_json(BULK_PATH)
    pkg = load_json(PKG_PATH)
    locator = load_json(LOCATOR_PATH)
    if bulk.get('schemaId') != 'hero-awakening-icon-official-bulk-verification/v1' or bulk.get('completion') != 'COMPLETE' or bulk.get('bulkResultSha256') != EXPECTED_BULK:
        raise RuntimeError('A6-6 bulk contract mismatch')
    actual_reviews = sorted(r['sourcePath'] for r in bulk.get('results', []) if r.get('status') == 'REVIEW')
    if actual_reviews != sorted(REVIEW_PATHS):
        raise RuntimeError(f'A6-6 review set mismatch: {actual_reviews}')
    if pkg.get('schemaId') != 'hero-awakening-icon-official-package-inventory/v1' or pkg.get('completion') != 'COMPLETE' or pkg.get('packageInventorySha256') != EXPECTED_PKG:
        raise RuntimeError('A6-3 package inventory mismatch')
    packages = pkg.get('packages', [])
    if len(packages) != EXPECTED_PACKAGE_COUNT or [p.get('part') for p in packages] != list(range(1, EXPECTED_PACKAGE_COUNT + 1)):
        raise RuntimeError('A6-3 package coverage mismatch')
    if locator.get('schemaId') != 'hero-awakening-icon-official-bundle-locator/v1' or locator.get('completion') != 'COMPLETE' or locator.get('bundleLocatorSha256') != EXPECTED_LOCATOR:
        raise RuntimeError('A6-4 locator contract mismatch')
    if locator.get('summary', {}).get('allBundleEntryCount') != EXPECTED_BUNDLE_COUNT:
        raise RuntimeError('A6-4 total bundle count mismatch')
    return bulk, pkg, locator


def scan_package(package, verifier, targets):
    import UnityPy
    hits = {path: [] for path in REVIEW_PATHS}
    errors = []
    bundle_count = 0
    try:
        entries = verifier.zip_directory(package['url'], package['contentLength'])
    except Exception as exc:
        return {
            'packagePart': package['part'],
            'packageName': package['packageName'],
            'bundleScanCount': 0,
            'hits': hits,
            'scanErrors': [{'packagePart': package['part'], 'reason': f'PACKAGE_CATALOG_INCOMPLETE:{type(exc).__name__}:{exc}'}],
        }
    for entry in entries:
        if not verifier.norm(entry['name']).endswith('.b'):
            continue
        bundle_count += 1
        try:
            raw = verifier.fetch_zip_entry(package['url'], entry)
            env = UnityPy.load(raw)
        except Exception as exc:
            errors.append({
                'packagePart': package['part'],
                'bundleEntry': entry['name'],
                'reason': f'BUNDLE_OR_UNITY_DECODE_FAIL:{type(exc).__name__}:{exc}',
            })
            continue
        bundle_sha = None
        for container_path, value in env.container.items():
            rel = verifier.runtime_relative(container_path)
            if rel not in targets:
                continue
            target = targets[rel]
            if bundle_sha is None:
                bundle_sha = verifier.sha256_bytes(raw)
            try:
                reader = verifier.reader_of(value)
                object_type = getattr(getattr(reader, 'type', None), 'name', None)
                row = {
                    'packagePart': package['part'],
                    'packageName': package['packageName'],
                    'bundleEntry': entry['name'],
                    'bundleSha256': bundle_sha,
                    'runtimeContainerPath': str(container_path).replace('\\', '/'),
                    'objectType': object_type,
                }
                if object_type == 'Sprite':
                    raw_obj = reader.get_raw_data()
                    image = reader.read().image.convert('RGBA')
                    alpha_bbox = image.getchannel('A').getbbox()
                    row.update({
                        'pathId': int(getattr(reader, 'path_id', 0) or 0),
                        'width': image.width,
                        'height': image.height,
                        'rawObjectSha256': verifier.sha256_bytes(raw_obj),
                        'rgbaSha256': verifier.sha256_bytes(image.tobytes()),
                        'nonEmptyAlpha': alpha_bbox is not None,
                    })
                hits[target].append(row)
            except Exception as exc:
                errors.append({
                    'packagePart': package['part'],
                    'bundleEntry': entry['name'],
                    'runtimeContainerPath': str(container_path).replace('\\', '/'),
                    'reason': f'EXACT_HIT_DECODE_FAIL:{type(exc).__name__}:{exc}',
                })
    return {
        'packagePart': package['part'],
        'packageName': package['packageName'],
        'bundleScanCount': bundle_count,
        'hits': hits,
        'scanErrors': errors,
    }


def run_shard(shard_index, shard_count, output_path):
    _, pkg, _ = validate_inputs()
    if shard_count != EXPECTED_SHARD_COUNT or shard_index < 0 or shard_index >= shard_count:
        raise RuntimeError('A6-7 shard contract mismatch')
    verifier = load_verifier()
    targets = {verifier.norm(path): path for path in REVIEW_PATHS}
    selected = [p for idx, p in enumerate(pkg['packages']) if idx % shard_count == shard_index]
    package_results = [scan_package(p, verifier, targets) for p in selected]
    hits = {path: [] for path in REVIEW_PATHS}
    errors = []
    bundle_count = 0
    for row in package_results:
        bundle_count += row['bundleScanCount']
        errors.extend(row['scanErrors'])
        for path in REVIEW_PATHS:
            hits[path].extend(row['hits'][path])
    result = {
        'schemaId': 'hero-awakening-icon-source-snapshot-gap-shard/v1',
        'shardIndex': shard_index,
        'shardCount': shard_count,
        'packageParts': [p['part'] for p in selected],
        'packageScanCount': len(selected),
        'bundleScanCount': bundle_count,
        'hits': hits,
        'scanErrors': errors,
    }
    result['shardResultSha256'] = compact_sha({k: result[k] for k in ['shardIndex', 'shardCount', 'packageParts', 'packageScanCount', 'bundleScanCount', 'hits', 'scanErrors']})
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({
        'checkpoint': 'AWAKENING_ICON_A6_7_SOURCE_GAP_SHARD',
        'shardIndex': shard_index,
        'packageScanCount': len(selected),
        'bundleScanCount': bundle_count,
        'exactHitCount': sum(len(v) for v in hits.values()),
        'scanErrorCount': len(errors),
        'shardResultSha256': result['shardResultSha256'],
    }, ensure_ascii=False, indent=2))


def load_shards(merge_dir):
    files = sorted(merge_dir.glob('**/gap-shard-*.json'))
    if len(files) != EXPECTED_SHARD_COUNT:
        raise RuntimeError(f'expected {EXPECTED_SHARD_COUNT} shard files, found {len(files)}')
    shards = [load_json(path) for path in files]
    indices = sorted(s.get('shardIndex') for s in shards)
    if indices != list(range(EXPECTED_SHARD_COUNT)) or any(s.get('shardCount') != EXPECTED_SHARD_COUNT for s in shards):
        raise RuntimeError('A6-7 shard index/count coverage mismatch')
    return sorted(shards, key=lambda s: s['shardIndex'])


def merge_shards(merge_dir):
    validate_inputs()
    shards = load_shards(merge_dir)
    package_parts = sorted(part for s in shards for part in s.get('packageParts', []))
    package_scan_count = sum(s.get('packageScanCount', 0) for s in shards)
    bundle_scan_count = sum(s.get('bundleScanCount', 0) for s in shards)
    if package_parts != list(range(1, EXPECTED_PACKAGE_COUNT + 1)) or package_scan_count != EXPECTED_PACKAGE_COUNT:
        raise RuntimeError('A6-7 aggregate package coverage mismatch')
    if bundle_scan_count != EXPECTED_BUNDLE_COUNT:
        raise RuntimeError(f'A6-7 aggregate bundle coverage mismatch: {bundle_scan_count} != {EXPECTED_BUNDLE_COUNT}')
    scan_errors = [e for s in shards for e in s.get('scanErrors', [])]
    hits = {path: [] for path in REVIEW_PATHS}
    for s in shards:
        for path in REVIEW_PATHS:
            hits[path].extend(s.get('hits', {}).get(path, []))
    results = []
    for path in REVIEW_PATHS:
        exact = hits[path]
        sprite_hits = [h for h in exact if h.get('objectType') == 'Sprite']
        valid_sprites = [h for h in sprite_hits if h.get('nonEmptyAlpha') is True]
        if scan_errors:
            status = 'BLOCKER'
            reason = 'EXHAUSTIVE_SCAN_GAP'
        elif sprite_hits and len(valid_sprites) != len(sprite_hits):
            status = 'BLOCKER'
            reason = 'EMPTY_ALPHA_OR_INVALID_SPRITE_EXACT_HIT'
        elif valid_sprites:
            render_keys = {(h.get('width'), h.get('height'), h.get('rgbaSha256')) for h in valid_sprites}
            if len(render_keys) != 1:
                status = 'BLOCKER'
                reason = 'AMBIGUOUS_NON_EQUIVALENT_EXACT_SOURCES'
            else:
                status = 'VERIFIED'
                reason = None
        elif exact:
            status = 'BLOCKER'
            reason = 'TYPE_MISMATCH_NO_VALID_SPRITE_EXACT_HIT'
        else:
            status = 'NOT_IN_SOURCE_SNAPSHOT'
            reason = 'NO_EXACT_RUNTIME_PATH_HIT_AFTER_EXHAUSTIVE_ALL_BUNDLES'
        results.append({'sourcePath': path, 'status': status, 'reason': reason, 'exactHits': exact})
    blockers = sum(r['status'] == 'BLOCKER' for r in results)
    result = {
        'version': 1,
        'schemaId': 'hero-awakening-icon-source-snapshot-gap/v1',
        'status': 'BLOCKER' if blockers else 'PASS',
        'completion': 'INCOMPLETE' if blockers else 'COMPLETE',
        'semanticReopen': False,
        'stage': 'A6_7_SOURCE_SNAPSHOT_GAP_CLASSIFICATION',
        'predecessor': {
            'stage': 'A6_6_BULK_256_VERIFICATION',
            'commit': PREDECESSOR_COMMIT,
            'bulkResultSha256': EXPECTED_BULK,
        },
        'source': {
            'kind': 'OFFICIAL_INSTALLER',
            'installVersion': '1.1.113',
            'packageInventorySha256': EXPECTED_PKG,
            'searchCoverage': 'EXHAUSTIVE_ALL_BUNDLES',
        },
        'execution': {
            'shardCount': EXPECTED_SHARD_COUNT,
            'packageAssignment': 'frozen package array index modulo shardCount',
            'aggregateRequirement': 'all shard indices present + exact package parts 1..68 + exact total bundle count 3045 + zero scan gaps for absence proof',
        },
        'summary': {
            'reviewInputCount': len(REVIEW_PATHS),
            'packageScanCount': package_scan_count,
            'bundleScanCount': bundle_scan_count,
            'verifiedCount': sum(r['status'] == 'VERIFIED' for r in results),
            'notInSourceSnapshotCount': sum(r['status'] == 'NOT_IN_SOURCE_SNAPSHOT' for r in results),
            'blockerCount': blockers,
            'scanErrorCount': len(scan_errors),
        },
        'results': results,
        'scanErrors': scan_errors,
        'shards': [{
            'shardIndex': s['shardIndex'],
            'packageParts': s['packageParts'],
            'packageScanCount': s['packageScanCount'],
            'bundleScanCount': s['bundleScanCount'],
            'shardResultSha256': s['shardResultSha256'],
        } for s in shards],
        'nextStage': 'A6_8_NEWER_OFFICIAL_SOURCE_SNAPSHOT_IF_NEEDED',
    }
    result['gapResultSha256'] = compact_sha(results)
    result['gapResultHashContract'] = 'sha256(UTF-8 compact JSON of exact three result rows in frozen REVIEW_PATHS order)'
    return result


def validate_frozen_only():
    validate_inputs()
    if not OUTPUT.exists():
        raise RuntimeError('frozen A6-7 result missing')
    frozen = load_json(OUTPUT)
    if frozen.get('schemaId') != 'hero-awakening-icon-source-snapshot-gap/v1' or frozen.get('completion') != 'COMPLETE' or frozen.get('status') != 'PASS' or frozen.get('semanticReopen') is not False:
        raise RuntimeError('A6-7 frozen status contract mismatch')
    summary = frozen.get('summary', {})
    if summary.get('reviewInputCount') != len(REVIEW_PATHS) or summary.get('packageScanCount') != EXPECTED_PACKAGE_COUNT or summary.get('bundleScanCount') != EXPECTED_BUNDLE_COUNT:
        raise RuntimeError(f'A6-7 frozen coverage summary mismatch: {summary}')
    if summary.get('blockerCount') != 0 or summary.get('scanErrorCount') != 0:
        raise RuntimeError(f'A6-7 frozen result contains blocker/scan gap: {summary}')
    if summary.get('verifiedCount', 0) + summary.get('notInSourceSnapshotCount', 0) != len(REVIEW_PATHS):
        raise RuntimeError(f'A6-7 frozen classification count mismatch: {summary}')
    results = frozen.get('results', [])
    if [r.get('sourcePath') for r in results] != REVIEW_PATHS:
        raise RuntimeError('A6-7 frozen path order mismatch')
    verified_count = 0
    not_in_count = 0
    for row in results:
        status = row.get('status')
        exact_hits = row.get('exactHits', [])
        if status == 'VERIFIED':
            verified_count += 1
            if row.get('reason') is not None or not exact_hits:
                raise RuntimeError(f'A6-7 invalid VERIFIED row: {row.get("sourcePath")}')
            sprite_hits = [h for h in exact_hits if h.get('objectType') == 'Sprite']
            if not sprite_hits or any(h.get('nonEmptyAlpha') is not True for h in sprite_hits):
                raise RuntimeError(f'A6-7 VERIFIED row lacks valid Sprite proof: {row.get("sourcePath")}')
            render_keys = {(h.get('width'), h.get('height'), h.get('rgbaSha256')) for h in sprite_hits}
            if len(render_keys) != 1:
                raise RuntimeError(f'A6-7 VERIFIED row has non-equivalent Sprite proofs: {row.get("sourcePath")}')
        elif status == 'NOT_IN_SOURCE_SNAPSHOT':
            not_in_count += 1
            if exact_hits or row.get('reason') != 'NO_EXACT_RUNTIME_PATH_HIT_AFTER_EXHAUSTIVE_ALL_BUNDLES':
                raise RuntimeError(f'A6-7 invalid NOT_IN_SOURCE_SNAPSHOT row: {row.get("sourcePath")}')
        else:
            raise RuntimeError(f'A6-7 unexpected frozen classification: {status}')
    if verified_count != summary.get('verifiedCount') or not_in_count != summary.get('notInSourceSnapshotCount'):
        raise RuntimeError('A6-7 frozen summary/result classification mismatch')
    if frozen.get('scanErrors') != []:
        raise RuntimeError('A6-7 frozen scan errors must be empty')
    if frozen.get('gapResultSha256') != compact_sha(results):
        raise RuntimeError('A6-7 frozen result hash mismatch')
    print(json.dumps({
        'checkpoint': 'AWAKENING_ICON_A6_7_SOURCE_SNAPSHOT_GAP',
        'status': frozen['status'],
        'completion': frozen['completion'],
        **summary,
        'gapPaths': [{'sourcePath': r['sourcePath'], 'status': r['status']} for r in results],
        'gapResultSha256': frozen['gapResultSha256'],
        'semanticReopen': False,
        'networkUsed': False,
    }, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--shard-index', type=int)
    parser.add_argument('--shard-count', type=int)
    parser.add_argument('--shard-output', type=pathlib.Path)
    parser.add_argument('--merge-dir', type=pathlib.Path)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--validate-frozen-only', action='store_true')
    args = parser.parse_args()
    if args.validate_frozen_only:
        validate_frozen_only()
        return
    if args.shard_index is not None:
        if args.shard_count is None or args.shard_output is None:
            raise RuntimeError('--shard-count and --shard-output are required with --shard-index')
        run_shard(args.shard_index, args.shard_count, args.shard_output)
        return
    if args.merge_dir is not None:
        expected = merge_shards(args.merge_dir)
        if args.write:
            OUTPUT.parent.mkdir(parents=True, exist_ok=True)
            OUTPUT.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if not OUTPUT.exists() or load_json(OUTPUT) != expected:
            raise RuntimeError('frozen A6-7 result drift/missing')
        print(json.dumps({
            'checkpoint': 'AWAKENING_ICON_A6_7_SOURCE_SNAPSHOT_GAP',
            'status': expected['status'],
            'completion': expected['completion'],
            **expected['summary'],
            'gapPaths': [{'sourcePath': r['sourcePath'], 'status': r['status']} for r in expected['results']],
            'gapResultSha256': expected['gapResultSha256'],
            'semanticReopen': False,
        }, ensure_ascii=False, indent=2))
        if expected['status'] == 'BLOCKER':
            raise SystemExit(2)
        return
    raise RuntimeError('choose --shard-index, --merge-dir, or --validate-frozen-only')


if __name__ == '__main__':
    main()
