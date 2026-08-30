# Frozen Provenance / Semantic Freshness V2 — P1 Contract Checkpoint

## Status

- Stage: `P1`
- Status: `COMPLETE`
- Result: `FROZEN`
- Branch: `maintenance/frozen-provenance-semantic-freshness-v2-p1-contract`
- Predecessor: `maintenance/frozen-provenance-semantic-freshness-v2-p0-inventory`
- Predecessor commit: `d9d983e132d9d1d99a9971bb76ed48ecb325e4fe`
- Authoritative `main` observed for P1: `1a80d5c63baf8fe6ffa42823977572a8ceba5dd1`
- Semantic upstream reopened: `NO`
- Production frozen artifacts modified: `NO`
- Workflow transport modified: `NO`

Machine-readable contract:

- `data/contracts/frozen-semantic-freshness.v2.json`

## Core decision

P1 freezes semantic freshness and Git provenance as separate axes.

Raw `gitBlobSha` remains audit evidence. It is not removed and is still authoritative for exact-byte provenance. A registered V2 `semanticDigest` becomes the authority for semantic equality when available.

The allowed final classifications are:

- `SEMANTIC_FRESH` — non-blocking.
- `PROVENANCE_ONLY_CHANGED` — non-blocking semantic freshness; provenance drift must still be reported.
- `SEMANTIC_STALE` — blocking.
- `SEMANTIC_UNKNOWN` — blocking/fail-closed.

## Incremental migration rule

P1 explicitly avoids a bulk Stage 5/6 reseal.

For a legacy `{path, gitBlobSha}` descriptor without V2 digest:

1. current raw SHA equals recorded SHA → `SEMANTIC_FRESH`;
2. raw SHA changed → `SEMANTIC_UNKNOWN`, blocking;
3. raw SHA unavailable → `SEMANTIC_UNKNOWN`, blocking.

Exact byte identity is sufficient evidence of semantic equality. Changed legacy bytes without a semantic digest are not assumed to be metadata-only.

This allows Stage 6-6 to migrate first while all other unmigrated dependencies remain protected by their existing exact-SHA boundary.

## V2 descriptor

A migrated source descriptor retains:

- `path`
- `gitBlobSha`

and adds:

- `semanticDigest.contract = frozen-semantic-freshness/v2`
- `semanticDigest.algorithm = sha256`
- `semanticDigest.projection`
- `semanticDigest.digest = sha256:<64-hex>`

Consumers must recompute the current artifact projection. They must not trust an embedded digest by itself.

A projection/contract/algorithm mismatch is `SEMANTIC_UNKNOWN`, not equality.

## Projection ownership

P1 does not define a generic metadata-stripping function.

Every production projection builds an explicit semantic payload and then passes that payload to the shared digest helper. Unknown/new artifact fields do not silently become semantic; a semantic-shape change requires an explicit projection revision.

The existing P2/F2 helper behavior is compatible with this contract:

- canonical object-key sorting;
- array order preserved unless a projection normalizes it first;
- exact strings;
- `-0` → `0`;
- non-finite, undefined, cyclic and non-plain values fail closed;
- projection ID participates in digest identity.

P1 reused that verified interface and did not modify the concurrent utility branch.

## Stage 6-6 pilot projections

### `soldier-stage6-6-expansion-basis/semantic-v1`

Included:

- version/schema/stage/status;
- `simulatorReadiness.status`;
- `simulatorReadiness.scope`;
- structured authority source/field/scope ownership;
- exact `summary`.

Excluded by construction:

- `generatedAt`;
- raw `sources` provenance descriptors;
- `purpose`;
- `implementedNow` / `deferred` documentation lists;
- authority prose `rule` strings.

This projection represents the Stage 6-6 semantic manifest, not repository transport metadata.

### `soldier-stage6-6-expansion-validation/semantic-v1`

Included:

- version/schema/stage/status;
- exact checks;
- exact coverage;
- review code/classification/count identity.

Excluded:

- `generatedAt`;
- raw sources;
- error-message prose;
- review-rule prose.

## Relation projections

P1 freezes two distinct shared-relation projections already proven by the P2/F2 fixtures.

### `hero-soldier-membership/v1`

Semantic content:

- canonical `(heroId, soldierId)` pairs only;
- sort by heroId then soldierId;
- invalid IDs or duplicate pairs fail closed.

Use this where the consumer owns only usable-pair membership/parity.

### `hero-soldier-relation/semantic-v1`

Semantic content:

- pair identity;
- `sourceKind`;
- `sourceClass`;
- semantic origin fields;
- optional inherited parent-edge identity;
- optional SP support-relation identity.

Excluded:

- relation `generatedAt`;
- relation input/contract raw descriptors;
- raw `gitBlobSha`.

This projection is for consumers that care about relation provenance meaning, not only membership.

## Raw-SHA consumer mapping

P0's decision owners now have an explicit V2 target.

### Soldier Stage 4-6 relation consumer

Future migration target:

- relation semantic projection for canonical relation meaning;
- membership projection for byHero/bySoldier pair parity.

Existing relation/index parity checks remain mandatory.

### Soldier Stage 6-5 reciprocal links

Future migration target:

- `hero-soldier-membership/v1`.

Reason: Stage 6-5 owns reciprocal page membership, not interpretation of relation provenance source meaning.

### Soldier Stage 6-7 final admission

Migration rule:

1. use registered V2 digest when present;
2. otherwise apply legacy exact-SHA compatibility;
3. block `SEMANTIC_STALE`;
4. block `SEMANTIC_UNKNOWN`;
5. report but do not block `PROVENANCE_ONLY_CHANGED`.

## Literal relation pin boundary

The two Hero-Soldier relation authority literal SHA checks remain unchanged:

- `fixturePlanBlobMismatch`;
- `spSoldierFixtureSnapshotBlobMismatch`.

P1 classifies them as `BYTE_PIN_FAIL_CLOSED`.

They are not silently converted into provenance-only checks. Migrating either pin requires separate evidence that establishes a new authority contract.

## P2/F2 reuse decision

The existing shared digest utility and deterministic fixtures on the concurrent V2 branch are compatible with P1.

They already prove:

- `generatedAt`-only drift → same semantic digest;
- nested `gitBlobSha`-only drift → same semantic digest;
- Soldier name/combat mutation → different digest;
- relation pair mutation → different membership/semantic digests;
- relation provenance meaning mutation → membership same, semantic relation different;
- projection mismatch and unsupported JSON values → fail closed.

Therefore P2/F2 does not need to be reimplemented. It should be reused/integrated from its verified checkpoint before P3.

## REVIEW

Non-blocking:

- P3 must implement exactly the two Stage 6-6 projections rather than inventing a broader recursive cleaner.
- When P3 integrates the existing F2 helper branch, refresh `main` and confirm no direct path collision.
- Stage 4-6 and Stage 6-5 are mapped but are later migration targets; P1 does not modify them.
- Project Doctor integration remains deferred to its separately owned later stage.

## BLOCKER

- None for P1.

## Next start point

Reuse/integrate the already verified P2/F2 digest utility, then start `P3 — Soldier Stage 6-6 semantic-digest pilot`.

Do not reopen P0/P1 unless the raw-SHA owner map, digest identity, projection contract, or literal-pin authority changes.

## Reopen conditions

Reopen P1 only if:

- a P3/F6 fixture demonstrates false semantic equality or false semantic staleness;
- the digest algorithm/canonicalization identity changes;
- Stage 6-6 output/validation semantic schema changes;
- relation semantic provenance fields change;
- a legacy compatibility rule creates a demonstrated fail-open path.
