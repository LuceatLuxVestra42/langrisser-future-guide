# Asset Intake Stage 5 — Operational Routing Checkpoint

기준 main: `0233493f86c86a9e84f4bc119c95a1296c607672`

상태: `PASS_ASSET_INTAKE_STAGE5_OPERATIONAL_ROUTING / COMPLETE`

## 목적

Asset/image가 필요한 작업이 임의의 외부 검색부터 시작하지 않도록 Asset Intake를 실제 운영 순서의 필수 경계로 고정한다.

Stage 5는 새로운 semantic relation을 만드는 단계가 아니다. 이미 검증된 프로젝트 asset evidence를 우선 재사용하고, 미해결일 때만 Stage 2~4 Asset Intake를 통과한 뒤 승인된 외부 source priority로 이동한다.

## authoritative predecessor

- `docs/checkpoints/asset-intake-stage4-repository-integration.md`
- `tools/asset-intake/core/engine-v1.mjs`
- `tools/asset-intake/adapters/skin-v1.mjs`
- `tools/asset-intake/cli/run-v1.mjs`
- Project Doctor D2/D3/D4 V5 Asset Intake tooling admission
- Project Doctor D7 V5 Stage 4 guard contract

Stage 4의 완료된 repository integration을 다시 열지 않는다.

## 운영 라우팅

```text
asset/image 필요
→ 현재 프로젝트 provenance+ID 검증 frozen/generated evidence 확인
  → RESOLVED: 검증된 프로젝트 asset 사용
  → NOT_FOUND: Asset Intake 실행
      → RESOLVED: Asset Intake 검증 결과 사용
      → PENDING: 승인된 외부 source를 순서대로 확인
          1. Bilibili Wiki public original
          2. 기존 한섭 시트 asset Drive
          3. 기타 외부 이미지 source
          → 후보 없음: 다음 source
          → 후보 있음 + provenance/ID evidence 불충분: REJECT
          → 후보 있음 + provenance/ID evidence 확인: Asset Intake로 재투입
              → Asset Intake RESOLVED 후에만 사용
          → 전부 소진: BLOCKED_NO_VERIFIED_ASSET
```

외부 후보를 찾았다는 이유만으로 production asset으로 직접 사용하지 않는다.

## Repository entry

```text
npm run asset:intake:route -- --request <request.json>
npm run asset:intake -- route --request <request.json>
npm run asset:intake:validate
```

routing request는 최소한 다음 상태를 명시한다.

```json
{
  "requestId": "...",
  "canonicalKey": { "domain": "skin", "assetKind": "static", "value": 102 },
  "projectLookup": { "status": "NOT_CHECKED" },
  "assetIntake": { "status": "NOT_RUN" },
  "externalAttempts": []
}
```

라우터는 다음 작업만 결정한다. 외부 사이트를 자동 fetch하거나 임의 relation을 생성하지 않는다.

## fail-closed 규칙

- project evidence lookup 전에 Asset Intake 실행 금지
- project evidence lookup 전에 외부 source search 금지
- Asset Intake `PENDING` 전 외부 source search 금지
- 외부 source 순서 건너뛰기 금지
- provenance evidence 없는 외부 후보 사용 금지
- canonical ID evidence 없는 외부 후보 사용 금지
- 외부 후보 direct production use 금지
- 검증된 외부 후보도 반드시 Asset Intake로 재투입
- name JOIN 금지
- ID arithmetic 금지
- fuzzy/similarity filename matching 금지
- raw ConfigData asset fallback 금지
- historical output silent fallback 금지
- 완료된 semantic relation 재계산 금지

## Project Doctor

D2/D3/D4는 Stage 4 V5를 그대로 재사용한다.

```text
tools/asset-intake/**
data/validation/asset-intake-*
docs/checkpoints/asset-intake-*
        ↓
project-doctor / asset-intake-tooling
        ↓
asset-intake-self-test
```

첫 PR Guard에서 D7 V5가 `asset:intake:validate = validate-stage4-v1.mjs` exact alias를 동결하고 있음이 확인됐다. 따라서 V5를 수정하지 않고 **D7 V6만 추가**해 Stage 5 validator pointer를 admission한다.

```text
D2 V5  유지
D3 V5  유지
D4 V5  유지
D7 V6  Stage 5 validation alias admission
```

이 변경은 Doctor impact/plan/execution 의미를 다시 설계하는 것이 아니라 PR Guard current validation contract만 Stage 5로 전진시키는 owning-layer 수정이다.

Skin/Banner asset final-owner admission은 이 단계 범위가 아니다.

## 완료 조건

```text
asset:intake:validate == PASS_ASSET_INTAKE_STAGE5_OPERATIONAL_ROUTING
doctor:pr-guard:validate == PASS_PROJECT_DOCTOR_D7_GUARD_V6
Project Doctor PR Guard event == pull_request
PR Guard conclusion == success
plan.status == PLAN_READY
manualReviews == []
unmappedPaths == []
selectedChecks includes asset-intake-self-test
asset-intake-self-test exitCode == 0
checksQueued == checksRun
every selected check exitCode == 0
```

최종 PR Guard run은 PR check history를 authoritative evidence로 사용하고 run id를 이 checkpoint에 다시 commit하지 않는다.

## 완료 범위

- deterministic operational routing contract
- routing state machine
- explicit route CLI
- Stage 5 fail-closed validator
- external source priority enforcement
- external-candidate re-ingest boundary
- Project Doctor D2/D3/D4 V5 self-test 재사용
- Project Doctor D7 V6 Stage 5 validator admission

## 명시적으로 하지 않은 것

```text
Skin canonical 540 재계산
Hero↔Skin relation 재계산
sourceOrder 재계산
Skin/Banner final owner promotion
asset bytes 변경
frontend 변경
외부 사이트 자동 fetch
외부 후보 direct production use
D2/D3/D4 재설계
```

## REVIEW / BLOCKER

REVIEW:
- 없음. final PR HEAD의 실제 pull_request PR Guard가 완료 조건을 만족하면 운영 설치가 완료된다.

BLOCKER:
- 없음. routing validator 또는 PR Guard가 nonzero/manual/unmapped로 회귀하면 해당 owning layer만 다시 연다.

## 다음 시작점

Stage 5 merge 후 Asset Intake shared installation은 `ASSET_INTAKE_INSTALLED`로 간주한다. 이후 Hero/Soldier/Equipment/Banner 등 추가 adapter 도입은 core installation 재개가 아니라 domain rollout/adoption 작업으로 분리한다.

## 다시 열리는 조건

- operational routing order 변경
- approved external source priority 변경
- 외부 candidate direct-use 허용으로 계약 변경
- Stage 5 validator가 Stage 2~4 predecessor와 불일치
- Project Doctor가 Asset Intake tooling diff를 선택하지 못함
- `asset-intake-self-test`가 PR Guard에서 누락/nonzero
- D7 current validator alias가 Stage 5 contract와 불일치
