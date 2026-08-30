# Frozen Provenance / Semantic Freshness V2 — P0 Inventory Checkpoint

## Status

- Stage: `P0`
- Status: `COMPLETE`
- Next: `P1_READY`
- Branch: `maintenance/frozen-provenance-semantic-freshness-v2-p0-inventory`
- Authoritative source: `main`
- Authoritative commit: `1a80d5c63baf8fe6ffa42823977572a8ceba5dd1`
- Semantic upstream reopened: `NO`
- Production frozen artifacts modified: `NO`
- Workflow transport modified: `NO`

P0 reused the already-verified Soldier closeout state and inspected only the missing provenance/freshness ownership boundary. It did not restart Soldier canonical, Hero canonical, Hero-Soldier relation meaning, or producer transport work.

## P0 purpose

Freeze the current distinction between:

1. scripts that only **record provenance** such as `{ path, gitBlobSha }`;
2. validators that actually use raw SHA mismatch as a **blocking freshness decision**;
3. literal **pinned hash gates** that protect a frozen source/fixture byte identity;
4. independent semantic/content validation;
5. workflow-level exact frozen-output diff checks, which remain outside this workspace.

Machine-readable inventory:

- `data/validation/frozen-provenance-v2-p0-inventory.v1.json`

## Classification boundary

### `PROVENANCE_RECORD_ONLY`

The stage computes and records Git/worktree hash provenance, but a historical/provenance SHA mismatch is not itself the stage's stale/fail decision.

### `RAW_SHA_FRESHNESS_CONSUMER`

The stage compares recorded/snapshot SHA provenance against the current repository or artifact hash and raises a blocking error on mismatch.

### `RAW_SHA_PIN_GATE`

The stage compares the current bytes of a known frozen source/fixture against a literal expected SHA. This is not the same problem as recorded-provenance drift and must remain fail-closed until P1 explicitly contracts its semantic role.

### `CONTENT_SEMANTIC_VALIDATION`

The stage reads actual records/relations/statuses and validates content invariants such as IDs, counts, fields, relation parity, reciprocity, membership, and admission conditions.

### `TRANSPORT_FROZEN_EXACT_DIFF`

GitHub Actions may regenerate frozen output and require an exact `git diff --exit-code`. That is a workflow/transport frozen-output boundary. `.github/workflows/**` remains out of scope for this P workspace.

## Direct raw-SHA decision owners

P0 identified four decision owners in the targeted Soldier closeout graph.

### 1. Hero-Soldier relation authority — literal pin gate

Owner:

- `scripts/finalize-hero-soldier-relation-layer.cjs`

Mode:

- `RAW_SHA_PIN_GATE`
- `PROVENANCE_RECORD_ONLY`
- `CONTENT_SEMANTIC_VALIDATION`

Two current hard gates compare fixture/source bytes to literal SHA-256 values:

- `fixturePlanBlobMismatch`
- `spSoldierFixtureSnapshotBlobMismatch`

These mismatch counters are part of hard-failure aggregation. P1 must not silently reinterpret them as provenance-only changes. It must explicitly decide whether each pin is byte authority, semantic authority, or a migration candidate.

### 2. Soldier Stage 4-6 shared-relation consumer

Owner:

- `scripts/validate-soldier-stage4-6-relation-consumer.cjs`

Mode:

- `RAW_SHA_FRESHNESS_CONSUMER`
- `CONTENT_SEMANTIC_VALIDATION`

The consumer hashes the current generated relation/index artifacts and compares them with `gitBlobSha` refs recorded in relation validation. A mismatch is blocking.

### 3. Soldier Stage 6-5 reciprocal links

Owner:

- `scripts/finalize-soldier-stage6-5-reciprocal-links.cjs`

Mode:

- `RAW_SHA_FRESHNESS_CONSUMER`
- `PROVENANCE_RECORD_ONLY`
- `CONTENT_SEMANTIC_VALIDATION`

The stage calculates the current canonical relation blob SHA and compares it with relation snapshots recorded by:

- relation validation;
- by-Hero index;
- by-Soldier index;
- Hero-page projection.

Any snapshot mismatch is added to blocking errors.

