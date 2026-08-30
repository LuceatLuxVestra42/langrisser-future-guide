# Frozen Provenance / Semantic Freshness V2 — P3 Checkpoint

## Status

- Stage: `P3`
- Status: `COMPLETE`
- Result: `PASS`
- Scope: `Soldier Stage 6-6 semantic-digest pilot only`
- Work branch: `maintenance/frozen-provenance-semantic-freshness-v2-p3`
- P3 validated head before checkpoint: `5cce2f06497eb7bba554872ca2a7bf821e1d774c`
- Draft PR: `#285`
- P2 predecessor: `f22b4e04f0d344345265b442b9e2b5248e8e25a8`
- Latest authoritative `main` observed at P3 closeout: `418769148e05b8eabd2a29ef9ad608f927c29fbf`
- Workflow transport modified: `NO`
- Project Doctor policy modified: `NO`
- Hero-Soldier canonical relation regenerated: `NO`

P3 remains intentionally draft/unmerged. The Stage 6-6 pilot is complete, while Stage 6-7 and Project Doctor still expose the legacy raw-SHA downstream behavior owned by P4/P5.

## Authoritative semantic predecessor

P3 does not reimplement Soldier Stage 6-6 semantics. The pilot wrapper executes and verifies the exact pre-V2 Stage 6-6 producer:

- commit: `1a80d5c63baf8fe6ffa42823977572a8ceba5dd1`
- path: `scripts/finalize-soldier-stage6-6-expansion-basis.cjs`
- Git blob: `c3f8e6b0e7085db7c759e8c3c5246ef90397ce96`

The Stage 6-6 producer on authoritative main still had this same blob when P3 implementation began. Therefore the V2 pilot reused the already-validated semantic producer and added only provenance/freshness post-processing.

## P1 refinement discovered by P3

P3 demonstrated a concrete false-semantic-equality risk if the P1 Stage 6-6 manifest projection were used as the only evidence for consumed upstream data.

The Stage 6-6 manifest contains summary/count information but does not embed every consumed combat, ability, training, SP or relation payload value. A consumed combat value can change while the manifest summary remains unchanged.

This satisfies the P1 reopen condition for false semantic equality evidence.

P3 therefore does **not** weaken or replace the P1 core classification contract. Instead it adds a subordinate, Stage 6-6-local projection registry:

- `data/contracts/soldier-stage6-6-semantic-freshness-projections.v1.json`

Parent contract remains:

- `data/contracts/frozen-semantic-freshness.v2.json`
- `frozen-semantic-freshness/v2`

The subordinate registry defines only the semantic payloads actually consumed by Stage 6-6.

## Stage 6-6 source projection boundary

Registered P3 source projections cover:

- Stage 6-1 full records: Soldier ID, `identity.isSp`, `identity.tier`, combat, ability, training and SP block;
- Stage 5-2: Soldier ID + combat;
- Stage 5-3: Soldier ID + ability;
- Stage 5-4: Soldier ID + training;
- Stage 5-6: Soldier ID + SP block;
- Hero-Soldier relation: pair identity + provenance `sourceKind` + relation summary consumed by Stage 6-6;
- validation artifacts: only the status/check boundary consumed by Stage 6-6;
- Stage 6-5 manifest: canonical relation-count boundary consumed by Stage 6-6.

`nameKr` is excluded from the Stage 6-6 full-record source projection because Stage 6-6 does not consume it. This is a Stage 6-6-local freshness rule only and is not a global statement that names are non-semantic.

Record ordering is normalized by Soldier ID where Stage 6-6 itself consumes records through ID indexes. Relation edges are normalized by Hero/Soldier IDs for the same consumer-specific reason.

## Freshness mode

Each migrated Stage 6-6 source ref now retains:

- `path`
- `gitBlobSha`
- `semanticDigest`
- `freshnessMode: SEMANTIC_DIGEST_V2_STICKY_PROVENANCE`

Classification follows P1:

- valid matching semantic digest + same blob -> `SEMANTIC_FRESH`
- valid matching semantic digest + changed blob -> `PROVENANCE_ONLY_CHANGED`
- valid comparable semantic digest mismatch -> `SEMANTIC_STALE`
- legacy descriptor + unchanged blob -> `SEMANTIC_FRESH`
- legacy descriptor + changed blob -> `SEMANTIC_UNKNOWN`
- malformed/incompatible digest identity -> `SEMANTIC_UNKNOWN`

`SEMANTIC_STALE` and `SEMANTIC_UNKNOWN` remain fail-closed.

