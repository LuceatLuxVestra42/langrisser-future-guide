# Frozen Provenance / Semantic Freshness V2 — F8 Migration / Closeout

## Status

- Stage: F8 — Migration / Closeout
- Status: READY_FOR_REQUIRED_GUARD
- Predecessor: F7 checkpoint commit `e53d661c9a53b9940318d34639818eabfe29dd5c`
- F8 branch: `maintenance/frozen-provenance-semantic-freshness-v2-f8`
- Integration base verified at F8 start: `main` `73afee0e72e475b4bc925ba7c83ee4ee1a9b38b0`
- Required status check: `pr-guard`
- Semantic research reopened: NO
- Canonical Soldier population recomputed: NO
- Hero-Soldier relation recomputed: NO
- Raw ConfigData read: NO

## Closeout decision

`frozen-semantic-freshness/v2` is the active freshness authority for the migrated Soldier final-chain boundary covered by this workstream.

The governing rule is:

```text
semanticDigest decides semantic freshness.
gitBlobSha remains historical/audit provenance.
generatedAt and equivalent runtime provenance metadata do not decide semantic freshness.
```

A raw Git blob mismatch by itself is not a semantic failure when the declared consumer projection produces the same semantic digest.

A semantic digest mismatch remains blocking and must be handled by the direct downstream owner.

## Active migrated boundary

The migrated production/final-owner boundary is intentionally narrow.

### Soldier Stage 6-6

Active V2 artifacts:

- `data/generated/soldier-stage6-6-expansion-basis.v1.json`
- `data/validation/soldier-stage6-6-expansion-basis.v1.json`

Authority:

- direct dependency semantic projections owned by `scripts/lib/soldier-stage6-6-semantic-projections.mjs`
- deterministic digest implementation owned by `scripts/lib/frozen-semantic-digest.mjs`
- `gitBlobSha` retained on source refs as sticky historical freeze provenance

F7 proved:

- source semantic freshness observations: `SEMANTIC_FRESH = 14`
- frozen regenerated artifact diff: `0`
- canonical Soldier: `224`
- normal / SP / normal tier 3: `168 / 56 / 129`
- relation edges: `5,977`
- all Stage 6-6 preservation mismatch/error counters: `0`

### Soldier Stage 6-7

Active V2 artifacts:

- `data/generated/soldier-stage6-7-site-admission.v1.json`
- `data/validation/soldier-stage6-7-site-admission.v1.json`

Authority:

- direct semantic dependency projections owned by `scripts/lib/soldier-stage6-7-semantic-projections.mjs`
- Stage 6-7 final validator consumes semantic freshness while preserving strict structural/coverage/relation gates
- raw blob provenance remains recorded for audit/history

F7 proved:

- Stage 6-7 producer: PASS
- final validator: PASS
- admission: `READY_WITH_REVIEW`
- canonical Soldier: `224`
- Hero keys: `267`
- Hero-Soldier relations: `5,977`
- reciprocal mismatch: `0`
- representative QA: `6/6`
- filter QA: `15/15`
- source semantic dependency failures: `0`
- coverage mismatches: `0`
- expansion preservation failures: `0`
- hard failures: `0`
- frozen regenerated artifact diff: `0`

### Project Doctor

Active content-aware classification is limited to the four Stage 6-6 / Stage 6-7 frozen artifacts above.

The effective flow is:

```text
D2 V6 candidate owner
  -> Frozen Freshness V2 semantic/provenance classification
  -> D3 V6 final check selection
  -> D4 V6 fail-closed execution
  -> D7 V8 required pr-guard
```

Classification remains:

- same semantic digest -> `PROVENANCE_ONLY_CHANGED`
- different semantic digest -> `SEMANTIC_CHANGED`
- missing side / invalid JSON / digest failure -> fail closed as semantic change

Provenance-only changes may suppress unrelated Soldier/relation/frontend fan-out for the supported artifacts.
True semantic changes preserve the original domain owner and validators.

## Contract-specific semantic projections

V2 does not define a global recursive field blacklist.

Each consumer explicitly owns its semantic projection.

Examples already regression-proven:

- `generatedAt` is audit-only for the migrated frozen boundary.
- raw/nested `gitBlobSha` is audit-only for semantic equality.
- workflow run ID is audit-only only where the explicit consumer contract excludes it.
- `nameKr` is not globally metadata:
  - Stage 6-6 full-record projection does not consume it.
  - Stage 6-7 detail projection does consume it.
- generic consumed arrays preserve order unless the projection explicitly declares order non-semantic.
- Stage 6-6 Soldier records are explicitly ID-indexed, so source record order is non-semantic for that projection.

## Sticky provenance policy

`gitBlobSha` is preserved as historical evidence, not rewritten on every provenance-only upstream blob change.

Rules:

1. semantic digest unchanged + current blob changed
   - semantic state: fresh
   - classification: provenance-only
   - retain prior frozen `gitBlobSha`
   - do not force downstream semantic regeneration

2. semantic digest changed
   - semantic state: stale
   - direct downstream owner must regenerate/revalidate
   - on explicit freeze, advance the expected semantic digest and audit blob reference

3. downstream semantic output remains identical after a direct dependency semantic refresh
   - downstream own semantic digest may remain unchanged
   - the next downstream consumer therefore does not inherit a second-order provenance cascade

