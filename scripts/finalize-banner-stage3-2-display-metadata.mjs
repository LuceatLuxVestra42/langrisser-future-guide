import fs from 'node:fs';
import path from 'node:path';

const CONTRACT_PATH = 'data/contracts/banner-stage3-2-display-metadata.v1.json';
const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const uniq = values => [...new Set(values)];
const sorted = values => [...values].sort((a, b) => String(a).localeCompare(String(b)));

const contract = load(CONTRACT_PATH);
const stage31Summary = load(contract.inputs.stage31Summary);
const stage31 = load(contract.inputs.stage31Relations);
const occurrencesData = load(contract.inputs.occurrences);
const definitionsData = load(contract.inputs.definitions);
const occurrences = occurrencesData.records;
const definitions = definitionsData.records;
const hardErrors = [];
const reviews = [];

const check = (condition, message) => {
  if (!condition) hardErrors.push(message);
};

check(stage31Summary.status === 'PASS_BANNER_STAGE3_1_ASSET_RELATION', `Stage 3-1 status changed: ${stage31Summary.status}`);
check(occurrences.length === contract.expectedCanonicalPopulation.occurrences, `occurrence count ${occurrences.length}`);
check(definitions.length === contract.expectedCanonicalPopulation.definitions, `definition count ${definitions.length}`);
check(stage31.occurrenceRelations.length === occurrences.length, `Stage 3-1 occurrence relation count ${stage31.occurrenceRelations.length}`);
check(stage31.definitionRelations.length === definitions.length, `Stage 3-1 definition relation count ${stage31.definitionRelations.length}`);

const definitionIds = new Set(definitions.map(row => row.bannerDefinitionId));
const occurrenceIds = new Set(occurrences.map(row => row.bannerOccurrenceId));
const relationByOccurrence = new Map(stage31.occurrenceRelations.map(row => [row.bannerOccurrenceId, row]));
const assetById = new Map(stage31.assets.map(row => [row.assetId, row]));
check(relationByOccurrence.size === occurrences.length, 'duplicate/missing Stage 3-1 occurrence relations');

function toPublicPath(resolvedPath) {
  if (resolvedPath == null) return null;
  const prefix = contract.publicPathPolicy.repositoryPrefix;
  if (!resolvedPath.startsWith(prefix)) {
    hardErrors.push(`resolved asset path outside public root: ${resolvedPath}`);
    return null;
  }
  return `${contract.publicPathPolicy.webPrefix}${resolvedPath.slice(prefix.length)}`;
}

const occurrenceDisplayRecords = [];
for (const occurrence of occurrences) {
  const relation = relationByOccurrence.get(occurrence.bannerOccurrenceId);
  if (!relation) {
    hardErrors.push(`${occurrence.bannerOccurrenceId}: missing Stage 3-1 relation`);
    continue;
  }
  check(relation.bannerDefinitionId === occurrence.bannerDefinitionId,
    `${occurrence.bannerOccurrenceId}: definition changed between Stage 2 and Stage 3-1`);
  check(definitionIds.has(occurrence.bannerDefinitionId),
    `${occurrence.bannerOccurrenceId}: unknown definition ${occurrence.bannerDefinitionId}`);

  const displayPolicy = contract.occurrenceDisplayPolicy[relation.relationStatus];
  if (!displayPolicy) {
    hardErrors.push(`${occurrence.bannerOccurrenceId}: unsupported Stage 3-1 relation status ${relation.relationStatus}`);
    continue;
  }

  const canRenderImage = displayPolicy.canRenderImage === true;
  if (canRenderImage) {
    check(Boolean(relation.assetId), `${occurrence.bannerOccurrenceId}: renderable relation missing assetId`);
    check(Boolean(relation.resolvedPath), `${occurrence.bannerOccurrenceId}: renderable relation missing resolvedPath`);
    check(assetById.has(relation.assetId), `${occurrence.bannerOccurrenceId}: unknown assetId ${relation.assetId}`);
  } else {
    check(relation.assetId == null, `${occurrence.bannerOccurrenceId}: placeholder relation unexpectedly has assetId`);
    check(relation.resolvedPath == null, `${occurrence.bannerOccurrenceId}: placeholder relation unexpectedly has resolvedPath`);
  }

  const publicPath = canRenderImage ? toPublicPath(relation.resolvedPath) : null;
  const record = {
    bannerOccurrenceId: occurrence.bannerOccurrenceId,
    bannerDefinitionId: occurrence.bannerDefinitionId,
    krDisplayDate: occurrence.krDisplayDate,
    displayOrder: occurrence.displayOrder,
    visualType: occurrence.display?.visualType ?? null,
    sourceImageType: relation.sourceImageType,
    sourceImageFile: relation.sourceImageFile,
    sourceImageStatus: relation.sourceImageStatus,
    assetRelationStatus: relation.relationStatus,
    assetId: relation.assetId,
    repositoryPath: relation.resolvedPath,
    publicPath,
    displayState: displayPolicy.displayState,
    canRenderImage,
    provenance: displayPolicy.provenance,
    replacementState: displayPolicy.replacementState,
    fallbackApplied: false,
    placeholderKey: canRenderImage ? null : 'BANNER_IMAGE_PENDING_MANUAL_ASSET'
  };
  occurrenceDisplayRecords.push(record);
}

