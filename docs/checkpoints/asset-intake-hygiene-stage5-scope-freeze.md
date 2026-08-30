# Asset Hygiene Stage 5-0 — Destructive Scope Freeze

기준일: 2026-08-30

상태: `PASS_WITH_REVIEW / COMPLETE`

freeze: `ASSET_HYGIENE_STAGE5_DESTRUCTIVE_SCOPE_FROZEN`

## 1. authoritative predecessor

- AH-4 admission: `tools/asset-intake/hygiene/generated/asset-hygiene-production-admission-index.v1.json`
- AH-4 quarantine: `tools/asset-intake/hygiene/generated/asset-hygiene-production-quarantine-index.v1.json`
- AH-4 summary: `data/validation/asset-intake-hygiene-stage4-production-admission-summary.v1.json`
- AH-3 classification: `tools/asset-intake/hygiene/generated/asset-hygiene-classification.v1.json`
- AH-2 reference map: `tools/asset-intake/hygiene/generated/asset-hygiene-reference-map.v1.json`

AH-4까지 완료된 production admission/quarantine을 다시 열지 않고 destructive review 경계만 추가했다.

## 2. 전체 population 보호/검토 분리

```text
records                         2188
protected current use           1240
protected evidence retention    491
unreferenced review candidates  457
unassigned                      0
delete approved                 0
```

`UNREFERENCED`는 이 단계에서도 UNUSED/DELETE_ELIGIBLE/DELETE_APPROVED로 승격하지 않는다.

## 3. current-use protection

다음 중 하나라도 참이면 destructive action 금지다.

- AH-3 `activeProduction=true`
- AH-3 `currentFrontendReference=true`

따라서 AH-4 canonical admission 780, path-only current production 443, current frontend provenance review 17을 포함한 현재 사용 자산은 보호 상태를 유지한다.

## 4. evidence retention protection

현재 사용이 아니더라도 `EVIDENCE_ONLY` / `GENERATED_DERIVATIVE`는 explicit successor 또는 retention 결정을 별도로 증명하기 전까지 삭제 후보가 아니다.

## 5. exact duplicate review

1. `sha256:41bab15add8263aa659527517861779055c2fc583a8655c997b420807aed25d1`
   - members: 2
   - allUnreferenced: true
   - semanticIdentityProven: false
   - deleteApproved: false

exact-byte duplicate는 byte equality만 증명한다. semantic role/owner equivalence를 증명하지 않으므로 이 단계에서 삭제 승인하지 않는다.

## 6. unreferenced review roots

- `public/`: 1
- `public/images/banners/`: 431
- `public/images/heroes/`: 5
- `public/images/shared/`: 10
- `src/`: 9
- `tools/`: 1

이 목록은 후속 AH-5-1+ 조사 순서를 정하는 queue이며 삭제 명령이 아니다.

## 7. REVIEW / BLOCKER

REVIEW:
1. `EXACT_DUPLICATE_REQUIRES_SEMANTIC_ROLE_OWNER_REVIEW` — 1
2. `UNREFERENCED_REQUIRES_DOMAIN_REVIEW` — 457

BLOCKER:
- 없음

## 8. 하지 않은 것

```text
delete approval
asset delete / move / rename
format conversion
frontend / consumer / resolver rewrite
semantic or canonical relation recomputation
name JOIN / ID arithmetic / filename role inference
duplicate bytes -> semantic identity inference
unreferenced -> unused inference
```

## 9. 다음 시작점

`ASSET_HYGIENE_5_1_BANNER_EXACT_DUPLICATE_REVIEW`

먼저 유일한 exact-byte duplicate Banner 2개를 별도 대표 fixture로 검토한다. 삭제는 그 검토 결과가 explicit proof를 만들기 전까지 금지한다.

## 10. 다시 열리는 조건

- AH-4 admission/quarantine 변경
- AH-3 classification 또는 AH-2 reference graph 변경
- current frontend/resolver reference 변경
- destructive decision contract 변경

## 11. 최종 판정

```text
PASS_WITH_REVIEW
COMPLETE
ASSET_HYGIENE_STAGE5_DESTRUCTIVE_SCOPE_FROZEN
coverage: 2188/2188
delete approved: 0
hard error: 0
blocker: 0
next: ASSET_HYGIENE_5_1_BANNER_EXACT_DUPLICATE_REVIEW
```
