# Asset Intake / Resolver Stage 0 Audit

기준 시점: 2026-08-28

Status: `PASS / COMPLETE / READY_FOR_STAGE1`

## 1. Stage 0 범위

이 단계에서는 Asset Intake / Resolver 자체를 구현하지 않는다.
기존 repository asset pipeline을 대표 샘플로 조사하고, 새 공용 도구의 책임 경계와 설치 위치를 확정한다.

Stage 0에서 확정할 항목:

- 기존 asset producer / manifest / validation / frontend resolver의 역할 분리
- 공용 Asset Intake가 새로 소유할 기능
- 기존 page/domain pipeline이 계속 소유할 기능
- 재사용할 검증 원칙
- 건드리면 안 되는 FINAL/FROZEN 또는 authoritative asset 경계
- Stage 1 contract 작성의 입력

## 2. Repository 구조 판정

현재 repository에는 이미 `tools/`가 존재하며, 현재 확인된 하위 도구는 `tools/spine-renderer/`다.
따라서 새 공용 도구의 설치 위치는 다음으로 고정한다.

```text
tools/asset-intake/
```

단계별 data producer / validator가 다수 존재하는 `scripts/`에 공용 intake engine을 섞지 않는다.
`tools/asset-intake/`는 domain별 기존 pipeline 앞단에서 asset evidence를 정규화하는 독립 도구로 둔다.

권장 데이터 출력 경계:

```text
data/contracts/asset-intake/
data/generated/asset-manifests/
data/validation/asset-intake/
```

Stage 0에서는 위 디렉터리를 생성하지 않는다. 실제 생성은 Stage 1 contract 확정 이후로 미룬다.

## 3. 기존 asset pipeline 대표 감사

| 영역 | 현재 authoritative / frozen 상태 | Stage 0 판정 |
|---|---|---|
| Skin | Stage 3-1 locator inventory 완료. Skin 540, static path 540, Spine path 540, model binding 2,277, model resource 789. Stage 3-2는 45/45 readiness PASS지만 authoritative asset evidence 미존재 | 첫 실제 adapter 대상으로 사용. Stage 3-1을 재계산하지 않고 evidence만 공급 |
| Soldier | canonical 224. PNG source evidence 224/224, WebP delivery 224/224. 기존 manifest/audit/resolver 존재 | 신규 resolution 대상이 아니라 regression fixture로 사용. 기존 v9 pipeline 대체 금지 |
| Banner | Stage 3 asset relation FROZEN. repository asset 501, non-null reference 93/93 resolved, 1 explicit manual placeholder. filename similarity/perceptual inference 미사용 | 공용 resolver 정책의 선행 표준 + regression fixture. 기존 frozen relation 대체 금지 |
| Hero | Hero frontend는 frozen consumer 기반이며 asset 미존재를 추론으로 채우지 않는 presentation 경계가 확정됨 | 후속 adapter/regression 대상. canonical Hero 의미나 route를 Intake가 소유하지 않음 |

## 4. Asset Intake가 새로 소유할 책임

공용 engine은 domain 의미론이 아니라 파일 수준의 evidence normalization만 담당한다.

소유 범위:

1. 입력 폴더 scan
2. 상대 경로 / basename / 확장자 수집
3. 실제 file signature 검증
4. 파일 byte size 수집
5. 지원 이미지의 width / height 등 기본 metadata 수집
6. SHA-256 content fingerprint 생성
7. exact-byte duplicate 검출
8. basename collision 검출
9. adapter가 제공한 canonical key / expected locator와의 exact resolution 수행
10. 공통 status 정규화
11. deterministic manifest / validation report 출력

초기 공통 status 후보:

```text
RESOLVED
UNRESOLVED
AMBIGUOUS
INVALID
DUPLICATE
```

정확한 enum과 record schema는 Stage 1 contract에서 동결한다.

## 5. Asset Intake가 소유하지 않는 책임

다음은 기존 canonical/domain pipeline 소유권을 유지한다.

- Hero / Soldier / Skin / Banner 등의 canonical ID 생성
- Hero-Soldier, Hero-Skin, Banner-Hero 등 canonical relation 생성 또는 재계산
- domain별 grouping / ownership 의미 결정
- 이름 유사도로 ID나 asset을 추론
- filename similarity / perceptual similarity를 근거로 자동 연결
- ID 산술 추론
- sourceOrder 재구성
- 기존 FINAL/FROZEN consumer 수정
- PNG → WebP 같은 web derivative 생성 자체
- frontend route / navigation / presentation 의미
- source asset을 덮어쓰는 destructive transform

즉 Asset Intake는 `canonical resolver`가 아니라 `canonical ID를 입력으로 받는 asset evidence resolver`다.

## 6. 재사용할 프로젝트 규칙

기존 pipeline에서 다음 원칙은 공용 Asset Intake에도 그대로 적용한다.

### 6-1. Exact evidence 우선

- 명시적 ID / locator / exact path / exact basename 정책을 우선한다.
- fuzzy filename match를 production resolution으로 사용하지 않는다.
- perceptual similarity로 canonical ownership을 만들지 않는다.

### 6-2. Content provenance

- SHA-256 같은 byte-level fingerprint를 evidence로 보존한다.
- exact duplicate와 semantic/canonical equivalence를 구분한다.
- 같은 bytes라고 canonical object를 자동 병합하지 않는다.

### 6-3. Source와 web derivative 분리

