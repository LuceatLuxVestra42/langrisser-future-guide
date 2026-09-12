#!/usr/bin/env python3
import argparse
import hashlib
import importlib.util
import json
import pathlib

PACKAGE_PATH = pathlib.Path('data/generated/hero-awakening-icon-official-package-inventory.v1.json')
VERIFIER_PATH = pathlib.Path('scripts/verify-hero-awakening-icon-official.py')
SHARD_DIR = pathlib.Path('data/generated/hero-detail/by-id')
PUBLIC_ROOT = pathlib.Path('public/images/heroes/skill-icons')
OUTPUT = pathlib.Path('data/generated/hero-skill-icon-all-hero-materialization.v1.json')
EXPECTED_TARGET_COUNT = 996
EXPECTED_DIRECT_VERIFIED = 916
EXPECTED_GAP_VERIFIED = 80
EXPECTED_VERIFICATION_SET_SHA = '08f88588fdc3cc5a5aca276785ea99aacda449521441398a5960f6ffa359648c'
EXPECTED_GAP_RESULT_SHA = '260ee5e50e7ffbebff66421d7429590d4ee2b8cba04aebcc37dcf5d157f67f23'
EXPECTED_PACKAGE_SHA = '2b1e622601af5f3b35dd39aa546b23265813b30174367b11c6467beaf01d7fe1'


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def compact_sha(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def load_verifier():
    spec = importlib.util.spec_from_file_location('skill_icon_verifier', VERIFIER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def collect_usage():
    by_path = {}
    shards = sorted((p for p in SHARD_DIR.glob('*.json') if p.stem.isdigit()), key=lambda p: int(p.stem))
    if len(shards) != 267:
        raise RuntimeError(f'hero shard count mismatch {len(shards)}/267')

    def add(group, hero_id, skill_id, source_path):
        if not isinstance(source_path, str) or not source_path:
            raise RuntimeError(f'invalid Stage6 sourcePath hero={hero_id} group={group} skill={skill_id}')
        row = by_path.setdefault(source_path, {'groups': set(), 'heroIds': set(), 'skillIds': set(), 'usageCount': 0})
        row['groups'].add(group)
        row['heroIds'].add(hero_id)
        if isinstance(skill_id, int):
            row['skillIds'].add(skill_id)
        row['usageCount'] += 1

    counts = {'jobLevel': 0, 'direct': 0, 'talent': 0}
    for shard in shards:
        hero = load(shard)
        hero_id = int(shard.stem)
        for row in hero.get('normal', {}).get('skills', {}).get('jobLevelAcquisitions', []):
            counts['jobLevel'] += 1
            add('jobLevel', hero_id, row.get('skillId'), (row.get('skill') or {}).get('iconPath'))
        for row in hero.get('normal', {}).get('skills', {}).get('heroDirectSkills', []):
            counts['direct'] += 1
            add('direct', hero_id, row.get('skillId'), row.get('iconPath'))
        for row in hero.get('normal', {}).get('talent', {}).get('starProgression', []):
            counts['talent'] += 1
            add('talent', hero_id, row.get('skillId'), (row.get('skill') or {}).get('iconPath'))
    if counts != {'jobLevel': 1911, 'direct': 304, 'talent': 1602}:
        raise RuntimeError(f'Stage6 usage drift: {counts}')
    return by_path


def validate_proofs(verification_path, gap_path):
    verification = load(verification_path)
    gap = load(gap_path)
    packages = load(PACKAGE_PATH)
    if verification.get('schemaId') != 'hero-skill-icon-all-hero-official-verification/v1' or verification.get('completion') != 'COMPLETE':
        raise RuntimeError('direct verification contract mismatch')
    if verification.get('verificationSetSha256') != EXPECTED_VERIFICATION_SET_SHA:
        raise RuntimeError('direct verification hash mismatch')
    summary = verification.get('summary') or {}
    if summary != {'targetCount': 996, 'verifiedCount': 916, 'reviewCount': 80, 'blockerCount': 0}:
        raise RuntimeError(f'direct verification summary mismatch: {summary}')
    if gap.get('schemaId') != 'hero-skill-icon-all-hero-source-snapshot-gap/v1' or gap.get('status') != 'PASS' or gap.get('completion') != 'COMPLETE':
        raise RuntimeError('gap verification contract mismatch')
    if gap.get('gapResultSha256') != EXPECTED_GAP_RESULT_SHA:
        raise RuntimeError('gap verification hash mismatch')
    gap_summary = gap.get('summary') or {}
    expected_gap = {'reviewInputCount': 80, 'packageScanCount': 68, 'bundleScanCount': 3045, 'verifiedCount': 80, 'notInSourceSnapshotCount': 0, 'blockerCount': 0, 'scanErrorCount': 0}
    if gap_summary != expected_gap:
        raise RuntimeError(f'gap verification summary mismatch: {gap_summary}')
    if packages.get('schemaId') != 'hero-awakening-icon-official-package-inventory/v1' or packages.get('completion') != 'COMPLETE' or packages.get('packageInventorySha256') != EXPECTED_PACKAGE_SHA:
        raise RuntimeError('package inventory contract mismatch')
    package_by_part = {p['part']: p for p in packages.get('packages', [])}
    if len(package_by_part) != 68:
        raise RuntimeError('package inventory population mismatch')

    proof = {}
    for row in verification.get('results', []):
        if row.get('status') != 'VERIFIED':
            continue
        sprites = row.get('spriteHits') or []
        if not sprites:
            raise RuntimeError(f'direct verified record without Sprite proof: {row.get("sourcePath")}')
        proof[row['sourcePath']] = {
            'verificationOwner': 'LOCATOR_EXACT',
            'packagePart': row['packagePart'],
            'packageName': row['packageName'],
            'bundleEntry': row['bundleEntry'],
            'bundleSha256': row['bundleSha256'],
            'expectedSprites': sprites,
        }
    if len(proof) != EXPECTED_DIRECT_VERIFIED:
        raise RuntimeError(f'direct verified population mismatch {len(proof)}/{EXPECTED_DIRECT_VERIFIED}')

    for row in gap.get('results', []):
        if row.get('status') != 'VERIFIED':
            raise RuntimeError(f'non-verified exhaustive result: {row.get("sourcePath")} {row.get("status")}')
        hits = [h for h in (row.get('exactHits') or []) if h.get('objectType') == 'Sprite' and h.get('nonEmptyAlpha') is True]
        if not hits:
            raise RuntimeError(f'exhaustive verified record without Sprite proof: {row.get("sourcePath")}')
        render_keys = {(h.get('width'), h.get('height'), h.get('rgbaSha256')) for h in hits}
        if len(render_keys) != 1:
            raise RuntimeError(f'non-equivalent exhaustive Sprite proof: {row.get("sourcePath")}')
        first = hits[0]
        source_path = row['sourcePath']
        if source_path in proof:
            raise RuntimeError(f'proof population overlap: {source_path}')
        proof[source_path] = {
            'verificationOwner': 'EXHAUSTIVE_ALL_BUNDLES',
            'packagePart': first['packagePart'],
            'packageName': first['packageName'],
            'bundleEntry': first['bundleEntry'],
            'bundleSha256': first['bundleSha256'],
            'expectedSprites': hits,
        }
    if len(proof) != EXPECTED_TARGET_COUNT:
        raise RuntimeError(f'combined verified population mismatch {len(proof)}/{EXPECTED_TARGET_COUNT}')
    return proof, package_by_part


def build_plan(proof, usage):
    plan = []
    seen_public = set()
    seen_public_ci = set()
    existing_names = {p.name for p in PUBLIC_ROOT.iterdir() if p.is_file()} if PUBLIC_ROOT.exists() else set()
    existing_ci = {name.lower() for name in existing_names}
    for source_path in sorted(proof):
        if source_path not in usage:
            raise RuntimeError(f'verified sourcePath is not in current Stage6 usage: {source_path}')
        filename = pathlib.PurePosixPath(source_path).name
        public_path = f'/images/heroes/skill-icons/{filename}'
        if public_path in seen_public or public_path.lower() in seen_public_ci:
            raise RuntimeError(f'new public output collision: {public_path}')
        if filename in existing_names or filename.lower() in existing_ci:
            raise RuntimeError(f'existing public output collision: {public_path}')
        seen_public.add(public_path)
        seen_public_ci.add(public_path.lower())
        u = usage[source_path]
        plan.append({
            'sourcePath': source_path,
            'publicPath': public_path,
            'filesystemPath': 'public' + public_path,
            'usageCount': u['usageCount'],
            'groups': sorted(u['groups']),
            'heroIds': sorted(u['heroIds']),
            'skillIds': sorted(u['skillIds']),
            **proof[source_path],
        })
    if len(plan) != EXPECTED_TARGET_COUNT:
        raise RuntimeError('materialization plan population mismatch')
    return plan


def materialize(plan, package_by_part):
    import UnityPy
    verifier = load_verifier()
    grouped = {}
    for row in plan:
        key = (row['packagePart'], row['bundleEntry'], row['bundleSha256'])
        grouped.setdefault(key, []).append(row)
    outputs = []
    for (part, bundle_entry, expected_bundle_sha), rows in sorted(grouped.items()):
        package = package_by_part.get(part)
        if not package or package.get('packageName') != rows[0]['packageName']:
            raise RuntimeError(f'package provenance mismatch part={part}')
        entries = verifier.zip_directory(package['url'], package['contentLength'])
        entry = next((e for e in entries if e['name'] == bundle_entry), None)
        if entry is None:
            raise RuntimeError(f'bundle entry missing package={part}: {bundle_entry}')
        raw = verifier.fetch_zip_entry(package['url'], entry)
        actual_bundle_sha = sha256_bytes(raw)
        if actual_bundle_sha != expected_bundle_sha:
            raise RuntimeError(f'bundle SHA mismatch {bundle_entry}: {actual_bundle_sha}')
        env = UnityPy.load(raw)
        container = {}
        for container_path, value in env.container.items():
            rel = verifier.runtime_relative(container_path)
            if rel:
                container.setdefault(rel, []).append((str(container_path).replace('\\', '/'), value))
        for row in rows:
            candidates = container.get(verifier.norm(row['sourcePath']), [])
            sprite_candidates = []
            for container_path, value in candidates:
                reader = verifier.reader_of(value)
                if getattr(getattr(reader, 'type', None), 'name', None) != 'Sprite':
                    continue
                raw_obj = reader.get_raw_data()
                image = reader.read().image.convert('RGBA')
                if image.getchannel('A').getbbox() is None:
                    raise RuntimeError(f'empty alpha exact Sprite: {row["sourcePath"]}')
                sprite_candidates.append({
                    'containerPath': container_path,
                    'image': image,
                    'pathId': int(getattr(reader, 'path_id', 0) or 0),
                    'rawObjectSha256': sha256_bytes(raw_obj),
                    'rgbaSha256': sha256_bytes(image.tobytes()),
                    'width': image.width,
                    'height': image.height,
                })
            expected_keys = {(s.get('rawObjectSha256'), s.get('rgbaSha256'), s.get('width'), s.get('height')) for s in row['expectedSprites']}
            matching = [c for c in sprite_candidates if (c['rawObjectSha256'], c['rgbaSha256'], c['width'], c['height']) in expected_keys]
            if not matching:
                raise RuntimeError(f'exact Sprite proof mismatch during materialization: {row["sourcePath"]}')
            render_keys = {(c['width'], c['height'], c['rgbaSha256']) for c in matching}
            if len(render_keys) != 1:
                raise RuntimeError(f'non-equivalent materialization candidates: {row["sourcePath"]}')
            selected = matching[0]
            out_path = pathlib.Path(row['filesystemPath'])
            out_path.parent.mkdir(parents=True, exist_ok=True)
            selected['image'].save(out_path, format='PNG', optimize=False, compress_level=9)
            png = out_path.read_bytes()
            outputs.append({
                'sourcePath': row['sourcePath'],
                'publicPath': row['publicPath'],
                'filesystemPath': row['filesystemPath'],
                'usageCount': row['usageCount'],
                'groups': row['groups'],
                'heroIds': row['heroIds'],
                'skillIds': row['skillIds'],
                'verificationOwner': row['verificationOwner'],
                'packagePart': part,
                'packageName': row['packageName'],
                'bundleEntry': bundle_entry,
                'bundleSha256': expected_bundle_sha,
                'containerPath': selected['containerPath'],
                'objectType': 'Sprite',
                'pathId': selected['pathId'],
                'rawObjectSha256': selected['rawObjectSha256'],
                'rgbaSha256': selected['rgbaSha256'],
                'width': selected['width'],
                'height': selected['height'],
                'pngBytes': len(png),
                'pngSha256': sha256_bytes(png),
            })
    return sorted(outputs, key=lambda r: r['sourcePath'])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--verification-report', required=True)
    parser.add_argument('--gap-report', required=True)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    if not args.write:
        raise RuntimeError('read-only default; pass --write to materialize verified assets')
    proof, package_by_part = validate_proofs(pathlib.Path(args.verification_report), pathlib.Path(args.gap_report))
    usage = collect_usage()
    plan = build_plan(proof, usage)
    outputs = materialize(plan, package_by_part)
    if len(outputs) != EXPECTED_TARGET_COUNT or len({r['sourcePath'] for r in outputs}) != EXPECTED_TARGET_COUNT or len({r['publicPath'].lower() for r in outputs}) != EXPECTED_TARGET_COUNT:
        raise RuntimeError('materialized output population/collision mismatch')
    report = {
        'version': 1,
        'schemaId': 'hero-skill-icon-all-hero-materialization/v1',
        'status': 'FROZEN',
        'completion': 'COMPLETE',
        'semanticReopen': False,
        'source': {
            'kind': 'OFFICIAL_INSTALLER',
            'installVersion': '1.1.113',
            'unityParser': 'UnityPy==1.25.3',
        },
        'predecessor': {
            'verificationSetSha256': EXPECTED_VERIFICATION_SET_SHA,
            'gapResultSha256': EXPECTED_GAP_RESULT_SHA,
        },
        'outputPolicy': {
            'publicRoot': '/images/heroes/skill-icons',
            'pathRule': 'exact sourcePath basename after exact sourcePath proof; collisions fail closed',
            'sourcePathRemainsLookupAuthority': True,
            'basenameInference': False,
            'nameJoin': False,
            'idArithmetic': False,
        },
        'summary': {
            'targetCount': EXPECTED_TARGET_COUNT,
            'materializedCount': len(outputs),
            'missingCount': 0,
            'hashMismatchCount': 0,
            'publicPathCollisionCount': 0,
        },
        'records': outputs,
    }
    report['materializationSetSha256'] = compact_sha(outputs)
    report['materializationHashContract'] = 'sha256(UTF-8 compact JSON of records array sorted by exact sourcePath)'
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': 'PASS_MATERIALIZED', **report['summary'], 'materializationSetSha256': report['materializationSetSha256']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