### Sticky provenance

P3 uses sticky provenance only for Stage 6-6 frozen output stability:

- semantic digest unchanged -> preserve the previously frozen `gitBlobSha`;
- semantic digest changed -> advance the frozen `gitBlobSha` together with the new digest.

Runtime provenance drift remains observable through classification/logging. It is not silently rewritten into the frozen artifact when semantic content is unchanged.

## P3 files after P2

P3 owns only:

- `data/contracts/soldier-stage6-6-semantic-freshness-projections.v1.json`
- `scripts/lib/soldier-stage6-6-semantic-projections.mjs`
- `scripts/validate-soldier-stage6-6-freshness-v2-fixtures.mjs`
- `scripts/finalize-soldier-stage6-6-expansion-basis.cjs`
- `data/generated/soldier-stage6-6-expansion-basis.v1.json`
- `data/validation/soldier-stage6-6-expansion-basis.v1.json`
- this checkpoint

No `.github/workflows/**` file is owned by P3.

## Fixture evidence

The predecessor F3 pilot already provided verified `13/13 PASS` fixture evidence for the core Stage 6-6 semantic/provenance properties, including:

- `generatedAt` only -> same semantic digest;
- nested `gitBlobSha` only -> same semantic digest;
- Stage 6-6-unconsumed `nameKr` only -> same Stage 6-6 digest;
- combat mutation -> different digest;
- ID-indexed record-order change -> same digest;
- relation raw blob metadata only -> same digest;
- relation `sourceKind` mutation -> different digest;
- semantic equal + same blob -> `SEMANTIC_FRESH`;
- semantic equal + changed blob -> `PROVENANCE_ONLY_CHANGED`;
- semantic mutation -> `SEMANTIC_STALE`;
- missing/inadequate freshness evidence -> fail closed;
- sticky provenance retains the old blob when semantics are equal;
- sticky provenance advances when semantics change.

P3 reused this verified evidence instead of recreating the same semantic proof through new workflow transport.

The current P3 branch also contains an expanded 20-case fixture script aligned to the final P1 classification/legacy rules. That expanded script is committed as regression support but was not independently executed during this P3 closeout. This is a non-blocking REVIEW for later P6 regression coverage, not a P3 blocker, because the core mutation behavior was already verified and the current integration path was exercised by the real Stage 6-6 workflow below.

## First CI migration run

Draft PR #285 Stage 6-6 run:

- workflow run: `33297368435`
- job: `99219239667`

Result before freezing the V2 artifacts:

- authoritative semantic predecessor: `PASS`
- Stage 6-6 V2 post-processing: `PASS`
- artifact upload: `PASS`
- frozen exact-diff: `FAIL` as expected for the one-time V1 -> V2 artifact migration

Observed semantic state:

- normal / SP / normal tier-3: `168 / 56 / 129`
- trait / training level records: `1290 / 1290`
- SP stage1 / stage2 missions: `112 / 45`
- relation edges / provenance: `5977 / 5978`
- Stage 6-6 source observations: `SEMANTIC_FRESH=14`

Generated artifact semantic digest:

- `sha256:13fa35aef09bd70699810a81e95553e988b9b127ccad002968d03157f4ae18da`

Validation artifact semantic digest:

- `sha256:4620c059609bf3521607c7b408fb5e97f3eb0aee9021a624c17cbba5e7257f7c`

CI migration artifact:

- artifact ID: `9727836542`
- ZIP SHA-256: `165956facd9ed74fc1bd4528c0eb2503f2d26debc07ede4305b0e92b2e2d6ece`

The two production Stage 6-6 frozen JSON files committed afterward were taken from that CI result rather than hand-synthesized.

## Semantic preservation after migration

The frozen P3 artifacts remain `PASS` and preserve the established Stage 6-6 state:

- canonical Soldiers: `224`
- normal Soldiers: `168`
- SP Soldiers: `56`
- normal tier-3: `129`
- normal ability level records: `1290`
- normal training level records: `1290`
- SP description levels: `560`
- SP stage1 missions: `112`
- SP stage2 missions: `45`
- SP second-stage true / false: `45 / 11`
- Hero-Soldier relation edges: `5977`
- relation provenance records: `5978`
- SP statDelta count: `56`
- expanded Hero references: `228`
- Stage 6-6 validation check failures: `0`
- preservation mismatch arrays: empty

No canonical Soldier, Hero-Soldier relation, JOIN or semantic authority was recomputed by P3.

## Second CI determinism run

