# 용병페이지 Stage 6 마감본

- 상태: **완료**
- 최종 판정: **PASS / READY_WITH_REVIEW**
- 최종 기준 main commit: `15611715ca1abef6cd22d4693d25e098267b1eb3`
- 최종 admission: `data/generated/soldier-stage6-7-site-admission.v1.json`
- 최종 validation: `data/validation/soldier-stage6-7-site-admission.v1.json`
- 범위: **용병페이지 데이터 계층 최종 QA 및 사이트 투입 판정**

이 문서는 용병페이지 Stage 6의 마감 기준이다. 이후 작업은 Stage 6-0~6-7의 의미/JOIN 연구를 다시 열지 않고, 이 문서와 Stage 6-7 admission/validation을 우선 기준으로 사용한다. 기존 source가 실제로 변경되거나 Stage 6-7 admission gate가 FAIL할 때만 관련 구간을 다시 조사한다.

---

## 1. Stage 6 목적

Stage 6의 목적은 Stage 5까지 생성된 용병 데이터가 실제 사이트용 데이터 계층으로 안정적으로 사용 가능한지 최종 검증하는 것이었다.

완료 조건은 다음과 같다.

1. canonical Soldier 전체 레코드가 빠짐없이 생성되어 있을 것.
2. 자동 검증 결과가 PASS 또는 명시적 REVIEW만 포함하고 FAIL 레코드는 없을 것.
3. 대표 유형 QA가 통과할 것.
4. 목록/상세/필터 데이터 의미가 일치할 것.
5. Hero → Soldier와 Soldier → Hero 관계가 하나의 검증된 relation set에서 대칭적으로 파생될 것.
6. 향후 확장 및 레벨별 시뮬레이터에 필요한 원천 정보가 축약 없이 보존될 것.
7. 최종 source snapshot과 derivation 규칙이 고정되어 이후 UI 코드가 의미/JOIN을 재해석하지 않아도 될 것.

최종 결과는 위 조건을 모두 만족한다.

---

## 2. Stage 6 단계별 마감 결과

### 6-0 — Stage 5 기준선 동결

**결과: PASS**

Stage 5 최종 산출물과 validation chain을 checkpoint로 고정했다.

고정 기준:

- canonical Soldiers: 224
- normal: 168
- SP: 56
- normal tier-3: 129
- SP second stage true / false: 45 / 11
- Hero-Soldier relations: 5,977
- stage1 missions: 112
- stage2 missions: 45
- confirmed release metadata: 11
- unresolved release metadata: 213
- unresolved KR name: 41

Stage 6에서는 이 checkpoint를 기준으로 regression만 검사하며, Stage 1~5의 의미/JOIN 연구를 이유 없이 다시 열지 않는다.

기준 파일:

- `data/validation/soldier-stage6-0-checkpoint.v1.json`

---

### 6-1 — 전체 레코드 통합 생성

**결과: PASS**

Stage 5의 상세/목록/출시 메타를 canonical Soldier ID 기준으로 하나의 최종 record 구조에 통합했다.

최종 record 구조:

- `soldierId`
- `identity`
- `combat`
- `ability`
- `training`
- `heroes`
- `sp`
- `release`
- `sortBucket`

검증 결과:

- generated records: 224 / 224
- duplicate ID: 0
- invalid ID: 0
- detail/list/release missing: 0
- identity mismatch: 0
- release mismatch: 0
- malformed record: 0
- baseline mismatch: 0

기준 파일:

- `data/generated/soldier-stage6-1-full-records.v1.json`
- `data/validation/soldier-stage6-1-full-records.v1.json`

---

### 6-2 — PASS / REVIEW / FAIL 자동 분류

**결과: PASS / PASS_WITH_REVIEW**

224개 전체 레코드에 구조적 FAIL gate와 명시적 REVIEW 정책을 적용했다.

최종 분류:

- PASS: 11
- REVIEW: 213
- FAIL: **0**

FAIL gate 결과는 전부 0이다.

- duplicate Soldier ID: 0
- TrainingTech level ref missing: 0
- base/SP Hero ID missing: 0
- SP relation missing: 0
- byHero/bySoldier/cross-index mismatch: 0
- undeclared review code: 0
- baseline mismatch: 0

중요: REVIEW 213건은 213개의 데이터 오류를 의미하지 않는다. 대부분 출시 메타가 의도적으로 미확정 상태이기 때문에 REVIEW로 남아 있는 것이다.

주요 REVIEW:

- `KR_NAME_UNRESOLVED`: 41
- `IDENTITY_PRESENTATION_REVIEW`: 41
- `RELEASE_DATE_UNRESOLVED`: 213
- `SP_INTERNAL_RELEASE_ORDER_UNRESOLVED`: 56
- `LOWER_TIER_RELEASE_ORDER_NOT_REQUIRED`: 39

