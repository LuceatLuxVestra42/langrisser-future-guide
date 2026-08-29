import collections
import json
import os
import pathlib

DATA_DIR = pathlib.Path('data/generated/hero-detail/by-id')
OUT_DIR = pathlib.Path(os.environ.get('RUNNER_TEMP', '.')) / 'langrisser-hero-artwork-family-census' / 'report'
OUT_DIR.mkdir(parents=True, exist_ok=True)

files = sorted(DATA_DIR.glob('*.json'), key=lambda p: int(p.stem))
rows = []
missing = []
anomalies = []
family_counts = collections.Counter()
root_counts = collections.Counter()

for path in files:
    data = json.loads(path.read_text(encoding='utf-8'))
    hero_id = data.get('heroId')
    identity = data.get('identity') or {}
    source = (((data.get('presentation') or {}).get('artwork') or {}).get('sourceAssetPath'))
    if not source:
        missing.append({'heroId': hero_id, 'file': str(path)})
        continue
    normalized = str(source).replace('\\', '/').strip('/')
    marker = '/Prefab/'
    if marker in normalized:
        family = normalized.split(marker, 1)[0] + '/Prefab'
    else:
        family = normalized.rsplit('/', 1)[0] if '/' in normalized else normalized
        anomalies.append({'heroId': hero_id, 'sourceAssetPath': source, 'derivedFamily': family, 'reason': 'NO_PREFAB_SEGMENT'})
    parts = normalized.split('/')
    root_family = '/'.join(parts[:3]) if len(parts) >= 3 else normalized
    family_counts[family] += 1
    root_counts[root_family] += 1
    rows.append({
        'heroId': hero_id,
        'nameKr': identity.get('nameKr'),
        'nameCn': identity.get('nameCn'),
        'nameEn': identity.get('nameEn'),
        'sourceAssetPath': source,
        'family': family,
        'rootFamily': root_family,
    })

families = [
    {'family': family, 'heroCount': count}
    for family, count in sorted(family_counts.items(), key=lambda kv: (-kv[1], kv[0].lower()))
]
root_families = [
    {'rootFamily': family, 'heroCount': count}
    for family, count in sorted(root_counts.items(), key=lambda kv: (-kv[1], kv[0].lower()))
]

summary = {
    'status': 'H_A3_FAMILY_CENSUS_COMPLETE' if len(files) == 267 and len(rows) == 267 and not missing else 'H_A3_FAMILY_CENSUS_INCOMPLETE',
    'inputDirectory': str(DATA_DIR),
    'inputJsonCount': len(files),
    'heroArtworkPathCount': len(rows),
    'missingArtworkPathCount': len(missing),
    'familyDefinition': 'normalized sourceAssetPath directory prefix through /Prefab; e.g. UI/HeroPainting/SSR_ABS/Prefab',
    'distinctFamilyCount': len(families),
    'families': families,
    'rootFamilyDefinition': 'first three normalized path segments; diagnostic only, not the operative extraction family',
    'distinctRootFamilyCount': len(root_families),
    'rootFamilies': root_families,
    'nonPrefabPathCount': len(anomalies),
    'nonPrefabPaths': anomalies,
}

(OUT_DIR / 'hero-artwork-family-census.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
(OUT_DIR / 'hero-artwork-family-members.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
(OUT_DIR / 'hero-artwork-family-census.txt').write_text(
    '\n'.join([
        f"status={summary['status']}",
        f"inputJsonCount={summary['inputJsonCount']}",
        f"heroArtworkPathCount={summary['heroArtworkPathCount']}",
        f"missingArtworkPathCount={summary['missingArtworkPathCount']}",
        f"distinctFamilyCount={summary['distinctFamilyCount']}",
        f"nonPrefabPathCount={summary['nonPrefabPathCount']}",
        '',
        *[f"{x['heroCount']:3d}  {x['family']}" for x in families],
    ]) + '\n',
    encoding='utf-8',
)

print(json.dumps(summary, ensure_ascii=True))
if summary['status'] != 'H_A3_FAMILY_CENSUS_COMPLETE':
    raise SystemExit(2)