Soldier pipeline처럼 authoritative source와 web-served derivative를 서로 다른 계층으로 유지한다.
Asset Intake가 source evidence를 검사했다고 해서 derivative가 canonical source가 되지 않는다.

### 6-4. Frozen consumer 우선

이미 검증된 manifest / relation / sourceOrder가 있으면 이를 input으로 사용한다.
Asset Intake 도입을 이유로 raw ConfigData 또는 기존 관계를 다시 계산하지 않는다.

### 6-5. Deterministic output

동일한 입력과 동일한 contract에서는 동일한 output이 생성돼야 한다.

- runtime timestamp를 frozen output identity에 넣지 않는다.
- record ordering을 안정적으로 고정한다.
- JSON serialization 순서를 가능한 한 고정한다.

## 7. 보호 경계

Asset Intake 설치 과정에서 아래 기존 결과를 대체하거나 의미 변경하지 않는다.

### Soldier

```text
data/generated/soldier-portrait-manifest.v9.json
data/validation/soldier-portrait-v9-source-audit.json
src/lib/soldier-portrait-assets.ts
public/images/soldiers/{soldierId}.png
public/images/soldiers-webp/{soldierId}.webp
```

### Skin

```text
data/validation/skin-stage3-1-final.v1.json
data/validation/skin-stage3-2-readiness.v1.json
```

Stage 3-1의 Skin ID / Hero ID / sourceOrder / static path / Spine path / model resource locator를 authoritative input으로 취급한다.

### Banner

```text
data/validation/banner-stage3-1-asset-summary.v1.json
```

Stage 3 frozen definition / occurrence identity 및 기존 repository asset relation을 재구성하지 않는다.

### Hero / shared canonical

Hero FINAL_FROZEN consumer와 기존 canonical relation은 asset 작업 때문에 재개하지 않는다.

## 8. Frontend consumer와의 경계

기존 `src/lib/soldier-portrait-assets.ts` 같은 frontend-side resolver는 generated manifest를 읽어 web URL을 제공하는 consumer다.

공용 Asset Intake는 이 consumer를 대체하지 않는다.

권장 흐름:

```text
authoritative/source asset
  ↓
Asset Intake core
  ↓
domain adapter
  ↓
generated asset manifest / validation evidence
  ↓
existing frontend resolver
  ↓
page consumer
```

이 구조로 producer와 presentation consumer를 분리한다.

## 9. package.json / 실행 경계

현재 repository는 ESM 기반 Node script를 npm scripts에서 호출하는 구조다.
Asset Intake도 이후 명시적 command로 연결할 수 있다.

다만 초기 버전에서는 다음에 자동 연결하지 않는다.

```text
npm run dev
npm run build
```

이유:

- 개발/빌드 실행 시 asset manifest가 암묵적으로 변경되는 것을 방지
- evidence source가 mount되지 않은 환경에서 build를 깨뜨리지 않음
- Stage 1~대표 fixture 검증 전 bulk side effect 방지

Stage 1 이후 명시적 opt-in command만 추가하는 방향을 권장한다.

예정 형태:

```text
npm run asset:intake -- ...
```

## 10. 첫 adapter 및 대표 fixture

첫 domain adapter는 `Skin`으로 확정한다.

이유:

- canonical Skin relation은 이미 frozen
- Stage 3-1 locator inventory 완료
- Stage 3-2의 실제 blocker가 asset bytes / authoritative resolution evidence 부재로 명확함
- 대표 fixture가 이미 deterministic하게 선정돼 있음

Stage 1 이후 첫 proof fixture:

```text
Skin 102
Skin 1901
Skin 3701
```

Asset Intake는 이 fixture의 기존 locator를 입력으로 받아 실제 evidence만 resolve한다.
Stage 3-1을 재계산하지 않는다.

## 11. 다른 domain의 초기 역할

### Soldier

- 224/224 source resolution 완료 상태
- 신규 resolver 개발 대상이 아님
- 공용 engine의 hash / metadata / duplicate / deterministic output 회귀검증용 fixture로 사용

### Banner

- exact repository resolution 정책의 reference implementation 역할
- fuzzy match 금지 / SHA-256 provenance / explicit unresolved 처리 검증에 사용
- frozen Stage 3 relation을 새 engine으로 다시 materialize하지 않음

### Hero

- Skin v0.1 안정화 이후 후속 adapter 후보
- 기존 Hero canonical / frontend route 계약을 입력으로만 소비

## 12. Stage 1 인계 항목

Stage 1에서는 구현보다 먼저 다음 contract를 만든다.

1. intake input schema
2. normalized asset record schema
3. status enum
4. domain adapter interface
5. exact-resolution policy
6. deterministic output policy
7. manifest / validation output schema
8. Skin Stage 3-1 → Asset Intake adapter input mapping
9. representative fixture evidence schema

## 13. Stage 0 최종 판정

```text
ASSET_INTAKE_STAGE0_AUDIT
status: PASS
completion: COMPLETE
next: STAGE1_CONTRACT
firstAdapter: SKIN
firstFixtures: [102, 1901, 3701]
canonicalRecomputation: FORBIDDEN
fuzzyResolution: FORBIDDEN
buildHook: NOT_INSTALLED
```

Stage 0 완료 조건인 다음 네 항목은 모두 확정됐다.

- Asset Intake가 새로 책임질 범위: 확정
- 기존 pipeline이 계속 책임질 범위: 확정
- 재사용할 규칙/구조: 확정
- 보호할 frozen / authoritative 결과: 확정

따라서 다음 시작점은 **Stage 1 — Asset Intake Contract**다.
