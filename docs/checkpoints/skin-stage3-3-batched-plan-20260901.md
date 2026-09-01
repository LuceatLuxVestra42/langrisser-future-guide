# Skin Stage 3-3 batched restart

status: IN_PROGRESS
scope: Skin artwork source confirmation and bounded extraction/export only
non-scope: Soldier, Hero↔Skin semantics, sourceOrder recomputation, acquisition semantics, frontend carousel implementation

## Current authority

1. current `main` Skin Stage 3-2 readiness: `data/validation/skin-stage3-2-readiness.v1.json`
2. current `main` fresh official-installer evidence: `data/evidence/skin-stage3-2-asset-resolution-evidence.v1.json`
3. current work-branch bounded probe outputs and validators
4. actual official installer 1.1.113 assets resolved by the current evidence

The work branch is behind `main` only in unrelated banner presentation changes. No Skin authority/input path changed in that drift, so completed bounded evidence remains fresh for this scope.

## Evidence policy

Historical records are not confirmation evidence for the artwork source.

They may be consulted only to avoid blindly repeating a previously explored approach. Any historical claim about artwork suitability, source ownership, coverage, or completeness must be re-established from the current authority and current assets before it can affect a PASS/FAIL decision.

In particular:

- do not import historical 540-Skin completion artifacts
- do not promote historical STATIC/Spine full-art conclusions as current facts
- do not use old branch manifests as source authority
- do not reuse old rendered images as validation fixtures unless independently regenerated from current authoritative assets
- if current evidence conflicts with a historical note, current evidence wins

## Execution policy

Do not validate/materialize all 540 Skins as one unit.

1. Confirm the target visual/source rule on one current representative Skin first.
2. Cross-check the rule on two current representative Skins from different asset families/conditions.
3. Only after the representative rule is confirmed, generate deterministic bounded production batches.
4. Validate each batch independently and checkpoint PASS/FAIL.
5. Aggregate only already-PASS batch manifests for final coverage.
6. A failed batch blocks only that batch; previously PASS batches remain frozen.
7. No Hero↔Skin semantic recomputation, name JOIN, ID arithmetic, or filename-similarity fallback.

## Representative scope

- FULLART-0: Skin 102 — establish the current full-art source/render rule
- FULLART-1: Skin 1901 — cross-check a different current asset family
- FULLART-2: Skin 3701 — second cross-check
- production batches: only after FULLART-0..2 establish one deterministic rule

The previous STATIC Batch 0 extraction for 102/1901/3701 remains a technical extraction proof only. It does not by itself prove that the extracted 204×340 Sprite is the desired full-body artwork.

## FULLART-0 current-only probe

Evidence: `data/evidence/skin-fullart0-current-probe.v1.json`

Current official-installer inspection for Skin 102 confirms:

- exact current prefab: `Spine/Char/Mathew_ABS/Mathew_Skin01_Prefab.prefab`
- exact installer package/bundle: `InstallPage_1.1.113_25.zip` / `begin_spine_char_mathew_abs.b`
- current prefab serialized hash matches Stage 3-2 exactly
- prefab local `SkeletonAnimation.skeletonDataAsset` resolves to `Mathew_Skin01_SkeletonData`
- same current bundle contains `Mathew_Skin01.atlas`, `Mathew_Skin01.skel`, `Mathew_Skin01_Atlas`, `Mathew_Skin01_Material`, and `Mathew_Skin01` Texture2D
- no external PPtr is required for the inspected prefab/component reference chain
- current `Mathew_Skin01` Texture2D exports as 2048×1024 and is an atlas of separated character parts, not a display-ready composed full-body image

This confirms the current Spine source chain but does NOT yet confirm the final composed full-body render or its canonical pose.

## Completion condition for representative confirmation

- current official asset provenance is explicit
- extracted/rendered output is reproducible from current authority
- visual output satisfies the intended full-art/full-body presentation criterion
- no historical artifact is required to make the PASS decision
- the same deterministic rule survives the 1901 and 3701 cross-checks
- unresolved records stay REVIEW/BLOCKER rather than triggering 540-wide fallback

## Current state

- Stage 3-2 current readiness: PASS
- Stage 3-2 fresh evidence source: official installer 1.1.113
- STATIC Batch 0 technical extraction: PASS for 102, 1901, 3701
- FULLART-0 current source-chain probe: PASS
- raw Skin 102 Spine texture as direct full-art: REJECTED_CURRENT_EVIDENCE (atlas pieces)
- composed Skin 102 full-body render/canonical pose: NOT YET CONFIRMED

## Current blocker

Render Skin 102 from the current `Mathew_Skin01.atlas` + `Mathew_Skin01.skel` chain and establish a deterministic display pose that satisfies the requested full-body criterion, without importing historical render output or conclusions.

## Next start

Extract the current Skin 102 atlas/skeleton payload from the same verified installer bundle and perform one bounded render experiment. Do not inspect 1901, 3701, or the 540 population until Skin 102 has a current-evidence PASS or a precise BLOCKER.
