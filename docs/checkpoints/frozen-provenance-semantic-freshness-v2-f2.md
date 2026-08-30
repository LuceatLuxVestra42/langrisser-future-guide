# Frozen Provenance / Semantic Freshness V2 — F2 Checkpoint

## Status

- Stage: `F2`
- Status: `COMPLETE`
- Result: `PASS`
- Work branch: `maintenance/frozen-provenance-semantic-freshness-v2-f2`
- Workspace predecessor: `8681bcde2af9c4f12b547f9abaf841455df4ba86`
- Latest authoritative `main` observed before F2 implementation: `1a80d5c63baf8fe6ffa42823977572a8ceba5dd1`
- The latest `main` advance after the workspace predecessor was an Equipment merge and did not touch F2-owned paths, so the verified workspace predecessor was retained instead of reopening or rebasing unrelated upstream work.

## Purpose

Implement and verify the shared deterministic digest/canonicalization primitive required by `frozen-semantic-freshness/v2` before touching Soldier Stage 6-6 or any production frozen artifact.

## Files added

- `scripts/lib/frozen-semantic-digest.mjs`
- `data/fixtures/frozen-semantic-freshness-v2-fixtures.v1.json`
- `scripts/validate-frozen-semantic-freshness-v2-fixtures.mjs`

No `.github/workflows/**`, Project Doctor pass policy, Soldier production frozen artifact, Soldier name/localization source, or Hero-Soldier canonical relation artifact was modified.

## Frozen digest behavior

### Contract

- Contract: `frozen-semantic-freshness/v2`
- Algorithm: SHA-256
- Digest representation: `sha256:<64-hex>`
- Projection ID is part of semantic digest identity. Equal bytes under different projection IDs do not compare equal.

### Canonicalization

- JSON object keys are recursively sorted lexicographically.
- Array order is preserved.
- Strings are preserved exactly; no implicit Unicode normalization is applied.
- `-0` canonicalizes to JSON `0`.
- Non-finite numbers fail closed.
- `undefined` values fail closed.
- Cyclic values and non-plain objects fail closed.

### Ownership boundary

The helper digests an explicitly supplied semantic payload. It does not silently strip arbitrary fields from a production artifact.

Therefore audit-only fields such as `generatedAt` and nested `gitBlobSha` are excluded by the producer's explicit semantic projection, not by a broad heuristic blacklist inside the shared helper.

## Fixture results

Command used during F2 validation:

`node scripts/validate-frozen-semantic-freshness-v2-fixtures.mjs`

Result: `11/11 PASS`

Verified cases:

1. `generatedAt` only changed -> semantic digest `SAME`.
2. Nested `gitBlobSha` only changed -> semantic digest `SAME`.
3. JSON object insertion/key order only changed -> semantic digest `SAME`.
4. Soldier `nameKr` changed -> semantic digest `DIFFERENT`.
5. Soldier combat value changed -> semantic digest `DIFFERENT`.
6. Hero-Soldier pair changed -> membership digest `DIFFERENT`, relation semantic digest `DIFFERENT`.
7. Relation `gitBlobSha` only changed -> membership digest `SAME`, relation semantic digest `SAME`.
8. Relation provenance meaning (`sourceKind`) changed -> membership digest `SAME`, relation semantic digest `DIFFERENT`.
9. Non-finite number -> fail-closed exception.
10. `undefined` object value -> fail-closed exception.
11. Same payload under different projection IDs -> not equal.

## Relation projection rule proven by fixtures

Two relation projections remain distinct:

- `hero-soldier-membership/v1`: canonical `(heroId, soldierId)` pair membership only.
- `hero-soldier-relation/semantic-v1`: pair identity plus semantic provenance; raw `gitBlobSha` is audit-only and excluded.

This allows membership consumers to remain fresh when only relation provenance metadata changes, while provenance-sensitive consumers still detect a real `sourceKind`/semantic provenance mutation.

## Production impact

- Production frozen artifacts changed: `0`
- Soldier Stage 5/6 producers changed: `0`
- Project Doctor contracts/validators changed: `0`
- Workflow transport files changed: `0`
- Branch protection / `pr-guard` policy changed: `0`
- Canonical Soldier / Hero-Soldier semantic data recomputed: `NO`

## REVIEW

- F2 fixture relation provenance uses the already-established `sourceKind` concept as the semantic example. F3 must project only fields actually consumed by Soldier Stage 6-6; it must not assume every provenance field is semantic.
- The helper deliberately has no generic recursive metadata-strip function. Each production stage must declare its semantic payload explicitly.

## BLOCKER

`NONE`

## Next start point

`F3 — Soldier Stage 6-6 pilot`

Start by reading the latest authoritative Stage 6-6 producer and frozen output schema. Add V2 semantic digest/provenance classification only to Stage 6-6. Do not bulk-migrate upstream Stage 5/6 artifacts.

## Reopen F2 only if

- canonical JSON rules prove nondeterministic on a supported JSON value;
- a fixture exposes a false semantic equality or false semantic mismatch;
- the digest algorithm or projection identity contract changes;
- F3 reveals that the helper cannot represent an explicitly required Stage 6-6 semantic projection without broad heuristic field stripping.
