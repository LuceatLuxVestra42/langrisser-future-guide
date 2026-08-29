import collections
import hashlib
import json
import pathlib
import re
import sys
import zipfile

if len(sys.argv) != 3:
    raise SystemExit('usage: finalize-hero-artwork-h-a5-index.py <bulk-v2.zip> <seven-resolve.zip>')

repo = pathlib.Path('.')
bulk_zip = pathlib.Path(sys.argv[1])
seven_zip = pathlib.Path(sys.argv[2])
out_root = repo / 'data/generated/hero-artwork-h-a5-index.v1'
out_root.mkdir(parents=True, exist_ok=True)
validation_path = repo / 'data/validation/hero-artwork-h-a5-final.v1.json'
checkpoint_path = repo / 'data/checkpoints/hero-artwork-h-a5.txt'


def read_json_from_zip(path, name):
    with zipfile.ZipFile(path) as zf:
        with zf.open(name) as f:
            return json.load(f)


bulk = read_json_from_zip(bulk_zip, 'hero-artwork-h-a5-index.json')
seven_doc = read_json_from_zip(seven_zip, 'hero-artwork-h-a5-seven-resolved.json')
seven = seven_doc['heroes']

expected_seven = {17, 42, 48, 54, 58, 66, 80}
if len(bulk) != 267 or len({r['heroId'] for r in bulk}) != 267:
    raise RuntimeError('bulk v2 index is not canonical 267 unique Heroes')
base_review = {r['heroId'] for r in bulk if r['status'] != 'PASS'}
if base_review != expected_seven:
    raise RuntimeError(f'bulk v2 review set drift: {sorted(base_review)}')
if seven_doc.get('status') != 'H_A5_SEVEN_EXTERNAL_DEPENDENCY_RESOLVED':
    raise RuntimeError(f'unexpected seven status: {seven_doc.get("status")}')
if {r['heroId'] for r in seven} != expected_seven or not all(r['status'] == 'PASS' for r in seven):
    raise RuntimeError('seven-Hero overlay mismatch')

by_id = {r['heroId']: r for r in bulk}
for s in seven:
    r = by_id[s['heroId']]
    # H-A4 extraction ownership remains the final bundle. The begin_ bundle below is
    # a Sprite dependency discovered through fileID=1, not a replacement prefab owner.
    r.update({
        'status': 'PASS',
        'selectionStatus': s['selectionStatus'],
        'prefabPathId': s['prefabPathId'],
        'spritePathId': s['spritePathId'],
        'texturePathIds': s['texturePathIds'],
        'width': s['width'],
        'height': s['height'],
        'pngSha256': s['pngSha256'],
        'rgbaSha256': s['rgbaSha256'],
        'targetWebPath': s['targetWebPath'],
        'dependencyBundleName': s['dependencyBundleName'],
        'dependencyBundleSha256': s['dependencyBundleSha256'],
        'externalFileId': s['externalFileId'],
    })

rows = sorted(by_id.values(), key=lambda r: r['heroId'])
required = [
    'heroId', 'sourceArtworkPath', 'layer', 'packageName', 'bundleName', 'bundleMd5',
    'bundleSha256', 'prefabPathId', 'spritePathId', 'texturePathIds', 'width', 'height',
    'pngSha256', 'rgbaSha256', 'targetWebPath', 'selectionStatus',
]
for r in rows:
    if r.get('status') != 'PASS':
        raise RuntimeError(f'Hero {r["heroId"]} is not PASS')
    missing = [k for k in required if k not in r or r[k] is None]
    if missing:
        raise RuntimeError(f'Hero {r["heroId"]} missing {missing}')
    if r['targetWebPath'] != f'public/images/heroes/cards/{r["heroId"]}.png':
        raise RuntimeError(f'Hero {r["heroId"]} web path drift')
    if not r['texturePathIds']:
        raise RuntimeError(f'Hero {r["heroId"]} has no Texture2D pathId')

selection_counts = collections.Counter(r['selectionStatus'] for r in rows)
expected_selection = {
    'UNIQUE_REFERENCED_SPRITE': 237,
    'DOMINANT_REFERENCED_SPRITE': 23,
    'EXTERNAL_DEPENDENCY_SPRITE_FILEID1': 7,
}
if dict(selection_counts) != expected_selection:
    raise RuntimeError(f'selection count drift: {dict(selection_counts)}')
layer_counts = collections.Counter(r['layer'] for r in rows)
if dict(layer_counts) != {'final': 240, 'begin': 27}:
    raise RuntimeError(f'ownership layer drift: {dict(layer_counts)}')
if len({r['targetWebPath'] for r in rows}) != 267:
    raise RuntimeError('target web path collision')