기준 파일:

- `data/generated/soldier-stage6-2-classification.v1.json`
- `data/validation/soldier-stage6-2-classification.v1.json`

---

### 6-3 — 대표 유형 QA

**결과: 6 / 6 PASS**

모든 레코드를 다시 수동 검토하는 대신, 서로 다른 데이터 분기와 위험 지점을 대표하는 fixture를 동결하여 구조 QA를 수행했다.

대표 fixture:

1. 일반 3티어 — Soldier 135 `산맥의 수호자`
2. SP 1단계형 — Soldier 5216 `오크 광전사`
3. SP 2단계형 — Soldier 5115 `근위창병`
4. SP Hero 추가 관계 — Hero 10 → Soldier 131 `교국 위병`, `SP_HERO_REWARD`
5. SecondStageExpandHeroList — Hero 10 → Soldier 5115 `근위창병`, `SP_SOLDIER_EXPAND`
6. 실제 병종/UI 그룹 경계 — Soldier 602 `하이엘프`(ARCHER) / Soldier 1101 `밴디트`(ASSASSIN), 공통 `ARCHER_ASSASSIN`

모든 fixture는 PASS이며 구조 오류는 0이다.

기준 파일:

- `data/fixtures/soldier-stage6-3-fixtures.v1.json`
- `data/validation/soldier-stage6-3-representative-qa.v1.json`

---

### 6-4 — 필터 QA

**결과: 15 / 15 PASS**

필터 의미를 canonical 데이터 기준으로 고정했다.

#### 표시 종류 필터

- 1티어: 12
- 2티어: 27
- 3티어 일반: 129
- SP: 56
- 전체: 224
- 기본값 `3티어 + SP`: 185

`TIER_1 / TIER_2 / TIER_3 / SP`는 하나의 표시 종류 차원에서 OR로 결합하며, 티어 필터는 일반 용병만 대상으로 하고 SP는 `isSp=true`를 명시적으로 사용한다.

#### 실제 병종

- ARCHER: 26
- ASSASSIN: 18
- CAVALRY: 27
- DEMON: 18
- FLYING: 22
- HOLY: 21
- INFANTRY: 30
- LANCER: 26
- MAGE: 18
- WATER: 18

실제 병종 필터는 `identity.armyType` exact equality이다.

#### UI 그룹

- `ARCHER_ASSASSIN`: 44
- `CAVALRY`: 27
- `FLYING_WATER`: 40
- `INFANTRY`: 30
- `LANCER`: 26
- `MAGE_HOLY_DEMON`: 57

UI 그룹 필터는 `identity.uiGroup` exact equality이며 actual class와 별도 차원이다. UI 그룹이 여러 actual class를 합쳐 보여줄 수는 있지만 actual class 필터가 인접 병종까지 포함해서는 안 된다.

#### 이름 검색

- 저장된 `nameKr` / `nameCn`만 사용
- NFKC normalization 후 substring match
- fuzzy / romanization / 임의 번역 alias는 생성하지 않음
- `nameKr=null`이어도 `nameCn` 검색 가능

기준 파일:

- `data/validation/soldier-stage6-4-filter-qa.v1.json`

---

### 6-5 — Hero ↔ Soldier 상호 연결 검증

**결과: PASS**

Hero 페이지와 Soldier 페이지가 서로 별도의 로직으로 관계를 계산하지 않고, 동일한 shared Hero-Soldier relation snapshot을 소비하도록 최종 검증했다.

최종 수치:

- Hero keys: 267
- Hero page keys: 267
- Soldier keys: 224
- Soldier page keys: 224
- canonical relation pairs: 5,977
- byHero pairs: 5,977
- bySoldier pairs: 5,977
- Hero page pairs: 5,977
- Soldier page pairs: 5,977

불일치:

- shared index mismatch: 0
- Hero page missing/extra: 0
- Soldier page missing/extra: 0
- reciprocal mismatch: **0**

규칙:

- Hero → Soldier와 Soldier → Hero는 하나의 validated relation set에서 파생한다.
- 페이지/UI 코드가 Hero-Soldier membership을 재계산하면 안 된다.
- concrete route 구현은 ID를 소비할 수 있지만 membership을 다시 추론하지 않는다.

기준 파일:

- `data/generated/hero-soldier-page-links-stage6-5.v1.json`
- `data/validation/soldier-stage6-5-reciprocal-links.v1.json`

---

### 6-6 — 확장 및 시뮬레이터 데이터 기반 보존

**결과: PASS / FOUNDATION_READY**

이 단계는 시뮬레이터 자체를 구현하는 단계가 아니라, 나중에 구현할 때 필요한 원천 데이터를 잃지 않았는지 검증하는 단계다.

보존 결과:

