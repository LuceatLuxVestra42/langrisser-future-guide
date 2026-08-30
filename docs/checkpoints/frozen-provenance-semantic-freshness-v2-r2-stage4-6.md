# Frozen Provenance / Semantic Freshness V2 — R2 Soldier Stage 4-6

Date: 2026-08-30

Status: `R2-0_COMPLETE / R2-1_COMPLETE / R2-2_COMPLETE / IMPLEMENTATION_NOT_STARTED`

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

### B. Three raw Git-blob equality checks identified for ownership review

- `relationBlobMismatchInValidation`
  - `validation.relationSet.gitBlobSha === current relation blob`
- `relationBlobMismatchInIndex`
  - `bySoldier.relationSet.gitBlobSha === current relation blob`
- `bySoldierBlobMismatchInValidation`
  - `validation.indexes.bySoldier.gitBlobSha === current bySoldier blob`

R2-1 initially treated these as freshness-migration candidates. R2-2 reclassified their ownership from current authoritative contracts and workflow behavior before any code change.

## R2-2 — Stage 4-6 consumer semantic projection and SHA-check disposition

### 1. Consumer semantic payload

The A-7 index contract defines `bySoldierId` as:

- `soldierId -> heroIds[]`
- generated only from canonical A-6 edges
- not an independent semantic source
- intended for the Soldier detail usable-Hero section and Soldier-oriented relation queries
- intentionally excludes provenance/sourceKind and other richer edge evidence

The Stage 4-6 validator likewise states that its production membership source is:

`data/generated/hero-soldier-by-soldier.v1.json#bySoldierId`

and its purpose is adoption of the validated shared relation layer as the sole Soldier -> Hero membership source.

Therefore the Stage 4-6 page-consumer semantic payload is confirmed as exact `(heroId, soldierId)` membership.

### 2. R1 projection reuse decision

Decision: `hero-soldier-membership/v1` is semantically sufficient and reusable for any actual Stage 4-6 downstream freshness classification whose authority is only Soldier -> Hero membership.

No richer Stage 4-6-specific projection is required for consumer membership freshness.

The existing R1 helper already provides deterministic normalization for:

- canonical relation edges -> membership pairs
- bySoldierId -> membership pairs
- duplicate/malformed membership fail-closed behavior
- sorted `(heroId, soldierId)` membership digest

This reuse does not transfer A-stage provenance authority into the page layer.

### 3. Richer semantic predecessor remains A-8

A-6 canonical edges carry both pair identity and provenance. A-8 owns the richer relation invariants, including:

- canonical Hero/Soldier identity
- duplicate-pair rejection
- provenance existence
- allowed sourceKind
- DIRECT origin table/field correctness
- SP inheritance parent/support correctness
- source completeness
- composition/provenance merge rules
- summary integrity
- byHero/bySoldier parity
- traceability

A consumer-level membership digest cannot replace these checks.

### 4. Correction to R2-1: the three SHA checks are not ordinary frozen-freshness checks

Current Stage 4-6 workflow order is:

1. run `scripts/finalize-hero-soldier-relation-layer.cjs`
2. regenerate current A-6 relation set
3. regenerate current A-7 byHero/bySoldier indexes
4. run current A-8 richer validation and write its current relation/index SHA descriptors
5. run `scripts/validate-soldier-stage4-6-relation-consumer.cjs`

The three SHA comparisons therefore verify that the relation, bySoldier index and A-8 validation consumed in the same run belong to the exact same generated snapshot.

They do not compare an old frozen Stage 4-6 snapshot against a newer semantically-equal relation snapshot.

This distinction is authoritative because:

- A-7 requires derived indexes generated together to reference the exact same relation-set blob SHA.
- A-8 publication requires PASS for the exact relation-set blob being approved.
- A-8 traceability explicitly forbids reusing a validation result for a different relation-set blob.
- the current workflow regenerates A-6/A-7/A-8 immediately before Stage 4-6 validation.

### 5. Final disposition of the three checks

The following checks remain exact-SHA blocking traceability checks and MUST NOT be replaced by membership digest equality:

- `relationBlobMismatchInValidation`
- `relationBlobMismatchInIndex`
- `bySoldierBlobMismatchInValidation`

Reason:

`same membership` does not prove that an old A-8 validation result validated the current provenance-bearing relation blob. Replacing these exact-SHA guards with membership equality would permit cross-snapshot reuse that the frozen A-7/A-8 contracts explicitly forbid.

### 6. Semantic Freshness V2 applicability after R2-2

`hero-soldier-membership/v1` remains approved for a separate downstream freshness boundary only if all of the following are true:

1. the compared artifact is a frozen consumer/reference from an earlier snapshot, not a same-run A-7/A-8 traceability descriptor;
2. the consumer authority is membership-only;
3. the current A-8 richer semantic predecessor has independently PASSed for the current relation/index snapshot;
4. malformed or missing evidence remains fail-closed;
5. raw gitBlobSha remains preserved as provenance/audit evidence.

No such separate Stage 4-6 downstream raw-SHA freshness comparison has been proven in R2-2.

## R2-2 final judgment

- Stage 4-6 consumer semantic projection: `hero-soldier-membership/v1` — CONFIRMED for membership-only freshness use.
- New richer Stage 4-6 projection: NOT REQUIRED.
- Existing three Stage 4-6 SHA checks: KEEP EXACT-SHA / TRACEABILITY AUTHORITY.
- Replacing those three checks with semantic digest equality: REJECTED.
- Code mutation in R2-2: NONE.
- Canonical relation rebuild/research: NONE.

This is an evidence-driven correction to the provisional R2-1 migration assumption, not a reopening of A-stage semantics.

## Preserved invariants

- Hero 267
- Soldier 224
- Hero-Soldier pair 5,977
- bySoldier keys 224
- bySoldier relations 5,977
- pair mismatch 0
- duplicate/missing identity errors 0
- legacy regression mismatch 0
- A-8 remains the richer semantic owner
- A-7 indexes remain disposable membership projections

## REVIEW

- R2-3 should locate whether any actual downstream frozen Stage 4-6 consumer/reference compares recorded Stage 4-6 `sharedArtifacts.*.gitBlobSha` to current artifacts outside the same-run A-7/A-8 traceability path.
- If no such downstream raw-SHA freshness consumer exists, R2 should close as `NO_MIGRATION_REQUIRED` rather than weakening traceability or adding unused semantic machinery.

## BLOCKER

None.

## Next start

`R2-3 — locate a genuine downstream Stage 4-6 frozen-reference freshness boundary. Do not modify the three same-run A-7/A-8 exact-SHA traceability checks. If no genuine downstream raw-SHA freshness comparison exists, close R2 as NO_MIGRATION_REQUIRED.`

## Reopen R2-0/R2-1/R2-2 only if

- current `main` materially changes the Stage 4-6 validator/workflow;
- A-7 index authority changes from disposable membership projection to richer semantic source;
- A-8 publication/traceability contract changes;
- Stage 4-6 begins consuming provenance/sourceKind semantics directly;
- or authoritative evidence identifies one of the three exact-SHA checks as an old-vs-current frozen freshness comparison rather than same-run traceability.
