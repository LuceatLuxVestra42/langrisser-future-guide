# Project Check tracked-mutation baseline fixture

Purpose: freeze the current failure signature before changing Project Check behavior.

This fixture records two deterministic cases using the current tracked-state guard semantics:

1. `BASE_AND_HEAD_SAME_TRACKED_MUTATION`
   - exact base and PR head expose the same tracked mutation signature.
   - current Project Check behavior: required check failure (`BLOCKER_TRACKED_MUTATION`).
   - future target classification: `REVIEW_EXISTING_DRIFT`.

2. `HEAD_ONLY_TRACKED_MUTATION`
   - exact base is clean and the PR head exposes the tracked mutation signature.
   - current Project Check behavior: required check failure (`BLOCKER_TRACKED_MUTATION`).
   - future target classification: `REGRESSION_BLOCKER`.

The fixture intentionally does not implement base-vs-head classification. It proves that the current workflow collapses both cases into the same fail-closed result, so later work can change that behavior against a fixed regression witness.

Scope is Project Check tooling only. No owner routing, validator catalog, merge-finalizer, frontend, semantic data, or generated consumer behavior is changed here.
