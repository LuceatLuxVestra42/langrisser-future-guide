# Asset Intake R1 — Independent Execution Proof

기준 predecessor: `tools/asset-intake/checkpoints/r0-authority-inventory.md`

기준 main: `3fbda966473a8bf641c4f9a7b658d63c0df6e549`

상태: `PENDING_CI_PROOF`

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

`tools/asset-intake/cli/validate-stage5-v1.mjs`에 다음 evidence-only guard를 추가한다.

```text
trackedBefore = git status --porcelain=v1 --untracked-files=no
run existing Stage 5 validation chain
trackedAfter  = git status --porcelain=v1 --untracked-files=no
assert trackedAfter == trackedBefore
```

이 검사는 dirty developer worktree 자체를 금지하지 않는다. validator가 새 tracked mutation을 만들지 않는지만 검사한다.

GitHub Actions Project Check는 fresh checkout에서 실행되므로 해당 run의 validator JSON에서 다음이 확인되면 clean-tree proof로 채택한다.

```text
trackedBeforeCount = 0
trackedAfterCount = 0
trackedMutationCount = 0
```

## Project Check parity

현재 owner/validator contract:

```text
tools/asset-intake/**
  -> owner: asset-intake
  -> validator: asset-intake
  -> npm run asset:intake:validate
```

R1 PR에서 Project Check의 다음 단계가 모두 PASS해야 한다.

```text
Run R3 Project Check contract and routing self-test
Plan changed path ownership and validators
Run changed path owning validators
```

Project Check가 별도 semantic owner를 선택하거나 manual review로 fan-out하면 R1 BLOCKER다.

## 완료 조건

- [ ] Project Check workflow conclusion = success
- [ ] Project Check self-test = success
- [ ] changed-path planning = success
- [ ] owning validator execution = success
- [ ] `asset:intake:validate` output status = `PASS_ASSET_INTAKE_STAGE5_OPERATIONAL_ROUTING`
- [ ] trackedBeforeCount = 0 in clean CI checkout
- [ ] trackedAfterCount = 0
- [ ] trackedMutationCount = 0
- [ ] no manual review / no unrelated owner fan-out observed
- [ ] current package alias unchanged
- [ ] semantic/core/adapter output contract unchanged

## BLOCKER

CI proof 전까지 `PENDING_CI_PROOF`.

## REVIEW

- 독립적인 두 번째 동일 validator invocation은 추가 evidence가 없으므로 요구하지 않는다. Project Check가 clean checkout에서 repository package validator를 실제 spawn하는 것을 orchestration execution proof로 사용한다.
- untracked temporary files는 Stage 4/5가 OS temp directory에서 생성 후 제거하며, R1 mutation proof 대상은 tracked repository state다.

## 다음 시작점

R1 PASS 후 다음 단계는 Asset Intake core를 다시 여는 것이 아니라 현재 설치를 실제 domain rollout에 사용하는 단계로 분리한다.

후속 우선순위는 별도 current-state 확인 후 정한다.

## 다시 열리는 조건

- `asset:intake:validate` nonzero
- Stage 5 predecessor chain nonzero
- trackedMutationCount > 0
- Project Check가 asset-intake owner/validator를 선택하지 못함
- manual review 또는 unrelated owner fan-out 발생
- package validator alias 변경
- active graph가 Status Source / Project Status / semantic output을 mutate하도록 변경
