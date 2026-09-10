#!/usr/bin/env python3
import argparse
import hashlib
import importlib.util
import json
import pathlib

PROVENANCE_PATH = pathlib.Path('data/generated/hero-awakening-icon-verification-provenance.v1.json')
PACKAGE_PATH = pathlib.Path('data/generated/hero-awakening-icon-official-package-inventory.v1.json')
VERIFIER_PATH = pathlib.Path('scripts/verify-hero-awakening-icon-official.py')
OUTPUT = pathlib.Path('data/generated/hero-awakening-icon-materialization.v1.json')
PUBLIC_ROOT = pathlib.Path('public/images/heroes/skill-icons/awakening')
EXPECTED_PROVENANCE_SHA = 'bb689559967e8d7ceb9a6ccf0e9f0ac8fc97e58a50f1cf4566cde330adc7863d'
EXPECTED_PACKAGE_SHA = '2b1e622601af5f3b35dd39aa546b23265813b30174367b11c6467beaf01d7fe1'
EXPECTED_COUNT = 256
PREDECESSOR_COMMIT = '886a87cf2974559662bac3168743db1f160ba8d1'


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def compact_sha(value):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def load_verifier():
    spec = importlib.util.spec_from_file_location('a6_verifier', VERIFIER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_inputs():
    provenance = load(PROVENANCE_PATH)
    packages = load(PACKAGE_PATH)
    if provenance.get('schemaId') != 'hero-awakening-icon-verification-provenance/v1' or provenance.get('status') != 'FROZEN' or provenance.get('completion') != 'COMPLETE':
        raise RuntimeError('A6-9 provenance contract mismatch')
    if provenance.get('provenanceSetSha256') != EXPECTED_PROVENANCE_SHA:
        raise RuntimeError('A6-9 provenance hash mismatch')
    summary = provenance.get('summary', {})
    if summary.get('targetCount') != EXPECTED_COUNT or summary.get('verifiedCount') != EXPECTED_COUNT or summary.get('reviewCount') != 0 or summary.get('blockerCount') != 0:
        raise RuntimeError(f'A6-9 summary mismatch: {summary}')
    records = provenance.get('records', [])
    if len(records) != EXPECTED_COUNT or len({r.get('sourcePath') for r in records}) != EXPECTED_COUNT:
        raise RuntimeError('A6-9 provenance population mismatch')
    if any(r.get('status') != 'VERIFIED' for r in records):
        raise RuntimeError('A6-9 contains non-VERIFIED record')
    if packages.get('schemaId') != 'hero-awakening-icon-official-package-inventory/v1' or packages.get('completion') != 'COMPLETE' or packages.get('packageInventorySha256') != EXPECTED_PACKAGE_SHA:
        raise RuntimeError('A6-3 package inventory contract mismatch')
    package_by_part = {p['part']: p for p in packages.get('packages', [])}
    if len(package_by_part) != 68:
        raise RuntimeError('A6-3 package inventory count mismatch')
    return provenance, package_by_part


def public_rel_path(source_path):
    parts = source_path.replace('\\', '/').strip('/').split('/')
    if len(parts) < 4 or parts[0].lower() != 'ui' or parts[1].lower() != 'icon':
        raise RuntimeError(f'unexpected sourcePath shape: {source_path}')
    folder = parts[-2].lower()
    filename = parts[-1]
    return pathlib.Path('images/heroes/skill-icons/awakening') / folder / filename


def build_plan(records):
    plan = []
    seen_public = set()
    for row in records:
        source_path = row['sourcePath']
        rel = public_rel_path(source_path)
        public_path = '/' + rel.as_posix()
        if public_path in seen_public:
            raise RuntimeError(f'public output collision: {public_path}')
        seen_public.add(public_path)
        plan.append({
            'sourcePath': source_path,
            'publicPath': public_path,
            'filesystemPath': 'public/' + rel.as_posix(),
            'packagePart': row['packagePart'],
            'packageName': row['packageName'],
            'bundleEntry': row['bundleEntry'],
            'bundleSha256': row['bundleSha256'],
            'verificationOwner': row['verificationOwner'],
            'expectedSprites': row['spriteHits'],
        })
    return sorted(plan, key=lambda r: r['sourcePath'])


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
            raise RuntimeError(f'package provenance mismatch for part {part}')
        entries = verifier.zip_directory(package['url'], package['contentLength'])
        entry = next((e for e in entries if e['name'] == bundle_entry), None)
        if entry is None:
            raise RuntimeError(f'bundle entry missing from package {part}: {bundle_entry}')
        raw = verifier.fetch_zip_entry(package['url'], entry)
        actual_bundle_sha = sha256_bytes(raw)
        if actual_bundle_sha != expected_bundle_sha:
            raise RuntimeError(f'bundle SHA mismatch {bundle_entry}: {actual_bundle_sha}')
        env = UnityPy.load(raw)
        container = {}
        for container_path, value in env.container.items():
            rel = verifier.runtime_relative(container_path)
            if rel:
                container.setdefault(rel, []).append((container_path, value))
        for row in rows:
            target_norm = verifier.norm(row['sourcePath'])
            candidates = container.get(target_norm, [])
            sprite_candidates = []
            for container_path, value in candidates:
                reader = verifier.reader_of(value)
                if getattr(getattr(reader, 'type', None), 'name', None) != 'Sprite':
                    continue
                raw_obj = reader.get_raw_data()
                image = reader.read().image.convert('RGBA')
                raw_sha = sha256_bytes(raw_obj)
                rgba_sha = sha256_bytes(image.tobytes())
                if image.getchannel('A').getbbox() is None:
                    raise RuntimeError(f'empty alpha on exact Sprite: {row["sourcePath"]}')
                sprite_candidates.append((container_path, image, raw_sha, rgba_sha, int(getattr(reader, 'path_id', 0) or 0)))
            if not sprite_candidates:
                raise RuntimeError(f'no exact Sprite during materialization: {row["sourcePath"]}')
            expected_keys = {
                (s.get('rawObjectSha256'), s.get('rgbaSha256'), s.get('width'), s.get('height'))
                for s in row['expectedSprites']
            }
            matching = [c for c in sprite_candidates if (c[2], c[3], c[1].width, c[1].height) in expected_keys]
            if not matching:
                raise RuntimeError(f'Sprite proof hash mismatch during materialization: {row["sourcePath"]}')
            render_keys = {(c[1].width, c[1].height, c[3]) for c in matching}
            if len(render_keys) != 1:
                raise RuntimeError(f'non-equivalent materialization candidates: {row["sourcePath"]}')
            _, image, raw_sha, rgba_sha, path_id = matching[0]
            out_path = pathlib.Path(row['filesystemPath'])
            out_path.parent.mkdir(parents=True, exist_ok=True)
            image.save(out_path, format='PNG', optimize=False, compress_level=9)
            png = out_path.read_bytes()
            outputs.append({
                'sourcePath': row['sourcePath'],
                'publicPath': row['publicPath'],
                'filesystemPath': row['filesystemPath'],
                'packagePart': part,
                'packageName': row['packageName'],
                'bundleEntry': bundle_entry,
                'bundleSha256': expected_bundle_sha,
                'runtimeContainerPath': str(matching[0][0]).replace('\\', '/'),
                'pathId': path_id,
                'width': image.width,
                'height': image.height,
                'rawObjectSha256': raw_sha,
                'rgbaSha256': rgba_sha,
                'pngBytes': len(png),
                'pngSha256': sha256_bytes(png),
                'verificationOwner': row['verificationOwner'],
            })
    return sorted(outputs, key=lambda r: r['sourcePath'])


def build_manifest(outputs):
    if len(outputs) != EXPECTED_COUNT or len({r['sourcePath'] for r in outputs}) != EXPECTED_COUNT or len({r['publicPath'] for r in outputs}) != EXPECTED_COUNT:
        raise RuntimeError('A7-1 materialization population mismatch')
    return {
        'version': 1,
        'schemaId': 'hero-awakening-icon-materialization/v1',
        'status': 'FROZEN',
        'completion': 'COMPLETE',
        'semanticReopen': False,
        'stage': 'A7_1_MATERIALIZE_VERIFIED_ASSETS',
        'predecessor': {
            'stage': 'A6_9_FREEZE_VERIFICATION_PROVENANCE',
            'commit': PREDECESSOR_COMMIT,
            'provenanceSetSha256': EXPECTED_PROVENANCE_SHA,
        },
        'scope': {
            'inputVerifiedCount': EXPECTED_COUNT,
            'alreadyMaterializedAwakeningExcludedByA6_1': 1,
            'materializedNowCount': EXPECTED_COUNT,
            'manifestAdmission': False,
            'frontendMutation': False,
        },
        'outputPolicy': {
            'publicRoot': '/images/heroes/skill-icons/awakening',
            'pathRule': 'preserve exact filename under lowercase source parent directory',
            'sourcePathRemainsLookupAuthority': True,
            'basenameInference': False,
        },
        'summary': {
            'targetCount': EXPECTED_COUNT,
            'materializedCount': EXPECTED_COUNT,
            'missingCount': 0,
            'hashMismatchCount': 0,
            'publicPathCollisionCount': 0,
        },
        'records': outputs,
        'nextStage': 'A7_2_MANIFEST_ADMISSION',
        'materializationSetSha256': compact_sha(outputs),
        'materializationHashContract': 'sha256(UTF-8 compact JSON of records array sorted by exact sourcePath)',
    }


def validate_frozen():
    provenance, _ = validate_inputs()
    plan = build_plan(provenance['records'])
    if not OUTPUT.exists():
        raise RuntimeError('A7-1 frozen materialization index missing')
    frozen = load(OUTPUT)
    if frozen.get('schemaId') != 'hero-awakening-icon-materialization/v1' or frozen.get('status') != 'FROZEN' or frozen.get('completion') != 'COMPLETE' or frozen.get('semanticReopen') is not False:
        raise RuntimeError('A7-1 frozen contract mismatch')
    if frozen.get('predecessor', {}).get('provenanceSetSha256') != EXPECTED_PROVENANCE_SHA:
        raise RuntimeError('A7-1 predecessor hash mismatch')
    records = frozen.get('records', [])
    if len(records) != EXPECTED_COUNT or [r['sourcePath'] for r in records] != [p['sourcePath'] for p in plan]:
        raise RuntimeError('A7-1 frozen record population/order mismatch')
    expected_public = {p['sourcePath']: p['publicPath'] for p in plan}
    for row in records:
        if row['publicPath'] != expected_public[row['sourcePath']]:
            raise RuntimeError(f'A7-1 public path drift: {row["sourcePath"]}')
        path = pathlib.Path(row['filesystemPath'])
        if not path.is_file():
            raise RuntimeError(f'A7-1 public file missing: {path}')
        png = path.read_bytes()
        if len(png) != row['pngBytes'] or sha256_bytes(png) != row['pngSha256']:
            raise RuntimeError(f'A7-1 PNG hash/size mismatch: {path}')
    if frozen.get('materializationSetSha256') != compact_sha(records):
        raise RuntimeError('A7-1 materialization hash mismatch')
    print(json.dumps({
        'checkpoint': 'AWAKENING_ICON_A7_1_MATERIALIZATION',
        'status': frozen['status'],
        'completion': frozen['completion'],
        **frozen['summary'],
        'materializationSetSha256': frozen['materializationSetSha256'],
        'semanticReopen': False,
        'networkUsed': False,
    }, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--validate-frozen-only', action='store_true')
    args = parser.parse_args()
    if args.validate_frozen_only:
        validate_frozen()
        return
    if not args.write:
        raise RuntimeError('use --write or --validate-frozen-only')
    provenance, packages = validate_inputs()
    plan = build_plan(provenance['records'])
    outputs = materialize(plan, packages)
    frozen = build_manifest(outputs)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(frozen, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    validate_frozen()


if __name__ == '__main__':
    main()
