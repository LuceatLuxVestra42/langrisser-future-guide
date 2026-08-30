# Asset Intake Stage 4 — Repository Integration Checkpoint

기준 main: `f618238c6ec0ba9463e935240a4028f281f322a0`

상태: `READY_FOR_PR_GUARD / IMPLEMENTATION_COMPLETE_ADMISSION_PENDING`

## 목적

Stage 0~3에서 동결한 Asset Intake 경계를 실제 repository 실행 표면과 Project Doctor owning/check 체계에 연결한다.

이번 단계는 Skin asset final owner admission이 아니다. Asset Intake는 여러 도메인이 공유하는 file/evidence tooling이므로 기존 `project-doctor` impact node가 소유하고, `skin-assets`와 `banner-assets` manual-review 경계는 그대로 유지한다.

## authoritative predecessors

- `tools/asset-intake/contract/asset-intake-contract.v1.schema.json`
- `tools/asset-intake/core/contract-v1.mjs`
- `tools/asset-intake/core/engine-v1.mjs`
- `tools/asset-intake/adapters/skin-v1.mjs`
- `docs/checkpoints/asset-intake-stage2-engine.md`
- `docs/checkpoints/asset-intake-stage3-skin-adapter.md`
- Project Doctor V4 contracts are preserved historical predecessors and are not edited.

## 설치 범위

### Repository CLI

```text
npm run asset:intake -- scan --root <dir> ...
npm run asset:intake -- skin --root <dir> --contract <file> ...
npm run asset:intake:validate
```

CLI는 Stage 2 engine과 Stage 3 Skin adapter를 직접 사용한다.

`RESOURCE_ID`는 explicit confirmed map 없이는 해석하지 않는다.

### Repository validation

`tools/asset-intake/cli/validate-stage4-v1.mjs`는 다음을 검증한다.

1. Stage 2 engine self-test
2. Stage 3 Skin adapter self-test
3. temporary repository root의 실제 recursive scan
4. Skin 102 / 1901 / 3701 frozen contract 소비
5. 13 locator exact resolution with explicit map
6. 13 evidence emission
7. contract validation
8. canonical key preservation
9. domain semantic leakage 없음
10. RESOURCE_ID map 제거 시 3/3 PENDING
11. PENDING partial evidence 0

representative bytes는 synthetic fixture이며 프로젝트 실제 asset authority claim이 아니다.

## Project Doctor V5

기존 V4 파일은 수정하지 않고 V5를 새로 추가한다.

### D2

```text
tools/asset-intake/**
data/validation/asset-intake-*
docs/checkpoints/asset-intake-*
        ↓
changeClass = asset-intake-tooling
directNode  = project-doctor
```

새 impact node나 propagation edge는 만들지 않는다.

### D3

추가 check:

```text
asset-intake-self-test
phase 3
npm run asset:intake:validate
trigger = asset-intake-tooling
```

다음 manual boundary는 유지한다.

```text
banner-assets
skin-assets
```

### D4

`asset-intake-self-test`를 strict npm-run allowlist에 추가한다.

실패하면 이후 check를 실행하지 않는 fail-fast를 유지한다.

### D7

기존 read-only `pull_request` workflow를 유지하고 현재 Doctor 실행 포인터만 V5로 전환한다.

## 명시적으로 하지 않은 것

```text
Skin canonical 540 재계산
Hero↔Skin relation 재계산
Hero ownership/sourceOrder 재계산
Skin final-owner promotion
Banner final-owner promotion
asset bytes 변경
frontend 변경
dev/build 자동 Asset Intake hook
raw ConfigData fallback
name JOIN
ID arithmetic
fuzzy filename matching
```

## 완료 조건

Stage 4는 코드가 존재하는 것만으로 완료 처리하지 않는다.

실제 Stage 4 PR HEAD의 `pull_request` Project Doctor PR Guard에서 아래가 모두 확인되어야 한다.

```text
PR Guard conclusion == success
guarded HEAD == PR HEAD
plan.status == PLAN_READY
manualReviews == []
unmappedPaths == []
selectedChecks includes asset-intake-self-test
asset-intake-self-test exitCode == 0
checksQueued == checksRun
every selected check exitCode == 0
```

## 현재 REVIEW / BLOCKER

REVIEW:
- 없음. 구현 계약은 PR Guard admission 대기 상태다.

BLOCKER:
- 실제 `pull_request` PR Guard execution evidence가 아직 생성되지 않았다.

## 다음 시작점

Stage 4 PR을 열고 실제 PR Guard의 dry-run/execution 결과를 검증한다. PASS 후 이 checkpoint와 summary를 최종 `PASS_ASSET_INTAKE_STAGE4_REPOSITORY_INTEGRATION / COMPLETE`로 갱신하고 최종 HEAD의 PR Guard를 한 번 더 통과시킨다.

## 다시 열리는 조건

- Asset Intake repository CLI contract 변경
- Asset Intake tooling owning node/changeClass 변경
- Project Doctor D2/D3/D4/D7 current runtime 변경
- repository validator가 Stage 2/3 contract와 불일치
- Asset Intake tooling diff가 unmapped/manual review로 회귀
- `asset-intake-self-test`가 실제 Doctor selection/execution에서 누락
