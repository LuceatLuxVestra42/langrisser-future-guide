#!/usr/bin/env python3
import hashlib
import json
import re
import urllib.request
import zipfile
from pathlib import Path

import UnityPy

EVIDENCE = Path('data/evidence/skin-stage3-2-asset-resolution-evidence.v1.json')
OUT = Path('data/evidence/skin-fullart0-current-probe.v1.json')
WORK = Path('.skin-fullart0-current')
CANDIDATES = WORK / 'candidates'
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
    req = urllib.request.Request(url, headers={'User-Agent': 'langrisser-future-guide-fullart0/1.0'})
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
        keys = set(value)
        if 'm_FileID' in keys and 'm_PathID' in keys:
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


def deref_container(value):
    method = getattr(value, 'deref', None)
    return method() if callable(method) else value


def save_candidate(obj, type_name, path_id, label):
    CANDIDATES.mkdir(parents=True, exist_ok=True)
    try:
        data = obj.read()
        image = getattr(data, 'image', None)
        if image is None:
            return None
        clean = re.sub(r'[^A-Za-z0-9._-]+', '_', label or 'unnamed')[:100]
        target = CANDIDATES / f'{type_name}-{path_id}-{clean}.png'
        image.save(target)
        raw = target.read_bytes()
        return {
            'path': target.as_posix(),
            'sizeBytes': len(raw),
            'sha256': sha256(raw),
            'width': image.width,
            'height': image.height,
        }
    except Exception as exc:
        return {'error': str(exc)}