if len({r['sourceArtworkPath'].lower() for r in rows}) != 267:
    raise RuntimeError('canonical sourceArtworkPath collision')

# Keep records bundle-sharded because extraction/materialization operates bundle-by-bundle.
by_bundle = collections.defaultdict(list)
for r in rows:
    compact = {k: r.get(k) for k in [
        'heroId', 'nameKr', 'nameEn', 'sourceArtworkPath', 'family', 'layer',
        'packageName', 'bundleName', 'bundleMd5', 'bundleSha256', 'prefabPathId',
        'spritePathId', 'texturePathIds', 'width', 'height', 'pngSha256', 'rgbaSha256',
        'targetWebPath', 'selectionStatus',
    ]}
    if r.get('dependencyBundleName'):
        compact['dependencyBundleName'] = r['dependencyBundleName']
        compact['dependencyBundleSha256'] = r['dependencyBundleSha256']
        compact['externalFileId'] = r['externalFileId']
    by_bundle[r['bundleName']].append(compact)

bundle_entries = []
for bundle_name in sorted(by_bundle):
    filename = re.sub(r'[^a-z0-9_]+', '-', bundle_name.lower()).replace('.b', '') + '.json'
    path = out_root / filename
    doc = {
        'schemaVersion': 1,
        'status': 'H_A5_BUNDLE_SHARD_COMPLETE',
        'bundleName': bundle_name,
        'heroCount': len(by_bundle[bundle_name]),
        'heroes': sorted(by_bundle[bundle_name], key=lambda r: r['heroId']),
    }
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    digest = hashlib.sha256(path.read_bytes()).hexdigest().upper()
    bundle_entries.append({
        'bundleName': bundle_name,
        'heroCount': len(by_bundle[bundle_name]),
        'path': path.as_posix(),
        'sha256': digest,
    })

manifest = {
    'schemaVersion': 1,
    'status': 'H_A5_BULK_EXTRACTION_INDEX_COMPLETE',
    'installVersion': '1.1.113',
    'canonicalHeroCount': 267,
    'ownershipInput': 'H_A4_BUNDLE_OWNERSHIP_RESOLVED',
    'finalOwnershipCount': 240,
    'beginOwnershipCount': 27,
    'owningBundleCount': len(bundle_entries),
    'indexLayout': 'bundle-sharded',
    'selectionCounts': dict(selection_counts),
    'targetWebContract': 'public/images/heroes/cards/{heroId}.png',
    'binaryCommitPerformed': False,
    'sourceEvidence': {
        'bulkV2RunId': 33229409769,
        'bulkV2ArtifactId': 9707998242,
        'bulkV2ArtifactZipSha256': 'F886686B93F1ACCBFF8D83127BBD7CA5A617A631FE7CB76A3D13F222FAE61A30',
        'sevenDiagnosticRunId': 33229565366,
        'sevenDiagnosticArtifactId': 9708038712,
        'sevenResolveRunId': 33229642787,
        'sevenResolveArtifactId': 9708066772,
        'sevenResolveArtifactZipSha256': 'E09536C0B5CDD7BF37469F3380DA68DFBFE2220417C804F1F15C39149FADA983',
    },
    'bundles': bundle_entries,
}
manifest_path = out_root / 'manifest.json'
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
manifest_sha = hashlib.sha256(manifest_path.read_bytes()).hexdigest().upper()

validation = {
    'status': 'PASS_H_A5_BULK_EXTRACTION_INDEX_FINAL',
    'canonicalHeroCount': 267,
    'indexedHeroCount': len(rows),
    'uniqueHeroCount': len({r['heroId'] for r in rows}),
    'uniqueSourceArtworkPathCount': len({r['sourceArtworkPath'].lower() for r in rows}),
    'uniqueTargetWebPathCount': len({r['targetWebPath'] for r in rows}),
    'finalOwnershipCount': layer_counts['final'],
    'beginOwnershipCount': layer_counts['begin'],
    'selectionCounts': dict(selection_counts),
    'owningBundleCount': len(bundle_entries),
    'missingRequiredFieldCount': 0,
    'unresolvedHeroCount': 0,
    'binaryCommitPerformed': False,
    'manifestPath': manifest_path.as_posix(),
    'manifestSha256': manifest_sha,
}
validation_path.parent.mkdir(parents=True, exist_ok=True)
validation_path.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

