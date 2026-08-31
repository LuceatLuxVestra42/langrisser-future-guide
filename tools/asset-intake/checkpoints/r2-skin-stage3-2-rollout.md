# Asset Intake R2 — Skin Stage 3-2 Rollout

기준 predecessor: `tools/asset-intake/checkpoints/r1-independent-execution-proof.md`

기준 main: `e7e1a4958fa89978adb57d4f98fd9889a3806764`

상태: `PASS_ASSET_INTAKE_R2_SKIN_STAGE3_2_ROLLOUT / COMPLETE`

## 목적

현재 Project Status에서 유일하게 `IN_PROGRESS / READY_FOR_ASSET_EVIDENCE`인 Skin Stage 3-2에 설치 완료된 Asset Intake를 공식 실행 경로로 채택한다.

이 단계는 Skin Stage 3-2 완료 증명이나 과거 work branch evidence 승격이 아니다. 현재 main의 authoritative readiness 상태를 유지하면서, 향후 authoritative Unity asset root가 제공될 때 frozen Skin 3개 대표 fixture / 13개 locator를 Asset Intake shared engine과 Skin adapter로 실행할 수 있는 fail-closed entrypoint를 확정한다.

## authoritative predecessor

- `PROJECT_STATUS.md`
- `data/validation/skin-stage3-2-readiness.v1.json`
- `tools/asset-intake/fixtures/skin-stage1-contract-fixtures.v1.json`
- `tools/asset-intake/cli/run-v1.mjs`
- `tools/asset-intake/cli/validate-stage5-v1.mjs`
- `tools/asset-intake/checkpoints/r1-independent-execution-proof.md`

현재 Skin active source는 계속 `data/validation/skin-stage3-2-readiness.v1.json`이며 `READY_FOR_ASSET_EVIDENCE`다.

## 확인된 historical boundary

과거 `work/skin-stage3-3-bulk-plan` 계열에는 Stage 3-2 completion evidence와 후속 Stage 3-3/3-4/3-5 작업 이력이 존재한다.

하지만 해당 evidence/completion artifact는 현재 `main`에 존재하지 않으며, 관련 완료 PR도 `main`이 아니라 work branch를 base로 병합됐다.

따라서 R2는 그 이력을 current authority로 자동 승격하지 않는다.

## 적용 범위

1. `tools/asset-intake/contract/skin-stage3-2-rollout.v1.json`
   - current readiness source와 frozen 3 representative / 13 locator contract를 고정한다.
   - Project Status 자동 승격, historical branch evidence 자동 승격, semantic recomputation을 금지한다.
2. `tools/asset-intake/cli/run-skin-stage3-2-v1.mjs`
   - current frozen contract만 실행한다.
   - `--contract` override를 금지한다.
   - authoritative root와 explicit resource map을 shared Asset Intake `skin` command로 전달한다.
3. `tools/asset-intake/cli/self-test-skin-stage3-2-rollout-v1.mjs`
   - isolated synthetic root에서 PENDING 및 exact RESOLVED wiring을 검증한다.
   - synthetic result가 Project Status를 승격하지 않는지 검증한다.
4. `tools/asset-intake/cli/validate-stage5-v1.mjs`
   - 기존 Stage 5 chain에 Skin rollout self-test만 추가한다.
   - R1 tracked-worktree mutation guard는 유지한다.

## non-scope

- Skin canonical 540 재계산
- Hero↔Skin relation / owner / sourceOrder 재계산
- Stage 3-1 재생성
- historical work branch evidence 승격
- `PROJECT_STATUS.md` 또는 Status Source 변경
- authoritative asset byte 추가
- raw ConfigData fallback
- name JOIN / ID arithmetic / fuzzy matching / cross-root fallback
- frontend/build/Hosted/Browser 작업
- Asset Hygiene 재생성
- Project Check owner/validator contract 변경

## rollout execution contract

전용 runner:

```text
tools/asset-intake/cli/run-skin-stage3-2-v1.mjs
```

고정 소비 대상:

```text
active source = data/validation/skin-stage3-2-readiness.v1.json
normalized contract = tools/asset-intake/fixtures/skin-stage1-contract-fixtures.v1.json
canonical keys = 102, 1901, 3701
locator count = 13
```

`--contract` override는 금지한다.

authoritative root 없이 current main의 Skin 상태를 임의로 RESOLVED로 승격하지 않는다. `RESOURCE_ID`는 기존 shared engine 규칙대로 explicit confirmed resource map 없이는 PENDING이다.

## self-test proof model

Synthetic fixture는 execution wiring 증명 전용이며 project asset authority가 아니다.

1. exact synthetic static/spine/model paths를 isolated temp root에 구성한다.
2. resource map 없이 실행하면 3 records 모두 PENDING / evidence 0이다.
3. explicit confirmed resource map을 추가하면 3 records / 13 locators가 exact RESOLVED된다.
4. 두 경우 모두 `projectStatusPromoted=false`다.
5. `--contract` override는 fail closed 한다.

