# Hero ↔ Soldier 통합 Stage C 마감본

- 상태: **완료 / CLOSED**
- 최종 판정: **PASS_WITH_REVIEW / COMPLETE / FINAL_FROZEN**
- 최종 기준 main commit: `b6c2de61a28f17bf68c0d30d64c212d17faae045`
- 최종 checkpoint: `data/validation/hero-soldier-integration-stageC-final.v1.json`
- C-FINAL blob SHA: `db39e1a9fb59a3e07493afe8f66c88b6db7a802d`
- 범위: **Hero 페이지와 Soldier 페이지가 공유하는 상호 관계 데이터의 최종 통합 QA, identity 검증, 특수 관계 회귀 검증, production ownership 동결**

이 문서는 Hero ↔ Soldier 통합 Stage C의 마감 기준이다. 이후 작업에서는 C-0~C-4의 관계 조사나 ConfigData 의미 해석을 이유 없이 다시 열지 않고, 이 문서와 C-FINAL을 우선 체크포인트로 사용한다.

관계 데이터의 원본 의미가 실제로 변경되거나, frozen checkpoint SHA가 달라지거나, C-FINAL gate가 FAIL하는 경우에만 관련 구간을 다시 조사한다. 단순 UI 구현, 이름/출시일 보완, route 변경만으로 A단계 관계 의미나 Stage C 검증을 다시 수행하지 않는다.

---

## 1. Stage C 목적

Stage C의 목적은 A단계에서 확정된 Hero ↔ Soldier canonical relation이 Hero 최종 데이터와 Soldier 최종 데이터에 동일하게 보존되고, 이후 frontend가 그 관계를 재계산하거나 임의 해석하지 않아도 되는 상태까지 최종 고정하는 것이었다.

완료 조건은 다음과 같다.

1. Hero 267명, Soldier 224명, canonical relation 5,977쌍이 최종 Hero/Soldier consumer에서 정확히 동일할 것.
2. canonical ↔ Hero final ↔ Soldier final의 모든 양방향 pair 차이가 0일 것.
3. Hero/Soldier canonical identity와 membership target resolution에 구조 오류가 없을 것.
4. 일반 관계, SP 상속, SP Hero 보상, SecondStageExpandHeroList 등 위험도가 높은 특수 관계가 final consumer까지 보존될 것.
5. production ownership이 단방향으로 고정되고 frontend가 관계 의미를 다시 소유하지 않을 것.
6. raw ConfigData 재조회, 이름 JOIN, ID 산술 추론, 임의 pair patch가 금지될 것.
7. 최종 마감은 C-0~C-4 checkpoint만 읽어도 재현 가능할 것.
8. 남은 REVIEW는 relation/identity 오류가 아니라 presentation/UI integration 범위로 분리될 것.

최종 결과는 위 조건을 모두 만족한다.

---

## 2. Stage C 전체 최종 수치

| 항목 | 최종 값 |
| --- | ---: |
| Hero | 267 |
| Soldier | 224 |
| canonical Hero-Soldier pairs | 5,977 |
| Hero final pairs | 5,977 |
| Soldier final pairs | 5,977 |
| C-1 pair differences | **0** |
| unknown / duplicate identity errors | **0** |
| C-2 structural identity errors | **0** |
| C-3 semantic fixtures | **6 / 6 PASS** |
| C-4 production-boundary violations | **0** |
| C-5 failed checks | **0** |
| hard errors | **0** |
| final pipeline status | **FINAL_FROZEN** |

---

## 3. Stage C 단계별 마감 결과

### C-0 — 최종 입력 계약 동결

**결과: PASS / COMPLETE**

Stage C가 무엇을 입력으로 받아야 하는지 먼저 동결했다.

고정된 핵심 입력:

- A-FINAL canonical relation
- canonical relation set: 5,977 pairs
- byHero index: 267 keys
- bySoldier index: 224 keys
- Hero Stage 6-4 final consumer
- Soldier Stage 6-7 final/admission consumer

