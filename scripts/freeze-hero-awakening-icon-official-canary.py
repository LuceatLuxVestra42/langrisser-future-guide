#!/usr/bin/env python3
import argparse
import hashlib
import importlib.util
import json
import pathlib

TARGETS_PATH = pathlib.Path('data/generated/hero-awakening-icon-verification-targets.v1.json')
LOCATOR_PATH = pathlib.Path('data/generated/hero-awakening-icon-official-bundle-locator.v1.json')
OUTPUT = pathlib.Path('data/generated/hero-awakening-icon-official-canary.v1.json')
VERIFIER_PATH = pathlib.Path('scripts/verify-hero-awakening-icon-official.py')
EXPECTED_TARGET_HASH = '78e566b736e3b5b13a4c29186a283a05951383ba6ac84739f296b91c740a4723'
EXPECTED_LOCATOR_HASH = 'acca558af1d48524e0f03094f0d760e1ecf312c55c9390d50f162e6484ff86e3'
CANARIES = [
    ('UI/Icon/Skill_ABS/', 'UI/Icon/Skill_ABS/Skill_Super1.png'),
    ('UI/Icon/Skill2_ABS/', 'UI/Icon/Skill2_ABS/Skil_Klaudia_4.png'),
    ('UI/Icon/Item05_ABS/', 'UI/Icon/Item05_ABS/Skill_HeavenDefier_3_1.png'),
]


def load_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def load_verifier():
    spec = importlib.util.spec_from_file_location('a6_2_verifier', VERIFIER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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
    by_path = {r['sourcePath']: r for r in targets['targets']}
    by_prefix = {g['sourcePathPrefix']: g for g in locator['locatorGroups']}
    for prefix, source_path in CANARIES:
        if source_path not in by_path:
            raise RuntimeError(f'canary not in frozen target set: {source_path}')
        group = by_prefix.get(prefix)
        if not group or group.get('candidateCount') != 1:
            raise RuntimeError(f'canary locator must have exactly one candidate: {prefix}')
    return targets, locator, by_path, by_prefix


def verify_canaries(targets, locator, by_path, by_prefix):
    try:
        import UnityPy
    except ImportError as exc:
        raise RuntimeError('UnityPy is required') from exc
    verifier = load_verifier()
    bundle_cache = {}
    env_cache = {}
    results = []
    for prefix, source_path in CANARIES:
        target = by_path[source_path]
        candidate = by_prefix[prefix]['candidates'][0]
        key = (candidate['packagePart'], candidate['bundleEntry'])
        if key not in bundle_cache:
            raw = verifier.fetch_zip_entry(candidate['packageUrl'], candidate)
            bundle_cache[key] = raw
            env_cache[key] = UnityPy.load(raw)
        raw = bundle_cache[key]
        env = env_cache[key]
        wanted = verifier.norm(source_path)
        hits = []
        for container_path, value in env.container.items():
            if verifier.runtime_relative(container_path) != wanted:
                continue
            reader = verifier.reader_of(value)
            object_type = getattr(getattr(reader, 'type', None), 'name', None)
            if object_type != 'Sprite':
                hits.append({'status':'BLOCKER','reason':'TYPE_MISMATCH','objectType':object_type,'runtimeContainerPath':str(container_path).replace('\\','/')})
                continue
            raw_obj = reader.get_raw_data()
            image = reader.read().image.convert('RGBA')
            alpha_bbox = image.getchannel('A').getbbox()
            hits.append({
                'status': 'VERIFIED' if alpha_bbox is not None else 'BLOCKER',
                'reason': None if alpha_bbox is not None else 'EMPTY_ALPHA',
                'runtimeContainerPath': str(container_path).replace('\\','/'),
                'objectType': object_type,
                'pathId': int(getattr(reader, 'path_id', 0) or 0),
                'width': image.width,
                'height': image.height,
                'rawObjectSha256': verifier.sha256_bytes(raw_obj),
                'rgbaSha256': verifier.sha256_bytes(image.tobytes()),
                'nonEmptyAlpha': alpha_bbox is not None,
            })
        if not hits:
            status, reason = 'REVIEW', 'NO_EXACT_RUNTIME_PATH_HIT_IN_CANDIDATE_BUNDLE'
        elif any(h['status'] != 'VERIFIED' for h in hits):
            status, reason = 'BLOCKER', next(h['reason'] for h in hits if h['status'] != 'VERIFIED')
        elif len({(h['width'],h['height'],h['rgbaSha256']) for h in hits}) != 1:
            status, reason = 'BLOCKER', 'AMBIGUOUS_NON_EQUIVALENT_EXACT_SOURCES'
        else:
            status, reason = 'VERIFIED', None
        results.append({
            'sourcePathPrefix': prefix,
            'target': target,
            'candidate': {
                'packagePart': candidate['packagePart'],
                'packageName': candidate['packageName'],
                'bundleEntry': candidate['bundleEntry'],
                'bundleSha256': verifier.sha256_bytes(raw),
            },
            'status': status,
            'reason': reason,
            'exactHits': hits,
        })
    return results


def build_result(targets, locator, results):
    blockers = sum(1 for r in results if r['status'] == 'BLOCKER')
    reviews = sum(1 for r in results if r['status'] == 'REVIEW')
    verified = sum(1 for r in results if r['status'] == 'VERIFIED')
    status = 'PASS' if blockers == 0 and reviews == 0 and verified == len(CANARIES) else ('BLOCKER' if blockers else 'PASS_WITH_REVIEW')
    result = {
        'version': 1,
        'schemaId': 'hero-awakening-icon-official-canary/v1',
        'status': status,
        'completion': 'COMPLETE' if status == 'PASS' else 'INCOMPLETE',
        'semanticReopen': False,
        'predecessor': {'stage':'A6_4_GENERIC_BUNDLE_LOCATOR','commit':'1e832b6d895425a363f0dd1ee39030d93fe782b7','bundleLocatorSha256':EXPECTED_LOCATOR_HASH},
        'targetInput': {'targetSetSha256':EXPECTED_TARGET_HASH,'targetCount':256},
        'source': {'kind':'OFFICIAL_INSTALLER','installVersion':'1.1.113','unityParser':'UnityPy 1.25.3'},
        'selectionPolicy': 'one explicit frozen pending sourcePath from each A6-4 locator group',
        'proofRequirement': 'full normalized runtime relative path equality + Sprite + decoded RGBA + non-empty alpha',
        'summary': {'canaryCount':len(CANARIES),'verifiedCount':verified,'reviewCount':reviews,'blockerCount':blockers},
        'results': results,
    }
    raw = json.dumps(results, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    result['canaryResultSha256'] = hashlib.sha256(raw).hexdigest()
    return result


def validate_frozen(expected):
    frozen = load_json(OUTPUT)
    if frozen != expected:
        raise RuntimeError('frozen canary drift')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    args = ap.parse_args()
    targets, locator, by_path, by_prefix = validate_inputs()
    results = verify_canaries(targets, locator, by_path, by_prefix)
    expected = build_result(targets, locator, results)
    if args.write:
        OUTPUT.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    validate_frozen(expected)
    print(json.dumps({'checkpoint':'AWAKENING_ICON_A6_5_SMALL_CANARY','status':expected['status'],**expected['summary'],'canaryResultSha256':expected['canaryResultSha256'],'semanticReopen':False}, ensure_ascii=False, indent=2))
    if expected['status'] == 'BLOCKER':
        raise SystemExit(2)

if __name__ == '__main__':
    main()
