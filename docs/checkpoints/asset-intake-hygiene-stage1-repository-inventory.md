# Asset Hygiene Stage 1 — Repository Inventory

기준일: 2026-08-30

상태: `PASS_ASSET_HYGIENE_STAGE1_REPOSITORY_INVENTORY / COMPLETE`

freeze: `ASSET_HYGIENE_STAGE1_INVENTORY_FROZEN`

## 1. authoritative predecessor

- `tools/asset-intake/contract/hygiene-scope.v1.json`
- baseline commit: `73db96444d2016d044042630955486fd9b3d9036`
- baseline tree: `f19194edbf6e71f1c3d6fcf0ccabb0b9c6474df8`
- scope: `REPOSITORY_TRACKED_IMAGE_ASSETS_V1`

AH-0의 population을 변경하지 않고 그대로 물질화했다. current main이나 filename recency를 이용해 baseline을 silent migration하지 않았다.

## 2. 물리 census 결과

```text
tracked tree entries       4483
scoped regular candidates 2188
scoped symlink candidates 0
inventory records          2188
resolved byte records      2188
LFS pointer reviews        0
symlink reviews            0
total resolved asset bytes 310229467
exact duplicate groups     1
exact duplicate records    2
basename candidate groups  352
```

## 3. 산출물

- inventory: `tools/asset-intake/hygiene/generated/asset-hygiene-inventory.v1.json`
- exact duplicate groups: `tools/asset-intake/hygiene/generated/asset-hygiene-duplicate-groups.v1.json`
- basename groups: `tools/asset-intake/hygiene/generated/asset-hygiene-basename-groups.v1.json`
- validation summary: `data/validation/asset-intake-hygiene-stage1-inventory-summary.v1.json`

모든 generated inventory는 기존 Project Doctor D2 V5를 수정하지 않기 위해 이미 mapped된 `tools/asset-intake/**` surface 안에 둔다.

## 4. 계산한 것

- repository path / root / extension
- Git blob byte size
- 기존 Asset Intake engine의 signature / 지원 format dimension
- SHA-256
- exact-byte duplicate candidate group
- basename collision candidate group
- Git LFS pointer fail-closed review
- symlink non-follow review

## 5. 계산하지 않은 것

```text
ACTIVE_VERIFIED
EVIDENCE_ONLY
GENERATED_DERIVATIVE
SUPERSEDED
UNREFERENCED
PROVENANCE_UNKNOWN
production admission
delete/move/rename decision
reference/consumer cross-check
semantic relation recomputation
```

위 항목은 AH-2/AH-3 소유 범위다. exact duplicate와 basename collision은 물리 후보일 뿐 semantic identity 또는 resolver 오류 판정이 아니다.

## 6. REVIEW / BLOCKER

REVIEW:
1. `EXACT_DUPLICATE_CANDIDATES_PRESENT` — 1
2. `BASENAME_COLLISION_CANDIDATES_PRESENT` — 352
3. `NON_RASTER_OR_UNKNOWN_SIGNATURE_PRESENT` — 1

BLOCKER:
- 없음

발견된 duplicate/collision/LFS/symlink는 삭제 지시가 아니라 후속 cross-check 입력이다.

## 7. 완료 조건

- scoped regular candidate 100% inventory coverage
- unreadable blob 0
- Git tree byte-size mismatch 0
- duplicate group parity PASS
- basename group parity PASS
- asset mutation 0
- semantic recomputation 0

## 8. 다음 시작점

`ASSET_HYGIENE_2_REFERENCE_CROSSCHECK`

AH-2는 이 frozen physical inventory를 입력으로 사용해 current manifest/resolver/frontend/evidence reference만 exact path 기반으로 교차검증한다. AH-1을 이유 없이 다시 scan하지 않는다.

## 9. 다시 열리는 조건

- AH-0 baseline migration
- AH-0 population rule 변경
- inventory producer 또는 기존 Asset Intake byte-analysis contract 변경
- generated inventory와 baseline Git tree coverage parity 파손
- SHA-256/duplicate/basename grouping validator 회귀
- 실제 LFS/symlink 사례가 현재 fail-closed record로 표현 불가능함

## 10. 최종 판정

```text
PASS_ASSET_HYGIENE_STAGE1_REPOSITORY_INVENTORY
COMPLETE
ASSET_HYGIENE_STAGE1_INVENTORY_FROZEN
hard error: 0
blocker: 0
next: AH-2 reference cross-check
```
