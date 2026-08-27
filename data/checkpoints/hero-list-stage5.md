# Hero List Stage 5 Checkpoint

- Status: `PASS_WITH_REVIEW / COMPLETE`
- Scope: `/heroes/{heroId}` Stage 4 shell -> FINAL_FROZEN Stage 6 single-shard detail consumer.
- Runtime boundary: current Hero shard only; no full Stage 6 runtime read, raw ConfigData read, relationship rederivation, name JOIN, or ID heuristic.

## Completed

- 267/267 Hero shards validated and route-consumable.
- Identity/base/CV, job branches, verified final stats, canonical Soldier IDs, and frozen system statuses are projected into Hero detail pages.
- Job branches 610 / job connections 1,388 / verified capstone stats 610.
- Hero-Soldier edges 5,977 / released SP Heroes 25 / released exclusive equipment Heroes 167 / released central discipline Heroes 166.
- Bond rows 1,335 / skins 540.
- Missing shard 0 / parity mismatch 0 / structural failure 0.
- Production Stage 5 run `33066500844`: PASS.
- Hosted QA run `33066658465`: PASS.
- QA source `49e34a6867b04240cc598f550250420ba86fd273` -> gh-pages `1b2de2440bf72c1ccb5fd8b41590b7ce36e9de55`.
- Published Hero 6 (Leon) verifies Stage 5 job branches and Lv70/6-star VERIFIED final stats.

## Review / deferred

- Hero artwork bytes are still a separate asset-input task.
- Korean job names are not inferred; frozen Chinese labels are used where localization is not confirmed.
- Dedicated talent/skill, bond, SP unlock, exclusive-equipment, central-discipline presentation is deferred to later frontend work.
- Soldier name/icon/direct-link enrichment is separate from the frozen 5,977 relation display.
- Interactive/responsive browser review remains non-blocking presentation QA.

## Next start

Stage 6 frontend: refine Hero detail presentation and add dedicated frozen-data blocks while preserving the Stage 5 single-shard runtime boundary.
