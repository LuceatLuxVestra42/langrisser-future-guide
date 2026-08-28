# Asset Intake / Resolver Stage 0 — Repository Audit

기준 시점: 2026-08-28

상태: `PASS / COMPLETE / READY_FOR_STAGE1`

---

## 1. Stage 0 목적과 완료 범위

이 단계는 Asset Intake / Resolver 자체를 구현하는 단계가 아니다.
현재 저장소의 asset producer / resolver / manifest / validation 구조를 대표 영역별로 확인하고, 공용 도구의 설치 위치와 책임 경계를 확정한다.

이번 Stage 0에서 확정한 항목:

- 공용 Asset Intake의 설치 위치
- 공용 core가 새로 소유할 책임
- 기존 domain pipeline이 계속 소유할 책임
- 재사용할 exact-evidence / provenance / deterministic 규칙
- 보호해야 할 FINAL/FROZEN 및 authoritative asset 결과
- 첫 adapter와 대표 fixture
- Stage 1 contract 작성 시 반드시 호환해야 할 기존 Equipment asset contract

Stage 0에서는 asset bytes를 추가하거나 기존 asset manifest를 재생성하지 않는다.
canonical identity / relation / route / presentation 의미도 변경하지 않는다.

---

## 2. 설치 위치

현재 저장소에는 이미 독립 도구 영역인 `tools/`가 존재한다.
공용 Asset Intake / Resolver의 설치 위치는 다음으로 고정한다.

```text
tools/asset-intake/
```

이 도구를 `scripts/`의 기존 Stage별 producer / validator 사이에 직접 섞지 않는다.
`tools/asset-intake/`는 여러 domain이 공통으로 사용할 수 있는 파일-level evidence 처리 engine으로 둔다.

권장 경계:

```text
tools/asset-intake/
  core/
  adapters/
  cli/
```

실제 세부 디렉터리와 파일명은 Stage 1 contract에서 확정한다.

### output 경계

공용 engine이 모든 domain output을 새로운 중앙 폴더로 강제하지 않는다.
현재 저장소는 domain별 generated / validation artifact가 이미 정착돼 있으므로, adapter가 기존 domain output contract에 맞춰 출력하도록 한다.

예:

```text
data/generated/<domain-specific-manifest>.json
data/validation/<domain-specific-summary>.json
```

공용 contract가 필요하면 Stage 1에서 별도 shared contract를 추가하되, 기존 Soldier / Banner / Equipment / Skin manifest를 이동하거나 이름을 바꾸지 않는다.

---

## 3. 대표 asset pipeline 감사 결과

| 영역 | 현재 확인 상태 | 공용 Asset Intake에서의 역할 |
|---|---|---|
| Skin | canonical Skin 540, Stage 3-1 locator inventory 완료. Stage 3-2 readiness 45/45 PASS이나 실제 authoritative asset evidence가 blocker | **첫 실제 adapter 대상**. Stage 3-1 locator를 입력으로 받아 evidence만 resolve |
| Soldier | canonical 224, authoritative PNG 224/224, web-served WebP 224/224, 기존 manifest/audit/frontend resolver 존재 | 신규 관계 해석 대상 아님. **회귀 fixture**로 사용 |
| Banner | Stage 3 asset relation FROZEN. repository asset 501, non-null reference 93/93 exact resolve, 1 explicit placeholder | exact-resolution / SHA provenance / explicit unresolved 정책의 **reference + regression fixture** |
| Equipment | Image Stage 0 FROZEN, Stage 1 COMPLETE. canonical 390 / public 373. 대표 5종 exact-source proof 및 source↔repository SHA parity 5/5 PASS | 기존 domain asset contract의 **가장 최신 reference implementation**. 공용 contract가 이 규칙과 충돌하면 안 됨 |
| Hero | FINAL_FROZEN consumer 기반 frontend. asset 부재를 추론으로 보완하지 않는 경계 확정 | Skin 안정화 후 후속 adapter 후보. canonical Hero 의미/route는 입력으로만 소비 |

---

## 4. Equipment Image Stage 0~1에서 새로 확인된 공용 기준

Stage 0 조사 도중 최신 main에 Equipment Image Stage 0~1이 완료돼, 공용 Asset Intake contract가 반드시 참고해야 할 선행 패턴이 추가됐다.

### Equipment Stage 0에서 확인된 것

