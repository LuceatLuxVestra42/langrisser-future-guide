#!/usr/bin/env python3
import argparse
import hashlib
import importlib.util
import json
import pathlib

TARGETS_PATH = pathlib.Path('data/generated/hero-awakening-icon-verification-targets.v1.json')
LOCATOR_PATH = pathlib.Path('data/generated/hero-awakening-icon-official-bundle-locator.v1.json')
OUTPUT = pathlib.Path('data/generated/hero-awakening-icon-official-bulk-verification.v1.json')
VERIFIER_PATH = pathlib.Path('scripts/verify-hero-awakening-icon-official.py')
EXPECTED_TARGET_HASH = '78e566b736e3b5b13a4c29186a283a05951383ba6ac84739f296b91c740a4723'
EXPECTED_LOCATOR_HASH = 'acca558af1d48524e0f03094f0d760e1ecf312c55c9390d50f162e6484ff86e3'
PREDECESSOR_COMMIT = 'dbbeba1b21b2ac6955335e0512a9218695c38869'
SHARD_COUNT = 8


def load_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def load_verifier():
    spec = importlib.util.spec_from_file_location('a6_verifier', VERIFIER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def compact_sha(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def validate_inputs():
    targets = load_json(TARGETS_PATH)
    locator = load_json(LOCATOR_PATH)
    if targets.get('schemaId') != 'hero-awakening-icon-verification-targets/v1' or targets.get('status') != 'FROZEN' or targets.get('completion') != 'COMPLETE':
        raise RuntimeError('A6-1 target contract mismatch')
    if targets.get('targetSetSha256') != EXPECTED_TARGET_HASH or len(targets.get('targets', [])) != 256:
        raise RuntimeError('A6-1 target hash/count mismatch')
    if locator.get('schemaId') != 'hero-awakening-icon-official-bundle-locator/v1' or locator.get('status') != 'FROZEN' or locator.get('completion') != 'COMPLETE':
        raise RuntimeError('A6-4 locator contract mismatch')
    if locator.get('bundleLocatorSha256') != EXPECTED_LOCATOR_HASH:
        raise RuntimeError('A6-4 locator hash mismatch')
    groups = locator.get('locatorGroups', [])
    if len(groups) != 3 or any(g.get('candidateCount') != 1 for g in groups):
        raise RuntimeError('A6-4 locator must expose exactly three one-candidate groups')
    return targets, locator


def decode_group_bundles(locator, verifier):
    import UnityPy
    decoded = {}
    for group in locator['locatorGroups']:
        candidate = group['candidates'][0]
        key = group['sourcePathPrefix']
        try:
            raw = verifier.fetch_zip_entry(candidate['packageUrl'], candidate)
            env = UnityPy.load(raw)
        except Exception as exc:
            decoded[key] = {
                'error': f'{type(exc).__name__}:{exc}',
                'candidate': candidate,
            }
            continue
        index = {}
        for container_path, value in env.container.items():
            rel = verifier.runtime_relative(container_path)
            if rel is None:
                continue
            index.setdefault(rel, []).append((str(container_path).replace('\\', '/'), value))
        decoded[key] = {
            'raw': raw,
            'bundleSha256': verifier.sha256_bytes(raw),
            'candidate': candidate,
            'index': index,
        }
    return decoded


def classify_target(target, group, decoded_group, verifier):
    source_path = target['sourcePath']
    base = {
        'sourcePath': source_path,
        'heroReferenceCount': target['heroReferenceCount'],
        'heroIds': target['heroIds'],
        'skillIds': target['skillIds'],
        'sourcePathPrefix': group['sourcePathPrefix'],
        'candidate': {
            'packagePart': group['candidates'][0]['packagePart'],
            'packageName': group['candidates'][0]['packageName'],
            'bundleEntry': group['candidates'][0]['bundleEntry'],
        },
    }
    if 'error' in decoded_group:
        return {**base, 'status': 'BLOCKER', 'reason': 'BUNDLE_OR_UNITY_DECODE_FAIL', 'detail': decoded_group['error'], 'spriteHits': [], 'companions': []}

    base['candidate']['bundleSha256'] = decoded_group['bundleSha256']
    exact = decoded_group['index'].get(verifier.norm(source_path), [])
    if not exact:
        return {**base, 'status': 'REVIEW', 'reason': 'LOCATOR_BUNDLE_NO_EXACT_RUNTIME_PATH_HIT', 'spriteHits': [], 'companions': []}

    sprite_hits = []
    companions = []
    sprite_errors = []
    for container_path, value in exact:
        try:
            reader = verifier.reader_of(value)
            object_type = getattr(getattr(reader, 'type', None), 'name', None)
            if object_type != 'Sprite':
                companions.append({'runtimeContainerPath': container_path, 'objectType': object_type})
                continue
            raw_obj = reader.get_raw_data()
            image = reader.read().image.convert('RGBA')
            alpha_bbox = image.getchannel('A').getbbox()
            if alpha_bbox is None:
                sprite_errors.append({'runtimeContainerPath': container_path, 'reason': 'EMPTY_ALPHA'})
                continue
            sprite_hits.append({
                'runtimeContainerPath': container_path,
                'objectType': 'Sprite',
                'pathId': int(getattr(reader, 'path_id', 0) or 0),
                'width': image.width,
                'height': image.height,
                'rawObjectSha256': verifier.sha256_bytes(raw_obj),
                'rgbaSha256': verifier.sha256_bytes(image.tobytes()),
                'nonEmptyAlpha': True,
            })
        except Exception as exc:
            sprite_errors.append({'runtimeContainerPath': container_path, 'reason': f'UNITY_DECODE_FAIL:{type(exc).__name__}:{exc}'})

    if not sprite_hits:
        reason = 'EMPTY_ALPHA_OR_SPRITE_DECODE_FAIL' if sprite_errors else 'TYPE_MISMATCH_NO_SPRITE_EXACT_HIT'
        return {**base, 'status': 'BLOCKER', 'reason': reason, 'spriteHits': sprite_hits, 'companions': companions, 'spriteErrors': sprite_errors}
    if sprite_errors:
        return {**base, 'status': 'BLOCKER', 'reason': sprite_errors[0]['reason'], 'spriteHits': sprite_hits, 'companions': companions, 'spriteErrors': sprite_errors}
    render_keys = {(h['width'], h['height'], h['rgbaSha256']) for h in sprite_hits}
    if len(render_keys) != 1:
        return {**base, 'status': 'BLOCKER', 'reason': 'AMBIGUOUS_NON_EQUIVALENT_EXACT_SOURCES', 'spriteHits': sprite_hits, 'companions': companions}
    return {**base, 'status': 'VERIFIED', 'reason': None, 'spriteHits': sprite_hits, 'companions': companions}


def build_result(targets, locator):
    verifier = load_verifier()
    decoded = decode_group_bundles(locator, verifier)
    groups = locator['locatorGroups']
    by_prefix = {g['sourcePathPrefix']: g for g in groups}

    sorted_targets = sorted(targets['targets'], key=lambda x: x['sourcePath'])
    results = []
    shard_summaries = []
    for shard_index in range(SHARD_COUNT):
        shard_targets = [row for idx, row in enumerate(sorted_targets) if idx % SHARD_COUNT == shard_index]
        shard_results = []
        for target in shard_targets:
            matches = [prefix for prefix in by_prefix if target['sourcePath'].startswith(prefix)]
            if len(matches) != 1:
                shard_results.append({
                    'sourcePath': target['sourcePath'], 'heroReferenceCount': target['heroReferenceCount'],
                    'heroIds': target['heroIds'], 'skillIds': target['skillIds'],
                    'status': 'BLOCKER', 'reason': 'LOCATOR_GROUP_CONTRACT_MISMATCH', 'spriteHits': [], 'companions': []
                })
                continue
            prefix = matches[0]
            shard_results.append(classify_target(target, by_prefix[prefix], decoded[prefix], verifier))
        results.extend(shard_results)
        shard_summaries.append({
            'shardIndex': shard_index,
            'targetCount': len(shard_results),
            'verifiedCount': sum(r['status'] == 'VERIFIED' for r in shard_results),
            'reviewCount': sum(r['status'] == 'REVIEW' for r in shard_results),
            'blockerCount': sum(r['status'] == 'BLOCKER' for r in shard_results),
            'resultSha256': compact_sha(shard_results),
        })

    results.sort(key=lambda r: r['sourcePath'])
    verified = sum(r['status'] == 'VERIFIED' for r in results)
    reviews = sum(r['status'] == 'REVIEW' for r in results)
    blockers = sum(r['status'] == 'BLOCKER' for r in results)
    overall = 'BLOCKER' if blockers else ('PASS_WITH_REVIEW' if reviews else 'PASS')
    completion = 'INCOMPLETE' if blockers else 'COMPLETE'

    bundle_inputs = []
    for group in groups:
        d = decoded[group['sourcePathPrefix']]
        candidate = group['candidates'][0]
        bundle_inputs.append({
            'sourcePathPrefix': group['sourcePathPrefix'],
            'packagePart': candidate['packagePart'],
            'packageName': candidate['packageName'],
            'bundleEntry': candidate['bundleEntry'],
            'bundleSha256': d.get('bundleSha256'),
            'decodeError': d.get('error'),
        })

    result = {
        'version': 1,
        'schemaId': 'hero-awakening-icon-official-bulk-verification/v1',
        'status': overall,
        'completion': completion,
        'semanticReopen': False,
        'stage': 'A6_6_BULK_256_VERIFICATION',
        'predecessor': {
            'stage': 'A6_5_SMALL_CANARY',
            'commit': PREDECESSOR_COMMIT,
            'canaryResultSha256': 'b321f6fdbc5ab780033749c19ed8530b73d231d106e5728e513cadda84f15f27',
        },
        'targetInput': {'targetSetSha256': EXPECTED_TARGET_HASH, 'targetCount': 256},
        'locatorInput': {'bundleLocatorSha256': EXPECTED_LOCATOR_HASH, 'locatorGroupCount': 3},
        'source': {'kind': 'OFFICIAL_INSTALLER', 'installVersion': '1.1.113', 'unityParser': 'UnityPy 1.25.3'},
        'verificationPolicy': {
            'shardCount': SHARD_COUNT,
            'shardAssignment': 'lexicographic sourcePath order index modulo shardCount',
            'proofRequirement': 'full normalized runtime relative path equality + at least one Sprite exact hit + decoded RGBA + non-empty alpha',
            'nonSpriteExactPathCompanions': 'recorded but do not invalidate a valid Sprite exact hit',
            'locatorGapClassification': 'REVIEW only; filtered candidate-bundle miss does not prove NOT_IN_SOURCE_SNAPSHOT',
            'semanticRecomputation': False,
        },
        'bundleInputs': bundle_inputs,
        'summary': {
            'targetCount': len(results),
            'verifiedCount': verified,
            'reviewCount': reviews,
            'blockerCount': blockers,
            'shardCount': SHARD_COUNT,
        },
        'shards': shard_summaries,
        'results': results,
        'nextStage': 'A6_7_SOURCE_SNAPSHOT_GAP_CLASSIFICATION',
    }
    result['bulkResultSha256'] = compact_sha(results)
    result['bulkResultHashContract'] = 'sha256(UTF-8 compact JSON of results sorted by exact sourcePath)'
    return result


def validate_frozen(expected):
    if not OUTPUT.exists():
        raise RuntimeError(f'frozen bulk result missing: {OUTPUT}')
    frozen = load_json(OUTPUT)
    if frozen != expected:
        raise RuntimeError('frozen bulk verification drift')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    targets, locator = validate_inputs()
    expected = build_result(targets, locator)
    if args.write:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    validate_frozen(expected)
    print(json.dumps({
        'checkpoint': 'AWAKENING_ICON_A6_6_BULK_256_VERIFICATION',
        'status': expected['status'],
        'completion': expected['completion'],
        **expected['summary'],
        'reviewPaths': [r['sourcePath'] for r in expected['results'] if r['status'] == 'REVIEW'],
        'bulkResultSha256': expected['bulkResultSha256'],
        'semanticReopen': False,
    }, ensure_ascii=False, indent=2))
    if expected['status'] == 'BLOCKER':
        raise SystemExit(2)


if __name__ == '__main__':
    main()
