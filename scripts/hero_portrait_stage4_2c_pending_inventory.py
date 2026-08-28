#!/usr/bin/env python3
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(rel):
    with (ROOT / rel).open('r', encoding='utf-8') as f:
        return json.load(f)


def records(obj):
    if isinstance(obj, list):
        return obj
    if not isinstance(obj, dict):
        return []
    for key in ('records', 'Records', 'data', 'Data', 'items', 'Items'):
        value = obj.get(key)
        if isinstance(value, list):
            return value
    vals = list(obj.values())
    if vals and all(isinstance(v, dict) for v in vals):
        return vals
    return []


def id_of(rec):
    for key in ('ID', 'Id', 'id', 'heroId'):
        value = rec.get(key)
        if isinstance(value, int):
            return value
    return None


def stem(path):
    if not isinstance(path, str) or not path:
        return None
    name = path.replace('\\', '/').rsplit('/', 1)[-1]
    lower = name.lower()
    if lower.endswith('.prefab'):
        name = name[:-7]
    for suffix in ('_Prefab', '_prefab'):
        if name.endswith(suffix):
            name = name[:-len(suffix)]
    return name


hero_list = load('data/generated/hero-list-stage1.v1.json')
admission = load('data/generated/hero-portrait-stage4-2b-237-admission.v1.json')
hero_info = load('data/configdata/ConfigDataHeroInfo.json')
char_info = load('data/configdata/ConfigDataCharImageInfo.json')
skins = load('data/generated/skin-stage1-canonical.v1.json')
model_probe = load('data/validation/hero-portrait-stage4-2b-model-bridge-probe.v1.json')
role_probe = load('data/validation/hero-portrait-stage4-2b-base-role-probe.v1.json')

canonical_records = hero_list['records']
canonical_by_id = {r['heroId']: r for r in canonical_records}
admitted_ids = {r['heroId'] for r in admission['records']}
pending_ids = sorted(set(canonical_by_id) - admitted_ids)

hero_info_by_id = {id_of(r): r for r in records(hero_info) if id_of(r) is not None}
char_info_by_id = {id_of(r): r for r in records(char_info) if id_of(r) is not None}

skins_by_hero = defaultdict(list)
for r in skins.get('records', []):
    skins_by_hero[r.get('heroId')].append(r)

model_diag = model_probe.get('pendingHeroModelDiagnostics', {})
multiple_role_ids = {
    r.get('heroId')
    for r in role_probe.get('records', [])
    if r.get('result') == 'MULTIPLE_EXACT_BASE_RUNTIME_ROLE_CANDIDATES'
}
unique_model_ids = set()
for r in model_probe.get('records', []):
    if r.get('result') == 'UNIQUE_PENDING_MODEL_MATCH':
        for hit in r.get('pendingModelMatches', []):
            if isinstance(hit.get('heroId'), int):
                unique_model_ids.add(hit['heroId'])

out_records = []
for hero_id in pending_ids:
    canon = canonical_by_id[hero_id]
    hi = hero_info_by_id.get(hero_id, {})
    char_id = hi.get('CharImage_ID')
    ci = char_info_by_id.get(char_id, {}) if isinstance(char_id, int) else {}
    skin_rows = skins_by_hero.get(hero_id, [])
    model = model_diag.get(str(hero_id), model_diag.get(hero_id, {})) or {}

    if hero_id in multiple_role_ids:
        prior_state = 'MULTIPLE_EXACT_BASE_RUNTIME_ROLE_CASE'
    elif hero_id == 122:
        prior_state = 'KNOWN_OWNERSHIP_NO_STAGE3_PNG'
    elif hero_id in unique_model_ids:
        prior_state = 'MODEL_BRIDGE_UNIQUE_STRUCTURED_GROUP'
    elif 99265 <= hero_id <= 99287:
        prior_state = 'LEGACY_DRIVE_INDEX_GAP_COHORT_OBSERVATION'
    else:
        prior_state = 'PENDING_OTHER'

    skin_assets = []
    for s in skin_rows:
        assets = s.get('assets') or {}
        skin_assets.append({
            'skinId': s.get('skinId'),
            'sourceOrder': s.get('sourceOrder'),
            'sourceImagePath': assets.get('sourceImagePath'),
            'sourceSpinePath': assets.get('sourceSpinePath'),
            'sourceSpineStem': stem(assets.get('sourceSpinePath')),
        })

    out_records.append({
        'heroId': hero_id,
        'identity': canon.get('identity'),
        'rarity': canon.get('rarity'),
        'priorState': prior_state,
        'charImageId': char_id,
        'heroPaintingPath': ci.get('HeroPainting'),
        'heroPaintingStem': stem(ci.get('HeroPainting')),
        'baseSpinePath': ci.get('Spine'),
        'baseSpineStem': stem(ci.get('Spine')),
        'skinCount': len(skin_assets),
        'skinAssets': skin_assets,
        'modelTokens': model.get('modelTokens', []),
        'rawModelStrings': model.get('rawModelStrings', []),
    })

summary = {
    'canonicalHeroCount': len(canonical_records),
    'admittedSourceCountFrozen': len(admitted_ids),
    'pendingHeroCount': len(pending_ids),
    'pendingWithHeroInfo': sum(1 for r in out_records if hero_info_by_id.get(r['heroId'])),
    'pendingWithCharImageId': sum(1 for r in out_records if isinstance(r['charImageId'], int)),
    'pendingWithHeroPaintingPath': sum(1 for r in out_records if r['heroPaintingPath']),
    'pendingWithBaseSpinePath': sum(1 for r in out_records if r['baseSpinePath']),
    'pendingWithAnySkin': sum(1 for r in out_records if r['skinCount'] > 0),
    'pendingWithModelTokens': sum(1 for r in out_records if r['modelTokens']),
    'multipleExactBaseRuntimeRoleCount': sum(1 for r in out_records if r['priorState'] == 'MULTIPLE_EXACT_BASE_RUNTIME_ROLE_CASE'),
    'knownNoStage3PngCount': sum(1 for r in out_records if r['priorState'] == 'KNOWN_OWNERSHIP_NO_STAGE3_PNG'),
    'uniqueModelBridgeCount': sum(1 for r in out_records if r['priorState'] == 'MODEL_BRIDGE_UNIQUE_STRUCTURED_GROUP'),
    'legacyDriveGapCohortObservationCount': sum(1 for r in out_records if r['priorState'] == 'LEGACY_DRIVE_INDEX_GAP_COHORT_OBSERVATION'),
}

out = {
    'version': 1,
    'stage': 'hero-portrait-stage4-2c-current-unity-source-proof',
    'phase': 'PENDING_CURRENT_CONFIGDATA_ASSET_KEY_INVENTORY',
    'status': 'PASS' if len(pending_ids) == 30 else 'FAIL_COUNT_MISMATCH',
    'policy': {
        'inputAdmissionRegistry': 'data/generated/hero-portrait-stage4-2b-237-admission.v1.json',
        'frozenAdmissionReopened': False,
        'currentConfigDataOnlyForAssetKeys': True,
        'legacyDriveUsedAsSourceAuthority': False,
        'nameJoinAllowed': False,
        'heroJoin': 'canonical heroId -> ConfigDataHeroInfo.ID -> CharImage_ID -> ConfigDataCharImageInfo.ID',
        'legacyDriveGapCohortObservationIsNotSourceEvidence': True,
    },
    'summary': summary,
    'records': out_records,
}

out_path = ROOT / 'data/validation/hero-portrait-stage4-2c-pending-current-asset-key-inventory.v1.json'
out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
