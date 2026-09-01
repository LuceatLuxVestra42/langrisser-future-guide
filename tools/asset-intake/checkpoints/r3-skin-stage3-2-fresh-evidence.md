# Asset Intake R3 — Skin Stage 3-2 Fresh Evidence

기준 predecessor: `tools/asset-intake/checkpoints/r2-skin-stage3-2-rollout.md`

기준 main: `635204631843bc4837faf70a88ded54dc6607397`

상태: `PASS_SKIN_STAGE3_2_FRESH_EVIDENCE / COMPLETE`

## 목적

과거 `work/skin-stage3-3-bulk-plan` 계열의 Stage 3-2~3-5 완료 결과를 current main으로 편입하지 않고, current main의 frozen Skin Stage 3-2 계약에서 authoritative asset evidence를 새로 생성한다.

## authoritative source

- current readiness predecessor: `data/validation/skin-stage3-2-readiness.v1.json`
- frozen Stage 3-1 inventory: `data/generated/skin-stage3-1-asset-inventory.v1.json`
- frozen Asset Intake Skin contract: `tools/asset-intake/fixtures/skin-stage1-contract-fixtures.v1.json`
- current model-resource source: `data/configdata/ConfigDataModelSkinResourceInfo.json`
  - blob SHA: `7d76f30223914f96dad31db894af782300dc283d`
- asset source: Zlongame official installer `1.1.113`
- Unity parser: `UnityPy==1.25.3`

## fresh source discovery

공식 설치본의 ZIP central directory만 먼저 읽고 frozen 13 locator와 관련된 후보 bundle만 선택 다운로드했다.

```text
official package count = 68
candidate bundle entry count = 14
representative Skin = 102, 1901, 3701
locator count = 13
static = 3
Char Spine = 3
model resource = 7
```

초기 strict container-path 비교에서는 0/13이었지만, 별도 path-shape diagnostic에서 13/13 모두 동일한 Unity container root를 관찰했다.

```text
assets/gameproject/runtimeassets/
```

이 결과를 근거로 다음 한 가지 normalization만 contract에 동결했다.

1. slash/case normalize
2. `assets/gameproject/runtimeassets/` prefix가 실제로 존재하는지 요구
3. 해당 prefix를 정확히 한 번 제거
4. 남은 경로가 frozen Stage 3-1 runtime locator와 exact equality인지 요구

name similarity, basename-only match, begin/current naming preference는 authority로 사용하지 않았다.

## fresh source inventory proof

Workflow run:

```text
runId = 33443298267
conclusion = success
```

결과:

```text
status = PASS_FRESH_SOURCE_INVENTORY
locatorCount = 13
locatorsWithExactHit = 13
EXACT_HIT_SINGLE_SOURCE = 13
allLocatorsHaveExactHit = true
blockers = []
```

Role coverage:

```text
staticArtwork = 3 / 3
spinePrefab = 3 / 3
modelResource = 7 / 7
```

## fresh evidence proof

Workflow run:

```text
runId = 33443622113
jobId = 99657443611
conclusion = success
artifactId = 9777209994
artifactDigest = sha256:5802b068f6d6e03963928c9ad86ebd2983c33df1ac2ce5fcb1d2b5c74df5b46c
```

Evidence producer는 exact-hit Unity ObjectReader에서 serialized object byte size와 SHA-256을 기록했다.

Spine 대표 3개는 prefab root typetree의 실제 direct PPtr를 읽어 각각 다음 4개 dependency를 확인했다.

```text
Transform
MeshFilter
MeshRenderer
MonoBehaviour
```

각 dependency는 `fileId/pathId`, serialized byte size, SHA-256을 기록한다.

## existing Stage 3-2 validator

기존 validator를 수정하지 않고 그대로 실행했다.

```text
validator = scripts/validate-skin-stage3-2-resolution-proof.mjs
status = PASS
completion = SKIN_STAGE3_2_COMPLETE
checkCount = 45
passedCheckCount = 45
failedCheckCount = 0
evidencePresent = true
evidenceIssueCount = 0
blocker = null
```

따라서 fresh evidence는 기존 Stage 3-2 contract가 요구한 static / Spine / model proof를 모두 충족한다.

## 확정 범위

- Skin 102 / 1901 / 3701 대표 evidence 새 생성
- frozen static locator 3/3 exact resolution
- frozen Char Spine locator 3/3 exact resolution
- current ConfigData model-resource ID 7/7 exact mapping
- model prefab 7/7 official installer exact resolution
- Spine direct PPtr dependency evidence 확보
- Stage 3-2 existing validator 45/45 PASS
- Stage 3-2 completion = `SKIN_STAGE3_2_COMPLETE`

## non-scope

- Skin canonical 540 재계산
- Hero↔Skin ownership/sourceOrder 재계산
- Stage 3-1 locator inventory 재생성
- historical Stage 3-2~3-5 completion artifact 편입
- legacy KR Drive를 authoritative source로 사용
- begin/current bundle명으로 source 우선순위 추정
- raw ConfigData 전체 조회
- Project Status 또는 Status Source 임의 변경
- Stage 3-3 bulk resolution/extraction
- frontend / Hosted / Browser 작업

## BLOCKER

```text
none
```

Stage 3-2의 기존 `ASSET_BYTES_OR_AUTHENTIC_RESOLUTION_EVIDENCE_NOT_AVAILABLE_IN_REPOSITORY` blocker는 fresh official-installer evidence로 해소됐다.

## REVIEW

- official installer `1.1.113` freshness가 변경될 경우 source inventory를 다시 실행한다.
- GitHub Actions Node 20 deprecation warning은 evidence/semantic 결과와 무관한 non-blocking runner maintenance다.
- 과거 work branch Stage 3-2~3-5 결과는 historical reference로만 남고 current authority로 편입하지 않는다.

## 다음 시작점

기존 Stage 3-2 contract의 `nextActionOnPass`를 따른다.

```text
Skin Stage 3-3 static artwork extraction/export using the proven resolver rule.
```

Stage 3-3에서는 이번에 확정한 resolver rule을 540 Skin 전체에 확장하되, partial scan을 extrapolate하지 않고 exact locator evidence로 전체 coverage를 검증한다.

## 다시 열리는 조건

- representative Skin fixture/locator contract 변경
- Stage 3-1 inventory 변경
- `ConfigDataModelSkinResourceInfo.json` blob 변경으로 7개 mapping이 달라짐
- official installer source baseline 변경
- frozen Unity root normalization과 충돌하는 authoritative evidence 발견
- 기존 Stage 3-2 validator가 nonzero가 됨
- evidence hash/provenance 불일치 발견

## 최종 판정

```text
SKIN_STAGE3_2 = COMPLETE
EVIDENCE_SOURCE = FRESH_OFFICIAL_INSTALLER_1.1.113
HISTORICAL_COMPLETION_IMPORTED = false
STATIC = 3/3
CHAR_SPINE = 3/3
MODEL_RESOURCE = 7/7
LOCATOR_EXACT_HIT = 13/13
VALIDATOR = PASS_45_OF_45
BLOCKER = none
NEXT = SKIN_STAGE3_3
```