checkpoint = f'''Hero Artwork Asset Pipeline — H-A5 bulk extraction index checkpoint
기준일: 2026-08-29

============================================================
1. 최종 판정
============================================================

status: H_A5_BULK_EXTRACTION_INDEX_COMPLETE
validation: PASS_H_A5_BULK_EXTRACTION_INDEX_FINAL
canonical Hero: 267 / 267
unresolved: 0
owning bundle shard: {len(bundle_entries)}
H-A4 ownership: final 240 / begin 27 유지
web contract: public/images/heroes/cards/{{heroId}}.png
binary image commit: 아직 하지 않음

selection mode:
- UNIQUE_REFERENCED_SPRITE: 237
- DOMINANT_REFERENCED_SPRITE: 23
- EXTERNAL_DEPENDENCY_SPRITE_FILEID1: 7

============================================================
2. 입력 / 재사용 경계
============================================================

H-A4의 exact prefab extraction ownership을 그대로 재사용했다.
- FINAL_ONLY 240
- BEGIN_ONLY 27
- BOTH 0
- NONE 0

final/begin을 클라이언트 런타임 의미상 baseline/patch로 해석하지 않는다.
H-A5는 asset extraction provenance/index 계층이다.

대량 재실행 대신 이미 검증된 artifact를 재사용했다.
- bulk v2 run 33229409769 / artifact 9707998242
  - unique referenced Sprite 237
  - dominant referenced Sprite 23
  - review 7
- seven dependency diagnostic run 33229565366 / artifact 9708038712
- seven resolver run 33229642787 / artifact 9708066772
  - 7 / 7 PASS

============================================================
3. 7개 dependency 예외
============================================================

대상 Hero:
- 17 에그베르트
- 42 디오스
- 48 아론
- 54 리스틸
- 58 세레나
- 66 클라렛
- 80 칸자키 스미레

확정 chain:
exact final prefab
-> MonoBehaviour.m_Sprite PPtr (fileID=1)
-> final AssetBundle m_Dependencies[0]의 동일 family begin_ bundle
-> exact Sprite pathId
-> Sprite.m_RD.texture (fileID=0)
-> Texture2D

즉 7명은 prefab 소유권은 final이지만 Sprite image dependency는 begin_ bundle에 있다.
이 관계는 serialized PPtr와 AssetBundle dependency 직접 증거로 확정했으며 filename 유사도 선택을 사용하지 않았다.

============================================================
4. dominant Sprite 규칙
============================================================

23명은 prefab PPtr graph가 복수 Sprite를 참조했다.
filename으로 고르지 않고 rendered pixel area를 사용했다.

자동 선택 조건:
- 가장 큰 referenced image의 pixel area >= 250,000
- 동시에 두 번째 후보의 pixel area 대비 >= 3배

이 규칙을 통과한 23명만 DOMINANT_REFERENCED_SPRITE로 확정했다.
나머지는 자동 추정하지 않는 정책을 유지한다.

============================================================
5. 최종 index 구조
============================================================

manifest:
- data/generated/hero-artwork-h-a5-index.v1/manifest.json
- SHA256: {manifest_sha}

layout:
- owning bundle 기준 12 shard
- 각 Hero record에 heroId / sourceArtworkPath / owning package+bundle+hash / prefab pathId / Sprite pathId / Texture2D pathId / dimensions / PNG SHA256 / RGBA SHA256 / targetWebPath / selectionStatus 기록
- 7 dependency 예외는 dependencyBundleName / dependencyBundleSha256 / externalFileId 추가 기록

validation:
- data/validation/hero-artwork-h-a5-final.v1.json

============================================================
6. 다시 열지 않는 범위
============================================================

다음은 새 asset snapshot 또는 명확한 contradiction 없이는 재조사하지 않는다.
- canonical Hero 267 sourceArtworkPath census
- 7 family 구분
- H-A4 final 240 / begin 27 prefab ownership
- 12 owning bundle provenance
- Prefab -> Sprite -> Texture2D 기본 규칙
- 복수 referenced Sprite 23명의 dominant-area 선택 규칙
- 7명의 final prefab -> begin dependency Sprite 관계
- 267 target web path mapping

============================================================
7. 다음 시작점
============================================================

다음 단계는 index를 사용한 실제 이미지 materialization이다.

원칙:
1. bundle shard 단위로 처리한다.
2. index에 기록된 exact pathId만 사용한다.
3. filename similarity / name JOIN / sourceArtworkPath URL 추론을 하지 않는다.
4. PNG를 public/images/heroes/cards/{{heroId}}.png 계약에 맞춰 생성한다.
5. 생성 PNG hash가 index pngSha256와 일치하는지 검증한다.
6. 실제 binary commit과 frontend resolver 전환은 H-A5 index와 분리된 후속 단계로 처리한다.
'''
checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
checkpoint_path.write_text(checkpoint, encoding='utf-8')

print(json.dumps({
    'status': validation['status'],
    'indexedHeroCount': 267,
    'selectionCounts': dict(selection_counts),
    'owningBundleCount': len(bundle_entries),
    'manifestSha256': manifest_sha,
}, ensure_ascii=True))
