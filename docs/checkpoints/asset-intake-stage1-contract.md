# Asset Intake / Resolver Stage 1 — Shared Contract

기준 시점: 2026-08-28  
상태: `PASS / COMPLETE / READY_FOR_STAGE2`

## 완료 범위

Stage 0에서 정한 책임 경계를 executable v1 contract로 동결했다.

추가 파일:

```text
tools/asset-intake/contract/asset-intake-contract.v1.schema.json
tools/asset-intake/core/contract-v1.mjs
tools/asset-intake/fixtures/skin-stage1-contract-fixtures.v1.json
tools/asset-intake/cli/validate-contract-v1.mjs
data/validation/asset-intake-stage1-contract-summary.v1.json
```

이번 단계에서는 source-root scan, asset byte ingestion, 실제 domain adapter, frontend 변경, `dev`/`build` hook을 구현하지 않는다.

## Contract v1

Shared record:

```text
canonicalKey { kind, value }
domainNativeStatus
normalizedResolutionClass
expectedLocators[]
target?          # domain contract로 이미 확정됐을 때만
evidence[]
```

`canonicalKey`는 ID 생성기가 아니다. 기존 frozen domain key를 담는 envelope다.

공용 resolution class는 아래 5개로 고정한다.

```text
RESOLVED
PENDING
AMBIGUOUS
REJECTED
INVALID
```

기존 상태는 `domainNativeStatus`에 그대로 보존한다. 공용 class가 domain 상태를 덮어쓰지 않는다.

상태 불변식:

```text
RESOLVED -> evidence >= 1
PENDING  -> evidence == 0
```

## Locator / Evidence

v1 locator kind:

```text
FULL_PATH
EXACT_FILENAME
RESOURCE_ID
STATIC_PATH
SPINE_PATH
```

각 locator는 `assetRole`, `locatorKind`, `value`, 선택적 `approvedRoot`를 가진다. 이름 유사도, 파일명 유사도, ID 산술, perceptual similarity는 production locator가 아니다.

Evidence 최소 필드:

```text
expectedLocatorIndex
sourcePath
relativePath
basename
extension
byteSize
signature
sha256
```

선택 metadata는 `sourceArtifact`, `width`, `height`, `exactDuplicateGroup`, `basenameCollisionGroup`이다.

`same sha256 != same canonical object` 원칙을 유지한다. SHA-256은 byte provenance/parity 근거이지 canonical merge 근거가 아니다.

## Semantic 방화벽

Shared record에는 다음 domain 의미 필드를 직접 둘 수 없다.

```text
heroId soldierId equipmentId bannerId ownerId sourceOrder
name nameKr nameCn relation relations canonicalIdentity
```

예를 들어 Equipment는 `equipmentId`를 새 필드로 넣는 대신 다음처럼 기존 frozen key를 전달한다.

```text
canonicalKey.kind = equipmentId
canonicalKey.value = <frozen ID>
```

Schema와 zero-dependency validator는 v1에 정의되지 않은 임의 필드도 거부한다.

## Skin 대표 fixture

Skin Stage 3-2 readiness에서 이미 Stage 3-1 parity PASS한 값만 사용했다. 새 JOIN/경로 추론은 없다.

| Skin | Static | Spine | Model Resource IDs | 역할 |
|---|---|---|---|---|
| 102 | `UI/Icon/HeroSkin_ABS/Skin/Skin_Matthew_01.png` | `Spine/Char/Mathew_ABS/Mathew_Skin01_Prefab.prefab` | 102, 1021, 1022, 1023, 1024 | 최대 distinct resources / total bindings |
| 1901 | `UI/Icon/HeroSkin2_ABS/Skin/Skin_Lista_Skin01.png` | `Spine/Char/Lista_ABS/Lista_Skin01_Prefab.prefab` | 1901 | single-resource 최소 bindings |
| 3701 | `UI/Icon/HeroSkin_ABS/Skin/Skin_Zigodlla_01.png` | `Spine/Char/Zigodlla_ABS/Zigodlla_Skin01_Prefab.prefab` | 3701 | resource당 최대 bindings |

세 fixture 모두 현재 상태를 그대로 반영한다.

```text
domainNativeStatus = READY_FOR_ASSET_EVIDENCE
normalizedResolutionClass = PENDING
evidence = []
target = 미설정
```

## Determinism / Validator

`core/contract-v1.mjs`는 record, locator, evidence를 stable key로 정렬해 source enumeration 순서와 무관한 serialization을 만든다. runtime timestamp는 contract identity나 summary에 넣지 않는다.

실행:

```text
node tools/asset-intake/cli/validate-contract-v1.mjs
```

검증 결과:

```text
39 / 39 PASS
failed = 0
hardErrors = 0
```

Negative guard도 통과했다.

- RESOLVED인데 evidence가 없으면 reject
- domain semantic field 유입 reject
- duplicate canonical key reject
- unknown v1 field reject

별도 로컬 검사에서 JSON Schema Draft 2020-12 meta-schema와 Skin fixture schema validation도 오류 0건이었다. 이를 위해 repository dependency는 추가하지 않았다.

## 보호 결과

변경하지 않은 범위:

- Skin Stage 3-1 locator/inventory, Skin ID, Hero ownership, sourceOrder
- 기존 Skin Stage 3-2 readiness
- Equipment Stage 0/1 frozen contract/evidence/assets
- Soldier/Banner/Hero manifest, relation, frontend resolver, route
- `package.json`, `dev`, `build`

## 완료 판정

```text
Shared schema                  PASS
Deterministic core             PASS
Skin representative fixtures  PASS
Contract validator             PASS
Negative guards                PASS
Schema validity                PASS
Canonical semantics unchanged PASS
Asset bytes unchanged         PASS
Frontend/build hooks unchanged PASS

PASS_ASSET_INTAKE_STAGE1
ASSET_INTAKE_STAGE1_CONTRACT_FROZEN
READY_FOR_STAGE2
```

## 다음 시작점

Stage 2에서는 contract를 재설계하지 않고 Skin 102/1901/3701의 authoritative Unity source/root를 입력받아 exact locator resolution과 file-level evidence/SHA-256 provenance를 생성한다. Stage 3-1 canonical locator와 Skin 의미론은 재계산하지 않는다.

```text
STAGE2_SKIN_REPRESENTATIVE_ASSET_EVIDENCE
```
