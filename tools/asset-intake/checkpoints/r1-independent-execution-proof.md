# Asset Intake R1 — Independent Execution Proof

기준 predecessor: `tools/asset-intake/checkpoints/r0-authority-inventory.md`

기준 main: `3fbda966473a8bf641c4f9a7b658d63c0df6e549`

상태: `PASS_ASSET_INTAKE_R1_INDEPENDENT_EXECUTION_PROOF / COMPLETE`

## 목적

R0에서 동결한 현재 Asset Intake active graph가 clean repository checkout에서 실제로 실행되고, 실행 전후 tracked worktree를 변경하지 않으며, Project Check owning path를 통해 같은 validator authority가 선택되는지 증명한다.

이 단계는 Asset Intake semantic/core 재설계가 아니다. 기존 Stage 5 validator chain을 그대로 실행하되 tracked mutation proof만 owning validator에 추가한다.

## authoritative predecessor

- `tools/asset-intake/checkpoints/r0-authority-inventory.md`
- `tools/asset-intake/cli/validate-stage5-v1.mjs`
- `tools/asset-intake/cli/validate-stage4-v1.mjs`
- `tools/project-check/contracts/owners.v1.json`
- `tools/project-check/contracts/validators.v1.json`
- `.github/workflows/project-tooling-r3-project-check.yml`

## scope

1. 기존 `npm run asset:intake:validate` alias 유지
2. 기존 Stage 5 -> Stage 4 -> self-test chain 유지
3. Stage 5 validator 실행 전/후 tracked worktree snapshot 비교
4. Project Check가 `tools/asset-intake/**` 변경을 `asset-intake` owner로 route하는지 확인
5. Project Check가 `asset-intake` validator를 실제 실행해 exit code 0인지 확인
6. clean GitHub Actions checkout에서 trackedBeforeCount=0 / trackedAfterCount=0 / trackedMutationCount=0 확인

## non-scope

- Asset Intake core/route/adapter 의미 변경
- `package.json` alias 변경
- Asset Hygiene generated artifact 재생성
- Skin canonical / Hero-Skin relation / sourceOrder 재계산
- Status Source / Project Status mutation
- frontend/build 변경
- Project Check owner map 또는 validator catalog 변경

## validator maintenance

`tools/asset-intake/cli/validate-stage5-v1.mjs`에 다음 evidence-only guard를 추가했다.

```text
trackedBefore = git status --porcelain=v1 --untracked-files=no
run existing Stage 5 validation chain
trackedAfter  = git status --porcelain=v1 --untracked-files=no
assert trackedAfter == trackedBefore
```

이 검사는 dirty developer worktree 자체를 금지하지 않는다. validator가 새 tracked mutation을 만들지 않는지만 검사한다.

## clean execution proof

PR #327의 Project Check는 `actions/checkout@v4`에서 `clean: true`로 repository를 fresh checkout한 뒤 existing Project Check contract와 Asset Intake validator를 실행했다.

Asset Intake validator 결과:

```text
status = PASS_ASSET_INTAKE_STAGE5_OPERATIONAL_ROUTING
checks = 23
passed = 23
failed = 0
hardErrors = 0
trackedBeforeCount = 0
trackedAfterCount = 0
trackedMutationCount = 0
```

따라서 clean tracked repository state에서 기존 Stage 5 -> Stage 4 -> self-test execution chain이 PASS하고 tracked mutation을 만들지 않음이 확인됐다.

## Project Check parity

PR #327 changed-path plan:

```text
changedFileCount = 2
ownerCount = 1
validatorCount = 1
owners = [asset-intake]
validators = [asset-intake]
manualReviews = []
route.status = PLAN_READY
```

두 변경 파일 모두 `asset-intake` rule에만 매핑됐다.

```text
tools/asset-intake/checkpoints/r1-independent-execution-proof.md
  -> asset-intake

tools/asset-intake/cli/validate-stage5-v1.mjs
  -> asset-intake
```

실행된 validator:

```text
id = asset-intake
executable = npm
args = [run, asset:intake:validate]
exitCode = 0
```

Project Check 최종 결과:

```text
status = PASS
completion = COMPLETE
exitCode = 0
manualReviews = []
legacy Project Doctor runtime dependencies = 0
statusSourceMutationCount = 0
projectStatusNormalizationCount = 0
```

## 완료 조건

- [x] Project Check workflow conclusion = success
- [x] Project Check self-test = success
- [x] changed-path planning = success
- [x] owning validator execution = success
- [x] `asset:intake:validate` output status = `PASS_ASSET_INTAKE_STAGE5_OPERATIONAL_ROUTING`
- [x] trackedBeforeCount = 0 in clean CI checkout
- [x] trackedAfterCount = 0
- [x] trackedMutationCount = 0
- [x] no manual review / no unrelated owner fan-out observed
- [x] current package alias unchanged
- [x] semantic/core/adapter output contract unchanged

## BLOCKER

없음.

## REVIEW

- 독립적인 두 번째 동일 validator invocation은 추가 evidence가 없으므로 요구하지 않는다. Project Check가 clean checkout에서 repository package validator를 실제 spawn한 실행을 orchestration execution proof로 사용한다.
- untracked temporary files는 Stage 4/5가 OS temp directory에서 생성 후 제거하며, R1 mutation proof 대상은 tracked repository state다.
- GitHub Actions가 표시한 actions/checkout/setup-node의 Node 20 deprecation 경고는 현재 Asset Intake validator 결과와 무관한 runner/action maintenance signal이며 R1 blocker가 아니다.

## 다음 시작점

R1 완료로 Asset Intake shared installation의 current execution authority와 tracked-mutation safety가 확인됐다.

다음 단계는 core 재설치가 아니라 실제 domain rollout/adoption을 대상으로 현재 미완료 owner를 선택하는 것이다. 시작 전 current Project Status/owner state를 다시 확인하고 별도 scope로 연다.

## 다시 열리는 조건

- `asset:intake:validate` nonzero
- Stage 5 predecessor chain nonzero
- trackedMutationCount > 0
- Project Check가 asset-intake owner/validator를 선택하지 못함
- manual review 또는 unrelated owner fan-out 발생
- package validator alias 변경
- active graph가 Status Source / Project Status / semantic output을 mutate하도록 변경

## 최종 판정

```text
ASSET_INTAKE_R1 = COMPLETE
ASSET_INTAKE_VALIDATOR = PASS
PROJECT_CHECK_PARITY = PASS
TRACKED_MUTATION_COUNT = 0
MANUAL_REVIEW = none
CORE_REBUILD_REQUIRED = false
```
