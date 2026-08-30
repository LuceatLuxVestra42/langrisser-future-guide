# Soldier Training Material Assets A0 — Freshness Adoption

상태: `PASS / COMPLETE`

브랜치: `work/soldier-training-material-assets-stage1`

기준 main: `bd44e14c3ae913031944689180eb0f13ab66e528`

## 목적

`A0`는 용병 훈련 재료 의미론을 다시 조사하는 단계가 아니다.
기존 `soldier-material-item-census` 브랜치에서 확정된 24개 훈련 재료 Item population과 ItemInfo exact JOIN을 최신 main 위의 asset-acquisition 작업으로 안전하게 승계한다.

## authoritative predecessor

재사용하는 frozen 결과:

- `data/generated/soldier-training-material-census.v1.json`
  - source branch: `soldier-material-item-census`
  - blob: `e53a8e6aff92d843a711462001469830ec1c9fb6`
  - status: `PASS`
- `data/generated/soldier-training-material-iteminfo.v1.json`
  - source branch: `soldier-material-item-census`
  - blob: `9df7bbba18064e34f46cf2f4fd99d1904cbd3d63`
  - status: `PASS`
- `data/validation/soldier-training-material-repo-assets.v1.json`
  - source branch: `soldier-material-item-census`
  - blob: `133e46756003a1377118d0649e84825f9c6d77a2`
  - status: `PASS`
  - asset admission: `BLOCKED_REPOSITORY_ASSETS_MISSING`

기존 source branch HEAD:

`269f02a673d5f86b5264e0bb335589b21585354d`

## freshness 확인

### Soldier training predecessor

현재 브랜치의:

`data/generated/soldier-detail-stage5-4.v1.json`

blob SHA:

`b4ab27f673318f9d44642d3fc674ccfa682937f6`

기존 census가 기록한 predecessor SHA와 동일하다.

판정: `FRESH / REUSE_ALLOWED`

### ItemInfo predecessor

현재 브랜치의:

`data/configdata/ConfigDataItemInfo.json`

blob SHA:

`fd34c0a83bd403c1fd01d34f3439e4c24a794f5e`

기존 ItemInfo exact JOIN이 기록한 predecessor SHA와 동일하다.

판정: `FRESH / REUSE_ALLOWED`

## 승계하는 확정 결과

- 일반 3티어 용병: `129`
- Lv1~10 레코드: `1,290`
- material entry: `3,505`
- `goodsType=6`: `3,505 / 3,505`
- malformed: `0`
- 고유 material Item ID: `24`
- ItemInfo exact JOIN: `24 / 24`
- missing Name: `0`
- missing Icon: `0`
- repository exact PNG: `0 / 24`
- repository exact WebP: `0 / 24`

따라서 현재 blocker는 semantic/data blocker가 아니라 asset acquisition blocker다.

## 이번 단계에서 하지 않은 것

- Soldier canonical population 재계산
- Lv1~10 training path 재계산
- material census 재생성
- ItemInfo 재 JOIN
- raw ConfigData 전수 재스캔
- Hero↔Soldier relation 재검증
- source image 다운로드
- WebP 변환
- public asset 배치
- frontend 변경

## 경계

다음은 계속 금지한다.

- name JOIN
- ID arithmetic
- filename similarity / fuzzy matching
- visual similarity로 canonical ID 결정
- raw ConfigData runtime fallback
- historical output silent fallback
- presentation/asset 문제를 semantic failure로 확대

## 완료 조건

- 최신 main 기반 독립 작업 브랜치 생성
- Soldier training predecessor blob 일치
- ItemInfo predecessor blob 일치
- 기존 census validation `PASS / failureCount=0`
- 기존 ItemInfo validation `PASS / failureCount=0`
- 기존 repository asset parity 판정 승계
- semantic recomputation `false`

위 조건을 모두 만족하므로 `A0 = PASS / COMPLETE`로 동결한다.

## REVIEW

없음.

## BLOCKER

`BLOCKED_REPOSITORY_ASSETS_MISSING`

24개 source asset이 아직 repository admission을 통과하지 못했다.

## 다음 시작점

`A1`에서 frozen 24개 `itemId -> ItemInfo.Icon full path`를 Asset Intake의 Soldier training-material domain request로 투영한다.

그 다음 source acquisition에서는 exact locator와 provenance만 사용한다.
Drive/Bilibili/APK 후보는 Asset Intake 경계를 통과하기 전 production asset으로 직접 사용하지 않는다.

## 다시 열리는 조건

- `soldier-detail-stage5-4.v1.json` predecessor blob 변경
- `ConfigDataItemInfo.json`의 frozen 24 Item 관련 authoritative 내용 변경
- census/itemInfo validator 회귀
- ItemInfo Icon locator contract 변경
- 새로운 authoritative evidence가 frozen 24 Item population과 충돌