After freezing the exact CI migration output, Stage 6-6 ran again on P3 head `5cce2f06497eb7bba554872ca2a7bf821e1d774c`:

- workflow run: `33297572396`
- job: `99219764067`
- conclusion: `SUCCESS`

All Stage 6-6 steps passed, including:

- semantic predecessor execution;
- V2 post-processing;
- artifact upload;
- `git diff --exit-code` frozen artifact verification.

The second run produced the same semantic counts and the same two semantic digests as the first run.

Second CI artifact:

- artifact ID: `9727896163`
- ZIP SHA-256: `95d3fdfab0c050588e480377987d437185934c7936cd60f7f5fc3727eedb0b93`

Therefore the one-time V1 -> V2 migration is frozen and Stage 6-6 exact-output determinism is restored.

## Downstream P4 ownership confirmed

Stage 6-7 remains intentionally unmodified in P3.

On the same P3 head, Stage 6-7 run `33297572529` failed only at the legacy raw-SHA freshness boundary:

- records PASS / REVIEW / FAIL: `11 / 213 / 0`
- representative QA: `6/6`
- filter QA: `15/15`
- reciprocal mismatch: `0`
- source snapshot mismatches: `2`
- failed gate: `sourceSnapshotsFrozen`

The two unique stale files are exactly the newly migrated Stage 6-6 frozen artifacts:

1. `data/generated/soldier-stage6-6-expansion-basis.v1.json`
2. `data/validation/soldier-stage6-6-expansion-basis.v1.json`

The final Soldier validator reports the generated file twice because it is referenced both as a source and as the `expansionBasis` key artifact. This is a P4 final-consumer freshness problem, not a P3 semantic regression.

P3 must not update Stage 6-7 or hide this mismatch.

## Project Doctor / required guard state

Required `pr-guard` also remains fail-closed on P3, as intended.

Observed on P3 head:

- D7 V7: `40/40 PASS`
- D5: `FRESH`, stale reason count `0`
- D1 deterministic regeneration: `PASS`
- Project Doctor hard errors: `0`
- Hero-Soldier final relation: Hero `267`, Soldier `224`, pairs `5977`, hard errors `0`

The real-diff execution eventually reaches the legacy Soldier Stage 6-7 final validator and fails on the same Stage 6-6 raw-SHA mismatches. The Doctor plan also contains manual-review routing that belongs to the later P5 classification stage.

P3 does not weaken the guard, D5, D7 or MANUAL_REVIEW policy.

## Concurrent main drift

Latest authoritative main at P3 closeout:

- `418769148e05b8eabd2a29ef9ad608f927c29fbf`

The main advances observed during P3 were presentation/deployment or Asset Hygiene changes and did not modify P3-owned Stage 6-6 files. The last main advance to `418769...` added only Asset Hygiene Stage 2 source-freeze artifacts.

Therefore no P3 semantic predecessor or Stage 6-6 projection reopening was required.

## REVIEW

Non-blocking:

- Execute the expanded current P3 20-case fixture matrix during P6 fail-closed regression coverage, or earlier only if P4 reveals an insufficient Stage 6-6 descriptor/projection rule.
- P4 must decide how Stage 6-7 recomputes and evaluates the Stage 6-6 generated/validation semantic digests rather than trusting embedded values alone.
- P5 must handle provenance-aware Project Doctor classification without weakening required guard behavior.

## BLOCKER

`NONE` for P3.

The current Stage 6-7/pr-guard failures are downstream blockers owned by P4/P5 and are intentionally not repaired in P3.

## Merge state

- PR #285 remains `DRAFT`.
- Do not merge P3 alone while P4 final-consumer migration is incomplete.
- Keeping the PR draft preserves the fail-closed downstream evidence and avoids publishing an intentionally incompatible intermediate Stage 6-6/6-7 state to main.

## Next start point

`P4 — Soldier Stage 6-7 final validator Semantic Freshness V2`

Start from the P3 branch/head and latest authoritative main. Modify only the Stage 6-7 final freshness owner needed to distinguish semantic stale from provenance-only drift. Preserve all existing Stage 6-7 semantic, coverage, QA, reciprocal and admission checks.

## Reopen P3 only if

- a Stage 6-6 consumed semantic mutation produces a false-equal digest;
- a provenance-only mutation produces a false semantic mismatch;
- the pinned semantic predecessor blob changes authoritatively;
- Stage 6-6 exact-diff determinism regresses;
- P4 proves the Stage 6-6 descriptor/projection shape is insufficient to recompute current semantic freshness safely.
