import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const contract = load('data/contracts/banner-stage3-2-display-metadata.v1.json');
const stage31 = load(contract.inputs.stage31Relations);
const occurrences = load(contract.inputs.occurrences).records;
const definitions = load(contract.inputs.definitions).records;
const output = load(contract.outputs.displayMetadata);
const summary = load(contract.outputs.summary);

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

check(output.status === 'BANNER_STAGE3_2_DISPLAY_METADATA_MATERIALIZED', `output status ${output.status}`);
check(summary.status === 'PASS_BANNER_STAGE3_2_DISPLAY_METADATA', `summary status ${summary.status}`);
check(output.occurrenceDisplayRecords.length === occurrences.length, `occurrence display count ${output.occurrenceDisplayRecords.length}`);
check(output.definitionDisplayRecords.length === definitions.length, `definition display count ${output.definitionDisplayRecords.length}`);

const occurrenceIdSet = new Set(occurrences.map(row => row.bannerOccurrenceId));
const definitionIdSet = new Set(definitions.map(row => row.bannerDefinitionId));
const stage31ByOccurrence = new Map(stage31.occurrenceRelations.map(row => [row.bannerOccurrenceId, row]));
const displayByOccurrence = new Map(output.occurrenceDisplayRecords.map(row => [row.bannerOccurrenceId, row]));
const displayByDefinition = new Map(output.definitionDisplayRecords.map(row => [row.bannerDefinitionId, row]));

check(displayByOccurrence.size === occurrenceIdSet.size, 'duplicate or missing occurrence display IDs');
check(displayByDefinition.size === definitionIdSet.size, 'duplicate or missing definition display IDs');

for (const occurrence of occurrences) {
  const display = displayByOccurrence.get(occurrence.bannerOccurrenceId);
  const relation = stage31ByOccurrence.get(occurrence.bannerOccurrenceId);
  check(Boolean(display), `${occurrence.bannerOccurrenceId}: missing display metadata`);
  check(Boolean(relation), `${occurrence.bannerOccurrenceId}: missing Stage 3-1 relation`);
  if (!display || !relation) continue;

  check(display.bannerDefinitionId === occurrence.bannerDefinitionId, `${occurrence.bannerOccurrenceId}: definition ID drift`);
  check(display.assetId === relation.assetId, `${occurrence.bannerOccurrenceId}: asset ID drift`);
  check(display.repositoryPath === relation.resolvedPath, `${occurrence.bannerOccurrenceId}: repository path drift`);
  check(display.assetRelationStatus === relation.relationStatus, `${occurrence.bannerOccurrenceId}: relation status drift`);
  check(display.fallbackApplied === false, `${occurrence.bannerOccurrenceId}: fallback must stay false`);

  const policy = contract.occurrenceDisplayPolicy[relation.relationStatus];
  check(Boolean(policy), `${occurrence.bannerOccurrenceId}: missing contract policy for ${relation.relationStatus}`);
  if (!policy) continue;
  check(display.displayState === policy.displayState, `${occurrence.bannerOccurrenceId}: display state mismatch`);
  check(display.canRenderImage === policy.canRenderImage, `${occurrence.bannerOccurrenceId}: renderability mismatch`);
  check(display.provenance === policy.provenance, `${occurrence.bannerOccurrenceId}: provenance mismatch`);
  check(display.replacementState === policy.replacementState, `${occurrence.bannerOccurrenceId}: replacement state mismatch`);

  if (display.canRenderImage) {
    check(Boolean(display.assetId), `${occurrence.bannerOccurrenceId}: renderable display missing asset ID`);
    check(Boolean(display.repositoryPath), `${occurrence.bannerOccurrenceId}: renderable display missing repository path`);
    check(typeof display.publicPath === 'string' && display.publicPath.startsWith('/images/banners/'),
      `${occurrence.bannerOccurrenceId}: invalid public path ${display.publicPath}`);
    check(display.placeholderKey == null, `${occurrence.bannerOccurrenceId}: renderable display has placeholder key`);
  } else {
    check(display.assetId == null, `${occurrence.bannerOccurrenceId}: placeholder has asset ID`);
    check(display.repositoryPath == null, `${occurrence.bannerOccurrenceId}: placeholder has repository path`);
    check(display.publicPath == null, `${occurrence.bannerOccurrenceId}: placeholder has public path`);
    check(display.placeholderKey === 'BANNER_IMAGE_PENDING_MANUAL_ASSET', `${occurrence.bannerOccurrenceId}: placeholder key mismatch`);
  }
}

