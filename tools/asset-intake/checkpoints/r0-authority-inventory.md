# Asset Intake R0 — Current Authority Inventory

기준 main: `7011f4cb2906344a81afb72a6b0ccaf2543efdb4`

상태: `PASS_ASSET_INTAKE_R0_AUTHORITY_INVENTORY / COMPLETE / READY_FOR_R1`

## 목적

Project Tooling 전환 이후 Asset Intake의 현재 active authority와 실행 경계를 다시 확정한다.
기존 Stage 0~5 설치 결과, Asset Hygiene 결과, domain semantic을 재조사하거나 재생성하지 않는다.

이번 R0는 구현 변경 단계가 아니다. 현재 main의 active entrypoint / validator / adapter / frozen evidence / historical orchestration 경계를 분류하고 다음 R1 독립 실행 proof의 시작점을 동결한다.

## authoritative baseline

- main commit: `7011f4cb2906344a81afb72a6b0ccaf2543efdb4`
- `package.json`: `0f2731a377933a808d1d4d0b651eced4119c4739`
- `tools/asset-intake/contract/operational-routing.v1.json`: `45367e73f5557052791062ca6a7686ca943086e9`
- `tools/asset-intake/core/contract-v1.mjs`: `53d3c0a7409a916b2d3018fb50ede003ca2c35ab`
- `tools/asset-intake/core/engine-v1.mjs`: `80897c1fc3b4dbe57870b2123316371e8ac5e83b`
- `tools/asset-intake/core/route-v1.mjs`: `30d87701f4cdc666b749e39ce3bcb27246c4aaeb`
- `tools/asset-intake/adapters/skin-v1.mjs`: `b6d9f2e83e557aa94268da208f3fee69e23d8800`
- `tools/asset-intake/cli/run-v1.mjs`: `e47abfaeb98c6d2dd1e39d2ce371cb413e3dc796`
- `tools/asset-intake/cli/validate-stage4-v1.mjs`: `6908e60a0bed35d02430ccf3bcf02e3d2b6bc0ae`
- `tools/asset-intake/cli/validate-stage5-v1.mjs`: `728bbdf7ad6c6b7f0f287765f317201e0803309e`
- `tools/asset-intake/fixtures/skin-stage1-contract-fixtures.v1.json`: `d6851859b8db3f8b300fb4827814daba5218863d`
- `tools/project-check/contracts/owners.v1.json`: `d2b780c8a6295ca3520a3106b0135611f353ba9d`
- `tools/project-check/contracts/validators.v1.json`: `6a9918905721c0da468f29d611acbfbb0382b70c`

## current package authority

현재 package-level Asset Intake entrypoint는 다음 세 개다.

```text
asset:intake          -> node tools/asset-intake/cli/run-v1.mjs
asset:intake:route    -> node tools/asset-intake/cli/run-v1.mjs route
asset:intake:validate -> node tools/asset-intake/cli/validate-stage5-v1.mjs
```

`run-v1.mjs`의 active command surface는 `scan`, `skin`, `route`다.

## active execution graph

```text
Project Check
  -> owner: asset-intake
  -> validator: asset-intake
  -> npm run asset:intake:validate
      -> validate-stage5-v1.mjs
          -> validate-stage4-v1.mjs
              -> self-test-engine-v1.mjs
              -> self-test-skin-adapter-v1.mjs
              -> run-v1.mjs
                  -> core/engine-v1.mjs
                  -> core/route-v1.mjs
                  -> adapters/skin-v1.mjs

Direct CLI
  -> npm run asset:intake
      -> run-v1.mjs
  -> npm run asset:intake:route
      -> run-v1.mjs route
```

현재 active graph에서 Project Doctor validator/runtime을 호출하는 단계는 없다.
Stage 5 validator는 Stage 4 validator와 Asset Intake 내부 runtime만 직접 호출한다.

## authority classification

| 분류 | 현재 surface | 판정 |
|---|---|---|
| `ACTIVE_AUTHORITY` | `core/contract-v1.mjs`, `core/engine-v1.mjs`, `core/route-v1.mjs`, `contract/asset-intake-contract.v1.schema.json`, `contract/operational-routing.v1.json` | 현재 공용 contract/evidence/routing authority |
| `ACTIVE_ENTRYPOINT` | `cli/run-v1.mjs`, package의 `asset:intake`, `asset:intake:route` | 현재 repository CLI |
| `ACTIVE_VALIDATOR` | `cli/validate-stage5-v1.mjs` + 직접 predecessor `validate-stage4-v1.mjs` + Stage 4 self-tests | 현재 Asset Intake validation chain |
| `ACTIVE_ADAPTER` | `adapters/skin-v1.mjs` | 현재 유일한 domain adapter |
| `ACTIVE_FIXTURE` | `fixtures/skin-stage1-contract-fixtures.v1.json` | Skin representative regression fixture |
| `FROZEN_HYGIENE_EVIDENCE` | `hygiene/generated/**`, `contract/hygiene-*` | 기존 Asset Hygiene 결과/계약. R0에서 재생성하지 않음 |
| `MAINTENANCE_SURFACE` | `core/hygiene-*`, `cli/run-hygiene-*`, `cli/validate-hygiene-*` | package/Project Check의 현재 Asset Intake validator entrypoint가 아님. 필요 시 owning maintenance 작업에서만 재개 |
| `HISTORICAL_EVIDENCE` | `docs/checkpoints/asset-intake-stage0-*` ~ `asset-intake-stage5-*`, Asset Hygiene checkpoints | 선행 결정/검증 기록. 현재 orchestration authority로 사용하지 않음 |
| `CURRENT_ORCHESTRATION_AUTHORITY` | `tools/project-check/contracts/owners.v1.json`, `validators.v1.json` | `tools/asset-intake/** -> asset-intake -> npm run asset:intake:validate` |