## CI execution proof

PR: `#328`

Project Check run:

```text
runId = 33441883606
jobId = 99651804557
conclusion = success
```

Project Check self-test:

```text
status = PASS
checkpoint = PROJECT_CHECK_R3_SELF_TEST
```

Changed-path plan:

```text
changedFileCount = 5
ownerCount = 1
validatorCount = 1
owners = [asset-intake]
validators = [asset-intake]
manualReviews = []
route.status = PLAN_READY
semanticRecomputationCount = 0
statusSourceMutationCount = 0
projectStatusMutationCount = 0
```

Owning validator execution:

```text
validatorId = asset-intake
executable = npm
args = [run, asset:intake:validate]
exitCode = 0
```

Asset Intake Stage 5 result:

```text
status = PASS_ASSET_INTAKE_STAGE5_OPERATIONAL_ROUTING
checks = 24
passed = 24
failed = 0
hardErrors = 0
skinStage32ExecutionPathAdopted = true
currentSkinAuthorityPromoted = false
trackedBeforeCount = 0
trackedAfterCount = 0
trackedMutationCount = 0
```

Project Check final result:

```text
status = PASS
completion = COMPLETE
exitCode = 0
legacyProjectDoctorRuntimeImports = 0
statusSourceMutationCount = 0
projectStatusNormalizationCount = 0
```

## 완료 조건

- [x] Project Check workflow conclusion = success
- [x] Project Check self-test = success
- [x] changed-path planning = success
- [x] owning validator execution = success
- [x] changed paths -> owner `asset-intake` only
- [x] selected validator -> `asset-intake` only
- [x] manualReviews = []
- [x] `asset:intake:validate` = PASS
- [x] Skin rollout self-test = PASS
- [x] Stage 5 output reports `skinStage32ExecutionPathAdopted=true`
- [x] Stage 5 output reports `currentSkinAuthorityPromoted=false`
- [x] trackedBeforeCount = 0 in clean CI checkout
- [x] trackedAfterCount = 0
- [x] trackedMutationCount = 0
- [x] current Skin active source remains `READY_FOR_ASSET_EVIDENCE`
- [x] no semantic / Project Status / Status Source mutation

## BLOCKER

R2 rollout blocker: 없음.

현재 Skin domain의 실제 evidence blocker는 별도로 유지한다.

```text
AUTHORITATIVE_UNITY_ASSET_ROOT_NOT_PRESENT_ON_CURRENT_MAIN
```

이 blocker는 R2 tooling adoption 완료를 막지 않지만 Skin Stage 3-2 domain completion을 막는다.

## REVIEW

- 과거 work branch의 Stage 3-2 completion 및 Stage 3-3~3-5 evidence는 별도 reconciliation 후보다. current main authority가 아니므로 R2에서 승격하지 않았다.
- Synthetic RESOLVED self-test는 runtime wiring proof일 뿐 project evidence가 아니다.
- GitHub Actions의 actions/checkout/setup-node Node 20 deprecation warning은 R2 변경 영역이 아니며 현재 Project Check와 Asset Intake validator가 모두 PASS했으므로 non-blocking runner/action maintenance review다.

## 다음 시작점

Asset Intake 설치/독립 실행/first-domain adoption은 완료됐다.

다음 Skin domain 작업은 별도 scope에서 다음 둘 중 authoritative evidence 경로를 확정하는 것이다.

1. authoritative Unity asset root를 실제 제공해 current main frozen contract로 Stage 3-2 evidence를 생성한다.
2. historical work branch evidence를 current main으로 승격 가능한지 provenance/freshness를 재검증한다.

새로운 authoritative contradiction이 없는 한 Stage 3-1 semantic/locator inventory는 다시 계산하지 않는다.

## 다시 열리는 조건

- current Skin active source가 변경됨
- normalized Skin Asset Intake contract의 3 representative key / 13 locator contract가 변경됨
- `asset:intake:validate` 또는 rollout self-test nonzero
- trackedMutationCount > 0
- Project Check가 asset-intake owner/validator를 선택하지 못함
- historical completion evidence가 current main authoritative source로 정식 승격됨
- 새로운 authoritative evidence가 current readiness와 충돌함

## 최종 판정

```text
ASSET_INTAKE_R2 = COMPLETE
SKIN_STAGE3_2_EXECUTION_PATH = ADOPTED
PROJECT_CHECK = PASS
ASSET_INTAKE_VALIDATOR = PASS_24_OF_24
TRACKED_MUTATION_COUNT = 0
CURRENT_SKIN_AUTHORITY_PROMOTED = false
SKIN_DOMAIN_STATUS = READY_FOR_ASSET_EVIDENCE
R2_BLOCKER = none
SKIN_DOMAIN_BLOCKER = AUTHORITATIVE_UNITY_ASSET_ROOT_NOT_PRESENT_ON_CURRENT_MAIN
```
