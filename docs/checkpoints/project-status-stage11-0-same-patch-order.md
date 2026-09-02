# Project Status Stage 11-0 — Soldier same-patch chronology boundary

- Status: COMPLETE
- Owner: project-status
- Authoritative predecessor: `main@0b71d0dfece50d4fe763bd1dfee8817d71715989`
- Primary Soldier source: `data/validation/soldier-stage6-7-site-admission.v1.json`
- Lifecycle contract: `tools/project-status/contracts/review-lifecycle.v1.json`

## Decision

`SAME_PATCH_ORDER_UNRESOLVED` is a chronology/presentation boundary, not an active health-impact review.

The established Soldier chronology rule does not require an absolute order inside one release patch/batch. Release metadata is modeled by release date / patch / release batch where evidence exists; an intra-batch presentation tiebreaker is a separate UI policy and must not be promoted into canonical chronology semantics.

Therefore:

- lifecycle: `ACTIVE_REVIEW` -> `BOUNDARY_NOTE`
- healthImpact: `true` -> `false`
- issueKey remains `SOLDIER_SAME_PATCH_ORDER` for historical traceability

## Preserved scope

- canonical Soldier population remains 224 = 168 normal + 56 SP
- Hero-Soldier relation remains 5,977 pairs
- `RELEASE_DATE_UNRESOLVED = 213` remains active
- `SP_INTERNAL_RELEASE_ORDER_UNRESOLVED = 56` remains active pending Stage 11-B requirement review
- no Soldier semantic recomputation
- no raw ConfigData read
- no name JOIN, ID arithmetic, or chronology inference

## Projection result

- global active review entries: 9 -> 8
- global boundary notes: 9 -> 10
- global health-impact review entries: 9 -> 8
- health-impact issue keys: 6 -> 5
- Soldier active reviews: 4 -> 3
- Soldier boundary notes: 5 -> 6
- Soldier health-impact reviews: 4 -> 3
- project health remains REVIEW
- blockers remain 0

## Validation

- Project Status writer apply: PASS
- Project Status writer check after apply: PASS / zero stale canonical targets
- current Project Status parity test: PASS
- diff whitespace check: PASS

## Handoff

Stage 11-0 is closed. Next owner is Soldier release metadata research (Stage 11-A): inventory existing evidence for the 213 unresolved release metadata records without deriving release order from Soldier IDs.

## Reopen conditions

Reopen Stage 11-0 only if authoritative chronology evidence establishes a real canonical ordering requirement within a single patch/release batch, or if the lifecycle contract stops projecting `SAME_PATCH_ORDER_UNRESOLVED` as a non-health boundary.