핵심 판정:

- A-FINAL: PASS_ACCEPTED
- Hero final: PASS_WITH_REVIEW / COMPLETE / FINAL_FROZEN
- Soldier final: PASS / READY_WITH_REVIEW
- Hero/Soldier가 참조하는 relation snapshot 일치
- blocking mismatch: 0

이 단계부터 Stage C는 새 관계를 추정하거나 ConfigData에서 membership을 다시 만드는 작업이 아니라, 이미 확정된 관계가 최종 consumer에 정확히 전달되었는지를 검증하는 단계로 제한되었다.

기준 파일:

- `data/contracts/hero-soldier-integration-stageC-0-input.v1.json`
- `data/validation/hero-soldier-integration-stageC-0-summary.v1.json`

Frozen summary blob:

- `8ff0dbc475e4ca306bbed4c7aa4666d40af2c5b9`

---

### C-1 — 전체 5,977 pair parity 검증

**결과: PASS / COMPLETE**

다음 3개 관계 집합을 직접 비교했다.

1. A-stage canonical relation set
2. final Hero shard의 `soldiers.ids`
3. final Soldier record의 `heroes.finalHeroIds`

최종 수치:

- Hero: 267
- Soldier: 224
- canonical pairs: 5,977
- Hero final pairs: 5,977
- Soldier final pairs: 5,977

6개 방향 차이는 전부 0이다.

- canonical - Hero: 0
- Hero - canonical: 0
- canonical - Soldier: 0
- Soldier - canonical: 0
- Hero - Soldier: 0
- Soldier - Hero: 0

추가 오류:

- duplicate pair: 0
- malformed pair: 0
- unknown Hero ID: 0
- unknown Soldier ID: 0
- duplicate Hero ID: 0
- duplicate Soldier ID: 0
- Hero shard error: 0
- Soldier record error: 0
- hard error: 0

따라서 5,977개의 Hero ↔ Soldier membership은 canonical, Hero final, Soldier final에서 정확히 동일하다.

기준 파일:

- `data/validation/hero-soldier-integration-stageC-1-pair-parity.v1.json`

Frozen blob:

- `c8a2d96ff5fce0dffb6ffbe89b92d5c37cf78bc3`

---

### C-2 — Consumer identity / ID resolution 검증

**결과: PASS_WITH_REVIEW / COMPLETE**

C-1이 pair 집합의 동일성을 검증했다면, C-2는 그 pair에 사용된 ID가 실제 consumer에서 안전하게 해석되는지를 검증했다.

고정 identity 규칙:

- Hero canonical key: `heroId`
- Soldier canonical key: `soldierId`
- membership value: positive safe integer JSON number
- object key: canonical positive decimal string
- Hero shard path: `data/generated/hero-detail/by-id/{heroId}.json`
- Soldier siteId: `soldier-<soldierId>`

금지:

- 이름 기반 identity JOIN
- numeric offset 기반 identity 추론
- 임의 ID 보정

최종 검증:

- Hero master: 267
- Hero manifest: 267
- Soldier master: 224
- Soldier final records: 224
- shared Soldier metadata: 224
- Hero membership references: 5,977
- Soldier membership references: 5,977

구조 오류는 전부 0이다.

- invalid/duplicate Hero ID: 0
- invalid/duplicate Soldier ID: 0
- Hero manifest invalid key/path mismatch: 0
- Hero shard identity mismatch: 0
- Hero membership type/duplicate/unknown target: 0
- Soldier membership type/duplicate/unknown target: 0
- shared metadata key/id/siteId mismatch: 0
- missing Hero shard: 0
- malformed membership container: 0
- hard error: 0

PASS_WITH_REVIEW인 이유는 relation/identity 오류가 아니라 presentation metadata가 남아 있기 때문이다.

- Soldier KR name unresolved: 41
- release date unresolved: 213
- 실제 route 구현은 별도 UI Integration 범위

기준 파일:

