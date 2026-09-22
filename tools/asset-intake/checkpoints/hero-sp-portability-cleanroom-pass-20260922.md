# Hero SP Asset Portability Clean-room PASS — 2026-09-22

## Scope

This checkpoint records the downstream Asset Intake portability experiment requested after the current-repo SP artwork pipeline had already been proven.

It does **not** reopen Hero canonical identity, ConfigData semantics, Status Source, Project Status, or production frontend ownership.

## Authority and baseline

- access mode: remote-only
- base main: `933b36014b661a612d0b898c41072bfc61f9a149`
- experiment branch: `test/asset-portability-cleanroom-20260922`
- successful execution head: `f9cc6c11f83228049ba9bfe9db305230e6fb70c8`
- GitHub Actions run: `35667068437`
- job: `106555080788`
- proof artifact: `10669143922`
- artifact digest: `sha256:6e397baceaa74dfd8d4589c7e92041e1fda126ef93e71a1423e0f24661ab83af`

Durable repository result:

`tools/asset-intake/experiments/hero-sp-portability/result.v1.json`

## Clean-room boundary

The experiment prepared `/tmp/langrisser-asset-portability-sp` from a seven-file explicit allowlist.

Verified setup result:

```text
status = PASS_CLEANROOM_PREPARED
gitCheckoutPresent = false
repositoryHistoryRuntimeDependency = false
existingGeneratedWebpCopied = false
existingManifestCopied = false
```

Runtime source rules:

- no repository-relative runtime reads after clean-room preparation
- no `git show` history dependency
- no existing `public/images/heroes/sp` WebP input
- no existing production manifest input
- `nameJoin = false`
- `idArithmetic = false`
- filename similarity relation creation disabled

Pinned runtime:

```text
Python 3.11
dotnet SDK 8.0.425
Spine runtime commit 1c1936532527900f74cfb58f7002998bf157b254
Spine version 3.3.05
pose = idle_Normal @ 0
```

## Representative cases

| HeroID | CharImageID | exact prefab | result |
| ---: | ---: | --- | --- |
| 6 | 1013 | `Spine/Char/Leon_ABS/Leon_SP_Prefab.prefab` | PASS |
| 13 | 1003 | `Spine/Char/Hein_ABS/Hein_DarkDragonWizardSP_Prefab.prefab` | PASS |
| 29 | 1017 | `Spine/Char/Tialice_ABS/Tialice_SP_Prefab.prefab` | PASS |
| 37 | 1024 | `Spine/Char/Zigodlla_ABS/Zigodlla_SP_Prefab.prefab` | PASS |
| 56 | 1022 | `Spine/Char/Rachel_ABS/Rachel_SP_Prefab.prefab` | PASS |

Each case independently completed:

```text
official installer 1.1.113
→ exact package/bundle
→ exact bundle SHA256
→ exact prefab runtime path
→ Spine 3.3.05 geometry
→ idle_Normal @ 0
→ transparent raster
→ WebP
→ deterministic parity against the previously proven output
```

All five regenerated WebP files matched the frozen expected width, height, renderable attachment count, triangle count, alpha condition, and final WebP SHA256.

Final manifest:

```text
status = PASS_CLEANROOM_SP_PORTABILITY
count = 5
heroIds = [6, 13, 29, 37, 56]
```

## Recovery performed during execution

Two setup defects were found and corrected inside the same owning scope before final PASS:

1. clean-room guard initially matched its own literal forbidden token; the guard representation was changed without weakening the actual prohibition.
2. dotnet host selected SDK 10 by default despite SDK 8.0.425 being installed; a clean-room `global.json` now pins SDK 8.0.425.
3. the Hero 13 fixture bundle hash had been manually truncated; it was corrected against the accepted source census before rerun.

No canonical semantic or relation rule was changed by these recoveries.

## Completion

```text
CLEANROOM_SETUP = PASS
OFFICIAL_SOURCE_REACQUISITION = PASS_5_OF_5
EXACT_PREFAB_RESOLUTION = PASS_5_OF_5
SPINE_RENDER = PASS_5_OF_5
WEBP_DETERMINISTIC_PARITY = PASS_5_OF_5
PORTABILITY_EXPERIMENT = PASS_CLEANROOM_SP_PORTABILITY
BLOCKER = none
```

## Interpretation

This proves that the tested SP asset contract can be transferred into an isolated non-Git workspace and reproduce representative production outputs without runtime dependence on the original repository history or existing generated SP assets.

It does not by itself prove every asset domain, every Hero, or a future repository's full frontend/deployment environment.

## Reopen conditions

Reopen this portability result only if one of the following changes materially:

- official installer/source provenance contract
- HeroID/CharImageID explicit relation used by this fixture
- extractor contract
- renderer source/runtime version
- manifest/output contract
- deterministic output parity for one of the five frozen representatives
