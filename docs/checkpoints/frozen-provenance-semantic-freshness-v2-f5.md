# Frozen Provenance / Semantic Freshness V2 — F5 Project Doctor Classification

Date: 2026-08-30

Status: `COMPLETE / PASS / REQUIRED_GUARD_GREEN`

## Current state

- F5 implementation head predecessor: `f569d13f2aacc85567f9594ab759771c9d371214`
- required base branch: `main`
- latest main verified before checkpoint: `50fe16b9f79a268adddde33b19a6185642974ad3`
- required status check: `pr-guard`
- active Project Doctor runtime introduced by F5:
  - D2: `data/contracts/project-doctor-d2-impact-contract.v6.json`
  - D3: `data/contracts/project-doctor-d3-validator-plan.v6.json`
  - D4: `data/contracts/project-doctor-d4-execution.v6.json`
  - D7: `data/contracts/project-doctor-d7-pr-guard.v8.json`

Historical D2/D3/D4 V5 and D7 V7 contracts remain unmodified predecessors.

## Authoritative classification model

F5 preserves the separation:

```text
D2 V6 candidate owner
  -> Semantic Freshness V2 base/head classification
  -> D3 V6 final check selection
  -> D4 V6 fail-closed execution
  -> D7 V8 required pr-guard
```

D2 remains path-based candidate routing. It does not infer semantic equality from filenames.

Supported content-aware frozen artifacts:

1. `data/generated/soldier-stage6-6-expansion-basis.v1.json`
2. `data/validation/soldier-stage6-6-expansion-basis.v1.json`
3. `data/generated/soldier-stage6-7-site-admission.v1.json`
4. `data/validation/soldier-stage6-7-site-admission.v1.json`

Classification rules:

- same semantic digest -> `PROVENANCE_ONLY_CHANGED`
- different semantic digest -> `SEMANTIC_CHANGED`
- missing side / invalid JSON / digest failure -> fail closed as semantic change

For provenance-only artifacts, candidate domain ownership is retained as evidence but final routing becomes `project-doctor / provenance-data` without Soldier/relation/frontend domain fan-out.

For actual semantic changes, original D2 candidate domain owners remain active and existing domain validators still run.

## F4 manual-review ownership closed

The four legitimate F4 unmapped paths are now explicitly routed:

- `scripts/lib/frozen-semantic-digest.mjs`
- `scripts/lib/soldier-stage6-6-semantic-projections.mjs`
- `scripts/lib/soldier-stage6-7-semantic-projections.mjs`
- `docs/checkpoints/frozen-provenance-semantic-freshness-v2-*`

Freshness semantic-boundary tooling maps to both `project-doctor` and `soldier-canonical` so tooling changes remain strict.
Maintenance checkpoints map to `project-doctor` only.

## Fail-closed evidence

Project Doctor Frozen Freshness V2 fixtures:

- fixture count: 4
- pass: 4
- provenance-only suppresses domain fan-out: PASS
- semantic change preserves domain owner: PASS

D4 V6 execution fixtures:

- fixture count: 5
- pass: 5
- freshness self-test executes: PASS
- freshness failure fail-fast: PASS
- manual review exit 3 preserved: PASS
- strict command tamper rejection: PASS
- dry-run executes nothing: PASS

D7 V8 guard contract validation:

- check count: 35
- failure count: 0
- `passingExitCodes`: `[0]`
- manual review exit code: `3`
- manual review is passing: `false`
- Doctor exit code is propagated directly
- PR workflow remains read-only
- no D5 reseal occurs inside required PR Guard

## Real PR evidence

Required Project Doctor PR Guard run `33299328555` completed `SUCCESS`.

All required steps passed, including:

- D7 V8 guard contract
- committed D5 freshness
- D1 deterministic regeneration
- D5 revalidation
- changed-file comparison
- Regression Coverage Promotion V1 admission
- Integrated Doctor real-diff dry run
- Integrated Doctor real-diff execution

Actual PR real-diff plan:

- status: `PLAN_READY`
- changed files: 29
- checks queued/run: 9 / 9
- provenance-only classified artifacts: 2
- manual review: 0
- execution: `PASS_EXECUTED`

All 9 selected checks exited 0:

1. Hero-Soldier relation final owner
2. Soldier canonical Stage 6-7 final owner
3. Frozen Freshness V2 self-test
4. Regression Coverage Promotion V2
5. Localization Audit
6. Production build
7. Project Doctor health gate
8. Project Doctor impact self-test
9. Project Doctor plan self-test

The required guard therefore became green by resolving ownership/classification, not by accepting exit 3.

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

Hero-Soldier final owner:

- pipeline: `FINAL_FROZEN`
- canonical pair count: 5,977
- C1 all-pair differences: 0
- C1 identity errors: 0
- C2 structural identity errors: 0
- C3 semantic fixtures: 6 / 6
- C4 boundary violations: 0
- hard errors: 0

Soldier Stage 6-7 final owner:

- status: PASS
- canonical: 224
- normal: 168
- SP: 56
- hard failures: 0
- frozen source refs: 12
- frozen key artifacts: 6

Regression Coverage Promotion V2:

- checks: 246
- failures: 0
- Soldier frozen snapshot mismatch: 0

Localization Audit:

- errors: 0
- frontend leaks: 0

Production build: PASS.

## What F5 did not change

- canonical Soldier IDs
- Hero-Soldier relation membership
- combat/training semantics
- D5 raw Git blob freshness contract
- branch protection
- required status-check identity
- `pull_request.paths`
- producer/writeback workflow transport
- manual-review passing policy
- Hosted QA / deployment / GitHub Pages

## REVIEW

- F5 content-aware classification currently supports only the four scoped Stage 6-6 / Stage 6-7 artifacts.
- Broader Soldier Stage 5/6 migration remains a later migration task after fail-closed regression coverage is established.
- `nameKr` and other display/localization fields must not be globally declared metadata; their semantic/presentation policy remains contract-specific.

## BLOCKER

None for F5.

## Next start

`F6 — Fail-Closed Regression Fixtures`

Build the explicit mutation matrix before broadening Semantic Freshness V2 beyond the F3/F4 pilot boundary.

Minimum F6 matrix:

- generatedAt-only change -> semantic fresh / provenance-only
- workflow run ID only -> semantic fresh / provenance-only where the contract excludes it
- upstream gitBlobSha only -> semantic fresh / provenance-only
- formatting-only JSON change -> semantic fresh
- Soldier ID change -> semantic stale / fail
- canonical 224 -> 223 -> fail
- SP 56 -> 55 -> fail
- relation 5,977 -> 5,976 -> fail
- reciprocal mismatch 0 -> 1 -> fail
- combat stat mutation -> fail
- training value mutation -> fail
- breaking schema version -> fail
- source path missing -> fail
- Soldier Korean display-name mutation -> classify according to the explicit artifact contract; do not blanket-ignore names

## Reopen F5 only if

- provenance-only mutation still triggers domain fan-out for a supported artifact,
- true semantic mutation is downgraded to provenance-only,
- missing/invalid comparison stops failing closed,
- D7 permits exit 3 or any nonzero status to pass,
- D2/D3/D4 predecessor composition changes,
- or a new Project Doctor routing regression produces legitimate unmapped freshness paths.
