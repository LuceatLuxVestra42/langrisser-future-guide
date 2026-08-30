# Frozen Provenance / Semantic Freshness V2 — Workspace Boundary

## Status

- Workspace status: `READY`
- Work branch: `maintenance/frozen-provenance-semantic-freshness-v2`
- Authoritative base: `main`
- Base commit: `7610fbff7c2d5de920ae0dd46c92164c94d783bc`
- Created from the authoritative base only. No open PR head was used as a predecessor.

## Objective

Separate Git provenance drift from semantic freshness for frozen Soldier closeout artifacts.

Target classification:

- actual record / relation / schema semantic change -> `SEMANTIC_STALE`
- semantic payload unchanged but Git/provenance metadata changed -> `PROVENANCE_ONLY_CHANGED` or equivalent non-semantic freshness state
- identical semantic payload -> `SEMANTIC_FRESH`

Raw `gitBlobSha` remains available for audit/provenance. It must not by itself imply semantic corruption.

## Stage ownership

This workspace owns only the Frozen Provenance / Semantic Freshness V2 stages:

- F0: Soldier closeout raw-SHA freshness inventory and checkpoint
- F1: new Semantic Freshness V2 contract
- F2: shared semantic digest/canonicalization utility and deterministic fixtures
- F3: Soldier Stage 6-6 provenance/freshness implementation pilot
- F4: Soldier Stage 6-7 final freshness classification
- F5: Project Doctor provenance-aware classification integration, only after a fresh-main overlap check
- F6: fail-closed semantic mutation fixtures
- F7: Soldier frozen-chain regression using existing authoritative/frozen outputs
- F8: V2 activation checkpoint and migration closeout

F3/F4 may change producer/validator implementation code only where it records or evaluates provenance. They do not own GitHub Actions producer transport.

## Hard out-of-scope boundary

Do not modify in this workspace:

- `.github/workflows/**`
- Soldier Stage 5 producer workflow transport
- Soldier Stage 6 producer workflow transport
- Hero Stage 6 producer workflow transport
- `pull_request.paths` cleanup
- standalone workflow retirement
- branch protection or required-check configuration
- MANUAL_REVIEW exit policy
- `pr-guard` passing exit-code policy
- Hosted QA / GitHub Pages / deployment routing
- Soldier names or localization source values
- Hero/Soldier canonical identity re-research
- Hero-Soldier relation regeneration
- broad canonical population or JOIN recomputation

The required `pr-guard` remains fail-closed and is not weakened by this workspace.

## Explicit overlap exclusions with currently open work

### PR #274 — Hero Stage 6 producer transport

Do not modify:

- `.github/workflows/hero-stage6-1-detail.yml`
- `.github/workflows/hero-stage6-2-fixture-qa.yml`
- `.github/workflows/hero-stage6-3-full-generation.yml`

### PR #275 — Hero downstream frozen freshness

Do not modify:

- `data/checkpoints/hero-stage6-3-full-generation.json`
- `data/generated/hero-detail-stage6-1.v1.json`
- `data/generated/hero-detail.v1.json`
- `data/generated/hero-list-stage1.v1.json`
- `data/generated/hero-stage6-2-representative-fixtures.v1.json`
- `data/generated/project-doctor-d5-freshness.v1.json`
- `data/validation/hero-stage6-1-final.v1.json`
- `data/validation/hero-stage6-2-final.v1.json`
- `data/validation/hero-stage6-3-final.v1.json`
- `data/validation/hero-stage6-4-final.v1.json`

## Project Doctor collision rule

F5 is intentionally deferred from any direct D2/D3 edit until immediately before F5:

1. refresh authoritative `main`;
2. confirm open/merged producer/PR-maintenance work and changed paths;
3. reuse the latest Project Doctor contracts/validators as predecessor;
4. modify only the minimum provenance-classification owning layer;
5. do not reopen D2/D3 path routing unless a real mapping defect is independently demonstrated.

Earlier stages F0-F4 and F6-F7 must not require changing Project Doctor merge-gate policy.

## Frozen artifact safety rule

- F0-F2 must not mutate production frozen artifacts.
- F3 begins with Soldier Stage 6-6 only.
- F4 follows only after F3 proves deterministic semantic digest behavior.
- Do not bulk-migrate Stage 5/6 artifacts before the 6-6 -> 6-7 pilot is proven.
- Existing V1 provenance/checkpoints are retained for audit unless an explicit later migration contract says otherwise.

## Completion invariant

The workspace is successful only if all of the following remain true:

1. Same semantic payload + different Git blob can pass semantic freshness while still reporting provenance drift.
2. Real semantic mutation remains blocking/fail-closed.
3. Existing Soldier closeout semantic invariants and Hero-Soldier relation parity remain unchanged.
4. Required `pr-guard` fail-closed behavior is not weakened.
5. No producer/PR workflow transport file is changed by this workspace.

## Next start point

Start at F0 only: inventory raw SHA freshness dependencies in the Soldier closeout chain using current `main` as authority. Reuse existing frozen/generated/checkpoint artifacts and validators; do not reopen semantic upstream work.

## Reopen conditions

Reopen this workspace boundary only if:

- the semantic digest/canonicalization contract changes;
- a false-negative or false-positive freshness regression is demonstrated;
- the authoritative Soldier 6-6/6-7 schema boundary changes;
- an upstream main change directly touches a file this workspace must own.
