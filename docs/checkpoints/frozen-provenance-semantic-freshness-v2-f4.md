# Frozen Provenance / Semantic Freshness V2 — F4 Stage 6-7 Final Owner

Date: 2026-08-30

Status: `COMPLETE / DOWNSTREAM_F5_REQUIRED`

## Current state

- F4 branch head predecessor: `9b21557e16697b602763182a8e2cfb7992bb4a4a`
- latest-main synchronization predecessor: `fef45f3a162cae33ebd04590be35811cc70ab3b9`
- authoritative final Soldier owner: `scripts/validate-soldier-stage6-7-final.mjs`
- Stage 6-7 frozen output: `data/generated/soldier-stage6-7-site-admission.v1.json`
- Stage 6-7 frozen validation: `data/validation/soldier-stage6-7-site-admission.v1.json`

## Completed scope

- Stage 6-7 producer/final validator migrated from recursive raw Git blob freshness to Semantic Freshness V2.
- 12 direct sources + 6 key artifacts are checked by semantic digest.
- `gitBlobSha` remains audit provenance and is not the sole semantic freshness authority.
- semantic mismatch remains blocking.
- semantic equality with Git blob drift is classified as provenance-only change.
- missing/malformed V2 refs remain fail-closed.
- Stage 6-6 F3 semantic freshness behavior is preserved.

## Preserved semantic invariants

- canonical Soldier: 224
- normal Soldier: 168
- SP Soldier: 56
- normal tier-3 Soldier: 129
- Hero: 267
- Hero-Soldier canonical relation: 5,977
- reciprocal mismatch: 0
- representative QA: 6/6
- filter QA: 15/15

No canonical IDs, relation membership, or combat/training semantics were recomputed in F4.

## Final validation evidence

Latest-main synchronized PR execution confirmed:

- Soldier Stage 6-6 producer/validation/artifact exact-diff: PASS
- Soldier Stage 6-7 final admission/upload/artifact exact-diff/projection/status bridge: PASS
- Project Doctor D7 contract: PASS
- committed D5 freshness: FRESH, stale reasons 0
- D1 determinism: PASS
- D5 revalidation: PASS
- Regression Coverage Promotion V1: PASS
- Integrated Doctor dry run: PASS
- Hero-Soldier final owner: PASS_WITH_REVIEW, hard errors 0
- Soldier Stage 6-7 final owner: PASS, hard failures 0
- Regression Coverage Promotion V2: PASS, 246 checks / 0 failures
- Localization Audit: PASS_WITH_REVIEW, errors 0, frontend leaks 0
- Production build: PASS
- Doctor health / impact / plan self-tests: PASS

Required `pr-guard` remained non-passing only because D4 returned `REVIEW_MANUAL` / exit 3 after all 8 selected checks exited 0.

## Downstream ownership

The four manual reviews are D2 unmapped-path routing, not semantic failures:

1. `scripts/lib/frozen-semantic-digest.mjs`
2. `scripts/lib/soldier-stage6-6-semantic-projections.mjs`
3. `scripts/lib/soldier-stage6-7-semantic-projections.mjs`
4. `docs/checkpoints/frozen-provenance-semantic-freshness-v2-f3.md`

This belongs to F5 Project Doctor provenance/freshness classification. Do not weaken D7 manual-review policy or treat exit 3 as passing.

## BLOCKER

- F4 semantic implementation: none.
- merge readiness: F5 Project Doctor routing/classification must remove the four legitimate unmapped paths without weakening fail-closed checks.

## Next start

`F5 — Project Doctor provenance-only classification`

Use D2 as candidate-owner routing, classify supported frozen artifacts by Semantic Freshness V2 before D3 final check selection, and preserve `pr-guard` passing exit codes as `[0]` only.

## Reopen F4 only if

- Stage 6-6 or Stage 6-7 semantic projection contract changes,
- Stage 6-7 final owner no longer reports the preserved semantic invariants,
- a provenance-only mutation is shown to alter semanticDigest,
- or a true semantic mutation is shown to retain semanticDigest.
