#!/usr/bin/env python3
import hashlib
import json
import re
import urllib.request
import zipfile
from pathlib import Path

import UnityPy

EVIDENCE = Path('data/evidence/skin-stage3-2-asset-resolution-evidence.v1.json')
OUT = Path('data/evidence/skin-fullart0-spine-source.v1.json')
WORK = Path('.skin-fullart0-spine-source')
RAW = WORK / 'raw'
ARCHIVE_ROOT = 'Client/Langrisser_Data/StreamingAssets/ExportAssetBundle'
SOURCE_REF_RE = re.compile(
    r'^official-install://(?P<version>[^/]+)/(?P<package>[^/]+)/PC/AssetBundle/(?P<bundle>[^#]+)#(?P<runtime>.+)$'
)


def norm(value):
    return str(value).replace('\\', '/').strip().lower()


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def download(url, path):
    if path.is_file() and path.stat().st_size:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'langrisser-future-guide-fullart0-spine/1.0'})
    with urllib.request.urlopen(req, timeout=180) as r, path.open('wb') as f:
        while True:
            chunk = r.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)


def extract_bundle(package_path, bundle_name, bundle_path):
    expected = norm(f'{ARCHIVE_ROOT}/{bundle_name}')
    with zipfile.ZipFile(package_path) as zf:
        matches = [name for name in zf.namelist() if norm(name) == expected]
        if len(matches) != 1:
            raise RuntimeError(f'exact physical bundle entry count != 1: {bundle_name}: {len(matches)}')
        bundle_path.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(matches[0]) as src, bundle_path.open('wb') as dst:
            while True:
                chunk = src.read(1024 * 1024)
                if not chunk:
                    break
                dst.write(chunk)
    return matches[0]


def deref_container(value):
    method = getattr(value, 'deref', None)
    return method() if callable(method) else value


def safe_tree(obj):
    try:
        return obj.read_typetree()
    except Exception as exc:
        return {'__read_typetree_error__': str(exc)}


def object_name(tree):
    if isinstance(tree, dict):
        for key in ('m_Name', 'name', 'Name'):
            value = tree.get(key)
            if isinstance(value, str) and value:
                return value
    return None


def collect_pptrs(value, path='$', out=None):
    if out is None:
        out = []
    if isinstance(value, dict):
        if 'm_FileID' in value and 'm_PathID' in value:
            try:
                out.append({
                    'fieldPath': path,
                    'fileId': int(value.get('m_FileID', 0)),
                    'pathId': int(value.get('m_PathID', 0)),
                })
            except Exception:
                pass
        for key, child in value.items():
            collect_pptrs(child, f'{path}.{key}', out)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            collect_pptrs(child, f'{path}[{index}]', out)
    return out


def resolve_local_refs(obj, local_objects):
    tree = safe_tree(obj)
    rows = []
    for ref in collect_pptrs(tree):
        row = dict(ref)
        if ref['fileId'] == 0 and ref['pathId'] in local_objects:
            target = local_objects[ref['pathId']]
            target_tree = safe_tree(target)
            row.update({
                'resolvedType': getattr(getattr(target, 'type', None), 'name', None),
                'resolvedName': object_name(target_tree),
            })
        rows.append(row)
    return tree, rows


def textasset_bytes(obj):
    data = obj.read()
    script = getattr(data, 'script', None)
    if script is None:
        tree = safe_tree(obj)
        script = tree.get('m_Script') if isinstance(tree, dict) else None
    if isinstance(script, str):
        return script.encode('utf-8')
    if isinstance(script, (bytes, bytearray, memoryview)):
        return bytes(script)
    raise RuntimeError(f'unsupported TextAsset payload type: {type(script).__name__}')


def read_varint(data, offset):
    result = 0
    shift = 0
    for _ in range(5):
        if offset >= len(data):
            raise RuntimeError('unexpected EOF reading varint')
        b = data[offset]
        offset += 1
        result |= (b & 0x7F) << shift
        if (b & 0x80) == 0:
            return result, offset
        shift += 7
    raise RuntimeError('invalid varint')


def read_spine_string(data, offset):
    length, offset = read_varint(data, offset)
    if length == 0:
        return None, offset
    length -= 1
    end = offset + length
    if end > len(data):
        raise RuntimeError('spine string exceeds payload')
    return data[offset:end].decode('utf-8', errors='strict'), end


