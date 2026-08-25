# Hero Page Stage 5-5-2 — header enrichment source trace

## Scope

Stage 5-5-2 validates candidate sources for `rarity`, `factions`, `cv`, `origin`, `artwork`, and `skins` while reusing the 267-Hero canonical identity fixed in Stage 5-5-1.

This stage does **not** infer missing display values from readable field names, numeric patterns, jobs, aura eligibility, story affiliation, or fragment costs.

## Confirmed source status

| Field | Status | Current source | Remaining work |
| --- | --- | --- | --- |
| rarity | `UNRESOLVED` | `HeroInfo.Star` / `HeroInfo.Rank` are observations only | Prove enum/semantic mapping before emitting rarity labels |
| factions | `UNRESOLVED` | none accepted | Find and validate canonical Hero-to-faction source |
| cv | `UNRESOLVED` | none accepted | Find actor/CV display-name mapping; resource IDs alone are insufficient |
| origin | `POINTER_CONFIRMED` | `HeroInfo.HeroBelongProduction[]` | Validate ID-to-work-title dictionary and coverage |
| artwork | `POINTER_CONFIRMED` | `HeroInfo.CharImage_ID` | Validate target asset/display semantics and coverage |
| skins | `SOURCE_JOIN_CONFIRMED` | `HeroInfo.Skins_ID[] -> HeroSkinInfo.ID` | Measure coverage; review owner mismatches; prove display-order and acquisition semantics |

## Skin evidence

`ConfigDataHeroSkinInfo` exposes `ID` and `SpecifiedHero`, plus `CharImageSkinResource_ID` and raw acquisition candidate `GetPathType`. This is sufficient to validate skin membership and referential integrity, but not sufficient to assign a user-facing acquisition label or to declare `Skins_ID` array order as final display order.

## Rarity guard

`ConfigDataHeroInfo.ExchangedFragmentCount` remains explicitly rejected as a rarity source. `Star` and `Rank` may be counted by the coverage validator, but their numeric distributions must not be converted to `N/R/SR/SSR` without independent semantic evidence.

## Coverage validator

Run:

```bash
node scripts/validate_hero_page_stage5_5_2.cjs
```

The validator consumes only:

- `data/hero-name-master.v1.json`
- `data/configdata/ConfigDataHeroInfo.json`
- `data/configdata/ConfigDataHeroSkinInfo.json`
- `data/validation/hero-page-stage5-5-2-source-trace.v1.json`

It writes:

- `data/validation/hero-page-stage5-5-2-coverage.v1.json`

The output measures canonical HeroInfo resolution, origin/artwork pointer presence, skin-reference resolution, `SpecifiedHero` mismatches, duplicate/shared skin references, and raw `Star`/`Rank` distributions. It intentionally leaves unresolved semantic fields unresolved.

## Completion rule

The source-trace checkpoint is complete. Stage 5-5-2 as a whole is **not complete** until the coverage artifact is generated and the remaining authoritative mappings are resolved or explicitly carried forward as unresolved with an agreed downstream policy.
