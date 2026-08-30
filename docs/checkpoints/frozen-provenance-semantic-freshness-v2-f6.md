# Frozen Provenance / Semantic Freshness V2 — F6 Checkpoint

## Status

- Stage: F6 — Fail-Closed Regression Fixtures
- Status: COMPLETE / PASS
- Predecessor: F5 checkpoint commit `4a55782fe088222527bcf7ab1f9152bc6183fdcc`
- F6 branch: `maintenance/frozen-provenance-semantic-freshness-v2-f6`
- F6 implementation head before checkpoint: `e5c8f4c9fa9351929c83c0973e4e9f2c2e3a7f20`
- Semantic research reopened: NO
- Canonical relation recomputed: NO

## Authoritative implementation

- `scripts/lib/frozen-semantic-digest.mjs`
- `scripts/lib/soldier-stage6-6-semantic-projections.mjs`
- `scripts/lib/soldier-stage6-7-semantic-projections.mjs`
- `scripts/validate-soldier-stage6-6-freshness-v2-fixtures.mjs`
- `scripts/validate-soldier-frozen-semantic-freshness-v2-f6.mjs`
- `scripts/validate-project-doctor-frozen-freshness-v2.mjs`

## Confirmed regression matrix

F6 dedicated matrix: 22/22 PASS.

Confirmed fail-open-safe cases:

- `generatedAt` only change => semantic fresh
- upstream `gitBlobSha` only change => semantic fresh
- workflow run ID only change => semantic fresh where contract marks it audit-only
- JSON whitespace/object-key ordering => same canonical digest
- same semantic digest + changed blob => `PROVENANCE_ONLY_CHANGED`

Confirmed fail-closed cases:

- Soldier ID mutation => semantic stale
- canonical Soldier count 224 -> 223 => semantic stale
- SP count 56 -> 55 => semantic stale
- Hero-Soldier relation 5,977 -> 5,976 => semantic stale
- reciprocal mismatch 0 -> 1 => semantic stale
- combat stat mutation => semantic stale
- training value mutation => semantic stale
- breaking schema identity => semantic stale
- missing source path => invalid freshness ref / blocking
- legacy ref without semanticDigest => invalid freshness ref / blocking
- semantic mutation with simultaneous blob change => `SEMANTIC_STALE`
- relation sourceKind mutation => semantic stale

## Contract-specific name handling

Names are not globally treated as metadata.

- Stage 6-6 `fullRecords` projection does not consume `nameKr`; a `nameKr`-only change is semantic-fresh for that consumer.
- Stage 6-7 detail projection consumes `nameKr`; a `nameKr` change changes its semantic digest.

This is an explicit consumer-contract distinction, not a global name exclusion rule.

## Ordering policy

- Generic Stage 6-7 consumed arrays are not silently normalized; order mutation changes semantic digest.
- Stage 6-6 Soldier records are explicitly ID-indexed and sorted by `soldierId` in the projection; source record ordering is non-semantic for that consumer.

## Validation evidence

One-time F6 regression execution confirmed:

- Stage 6-6 baseline freshness fixtures: 13/13 PASS
- F6 fail-closed mutation matrix: 22/22 PASS
- Project Doctor freshness V2 fixtures: 4/4 PASS

The F6 matrix was then integrated into the permanent `doctor:freshness:v2:self-test` path and re-executed successfully. The temporary one-time workflow was deleted afterward.

## Main freshness review before F7

At F7 start, current `main` was `73afee0e72e475b4bc925ba7c83ee4ee1a9b38b0`.

Changes since the branch's prior latest-main baseline `fef45f3a162cae33ebd04590be35811cc70ab3b9` were confined to Asset Hygiene / hosted Equipment validation paths plus `scripts/project-doctor-validate-authoritative-pages-hosted.mjs`. No Soldier Stage 6-6/6-7 frozen artifact, Soldier semantic projection, or Semantic Freshness V2 contract path changed.

Classification: non-blocking downstream/presentation change for F7 Soldier semantic regression.

## Guard policy preserved

- required context remains `pr-guard`
- passing exit codes remain fail-closed
- manual review is not converted to PASS
- raw `gitBlobSha` remains available for audit provenance
- semantic freshness authority is contract-specific `semanticDigest`

## Blocker

NONE.

## Review

Latest-main hosted/asset changes are outside F6/F7 Soldier semantic ownership. They should be handled by their presentation/hosted owners and do not reopen Soldier semantics.

## Next start

F7 — Full Soldier Regression.

Reuse existing frozen/generated artifacts and validators. Do not re-research canonical Soldier identities or Hero-Soldier relation meaning.

Required unchanged invariants:

- canonical Soldier: 224
- normal Soldier: 168
- SP Soldier: 56
- normal tier 3: 129
- Hero: 267
- Hero-Soldier relation: 5,977
- reciprocal mismatch: 0
- representative QA: 6/6
- filter QA: 15/15
- Stage 6-6 preservation errors: 0

## Reopen F6 only if

- semantic digest canonicalization rules change,
- Stage 6-6 or Stage 6-7 semantic projection boundaries change,
- a regression fixture is shown to be false-positive or false-negative,
- a new freshness ref format bypasses the fail-closed legacy/missing-ref behavior.
