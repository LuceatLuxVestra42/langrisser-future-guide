# Asset Intake Stage 2 — Shared Engine Checkpoint

기준 main: `e1ff955addf53e8e5fb6b732273b28a59bcc375f`

상태: `PASS_ASSET_INTAKE_STAGE2_ENGINE_V1 / SHARED_ENGINE_COMPLETE`

## 목적

Stage 0에서 동결한 file/evidence 책임과 Stage 1 `asset-intake/v1` contract를 그대로 사용해, 실제 source root를 읽을 수 있는 공용 file-level engine을 구현한다.

이번 checkpoint는 기존 Skin Stage 2 representative evidence checkpoint를 대체하거나 재작성하지 않는다. 기존 Skin evidence는 authoritative source/path proof의 진행 기록으로 그대로 보존하고, 이번 작업은 이후 adapter가 그 evidence를 일관된 방식으로 생성할 수 있는 공용 engine만 제공한다.

## 구현

추가 core:

```text
tools/asset-intake/core/engine-v1.mjs
```

제공 기능:

1. 지정 source root 재귀 scan
2. deterministic root-relative path 정규화
3. basename / extension / byteSize
4. file signature
5. PNG/JPEG/GIF/WebP dimensions
6. SHA-256
7. exact-byte duplicate group
8. basename collision group
9. `FULL_PATH` / `STATIC_PATH` / `SPINE_PATH` exact resolution
10. `EXACT_FILENAME` + `approvedRoot` scoped resolution
11. `RESOURCE_ID` + explicit resource map resolution
12. normalized v1 evidence 생성
13. source ↔ repository byte parity helper
14. stable inventory JSON serialization

## Fail-closed 규칙

다음은 자동 추론하지 않는다.

```text
RESOURCE_ID -> filename inference
basename collision -> arbitrary winner
name similarity
filename similarity
ID arithmetic
cross-root fallback
semantic relation recomputation
```

`RESOURCE_ID`는 adapter가 explicit resource map을 제공하지 않으면 `PENDING / RESOURCE_MAP_REQUIRED`로 남긴다.

`EXACT_FILENAME`이 approved root 안에서도 복수이면 `AMBIGUOUS / MULTIPLE_EXACT_MATCHES`로 남긴다.

## Determinism

stable output에는 machine-specific absolute root를 넣지 않는다.

```text
sourcePath   = scanned root 내부 relative path
relativePath = scanned root 내부 relative path
```

실제 source root 식별자가 필요하면 caller가 `sourceArtifact`를 명시적으로 제공한다.

filesystem enumeration 순서와 입력 배열 순서가 달라도 stable inventory serialization 결과는 동일하다.

## Self-test

추가 validator:

```text
tools/asset-intake/cli/self-test-engine-v1.mjs
```

테스트는 임시 디렉터리에 대표 bytes를 생성해서 다음을 확인한다.

- recursive scan
- deterministic ordering
- PNG signature/dimensions
- SHA-256
- exact duplicate grouping
- basename collision grouping
- FULL_PATH exact resolve
- unscoped basename ambiguity
- approvedRoot scoped basename resolve
- missing locator PENDING
- RESOURCE_ID fail-closed
- explicit resource map resolve
- normalized evidence
- exact byte parity
- mismatch parity
- stable serialization
- absolute path leakage 방지

결과:

```text
checks: 19
passed: 19
failed: 0
hardErrors: 0
status: PASS_ASSET_INTAKE_STAGE2_ENGINE_V1
```

## 변경하지 않은 범위

- Stage 1 schema / contract core
- Skin canonical 540 및 Hero↔Skin frozen relation
- 기존 Skin Stage 2 real-evidence checkpoint
- 기존 Stage 3-1 locator/inventory
- Equipment/Soldier/Banner/Hero asset pipeline
- `package.json`
- `dev` / `build` hook
- Project Doctor D2/D3/D4/D7
- frontend
- repository asset bytes

## 다음 시작점

다음 작업은 공용 engine 위에 첫 domain adapter를 붙이는 것이다.

```text
Stage 3
Skin adapter
  frozen Skin locator/evidence input
  -> Asset Intake engine-v1
  -> asset-intake/v1 normalized evidence
  -> Skin domain-native manifest/validation
```

기존에 확보된 Skin static real evidence와 이후 authoritative path/Spine/model evidence를 재사용하고, Skin ID/ownership/sourceOrder는 다시 계산하지 않는다.