for (const definition of definitions) {
  const display = displayByDefinition.get(definition.bannerDefinitionId);
  check(Boolean(display), `${definition.bannerDefinitionId}: missing definition display metadata`);
  if (!display) continue;
  check(display.canonicalAssetOwner === false, `${definition.bannerDefinitionId}: canonical asset owner invented`);
  check(display.occurrenceFallbackAllowed === false, `${definition.bannerDefinitionId}: occurrence fallback unexpectedly enabled`);
  if (display.resolvedAssetCount === 0) {
    check(display.displayResolution === contract.definitionDisplayPolicy.zeroResolvedAssets,
      `${definition.bannerDefinitionId}: zero-asset resolution mismatch`);
    check(display.displayAssetId == null && display.displayPublicPath == null,
      `${definition.bannerDefinitionId}: zero-asset definition has display asset`);
  } else if (display.resolvedAssetCount === 1) {
    check(display.displayResolution === contract.definitionDisplayPolicy.singleUniqueResolvedAsset,
      `${definition.bannerDefinitionId}: single-asset resolution mismatch`);
    check(Boolean(display.displayAssetId), `${definition.bannerDefinitionId}: single-asset definition missing display asset ID`);
  } else {
    check(display.displayResolution === contract.definitionDisplayPolicy.multipleResolvedAssets,
      `${definition.bannerDefinitionId}: multiple-asset resolution mismatch`);
    check(display.displayAssetId == null && display.displayPublicPath == null,
      `${definition.bannerDefinitionId}: multiple assets got automatic default`);
  }
}

check(summary.canonicalPopulation.definitions === contract.expectedCanonicalPopulation.definitions,
  `summary definition count ${summary.canonicalPopulation.definitions}`);
check(summary.canonicalPopulation.occurrences === contract.expectedCanonicalPopulation.occurrences,
  `summary occurrence count ${summary.canonicalPopulation.occurrences}`);
check(summary.occurrenceDisplay.renderableOccurrences === contract.expectedCanonicalPopulation.resolvedOccurrences,
  `renderable occurrences ${summary.occurrenceDisplay.renderableOccurrences}`);
check(summary.occurrenceDisplay.manualAssetRequiredOccurrences === contract.expectedCanonicalPopulation.manualAssetRequiredOccurrences,
  `manual asset required ${summary.occurrenceDisplay.manualAssetRequiredOccurrences}`);
check(summary.definitionDisplay.noAssetDefinitions === contract.expectedCanonicalPopulation.definitionsWithNoResolvedAsset,
  `no-asset definitions ${summary.definitionDisplay.noAssetDefinitions}`);
check(summary.definitionDisplay.multipleAssetDefinitions === contract.expectedCanonicalPopulation.definitionsWithMultipleAssets,
  `multiple-asset definitions ${summary.definitionDisplay.multipleAssetDefinitions}`);
check(summary.semanticFreeze.stage2DefinitionIdsChanged === false, 'Stage 2 definition IDs changed');
check(summary.semanticFreeze.stage2OccurrenceIdsChanged === false, 'Stage 2 occurrence IDs changed');
check(summary.semanticFreeze.stage31AssetIdsChanged === false, 'Stage 3-1 asset IDs changed');
check(summary.semanticFreeze.occurrenceFallbackApplied === false, 'occurrence fallback applied');
check(summary.semanticFreeze.canonicalAssetOwnerInvented === false, 'canonical asset owner invented');
check(summary.semanticFreeze.sharedAssetUsedToMergeDefinitions === false, 'shared asset used to merge definitions');

if (errors.length > 0) {
  console.error(JSON.stringify({ status: 'FAIL_BANNER_STAGE3_2_DISPLAY_VALIDATION', errors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS_BANNER_STAGE3_2_DISPLAY_VALIDATION',
  definitions: definitions.length,
  occurrences: occurrences.length,
  renderableOccurrences: summary.occurrenceDisplay.renderableOccurrences,
  placeholderOccurrences: summary.occurrenceDisplay.placeholderOccurrences,
  manualReplacementOccurrences: summary.occurrenceDisplay.manualReplacementOccurrences,
  pendingManualAssetAssignments: summary.pendingManualAssetAssignments
}, null, 2));