- 일반 3티어 특성 Lv1~10: 1,290 level records
- 일반 3티어 훈련비 Lv1~10: 1,290 level records
- SP description Lv1~10: 560 level records
- SP stage1 missions: 112
- SP stage2 missions: 45
- SP second stage true / false: 45 / 11
- SP statDelta: 56
- SP expanded Hero references: 228
- Hero-Soldier relation edges: 5,977
- relation provenance records: 5,978

관계 provenance 생산 수:

- `BASE_SOLDIER_HERO`: 4,290
- `SP_HERO_REWARD`: 25
- `SP_SOLDIER_EXPAND`: 228
- `SP_SOLDIER_INHERIT`: 1,435

손실/변형 검증:

- combat preservation mismatch: 0
- ability preservation mismatch: 0
- training preservation mismatch: 0
- SP preservation mismatch: 0
- malformed block: 0
- provenance missing: 0
- baseline mismatch: 0

중요 규칙:

- SP 전체 스탯의 권위 소스는 해당 SP record의 `combat` 전체 값이다.
- `statDelta`는 비교용 메타데이터이며 `normal combat + statDelta`로 SP 전체 스탯을 재구성하면 안 된다.
- Lv5/Lv10 합계는 편의 파생값이며 Lv1~10 per-level cost를 대체하지 않는다.
- Hero eligibility provenance는 shared relation set이 권위 소스다.

기준 파일:

- `data/generated/soldier-stage6-6-expansion-basis.v1.json`
- `data/validation/soldier-stage6-6-expansion-basis.v1.json`

---

### 6-7 — 최종 사이트 진입 게이트

**결과: PASS / READY_WITH_REVIEW**

Stage 6 전체 결과를 하나의 admission gate로 묶었다.

최종 gate:

- generation complete: PASS
- validation classified: PASS
- representative QA: PASS
- list and release: PASS
- filter QA: PASS
- reciprocal Hero links: PASS
- expansion foundation: PASS
- source snapshots frozen: PASS
- derivation documented: PASS

최종 오류 수:

- upstream status failure: 0
- source snapshot mismatch: 0
- coverage mismatch: 0
- FAIL record: 0
- undeclared REVIEW: 0
- representative fixture failure: 0
- filter test failure: 0
- reciprocal pair mismatch: 0
- expansion preservation failure: 0
- documentation missing: 0
- admission gate failure: **0**

기준 파일:

- `data/generated/soldier-stage6-7-site-admission.v1.json`
- `data/validation/soldier-stage6-7-site-admission.v1.json`

---

## 3. Stage 6 최종 기준 수치

| 항목 | 최종 값 |
| --- | ---: |
| canonical Soldiers | 224 |
| normal Soldiers | 168 |
| SP Soldiers | 56 |
| normal tier-3 | 129 |
| PASS records | 11 |
| REVIEW records | 213 |
| FAIL records | **0** |
| representative fixtures | 6 / 6 PASS |
| filter tests | 15 / 15 PASS |
| Hero keys | 267 |
| Soldier keys | 224 |
| Hero-Soldier relations | 5,977 |
| reciprocal mismatch | **0** |
| relation provenance | 5,978 |
| normal ability level records | 1,290 |
| normal training level records | 1,290 |

---

## 4. 현재 사이트 투입 가능 범위

Stage 6-7 기준 다음 데이터 계층은 사이트 통합에 사용할 수 있다.

- list data: **READY**
- detail data: **READY**
- filter semantics: **READY**
- reciprocal Hero links: **READY**
- representative coverage: **READY**
- simulator data foundation: **FOUNDATION_READY**

즉, canonical Soldier 데이터만으로 목록/상세/필터/Hero 상호링크를 안정적으로 지원할 수 있고, 추후 레벨별 시뮬레이터를 만들기 위한 원천 데이터도 보존되어 있다.

Stage 6에서 주장하지 않는 범위:

- 실제 frontend rendering component
- 실제 배포 route
- canonical Soldier image/icon asset ID
- combat formula
- training state mutation/optimization logic
- interactive simulator UI
- 미확정 출시일
- SP 내부 출시순서
- 동일 패치 내부 순서

이 항목들은 Stage 6 미완료가 아니라 **명시적으로 다음 단계 또는 별도 작업으로 유예된 범위**다.

---

## 5. 남아 있는 REVIEW 처리 원칙

최종 admission이 `READY_WITH_REVIEW`인 이유는 구조적 결함이 아니라 명시적 미확정/정책 항목이 남아 있기 때문이다.

### 이름/표시

- `KR_NAME_UNRESOLVED`: 41
- `IDENTITY_PRESENTATION_REVIEW`: 41
- `HERO_PAGE_SOLDIER_DISPLAY_NAME_REVIEW`: 41

처리 원칙:

- 확인되지 않은 한국어명을 합성하지 않는다.
- `nameKr=null`이면 `nameCn`과 상태 정보를 유지한다.
- 이름 REVIEW가 relation membership이나 canonical ID를 변경해서는 안 된다.

### 출시 순서

- `RELEASE_DATE_UNRESOLVED`: 213
- `SP_INTERNAL_RELEASE_ORDER_UNRESOLVED`: 56
- `LOWER_TIER_RELEASE_ORDER_NOT_REQUIRED`: 39
- `SAME_PATCH_ORDER_UNRESOLVED`

처리 원칙:

- Soldier ID 순서를 출시 순서로 사용하지 않는다.
- 외부에서 확인된 출시 정보만 release metadata로 확정한다.
- SP는 현재 UI 정책상 일반 용병보다 앞에 묶을 수 있지만 SP 내부 순서를 임의 추론하지 않는다.

### 에셋/라우트/시뮬레이터

- `REPRESENTATIVE_ASSET_ID_UNFROZEN`
- `ROUTE_IMPLEMENTATION_SEPARATE_FROM_MEMBERSHIP`
- `SIMULATOR_IMPLEMENTATION_DEFERRED`

처리 원칙:

- canonical asset identifier source가 고정되기 전에는 임의 이미지 ID를 생성하지 않는다.
- route 구현은 canonical ID를 소비하고 관계를 재계산하지 않는다.
- 시뮬레이터는 6-6 foundation을 소비하되 combat/stat/training 원천 의미를 재해석하지 않는다.

### 데이터 권위

- `SP_FULL_STATS_ARE_AUTHORITATIVE`
- `RELATION_PROVENANCE_SEPARATE_AUTHORITY`

처리 원칙:

- SP full combat는 SP record 자체가 권위 소스다.
- Hero-Soldier provenance는 shared relation set이 권위 소스다.

---

## 6. 앞으로 재사용할 권위 소스

### 최종 admission

- `data/generated/soldier-stage6-7-site-admission.v1.json`
- `data/validation/soldier-stage6-7-site-admission.v1.json`

### 통합 Soldier record

- `data/generated/soldier-stage6-1-full-records.v1.json`

### 상세/목록

- `data/generated/soldier-detail-stage5-6.v1.json`
- `data/generated/soldier-list-stage5-8.v1.json`
- `data/generated/soldier-release-metadata.v1.json`

### Hero-Soldier 관계

- `data/generated/hero-soldier-relations.v1.json`
- `data/generated/hero-soldier-by-hero.v1.json`
- `data/generated/hero-soldier-by-soldier.v1.json`
- `data/generated/hero-soldier-page-links-stage6-5.v1.json`

### 확장/시뮬레이터 기반

- `data/generated/soldier-stage6-6-expansion-basis.v1.json`

### 계약

- `data/contracts/soldier-detail-stage5-1-contract.v1.json`
- `data/contracts/soldier-identity-contract.v1.json`

---

## 7. 재개 시 작업 규칙

Stage 6 완료 이후 용병페이지 작업을 재개할 때는 다음 순서를 따른다.

1. Stage 6-7 admission/validation 확인.
2. 필요한 page-facing 데이터는 Stage 6-1 full records 또는 Stage 5 final detail/list에서 소비.
3. Hero 관계는 shared relation layer를 소비.
4. 필터는 Stage 6-4 semantics를 그대로 사용.
5. 시뮬레이터/확장은 Stage 6-6 authority를 사용.
6. REVIEW 항목은 명시된 source가 새로 확보됐을 때만 해소.
7. 기존 canonical JOIN, SP 관계, TrainingTech 경로, Hero membership을 UI 코드에서 재추론하지 않음.

다음 상황이 아니라면 Stage 1~6의 확정 분석을 처음부터 다시 수행하지 않는다.

- ConfigData 또는 authoritative external source가 실제 변경됨.
- Stage 6 validation이 FAIL함.
- frozen blob snapshot mismatch가 발생함.
- canonical ID/record count/relation pair에 구체적인 regression 증거가 발생함.

---

## 8. 최종 마감 판정

**용병페이지 Stage 6-0 ~ 6-7은 완료다.**

현재 상태는 데이터 계층 기준으로 **사이트 통합에 진입 가능한 `READY_WITH_REVIEW`**이며, 남아 있는 REVIEW는 이름/출시/에셋/라우트/시뮬레이터 구현 범위의 명시적 유예 항목이다.

구조적 데이터 오류, 누락, Hero-Soldier 방향 불일치, 필터 의미 오염, 원천 보존 손실, snapshot mismatch는 현재 최종 gate에서 모두 0이다.

따라서 이후 작업의 출발점은 Stage 6 재검증이 아니라 **실제 용병페이지 UI 통합, 에셋 연결, 또는 별도 후속 기능 구현**이어야 한다.