- `data/validation/hero-soldier-integration-stageC-2-id-resolution.v1.json`

Frozen blob:

- `2c1efc5bc324b2f0f3b37db666aafe8633a5a157`

---

### C-3 — 특수 관계 semantic fixture 회귀 검증

**결과: PASS / COMPLETE**

C-1 전체 parity만으로는 특수 관계의 의미가 실제로 보존되었는지 설명하기 어렵기 때문에, A단계에서 이미 확정된 provenance가 다른 대표 경로 6개를 final consumer까지 추적했다.

중요: 이 단계에서는 raw ConfigData를 다시 읽지 않았다. A단계에서 확정된 fixture/provenance와 frozen final consumer만 사용했다.

대표 fixture:

| 유형 | pair | 결과 |
| --- | --- | --- |
| 일반 BASE 관계 | `7:105` | PASS |
| SP 1단계 기본관계 상속 | `8:5622` | PASS |
| SP 2단계 기본관계 상속 | `6:5320` | PASS |
| `SP_HERO_REWARD` 직접 추가 | `10:131` | PASS |
| SP Hero reward → SP Soldier 상속 | `37:5423` | PASS |
| `SecondStageExpandHeroList` | `53:5320` | PASS |

최종 결과:

- semantic fixture: 6
- PASS: 6
- FAIL: 0
- provenance failure: 0
- Hero consumer failure: 0
- Soldier consumer failure: 0
- 1단계 SP의 잘못된 second-stage expand: 0
- hard error: 0

A단계에서 동결된 conceptual count도 유지되었다.

- BASE edges: 5,720
- direct `SP_HERO_REWARD`: 25
- inherited SP Hero reward edges: 5
- `SP_SOLDIER_EXPAND`: 228

이 수치는 C-3에서 ConfigData로 재산출한 것이 아니라 A단계 frozen 결과가 변하지 않았는지 확인한 것이다.

기준 파일:

- `data/validation/hero-soldier-integration-stageC-3-special-fixtures.v1.json`

Frozen blob:

- `a729e5580d34c06fe11c108cbf2700381bd3ca39`

---

### C-4 — Production boundary / ownership 동결

**결과: PASS / COMPLETE**

Hero ↔ Soldier 관계의 production 소유권을 다음과 같이 고정했다.

```text
A-stage relation semantics
        ↓
canonical relation
        ↓
byHero / bySoldier offline projection
        ↓
Hero final soldiers.ids / Soldier final heroes.finalHeroIds
        ↓
frontend presentation / navigation
```

각 레이어의 책임:

- A-stage canonical pipeline: 관계 의미의 유일한 owner
- byHero/bySoldier: canonical relation의 offline projection
- Hero final: Hero 페이지가 소비할 Soldier membership
- Soldier final: Soldier 페이지가 소비할 Hero membership
- frontend: 표시와 navigation만 담당

frontend는 관계 의미의 owner가 아니다.

명시적 금지 규칙:

1. raw ConfigData에서 Hero ↔ Soldier membership 재계산 금지
2. frontend에서 canonical relation을 별도 membership source로 소유 금지
3. frontend에서 byHero/bySoldier를 final consumer 우회용 source로 사용 금지
4. `SP_HERO_REWARD`, `SP_SOLDIER_INHERIT`, `SecondStageExpandHeroList` 재구현 금지
5. `+5000`, `-5000` 등 ID 산술 추론 금지
6. 표시명 기반 membership JOIN 금지
7. Hero consumer를 이용한 Soldier consumer 임시 보정 또는 반대 방향 보정 금지
8. 특정 Hero/Soldier pair 예외 하드코딩 금지
9. presentation/localization 데이터가 membership ID를 변경하는 것 금지

검증 결과:

- canonical relation: 5,977
- byHero: 267 keys / 5,977 pairs
- bySoldier: 224 keys / 5,977 pairs
- frontend source scan: 63 files
- blocked direct import: 0
- blocked semantic reconstruction: 0
- blocked ID arithmetic: 0
- blocked name JOIN: 0
- failed check: 0
- hard error: 0

