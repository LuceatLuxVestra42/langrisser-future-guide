# Project Status

> 자동 생성 파일. `data/generated/project-doctor-d1-1-status.v1.json`을 경량 투영하며 canonical 의미를 재계산하지 않는다.

- Project health: **REVIEW**
- Hard errors: **0**
- Reviews: **31**
- Blockers: **1**
- Source: `data/generated/project-doctor-d1-1-status.v1.json`

| Domain | Lifecycle | Health | Status | Population | Active source | Next work |
|---|---|---|---|---|---|---|
| hero | FROZEN | REVIEW | PASS_WITH_REVIEW | canonicalHeroCount=267 | data/validation/hero-stage6-4-final.v1.json | Hero frontend/UI and web-asset integration. Consume the Stage 6-4 contract; do not reopen Stage 4/5 or Stage B semantics unless a new source snapshot or explicit contradiction requires the owning stage to reopen. |
| soldier | COMPLETE | REVIEW | PASS | canonicalSoldiers=224, normalSoldiers=168, spSoldiers=56, heroSoldierRelations=5977 | data/validation/soldier-stage6-7-site-admission.v1.json | - |
| equipment | FROZEN | REVIEW | PASS_WITH_REVIEW | canonical=390, public=373, general=206, exclusive=167 | data/validation/equipment-stage4-final.v1.json | PC-first review and UI polish follow-up. Equipment Stage 4 and Equipment Image Stage 3 are frozen; do not reopen Stage 2/3 semantics or Stage B ownership unless a concrete regression contradicts a frozen checkpoint. |
| hero-soldier | FROZEN | REVIEW | PASS_WITH_REVIEW | heroCount=267, soldierCount=224, canonicalPairCount=5977 | data/validation/hero-soldier-integration-stageC-final.v1.json | Stage C is closed. Proceed to frontend/UI Integration implementation and route/click/back/404/mobile QA while consuming only the frozen final Hero/Soldier membership consumers. |
| banner | FROZEN | REVIEW | PASS_BANNER_STAGE3_8_REGRESSION_FREEZE | definitions=77, occurrences=94 | data/validation/banner-stage3-8-regression-freeze-summary.v1.json | - |
| skin | IN_PROGRESS | REVIEW | READY_FOR_ASSET_EVIDENCE | skinCount=540, heroCount=267 | data/validation/skin-stage3-2-readiness.v1.json | Provide or mount the authoritative Unity asset source/root, generate Stage 3-2 evidence for the selected fixtures, and rerun the Stage 3-2 validator without recomputing Stage 3-1. |

## 운용 경계

- 이 파일은 Project Doctor D1 상태의 파생 뷰다.
- raw ConfigData를 직접 읽지 않는다.
- canonical relation, identity, JOIN 의미를 재계산하지 않는다.
- 상세 근거는 각 domain의 `activeSource`와 Project Doctor 원본 상태를 따른다.

