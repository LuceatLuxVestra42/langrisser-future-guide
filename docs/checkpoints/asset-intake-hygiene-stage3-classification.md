# Asset Hygiene Stage 3 — Classification / Review Queue / Freeze

기준일: 2026-08-30

상태: `PASS_WITH_REVIEW / COMPLETE`

freeze: `ASSET_HYGIENE_BASELINE_FROZEN`

## 1. authoritative predecessor

- AH-2 reference map: `tools/asset-intake/hygiene/generated/asset-hygiene-reference-map.v1.json`
- AH-2 summary: `data/validation/asset-intake-hygiene-stage2-reference-crosscheck-summary.v1.json`
- classification population: 2188

AH-1/AH-2의 frozen 결과만 사용했으며 raw ConfigData, 외부 source, filename inference를 사용하지 않았다.

## 2. primary classification

- `ACTIVE_VERIFIED`: 1223
- `EVIDENCE_ONLY`: 491
- `PROVENANCE_UNKNOWN`: 17
- `UNREFERENCED`: 457

`UNREFERENCED`는 UNUSED 또는 DELETE를 의미하지 않는다. reference가 현재 graph에 없다는 사실만 기록한다.

## 3. flags

- `BASENAME_COLLISION`: 784
- `EXACT_DUPLICATE`: 2
- `RESOLVER_COLLISION`: 0
- `REVIEW_REQUIRED`: 474
- `UNVERIFIED_EXTERNAL`: 0

`BASENAME_COLLISION`은 AH-1 candidate flag이며 `RESOLVER_COLLISION`으로 자동 승격하지 않는다.

## 4. review queue

- `P1_CURRENT_FRONTEND_PROVENANCE_UNKNOWN`: 17
- `P3_EXACT_DUPLICATE`: 1
- `P4_UNREFERENCED`: 6

review queue는 전체 파일을 사람이 다시 훑지 않도록 risk group만 압축한 것이다.

## 5. verified evidence index

```text
canonical-key entries      780
repository-path entries    443
verified asset memberships 1714
```

canonicalKey는 AH-2 reference에 이미 존재하는 경우에만 사용했다. Equipment/Banner 등 canonicalKey가 명시되지 않은 verified asset은 repository-path-only entry로 남겼고 filename에서 ID를 만들지 않았다.

## 6. REVIEW / BLOCKER

REVIEW:
1. `PROVENANCE_UNKNOWN_PRESENT` — 17
2. `UNREFERENCED_PRESENT` — 457
3. `EXACT_DUPLICATE_CANDIDATES_PRESENT` — 2
4. `BASENAME_COLLISION_CANDIDATES_PRESENT` — 784

BLOCKER:
- 없음

## 7. 하지 않은 것

```text
delete / move / rename
format conversion
consumer rewrite
production admission / quarantine
external fetch
raw ConfigData read
semantic recomputation
canonical relation recomputation
name JOIN
ID arithmetic
filename 기반 superseded 추론
```

## 8. 완료 조건

- classification coverage 100% (2188/2188)
- unclassified 0
- classifier hard error 0
- Stage 2 structural unresolved 0
- asset/frontend/semantic mutation 0

## 9. 다음 시작점

이번 Asset Hygiene v1은 여기서 STOP한다.

후속 별도 작업:
- AH-4 production admission / quarantine
- AH-5 dedup / move / delete

## 10. 다시 열리는 조건

- repository asset population 변경 또는 explicit baseline migration
- active asset manifest/resolver/source 변경
- AH-2 reference graph structural parity 파손
- source/evidence provenance 변경
- classification contract 변경

## 11. 최종 판정

```text
PASS_WITH_REVIEW
COMPLETE
ASSET_HYGIENE_BASELINE_FROZEN
classification coverage: 2188/2188
unclassified: 0
hard error: 0
blocker: 0
STOP after AH-3
```