- canonical Equipment: 390
- public: 373
- non-public: 17
- production join key: `equipmentId`
- source locator: `ConfigDataEquipmentInfo.Icon` full path
- web path: `/images/equipment/{equipmentId}.png`
- shared full source icon path: 16개 그룹
- 서로 다른 full path 사이 basename collision: 1개
- 따라서 basename 단독 추론이 아니라 **exact full source path가 필요**

### Equipment Stage 1에서 확인된 것

대표 fixture 5종이 모두 실제 source evidence로 검증됐다.

- weapon: Equipment 6
- armor: Equipment 59
- headgear: Equipment 80
- accessory: Equipment 99
- exclusive-equipment: Equipment 273

검증 방식:

1. dedicated source folder 안에서 frozen source basename의 exact filename 검색
2. raw bytes 확보
3. byte length 확인
4. PNG signature / IHDR 확인
5. dimensions 확인
6. SHA-256 확인
7. repository asset SHA-256 parity 확인

결과:

```text
5 / 5 representative PASS
5 / 5 repository asset present
5 / 5 verified source evidence
5 / 5 source↔repository SHA-256 parity
hard error: 0
review: 0
```

이 구조는 공용 Intake가 새로 별도 철학을 만드는 대신 재사용해야 할 기준이다.

---

## 5. 공용 Asset Intake core가 소유할 책임

공용 core는 domain 의미론이 아니라 **파일과 evidence의 정규화**를 담당한다.

초기 책임 범위:

1. 지정 input root의 파일 scan
2. relative path / basename / extension 수집
3. 실제 file signature 검증
4. byte size 수집
5. 지원 이미지의 width / height 등 기본 metadata 수집
6. SHA-256 content fingerprint 생성
7. exact-byte duplicate 검출
8. basename collision 검출
9. adapter가 준 expected locator와 후보 파일의 exact resolution 지원
10. source ↔ repository byte parity 검증 지원
11. deterministic record ordering / serialization 지원
12. adapter가 domain-native manifest / validation을 생성할 수 있는 normalized evidence 제공

공용 core는 다음 수준의 record를 제공할 수 있어야 한다.

```text
sourcePath
relativePath
basename
extension
byteSize
signature
width
height
sha256
exactDuplicateGroup
basenameCollisionGroup
```

canonical ID나 domain 상태는 adapter가 주입한다.

---

## 6. Domain adapter가 소유할 책임

각 adapter는 기존 frozen domain contract를 해석해서 core에 입력을 제공한다.

예:

```text
Skin adapter
  Skin Stage 3-1 locator
  → expected source path/resource ID
  → Asset Intake core evidence
  → Skin Stage 3-2 evidence artifact
```

```text
Equipment adapter
  frozen equipmentId + full Icon path
  → Asset Intake core evidence
  → 기존 Equipment image contract 형식 유지
```

adapter 책임:

- canonical key 선택
- expected locator 제공
- approved source root 제공
- target repository/web path 제공
- domain-native status 결정
- publication gate 결정
- domain-specific validation 생성

---

## 7. Asset Intake가 소유하지 않는 책임

다음 작업은 명시적으로 금지한다.

- Hero / Soldier / Skin / Banner / Equipment canonical ID 생성
- canonical ownership / grouping / relation 재계산
- Hero-Soldier / Hero-Skin / Banner-Hero relation 재구성
- sourceOrder 재추론
- 이름 JOIN으로 canonical identity 변경
- ID 산술 추론
- filename similarity 기반 production resolution
- perceptual similarity 기반 canonical merge
- same-hash asset을 이유로 canonical object 자동 병합
- 기존 FINAL/FROZEN consumer 수정
- source asset destructive transform
- frontend route / navigation 의미 결정
- raw ConfigData 관계를 frontend용으로 재계산

한 줄로 정리하면:

```text
Asset Intake = asset evidence resolver
Asset Intake ≠ canonical semantic resolver
```

---

## 8. Resolution 정책

### 확정

production resolution은 명시적인 evidence를 우선한다.

우선순위 예:

```text
canonical key
→ frozen expected locator
→ approved source root
→ exact path / exact filename
→ byte validation
→ SHA-256 provenance
```

### 금지

```text
translated-name matching
similar-filename matching
ID arithmetic
cross-root fallback without contract
perceptual image similarity as ownership evidence
```

### basename 주의

Equipment Stage 0에서 실제 basename collision이 확인됐기 때문에 basename은 항상 안전한 global key가 아니다.
adapter가 full source path 또는 approved-root scope를 제공해야 한다.

