# Frozen Provenance / Semantic Freshness V2 — F3 Checkpoint

## Status

- Stage: `F3`
- Status: `COMPLETE`
- Result: `PASS`
- Scope: `Soldier Stage 6-6 pilot only`
- Work branch: `maintenance/frozen-provenance-semantic-freshness-v2-f3`
- Draft PR: `#279`
- Authoritative pilot base: `main@1a80d5c63baf8fe6ffa42823977572a8ceba5dd1`
- Latest authoritative main rechecked at F3 closeout: `1a80d5c63baf8fe6ffa42823977572a8ceba5dd1`
- Logical F2 predecessor: `maintenance/frozen-provenance-semantic-freshness-v2@90542d68a8973acf01b26c72fafbad4f0e84bbdc`

## Purpose

Pilot `frozen-semantic-freshness/v2` at exactly one production freshness owner: Soldier Stage 6-6.

The pilot must prove all of the following without changing workflow transport or Project Doctor pass policy:

1. Stage 6-6 semantic behavior remains identical to the authoritative predecessor.
2. Stage 6-6 source freshness is represented by explicit semantic digests while raw `gitBlobSha` remains audit provenance.
3. Same semantic content plus a different source blob can classify as provenance-only.
4. Real Stage 6-6 consumed semantic changes remain detectable and therefore continue to produce a blocking frozen-output diff.
5. After the one-time V1 -> V2 migration freeze, the existing Stage 6-6 PR regenerate + exact-diff gate becomes deterministic again.

## Authoritative semantic predecessor

The pilot wrapper executes the exact Stage 6-6 producer from:

- commit: `1a80d5c63baf8fe6ffa42823977572a8ceba5dd1`
- path: `scripts/finalize-soldier-stage6-6-expansion-basis.cjs`

This preserves the existing Stage 6-6 semantic validation as the pilot authority instead of reimplementing or reopening canonical Soldier semantics.

## Files changed by F3

- `scripts/lib/frozen-semantic-digest.mjs`
- `scripts/lib/soldier-stage6-6-semantic-projections.mjs`
- `scripts/validate-soldier-stage6-6-freshness-v2-fixtures.mjs`
- `scripts/finalize-soldier-stage6-6-expansion-basis.cjs`
- `data/generated/soldier-stage6-6-expansion-basis.v1.json`
- `data/validation/soldier-stage6-6-expansion-basis.v1.json`
- this checkpoint

No `.github/workflows/**`, Project Doctor contract/validator, branch-protection setting, Soldier name/localization source, or Hero-Soldier canonical relation artifact was changed.

## Stage 6-6 semantic projection boundary

The V2 source projection includes only fields consumed by the authoritative Stage 6-6 producer.

- full records: `soldierId`, `identity.isSp`, `identity.tier`, `combat`, `ability`, `training`, `sp`
- Stage 5-2: Soldier ID + combat
- Stage 5-3: Soldier ID + ability
- Stage 5-4: Soldier ID + training
- Stage 5-6: Soldier ID + SP block
- Hero-Soldier relation: pair identity + provenance `sourceKind` + Stage 6-6 consumed relation summary
- validation artifacts: only the status/check fields directly consumed by Stage 6-6
- Stage 6-5 manifest: the canonical relation-count boundary consumed by Stage 6-6

`nameKr` is deliberately not part of the Stage 6-6 source projection because Stage 6-6 does not consume it. This is a stage-local freshness statement, not a global claim that Soldier names are non-semantic.

## Freshness model proven in F3

Each Stage 6-6 source ref now carries:

- `path`
- historical/sticky `gitBlobSha`
- `semanticDigest`
- `freshnessMode: SEMANTIC_DIGEST_V2_STICKY_PROVENANCE`

Classification:

- semantic equal + same blob -> `SEMANTIC_FRESH`
- semantic equal + different blob -> `PROVENANCE_ONLY_CHANGED`
- semantic digest mismatch -> `SEMANTIC_STALE`
- legacy/malformed V2 ref -> fail closed

Sticky provenance rule:

- semantic digest unchanged -> retain the previously frozen `gitBlobSha`
- semantic digest changed -> advance to the current source blob with the new digest

Runtime provenance observations are logged and are not written back as new frozen bytes.

## Fixture result

Command:

`node scripts/validate-soldier-stage6-6-freshness-v2-fixtures.mjs`

Result: `13/13 PASS`

Verified cases include:

- `generatedAt` only -> same semantic digest
- nested `gitBlobSha` only -> same semantic digest
- Stage 6-6-unconsumed `nameKr` only -> same Stage 6-6 digest
- combat mutation -> different digest
- ID-indexed record order change -> same digest
- relation raw blob provenance only -> same digest
- relation provenance `sourceKind` change -> different digest
- semantic equal + blob equal -> `SEMANTIC_FRESH`
- semantic equal + blob changed -> `PROVENANCE_ONLY_CHANGED`
- semantic mutation -> `SEMANTIC_STALE`
- missing semantic digest -> fail closed
- sticky provenance retains old blob when semantics are equal
- sticky provenance advances when semantics change

## First CI migration run

