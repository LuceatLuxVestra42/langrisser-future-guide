# Hero Stage 6-4 Site Consumer Checkpoint

- status: **PASS_WITH_REVIEW**
- completion: **COMPLETE**
- Hero data pipeline: **FINAL_FROZEN**
- Hero shards: **267/267**
- site-usable Hero: **267/267**
- shard integrity mismatch: **0**
- Stage B: **PASS_ACCEPTED / closed=true**
- exclusive ownership: **167**
- Hero↔exclusive parity mismatch: **0**
- B cross-index mismatch: **0**
- exclusive metadata missing: **0**
- hard errors: **0**

## Frozen consumer path

`/hero/$heroId`
→ `hero-detail.v1.json#storage.byHeroId`
→ one `hero-detail/by-id/<heroId>.json` shard

Soldier display:
`shard.soldiers.ids`
→ `hero-detail-shared.v1.json#soldiersById`

Exclusive Equipment:
`heroId`
→ `hero-exclusive-equipment-by-hero.v1.json#byHeroId`
→ `equipmentId`
→ `equipment_stage3_5_exclusive_consumer.json#detailRecords`

The embedded Hero-shard `exclusiveEquipment` block is parity-only materialized evidence after Stage 6-4 and is not the ownership authority.

## Forbidden runtime fallbacks

- ConfigData reads
- Stage 4 / Stage 5 producer reads
- Stage 6-1 locator reads
- direct SkillHero ownership re-derivation
- Hero-Soldier relation re-derivation
- heuristic ownership from names/icons/restrictions/order

## Next start point

Hero frontend/UI and web-asset integration. Consume the Stage 6-4 contract; do not reopen Stage 4/5 or Stage B semantics unless a new source snapshot or explicit contradiction requires the owning stage to reopen.