check(occurrenceDisplayRecords.length === occurrences.length,
  `occurrence display metadata count ${occurrenceDisplayRecords.length}`);

const displayByDefinition = new Map(definitions.map(row => [row.bannerDefinitionId, []]));
for (const row of occurrenceDisplayRecords) displayByDefinition.get(row.bannerDefinitionId)?.push(row);

const definitionDisplayRecords = definitions.map(definition => {
  const rows = displayByDefinition.get(definition.bannerDefinitionId) ?? [];
  const assetIds = sorted(uniq(rows.map(row => row.assetId).filter(Boolean)));
  const publicPaths = sorted(uniq(rows.map(row => row.publicPath).filter(Boolean)));
  let displayResolution;
  let displayAssetId = null;
  let displayPublicPath = null;
  let canRenderImage = false;

  if (assetIds.length === 0) {
    displayResolution = contract.definitionDisplayPolicy.zeroResolvedAssets;
  } else if (assetIds.length === 1) {
    displayResolution = contract.definitionDisplayPolicy.singleUniqueResolvedAsset;
    displayAssetId = assetIds[0];
    if (publicPaths.length === 1) {
      displayPublicPath = publicPaths[0];
      canRenderImage = true;
    } else {
      reviews.push({
        type: 'SINGLE_ASSET_MULTIPLE_PUBLIC_PATHS',
        bannerDefinitionId: definition.bannerDefinitionId,
        assetId: displayAssetId,
        publicPaths
      });
    }
  } else {
    displayResolution = contract.definitionDisplayPolicy.multipleResolvedAssets;
  }

  return {
    bannerDefinitionId: definition.bannerDefinitionId,
    occurrenceCount: rows.length,
    occurrenceIds: sorted(rows.map(row => row.bannerOccurrenceId)),
    resolvedAssetIds: assetIds,
    resolvedAssetCount: assetIds.length,
    resolvedPublicPaths: publicPaths,
    displayResolution,
    displayAssetId,
    displayPublicPath,
    canRenderImage,
    canonicalAssetOwner: false,
    occurrenceFallbackAllowed: false,
    provenanceCounts: {
      SOURCE_MATCHED: rows.filter(row => row.provenance === 'SOURCE_MATCHED').length,
      MANUAL_REPLACEMENT: rows.filter(row => row.provenance === 'MANUAL_REPLACEMENT').length,
      NO_RESOLVED_ASSET: rows.filter(row => row.provenance === 'NO_RESOLVED_ASSET').length
    }
  };
});

check(definitionDisplayRecords.length === definitions.length,
  `definition display metadata count ${definitionDisplayRecords.length}`);

const renderableOccurrences = occurrenceDisplayRecords.filter(row => row.canRenderImage).length;
const placeholderOccurrences = occurrenceDisplayRecords.filter(row => !row.canRenderImage).length;
const sourceMatchedOccurrences = occurrenceDisplayRecords.filter(row => row.provenance === 'SOURCE_MATCHED').length;
const manualReplacementOccurrences = occurrenceDisplayRecords.filter(row => row.provenance === 'MANUAL_REPLACEMENT').length;
const manualAssetRequiredOccurrences = occurrenceDisplayRecords.filter(row => row.replacementState === 'MANUAL_ASSET_REQUIRED');
const singleAssetDefinitions = definitionDisplayRecords.filter(row => row.displayResolution === contract.definitionDisplayPolicy.singleUniqueResolvedAsset).length;
const noAssetDefinitions = definitionDisplayRecords.filter(row => row.displayResolution === contract.definitionDisplayPolicy.zeroResolvedAssets).length;
const multipleAssetDefinitions = definitionDisplayRecords.filter(row => row.displayResolution === contract.definitionDisplayPolicy.multipleResolvedAssets).length;

check(renderableOccurrences === contract.expectedCanonicalPopulation.resolvedOccurrences,
  `renderable occurrence count ${renderableOccurrences}`);
check(manualAssetRequiredOccurrences.length === contract.expectedCanonicalPopulation.manualAssetRequiredOccurrences,
  `manual asset required occurrence count ${manualAssetRequiredOccurrences.length}`);
