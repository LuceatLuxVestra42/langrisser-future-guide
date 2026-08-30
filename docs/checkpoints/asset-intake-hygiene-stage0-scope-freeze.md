# Asset Hygiene Stage 0 — Baseline / Scope Freeze

기준일: 2026-08-30

상태: `PASS_ASSET_HYGIENE_STAGE0_SCOPE_FREEZE / COMPLETE`

freeze: `ASSET_HYGIENE_STAGE0_SCOPE_FROZEN`

## 1. 목적

과거에 repository에 들어온 이미지 asset을 삭제하거나 재배치하기 전에, AH-1~AH-3가 동일한 물리 population을 읽도록 read-only baseline과 census 범위를 먼저 고정한다.

이 단계는 Asset Intake Stage 5를 다시 여는 단계가 아니다. 새로운 semantic relation, canonical identity, asset ownership을 만들지 않는다.

## 2. frozen baseline

repository:
`LuceatLuxVestra42/langrisser-future-guide`

baseline branch:
`main`

baseline commit:
`73db96444d2016d044042630955486fd9b3d9036`

baseline tree:
`f19194edbf6e71f1c3d6fcf0ccabb0b9c6474df8`

Asset Intake Stage 5 merge:
`b511a499b0f375f729d97416be191ace41bd719a`

현재 main은 Asset Intake Stage 5 이후 전진했지만, 현재 D7 V7은 Stage 5 operational routing admission을 그대로 보존한다.

## 3. authoritative predecessor

다음을 AH-0 predecessor로 고정한다.

- `docs/checkpoints/asset-intake-stage5-operational-routing.md`
  - blob `3e1f447d562424c73309990b55119e69e2297d3a`
  - `PASS_ASSET_INTAKE_STAGE5_OPERATIONAL_ROUTING / COMPLETE`
- `tools/asset-intake/contract/operational-routing.v1.json`
  - blob `45367e73f5557052791062ca6a7686ca943086e9`
  - `DESIGN_FROZEN`
- `tools/asset-intake/core/engine-v1.mjs`
  - blob `80897c1fc3b4dbe57870b2123316371e8ac5e83b`
  - AH-1에서 SHA-256/signature/dimension/exact duplicate 기능 재사용
- `data/contracts/project-doctor-active-source-registry.v1.json`
  - blob `18e34913e5d0743e24776d14864a185f00ce8b58`
- `data/generated/project-doctor-active-source-registry.v1.json`
  - `PASS_PROJECT_DOCTOR_ACTIVE_SOURCE_REGISTRY / COMPLETE`
- `data/contracts/project-doctor-d7-pr-guard.v7.json`
  - blob `b1e92f74392b51836bc608fb9a4bf77bbe45f391`
  - current required PR Guard contract

Active Source Registry가 선택한 현재 domain authority를 그대로 사용한다. filename, Stage 번호, timestamp, commit date로 authority를 새로 추론하지 않는다.

## 4. AH-0 census scope

normative contract:
`tools/asset-intake/contract/hygiene-scope.v1.json`

scope ID:
`REPOSITORY_TRACKED_IMAGE_ASSETS_V1`

모집단은 baseline commit의 Git tree다.

```text
git ls-tree -r --full-tree 73db96444d2016d044042630955486fd9b3d9036
```

포함 규칙:

1. baseline Git tree의 tracked regular file만 대상으로 한다.
2. `public/images/**`는 확장자와 관계없이 포함한다.
3. 그 외 repository 경로는 image extension allowlist에 해당하면 포함한다.
4. 경로명에 `assets`, `images`가 없다는 이유만으로 image candidate를 제외하지 않는다.
5. 대소문자가 다른 확장자도 동일하게 취급한다.

image extension allowlist:

```text
.png .jpg .jpeg .webp .gif .svg .avif .bmp .ico
.tif .tiff .tga .dds .ktx .ktx2
```

현재 `public/images`에 관찰되는 top-level root는 다음과 같다. 이것은 현재 tree 확인값이며 scope를 이 목록으로 제한하는 규칙은 아니다.

```text
army
banners
equipment
factions
heroes
shared
soldiers
soldiers-webp
```

## 5. 제외 범위

AH-0/AH-1 image census population에 넣지 않는다.

- untracked working-tree file
- gitignored local file
- external URL
- remote Drive object
- Git에 없는 CI artifact
- Git에 없는 runtime/build output
- submodule entry 자체
- symlink target을 따라가서 얻은 외부/중복 bytes

tracked symlink가 image candidate 위치에 실제 존재하면 조용히 따라가지 않고 AH-1 REVIEW로 기록한다.

Git LFS pointer가 있으면 pointer text의 SHA를 asset identity로 사용하지 않는다. resolved bytes가 없으면 `LFS_POINTER_UNRESOLVED` REVIEW로 남긴다.

