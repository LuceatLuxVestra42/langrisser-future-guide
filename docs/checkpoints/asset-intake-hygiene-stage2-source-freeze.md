# Asset Hygiene Stage 2 — Current Reference Source Freeze

기준일: 2026-08-30

상태: `PASS_ASSET_HYGIENE_STAGE2_SOURCE_FREEZE / COMPLETE`

전체 AH-2 상태: `IN_PROGRESS`

## 1. authoritative predecessor

- AH-1 frozen inventory: `tools/asset-intake/hygiene/generated/asset-hygiene-inventory.v1.json`
- physical baseline commit: `73db96444d2016d044042630955486fd9b3d9036`
- physical baseline tree: `f19194edbf6e71f1c3d6fcf0ccabb0b9c6474df8`
- inventory records: `2188`
- AH-2 contract: `tools/asset-intake/contract/hygiene-stage2-reference-crosscheck.v1.json`

AH-1 physical inventory는 재생성하지 않았다.

## 2. current reference baseline

- main commit: `f5e828e6f163dc70e0ead7a912acd5dcf6467bc2`
- Active Source Registry: `data/generated/project-doctor-active-source-registry.v1.json`
- Registry blob: `43d6c70ad87b45d27582da84c059dfac8b6998b7`
- selected domains: `6`

AH-2 source authority는 filename, Stage 번호, timestamp로 재추론하지 않고 Registry가 선택한 current source와 실제 current resolver/consumer chain을 함께 읽는다.

## 3. asset delta gate

`73db964...` physical baseline에서 current reference baseline까지 tracked image asset population 변경은 확인되지 않았다.

최종 main 전진 `3f5ac26... -> f5e828e...`는 `.github/workflows/project-doctor-authoritative-pages-deploy.yml`의 Equipment prerender admission correction만 포함하며 tracked image asset 또는 Active Source Registry를 변경하지 않는다.

따라서:

```text
PASS_NO_TRACKED_IMAGE_ASSET_DELTA
changed image asset path: 0
AH-1 inventory reuse: YES
baseline migration: NO
```

## 4. current domain authority freeze

- Hero: `data/validation/hero-stage6-4-final.v1.json`
- Soldier: `data/validation/soldier-stage6-7-site-admission.v1.json`
- Equipment: `data/validation/equipment-public-presentation-correction-final.v1.json`
- Hero-Soldier: `data/validation/hero-soldier-integration-stageC-final.v1.json`
- Banner: `data/validation/banner-stage3-8-regression-freeze-summary.v1.json`
- Skin: `data/validation/skin-stage3-2-readiness.v1.json`

Equipment는 Registry successor인 `equipment-public-presentation-correction-final`을 사용하며 과거 `equipment-stage4-final`을 current authority로 되돌리지 않는다.

## 5. Soldier fixture

current production asset chain:

```text
src/lib/soldier-portrait-assets.ts
  -> data/generated/soldier-portrait-web-manifest.v1.json
  -> data/generated/soldier-portrait-manifest.v9.json

source root   public/images/soldiers          224
web root      public/images/soldiers-webp     224
AH-1 counts                                  224 / 224
```

Web manifest는 source PNG 보존, lossless WebP, decoded pixel exact, dimensions preserved를 명시한다.

따라서 AH-2 reference map에서 PNG와 WebP를 동일한 단일 status로 덮어쓰지 않고 source/evidence edge와 derivative/production edge를 분리한다.

REVIEW:
- Registry의 Soldier portrait coverage supplemental validation은 manifest v8을 이름으로 보존하고 있다.
- 실제 current frontend resolver는 WebP manifest -> v9 PNG source chain을 사용한다.
- 이는 current resolver chain을 막는 구조 오류가 아니며 AH-2 reference collection에서 exact current chain을 우선 기록한다.

## 6. Banner fixture

frozen Banner asset relation:

```text
public/images/banners/Banner          237
public/images/banners/Picture_Notice  264
total                                 501
AH-1 banner root count                501
resolved occurrences                   93
unique resolved repository paths       70
missing referenced file                 0
ambiguous referenced file               0
```

lookup rule은 occurrence의 `display.imageType`이 선택한 root 내부의 exact basename이며 cross-root fallback, filename similarity, perceptual equivalence는 금지되어 있다.

대표 asset record가 `repositoryPaths[]`와 content SHA-256을 직접 보유하는 구조도 확인했다.

## 7. Skin boundary

Skin current source는 여전히:

```text
READY_FOR_ASSET_EVIDENCE
ASSET_BYTES_OR_AUTHENTIC_RESOLUTION_EVIDENCE_NOT_AVAILABLE_IN_REPOSITORY
```

이다.

따라서 AH-2는 이를 broken asset, `UNVERIFIED_EXTERNAL`, `UNREFERENCED` 또는 provenance failure로 승격하지 않는다. Stage 3-1 population을 다시 계산하지도 않는다.

## 8. 하지 않은 것

```text
asset delete / move / rename
format conversion
frontend rewrite
external fetch
raw ConfigData read
semantic recomputation
canonical relation recomputation
classification
UNREFERENCED 판정
PROVENANCE_UNKNOWN 판정
SUPERSEDED 판정
resolver collision 판정
```

## 9. REVIEW / BLOCKER

REVIEW:
1. `SOLDIER_REGISTRY_SUPPLEMENTAL_MANIFEST_POINTER_LAGS_CURRENT_RESOLVER_CHAIN`
   - non-blocking
   - current resolver chain은 별도 exact evidence로 확정됨

BLOCKER:
- 없음

## 10. 완료 범위

완료:
- latest-main reference baseline freeze
- frozen AH-1 inventory reuse gate
- Active Source Registry current source freeze
- Soldier source/derivative/resolver fixture
- Banner root/count/exact-path relation fixture
- Skin upstream pending-state preservation

미완료:
- 2188 inventory record 전체 reference edge 수집
- unresolved-reference artifact
- Hero/Equipment/shared/factions/army exact-path collector 확대
- full reference-map structural validation
- AH-2 final closeout

## 11. 다음 시작점

`ASSET_HYGIENE_2_REFERENCE_MAP_COLLECTION`

Soldier와 Banner에서 확정한 exact-path 규칙을 기준으로 domain별 collector를 확대한다. AH-1 inventory는 다시 scan하지 않는다.

## 12. 다시 열리는 조건

- tracked image asset population 변경
- Active Source Registry selection 변경
- current asset resolver 또는 production manifest 변경
- Soldier source/derivative contract 변경
- Banner asset relation contract 변경
- Skin authoritative asset evidence 상태 변경
- AH-2 reference contract 변경

## 13. 판정

```text
PASS_ASSET_HYGIENE_STAGE2_SOURCE_FREEZE
COMPLETE
AH-2 overall: IN_PROGRESS
hard error: 0
blocker: 0
next: ASSET_HYGIENE_2_REFERENCE_MAP_COLLECTION
```
