# Frozen Provenance / Semantic Freshness V2 — R1 Soldier Stage 6-5

Date: 2026-08-30

Status: `COMPLETE / PASS / REQUIRED_GUARD_GREEN`

## Current state

- authoritative base: `main@10cb5afade8b5650bfb01604232efa8235c57e08`
- R1 branch: `maintenance/frozen-semantic-freshness-v2-r1-stage6-5`
- draft PR: `#297`
- required status check: `pr-guard`
- GitHub Actions app id: `15368`
- Stage 6-5 frozen predecessor commit: `10cb5afade8b5650bfb01604232efa8235c57e08`
- Stage 6-5 frozen predecessor script blob: `29d16d728625168569f3c916e18acd833fd4ea1e`

## Objective

R1 migrates only the Soldier Stage 6-5 reciprocal-link freshness consumer away from treating raw canonical Hero-Soldier relation Git blob drift as semantic stale.

The existing Stage 6-5 semantic/parity validator remains the predecessor authority. R1 runs that exact predecessor first and post-processes only its freshness interpretation.

## Active R1 semantic boundary

Projection:

`hero-soldier-membership/v1`

Freshness mode:

`SEMANTIC_DIGEST_V2_MEMBERSHIP`

Current canonical membership digest:

`sha256:08091d305e73777a893a72af53a53c630852397c08eee59cf614cce10d6f045e`

Classification:

- same membership digest + same canonical relation blob -> `SEMANTIC_FRESH`
- same membership digest + different canonical relation blob -> `PROVENANCE_ONLY_CHANGED`
- different membership digest or failed inherited semantic/parity evidence -> `SEMANTIC_STALE`
- missing provenance/digest evidence -> `SEMANTIC_UNKNOWN`
- `SEMANTIC_STALE` and `SEMANTIC_UNKNOWN` remain blocking

Raw `gitBlobSha` remains preserved as audit/history provenance.

## Preserved predecessor checks

R1 does not replace or reduce the existing Stage 6-5 checks. The frozen predecessor still validates:

- upstream PASS state
- canonical relation validity and duplicate absence
- byHero validity / duplicate absence
- bySoldier validity / duplicate absence
- shared-index pair parity
- Hero-page pair parity
- Soldier-page pair parity
- reciprocal Hero-page <-> Soldier-page parity
- Hero key coverage
- Soldier key coverage
- inherited relation validation

Only the old rule `raw relation blob mismatch => semantic failure` is replaced by the explicit membership projection classification above.

## Frozen artifacts

- `data/generated/hero-soldier-page-links-stage6-5.v1.json`
- `data/validation/soldier-stage6-5-reciprocal-links.v1.json`

Both retain the existing Stage 6-5 schema/content and add a top-level `freshness` envelope. Downstream Stage 6-7 already treats this top-level freshness/audit envelope as non-semantic metadata while independently verifying its own semantic boundary.

## Validation evidence

First migration PR run:

- Stage 6-5 run: `33301942425`
- semantic predecessor: PASS
- R1 semantic freshness: PASS
- Hero keys: 267
- Soldier keys: 224
- canonical/byHero/bySoldier/Hero-page/Soldier-page relation count: 5,977
- reciprocal mismatch: 0
- semantic freshness blocking observations: 0
- final exact-diff failed only because committed Stage 6-5 artifacts were still pre-R1

The two frozen JSON files were then frozen from that exact CI artifact.

Post-freeze run on the final owner-safe helper layout:

- Stage 6-5 run: `33302274309` — SUCCESS
  - reciprocal-link QA: PASS
  - artifact upload: PASS
  - frozen exact-diff: PASS
- Stage 6-6 run: `33302274298` — SUCCESS
  - existing semantic expansion basis: PASS
  - frozen exact-diff: PASS
- Stage 6-7 run: `33302274425` — SUCCESS
  - final admission: PASS
  - Stage 6-5 closeout projection: PASS
  - frozen exact-diff: PASS
  - Project Status bridge: PASS
- required Project Doctor PR Guard run: `33302274305` — SUCCESS
  - D7 V8 guard contract: PASS
  - D5 freshness: FRESH
  - D1 deterministic regeneration: PASS
  - changed-file comparison: PASS
  - Integrated Doctor dry run: PASS
  - Integrated Doctor execution: PASS

No D5 reseal was required.

## Project Doctor ownership correction during R1

The first R1 layout placed the new Stage 6-5 projection helper at:

`scripts/lib/soldier-stage6-5-semantic-projections.mjs`

That new path was not included in the frozen D2 V6 explicit freshness-tooling overlay and therefore correctly produced one MANUAL_REVIEW in required `pr-guard`.

R1 did not expand D2/R5 early and did not weaken the guard. The helper was moved unchanged to the already-authoritative Soldier-owned path family:

`scripts/soldier-stage6-5-semantic-projections.mjs`

which is covered by the existing `scripts/*soldier*` Soldier data-family routing. The obsolete unmapped helper path was removed. Required `pr-guard` then completed SUCCESS without Project Doctor contract changes.

## Preserved invariants

- canonical Hero: 267
- canonical Soldier: 224
- normal Soldier: 168
- SP Soldier: 56
- normal tier-3 Soldier: 129
- canonical Hero-Soldier relation: 5,977
- reciprocal mismatch: 0
- Stage 6-5 canonical/index/page pair parity mismatch: 0
- Stage 6-6 frozen determinism: PASS
- Stage 6-7 final admission/determinism: PASS

These are reused frozen/validator invariants. R1 does not re-research or regenerate canonical relations.

## Out of scope / unchanged

- Soldier Stage 4-6 shared relation consumer (R2)
- broader fail-closed relation mutation matrix (R3)
- Hero-Soldier relation literal SHA pin disposition (R4)
- Project Doctor supported content-aware artifact expansion (R5 unless later proven necessary)
- producer workflow transport
- `pull_request.paths`
- branch protection
- `pr-guard` passing exit policy
- Hero/Soldier canonical population
- Hero-Soldier relation regeneration
- raw ConfigData research
- Hosted/Browser QA

## REVIEW

- The small R1 helper fixture exists for targeted classification behavior; the broader mutation matrix remains owned by R3.
- R1 changes only the reciprocal-membership freshness meaning. Relation semantic provenance fields beyond pair membership remain outside this consumer's authority.

## BLOCKER

None.

## Next start

`R2 — Soldier Stage 4-6 shared relation consumer semantic freshness migration`

Reuse this R1 membership projection only where the Stage 4-6 consumer contract actually consumes membership. Do not silently reduce any richer relation-semantic authority to membership-only.

## Reopen R1 only if

- Stage 6-5 classifies different Hero-Soldier membership as provenance-only,
- same membership plus blob-only drift becomes blocking again,
- malformed/missing freshness evidence stops failing closed,
- Stage 6-5 pair/coverage/reciprocal checks are weakened,
- Stage 6-6 or Stage 6-7 semantic parity is perturbed by the R1 top-level freshness envelope,
- or a new authoritative contradiction appears in the Stage 6-5 consumer contract.
