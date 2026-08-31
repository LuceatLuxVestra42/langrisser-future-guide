# Asset Intake R2 — Skin Stage 3-2 Rollout

기준 predecessor: `tools/asset-intake/checkpoints/r1-independent-execution-proof.md`

기준 main: `e7e1a4958fa89978adb57d4f98fd9889a3806764`

상태: `PENDING_CI_PROOF`

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

## scope

1. Skin Stage 3-2 rollout contract 추가
2. current frozen readiness/normalized contract만 소비하는 전용 runner 추가
3. synthetic isolated root로 PENDING / RESOLVED execution wiring을 모두 검증하는 self-test 추가
4. 기존 `asset:intake:validate`가 rollout self-test를 실행하도록 연결
5. 기존 R1 tracked-worktree mutation guard 유지
6. Project Check에서 기존 `asset-intake` owner / validator로만 실행되는지 검증

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
2. resource map 없이 실행하면 3 records 모두 PENDING / evidence 0이어야 한다.
3. explicit confirmed resource map을 추가하면 3 records / 13 locators가 exact RESOLVED되어야 한다.
4. 두 경우 모두 `projectStatusPromoted=false`여야 한다.
5. `--contract` override는 fail closed 해야 한다.

## 완료 조건

- [ ] Project Check workflow conclusion = success
- [ ] Project Check self-test = success
- [ ] changed-path planning = success
- [ ] owning validator execution = success
- [ ] changed paths -> owner `asset-intake` only
- [ ] selected validator -> `asset-intake` only
- [ ] manualReviews = []
- [ ] `asset:intake:validate` = PASS
- [ ] Skin rollout self-test = PASS
- [ ] Stage 5 output reports `skinStage32ExecutionPathAdopted=true`
- [ ] Stage 5 output reports `currentSkinAuthorityPromoted=false`
- [ ] trackedBeforeCount = 0 in clean CI checkout
- [ ] trackedAfterCount = 0
- [ ] trackedMutationCount = 0
- [ ] current Skin active source remains `READY_FOR_ASSET_EVIDENCE`
- [ ] no semantic / Project Status / Status Source mutation

## BLOCKER

R2 rollout 자체는 CI proof 전까지 `PENDING_CI_PROOF`.

현재 Skin domain의 실제 evidence blocker는 별도로 유지한다.

```text
AUTHORITATIVE_UNITY_ASSET_ROOT_NOT_PRESENT_ON_CURRENT_MAIN
```

이 blocker는 R2 tooling adoption 완료를 막지 않지만 Skin Stage 3-2 domain completion을 막는다.

## REVIEW

- 과거 work branch의 Stage 3-2 completion 및 Stage 3-3~3-5 evidence는 별도 reconciliation 후보다. current main authority가 아니므로 R2에서 승격하지 않는다.
- Synthetic RESOLVED self-test는 runtime wiring proof일 뿐 project evidence가 아니다.

## 다음 시작점

R2 PASS 후 Asset Intake 설치/실행/first-domain adoption은 완료된다.

다음 Skin domain 작업은 별도 scope에서 authoritative Unity asset root를 실제 제공하거나, historical work branch evidence를 current main으로 승격 가능한지 provenance/freshness를 재검증하는 것이다. 이때도 Stage 3-1 semantic/locator inventory는 새로운 authoritative contradiction이 없는 한 다시 계산하지 않는다.

## 다시 열리는 조건

- current Skin active source가 변경됨
- normalized Skin Asset Intake contract의 3 representative key / 13 locator contract가 변경됨
- `asset:intake:validate` 또는 rollout self-test nonzero
- trackedMutationCount > 0
- Project Check가 asset-intake owner/validator를 선택하지 못함
- historical completion evidence가 current main authoritative source로 정식 승격됨
- 새로운 authoritative evidence가 current readiness와 충돌함
