# Asset Hygiene Stage 4 — Production Admission / Quarantine

기준일: 2026-08-30

상태: `PASS_WITH_REVIEW / COMPLETE`

freeze: `ASSET_HYGIENE_STAGE4_PRODUCTION_ADMISSION_FROZEN`

## 1. authoritative predecessor

- AH-3 classification: `tools/asset-intake/hygiene/generated/asset-hygiene-classification.v1.json`
- AH-3 verified evidence index: `tools/asset-intake/hygiene/generated/asset-hygiene-verified-evidence-index.v1.json`
- AH-3 summary: `data/validation/asset-intake-hygiene-stage3-classification-summary.v1.json`
- Asset Intake Stage 5 routing contract: `tools/asset-intake/contract/operational-routing.v1.json`

AH-3의 frozen classification/evidence를 그대로 사용했고 AH-2/AH-3를 재계산하지 않았다. Stage 5 route order와 external source priority도 변경하지 않았다.

## 2. population disposition

```text
classification records                 2188
admitted canonical lookup assets       780
admitted canonical keys                780
current production path-only review     443
quarantined assets                      965
unassigned assets                       0
```

세 disposition은 repository population을 빠짐없이 덮는다. path-only review는 기존 production 사용을 취소하지 않으며, AH-4가 canonical identity를 새로 만들지 않는다는 의미다.

## 3. admission rule

- primaryClass = `ACTIVE_VERIFIED`
- activeProduction trait = true
- AH-3 canonicalKey 존재
- SHA-256 존재
- `RESOLVER_COLLISION`, `UNVERIFIED_EXTERNAL` 없음
- canonical key당 selected active asset 정확히 1개

`EXACT_DUPLICATE`와 `BASENAME_COLLISION`은 resolver ambiguity 증거가 아니므로 자동 차단하지 않는다.

## 4. router compatibility

```text
admitted canonical fixture PASS  780/780
non-admitted fixture PASS         3/3
Stage 5 route contract mutation   0
```

admitted key는 기존 Stage 5 request shape의 `projectLookup.status=RESOLVED`로 변환되어 `USE_PROJECT_VERIFIED_ASSET`에 도달한다. 미승격 key는 `NOT_FOUND`로 변환되어 기존 규칙대로 `RUN_ASSET_INTAKE`로 이동한다.

## 5. REVIEW / BLOCKER

REVIEW:
1. `CURRENT_PRODUCTION_PATH_ONLY_NOT_CANONICAL_ROUTABLE` — 443
2. `CURRENT_REFERENCE_WITHOUT_VERIFIED_PROVENANCE` — 17
3. `NO_CURRENT_REFERENCE_EDGE` — 457
4. `VERIFIED_EVIDENCE_NOT_DIRECT_PRODUCTION` — 491

BLOCKER:
- 없음

## 6. 하지 않은 것

```text
asset delete / move / rename
format conversion
frontend consumer rewrite
existing production consumer revocation
external fetch
raw ConfigData read
semantic recomputation
canonical relation recomputation
path-only canonical promotion
name JOIN / ID arithmetic / filename identity inference
```

## 7. 완료 조건

- frozen AH-3 predecessor PASS/COMPLETE
- 2,188 record disposition coverage 100%
- unassigned 0
- admitted canonical entry가 모두 단일 ACTIVE asset으로 결정됨
- admitted router fixtures 100% `USE_PROJECT_VERIFIED_ASSET`
- non-admitted router fixtures 100% `RUN_ASSET_INTAKE`
- hard error 0 / blocker 0

## 8. 다음 시작점

`ASSET_HYGIENE_5_DEDUP_MOVE_DELETE_SEPARATE_WORK`

AH-5는 별도 destructive-review 작업이다. AH-4 완료가 삭제/이동 허가를 의미하지 않는다.

## 9. 다시 열리는 조건

- AH-3 classification 또는 verified evidence index 변경
- Stage 5 operational routing contract 변경
- current production resolver/source 변경으로 AH-2/AH-3 reopen condition 충족
- canonical admission이 단일 active asset으로 결정되지 않음
- explicit resolver collision / unverified external production evidence 발생

## 10. 최종 판정

```text
PASS_WITH_REVIEW
COMPLETE
ASSET_HYGIENE_STAGE4_PRODUCTION_ADMISSION_FROZEN
coverage: 2188/2188
hard error: 0
blocker: 0
next: AH-5 separate destructive review
```
