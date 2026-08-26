# Hero Stage 6-3 Full Generation Checkpoint

- Status: **PASS_WITH_REVIEW / COMPLETE**
- Generated Heroes: **267/267**
- Structural PASS: **267**
- Structural FAIL: **0**
- Publication REVIEW: **267**
- Site-usable records: **267**
- Hero-Soldier relations reused: **5977**
- Hero-exclusive Equipment canonical relations adopted: **167**
- Stage B state: **B4_CANONICAL_RELATION_ADOPTED_B5_B6_DEFERRED_TO_6_4**
- Hard errors: **0**

## Frozen boundaries

Stage 6-3 does not re-derive Stage 4/5 semantics, Hero-Soldier membership, or Hero-exclusive Equipment ownership. Stage B B-4 canonical ownership is consumed directly and parity-checked against frozen Hero Stage 5-2 data.

## Storage freeze

- Mode: **SHARDED_BY_HERO**
- Hero shards: **267**
- Manifest: `data/generated/hero-detail.v1.json`
- Shared Soldier metadata: `data/generated/hero-detail-shared.v1.json`
- Per-Hero path: `data/generated/hero-detail/by-id/<heroId>.json`
- Integrity: **SHA256 per shard**

This replaces the temporary monolithic build payload so ordinary site and GitHub consumers do not need to read one very large Hero-detail Blob.

## Next start

Proceed to **Hero Stage 6-4 site consumer contract + final Hero data pipeline freeze**. Preserve this Stage 6-3 materialized output and validation as the input checkpoint.
