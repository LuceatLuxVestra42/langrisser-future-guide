#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path

BASE = Path(__file__).with_name('extract-skin-fullart0-spine-source.py')
spec = importlib.util.spec_from_file_location('skin_fullart0_spine_source_base', BASE)
if spec is None or spec.loader is None:
    raise RuntimeError('cannot load Skin FULLART-0 Spine source extractor')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def textasset_bytes_preserve_binary(obj):
    data = obj.read()
    script = getattr(data, 'script', None)
    if script is None:
        tree = module.safe_tree(obj)
        script = tree.get('m_Script') if isinstance(tree, dict) else None
    if isinstance(script, str):
        return script.encode('utf-8', errors='surrogateescape')
    if isinstance(script, (bytes, bytearray, memoryview)):
        return bytes(script)
    raise RuntimeError(f'unsupported TextAsset payload type: {type(script).__name__}')


def main():
    source_path = Path('data/evidence/skin-stage3-2-asset-resolution-evidence.v1.json')
    evidence = json.loads(source_path.read_text(encoding='utf-8'))
    fixture = next(row for row in evidence['fixtures'] if int(row['skinId']) == 102)
    exact = [row for row in fixture['model']['resources'] if int(row['skinResourceId']) == 102]
    if len(exact) != 1:
        raise RuntimeError(f'exact General model resource count for skinResourceId 102 != 1: {len(exact)}')
    resource = exact[0]
    if not resource.get('resolved'):
        raise RuntimeError('current Stage 3-2 General resource 102 is unresolved')

    probe = json.loads(json.dumps(evidence))
    probe_fixture = next(row for row in probe['fixtures'] if int(row['skinId']) == 102)
    probe_fixture['spine'] = {
        'resolved': True,
        'sourceRef': resource['resolvedSource'],
        'resolvedPrefabPath': resource['resolvedContainerPath'],
        'sha256': resource['sha256'],
    }
    temp = Path('.skin-fullart0-general-evidence.json')
    temp.write_text(json.dumps(probe, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    module.textasset_bytes = textasset_bytes_preserve_binary
    module.EVIDENCE = temp
    module.OUT = Path('data/evidence/skin-fullart0-general-source.v1.json')
    module.WORK = Path('.skin-fullart0-general-source')
    module.RAW = module.WORK / 'raw'
    try:
        module.main()
    finally:
        temp.unlink(missing_ok=True)

    result = json.loads(module.OUT.read_text(encoding='utf-8'))
    result['substage'] = 'FULLART-0-general-source'
    result['resourceFamily'] = 'Spine/General'
    result['skinResourceId'] = 102
    result['authority']['modelResourceRecord'] = {
        'skinResourceId': resource['skinResourceId'],
        'prefabPath': resource['prefabPath'],
        'resolvedContainerPath': resource['resolvedContainerPath'],
        'sha256': resource['sha256'],
    }
    module.OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({
        'status': result['status'],
        'resourceFamily': result['resourceFamily'],
        'spineVersion': result['spineBinaryHeader'].get('version'),
        'exports': [
            {k: row.get(k) for k in ('type', 'name', 'width', 'height', 'sizeBytes')}
            for row in result.get('exports', [])
        ],
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