check(noAssetDefinitions === contract.expectedCanonicalPopulation.definitionsWithNoResolvedAsset,
  `definitions with no resolved asset ${noAssetDefinitions}`);
check(multipleAssetDefinitions === contract.expectedCanonicalPopulation.definitionsWithMultipleAssets,
  `definitions with multiple assets ${multipleAssetDefinitions}`);
check(placeholderOccurrences === manualAssetRequiredOccurrences.length,
  `placeholder/manual-required mismatch ${placeholderOccurrences}/${manualAssetRequiredOccurrences.length}`);

for (const row of occurrenceDisplayRecords) {
  if (row.canRenderImage) {
    check(Boolean(row.assetId) && Boolean(row.publicPath), `${row.bannerOccurrenceId}: renderable display lacks asset/publicPath`);
    check(row.fallbackApplied === false, `${row.bannerOccurrenceId}: forbidden fallback applied`);
  } else {
    check(row.assetId == null && row.publicPath == null, `${row.bannerOccurrenceId}: placeholder leaked an asset`);
    check(row.displayState === 'PLACEHOLDER_MANUAL_ASSET_REQUIRED', `${row.bannerOccurrenceId}: unresolved occurrence not explicit placeholder`);
  }
}

for (const row of definitionDisplayRecords) {
  if (row.resolvedAssetCount > 1) {
    check(row.displayAssetId == null && row.displayPublicPath == null,
      `${row.bannerDefinitionId}: multiple assets must not get automatic default`);
  }
}

const sharedAssetsAcrossDefinitions = stage31.assets
  .filter(asset => asset.definitionIds.length > 1)
  .map(asset => ({
    assetId: asset.assetId,
    definitionIds: sorted(asset.definitionIds),
    occurrenceIds: sorted(asset.occurrenceIds),
    repositoryPaths: sorted(asset.repositoryPaths)
  }));

const output = {
  version: 1,
  stage: 'Banner Stage 3-2',
  status: hardErrors.length === 0 ? 'BANNER_STAGE3_2_DISPLAY_METADATA_MATERIALIZED' : 'BANNER_STAGE3_2_DISPLAY_METADATA_WITH_ERRORS',
  policy: {
    occurrenceAssetSource: 'STAGE3_1_OCCURRENCE_RELATION_ONLY',
    publicPathRule: contract.publicPathPolicy.rule,
    fallbackPolicy: contract.fallbackPolicy,
    definitionDisplayPolicy: contract.definitionDisplayPolicy,
    canonicalAssetOwner: false,
    assetMayMergeDefinitions: false
  },
  occurrenceDisplayRecords,
  definitionDisplayRecords,
  sharedAssetsAcrossDefinitions,
  pendingManualAssetAssignments: manualAssetRequiredOccurrences.map(row => ({
    bannerOccurrenceId: row.bannerOccurrenceId,
    bannerDefinitionId: row.bannerDefinitionId,
    krDisplayDate: row.krDisplayDate,
    displayOrder: row.displayOrder,
    displayState: row.displayState,
    placeholderKey: row.placeholderKey
  })),
  reviews,
  errors: hardErrors
};

const summary = {
  stage: '3-2',
  status: hardErrors.length === 0 ? 'PASS_BANNER_STAGE3_2_DISPLAY_METADATA' : 'FAIL_BANNER_STAGE3_2_DISPLAY_METADATA',
  canonicalPopulation: {
    definitions: definitions.length,
    occurrences: occurrences.length
  },
  occurrenceDisplay: {
    renderableOccurrences,
    placeholderOccurrences,
    sourceMatchedOccurrences,
    manualReplacementOccurrences,
    manualAssetRequiredOccurrences: manualAssetRequiredOccurrences.length
  },
  definitionDisplay: {
    singleAssetDefinitions,
    noAssetDefinitions,
    multipleAssetDefinitions
  },
  pendingManualAssetAssignments: output.pendingManualAssetAssignments,
  sharedAssetsAcrossDefinitions,
  semanticFreeze: {
    stage2DefinitionIdsChanged: false,
    stage2OccurrenceIdsChanged: false,
    stage31AssetIdsChanged: false,
    occurrenceFallbackApplied: false,
    canonicalAssetOwnerInvented: false,
    sharedAssetUsedToMergeDefinitions: false
  },
  errors: hardErrors,
  reviews,
  nextStage: contract.nextStage
};

fs.mkdirSync(path.dirname(contract.outputs.displayMetadata), { recursive: true });
fs.mkdirSync(path.dirname(contract.outputs.summary), { recursive: true });
fs.writeFileSync(contract.outputs.displayMetadata, `${JSON.stringify(output, null, 2)}\n`);
fs.writeFileSync(contract.outputs.summary, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (hardErrors.length > 0) process.exitCode = 1;
