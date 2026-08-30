# Asset Intake Stage 3 — Skin Domain Adapter Checkpoint

기준 main: `3dcfc5e8dfb3f83ed652950f8af05016944a9704`

상태: `PASS_ASSET_INTAKE_STAGE3_SKIN_ADAPTER_V1 / DOMAIN_ADAPTER_COMPLETE`

## 목적

Stage 1에서 동결한 `asset-intake/v1` Skin 대표 contract와 Stage 2 shared engine을 그대로 소비해 첫 실제 domain adapter를 설치한다.

이번 단계는 Skin canonical 의미를 다시 계산하는 단계가 아니다. 기존 frozen Skin ID, Hero ownership, sourceOrder, static locator, Spine locator, model resource ID를 입력으로만 사용한다.

## 구현

추가 파일:

```text
tools/asset-intake/adapters/skin-v1.mjs
tools/asset-intake/cli/self-test-skin-adapter-v1.mjs
data/validation/asset-intake-stage3-skin-adapter-summary.v1.json
docs/checkpoints/asset-intake-stage3-skin-adapter.md
```

Adapter 입력:

```text
asset-intake/v1 frozen Skin records
+ Stage 2 engine inventory
+ optional explicit confirmed RESOURCE_ID -> prefabPath map
```

Adapter 출력:

```text
asset-intake/v1 normalized document
+ deterministic domain diagnostics
```

## Resolution 정책

record는 모든 expected locator가 exact `RESOLVED`일 때만 shared contract `RESOLVED`로 승격한다.

```text
all locators RESOLVED
→ record RESOLVED
→ locator별 normalized evidence emit

any locator AMBIGUOUS
→ record AMBIGUOUS
→ fail closed / contract evidence 0

otherwise
→ record PENDING
→ contract evidence 0
```

이 정책은 Stage 1의 `PENDING -> evidence == 0` 불변식을 그대로 지킨다.

`RESOURCE_ID`는 explicit confirmed map만 받는다. 다음은 사용하지 않는다.

```text
RESOURCE_ID -> filename 추론
ID arithmetic
name JOIN
filename similarity
cross-root fallback
ambiguous candidate auto-pick
```

## Deterministic locator/evidence linkage

Stage 1 stable serializer는 expected locator를 deterministic order로 정렬한다.

Stage 3 adapter는 evidence를 만들기 전에 frozen input을 먼저 contract canonical order로 정렬한 뒤 resolution을 수행한다. 따라서 serialized `expectedLocatorIndex`가 최종 serialized locator와 계속 같은 대상을 가리킨다.

이 방식으로 Stage 1 contract 파일 자체를 다시 열지 않고 resolved-evidence serialization의 index linkage를 보존한다.

## 대표 self-test

로컬 zero-dependency self-test:

```text
node tools/asset-intake/cli/self-test-skin-adapter-v1.mjs
```

결과:

```text
PASS_ASSET_INTAKE_STAGE3_SKIN_ADAPTER_V1
checks      19
passed      19
failed      0
hardErrors  0
```

확인 범위:

- 대표 Skin 102 / 1901 / 3701 canonical key 보존
- 13 expected locator 전체 exact resolution positive fixture
- 13 normalized evidence 생성
- contract validator 오류 0
- inventory 순서 변화에도 stable output 동일
- serialized evidence index ↔ locator linkage 유지
- RESOURCE_ID map 미제공 시 7 locator PENDING
- 일부 path 누락 시 해당 record만 PENDING
- duplicate exact path 시 해당 record AMBIGUOUS
- conflicting resource map reject
- unconfirmed resource map reject
- semantic field leakage 0

Positive fixture의 asset bytes/paths는 adapter 동작 검증용 synthetic self-test이며 프로젝트 asset resolution authority 주장으로 사용하지 않는다.

## 현재 main의 실제 evidence probe

현재 main에 존재하는:

```text
data/evidence/skin-stage3-2-static-source-evidence.v1.json
```

은 대표 3종의 raw PNG bytes / exact basename / SHA-256을 검증하지만 frozen Unity full directory path, character Spine bytes, model RESOURCE_ID bytes 전체를 증명하지 않는다.

이를 adapter current-state probe에 넣은 결과:

```text
representative 3
RESOLVED        0
PENDING         3
contract evidence 0
```

즉 legacy basename evidence를 frozen Unity full path evidence로 가장하지 않는다.

## 과거 Stage 2 branch evidence 재사용 경계

다음 기존 branch를 다시 확인했다.

```text
work/asset-intake-stage2-path-evidence-complete
work/asset-intake-stage2-resource-map
```

확인된 기존 결과:

- 대표 3종 static + character Spine path evidence 완료
- model resource ID 7종 explicit ConfigData prefab map 확인
- mapped model Prefab bundle entry evidence 확인
- historical domain checkpoint에서는 대표 3종을 `RESOLVED`로 판정

하지만 이 결과를 이번 PR에서 silent promotion하지 않는다.

이유:

현재 shared `asset-intake/v1` evidence record는 locator별 file-level `byteSize`, `signature`, `sha256`를 요구한다. 과거 domain checkpoint의 path/bundle-entry proof와 현재 shared normalized byte evidence는 같은 출력 계약이 아니다.

따라서 과거 결과는 버리지 않고 reviewable predecessor evidence로 유지하되, shared contract `RESOLVED`를 만들 때는 실제 Stage 2 inventory bytes 또는 동등한 file-level evidence를 adapter에 입력한다.

## 보호 경계

변경하지 않은 것:

- Skin canonical 540
- Hero↔Skin frozen relation
- Hero ownership
- sourceOrder
- Stage 3-1 asset inventory
- 기존 Skin Stage 2 evidence files on main
- Stage 1 contract/schema/core
- Stage 2 shared engine
- Equipment/Soldier/Banner/Hero pipelines
- `package.json`
- `dev` / `build`
- Project Doctor D2/D3/D4/D7
- frontend
- asset bytes

## 완료 판정

```text
Skin domain adapter               PASS
Frozen contract consumption       PASS
Stage 2 engine consumption        PASS
Explicit RESOURCE_ID map support  PASS
Fail-closed aggregation           PASS
Determinism                       PASS
Contract validation               PASS
Semantic recomputation            NONE
Current legacy false promotion    NONE

PASS_ASSET_INTAKE_STAGE3_SKIN_ADAPTER_V1
DOMAIN_ADAPTER_COMPLETE
```

## 다음 시작점

Stage 4에서 repository operational integration을 진행한다.

대상:

```text
explicit CLI / npm entry
Project Doctor owning scope / check integration
representative repository execution
regression gate
```

`dev` / `build` 자동 hook은 기존 정책대로 별도 근거 없이 추가하지 않는다.
