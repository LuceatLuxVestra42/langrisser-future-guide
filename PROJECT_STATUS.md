# Project Status

> NEW Status Source authority를 read-only로 정규화/투영한 canonical Project Status 결과다. raw ConfigData나 canonical relation 의미를 재계산하지 않는다.

- Project health: **REVIEW**
- Hard errors: **0**
- Reported review entries: **28**
- Health-impact review entries: **9**
- Blockers: **0**
- Source: `tools/project-status/lib/normalize-project-status.mjs`

| Domain | Lifecycle | Health | Status | Population | Active source | Next work |
|---|---|---|---|---|---|---|
| hero | FROZEN | REVIEW | PASS_WITH_REVIEW | canonicalHeroCount=267 | data/validation/hero-stage6-4-final.v1.json | - |
| soldier | COMPLETE | REVIEW | PASS | canonicalSoldiers=224, normalSoldiers=168, spSoldiers=56, heroSoldierRelations=5977 | data/validation/soldier-stage6-7-site-admission.v1.json | - |
| equipment | FROZEN | REVIEW | PASS_WITH_REVIEW | canonical=390, public=365, general=198, exclusive=167, admissionStatus=FROZEN, admissionGeneral=198, admissionExcluded=8, displayStatus=FROZEN, displayInitial=94, displayPreviousAdditional=80, displayPass=24, displayTotal=198, chronologyAuditStatus=PASS_WITH_REVIEW, chronologyAuditMembership=false, chronologyContractStatus=FROZEN, chronologyTechnicalTarget=32, chronologyPublicCount=28, chronologyPassCount=24, chronologyContractMembership=false | data/validation/equipment-public-presentation-correction-final.v1.json | - |
| hero-soldier | FROZEN | REVIEW | PASS_WITH_REVIEW | heroCount=267, soldierCount=224, canonicalPairCount=5977 | data/validation/hero-soldier-integration-stageC-final.v1.json | - |
| banner | FROZEN | REVIEW | PASS_BANNER_STAGE3_8_REGRESSION_FREEZE | definitions=77, occurrences=94 | data/validation/banner-stage3-8-regression-freeze-summary.v1.json | - |
| skin | COMPLETE | PASS | PASS | skinCount=540, heroCount=267 | data/validation/skin-stage3-2-readiness.v1.json | - |

## Review 상태

> Reported review entry는 source에 남아 있는 review 기록 수다. 현재 health를 REVIEW로 만드는 항목 수와 같지 않다.

- Active review entries: **9**
- Resolved by evidence: **2**
- Deferred non-errors: **8**
- Boundary notes: **9**
- Assigned health-impact issues: **6**
- Unique assigned issues: **25**
- Unassigned review entries: **1**

| Domain | Reported | Health-impact | Active | Resolved | Deferred | Boundary | Health |
|---|---:|---:|---:|---:|---:|---:|---|
| hero | 2 | 1 | 1 | 0 | 0 | 1 | REVIEW |
| soldier | 12 | 4 | 4 | 2 | 1 | 5 | REVIEW |
| equipment | 1 | 1 | 1 | 0 | 0 | 0 | REVIEW |
| hero-soldier | 5 | 2 | 2 | 0 | 0 | 3 | REVIEW |
| banner | 8 | 1 | 1 | 0 | 7 | 0 | REVIEW |
| skin | 0 | 0 | 0 | 0 | 0 | 0 | PASS |

### Health-impact issueKey

> 아래 표는 explicit issueKey가 배정된 health-impact review만 보여준다. issueKey가 없는 review는 추측으로 묶거나 중복 제거하지 않는다.

| Issue key | Domains | Health-impact entries | Reported entries |
|---|---|---:|---:|
| BANNER_MANUAL_IMAGE_PENDING | banner | 1 | 1 |
| EQUIPMENT_SECONDARY_ARCHIVE_PROVENANCE | equipment | 1 | 1 |
| SOLDIER_KR_NAME_OFFICIAL_CONFIRMATION | hero-soldier, soldier | 2 | 2 |
| SOLDIER_RELEASE_DATE_METADATA | hero-soldier, soldier | 2 | 2 |
| SOLDIER_SAME_PATCH_ORDER | soldier | 1 | 1 |
| SOLDIER_SP_INTERNAL_RELEASE_ORDER | soldier | 1 | 1 |

## 운용 경계

- source authority는 NEW Status Source selection만 따른다.
- OLD Project Doctor D1/D5/generated registry를 runtime predecessor로 사용하지 않는다.
- raw ConfigData를 직접 읽지 않는다.
- canonical relation, identity, JOIN 의미를 재계산하지 않는다.
- supplemental source는 명시된 facet 근거만 제공하며 primary lifecycle을 재작성하지 않는다.

