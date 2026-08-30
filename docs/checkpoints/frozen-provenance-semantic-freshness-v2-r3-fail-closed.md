# Frozen Provenance / Semantic Freshness V2 — R3 Fail-Closed Regression

## Current status

- Status: `R3_COMPLETE / PASS`
- Scope: fail-closed mutation regression for Semantic Freshness V2
- Branch: `maintenance/frozen-semantic-freshness-v2-r3-fail-closed`
- Predecessor: R2 final head `96db8b7f417814b27defbf25ee5a1b9580677b45`
- PR: `#302`
- First required guard evidence: Project Doctor PR Guard run `33308214031` on implementation head `ef98c93671ac0ff93e639e053e330b2f554bd4fd` — `SUCCESS`
- Merge rule: because this checkpoint itself advances the PR head, merge remains prohibited until required `pr-guard` is green again on the exact final PR head.

## Authoritative source / predecessor

R3 does not create a new semantic relation authority.

- Membership freshness authority remains `scripts/soldier-stage6-5-semantic-projections.mjs`.
- Projection remains `hero-soldier-membership/v1`.
- Freshness mode remains `SEMANTIC_DIGEST_V2_MEMBERSHIP`.
- A-8 remains the authoritative richer Hero-Soldier relation validator for `sourceKind`, direct origin, inheritance provenance, source completeness, index parity, and exact-snapshot traceability.
- A-3 remains the authoritative allowed relation-source classification contract.
- R2 remains `NO_MIGRATION_REQUIRED`; the Stage 4-6 A-7/A-8 exact-SHA checks remain same-run traceability guards rather than historical semantic-freshness comparisons.

## Implemented artifact

Added:

- `scripts/validate-hero-soldier-semantic-freshness-r3-fail-closed.mjs`

The regression uses a small synthetic relation fixture and the active R1 membership digest/classifier. It mirrors only the A-8 `sourceKind` / provenance hard checks required to derive semantic health for the R3 mutations; this test helper does not become relation authority and does not replace A-8.

The existing required workflow `.github/workflows/project-doctor-d7-pr-guard.yml` now runs the R3 regression directly. The workflow name, job name/context `pr-guard`, permissions, and branch protection are unchanged.

## Mutation matrix

| Mutation | Derived condition | Expected / actual classification |
| --- | --- | --- |
| pair deletion | membership digest differs | `SEMANTIC_STALE` |
| pair addition | membership digest differs | `SEMANTIC_STALE` |
| Hero ID mutation | membership digest differs | `SEMANTIC_STALE` |
| Soldier ID mutation | membership digest differs | `SEMANTIC_STALE` |
| `sourceKind` mutation | A-8-style source-kind semantic health fails while membership can remain equal | `SEMANTIC_STALE` |
| provenance semantics mutation | A-8-style inherited provenance health fails while membership can remain equal | `SEMANTIC_STALE` |
| malformed membership projection | semantic digest cannot be proven | `SEMANTIC_UNKNOWN` |
| missing current source evidence | required freshness evidence absent | `SEMANTIC_UNKNOWN` |

All eight mutation cases additionally assert that the result is not `PROVENANCE_ONLY_CHANGED`.

## Positive controls

- same semantic digest + same blob -> `SEMANTIC_FRESH`
- same semantic digest + different blob + healthy richer semantics -> `PROVENANCE_ONLY_CHANGED`

This preserves the intended provenance-only path while preventing semantic or unprovable changes from escaping through it.

## Required guard evidence

Required `Project Doctor PR Guard` run `33308214031` completed `SUCCESS` on implementation head `ef98c93671ac0ff93e639e053e330b2f554bd4fd`.

Successful steps included:

- `Validate D7 guard contract`
- `Validate committed freshness seal`
- `Validate R3 fail-closed semantic freshness regression`
- deterministic D1 regeneration check
- freshness revalidation
- `Integrated Doctor real-diff dry run`
- `Integrated Doctor real-diff execution`

The exact final PR head still must receive its own green required guard after this checkpoint-only commit.

## Preserved frozen scope

R3 did not reopen or regenerate completed semantic data. Inherited frozen invariants remain authoritative and were not recalculated by R3:

- Hero: 267
- Soldier: 224 = 168 normal + 56 SP
- Normal T3: 129
- Hero-Soldier pairs: 5,977

R3 did not perform:

- Soldier ID recalculation
- Hero 267 re-research
- Soldier 224 re-research
- Hero-Soldier 5,977 relation regeneration
- name JOIN
- ID arithmetic
- raw ConfigData full scan
- relation producer transport change
- frontend/presentation changes
- Hosted/Deployment or Browser/UI validation mixing
- branch-protection change
- `pr-guard` bypass

The Stage 4-6 checks `relationBlobMismatchInValidation`, `relationBlobMismatchInIndex`, and `bySoldierBlobMismatchInValidation` are unchanged and remain exact same-snapshot A-7/A-8 traceability blockers.

## REVIEW

- The old accidental R2 probe branches remain cleanup-only REVIEW and do not affect semantic status or `main`.
- R3 intentionally mirrors only the A-8 rules required by the two richer-semantic mutations. If A-3/A-8 source-kind or provenance contracts change, this regression must be updated rather than treated as a new independent authority.

## BLOCKER

- Semantic/implementation blocker: none.
- Merge gate: final exact-head required `pr-guard` must be green after this checkpoint commit.

## Next start

R4: inspect the Hero-Soldier literal SHA pin and classify it first as either historical provenance/audit evidence or intentionally byte-level authority. Keep it unchanged when byte equality is the actual contract; migrate only if it is being misused as semantic freshness authority.

## Reopen conditions

Reopen R3 only if one of the following occurs:

- `hero-soldier-membership/v1` projection semantics change;
- the Stage 6-5 freshness classifier contract changes;
- A-3 allowed `sourceKind` semantics change;
- A-8 provenance/inheritance validation semantics change;
- a mutation regression unexpectedly classifies as `PROVENANCE_ONLY_CHANGED`;
- malformed/missing semantic evidence no longer fails closed;
- required `pr-guard` stops executing this regression or fails on the R3 path.
