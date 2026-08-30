# Asset Hygiene Stage 5-1 — Banner Exact Duplicate Review

기준일: 2026-08-30

상태: `PASS_WITH_REVIEW / COMPLETE`

freeze: `ASSET_HYGIENE_STAGE5_BANNER_DUPLICATE_REVIEW_FROZEN`

## 1. 대상

- `public/images/banners/Banner/Banner_OptionalWish01.webp`
- `public/images/banners/Banner/Banner_ReturnWish01.webp`
- SHA-256: `41bab15add8263aa659527517861779055c2fc583a8655c997b420807aed25d1`

AH-5-0에서 확정된 유일한 exact-byte duplicate group만 검토했다.

## 2. 확정 사실

- 두 파일의 SHA-256은 동일하다.
- 두 파일 모두 AH-2 current reference count가 0이다.
- 두 파일 모두 AH-3/AH-5-0에서 `UNREFERENCED / REVIEW_CANDIDATE_UNREFERENCED`다.
- 두 파일의 path history는 각각 한 건이며 같은 `e8d63e15179636461c795f94336a231020de3893` / `add banner assets` commit에서 함께 도입됐다.
- current Banner Stage 3-1 resolved relation에는 두 path 모두 없다.

## 3. 확정되지 않은 것

- semantic identity
- Banner role equivalence
- canonical asset ownership equivalence
- 한 파일이 다른 파일의 successor/superseded target이라는 관계
- 삭제 안전성

같은 bytes와 같은 import batch는 위 관계를 증명하지 않는다.

## 4. Banner authoritative boundary

Banner Stage 1-6은 occurrence display asset reference가 canonical asset ownership 증거가 아니며, 동일 asset reference만으로 source/recurrence identity를 역추론하지 말라고 고정한다. Banner Stage 3-1도 canonical asset owner를 결정하지 않고 asset이 banner definition을 병합할 수 없도록 고정한다.

따라서 filename의 `OptionalWish` / `ReturnWish` 문구를 역할 증거로 사용하지 않았다.

## 5. 판정

```text
exact byte duplicate: true
current reference absence: true
same import batch: true
semantic identity proven: false
role equivalence proven: false
owner equivalence proven: false
delete eligible: false
delete approved: false
decision: RETAIN_PENDING_ROLE_OR_OWNER_EQUIVALENCE_EVIDENCE
```

이 판정은 REVIEW이며 BLOCKER가 아니다. 파일은 현재 상태 그대로 유지한다.

## 6. 다시 열리는 조건

- 두 filename/role을 동일 logical asset으로 명시하는 authoritative manifest/source 발견
- explicit canonical owner/successor decision 추가
- current Banner relation/reference 변경
- owner가 한 path를 canonical retained target으로 명시

## 7. 다음 시작점

`ASSET_HYGIENE_5_2_BANNER_UNREFERENCED_REVIEW`

431개 Banner unreferenced population을 이 duplicate fixture와 분리해 검토한다. 이 단계 결과로 두 파일 중 하나를 삭제하거나 431개 population 전체에 dedup 규칙을 확대하지 않는다.