Hero/Soldier frontend route가 아직 구현되지 않은 것은 C-4 FAIL 조건이 아니다. C-4는 데이터 ownership 경계를 동결하는 단계이며 실제 route/click/back/404/mobile 동작은 이후 UI Integration QA 범위다.

기준 파일:

- `data/contracts/hero-soldier-integration-stageC-4-production-boundary.v1.json`
- `data/validation/hero-soldier-integration-stageC-4-production-boundary.v1.json`

Frozen validation blob:

- `bebc39e3ab7ee1da04e9418315f93d3107387a4c`

---

### C-5 — C-FINAL 최종 봉인

**결과: PASS_WITH_REVIEW / COMPLETE / FINAL_FROZEN**

Stage C 최종 마감은 데이터를 다시 검증하는 방식이 아니라, C-0~C-4의 frozen checkpoint 5개만 읽어서 상호 일관성과 zero-error gate를 확인하는 방식으로 수행했다.

C-5가 읽는 입력은 정확히 다음 5개뿐이다.

- C-0 summary
- C-1 pair parity
- C-2 ID resolution
- C-3 special fixture regression
- C-4 production boundary

읽지 않는 것:

- raw ConfigData
- canonical relation 원본
- byHero/bySoldier 원본
- Hero shards
- Soldier full records
- frontend source

최종 확인:

- Hero: 267
- Soldier: 224
- canonical pairs: 5,977
- C-1 all pair differences: 0
- C-1 unknown/duplicate identity errors: 0
- C-2 structural identity errors: 0
- C-3 fixture failures: 0
- C-4 boundary violations: 0
- failed check: 0
- hard error: 0

C-0~C-4의 실제 blob SHA도 모두 expected frozen SHA와 일치했다.

따라서 Stage C는 **FINAL_FROZEN** 상태로 종료한다.

기준 파일:

- `data/validation/hero-soldier-integration-stageC-final.v1.json`

Frozen blob:

- `db39e1a9fb59a3e07493afe8f66c88b6db7a802d`

---

## 4. 최종 authoritative source hierarchy

Hero ↔ Soldier 관계를 확인할 때 우선순위는 다음과 같다.

### 1순위 — Stage C 최종 상태 확인

- `docs/hero-soldier-stageC-closeout.md`
- `data/validation/hero-soldier-integration-stageC-final.v1.json`

일반적인 이후 작업은 여기서 시작한다.

### 2순위 — final consumer membership

Hero 페이지가 사용할 관계:

- `data/generated/hero-detail/by-id/{heroId}.json`
- membership field: `soldiers.ids`

Soldier 페이지가 사용할 관계:

- `data/generated/soldier-stage6-1-full-records.v1.json`
- membership field: `heroes.finalHeroIds`

frontend는 이 final consumer를 사용한다.

### 3순위 — canonical relation / offline projection

관계 pipeline 자체를 점검해야 할 특별한 경우에만 사용한다.

- `data/generated/hero-soldier-relations.v1.json`
- `data/generated/hero-soldier-by-hero.v1.json`
- `data/generated/hero-soldier-by-soldier.v1.json`

### 4순위 — A-stage provenance

관계 의미 자체가 변경되었는지를 조사해야 할 때만 내려간다.

일상적인 frontend/UI 작업에서 A단계 ConfigData 의미 연구를 다시 시작하면 안 된다.

---

## 5. Final frozen identity 규칙

### Hero

- canonical identity: `heroId`
- 이름은 표시 정보이며 JOIN key가 아니다.
- final membership: Hero shard의 `soldiers.ids`

### Soldier

- canonical identity: `soldierId`
- `siteId = soldier-<soldierId>`는 routing 표현이며 canonical JOIN key가 아니다.
- final membership: Soldier record의 `heroes.finalHeroIds`

### 공통