## Legacy V1 / raw-SHA preservation boundary

F8 does not delete or rewrite historical V1 provenance.

The following remain intentionally preserved:

- historical `gitBlobSha` fields in frozen/generated/validation artifacts
- prior checkpoints and frozen history
- D5 raw Git blob freshness contract outside the scoped F5 content-aware classifier
- non-migrated Soldier Stage 5/6 freshness contracts unless explicitly covered by the migrated Stage 6-6 projection boundary

Missing V2 semantic freshness metadata is never silently treated as fresh.

Legacy or malformed refs remain fail-closed under their owning contract until separately migrated.

## Hero-Soldier Stage C boundary

Hero-Soldier Stage C remains `FINAL_FROZEN` and is not semantically reopened by F8.

Its internal C0-C5/C-FINAL historical raw-SHA freeze guards are preserved.

This workstream uses the already-frozen Hero-Soldier relation as an authoritative upstream input and applies V2 semantic projection at the Soldier consumer boundary.

F8 does NOT:

- regenerate Stage C relation membership
- rewrite C-FINAL historical SHA snapshots
- infer new Hero-Soldier pairs
- change canonical pair cardinality

Confirmed relation invariant remains `5,977` reciprocal pairs with mismatch `0`.

A future relation-internal V2 migration, if ever needed, is a separate maintenance workstream.

## Required guard policy

No guard weakening is part of F8.

Preserved:

- required check identity: `pr-guard`
- `passingExitCodes: [0]`
- manual-review exit code remains non-passing
- Doctor exit code propagation remains direct
- PR guard remains read-only
- no branch-protection relaxation
- no D5 reseal inside required PR Guard

F8 completion requires the actual integration PR against then-current `main` to pass the required `pr-guard`.

## Frozen invariant matrix

| Invariant | Frozen value |
| --- | ---: |
| Canonical Soldier | 224 |
| Normal Soldier | 168 |
| SP Soldier | 56 |
| Normal tier 3 | 129 |
| Hero | 267 |
| Hero-Soldier relation | 5,977 |
| Reciprocal mismatch | 0 |
| Representative QA | 6/6 |
| Filter QA | 15/15 |
| Stage 6-6 preservation errors | 0 |

These values are reused from the validated F7 frozen results; F8 does not recompute their semantics from raw sources.

## Regression evidence inherited from F6/F7

Permanent fail-closed regression coverage remains:

- Stage 6-6 V2 fixtures: `13/13 PASS`
- F6 mutation matrix: `22/22 PASS`
- integrated Project Doctor freshness V2 self-test: `26/26 PASS`

The mutation matrix proves both directions:

- provenance-only changes can remain semantic-fresh
- true semantic changes remain blocking

It also proves missing/legacy refs fail closed.

## Explicitly out of scope / unchanged

F8 does not modify:

- canonical Soldier identity/population
- Hero-Soldier relation semantics
- Hero-Soldier Stage C semantics
- combat/training/SP mission semantics
- Soldier Korean-name policy
- producer/writeback transport workflows
- `pull_request.paths` cleanup
- standalone workflow retirement
- branch protection
- required status-check identity
- MANUAL_REVIEW passing policy
- Hosted QA / deployment / GitHub Pages
- frontend presentation
- raw ConfigData canonical research

## REVIEW

Non-blocking review items remain:

1. broader Soldier Stage 5/6 semantic-freshness migration is not included in this closeout.
2. Hero-Soldier Stage C internal raw-SHA freeze remains legacy and intentionally untouched.
3. Project Doctor content-aware classifier remains scoped to the four migrated Stage 6-6/6-7 artifacts.
4. Existing Stage 6-7 `READY_WITH_REVIEW` classifications remain declared non-blocking review items and are not freshness regressions.

These are not F8 blockers.

## BLOCKER

None before integration guard.

The only remaining closeout condition is the required `pr-guard` result on the F8 integration PR against current `main`.

## Reopen conditions

Reopen this freshness workstream only if at least one of the following occurs:

- canonical Soldier population or identity changes
- Hero-Soldier canonical membership/cardinality changes
- Stage 6-6 or Stage 6-7 semantic projection contract changes
- deterministic digest canonicalization changes
- the four-artifact Project Doctor classifier scope/meaning changes
- required `pr-guard` fail-closed contract changes
- a proven false-positive or false-negative appears in freshness classification
- a new freshness-ref format bypasses legacy/missing-ref fail-closed behavior
- new authoritative evidence conflicts with the frozen invariant matrix

Do not reopen for:

- CSS/layout/responsive changes
- localization/presentation-only changes
- image/WebP/asset delivery changes
- Hosted/Pages/browser failures
- workflow path fan-out cleanup
- producer transport cleanup
- provenance-only raw blob drift with equal semantic digest

## Completion procedure

1. open F8 integration PR against current `main`
2. verify changed-file scope remains the validated Frozen Freshness V2 implementation/checkpoints only
3. require normal `pr-guard` execution
4. if `pr-guard` is green, update this checkpoint to `COMPLETE / PASS / REQUIRED_GUARD_GREEN`
5. record the integration PR/run evidence without reopening semantics

## Next start after F8

No automatic F9 semantic migration is implied.

After F8 closes, broader Stage 5/6 or Hero-Soldier relation-internal V2 migration should begin only as a separately scoped maintenance task with its own evidence and completion criteria.
