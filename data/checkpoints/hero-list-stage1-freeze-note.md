# Hero List Stage 1 freeze note

Stage 1 consumes only the FINAL_FROZEN Hero Stage 6 manifest and per-Hero shards.

Final validation baseline:
- status: PASS
- completion: COMPLETE
- freezeState: HERO_LIST_STAGE1_FROZEN
- Hero records: 267 / 267
- unique Hero IDs: 267
- released SP Hero: 25
- not released SP Hero: 242
- source artwork locator: 267 / 267
- shard missing/integrity mismatch: 0 / 0
- projection mismatch: 0
- forbidden presentation inference: 0
- hard errors: 0

Official Stage 1 consumer:
`data/generated/hero-list-stage1.v1.json`

Deferred to later presentation stages:
- release chronology/display order
- web artwork resolution
- fusion power badge metadata
- SSR solo-limited presentation metadata

Next start:
Stage 2 builds the `/heroes` basic grid from the frozen Stage 1 consumer only.
