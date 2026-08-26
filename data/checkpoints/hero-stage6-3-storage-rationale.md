# Hero Stage 6-3 Storage Rationale

Stage 6-3 materializes 267 complete Hero records from the frozen Stage 4/5 blocks. A temporary pretty-printed monolith expanded to roughly 884k diff lines, which is unsuitable as the normal GitHub/site consumption unit.

The frozen publication layout is therefore:

- `data/generated/hero-detail.v1.json`: lightweight manifest and per-Hero SHA-256 index
- `data/generated/hero-detail/by-id/<heroId>.json`: one minified canonical Hero-detail record per Hero
- `data/generated/hero-detail-shared.v1.json`: shared Soldier metadata stored once

The 267 Hero shards contain the same materialized records that passed the Stage 6-3 structural gate. Sharding changes storage only; it does not re-derive Stage 4/5 semantics or Hero relations.

Stage 6-4 should consume this manifest/shard contract rather than reconstructing Hero detail records from ConfigData or the frozen Stage 4/5 producer files.
