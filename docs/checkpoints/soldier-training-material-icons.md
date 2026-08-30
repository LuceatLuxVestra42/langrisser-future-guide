# Soldier Training Material Icons — Pre-Merge Checkpoint

## Current status

- overall: PASS_PREMERGE / READY_FOR_PR
- semantic reopen: forbidden
- owning layer: asset acquisition → web delivery → Soldier frontend presentation
- working branch: `soldier-training-material-assets`
- branch base at start: `50fe16b9f79a268adddde33b19a6185642974ad3`
- current semantic predecessor: `soldier-material-item-census@269f02a673d5f86b5264e0bb335589b21585354d`

## Authoritative predecessors

- training consumer: `public/data/soldier-detail-stage5-6.v1.json`
- training source freshness owner: `data/generated/soldier-detail-stage5-4.v1.json`
- Item master: `data/configdata/ConfigDataItemInfo.json`
- asset source evidence: `data/source/soldier-training-material-drive-evidence.v1.json`
- source Asset Intake validation: `data/validation/soldier-training-material-asset-intake.v1.json`
- web delivery manifest: `data/generated/soldier-training-material-web-manifest.v1.json`
- web delivery validation: `data/validation/soldier-training-material-webp.v1.json`
- frontend preflight: `data/validation/soldier-training-material-frontend-preflight.v1.json`

## Frozen semantic/material population

- normal Tier 3 Soldier training profiles: 129
- training level records: 1,290
- material entries: 3,505
- GoodsType distribution: 6 → 3,505
- unique training Item IDs: 24
- malformed/missing frontend material mapping: 0
- exact Item ID set: `6003, 6006, 6009, 6012, 6015, 6018, 6031-6048`

## Source asset admission

- source: legacy Korean sheet asset Drive / exact `아이템 1` child filenames
- mapping rule: `ConfigDataItemInfo.ID → Icon → exact basename → exact Drive child filename`
- name JOIN: forbidden
- filename similarity: forbidden
- ID arithmetic: forbidden
- exact resolved source PNG: 24 / 24
- unique source SHA-256: 24
- PNG signature failure: 0
- basename collision: 0
- unexpected staging file: 0
- source publication: `public/images/soldier-training-materials-source/*.png`

## Web delivery

- delivery format: lossless WebP derivative
- source PNG remains evidence and is not replaced
- WebP coverage: 24 / 24
- source SHA parity: PASS
- dimensions parity: PASS
- decoded RGBA pixel parity: 24 / 24 exact
- source PNG total: 704,068 bytes
- WebP total: 500,596 bytes
- reduction: 203,472 bytes / 28.8994813%
- delivery root: `public/images/soldier-training-materials-webp/{itemId}.webp`

## Frontend

- resolver: `src/lib/soldier-training-material-assets.ts`
- consumer: `src/components/soldier-detail-modal.tsx`
- production consumer preflight: PASS
- build: PASS
- material UI: validated icon + ItemInfo source name + formatted count
- runtime raw ConfigData read: false
- runtime name JOIN: false
- runtime ID arithmetic: false
- frozen web manifest is the sole asset resolver input

## REVIEW

- Item names currently use the validated ItemInfo source name. Korean display-name localization is a separate presentation task and is not inferred here.
- Hosted/Deployment and Browser/UI are not claimed by this checkpoint; they must be verified after merge/deploy in the normal gate order.

## BLOCKER

- none before PR

## Next start point

1. compare against latest `main` and open PR
2. pass repository PR Guard / required checks
3. merge without reopening Soldier semantic data
4. verify deployed `/soldiers/` and all 24 material WebP assets on GitHub Pages
5. perform representative Browser/UI interaction QA for the training simulator
6. freeze final hosted/browser checkpoint

## Reopen conditions

Reopen this asset/material chain only if one of the following changes:

- canonical normal Tier 3 training population or training cost records
- unique GoodsType 6 Item ID population
- `ConfigDataItemInfo.ID/Name/Icon` for the 24 target IDs
- admitted source asset byte parity
- generated web manifest contract
- Soldier training material frontend consumer contract

CSS/layout/localization-only changes do not reopen semantic relations or the training-cost JOIN.
