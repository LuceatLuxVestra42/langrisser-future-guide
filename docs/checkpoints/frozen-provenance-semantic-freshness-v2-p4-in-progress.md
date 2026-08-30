# Frozen Provenance / Semantic Freshness V2 — P4 In Progress

- Stage: P4
- Status: IN_PROGRESS
- Scope: Soldier Stage 6-7 final freshness consumer only
- Predecessor: P3 `9e573078fc8334890f8f8f6b0c86863c08f796a7`
- Work branch: `maintenance/frozen-provenance-semantic-freshness-v2-p4`
- Latest main observed at start: `d2720241996eaa1e8f892b9a56d710a6c6d8f107`

P4 migrates only the three Stage 6-6 references consumed by Stage 6-7 (`sources.stage6_6Manifest`, `sources.stage6_6`, `keyArtifacts.expansionBasis`) to V2 semantic freshness. Other Stage 6-7 dependencies remain legacy exact-SHA consumers.

Completion requires the existing Stage 6-7 PR workflow to regenerate PASS artifacts, freeze the one-time migration output, pass its exact-diff rerun, and let the final Soldier validator accept provenance-only Stage 6-6 blob drift while preserving all admission, coverage, QA, reciprocal and fail-closed checks.
