# Hero List Stage 3 checkpoint

- status: `PASS_WITH_REVIEW`
- completion: `COMPLETE`
- predecessor: Hero List Stage 2 `PASS_WITH_REVIEW / COMPLETE`
- source: `data/generated/hero-list-stage1.v1.json`
- source freeze: `HERO_LIST_STAGE1_FROZEN`
- Hero: `267 / 267`

## Completed

- Korean / Chinese / English Hero-name search
- rarity filters derived from frozen records
  - LLR 6
  - SSR 213
  - SR 33
  - R 12
  - N 3
- SP-only filter: 25
- live result count
- filter reset
- zero-result state
- responsive filter controls above the Stage 2 grid
- Stage 2 predecessor preflight PASS
- frozen Stage 1 consumer boundary PASS
- production build PASS
- generated `/heroes` route PASS
- TypeScript PASS
- Static Pages Preview run `33058046923` PASS
- QA source commit `5dbaafc14f3f1d9cf170762375a88c4c9e59b074`
- gh-pages deploy commit `c05e4be4fe8aca24beeb3304a34633eed6ba7c2a`
- deployed `heroes/index.html` verified with:
  - `한국명 · 중국명 · 영문명`
  - rarity controls
  - `SP만 25`
  - `검색 결과 267 / 267명`
  - `초기화`
  - repository base `/langrisser-future-guide/`

## Production boundary

Stage 3 does not reopen or recompute Hero semantics.

- raw ConfigData read: no
- Hero Stage 4/5 fallback: no
- relationship reconstruction: no
- name/ID heuristic relation: no
- release order inference from Hero ID/current artifact order: no
- invented Korean faction labels: no
- invented Korean origin labels: no

## Review note

Interactive browser filtering and responsive visual review remain non-blocking review items. Static Pages build, deployment, route/base-path, and deployed control markup are verified.

## Deferred

- actual web Hero artwork
- Hero detail route/card navigation
- release chronology/display ordering
- faction filter after confirmed Korean presentation labels
- origin filter after confirmed Korean presentation labels
- fusion-power badge metadata
- SSR solo-limited presentation metadata
- interactive browser filtering / responsive visual QA

## Next start

Stage 4 may begin from this checkpoint. Do not reopen Stage 1 or the already-final Hero semantic producers.
