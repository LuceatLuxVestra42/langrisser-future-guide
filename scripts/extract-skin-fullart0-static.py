#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import re
from pathlib import Path

BASE = Path(__file__).with_name('extract-skin-fullart0-spine-source.py')
spec = importlib.util.spec_from_file_location('skin_fullart0_base', BASE)
if spec is None or spec.loader is None:
    raise RuntimeError('cannot load Skin FULLART-0 base helpers')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

EVIDENCE = Path('data/evidence/skin-stage3-2-asset-resolution-evidence.v1.json')
OUT = Path('data/evidence/skin-fullart0-static.v1.json')
WORK = Path('.skin-fullart0-static')
SOURCE_REF_RE = re.compile(r'^official-install://(?P<version>[^/]+)/(?P<package>[^/]+)/PC/AssetBundle/(?P<bundle>[^#]+)#(?P<runtime>.+)$')


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def main():
    evidence = json.loads(EVIDENCE.read_text(encoding='utf-8'))
    fixture = next(row for row in evidence['fixtures'] if int(row['skinId']) == 102)
    static = fixture['static']
    source = evidence['source']
    m = SOURCE_REF_RE.match(static['sourceRef'])
    if not m:
        raise RuntimeError('Skin 102 static sourceRef is invalid')
    parts = m.groupdict()
    package_path = WORK / 'packages' / parts['package']
    bundle_path = WORK / 'bundles' / parts['bundle']
    base.download(f"{source['base'].rstrip('/')}/{parts['package']}", package_path)
    physical = base.extract_bundle(package_path, parts['bundle'], bundle_path)

    import UnityPy
    env = UnityPy.load(str(bundle_path))
    matches = []
    for path, value in env.container.items():
        if base.norm(path) == base.norm(static['resolvedSourcePath']):
            matches.append((path, base.deref_container(value)))
    if len(matches) != 1:
        raise RuntimeError(f'exact current static container matches != 1: {len(matches)}')
    runtime_path, obj = matches[0]
    if getattr(getattr(obj, 'type', None), 'name', None) != 'Sprite':
        raise RuntimeError('current static locator did not resolve to Sprite')
    if sha256(obj.get_raw_data()) != static['sha256'].lower():
        raise RuntimeError('current static Sprite serialized hash differs from Stage 3-2')

    sprite = obj.read()
    image = sprite.image
    out_png = WORK / 'skin-102-static.png'
    out_png.parent.mkdir(parents=True, exist_ok=True)
    image.save(out_png)
    png = out_png.read_bytes()

    result = {
        'schemaVersion': 1,
        'status': 'PASS_CURRENT_STATIC_ARTWORK_PROBE',
        'skinId': 102,
        'authority': {
            'stage3_2EvidencePath': EVIDENCE.as_posix(),
            'installVersion': source['installVersion'],
            'sourceImagePath': static['sourceImagePath'],
            'resolvedSourcePath': runtime_path,
            'sourceRef': static['sourceRef'],
            'serializedSpriteSha256': sha256(obj.get_raw_data()),
            'physicalBundleEntry': physical,
        },
        'image': {
            'width': image.width,
            'height': image.height,
            'mode': image.mode,
            'pngSizeBytes': len(png),
            'pngSha256': sha256(png),
            'aspectRatio': image.width / image.height,
        },
        'guardrails': {
            'currentStage3_2Only': True,
            'officialInstallerDirectRead': True,
            'scopeSkinCount': 1,
            'historicalArtifactImported': False,
            'nameJoin': False,
            'idArithmetic': False,
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