---

## 9. Status 설계 원칙

Stage 0에서 하나의 공통 status enum을 강제로 동결하지 않는다.

이유:

기존 domain에는 이미 서로 다른 의미 있는 상태가 존재한다.

예:

```text
Equipment:
  PENDING_ASSET
  VERIFIED_EXACT_SOURCE_EXPORT

Banner:
  VERIFIED_MATCHED_FILE
  VERIFIED_MANUAL_REPLACEMENT_FILE
  MANUAL_ASSET_REQUIRED

Hero:
  RESOLVED
  PENDING_ASSET
```

따라서 Stage 1에서는 다음 구조를 우선 검토한다.

```text
normalizedResolutionClass
+ domainNativeStatus
```

예상 normalized class 후보:

```text
RESOLVED
PENDING
AMBIGUOUS
REJECTED
INVALID
```

정확한 enum과 domain mapping은 Stage 1에서 동결한다.
기존 domain-native status를 새 공통 enum으로 덮어쓰지 않는다.

---

## 10. Provenance와 duplicate 정책

### SHA-256

SHA-256은 byte-level provenance와 exact parity 검증에 사용한다.

### exact duplicate

같은 bytes가 여러 경로 또는 여러 canonical object에 존재할 수 있다.

따라서:

```text
same SHA-256
≠ same canonical object
```

으로 취급한다.

### basename duplicate / collision

basename duplicate는 자동 merge 근거가 아니라 REVIEW/evidence scope 확인 신호다.

Equipment처럼 서로 다른 full path가 같은 basename을 가질 수 있으므로 approved root와 full locator를 보존한다.

---

## 11. Source와 web derivative 분리

Soldier pipeline에서 이미 다음 경계가 확정돼 있다.

```text
authoritative/source evidence
  public/images/soldiers/{soldierId}.png

web-served derivative
  public/images/soldiers-webp/{soldierId}.webp
```

공용 Asset Intake도 source/evidence와 web derivative를 동일 객체로 취급하지 않는다.

- source validation은 authoritative bytes 기준
- derivative 생성은 별도 producer 책임
- derivative 존재만으로 source provenance를 확정하지 않음

---

## 12. Deterministic output 원칙

동일 input + 동일 contract라면 동일 output이 생성돼야 한다.

필수 규칙:

- runtime timestamp를 frozen output identity에 사용하지 않음
- record ordering 안정화
- JSON serialization 안정화
- filesystem enumeration 순서에 결과가 의존하지 않도록 정렬
- hash 결과와 path normalization 방식 고정

이 규칙은 기존 Hero list pipeline에서 runtime timestamp로 인해 frozen output determinism이 깨졌던 문제를 반복하지 않기 위한 것이다.

---

## 13. 보호 경계

Asset Intake 도입 때문에 아래 결과를 재계산하거나 대체하지 않는다.

### Skin

```text
Stage 3-1 frozen locator / inventory
Skin ID
Hero ownership
sourceOrder
static path
Spine path
model resource locator
```

Stage 3-2에서는 이 locator를 입력으로 실제 evidence만 추가한다.

### Soldier

```text
data/generated/soldier-portrait-manifest.v9.json
data/validation/soldier-portrait-v9-source-audit.json
src/lib/soldier-portrait-assets.ts
public/images/soldiers/{soldierId}.png
public/images/soldiers-webp/{soldierId}.webp
```

새 core의 regression fixture로 사용할 수 있지만 기존 v9를 새 manifest로 대체하지 않는다.

### Banner

Stage 3 frozen definition / occurrence / repository asset relation을 재구성하지 않는다.
공용 tool은 exact-resolution 규칙을 검증하는 reference로만 사용한다.

### Equipment

Image Stage 0 / Stage 1 frozen contract와 evidence를 재작성하지 않는다.
특히:

```text
equipmentId
ConfigDataEquipmentInfo.Icon full source path
/images/equipment/{equipmentId}.png
대표 5종 source evidence
SHA-256 parity
```

를 기존 authoritative 기준으로 유지한다.

### Hero

Hero FINAL_FROZEN consumer와 route 계약을 asset 작업 때문에 재개하지 않는다.

---

## 14. Frontend resolver와의 경계

현재 Soldier처럼 frontend resolver는 generated manifest를 읽어 실제 URL을 제공하는 consumer 역할을 한다.

공용 Intake가 frontend resolver를 대체하지 않는다.