- membership ID는 positive safe integer JSON number
- object key가 필요한 경우 canonical positive decimal string
- 이름/번역/순서/티어/병종은 canonical membership identity를 대체할 수 없다.

---

## 6. Stage C 이후 절대 다시 사용하지 않을 추론

다음 방식은 Stage C 최종 기준에서 폐기/금지한다.

- Hero 이름과 Soldier 이름 유사도로 관계 생성
- 표시 순서나 인덱스 순서로 ID 대응
- Soldier ID에 `+5000` 또는 `-5000`을 적용하여 SP 관계 추정
- SP 여부, 티어, 병종, 이름을 이용한 membership 자동 추론
- Hero final에서 Soldier final 관계를 재생성
- Soldier final에서 Hero final 관계를 재생성
- UI component 내부에서 relation semantic 재구현
- 특정 누락을 고치기 위한 임의 pair hard-code
- localization/release metadata 상태에 따라 relation 제거 또는 추가

관계 mismatch가 발견될 경우 frontend에서 패치하지 않고 upstream owner로 되돌아가 원인을 수정해야 한다.

---

## 7. 현재 남아 있는 REVIEW

Stage C 최종 판정이 PASS가 아니라 PASS_WITH_REVIEW인 이유는 다음 presentation/UI 항목이 남아 있기 때문이다.

### `SOLDIER_KR_NAME_UNRESOLVED`

- 41건
- classification: REVIEW
- blocking: false

한국어 표시명이 없더라도 canonical `soldierId`와 membership은 유지한다.

### `RELEASE_DATE_UNRESOLVED`

- 213건
- classification: REVIEW
- blocking: false

출시일/정렬 메타는 Hero ↔ Soldier membership과 별개다.

### `ROUTE_IMPLEMENTATION_SEPARATE_FROM_IDENTITY`

- classification: REVIEW
- blocking: false

ID와 `siteId` round-trip은 검증되었지만 실제 배포 route 동작은 UI Integration 범위다.

### `PRESENTATION_METADATA_INCOMPLETE`

- classification: REVIEW
- blocking: false

localization/release/assets 보완은 가능하지만 membership ID를 변경할 수 없다.

### `HERO_SOLDIER_FRONTEND_NOT_YET_IMPLEMENTED`

- classification: REVIEW
- blocking: false

Hero/Soldier 실제 페이지 route 및 reciprocal click UI는 이후 구현한다.

이 REVIEW들은 Stage C를 다시 열어야 할 이유가 아니다.

---

## 8. Stage C를 다시 열어야 하는 조건

다음 중 하나가 실제로 발생할 때만 Stage C 관련 조사를 재개한다.

1. A-stage canonical relation 의미가 의도적으로 변경됨
2. canonical relation set이 새 소스로 재생성되어 frozen SHA가 변경됨
3. Hero 또는 Soldier final consumer의 membership schema가 변경됨
4. C-0~C-4 frozen checkpoint SHA가 변경됨
5. C-FINAL validator가 FAIL함
6. 실제 데이터 업데이트 후 Hero/Soldier canonical population 또는 relation count가 의도적으로 변경됨
7. upstream relation pipeline의 버그가 객관적으로 확인됨

다음은 재개 조건이 아니다.

- UI 디자인 변경
- route path 변경
- 한국어 이름 추가
- 출시일 추가
- 이미지/아이콘/asset 교체
- 정렬 방식 변경
- mobile layout 변경
- 클릭 컴포넌트 구현

---

## 9. 이후 frontend 구현 시 소비 규칙

frontend는 관계를 계산하는 곳이 아니라 frozen membership을 표시하고 이동하는 곳이다.

### Hero → Soldier

1. Hero final shard를 읽는다.
2. `soldiers.ids`를 그대로 사용한다.
3. 각 `soldierId`를 Soldier metadata/detail에 resolve한다.
4. 클릭 시 해당 Soldier route로 이동한다.

### Soldier → Hero