This matters for V2 migration: Stage 6-5 is an earlier raw-SHA blocker than the final Stage 6-7 admission. P3 can pilot digest emission in 6-6, but end-to-end V2 cannot assume 6-6 → 6-7 is the only raw-SHA boundary.

### 4. Soldier Stage 6-7 final site admission

Owner:

- `scripts/finalize-soldier-stage6-7-site-admission.cjs`

Mode:

- `RAW_SHA_FRESHNESS_CONSUMER`
- `CONTENT_SEMANTIC_VALIDATION`

The final validator recursively collects upstream frozen `{ path, gitBlobSha }` references, resolves the current `HEAD:<path>` blob, and treats stale/missing refs as blocking final-admission errors.

This is the primary P4 final owner for separating:

- semantic mismatch;
- provenance-only drift;
- fully fresh provenance.

## Provenance-record stages

The following targeted stages record raw provenance while also performing real semantic/content validation, but P0 found no standalone recorded-SHA-vs-current-HEAD freshness failure in their owner scripts:

- Soldier Stage 5-2 Combat
- Soldier Stage 5-3 Ability
- Soldier Stage 5-4 Training
- Soldier Stage 5-6 SP Detail
- Soldier Stage 5-7 List
- Soldier Stage 5-8 Release
- Soldier Stage 6-1 Full Records
- Soldier Stage 6-2 Classification
- Soldier Stage 6-3 Representative QA
- Soldier Stage 6-4 Filter QA
- Soldier Stage 6-6 Expansion Basis

Stage 6-6 therefore remains a suitable P3 pilot **for emitting semantic digest alongside retained provenance**, rather than being misidentified as the only current stale-decision owner.

## Relation authority boundary

Hero-Soldier relation semantics were not reopened.

P0 only inspected the currently authoritative relation producer/consumer freshness mechanics needed by V2. Existing relation cardinality/parity and frozen semantic conclusions remain predecessors, not P0 research targets.

The Stage 4-6 workflow itself remains read-only validation/frozen-output parity and is not modified here.

## Discovered predecessor

- Soldier Stage 5-5 was observed as an input predecessor of Stage 5-6.
- It was not promoted into a new investigation scope because no P0 completion condition required reopening it.

## P1 design requirements now fixed

P1 can start without another raw-SHA inventory pass. It must define a Semantic Freshness V2 contract that satisfies all of the following:

1. retain `gitBlobSha` for provenance/audit;
2. add an explicit semantic digest authority rather than treating raw Git SHA as semantic freshness;
3. distinguish `SEMANTIC_FRESH`, `PROVENANCE_ONLY_CHANGED`, and `SEMANTIC_STALE` or equivalent states;
4. define semantic projection per dependency class rather than relying on an open-ended metadata exclude list;
5. support recorded-provenance consumers at Stage 4-6 relation consumer, Stage 6-5, and Stage 6-7;
6. treat relation-authority literal pin gates as a separate fail-closed contract decision;
7. use Stage 6-6 as the first digest-emission pilot without pretending earlier SHA gates disappeared;
8. leave producer/PR workflow transport and required `pr-guard` policy unchanged.

## REVIEW

Non-blocking P1 design reviews:

- Decide the exact semantic payload/projection for each migrated artifact class.
- Decide whether the two literal Hero-Soldier fixture pins are intentionally byte-level authority or should later gain semantic-digest counterparts.
- Decide migration compatibility when a dependency has legacy `gitBlobSha` but no V2 `semanticDigest` yet.
- Known fanout in the P0 JSON is scoped to the targeted Soldier closeout graph; it is not a repository-wide dependency index.

## BLOCKER

- None for P0.

## Concurrent-work boundary

This P0 branch was created directly from current `main`, not from the separate V2 branch where P2-like digest utility/fixture work is already progressing.

P0 does not modify that concurrent branch and does not modify the open Hero producer/freshness work.

## Next start point

`P1 — Semantic Freshness V2 contract` only.

Do not redo P0 unless a scoped freshness owner changes.

## Reopen conditions

Reopen P0 only if one of the following becomes true:

- a scoped Soldier/relation owner script changes its SHA freshness behavior;
- relation authority schema or literal pin ownership changes;
- a new raw-SHA blocking consumer is demonstrated inside the targeted Soldier closeout graph;
- P1/P2 regression evidence proves this inventory produced a false positive or false negative.
