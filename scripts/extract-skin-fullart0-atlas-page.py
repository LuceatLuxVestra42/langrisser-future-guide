#!/usr/bin/env python3
import hashlib
import json
import re
from pathlib import Path, PurePosixPath

import UnityPy

EVIDENCE = Path('data/evidence/skin-stage3-2-asset-resolution-evidence.v1.json')
SPINE_SOURCE_EVIDENCE = Path('data/evidence/skin-fullart0-spine-source.v1.json')
WORK = Path('.skin-fullart0-spine-source')
RAW = WORK / 'raw'
OUT = Path('data/evidence/skin-fullart0-render-input.v1.json')
SOURCE_REF_RE = re.compile(
    r'^official-install://(?P<version>[^/]+)/(?P<package>[^/]+)/PC/AssetBundle/(?P<bundle>[^#]+)#(?P<runtime>.+)$'
)


def norm(value):
    return str(value).replace('\\', '/').strip().lower()


def sha256_file(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def deref(value):
    fn = getattr(value, 'deref', None)
    return fn() if callable(fn) else value


def main():
    stage32 = json.loads(EVIDENCE.read_text(encoding='utf-8'))
    source_evidence = json.loads(SPINE_SOURCE_EVIDENCE.read_text(encoding='utf-8'))
    if source_evidence.get('status') != 'PASS_CURRENT_SPINE_SOURCE_CHAIN':
        raise RuntimeError('current Spine source chain is not PASS')
    if source_evidence.get('spineBinaryHeader', {}).get('version') != '3.3.05':
        raise RuntimeError('unexpected current Skin 102 Spine version')
    fixture = next(row for row in stage32['fixtures'] if int(row['skinId']) == 102)
    spine = fixture['spine']
    match = SOURCE_REF_RE.match(spine['sourceRef'])
    if not match:
        raise RuntimeError('invalid current Skin 102 Spine sourceRef')
    parts = match.groupdict()
    bundle_path = WORK / 'bundles' / parts['bundle']
    if not bundle_path.is_file():
        raise RuntimeError(f'current official bundle is not present in bounded workdir: {bundle_path}')

    atlas_files = sorted(RAW.glob('*Mathew_Skin01.atlas.atlas.txt'))
    skel_files = sorted(RAW.glob('*Mathew_Skin01.skel.skel.bytes'))
    if len(atlas_files) != 1 or len(skel_files) != 1:
        raise RuntimeError(f'exact raw Spine source files required: atlas={len(atlas_files)} skel={len(skel_files)}')
    atlas_path = atlas_files[0]
    skel_path = skel_files[0]
    raw_lines = atlas_path.read_text(encoding='utf-8').splitlines()
    first_content_index = next((index for index, line in enumerate(raw_lines) if line.strip()), None)
    if first_content_index is None:
        raise RuntimeError('atlas text contains no non-empty content')
    lines = raw_lines[first_content_index:]
    if len(lines) < 2:
        raise RuntimeError('atlas text is too short after leading blank lines')
    page_name = lines[0].strip()
    if not page_name or '/' in page_name or '\\' in page_name:
        raise RuntimeError(f'unexpected atlas page name: {page_name!r}')
    size_match = re.match(r'^size:\s*(\d+)\s*,\s*(\d+)\s*$', lines[1].strip())
    if not size_match:
        raise RuntimeError(f'atlas page size missing or malformed: {lines[1]!r}')
    expected_width, expected_height = map(int, size_match.groups())

    prefab_dir = PurePosixPath(spine['resolvedPrefabPath']).parent
    runtime_path = (prefab_dir / page_name).as_posix()
    env = UnityPy.load(str(bundle_path))
    matches = []
    for container_path, value in env.container.items():
        if isinstance(container_path, str) and norm(container_path) == norm(runtime_path):
            matches.append((container_path, deref(value)))
    if len(matches) != 1:
        raise RuntimeError(f'exact atlas page Texture2D match count must be 1, got {len(matches)}: {runtime_path}')
    actual_path, obj = matches[0]
    object_type = getattr(getattr(obj, 'type', None), 'name', None)
    if object_type != 'Texture2D':
        raise RuntimeError(f'atlas page is not Texture2D: {object_type}')
    texture = obj.read().image
    if (texture.width, texture.height) != (expected_width, expected_height):
        raise RuntimeError(
            f'atlas page dimensions differ: atlas={(expected_width, expected_height)} texture={(texture.width, texture.height)}'
        )
    texture_path = RAW / page_name
    texture.save(texture_path)

    result = {
        'schemaVersion': 1,
        'stage': 'skin-page-3',
        'substage': 'FULLART-0-render-input',
        'status': 'PASS_CURRENT_RENDER_INPUT',
        'skinId': 102,
        'guardrails': {
            'historicalRecordUsedAsEvidence': False,
            'historicalArtifactImported': False,
            'currentStage3_2Only': True,
            'officialInstallerDirectRead': True,
            'scopeSkinCount': 1,
            'atlasPageDerivedFromCurrentAtlas': True,
            'exactRuntimePathOnly': True,
        },
        'authority': {
            'stage3_2EvidenceSha256': sha256_file(EVIDENCE),
            'spineSourceEvidenceSha256': sha256_file(SPINE_SOURCE_EVIDENCE),
            'installVersion': stage32['source']['installVersion'],
            'package': parts['package'],
            'bundle': parts['bundle'],
            'spineVersion': source_evidence['spineBinaryHeader']['version'],
        },
        'inputs': {
            'atlas': {
                'path': atlas_path.as_posix(),
                'sizeBytes': atlas_path.stat().st_size,
                'sha256': sha256_file(atlas_path),
            },
            'skeleton': {
                'path': skel_path.as_posix(),
                'sizeBytes': skel_path.stat().st_size,
                'sha256': sha256_file(skel_path),
            },
            'texture': {
                'atlasPageName': page_name,
                'runtimePath': actual_path,
                'path': texture_path.as_posix(),
                'width': texture.width,
                'height': texture.height,
                'sizeBytes': texture_path.stat().st_size,
                'sha256': sha256_file(texture_path),
            },
        },
        'decision': 'READY_FOR_EXACT_SPINE_3_3_RUNTIME_GEOMETRY',
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': result['status'], 'texture': result['inputs']['texture']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