## 6. 이번 v1에서 미포함하는 asset family

다음 non-image family는 이번 image Hygiene v1의 semantic/classification 대상으로 확장하지 않는다.

- Spine
- model
- audio
- font
- video
- Unity bundle

단 `public/images/**` 안에 비이미지 signature 파일이 tracked 상태로 존재하면 물리 census에서 조용히 버리지 않고 AH-1에서 residue/review 대상으로 기록한다.

## 7. semantic / production boundary

AH-0에서 금지:

```text
asset bytes 변경
move / delete / rename
format conversion
frontend 변경
production consumer 변경
외부 fetch
raw ConfigData read
semantic recomputation
canonical relation recomputation
name JOIN
ID arithmetic
fuzzy filename matching
perceptual identity inference
domain asset owner promotion
```

Hero/Soldier/Equipment/Hero-Soldier/Banner/Skin의 현재 authoritative source와 frozen semantic 결과는 그대로 유지한다.

## 8. Project Doctor 경계

새 domain이나 impact node를 추가하지 않는다.

현재 D2 V5에 이미 존재하는 다음 shared Asset Intake tooling surface를 그대로 사용한다.

```text
tools/asset-intake/**
data/validation/asset-intake-*
docs/checkpoints/asset-intake-*
    → project-doctor / asset-intake-tooling
```

따라서 AH-0을 이유로 D2/D3/D4를 버전업하지 않는다.

## 9. AH-0 완료 범위

완료:

- current main baseline commit/tree freeze
- Asset Intake Stage 5 predecessor freeze
- Active Source Registry authority boundary 확인
- current D7 V7 / Stage 5 admission 유지 확인
- Git tracked-tree 기반 image census population 규칙 확정
- `public/images/**` unconditional inclusion 확정
- repository-wide image extension discovery 확정
- LFS/symlink fail-closed 처리 규칙 확정
- non-image asset family deferred boundary 확정
- AH-1 output boundary 확정

하지 않은 것:

- 전체 파일 수 계산
- 전체 byte 계산
- SHA-256 전수 계산
- exact duplicate census
- basename collision census
- manifest/consumer reference cross-check
- ACTIVE/EVIDENCE/DERIVATIVE 등 classification
- 파일 삭제/이동/rename

이 항목들은 각각 AH-1 이후 소유 범위다.

## 10. REVIEW / BLOCKER

REVIEW:

1. `AH1_CENSUS_COUNTS_NOT_YET_MATERIALIZED`
   - count/bytes/hash/duplicate/collision/LFS/symlink 현황은 AH-1에서 계산한다.
   - AH-0 완료를 막지 않는다.

2. `NON_IMAGE_ASSET_FAMILIES_DEFERRED`
   - Spine/model/audio/font/video/Unity bundle은 image Hygiene v1 이후 별도 필요성이 생길 때 확장한다.
   - AH-0 완료를 막지 않는다.

BLOCKER:

- 없음

## 11. 다음 시작점

`ASSET_HYGIENE_1_REPOSITORY_INVENTORY`

다음 작업은 frozen baseline Git tree를 한 번 열거하고 물리 inventory를 생성하는 것이다.

AH-1에서 허용:

```text
repository path
root
extension
byte size
signature
지원되는 경우 width/height
SHA-256
exact duplicate group
basename collision candidate group
LFS/symlink review
```

AH-1에서는 아직 다음을 하지 않는다.

```text
ACTIVE_VERIFIED 판정
EVIDENCE_ONLY 판정
GENERATED_DERIVATIVE 판정
SUPERSEDED 판정
UNREFERENCED 판정
PROVENANCE_UNKNOWN 판정
삭제 후보 확정
```

classification은 AH-3가 소유한다.

## 12. 다시 열리는 조건

AH-0은 다음 경우에만 다시 연다.

- Asset Intake Stage 5의 verified-project-evidence 우선순위 또는 fail-closed contract가 변경됨
- frozen image census population 규칙 자체를 변경해야 함
- non-image asset family를 Hygiene v1에 명시적으로 편입함
- AH-1에서 현재 contract로 표현할 수 없는 Git LFS/symlink 사례가 실제 발견됨
- baseline/predecessor 선언과 authoritative evidence의 실제 불일치가 확인됨
- explicit baseline migration을 수행함

일반적인 main 전진만으로 이 checkpoint의 baseline을 조용히 바꾸지 않는다.

AH-3 closeout 전에 asset-bearing path가 baseline 이후 변경되면 현재 baseline을 silent rescan하지 않고 delta 기록 또는 명시적 baseline version migration으로 처리한다.

## 13. 최종 판정

```text
PASS_ASSET_HYGIENE_STAGE0_SCOPE_FREEZE
COMPLETE
ASSET_HYGIENE_STAGE0_SCOPE_FROZEN
hard error: 0
blocker: 0
next: AH-1 repository inventory
```
