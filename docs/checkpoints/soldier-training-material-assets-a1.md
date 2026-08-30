# Soldier Training Material Assets A1 — Asset Intake Domain Rollout

상태: `PASS / COMPLETE`

기준 브랜치: `work/soldier-training-material-assets-stage1`

## 목적

A0에서 freshness가 확인된 Soldier 훈련 재료 24개를 기존 Asset Intake v1 shared contract에 그대로 투영한다.

새로운 Soldier 의미, Item 관계, 이름 JOIN, 경로 추정은 만들지 않는다. canonical identity는 frozen `itemId`, asset locator authority는 frozen ItemInfo의 exact `Icon` full path다.

## authoritative predecessor

- `data/validation/soldier-training-material-assets-a0.v1.json`
- `data/generated/soldier-training-material-iteminfo.v1.json`
  - schema: `soldier-training-material-iteminfo/v1`
  - status: `PASS`
  - git blob: `9df7bbba18064e34f46cf2f4fd99d1904cbd3d63`
- Asset Intake shared contract: `asset-intake/v1`
- Asset Intake shared resolver: `tools/asset-intake/core/engine-v1.mjs`

A1 시작 시 기존 frozen Soldier material artifacts를 이전 census 브랜치의 동일 blob으로 현재 작업 브랜치에 승계했다. upstream semantic 계산은 다시 수행하지 않았다.

## 완료 결과

생성/추가한 핵심 파일:

```text
data/contracts/soldier-training-material-asset-intake.v1.json
data/validation/soldier-training-material-assets-a1.v1.json
tools/asset-intake/adapters/soldier-training-material-v1.mjs
tools/asset-intake/cli/validate-soldier-training-material-a1.mjs
scripts/generate-soldier-training-material-assets-a1.mjs
.github/workflows/soldier-training-material-assets-a1.yml
```

A1 contract 결과:

```text
contractVersion       asset-intake/v1
domain                soldier-training-material
canonicalKey.kind     itemId
canonical records     24
unique itemId         24
FULL_PATH locators    24
PENDING records       24
evidence records      0
contract errors       0
```

각 record는 정확히 아래 형태를 사용한다.

```text
canonicalKey = { kind: itemId, value: <frozen itemId> }
domainNativeStatus = READY_FOR_ASSET_EVIDENCE
normalizedResolutionClass = PENDING
expectedLocators = [
  {
    assetRole: trainingMaterialIcon,
    locatorKind: FULL_PATH,
    value: <frozen ItemInfo.Icon>
  }
]
evidence = []
```

`target`은 추론하지 않는다.

## adapter 경계

새 Soldier training-material adapter는 shared Asset Intake resolver를 재사용한다.

입력 guard:

```text
domain == soldier-training-material
canonicalKey.kind == itemId
exactly one locator per record
assetRole == trainingMaterialIcon
locatorKind == FULL_PATH
locator path == UI/Icon/Item_ABS/Training_*.png
input normalizedResolutionClass == PENDING
input evidence == []
target absent
```

빈 inventory 대표 검증 결과는 24개 전부 `PENDING / NO_EXACT_MATCH`, evidence 0으로 유지된다. 즉 A1 adapter는 source가 없을 때 이름, basename 유사도, ID 산술 등으로 임의 해결하지 않는다.

## 자동 검증

GitHub Actions workflow:

```text
Soldier Training Material Assets A1
run id: 33305213856
conclusion: success
```

검증 순서:

```text
Asset Intake shared contract validator
→ A1 deterministic producer
→ Soldier training-material A1 validator
→ generated contract/summary freeze
```

workflow가 생성한 frozen output commit:

```text
88034b7e2c4c8ec90ee9444a5ff65563aaaac9c8
Freeze Soldier training material Asset Intake A1 [skip ci]
```

## 보존 경계

A1에서 하지 않은 것:

- Soldier canonical population 재계산
- 훈련 비용 재계산
- Item ID 재추론
- ItemInfo name JOIN
- ID arithmetic
- fuzzy filename matching
- visual matching
- source asset 다운로드
- PNG/WebP 생성
- repository asset admission
- frontend 변경

따라서 현재 24개 record가 `PENDING`인 것은 실패가 아니라 A1의 정상 완료 상태다.

## REVIEW / BLOCKER

REVIEW:
- 없음.

BLOCKER:
- semantic blocker 없음.
- source asset evidence는 아직 0/24이므로 asset acquisition blocker는 유지한다.

## 다음 시작점

`A2 source census`

frozen 24개 `FULL_PATH` locator의 basename을 이용해 승인된 source route에서 exact candidate만 조사한다.

현재 우선 시작점은 기존 한섭 asset Drive의 `아이템 1~4` 폴더를 parent-scoped exact filename 방식으로 조사하는 것이다. A2에서는 candidate discovery/evidence만 수행하며 itemId와 ItemInfo.Icon 의미를 변경하지 않는다.

## 다시 열리는 조건

- frozen `soldier-training-material-iteminfo.v1.json` blob 변경
- 24개 item population 변경을 요구하는 authoritative evidence 발견
- ItemInfo.Icon authoritative locator 변경
- Asset Intake shared contract/locator semantics 변경
- A1 validator가 24 canonical records / 24 FULL_PATH / 0 contract errors를 만족하지 못함
- adapter가 no-exact-match 입력을 임의로 RESOLVED 처리하는 회귀 발생
