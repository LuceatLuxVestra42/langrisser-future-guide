# Hero List Stage 2 checkpoint

- status: `PASS_WITH_REVIEW`
- completion: `COMPLETE`
- source: `data/generated/hero-list-stage1.v1.json`
- source freeze: `HERO_LIST_STAGE1_FROZEN`
- Hero: `267 / 267`

## Completed

- `/heroes` basic responsive Grid
- Korean-name fallback, rarity and SP presentation
- explicit placeholder until web Hero artwork is resolved
- home `캐릭터` category → `/heroes`
- Stage 1 frozen-consumer-only production boundary
- generated TanStack route tree persisted
- preflight PASS
- production build PASS
- generated `/heroes` route PASS
- TypeScript PASS
- Static Pages Preview run `33057029227` PASS
- `gh-pages` deploy commit `1687e3fc8eda5b7472a49c31f51921c54c099e20`
- deployed `heroes/index.html` contains the 267 count and Hero witnesses including `매튜` and `레온`
- repository base path `/langrisser-future-guide/` is embedded in static assets/navigation
- existing home `용병 → /soldiers` route preserved during QA integration

## Review note

The execution environment could not resolve the public `github.io` hostname for a direct HTTP/browser probe. This is non-blocking for Stage 2 because the Static Pages Preview workflow successfully generated and published the exact `gh-pages` artifact, and the deployed branch content was inspected directly. Interactive browser/responsive visual QA remains a presentation follow-up.

## Deferred

- web-served Hero artwork resolution
- release chronology/display ordering
- filters/search
- Hero detail route/card navigation
- fusion-power badge metadata
- SSR solo-limited presentation metadata
- interactive browser/responsive visual QA

## Next start

Stage 3 may consume the Stage 2 grid and Stage 1 frozen list data. Do not reopen raw ConfigData or Hero Stage 4/5 semantic producers.