def detect_spine_header(data):
    # Spine binary skeletons begin with hash string then version string.
    try:
        hash_value, offset = read_spine_string(data, 0)
        version, offset = read_spine_string(data, offset)
        return {
            'parser': 'spine-binary-header-two-strings',
            'hash': hash_value,
            'version': version,
            'headerBytesConsumed': offset,
            'first32Hex': data[:32].hex(),
        }
    except Exception as exc:
        return {
            'parser': 'spine-binary-header-two-strings',
            'error': str(exc),
            'first64Hex': data[:64].hex(),
        }


def container_paths_for(env, target_obj):
    target_id = int(getattr(target_obj, 'path_id', 0))
    rows = []
    for path, value in env.container.items():
        try:
            if int(getattr(deref_container(value), 'path_id', 0)) == target_id:
                rows.append(path)
        except Exception:
            pass
    return rows


def main():
    evidence = json.loads(EVIDENCE.read_text(encoding='utf-8'))
    if evidence.get('evidenceClass') != 'FRESH_OFFICIAL_INSTALLER_REPRESENTATIVE_ASSET_RESOLUTION':
        raise RuntimeError('Stage 3-2 is not current fresh official-installer evidence')
    source = evidence['source']
    if source.get('kind') != 'OFFICIAL_INSTALLER' or source.get('installVersion') != '1.1.113':
        raise RuntimeError('official installer authority changed')
    fixture = next(row for row in evidence.get('fixtures', []) if int(row.get('skinId', 0)) == 102)
    spine = fixture['spine']
    match = SOURCE_REF_RE.match(spine['sourceRef'])
    if not match:
        raise RuntimeError('Skin 102 Spine sourceRef is invalid')
    parts = match.groupdict()

    package_path = WORK / 'packages' / parts['package']
    bundle_path = WORK / 'bundles' / parts['bundle']
    download(f"{source['base'].rstrip('/')}/{parts['package']}", package_path)
    physical_entry = extract_bundle(package_path, parts['bundle'], bundle_path)
    env = UnityPy.load(str(bundle_path))
    local_objects = {int(getattr(obj, 'path_id', 0)): obj for obj in env.objects}

    prefab_matches = []
    for path, value in env.container.items():
        if norm(path) == norm(spine['resolvedPrefabPath']):
            prefab_matches.append((path, deref_container(value)))
    if len(prefab_matches) != 1:
        raise RuntimeError(f'prefab exact container matches != 1: {len(prefab_matches)}')
    prefab_path, prefab = prefab_matches[0]
    if sha256(prefab.get_raw_data()) != spine['sha256'].lower():
        raise RuntimeError('prefab hash differs from current Stage 3-2')

    # Follow prefab -> SkeletonAnimation component -> skeletonDataAsset by explicit PPtr field.
    _, prefab_refs = resolve_local_refs(prefab, local_objects)
    component_ids = [r['pathId'] for r in prefab_refs if r['fileId'] == 0 and r['pathId'] in local_objects]
    skeleton_component = None
    skeleton_data = None
    skeleton_data_ref = None
    for component_id in component_ids:
        component = local_objects[component_id]
        component_tree, refs = resolve_local_refs(component, local_objects)
        for ref in refs:
            if ref['fieldPath'].endswith('.skeletonDataAsset') and ref['fileId'] == 0 and ref['pathId'] in local_objects:
                skeleton_component = component
                skeleton_data = local_objects[ref['pathId']]
                skeleton_data_ref = ref
                break
        if skeleton_data is not None:
            break
    if skeleton_data is None:
        raise RuntimeError('explicit skeletonDataAsset PPtr not found from current prefab')

    skeleton_tree, skeleton_refs = resolve_local_refs(skeleton_data, local_objects)
    # Direct targets from SkeletonDataAsset. These should include skeleton binary and atlas asset(s).
    skeleton_targets = []
    for ref in skeleton_refs:
        if ref['fileId'] == 0 and ref['pathId'] in local_objects and ref['pathId'] != 0:
            target = local_objects[ref['pathId']]
            skeleton_targets.append((ref, target))

    # Expand one more explicit PPtr hop from atlas/material objects only.
    expanded = {}
    for ref, target in skeleton_targets:
        target_tree, target_refs = resolve_local_refs(target, local_objects)
        expanded[int(getattr(target, 'path_id', 0))] = {
            'type': getattr(getattr(target, 'type', None), 'name', None),
            'name': object_name(target_tree),
            'containerPaths': container_paths_for(env, target),
            'refs': target_refs,
        }
        for child_ref in target_refs:
            if child_ref['fileId'] == 0 and child_ref['pathId'] in local_objects and child_ref['pathId'] != 0:
                child = local_objects[child_ref['pathId']]
                child_tree, child_refs = resolve_local_refs(child, local_objects)
                expanded.setdefault(int(getattr(child, 'path_id', 0)), {
                    'type': getattr(getattr(child, 'type', None), 'name', None),
                    'name': object_name(child_tree),
                    'containerPaths': container_paths_for(env, child),
                    'refs': child_refs,
                })

    RAW.mkdir(parents=True, exist_ok=True)
    exported = []
    skel_payload = None
    for path_id, meta in sorted(expanded.items()):
        obj = local_objects[path_id]
        type_name = meta['type']
        name = meta['name'] or f'path-{path_id}'
        clean = re.sub(r'[^A-Za-z0-9._-]+', '_', name)
        if type_name == 'TextAsset':
            payload = textasset_bytes(obj)
            lower_name = name.lower()
            suffix = '.bin'
            if '.atlas' in lower_name:
                suffix = '.atlas.txt'
            elif '.skel' in lower_name:
                suffix = '.skel.bytes'
                skel_payload = payload
            target = RAW / f'{path_id}-{clean}{suffix}'
            target.write_bytes(payload)
            exported.append({
                'pathId': path_id,
                'type': type_name,
                'name': name,
                'containerPaths': meta['containerPaths'],
                'file': target.as_posix(),
                'sizeBytes': len(payload),
                'sha256': sha256(payload),
            })
        elif type_name == 'Texture2D':
            data = obj.read()
            image = data.image
            target = RAW / f'{path_id}-{clean}.png'
            image.save(target)
            payload = target.read_bytes()
            exported.append({
                'pathId': path_id,
                'type': type_name,
                'name': name,
                'containerPaths': meta['containerPaths'],
                'file': target.as_posix(),
                'sizeBytes': len(payload),
                'sha256': sha256(payload),
                'width': image.width,
                'height': image.height,
            })

    if skel_payload is None:
        raise RuntimeError('no .skel TextAsset reached from current SkeletonDataAsset chain')
    header = detect_spine_header(skel_payload)
    if not header.get('version'):
        raise RuntimeError(f'failed to detect Spine version: {header}')

    result = {
        'schemaVersion': 1,
        'stage': 'skin-page-3',
        'substage': 'FULLART-0-spine-source',
        'status': 'PASS_CURRENT_SPINE_SOURCE_CHAIN',
        'skinId': 102,
        'guardrails': {
            'historicalRecordUsedAsEvidence': False,
            'historicalArtifactImported': False,
            'currentStage3_2Only': True,
            'officialInstallerDirectRead': True,
            'scopeSkinCount': 1,
            'nameJoin': False,
            'idArithmetic': False,
        },
        'authority': {
            'stage3_2EvidencePath': EVIDENCE.as_posix(),
            'stage3_2EvidenceSha256': sha256(EVIDENCE.read_bytes()),
            'installVersion': source['installVersion'],
            'package': parts['package'],
            'bundle': parts['bundle'],
            'physicalBundleEntry': physical_entry,
            'prefabRuntimePath': prefab_path,
            'prefabSerializedSha256': sha256(prefab.get_raw_data()),
        },
        'chain': {
            'prefabPathId': int(getattr(prefab, 'path_id', 0)),
            'skeletonAnimationComponentPathId': int(getattr(skeleton_component, 'path_id', 0)),
            'skeletonDataAssetRef': skeleton_data_ref,
            'skeletonDataAssetPathId': int(getattr(skeleton_data, 'path_id', 0)),
            'skeletonDataAssetName': object_name(skeleton_tree),
            'skeletonDataAssetContainerPaths': container_paths_for(env, skeleton_data),
            'skeletonDataAssetDirectRefs': skeleton_refs,
            'expandedObjects': expanded,
        },
        'spineBinaryHeader': header,
        'exports': exported,
        'decision': 'READY_FOR_VERSION_MATCHED_SPINE_RUNTIME_RENDER',
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({
        'status': result['status'],
        'spineVersion': header['version'],
        'exportCount': len(exported),
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