권장 전체 흐름:

```text
authoritative/source asset
  ↓
Asset Intake core
  ↓
domain adapter
  ↓
domain manifest + validation evidence
  ↓
existing frontend resolver
  ↓
page consumer
```

즉 producer / evidence와 presentation consumer를 분리한다.

---

## 15. npm / build 연결 정책

현재 repository는 ESM 기반 Node script를 npm scripts로 실행할 수 있는 구조다.
따라서 Stage 1 이후 명시적인 CLI entry를 추가하는 것은 가능하다.

예정 형태:

```text
npm run asset:intake -- ...
```

그러나 초기 설치에서는 다음에 자동 연결하지 않는다.

```text
npm run dev
npm run build
```

이유:

- 개발/빌드마다 evidence manifest가 암묵적으로 변경되는 것 방지
- authoritative external source가 없는 환경에서 build 실패 방지
- 대표 fixture 검증 전 bulk side effect 방지

Asset Intake는 opt-in producer/validator로 시작한다.

---

## 16. 첫 adapter — Skin

첫 실제 adapter는 Skin으로 확정한다.

근거:

- canonical Skin relation은 이미 frozen
- Stage 3-1 locator inventory 완료
- Stage 3-2 validation structure 45/45 PASS
- 현재 blocker가 asset bytes / authoritative resolution evidence 부재로 명확함
- 대표 fixture 3종이 이미 고정돼 있음

첫 fixtures:

```text
Skin 102
Skin 1901
Skin 3701
```

공용 Intake는 이 3종의 기존 Stage 3-1 locator를 입력으로 받고 실제 source evidence만 resolve한다.
Stage 3-1 관계나 locator를 재계산하지 않는다.

---

## 17. 다른 domain의 초기 역할

### Equipment

가장 최신 exact-source proof 패턴이므로 Stage 1 contract 설계 reference로 사용한다.
Skin adapter가 구현된 뒤 공용 core로 같은 5 fixture를 검사했을 때 기존 Stage 1 evidence와 같은 byte metadata / SHA parity를 재현하는 regression fixture로 사용할 수 있다.

### Soldier

224/224 source resolution이 완료돼 있으므로 신규 resolution보다 다음 공용 기능의 regression fixture로 적합하다.

- signature
- dimensions
- SHA-256
- duplicate detection
- deterministic ordering

### Banner

다음 정책 regression에 사용한다.

- approved root
- exact basename/path
- no fuzzy fallback
- SHA-256 provenance
- explicit unresolved/manual state

### Hero

Skin v0.1 안정화 이후 후속 adapter 후보로 둔다.

---

## 18. Stage 1 인계 항목

Stage 1에서는 구현보다 먼저 다음 contract를 확정한다.

1. core intake input schema
2. normalized file evidence schema
3. `normalizedResolutionClass + domainNativeStatus` 구조
4. domain adapter interface
5. approved source root / exact locator 규칙
6. SHA-256 provenance / parity 규칙
7. duplicate / basename collision 표현 방식
8. deterministic output contract
9. adapter별 output path 설정 방식
10. Skin Stage 3-1 → Asset Intake input mapping
11. Skin 102 / 1901 / 3701 evidence schema
12. Equipment Stage 0~1 contract와의 compatibility gate

---

## 19. Stage 0 최종 판정

```text
ASSET_INTAKE_STAGE0_AUDIT
status: PASS
completion: COMPLETE
next: STAGE1_CONTRACT
installRoot: tools/asset-intake/
firstAdapter: SKIN
firstFixtures: [102, 1901, 3701]
referenceDomain: EQUIPMENT_IMAGE_STAGE0_1
regressionDomains: [EQUIPMENT, SOLDIER, BANNER]
canonicalRecomputation: FORBIDDEN
fuzzyResolution: FORBIDDEN
forcedCentralManifestMigration: FORBIDDEN
buildHook: NOT_INSTALLED
```

Stage 0 완료 조건:

- 공용 Asset Intake가 책임질 범위: **확정**
- 기존 domain pipeline이 계속 책임질 범위: **확정**
- 설치 위치: **확정**
- 재사용할 exact evidence / provenance 규칙: **확정**
- 보호할 frozen / authoritative 결과: **확정**
- 첫 adapter와 representative fixture: **확정**
- 최신 Equipment asset contract와의 compatibility 요구: **확정**

따라서 다음 시작점은 **Stage 1 — Asset Intake Contract**다.
