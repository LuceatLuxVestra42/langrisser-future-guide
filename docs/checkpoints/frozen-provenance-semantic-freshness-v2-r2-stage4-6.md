# Frozen Provenance / Semantic Freshness V2 — R2 Soldier Stage 4-6

Date: 2026-08-30

Status: `R2-0_COMPLETE / R2-1_COMPLETE / IMPLEMENTATION_NOT_STARTED`

## R2-0 — authoritative baseline freeze

- branch: `maintenance/frozen-semantic-freshness-v2-r2-stage4-6`
- branch base: `main@bd44e14c3ae913031944689180eb0f13ab66e528`
- predecessor R1: `COMPLETE / PASS / REQUIRED_GUARD_GREEN`
- R1 integration commit: `bd44e14c3ae913031944689180eb0f13ab66e528`
- R1 checkpoint: `docs/checkpoints/frozen-provenance-semantic-freshness-v2-r1-stage6-5.md`
- R2 predecessor validator: `scripts/validate-soldier-stage4-6-relation-consumer.cjs`
- R2 predecessor output: `data/validation/soldier-stage4-6-relation-consumer.v1.json`
- shared canonical relation: `data/generated/hero-soldier-relations.v1.json`
- shared Soldier index: `data/generated/hero-soldier-by-soldier.v1.json`
- shared relation validation: `data/validation/hero-soldier-relation-validation.v1.json`

Frozen predecessor invariants reused without semantic rebuild:

- canonical Hero: 267
- canonical Soldier: 224
- Hero-Soldier relation edges: 5,977
- bySoldier keys: 224
- bySoldier relations: 5,977
- legacy regression edges: 5,977
- relation/index pair mismatch: 0
- duplicate index values: 0
- missing Hero IDs: 0
- missing Soldier index keys: 0
- extra Soldier index keys: 0
- legacy missing pairs: 0
- legacy extra pairs: 0
- per-Soldier legacy mismatch: 0

R2 does not reopen or regenerate:

- Hero canonical identity/population
- Soldier canonical identity/population
- Hero-Soldier canonical relation generation
- A-stage relation semantics/provenance contracts
- raw ConfigData relation research
- name JOIN or ID arithmetic
- frontend/Hosted/Browser QA

## R2-1 — current Stage 4-6 check ownership classification

Current predecessor checks are split into two groups.

### A. Semantic/parity checks that remain blocking and unchanged

- `sharedValidationNotPass`
- `indexRelationCountMismatch`
- `indexPairMismatch`
- `duplicateIndexValues`
- `missingHeroIds`
- `missingSoldierIndexKeys`
- `extraIndexSoldierKeys`
- `legacyMissingPairs`
- `legacyExtraPairs`
- `perSoldierLegacyMismatch`

These checks represent actual shared-layer readiness, membership parity, identity coverage, duplicate/missing-reference integrity, or frozen 3-12 regression parity. R2 must not weaken them.

### B. Raw Git-blob equality checks that are the R2 freshness-migration candidates

- `relationBlobMismatchInValidation`
  - current rule: `validation.relationSet.gitBlobSha === current relation blob`
- `relationBlobMismatchInIndex`
  - current rule: `bySoldier.relationSet.gitBlobSha === current relation blob`
- `bySoldierBlobMismatchInValidation`
  - current rule: `validation.indexes.bySoldier.gitBlobSha === current bySoldier blob`

These three checks currently make exact byte identity a blocking admission condition at the Stage 4-6 consumer boundary.

R2 objective is limited to replacing this downstream freshness interpretation with explicit semantic classification while preserving the recorded `gitBlobSha` values as provenance/audit evidence.

## R2 semantic-boundary constraint before implementation

R1's `hero-soldier-membership/v1` projection is reusable only if the Stage 4-6 consumer authority being migrated is actually membership-only.

The richer A-8 relation validator remains authoritative for relation semantics beyond membership, including:

- edge provenance presence and allowed `sourceKind`
- DIRECT source table/field correctness
- SP inheritance parent/support relation correctness
- source completeness
- provenance merge/composition rules
- summary integrity
- bidirectional index parity
- traceability evidence

Therefore R2 must not silently reinterpret the A-stage relation-validation contract as membership-only. The migration applies only to the Stage 4-6 downstream consumer's three byte-equality freshness checks after the predecessor A-8 validation remains PASS.

## Current R2-1 disposition

Provisional implementation direction:

1. run/preserve the existing shared A-8 validation as the richer semantic predecessor;
2. preserve all Stage 4-6 non-SHA checks above;
3. classify relation/bySoldier snapshot drift semantically at the Stage 4-6 consumer boundary;
4. retain raw `gitBlobSha` in output for provenance/history;
5. keep semantic stale and semantic unknown fail-closed;
6. allow provenance-only byte drift only when the consumer-relevant semantic projection remains equal and inherited predecessor semantic evidence remains healthy.

The exact R2 projection is intentionally not frozen in R2-1. It must be confirmed at R2-2 against the Stage 4-6 consumer contract before code changes. `hero-soldier-membership/v1` is the leading reuse candidate because Stage 4-6's stated production membership source is `bySoldierId`, but no richer relation semantic authority may be discarded to obtain that reuse.

## REVIEW

- Confirm at R2-2 whether the consumer-level projection can reuse `hero-soldier-membership/v1` unchanged or requires a narrowly richer Stage 4-6 projection.
- Confirm workflow/exact-diff ownership before freezing any changed validation artifact.

## BLOCKER

None for R2-0/R2-1.

## Next start

`R2-2 — confirm the Stage 4-6 consumer semantic projection, starting from the existing R1 membership helper and the frozen A-8 predecessor authority.`

## Reopen R2-0/R2-1 only if

- current `main` moved before R2 implementation and materially changed the Stage 4-6 validator/contract;
- the Stage 4-6 predecessor output no longer preserves 224 Soldier / 267 Hero / 5,977 pair parity;
- A-8 relation-validation authority changed;
- or a new authoritative contradiction shows that one of the three identified SHA checks owns richer semantic meaning than recorded here.
