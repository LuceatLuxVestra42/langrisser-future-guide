# Asset Hygiene Stage 5-2 — Banner Unreferenced Review

기준일: 2026-08-30

상태: `PASS_WITH_REVIEW / COMPLETE`

freeze: `ASSET_HYGIENE_STAGE5_BANNER_UNREFERENCED_REVIEW_FROZEN`

## 1. authoritative predecessor

- AH-5-0 destructive scope: `data/validation/asset-intake-hygiene-stage5-scope-freeze-summary.v1.json`
- AH-5-1 Banner duplicate review: `data/validation/asset-intake-hygiene-stage5-banner-duplicate-review-summary.v1.json`
- AH-5-0 Banner unreferenced population: 431

AH-5-0/5-1 결과를 재사용했고 asset bytes, Banner semantic identity, canonical ownership을 다시 만들지 않았다.

## 2. target coverage

```text
target Banner unreferenced: 431
reviewed: 431
current reference edges: 0
current Banner resolved relations: 0
path history coverage: 431/431
introduction evidence coverage: 431/431
```

Physical family only:
- `Banner`: 205
- `Picture_Notice`: 226

## 3. current Banner census parity

```text
physical Banner assets: 501
current resolved unique paths: 70
unreferenced review paths: 431
resolved + unreferenced: 501
```

501 = 70 + 431 parity를 검증했다. 이 수치는 current reference coverage이며 unused/delete 의미가 아니다.

## 4. Git path provenance

현재 path의 Git history와 introduction batch를 전수 기록했다. introduction commit은 path provenance일 뿐 Banner role, canonical owner, recurrence/source identity 근거로 사용하지 않는다.

- `e8d63e15179636461c795f94336a231020de3893` — 431 files — add banner assets

## 5. decisions

```text
exact duplicate predecessor members: 2
other unreferenced retain-review: 429
delete eligible: 0
delete approved: 0
```

AH-5-1 duplicate 2개는 기존 retain 판정을 그대로 상속했다. 나머지 path도 reference 부재만으로 unused/delete로 승격하지 않았다.

## 6. REVIEW / BLOCKER

REVIEW:
- `BANNER_UNREFERENCED_RETAINS_REVIEW_ONLY`: 431

BLOCKER:
- 없음

## 7. 하지 않은 것

```text
asset delete / move / rename
format conversion
frontend / consumer / resolver rewrite
semantic relation recomputation
canonical relation recomputation
filename role inference
import batch role/owner inference
unreferenced -> unused inference
reference absence -> delete safety inference
```

## 8. 다음 시작점

`ASSET_HYGIENE_5_3_NON_BANNER_UNREFERENCED_REVIEW`

Banner 431개 review는 여기서 frozen한다. 다음 작업은 AH-5-0에 남은 non-Banner unreferenced 26개만 별도 domain review로 다룬다.

## 9. 다시 열리는 조건

- current Banner resolved relation/reference population 변경
- explicit Banner asset owner/successor/supersession evidence 추가
- repository Banner asset population 변경
- AH-5-1 duplicate decision 변경
- authoritative path provenance contradiction 발견
