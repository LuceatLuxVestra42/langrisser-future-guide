# Asset Intake Stage 4 — Repository Integration Checkpoint

기준 main: `f618238c6ec0ba9463e935240a4028f281f322a0`

상태: `PASS_ASSET_INTAKE_STAGE4_REPOSITORY_INTEGRATION / COMPLETE`

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
- Project Doctor V4 contracts are preserved historical predecessors and were not edited.

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

`tools/asset-intake/cli/validate-stage4-v1.mjs`는 기존 Stage 2/3 self-test를 재사용하고 temporary repository root에서 대표 Skin 102 / 1901 / 3701을 실제 CLI 경로로 검증한다.

확인 결과:

```text
PASS_ASSET_INTAKE_STAGE4_REPOSITORY_VALIDATION
checks      16
passed      16
failed      0
hardErrors  0

representative records   3
representative locators  13
representative evidence  13
```

대표 bytes는 synthetic fixture이며 프로젝트 실제 asset authority claim이 아니다.

explicit RESOURCE_ID map을 제거한 negative path에서는 3/3 record가 PENDING으로 남고 partial contract evidence는 0이다.

## Project Doctor V5

기존 V4 파일은 수정하지 않고 V5를 새로 추가했다.

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

`asset-intake-self-test`를 strict npm-run allowlist에 추가했다.

실패하면 이후 check를 실행하지 않는 fail-fast를 유지한다.

### D7

기존 read-only `pull_request` workflow를 유지하고 current Doctor runtime을 V5로 전환했다.

## 첫 실제 PR admission evidence

PR: `#257`

검증 HEAD:

```text
08d33c62406563e9dafd27acba4d35919d5fca8a
```

Project Doctor PR Guard:

```text
run id      33285465140
event       pull_request
conclusion  success
```

real-diff dry-run:

```text
Plan status    PLAN_READY
Changed files  15
Checks queued  5
```

real-diff execution:

```text
Run status     PASS_EXECUTED
Checks queued  5
Checks run     5

[0] asset-intake-self-test
[0] production-build
[0] doctor-health-gate
[0] doctor-impact-self-test
[0] doctor-plan-self-test
```

`PLAN_READY`이므로 이 diff에는 unmapped path 또는 manual-review owner가 남지 않았다. `asset-intake-self-test`는 실제 선택·실행되어 exit 0으로 통과했다.

## 최종 HEAD 재검증 규칙

이 checkpoint 자체를 COMPLETE로 갱신하면 PR HEAD가 바뀐다. 따라서 위 첫 admission run은 구현 admission 근거이고, **실제 merge 가능한 최종 증거는 이 checkpoint commit을 포함한 최종 PR HEAD의 새 `pull_request` PR Guard가 동일 조건으로 PASS하는 것**이다.

최종 조건:

```text
PR Guard conclusion == success
guarded HEAD == final PR HEAD
plan.status == PLAN_READY
manualReviews == []
unmappedPaths == []
selectedChecks includes asset-intake-self-test
asset-intake-self-test exitCode == 0
checksQueued == checksRun
every selected check exitCode == 0
```

최종 run은 PR #257의 check history가 authoritative evidence다. 이 run 결과를 다시 문서에 적어 commit을 추가하지 않는다. 그렇게 하면 HEAD가 다시 바뀌어 무한 재검증 루프가 되기 때문이다.

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

## 완료 범위

- shared Asset Intake repository CLI 설치
- explicit npm entry 설치
- representative repository validator 설치
- Asset Intake tooling D2 owner mapping
- dedicated D3/D4 Asset Intake check admission
- Project Doctor current runtime V5 전환
- real `pull_request` Doctor execution에서 first admission PASS
- final checkpoint 동결

## REVIEW / BLOCKER

REVIEW:
- final checkpoint commit을 포함한 최종 PR HEAD의 PR Guard 재검증만 남는다. 이는 새 semantic/tooling 구현 작업이 아니라 final admission 확인이다.

BLOCKER:
- 없음. final PR Guard가 nonzero/manual/unmapped로 회귀하면 해당 owning layer에서만 다시 연다.

## 다음 시작점

최종 PR HEAD의 Project Doctor PR Guard를 확인한다. 동일 조건 PASS 후 PR #257을 병합하고 Stage 5 `Operational Routing`으로 이동한다.

## 다시 열리는 조건

- Asset Intake repository CLI contract 변경
- Asset Intake tooling owning node/changeClass 변경
- Project Doctor D2/D3/D4/D7 current runtime 변경
- repository validator가 Stage 2/3 contract와 불일치
- Asset Intake tooling diff가 unmapped/manual review로 회귀
- `asset-intake-self-test`가 실제 Doctor selection/execution에서 누락 또는 nonzero
- Skin asset owner를 별도 admission 변경으로 승격