Stage 6-6 PR run:

- workflow run: `33296017911`
- run number: `88`

Observed sequence:

- authoritative Stage 6-6 semantic predecessor: PASS
- V2 post-processing/self-check: PASS
- artifact upload: PASS
- final frozen exact-diff: FAIL as expected because the branch still contained V1 frozen artifacts

This was treated as a one-time migration diff, not as semantic regression.

CI artifact:

- artifact id: `9727425710`
- artifact digest: `sha256:a9ca640d0e9bc92b4b6153241238a6b5f167d51ead4397f33ade8354d4cbcf4d`

The two Stage 6-6 V2 frozen artifacts committed afterward were taken from this CI result.

## Semantic preservation after V2 migration

Generated and validation artifacts remain `PASS` and preserve the established Stage 6-6 semantic invariants:

- canonical Soldiers: `224`
- normal Soldiers: `168`
- SP Soldiers: `56`
- normal tier-3: `129`
- normal ability level records: `1290`
- normal training level records: `1290`
- SP description level records: `560`
- SP stage-1 mission count: `112`
- SP stage-2 mission count: `45`
- relation edges: `5977`
- relation provenance: `5978`
- all Stage 6-6 validation checks: `0`
- errors: `[]`

V2 artifact semantic digests:

- generated: `sha256:d2f6c75c3d454bdf72b8c42f1a701c41d3fefe7013e16640132ce66c08f60691`
- validation: `sha256:6f11e531b3581856dd92dd23b494fedcb82f69899eb08e339ef824e1ef3c931d`

## Second CI determinism run

After freezing the first CI migration artifacts:

- workflow run: `33296183305`
- run number: `90`
- head tested: `5cef9173a42367f4a0ebdd3301bec29dcf0530a1`
- result: `SUCCESS`

The Stage 6-6 job passed all relevant steps:

1. regenerate/validate Stage 6-6
2. upload artifacts
3. verify frozen Stage 6-6 artifacts on PR with exact diff

This proves the V2 pilot is deterministic under the existing unchanged Stage 6-6 workflow gate.

## Downstream boundary observed after F3

On the same migrated head `5cef9173a42367f4a0ebdd3301bec29dcf0530a1`:

- Soldier Stage 6-6: `SUCCESS`
- Soldier Stage 6-7 Site Admission: `FAIL`
  - failure occurs in `Run Soldier Stage 6-7 final admission gate`
  - later Stage 6-7 artifact/frozen checks are skipped
- Project Doctor PR Guard: `FAIL`
  - D7 guard contract: PASS
  - committed freshness seal: PASS
  - D1 regeneration/determinism: PASS
  - re-freshness: PASS
  - changed-file comparison: PASS
  - Regression Coverage Promotion: PASS
  - Integrated Doctor real-diff dry run: PASS
  - Integrated Doctor real-diff execution: FAIL

This does not reopen F3. Stage 6-7 remains the known V1 final freshness owner and is the explicit next migration stage. F4 owns the remaining downstream failure boundary.

## Production / policy impact

- Stage 6-6 semantic logic re-researched: `NO`
- Stage 6-6 semantic invariants changed: `NO`
- Hero-Soldier relation regenerated: `NO`
- workflow transport changed: `NO`
- Project Doctor pass criteria changed: `NO`
- `pr-guard` exit policy changed: `NO`
- branch protection changed: `NO`

## REVIEW

1. `pilotSemanticPredecessor` pins Stage 6-6 semantic execution to `main@1a80d5c63baf8fe6ffa42823977572a8ceba5dd1`. This is intentionally a pilot-isolation mechanism, not a permanent production architecture. It must be removed or cleanly integrated before V2 production activation; do not merge the F3 draft as final architecture solely on this basis.
2. Stage 6-7 and required `pr-guard` remain red on the F3 draft because the downstream final freshness boundary is still V1. F4 must migrate the Stage 6-7 final-owner interpretation without weakening semantic coverage or guard policy.
3. The relation projection is Stage 6-6-local. It must not be generalized to other relation consumers without inspecting their actual consumed fields.
4. Before F4 implementation, recheck authoritative `main` and Stage 6-7 ownership because the repository is active.

## BLOCKER

F3 blocker: `NONE`

Workspace merge blocker: `F4 REQUIRED` — the draft remains intentionally not merge-ready while Stage 6-7 / required `pr-guard` are red.

## Next start point

`F4 — Soldier Stage 6-7 final freshness conversion`

Start by re-reading the latest authoritative Stage 6-7 producer, Stage 6-7 frozen output, and `validate-soldier-stage6-7-final.mjs`. Replace recursive/raw-blob freshness authority with direct semantic dependency verification while preserving all existing semantic coverage, QA and admission gates.

## Reopen F3 only if

- Stage 6-6 V2 regeneration stops matching the committed frozen artifacts;
- a Stage 6-6 fixture exposes a false semantic equality or false semantic mismatch;
- authoritative main changes the Stage 6-6 semantic producer contract before F4 consumes this pilot;
- F4 demonstrates that a Stage 6-6-consumed semantic field is missing from the F3 projection.