def main():
    evidence = json.loads(EVIDENCE.read_text(encoding='utf-8'))
    if evidence.get('evidenceClass') != 'FRESH_OFFICIAL_INSTALLER_REPRESENTATIVE_ASSET_RESOLUTION':
        raise RuntimeError('Stage 3-2 is not current fresh official-installer evidence')
    source = evidence['source']
    if source.get('kind') != 'OFFICIAL_INSTALLER' or source.get('installVersion') != '1.1.113':
        raise RuntimeError('official installer authority changed')
    fixture = next((row for row in evidence.get('fixtures', []) if int(row.get('skinId', 0)) == 102), None)
    if fixture is None:
        raise RuntimeError('Skin 102 fixture missing from current Stage 3-2')
    spine = fixture.get('spine') or {}
    if spine.get('resolved') is not True or spine.get('objectType') != 'GameObject':
        raise RuntimeError('Skin 102 current Spine prefab is not exact resolved GameObject evidence')
    match = SOURCE_REF_RE.match(spine.get('sourceRef', ''))
    if not match:
        raise RuntimeError('Skin 102 Spine sourceRef is not an official-install locator')
    parts = match.groupdict()
    if parts['version'] != source['installVersion'] or norm(parts['runtime']) != norm(spine['resolvedPrefabPath']):
        raise RuntimeError('Skin 102 Spine sourceRef disagrees with current Stage 3-2')

    package_path = WORK / 'packages' / parts['package']
    bundle_path = WORK / 'bundles' / parts['bundle']
    download(f"{source['base'].rstrip('/')}/{parts['package']}", package_path)
    physical_entry = extract_bundle(package_path, parts['bundle'], bundle_path)
    env = UnityPy.load(str(bundle_path))

    container_matches = []
    prefab_obj = None
    for container_path, value in env.container.items():
        if norm(container_path) == norm(spine['resolvedPrefabPath']):
            obj = deref_container(value)
            container_matches.append(container_path)
            prefab_obj = obj
    if len(container_matches) != 1 or prefab_obj is None:
        raise RuntimeError(f'exact prefab container match count != 1: {len(container_matches)}')

    prefab_tree = safe_tree(prefab_obj)
    direct_pptrs = collect_pptrs(prefab_tree)
    local_objects = {int(getattr(obj, 'path_id', 0)): obj for obj in env.objects}
    resolved_direct = []
    probe_path_ids = {int(getattr(prefab_obj, 'path_id', 0))}
    for ref in direct_pptrs:
        row = dict(ref)
        if ref['fileId'] == 0 and ref['pathId'] in local_objects:
            target = local_objects[ref['pathId']]
            target_tree = safe_tree(target)
            row['resolvedType'] = getattr(getattr(target, 'type', None), 'name', None)
            row['resolvedName'] = object_name(target_tree)
            probe_path_ids.add(ref['pathId'])
        resolved_direct.append(row)

    component_refs = []
    second_order = []
    for path_id in sorted(probe_path_ids):
        obj = local_objects.get(path_id)
        if obj is None:
            continue
        tree = safe_tree(obj)
        refs = collect_pptrs(tree)
        component_refs.append({
            'pathId': path_id,
            'type': getattr(getattr(obj, 'type', None), 'name', None),
            'name': object_name(tree),
            'referenceCount': len(refs),
            'references': refs,
        })
        for ref in refs:
            key = (ref['fileId'], ref['pathId'])
            second_order.append(key)

    interesting_ids = {path_id for file_id, path_id in second_order if file_id == 0 and path_id in local_objects}
    inventory = []
    exports = []
    for obj in env.objects:
        path_id = int(getattr(obj, 'path_id', 0))
        type_name = getattr(getattr(obj, 'type', None), 'name', None)
        tree = safe_tree(obj)
        name = object_name(tree)
        container_paths = []
        for container_path, value in env.container.items():
            try:
                if int(getattr(deref_container(value), 'path_id', 0)) == path_id:
                    container_paths.append(container_path)
            except Exception:
                pass
        text = ' '.join([str(name or ''), ' '.join(container_paths)]).lower()
        relevant_by_name = ('mathew' in text or 'skin01' in text or 'skin_01' in text or 'skin1' in text)
        relevant = path_id in interesting_ids or path_id in probe_path_ids or relevant_by_name
        if relevant or type_name in ('Texture2D', 'Sprite', 'TextAsset'):
            inventory.append({
                'pathId': path_id,
                'type': type_name,
                'name': name,
                'containerPaths': container_paths,
                'directOrSecondOrderRelevant': relevant,
                'serializedSizeBytes': len(obj.get_raw_data()),
                'serializedSha256': sha256(obj.get_raw_data()),
            })
        if type_name in ('Texture2D', 'Sprite') and (relevant or relevant_by_name):
            exported = save_candidate(obj, type_name, path_id, name or (container_paths[0] if container_paths else 'unnamed'))
            if exported:
                exports.append({
                    'pathId': path_id,
                    'type': type_name,
                    'name': name,
                    'containerPaths': container_paths,
                    'export': exported,
                })

    external_refs = sorted({(ref['fileId'], ref['pathId']) for row in component_refs for ref in row['references'] if ref['fileId'] != 0})
    result = {
        'schemaVersion': 1,
        'stage': 'skin-page-3',
        'substage': 'FULLART-0-current-probe',
        'status': 'GENERATED_CURRENT_ONLY_PROBE',
        'skinId': 102,
        'guardrails': {
            'historicalRecordUsedAsEvidence': False,
            'historicalArtifactImported': False,
            'currentStage3_2Only': True,
            'officialInstallerDirectRead': True,
            'populationScan': False,
            'scopeSkinCount': 1,
        },
        'authority': {
            'stage3_2EvidencePath': EVIDENCE.as_posix(),
            'stage3_2EvidenceSha256': sha256(EVIDENCE.read_bytes()),
            'installVersion': source['installVersion'],
            'package': parts['package'],
            'bundle': parts['bundle'],
            'physicalBundleEntry': physical_entry,
            'prefabRuntimePath': spine['resolvedPrefabPath'],
            'prefabSerializedSizeBytes': spine['sizeBytes'],
            'prefabSerializedSha256Expected': spine['sha256'],
            'prefabSerializedSha256Actual': sha256(prefab_obj.get_raw_data()),
        },
        'prefab': {
            'containerMatchCount': len(container_matches),
            'containerPath': container_matches[0],
            'pathId': int(getattr(prefab_obj, 'path_id', 0)),
            'directReferences': resolved_direct,
        },
        'componentReferenceInspection': component_refs,
        'externalReferences': [{'fileId': file_id, 'pathId': path_id} for file_id, path_id in external_refs],
        'objectInventory': inventory,
        'candidateExports': exports,
        'decision': 'UNDECIDED_REQUIRES_CURRENT_CANDIDATE_REVIEW',
    }
    if result['authority']['prefabSerializedSha256Actual'] != spine['sha256'].lower():
        raise RuntimeError('current prefab serialized hash mismatch')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({
        'status': result['status'],
        'inventoryCount': len(inventory),
        'candidateExportCount': len(exports),
        'externalReferenceCount': len(external_refs),
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
