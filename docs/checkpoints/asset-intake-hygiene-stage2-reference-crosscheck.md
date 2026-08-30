# Asset Hygiene Stage 2 — Reference / Evidence Cross-check

기준일: 2026-08-30

상태: `PASS_ASSET_HYGIENE_STAGE2_REFERENCE_CROSSCHECK / COMPLETE`

freeze: `ASSET_HYGIENE_STAGE2_REFERENCE_MAP_FROZEN`

## 1. predecessor

- AH-1 inventory: `tools/asset-intake/hygiene/generated/asset-hygiene-inventory.v1.json`
- AH-2 source freeze: `tools/asset-intake/hygiene/generated/asset-hygiene-stage2-reference-sources.v1.json`
- physical inventory records: 2188

AH-1 inventory를 재생성하지 않고 2,188개 record를 그대로 reference-map population으로 사용했다.

## 2. reference 결과

```text
inventory records        2188
reference-map records    2188
assets with references   1731
assets without refs      457
reference edges          3793
unresolved references    0
hard errors              0
```

reference가 0개인 파일은 AH-2 오류나 UNUSED 판정이 아니다. AH-3의 UNREFERENCED/PROVENANCE 검토 입력일 뿐이다.

## 3. domain collector

- Soldier: v9 PNG source + lossless WebP delivery + current resolver
- Banner: frozen Stage 3-1 exact repository relation + current generated consumers
- Hero: current Stage 4 artwork consumer + H-A6 hash evidence + card-icon PNG/WebP chain
- Equipment: frozen Stage 2 public-plan targetRepositoryPaths + current resolver
- Faction: frozen 12-record localAssetPath manifest + current fusion consumer
- Army: frozen 10-record filename/publicRoot manifest + current resolver
- current frontend static references: tracked `src/**` text files의 exact image literals만 수집
- Skin: authoritative bytes/evidence 부재 상태를 그대로 보존하며 물리 path를 발명하지 않음

## 4. reference kinds

- `ACTIVE_PRODUCTION_REF`: 1304
- `DERIVATIVE_REF`: 491
- `FRONTEND_REF`: 17
- `MANIFEST_REF`: 1141
- `SOURCE_EVIDENCE_REF`: 840

## 5. REVIEW / BLOCKER

REVIEW:
1. `ZERO_CURRENT_REFERENCE_ASSETS_PRESENT` — 457
2. `SOLDIER_REGISTRY_SUPPLEMENTAL_MANIFEST_POINTER_LAGS_CURRENT_RESOLVER_CHAIN` — 1

BLOCKER:
- 없음

## 6. 하지 않은 것

```text
classification
ACTIVE_VERIFIED primaryClass 확정
UNREFERENCED primaryClass 확정
PROVENANCE_UNKNOWN 판정
SUPERSEDED 판정
resolver collision 판정
delete / move / rename
asset conversion
frontend rewrite
raw ConfigData read
semantic recomputation
```

## 7. 다음 시작점

`ASSET_HYGIENE_3_CLASSIFICATION`

AH-3는 이 frozen reference map과 AH-1 duplicate/basename flags를 입력으로 primaryClass + flags + review queue를 생성한다.

## 8. 다시 열리는 조건

- AH-1 physical baseline migration
- Active Source Registry selection 변경
- current manifest/resolver/consumer contract 변경
- reference-map structural parity 파손
- exact-path collector가 현재 source를 표현할 수 없는 실제 사례 발견

## 9. 판정

```text
PASS_ASSET_HYGIENE_STAGE2_REFERENCE_CROSSCHECK
COMPLETE
ASSET_HYGIENE_STAGE2_REFERENCE_MAP_FROZEN
hard error: 0
blocker: 0
next: AH-3 classification
```
