#!/usr/bin/env python3
import argparse
import hashlib
import importlib.util
import json
import pathlib

PKG_PATH = pathlib.Path('data/generated/hero-awakening-icon-official-package-inventory.v1.json')
LOCATOR_PATH = pathlib.Path('data/generated/hero-awakening-icon-official-bundle-locator.v1.json')
VERIFIER_PATH = pathlib.Path('scripts/verify-hero-awakening-icon-official.py')
EXPECTED_SHARD_COUNT = 8
EXPECTED_PACKAGE_COUNT = 68
EXPECTED_BUNDLE_COUNT = 3045
EXPECTED_REVIEW_COUNT = 80


def load_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def compact_sha(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def load_verifier():
    spec = importlib.util.spec_from_file_location('hero_skill_icon_gap_verifier', VERIFIER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_inputs(verification_path):
    verification = load_json(verification_path)
    packages = load_json(PKG_PATH)
    locator = load_json(LOCATOR_PATH)

    if verification.get('schemaId') != 'hero-skill-icon-all-hero-official-verification/v1':
        raise RuntimeError('verification schema mismatch')
    if verification.get('completion') != 'COMPLETE' or verification.get('status') not in ('PASS', 'PASS_WITH_REVIEW'):
        raise RuntimeError('verification is not complete')
    summary = verification.get('summary') or {}
    if summary.get('targetCount') != 996 or summary.get('blockerCount') != 0:
        raise RuntimeError(f'verification population/blocker mismatch: {summary}')
    review = [row for row in verification.get('results', []) if row.get('status') == 'REVIEW']
    if len(review) != EXPECTED_REVIEW_COUNT:
        raise RuntimeError(f'review count drift {len(review)}/{EXPECTED_REVIEW_COUNT}')
    if any(row.get('reason') != 'LOCATOR_BUNDLE_NO_EXACT_RUNTIME_PATH_HIT' for row in review):
        raise RuntimeError('unexpected review reason')

    if packages.get('schemaId') != 'hero-awakening-icon-official-package-inventory/v1' or packages.get('completion') != 'COMPLETE':
        raise RuntimeError('official package inventory contract mismatch')
    package_rows = packages.get('packages') or []
    if len(package_rows) != EXPECTED_PACKAGE_COUNT or [p.get('part') for p in package_rows] != list(range(1, EXPECTED_PACKAGE_COUNT + 1)):
        raise RuntimeError('official package inventory coverage mismatch')

    if locator.get('schemaId') != 'hero-awakening-icon-official-bundle-locator/v1' or locator.get('completion') != 'COMPLETE':
        raise RuntimeError('locator contract mismatch')
    if (locator.get('summary') or {}).get('allBundleEntryCount') != EXPECTED_BUNDLE_COUNT:
        raise RuntimeError('locator all-bundle count mismatch')

    review_paths = [row['sourcePath'] for row in review]
    if len(set(review_paths)) != EXPECTED_REVIEW_COUNT:
        raise RuntimeError('duplicate review sourcePath')
    return verification, packages, review_paths


def scan_package(package, verifier, target_lookup):
    import UnityPy
    hits = {path: [] for path in target_lookup.values()}
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
            target = target_lookup.get(rel)
            if target is None:
                continue
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
                    row.update({
                        'pathId': int(getattr(reader, 'path_id', 0) or 0),
                        'width': image.width,
                        'height': image.height,
                        'rawObjectSha256': verifier.sha256_bytes(raw_obj),
                        'rgbaSha256': verifier.sha256_bytes(image.tobytes()),
                        'nonEmptyAlpha': image.getchannel('A').getbbox() is not None,
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


def run_shard(args):
    verification, packages, review_paths = validate_inputs(pathlib.Path(args.verification_report))
    if args.shard_count != EXPECTED_SHARD_COUNT or args.shard_index < 0 or args.shard_index >= args.shard_count:
        raise RuntimeError('shard contract mismatch')
    verifier = load_verifier()
    target_lookup = {verifier.norm(path): path for path in review_paths}
    selected = [p for idx, p in enumerate(packages['packages']) if idx % args.shard_count == args.shard_index]
    package_results = [scan_package(p, verifier, target_lookup) for p in selected]

    hits = {path: [] for path in review_paths}
    errors = []
    bundle_count = 0
    for row in package_results:
        bundle_count += row['bundleScanCount']
        errors.extend(row['scanErrors'])
        for path in review_paths:
            hits[path].extend(row['hits'][path])

    result = {
        'version': 1,
        'schemaId': 'hero-skill-icon-all-hero-source-gap-shard/v1',
        'shardIndex': args.shard_index,
        'shardCount': args.shard_count,
        'verificationSetSha256': verification['verificationSetSha256'],
        'reviewTargetSetSha256': compact_sha(review_paths),
        'packageParts': [p['part'] for p in selected],
        'packageScanCount': len(selected),
        'bundleScanCount': bundle_count,
        'hits': hits,
        'scanErrors': errors,
    }
    result['shardResultSha256'] = compact_sha({
        key: result[key] for key in ('shardIndex','shardCount','verificationSetSha256','reviewTargetSetSha256','packageParts','packageScanCount','bundleScanCount','hits','scanErrors')
    })
    output = pathlib.Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({
        'shardIndex': args.shard_index,
        'packageScanCount': len(selected),
        'bundleScanCount': bundle_count,
        'exactHitCount': sum(len(v) for v in hits.values()),
        'scanErrorCount': len(errors),
        'shardResultSha256': result['shardResultSha256'],
    }, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(2)


def merge(args):
    verification, packages, review_paths = validate_inputs(pathlib.Path(args.verification_report))
    merge_dir = pathlib.Path(args.merge_dir)
    files = sorted(merge_dir.glob('**/gap-shard-*.json'))
    if len(files) != EXPECTED_SHARD_COUNT:
        raise RuntimeError(f'expected {EXPECTED_SHARD_COUNT} shard files, found {len(files)}')
    shards = [load_json(path) for path in files]
    shards.sort(key=lambda row: row['shardIndex'])
    if [s.get('shardIndex') for s in shards] != list(range(EXPECTED_SHARD_COUNT)):
        raise RuntimeError('shard index coverage mismatch')
    review_sha = compact_sha(review_paths)
    if any(s.get('shardCount') != EXPECTED_SHARD_COUNT or s.get('verificationSetSha256') != verification['verificationSetSha256'] or s.get('reviewTargetSetSha256') != review_sha for s in shards):
        raise RuntimeError('shard predecessor contract mismatch')

    package_parts = sorted(part for s in shards for part in s.get('packageParts', []))
    package_scan_count = sum(s.get('packageScanCount', 0) for s in shards)
    bundle_scan_count = sum(s.get('bundleScanCount', 0) for s in shards)
    if package_parts != list(range(1, EXPECTED_PACKAGE_COUNT + 1)) or package_scan_count != EXPECTED_PACKAGE_COUNT:
        raise RuntimeError('aggregate package coverage mismatch')
    if bundle_scan_count != EXPECTED_BUNDLE_COUNT:
        raise RuntimeError(f'aggregate bundle coverage mismatch {bundle_scan_count}/{EXPECTED_BUNDLE_COUNT}')

    scan_errors = [e for s in shards for e in s.get('scanErrors', [])]
    hits = {path: [] for path in review_paths}
    for shard in shards:
        for path in review_paths:
            hits[path].extend(shard.get('hits', {}).get(path, []))

    results = []
    for path in review_paths:
        exact = hits[path]
        sprite_hits = [h for h in exact if h.get('objectType') == 'Sprite']
        valid_sprites = [h for h in sprite_hits if h.get('nonEmptyAlpha') is True]
        if scan_errors:
            status, reason = 'BLOCKER', 'EXHAUSTIVE_SCAN_GAP'
        elif sprite_hits and len(valid_sprites) != len(sprite_hits):
            status, reason = 'BLOCKER', 'EMPTY_ALPHA_OR_INVALID_SPRITE_EXACT_HIT'
        elif valid_sprites:
            render_keys = {(h.get('width'), h.get('height'), h.get('rgbaSha256')) for h in valid_sprites}
            if len(render_keys) != 1:
                status, reason = 'BLOCKER', 'AMBIGUOUS_NON_EQUIVALENT_EXACT_SOURCES'
            else:
                status, reason = 'VERIFIED', None
        elif exact:
            status, reason = 'BLOCKER', 'TYPE_MISMATCH_NO_VALID_SPRITE_EXACT_HIT'
        else:
            status, reason = 'NOT_IN_SOURCE_SNAPSHOT', 'NO_EXACT_RUNTIME_PATH_HIT_AFTER_EXHAUSTIVE_ALL_BUNDLES'
        results.append({'sourcePath': path, 'status': status, 'reason': reason, 'exactHits': exact})

    blockers = sum(r['status'] == 'BLOCKER' for r in results)
    report = {
        'version': 1,
        'schemaId': 'hero-skill-icon-all-hero-source-snapshot-gap/v1',
        'status': 'BLOCKER' if blockers else 'PASS',
        'completion': 'INCOMPLETE' if blockers else 'COMPLETE',
        'semanticReopen': False,
        'source': {
            'kind': 'OFFICIAL_INSTALLER',
            'installVersion': '1.1.113',
            'searchCoverage': 'EXHAUSTIVE_ALL_BUNDLES',
        },
        'predecessor': {
            'verificationSetSha256': verification['verificationSetSha256'],
            'reviewTargetSetSha256': review_sha,
        },
        'execution': {
            'shardCount': EXPECTED_SHARD_COUNT,
            'packageAssignment': 'official package inventory array index modulo shardCount',
            'aggregateRequirement': 'all 68 packages + all 3045 bundle entries + zero scan errors',
        },
        'summary': {
            'reviewInputCount': len(review_paths),
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
    }
    report['gapResultSha256'] = compact_sha(results)
    output = pathlib.Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], **report['summary'], 'gapResultSha256': report['gapResultSha256']}, ensure_ascii=False, indent=2))
    if blockers:
        raise SystemExit(2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verification-report', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--shard-index', type=int)
    parser.add_argument('--shard-count', type=int)
    parser.add_argument('--merge-dir')
    args = parser.parse_args()
    if args.merge_dir:
        merge(args)
    elif args.shard_index is not None and args.shard_count is not None:
        run_shard(args)
    else:
        raise RuntimeError('provide --merge-dir or both --shard-index/--shard-count')


if __name__ == '__main__':
    main()
