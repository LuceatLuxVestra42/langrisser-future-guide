# Frozen Provenance / Semantic Freshness V2 — F7 Checkpoint

## Status

- Stage: F7 — Full Soldier Regression
- Status: COMPLETE / PASS
- Predecessor: F6 checkpoint commit `487c0ff1757ec3d634089fd8d9d502929d5bff6d`
- F7 branch: `maintenance/frozen-provenance-semantic-freshness-v2-f7`
- One-time regression execution commit: `e2c0c1d9ae0bbaaec920ffca5b81850b11159a75`
- One-time regression run: `33299939347`
- Job: `99226051286` (`soldier-regression`)
- Temporary regression workflow removed after PASS: commit `17e6f29fcbc84b34889ff8a9780e08ec386709e5`
- Semantic research reopened: NO
- Canonical Soldier population recomputed from raw source: NO
- Hero-Soldier relation recomputed: NO
- Raw ConfigData read: NO

## Authoritative baseline / freshness

Current `main` at F7 closeout: `73afee0e72e475b4bc925ba7c83ee4ee1a9b38b0`.

Compared with the prior latest-main baseline `fef45f3a162cae33ebd04590be35811cc70ab3b9`, intervening main changes were confined to Asset Hygiene / hosted Equipment paths and `scripts/project-doctor-validate-authoritative-pages-hosted.mjs`.

No Soldier Stage 6-6/6-7 frozen artifact, Soldier Semantic Freshness V2 projection, or Soldier freshness contract path changed. Therefore the intervening main changes are non-blocking presentation/asset/hosted changes for this Soldier semantic regression and do not reopen upstream Soldier semantics.

## Regression execution

The F7 run reused existing authoritative producers/validators in read-only regression mode.

### Stage 6-6

Executed:

- `node scripts/finalize-soldier-stage6-6-expansion-basis.cjs`
- frozen artifact exact diff check for Stage 6-6 generated + validation files

Result:

- Stage 6-6: PASS
- normal / SP / normal tier 3: `168 / 56 / 129`
- canonical Soldier coverage from frozen validation: `224`
- normal ability level records: `1290`
- normal training level records: `1290`
- relation edges: `5,977`
- relation provenance: `5,978`
- source freshness observations: `SEMANTIC_FRESH = 14`
- all preservation mismatch/error counters: `0`
- frozen Stage 6-6 artifact diff: `0`

Preservation counters confirmed zero:

- combat preservation mismatches: 0
- ability preservation mismatches: 0
- training preservation mismatches: 0
- SP preservation mismatches: 0
- baseline mismatches: 0
- invalid/duplicate/source-ID-set mismatches: 0
- relation invalid pairs / missing provenance / provenance summary mismatch: 0

### Stage 6-7

Executed:

- `node scripts/finalize-soldier-stage6-7-site-admission.cjs`
- frozen artifact worktree check for Stage 6-7 generated + validation files
- `node scripts/validate-soldier-stage6-7-final.mjs`

Result:

- Stage 6-7 producer: PASS
- final validator: PASS
- admission: `READY_WITH_REVIEW`
- canonical Soldier: `224`
- normal Soldier: `168`
- SP Soldier: `56`
- normal tier 3: `129`
- Hero keys: `267`
- Hero-Soldier relations: `5,977`
- reciprocal mismatch: `0`
- representative QA: `6/6`
- filter QA: `15/15`
- source semantic dependency failures: `0`
- source snapshot mismatches: `0`
- coverage mismatches: `0`
- expansion preservation failures: `0`
- admission gate failures: `0`
- hard failures: `0`
- frozen source refs: `12`
- frozen key artifacts: `6`
- provenance-only changed at this regression point: `0`
- frozen Stage 6-7 artifact diff: `0`

All Stage 6-7 admission gates remained PASS:

- generationComplete
- validationClassified
- representativeQa
- listAndRelease
- filterQa
- reciprocalHeroLinks
- expansionFoundation
- sourceSnapshotsFrozen
- derivationDocumented

## Project Status downstream checks

Executed in check-only mode:

- `render-project-doctor-status-source-closeout-request.mjs --pipeline soldier --check`
- `bridge-project-doctor-status-source.mjs --pipeline soldier --check`

Results:

- closeout request projection: PASS / COMPLETE / idempotent baseline
- Project Status bridge: PASS / COMPLETE
- Soldier final source already active
- selected source: `data/validation/soldier-stage6-7-site-admission.v1.json`
- D1 preflight: PASS
- no write performed
- no raw ConfigData read
- no semantic recomputation
- no canonical JOIN recomputation

## Freshness regression

Re-executed:

- Stage 6-6 Semantic Freshness V2 fixtures: `13/13 PASS`
- F6 fail-closed mutation matrix: `22/22 PASS`
- integrated Project Doctor freshness V2 self-test: `26/26 PASS`
  - Project Doctor routing fixtures: 4
  - F6 fail-closed fixtures: 22

Confirmed policy remains:

- provenance-only change can remain semantic-fresh
- semantic mutation remains blocking
- name handling is consumer-contract-specific
- missing/legacy freshness refs fail closed
- arrays are not globally sorted
- provenance-only classification suppresses unrelated domain fan-out
- semantic change preserves domain owner

## Frozen invariant matrix

| Invariant | Expected | F7 result |
| --- | ---: | ---: |
| Canonical Soldier | 224 | 224 |
| Normal Soldier | 168 | 168 |
| SP Soldier | 56 | 56 |
| Normal tier 3 | 129 | 129 |
| Hero | 267 | 267 |
| Hero-Soldier relation | 5,977 | 5,977 |
| Reciprocal mismatch | 0 | 0 |
| Representative QA | 6/6 | 6/6 |
| Filter QA | 15/15 | 15/15 |
| Stage 6-6 preservation errors | 0 | 0 |

## REVIEW

Stage 6-7 remains `READY_WITH_REVIEW` with the already-declared review classifications. They are not new blockers and F7 did not reopen them.

Examples include unresolved release ordering/date presentation, identity presentation review, representative asset ID review, and route implementation separation. These remain declared REVIEW items under the existing Stage 6-7 contract.

## BLOCKER

NONE.

## Required guard note

F7 introduced no new semantic runtime implementation after F6. It added only the regression checkpoint after executing existing authoritative validators. The required `pr-guard` fail-closed policy established and proven in F5 remains unchanged; F7 did not change passing exit codes, manual-review policy, branch protection, or guard workflow behavior.

A future integration PR should still run the normal required `pr-guard` against the then-current `main` before merge. F7 does not substitute this regression run for that integration gate.

## Completion decision

F7 completion criteria are satisfied:

- same frozen Soldier semantics regenerate without artifact drift,
- all canonical/coverage/relation invariants remain unchanged,
- actual semantic mutation fixtures remain fail-closed,
- provenance-only changes remain separately classifiable,
- Project Status downstream projection remains current,
- no upstream semantic research or relation recomputation was needed.

## Next start

F8 — Migration / Closeout.

F8 should preserve V1 raw provenance/history, make the V2 semantic freshness contract the active documented closeout authority for the migrated Soldier final chain, record migration boundaries, and define reopen conditions. Do not delete historical raw `gitBlobSha` provenance or silently rewrite FINAL_FROZEN Hero-Soldier C checkpoints.

## Reopen F7 only if

- canonical Soldier population or IDs change,
- Hero-Soldier relation membership/cardinality changes,
- Stage 6-6/6-7 semantic projection contract changes,
- Stage 6-7 final-owner validator changes materially,
- a freshness regression fixture is found false-positive/false-negative,
- new authoritative evidence conflicts with the frozen invariant matrix above.
