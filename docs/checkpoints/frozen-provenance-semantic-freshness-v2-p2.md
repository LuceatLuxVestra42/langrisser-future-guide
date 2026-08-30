# Frozen Provenance / Semantic Freshness V2 — P2 Checkpoint

## Status

- Stage: `P2`
- Status: `COMPLETE`
- Result: `PASS`
- Work branch: `maintenance/frozen-provenance-semantic-freshness-v2-p2`
- Predecessor: `P1` contract head `d9da311ff96e9ac5a87856e977d440e3691b7c3e`
- Latest authoritative `main` observed during P2: `3f5ac26ec6fcc3292c1ac078f8a2a651e3531017`
- P1 semantic contract reopened: `NO`
- Production frozen artifacts modified: `NO`
- Workflow transport modified: `NO`

The `main` advances observed after P1 were presentation/deployment-adjacent only. From P1's base through `3053daf0...`, the changed paths were `scripts/validate_hero_list_stage4.cjs` and `src/lib/equipment-page.localized.server.ts`; the later advance to `3f5ac26e...` changed only `scripts/validate_hero_list_stage4.cjs`. None intersect P2-owned digest/fixture files, so P1 remained the direct predecessor instead of reopening unrelated upstream work.

## Purpose

Provide the deterministic common digest/canonicalization primitive required by `frozen-semantic-freshness/v2`, aligned with the P1 explicit-projection contract, before touching Soldier Stage 6-6 production output.

## P2 files

- `scripts/lib/frozen-semantic-digest.mjs`
- `data/fixtures/frozen-semantic-freshness-v2-fixtures.v1.json`
- `scripts/validate-frozen-semantic-freshness-v2-fixtures.mjs`
- this checkpoint

## Reused verified implementation

The shared digest helper was reused byte-for-byte from the earlier verified F2 work rather than reimplemented.

Current helper Git blob:

- `scripts/lib/frozen-semantic-digest.mjs`
- `b34d7057e997cd5d70a6a8d4a11c3a85730ba3c9`

Its frozen behavior remains:

- contract: `frozen-semantic-freshness/v2`
- algorithm: SHA-256
- digest form: `sha256:<64-lowercase-hex>`
- recursively lexicographic object-key ordering
- array order preserved
- strings preserved exactly
- `-0` canonicalized to JSON `0`
- non-finite numbers fail closed
- `undefined` fails closed
- cycles/non-plain objects fail closed
- projection ID participates in digest identity
- no generic recursive metadata stripping

## P1 alignment correction

The earlier fixture validator used a relation helper that removed only `gitBlobSha` and then retained the rest of each provenance object. That was sufficient for the older fixture set but did not satisfy P1's stricter `explicitPayloadOnly` rule.

P2 corrected only that test/projection boundary:

- relation semantic provenance now explicitly maps:
  - `sourceKind`
  - `sourceClass`
  - `origin.table`
  - `origin.recordId`
  - `origin.recordKeyField`
  - `origin.field`
  - optional `parentEdge`
  - optional `supportRelation`
- raw `gitBlobSha` is excluded by construction
- unregistered audit fields are excluded by construction
- required semantic provenance fields are validated fail-closed
- duplicate relation membership pairs fail closed

No production Hero-Soldier relation artifact or producer was changed.

## Exact-byte validation evidence

Before executing the validator, the locally executed files were checked with `git hash-object` and matched the GitHub branch blobs exactly:

- helper: `b34d7057e997cd5d70a6a8d4a11c3a85730ba3c9`
- fixture: `d4c1e21ddcd4ae53534f03a6490c5811444d5a36`
- validator: `446d3a9d3d0bb7795c7d98699c876cd68e5eef69`

Validation command:

`node scripts/validate-frozen-semantic-freshness-v2-fixtures.mjs`

Result:

- status: `PASS`
- cases: `17`
- passed: `17`
- failed: `0`

## Proven behavior

### Semantic-equal / audit-only changes

PASS as same semantic digest:

- `generatedAt` only changed
- nested `gitBlobSha` only changed
- JSON object key/insertion order only changed
- Hero-Soldier relation raw `gitBlobSha` only changed
- unregistered relation audit field (`workflowRunId`) only changed

### Semantic changes

Detected as different digest:

- array order changed where the supplied projection treats order as semantic
- Soldier `nameKr` changed
- Soldier ID changed
- Soldier combat value changed
- Hero-Soldier pair membership changed
- relation semantic `sourceKind`/origin changed

### Fail-closed cases

- non-finite number
- `undefined` object value
- projection ID mismatch never compares equal
- duplicate Hero-Soldier membership pair
- malformed relation semantic provenance

## Contract compatibility

P2 implementation is compatible with `data/contracts/frozen-semantic-freshness.v2.json`:

- same contract identifier
- same SHA-256 digest representation
- same canonicalization rules
- same projection-identity comparison rule
- explicit semantic payload ownership remains outside the generic helper
- relation fixture projections use the registered P1 IDs:
  - `hero-soldier-membership/v1`
  - `hero-soldier-relation/semantic-v1`

The P1 Stage 6-6 projection definitions remain the authority for P3. P2 does not yet emit those digests into production artifacts.

## Production impact

- production frozen artifacts changed: `0`
- Soldier Stage 5/6 producer implementation changed: `0`
- Soldier Stage 6-6 producer changed: `0`
- Soldier Stage 6-7 validator changed: `0`
- Hero-Soldier relation artifact changed: `0`
- Project Doctor changed: `0`
- `.github/workflows/**` changed: `0`
- branch protection / `pr-guard` policy changed: `0`

## REVIEW

- P3 must implement the two Stage 6-6 projections exactly as frozen in P1 rather than hashing the whole Stage 6-6 JSON artifact.
- P3 must retain existing `gitBlobSha` provenance alongside the new semantic digest.
- Relation projection fixture code is regression support; production relation migration remains later and must not be inferred from P2 alone.

## BLOCKER

`NONE`

## Next start point

`P3 — Soldier Stage 6-6 semantic-digest pilot`

Use the current P1 projection definitions and P2 helper. Modify only the Stage 6-6 provenance/digest owning implementation and its frozen outputs/validation as required by the pilot. Do not modify GitHub Actions transport, Stage 6-7 yet, Stage 6-5 yet, or Project Doctor.

## Reopen P2 only if

- canonicalization proves nondeterministic for a supported JSON value;
- P3 exposes a required semantic payload that the generic helper cannot digest without heuristic stripping;
- a false equality/false difference is demonstrated by regression evidence;
- digest algorithm or projection identity rules change.
