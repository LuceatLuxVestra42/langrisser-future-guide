# Frozen Provenance / Semantic Freshness V2 — R2 Soldier Stage 4-6

Date: 2026-08-30

Status: `R2_COMPLETE / R2-0_COMPLETE / R2-1_COMPLETE / R2-2_COMPLETE / R2-3_COMPLETE / NO_MIGRATION_REQUIRED`

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

## R2-2 final judgment

- Stage 4-6 consumer semantic projection: `hero-soldier-membership/v1` — CONFIRMED for membership-only freshness use.
- New richer Stage 4-6 projection: NOT REQUIRED.
- Existing three Stage 4-6 SHA checks: KEEP EXACT-SHA / TRACEABILITY AUTHORITY.
- Replacing those three checks with semantic digest equality: REJECTED.
- Code mutation in R2-2: NONE.
- Canonical relation rebuild/research: NONE.

This is an evidence-driven correction to the provisional R2-1 migration assumption, not a reopening of A-stage semantics.

## R2-3 — genuine downstream frozen-reference freshness inventory

R2-3 checked the current authoritative Soldier downstream chain rather than inferring ownership from historical file names.

### Current downstream authority

Project Doctor selects:

- Soldier primary/active source: `data/validation/soldier-stage6-7-site-admission.v1.json`
- Hero-Soldier relation active source: `data/validation/hero-soldier-integration-stageC-final.v1.json`

The Stage 4-6 validation output is not a current Project Doctor active source or supplemental Soldier source.

### Stage 6-5 dependency boundary

Current Stage 6-5 reciprocal validation reads the canonical relation layer directly:

- `data/generated/hero-soldier-relations.v1.json`
- `data/validation/hero-soldier-relation-validation.v1.json`
- `data/generated/hero-soldier-by-hero.v1.json`
- `data/generated/hero-soldier-by-soldier.v1.json`
- Hero-page and Soldier-page membership artifacts

It does not consume `data/validation/soldier-stage4-6-relation-consumer.v1.json` as a freshness source.

R1 has already migrated this genuine old-frozen-vs-current reciprocal-membership boundary to `hero-soldier-membership/v1` semantic freshness while retaining raw Git blob provenance.

### Stage 6-7 final dependency boundary

Current Stage 6-7 explicitly declares its direct frozen dependencies with Semantic Freshness V2 descriptors.

The relation path enters Stage 6-7 through:

- Stage 6-5 reciprocal-links manifest/validation
- Stage 6-6 expansion-basis manifest/validation

Other direct sources are Stage 5-7, Stage 5-8, Stage 6-1 through Stage 6-4, the Soldier detail/list/release/full-record artifacts, contract and checkpoint.

`data/validation/soldier-stage4-6-relation-consumer.v1.json` is not present in the Stage 6-7 direct source/key-artifact list.

### R2-3 downstream result

No genuine current downstream boundary was found that:

1. consumes the frozen Stage 4-6 validation output or its `sharedArtifacts.*.gitBlobSha` as a freshness authority;
2. compares those recorded Stage 4-6 SHAs against a later current relation/index snapshot;
3. and would therefore benefit from replacing raw-SHA freshness with `hero-soldier-membership/v1`.

The only confirmed Stage 4-6 SHA comparisons are the three same-run A-6/A-7/A-8 traceability checks classified in R2-2. Those must remain exact-SHA.

Therefore adding a Stage 4-6 semantic freshness envelope/helper would currently be unused machinery and could only create a risk of weakening exact validation lineage.

## R2 final disposition

R2 closes as:

`NO_MIGRATION_REQUIRED`

Final decisions:

- do not change `scripts/validate-soldier-stage4-6-relation-consumer.cjs`;
- preserve `relationBlobMismatchInValidation` as exact-SHA blocking traceability;
- preserve `relationBlobMismatchInIndex` as exact-SHA blocking traceability;
- preserve `bySoldierBlobMismatchInValidation` as exact-SHA blocking traceability;
- do not add a Stage 4-6 semantic digest envelope;
- do not add a new Stage 4-6 projection/helper;
- keep `hero-soldier-membership/v1` available only if a future genuine membership-only frozen freshness consumer is introduced;
- do not regenerate A-6 relation semantics, A-7 indexes, canonical Hero/Soldier identity, or raw ConfigData for this closeout.

## Preserved invariants

- Hero 267
- Soldier 224
- normal Soldier 168
- SP Soldier 56
- Hero-Soldier pair 5,977
- bySoldier keys 224
- bySoldier relations 5,977
- reciprocal mismatch 0
- Stage 6-5 semantic membership freshness active
- Stage 6-7 Semantic Freshness V2 active
- A-8 remains the richer semantic owner
- A-7 indexes remain disposable membership projections

## REVIEW

- The temporary baseline-probe branches created during R2-0 inspection remain non-semantic cleanup only and do not affect `main` or the R2 result.
- If a future downstream consumer begins comparing Stage 4-6 frozen `sharedArtifacts.*.gitBlobSha` against later relation/index blobs, reassess that new boundary rather than changing same-run A-7/A-8 traceability.

## BLOCKER

None.

## Next start

`R3 — fail-closed relation mutation matrix. Validate that actual membership/provenance/identity/schema mutations cannot be misclassified as provenance-only under the active Semantic Freshness V2 boundaries.`

## Reopen R2 only if

- Stage 4-6 becomes a current downstream active source or freshness owner;
- a new consumer starts comparing frozen Stage 4-6 recorded SHAs against later current artifacts;
- the Stage 4-6 workflow stops regenerating A-6/A-7/A-8 as one same-snapshot chain;
- A-7 or A-8 exact traceability authority changes;
- Stage 4-6 begins consuming provenance/sourceKind semantics directly;
- or new authoritative evidence contradicts the R2-3 dependency inventory.