## Stage 5 freshness 판정

`docs/checkpoints/asset-intake-stage5-operational-routing.md`의 operational routing 의미는 현재 `operational-routing.v1.json` 및 Stage 5 validator와 일치하므로 재사용한다.

다만 해당 historical checkpoint의 Project Doctor D2/D3/D4/D7 admission 및 PR Guard 설명은 현재 active orchestration authority가 아니다.
현재 authority는 Project Check owner/validator catalog다.

따라서 historical checkpoint를 수정하지 않고 다음 경계로 유지한다.

```text
Stage 5 routing semantics     -> REUSE / CURRENT
Stage 5 Project Doctor wiring -> HISTORICAL_EVIDENCE
Project Check owner/validator -> CURRENT_ORCHESTRATION_AUTHORITY
```

## Project Check boundary

현재 Project Check는 다음을 명시적으로 동결한다.

```text
tools/asset-intake/**
  -> owner: asset-intake
  -> validator: asset-intake
  -> npm run asset:intake:validate
```

Project Check 정책상 legacy Project Doctor validator와 legacy D2/D3/D4/D5/D7 실행은 허용되지 않는다.
Asset 변경은 canonical semantic owner를 자동 재개하지 않는다.

Skin asset final owner는 별도 상태다. 현재 `skin-assets`는 authoritative asset evidence와 independent final owner가 확보될 때까지 manual review이며, 이 R0에서는 변경하지 않는다.

## write / mutation boundary

현재 `run-v1.mjs`는 명시적으로 전달된 `--out` / `--diagnostics` 경로에만 결과를 쓸 수 있다.
Stage 4/5 validator의 자체 생성 파일은 OS temporary directory에 한정되고 종료 시 제거된다.

현재 active Asset Intake graph에서 다음 mutation은 요구되지 않는다.

- Status Source mutation
- Project Status mutation
- canonical semantic mutation
- Skin/Hero relation mutation
- raw ConfigData mutation
- frontend mutation

실제 clean-tree tracked mutation 0 여부는 R1에서 실행 proof로 확인한다.

## large generated hygiene data 처리

`tools/asset-intake/hygiene/generated/**`에는 MB 단위 frozen/generated artifact가 이미 존재한다.
R0에서는 파일 존재/역할만 inventory하고 대형 blob 전체를 다시 읽거나 재생성하지 않았다.
새 authoritative mismatch가 확인되지 않았으므로 기존 Asset Hygiene 결과를 재사용한다.

## 완료 조건 판정

- [x] 현재 main SHA 확정
- [x] package Asset Intake entrypoint 확정
- [x] active core / route / adapter / validator graph 확정
- [x] Project Check current owner/validator authority 확정
- [x] 기존 Stage 5 operational semantics 재사용 가능 확인
- [x] Stage 5의 Project Doctor wiring을 historical evidence로 분리
- [x] frozen hygiene generated 결과 재사용 경계 확정
- [x] Skin/기타 domain semantic 미재개
- [x] Status Source 미재개
- [x] unknown active legacy runtime 없음

## BLOCKER

없음.

## REVIEW

1. R1에서 `npm run asset:intake:validate`를 clean tree에서 직접 실행해 PASS와 tracked mutation 0을 증명한다.
2. 같은 변경 경로를 Project Check로 실행해 `asset-intake` owner/validator selection parity를 확인한다.
3. dormant Asset Hygiene maintenance surface는 현재 R0 blocker가 아니다. active entrypoint로 승격되거나 authoritative mismatch가 생길 때만 다시 연다.
4. Skin authoritative asset bytes/evidence availability는 Asset Intake core R0 blocker가 아니라 후속 Skin rollout 입력 조건이다.

## 다음 시작점

`ASSET_INTAKE_R1_INDEPENDENT_EXECUTION_PROOF`

R1은 현재 동결한 active graph만 실행 검증한다. Asset Intake core 재설치, Asset Hygiene 재생성, Skin relation 재계산은 하지 않는다.

## 다시 열리는 조건

- `package.json` Asset Intake entrypoint 변경
- `tools/project-check/contracts/owners.v1.json`의 Asset Intake owner rule 변경
- `tools/project-check/contracts/validators.v1.json`의 Asset Intake validator 변경
- `operational-routing.v1.json` route order / external source priority / forbidden policy 변경
- active validator chain이 Project Doctor 또는 다른 legacy runtime에 다시 의존
- active CLI가 Status Source / Project Status / canonical semantic을 변경하도록 contract가 바뀜
- Skin adapter canonical key / evidence contract 변경

## 최종 판정

```text
ASSET_INTAKE_CORE_REBUILD_REQUIRED = false
ASSET_INTAKE_ACTIVE_LEGACY_RUNTIME = none_observed_in_active_graph
ASSET_INTAKE_CURRENT_ORCHESTRATOR = project-check
ASSET_INTAKE_R0 = COMPLETE
NEXT = R1_INDEPENDENT_EXECUTION_PROOF
```