1. Soldier final record를 읽는다.
2. `heroes.finalHeroIds`를 그대로 사용한다.
3. 각 `heroId`를 Hero detail에 resolve한다.
4. 클릭 시 해당 Hero route로 이동한다.

frontend에서 두 목록이 다른 것처럼 보일 경우 한쪽을 다른 쪽으로 보정하지 않는다. 데이터 mismatch로 간주하고 frozen pipeline을 검사한다.

---

## 10. 다음 작업 시작점 — UI Integration

Stage C 이후 다음 단계는 관계 데이터 연구가 아니라 **frontend/UI Integration**이다.

권장 분리 순서:

1. Hero/Soldier route 계약 구현
2. Hero → Soldier reciprocal link 구현
3. Soldier → Hero reciprocal link 구현
4. ID resolve 실패 / 404 처리
5. browser back/forward 동작 확인
6. direct URL 진입 확인
7. 모바일/좁은 화면 navigation QA
8. 대표 fixture 기반 실제 클릭 회귀 QA
9. presentation REVIEW 보완

UI QA에서는 C-3의 대표 pair를 그대로 재사용할 수 있다.

- `7:105`
- `8:5622`
- `6:5320`
- `10:131`
- `37:5423`
- `53:5320`

이 fixture들은 관계 의미를 다시 검증하기 위한 것이 아니라 UI가 frozen membership을 정확히 표현하고 이동시키는지 확인하는 click fixture로 재사용한다.

---

## 11. Stage C 최종 체크포인트 목록

| Stage | 결과 | 기준 파일 | Frozen blob |
| --- | --- | --- | --- |
| C-0 | PASS / COMPLETE | `data/validation/hero-soldier-integration-stageC-0-summary.v1.json` | `8ff0dbc475e4ca306bbed4c7aa4666d40af2c5b9` |
| C-1 | PASS / COMPLETE | `data/validation/hero-soldier-integration-stageC-1-pair-parity.v1.json` | `c8a2d96ff5fce0dffb6ffbe89b92d5c37cf78bc3` |
| C-2 | PASS_WITH_REVIEW / COMPLETE | `data/validation/hero-soldier-integration-stageC-2-id-resolution.v1.json` | `2c1efc5bc324b2f0f3b37db666aafe8633a5a157` |
| C-3 | PASS / COMPLETE | `data/validation/hero-soldier-integration-stageC-3-special-fixtures.v1.json` | `a729e5580d34c06fe11c108cbf2700381bd3ca39` |
| C-4 | PASS / COMPLETE | `data/validation/hero-soldier-integration-stageC-4-production-boundary.v1.json` | `bebc39e3ab7ee1da04e9418315f93d3107387a4c` |
| C-5 / C-FINAL | PASS_WITH_REVIEW / COMPLETE / FINAL_FROZEN | `data/validation/hero-soldier-integration-stageC-final.v1.json` | `db39e1a9fb59a3e07493afe8f66c88b6db7a802d` |

---

## 12. 최종 판정

Hero ↔ Soldier 통합 데이터는 다음 상태로 마감한다.

- canonical Hero population: **267**
- canonical Soldier population: **224**
- reciprocal relation pairs: **5,977**
- pair mismatch: **0**
- unknown/duplicate identity error: **0**
- structural identity error: **0**
- special semantic fixture failure: **0**
- production boundary violation: **0**
- hard error: **0**
- pipeline status: **FINAL_FROZEN**

따라서 Hero ↔ Soldier 관계 데이터는 사이트 구현의 production input으로 사용할 수 있다.

남아 있는 REVIEW는 한국어 표시명, 출시 메타, presentation metadata, 실제 frontend route/click 구현과 같은 비차단 항목이다. 이 항목들은 canonical membership의 정합성을 변경하지 않는다.

**Stage C는 여기서 종료한다.**

이후 Hero ↔ Soldier 작업은 관계를 다시 추론하는 작업이 아니라, frozen final consumer를 정확히 사용하는 UI Integration 작업으로 이어간다.
