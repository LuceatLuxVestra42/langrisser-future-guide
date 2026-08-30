# Asset Hygiene Stage 5-3 — Non-Banner Unreferenced Review

기준일: 2026-08-30

상태: `PASS_WITH_REVIEW / COMPLETE`

freeze: `ASSET_HYGIENE_STAGE5_NON_BANNER_UNREFERENCED_REVIEW_FROZEN`

## 1. authoritative predecessor

- AH-5-0 destructive scope: `data/validation/asset-intake-hygiene-stage5-scope-freeze-summary.v1.json`
- AH-5-2 Banner review: `data/validation/asset-intake-hygiene-stage5-banner-unreferenced-review-summary.v1.json`
- AH-2 reference map: `tools/asset-intake/hygiene/generated/asset-hygiene-reference-map.v1.json`
- movement presentation contract/index: `data/contracts/hero-soldier-movement-type-presentation.v1.json`, `data/generated/shared-movement-type-index.v1.json`
- Spine renderer exact input owner: `tools/spine-renderer/Program.cs`

Banner 431개는 다시 열지 않았고 AH-5-0에 남은 non-Banner 26개만 검토했다.

## 2. target coverage

```text
target non-Banner unreferenced: 26
reviewed: 26
current AH-2 reference edges: 0
Git path history coverage: 26/26
```

Frozen AH-5-0 roots:
- `public/`: 1
- `public/images/heroes/`: 5
- `public/images/shared/`: 10
- `src/`: 9
- `tools/`: 1

Physical subscopes:
- `HERO_PORTRAIT_SAMPLES_ROOT`: 5
- `PUBLIC_ROOT`: 1
- `SHARED_MOVEMENT_ROOT`: 5
- `SHARED_STATS_ROOT`: 5
- `SPINE_RENDERER_INPUT_ROOT`: 1
- `SRC_ASSETS_ROOT`: 9

## 3. current evidence found

```text
exact current tooling input: 1
movement source-identifier filename matches: 5
src same-stem current frontend siblings: 8
post-introduction Git change paths: 0
```

- `tools/spine-renderer/input/Ymir_Skin01.png`는 current Program.cs가 exact filename으로 RequireFile 하는 tooling input이라 삭제 대상에서 보호했다.
- movement PNG 5개는 frozen movement contract/index의 source asset identifier filename과 일치한다. 다만 contract가 실제 extracted PNG delivery/web path를 별도 asset integration으로 남기므로 repository path binding은 확정하지 않았다.
- src PNG와 same-stem frontend sibling이 존재해도 extension 차이만으로 successor/superseded/equivalent를 추론하지 않았다.

## 4. Git provenance

26개 전부 path history를 기록했다. Git history는 path provenance만 제공하며 semantic role, canonical owner, deletion safety를 만들지 않는다.

- `0bd9aa357843a1802e5b9586129d2193d9e70fb5` — 5 files — Add shared movement type icons
- `3190f7973cc6626912c8de24731514df0608a5d9` — 1 files — template: tanstack_start_ts_current-58df4fe22702
- `4428d59d42133054c512283e5e67ce6fd1124ba3` — 5 files — Integrate complete Soldier frontend and 224 portraits
- `5700b06549fa16ec88734a99b8f7aaf5da4b3c24` — 9 files — Changes
- `9d9e8d3709731e5c1fa1fccb012dfb894f86e57d` — 5 files — Add clean PNG-derived Hero WebP samples
- `ecdd605f1ccb0907bfabdce719613b907a90f1ba` — 1 files — add spine 3.3 runtime and ymir test assets

## 5. decisions

- `RETAIN_CURRENT_TOOL_INPUT`: 1
- `RETAIN_PENDING_MOVEMENT_ASSET_DELIVERY_BINDING`: 5
- `RETAIN_REVIEW_ONLY_UNREFERENCED`: 20

`UNREFERENCED`는 UNUSED가 아니다. current tooling exact use가 확인된 1개는 보호했고, movement 5개는 asset delivery binding이 명시적으로 별도 단계이므로 retain-pending으로 남겼다. 나머지는 review-only retain이다.

## 6. Stage 5 review closure

```text
AH-5-0 unreferenced population: 457
AH-5-2 Banner reviewed: 431
AH-5-3 non-Banner reviewed: 26
total reviewed: 457
delete eligible: 0
delete approved: 0
```

## 7. REVIEW / BLOCKER

REVIEW:
- `NON_BANNER_RETAIN_REVIEW_ONLY`: 20
- `MOVEMENT_ASSET_DELIVERY_BINDING_PENDING`: 5
- `SRC_SAME_STEM_FRONTEND_SIBLING_NOT_SUPERSESSION`: 8

BLOCKER:
- 없음

## 8. 하지 않은 것

```text
asset delete / move / rename
format conversion
frontend / consumer / resolver rewrite
semantic / canonical relation recomputation
UNREFERENCED -> UNUSED inference
same-stem / extension -> superseded inference
movement filename -> verified repository delivery binding inference
Hero sample filename -> Hero identity inference
stat icon filename -> runtime binding inference
Git history -> deletion safety inference
```

## 9. 다음 시작점

`STOP_AH5_REVIEW_FROZEN_NO_DESTRUCTIVE_APPROVALS`

AH-5 review population 457개는 모두 domain review가 끝났고 destructive approval은 0이다. 새로운 authoritative owner/successor/delete-safety evidence가 없으면 여기서 STOP한다.

## 10. 다시 열리는 조건

- AH-5 frozen unreferenced population 변경
- current exact tooling requirement 변경
- movement PNG delivery/resolver binding이 authoritative하게 확정됨
- explicit owner/successor/supersession/delete-safety evidence 추가
- repository asset population 또는 AH-2 current-reference boundary 변경
