#!/usr/bin/env python3
import argparse
import hashlib
import importlib.util
import json
import pathlib

SHARD_DIR = pathlib.Path('data/generated/hero-detail/by-id')
MANIFEST_PATH = pathlib.Path('data/generated/hero-skill-icon-assets.v1.json')
LOCATOR_PATH = pathlib.Path('data/generated/hero-awakening-icon-official-bundle-locator.v1.json')
VERIFIER_PATH = pathlib.Path('scripts/verify-hero-awakening-icon-official.py')
EXPECTED_SHARD_COUNT = 267
EXPECTED_USAGE = {'jobLevel': 1911, 'direct': 304, 'talent': 1602, 'total': 3817}
EXPECTED_UNMATCHED_COUNT = 996
ALLOWED_PREFIXES = (
    'UI/Icon/Skill_ABS/',
    'UI/Icon/Skill2_ABS/',
    'UI/Icon/Item05_ABS/',
)


def load_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def compact_sha(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def load_verifier():
    spec = importlib.util.spec_from_file_location('hero_skill_icon_official_verifier', VERIFIER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def collect_unmatched():
    shard_names = sorted(
        (p for p in SHARD_DIR.iterdir() if p.is_file() and p.name[:-5].isdigit() and p.suffix == '.json'),
        key=lambda p: int(p.stem),
    )
    if len(shard_names) != EXPECTED_SHARD_COUNT:
        raise RuntimeError(f'hero shard count mismatch {len(shard_names)}/{EXPECTED_SHARD_COUNT}')

    usage = {'jobLevel': 0, 'direct': 0, 'talent': 0, 'total': 0}
    by_path = {}

    def add(group, hero_id, skill_id, source_path):
        usage[group] += 1
        usage['total'] += 1
        if not isinstance(source_path, str) or not source_path:
            raise RuntimeError(f'invalid iconPath hero={hero_id} group={group} skill={skill_id}')
        row = by_path.setdefault(source_path, {
            'sourcePath': source_path,
            'heroReferenceCount': 0,
            'heroIds': set(),
            'skillIds': set(),
            'groups': set(),
        })
        row['heroReferenceCount'] += 1
        row['heroIds'].add(hero_id)
        if isinstance(skill_id, int):
            row['skillIds'].add(skill_id)
        row['groups'].add(group)

    for shard in shard_names:
        hero = load_json(shard)
        hero_id = int(shard.stem)
        for row in hero.get('normal', {}).get('skills', {}).get('jobLevelAcquisitions', []):
            add('jobLevel', hero_id, row.get('skillId'), (row.get('skill') or {}).get('iconPath'))
        for row in hero.get('normal', {}).get('skills', {}).get('heroDirectSkills', []):
            add('direct', hero_id, row.get('skillId'), row.get('iconPath'))
        for row in hero.get('normal', {}).get('talent', {}).get('starProgression', []):
            add('talent', hero_id, row.get('skillId'), (row.get('skill') or {}).get('iconPath'))

    if usage != EXPECTED_USAGE:
        raise RuntimeError(f'usage mismatch {usage} expected={EXPECTED_USAGE}')

    manifest = load_json(MANIFEST_PATH)
    if manifest.get('schemaId') != 'hero-skill-icon-assets/v1' or manifest.get('status') != 'FROZEN':
        raise RuntimeError('manifest contract mismatch')
    manifest_rows = list(manifest.get('records') or []) + list(manifest.get('awakeningRecords') or [])
    manifest_paths = {r.get('sourcePath') for r in manifest_rows if isinstance(r.get('sourcePath'), str) and r.get('sourcePath')}
    unmatched = []
    for source_path in sorted(set(by_path) - manifest_paths):
        row = by_path[source_path]
        unmatched.append({
            'sourcePath': source_path,
            'heroReferenceCount': row['heroReferenceCount'],
            'heroIds': sorted(row['heroIds']),
            'skillIds': sorted(row['skillIds']),
            'groups': sorted(row['groups']),
        })
    if len(unmatched) != EXPECTED_UNMATCHED_COUNT:
        raise RuntimeError(f'unmatched population drift {len(unmatched)}/{EXPECTED_UNMATCHED_COUNT}')
    prefixes = {next((p for p in ALLOWED_PREFIXES if row['sourcePath'].startswith(p)), None) for row in unmatched}
    if None in prefixes:
        bad = [r['sourcePath'] for r in unmatched if not r['sourcePath'].startswith(ALLOWED_PREFIXES)]
        raise RuntimeError(f'unexpected sourcePath prefix: {bad[:10]}')
    return usage, unmatched


def validate_locator(locator):
    if locator.get('schemaId') != 'hero-awakening-icon-official-bundle-locator/v1':
        raise RuntimeError('locator schema mismatch')
    if locator.get('status') != 'FROZEN' or locator.get('completion') != 'COMPLETE':
        raise RuntimeError('locator is not frozen/complete')
    groups = locator.get('locatorGroups') or []
    by_prefix = {g.get('sourcePathPrefix'): g for g in groups}
    if set(by_prefix) != set(ALLOWED_PREFIXES):
        raise RuntimeError(f'locator prefix contract mismatch: {sorted(by_prefix)}')
    for prefix in ALLOWED_PREFIXES:
        candidates = by_prefix[prefix].get('candidates') or []
        if len(candidates) != 1:
            raise RuntimeError(f'locator candidate count mismatch {prefix}={len(candidates)}')
    return by_prefix


def decode_bundles(by_prefix, verifier):
    import UnityPy
    decoded = {}
    for prefix in ALLOWED_PREFIXES:
        candidate = by_prefix[prefix]['candidates'][0]
        raw = verifier.fetch_zip_entry(candidate['packageUrl'], candidate)
        actual_sha = verifier.sha256_bytes(raw)
        expected_sha = candidate.get('bundleSha256')
        if expected_sha and actual_sha != expected_sha:
            raise RuntimeError(f'bundle SHA mismatch for {prefix}: {actual_sha} != {expected_sha}')
        env = UnityPy.load(raw)
        index = {}
        for container_path, value in env.container.items():
            rel = verifier.runtime_relative(container_path)
            if rel is not None:
                index.setdefault(rel, []).append((str(container_path).replace('\\', '/'), value))
        decoded[prefix] = {
            'candidate': candidate,
            'bundleSha256': actual_sha,
            'index': index,
        }
    return decoded


def classify(target, prefix, decoded_group, verifier):
    candidate = decoded_group['candidate']
    base = {
        **target,
        'sourcePathPrefix': prefix,
        'packagePart': candidate['packagePart'],
        'packageName': candidate['packageName'],
        'bundleEntry': candidate['bundleEntry'],
        'bundleSha256': decoded_group['bundleSha256'],
    }
    exact = decoded_group['index'].get(verifier.norm(target['sourcePath']), [])
    if not exact:
        return {**base, 'status': 'REVIEW', 'reason': 'LOCATOR_BUNDLE_NO_EXACT_RUNTIME_PATH_HIT', 'spriteHits': [], 'companions': []}

    sprite_hits = []
    companions = []
    errors = []
    for container_path, value in exact:
        try:
            reader = verifier.reader_of(value)
            object_type = getattr(getattr(reader, 'type', None), 'name', None)
            if object_type != 'Sprite':
                companions.append({'runtimeContainerPath': container_path, 'objectType': object_type})
                continue
            raw_obj = reader.get_raw_data()
            image = reader.read().image.convert('RGBA')
            if image.getchannel('A').getbbox() is None:
                errors.append({'runtimeContainerPath': container_path, 'reason': 'EMPTY_ALPHA'})
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
            errors.append({'runtimeContainerPath': container_path, 'reason': f'UNITY_DECODE_FAIL:{type(exc).__name__}:{exc}'})

    if errors:
        return {**base, 'status': 'BLOCKER', 'reason': errors[0]['reason'], 'spriteHits': sprite_hits, 'companions': companions, 'spriteErrors': errors}
    if not sprite_hits:
        return {**base, 'status': 'BLOCKER', 'reason': 'TYPE_MISMATCH_NO_SPRITE_EXACT_HIT', 'spriteHits': [], 'companions': companions}
    render_keys = {(h['width'], h['height'], h['rgbaSha256']) for h in sprite_hits}
    if len(render_keys) != 1:
        return {**base, 'status': 'BLOCKER', 'reason': 'AMBIGUOUS_NON_EQUIVALENT_EXACT_SOURCES', 'spriteHits': sprite_hits, 'companions': companions}
    return {**base, 'status': 'VERIFIED', 'reason': None, 'spriteHits': sprite_hits, 'companions': companions}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    usage, targets = collect_unmatched()
    locator = load_json(LOCATOR_PATH)
    by_prefix = validate_locator(locator)
    verifier = load_verifier()
    decoded = decode_bundles(by_prefix, verifier)

    results = []
    for target in targets:
        prefix = next(p for p in ALLOWED_PREFIXES if target['sourcePath'].startswith(p))
        results.append(classify(target, prefix, decoded[prefix], verifier))

    verified = sum(r['status'] == 'VERIFIED' for r in results)
    review = sum(r['status'] == 'REVIEW' for r in results)
    blocker = sum(r['status'] == 'BLOCKER' for r in results)
    status = 'BLOCKER' if blocker else ('PASS_WITH_REVIEW' if review else 'PASS')
    report = {
        'version': 1,
        'schemaId': 'hero-skill-icon-all-hero-official-verification/v1',
        'status': status,
        'completion': 'INCOMPLETE' if blocker else 'COMPLETE',
        'semanticReopen': False,
        'source': {
            'kind': 'OFFICIAL_INSTALLER',
            'installVersion': '1.1.113',
            'unityParser': 'UnityPy==1.25.3',
        },
        'policy': {
            'lookupAuthority': 'exact Stage6 sourcePath',
            'locatorRole': 'candidate bundle only',
            'proofRequirement': 'full normalized runtime relative path equality + Sprite decode + non-empty alpha',
            'basenameInference': False,
            'nameJoin': False,
            'idArithmetic': False,
            'semanticRecomputation': False,
            'locatorMissClassification': 'REVIEW',
        },
        'input': {
            'heroShardCount': EXPECTED_SHARD_COUNT,
            'usage': usage,
            'unmatchedTargetCount': len(targets),
            'targetSetSha256': compact_sha(targets),
            'locatorSchemaId': locator.get('schemaId'),
            'locatorGroupCount': len(by_prefix),
        },
        'summary': {
            'targetCount': len(results),
            'verifiedCount': verified,
            'reviewCount': review,
            'blockerCount': blocker,
        },
        'bundleInputs': [
            {
                'sourcePathPrefix': prefix,
                'packagePart': decoded[prefix]['candidate']['packagePart'],
                'packageName': decoded[prefix]['candidate']['packageName'],
                'bundleEntry': decoded[prefix]['candidate']['bundleEntry'],
                'bundleSha256': decoded[prefix]['bundleSha256'],
            }
            for prefix in ALLOWED_PREFIXES
        ],
        'results': results,
    }
    report['verificationSetSha256'] = compact_sha(results)
    output = pathlib.Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({
        'status': status,
        **report['summary'],
        'targetSetSha256': report['input']['targetSetSha256'],
        'verificationSetSha256': report['verificationSetSha256'],
    }, ensure_ascii=False, indent=2))
    if blocker:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
