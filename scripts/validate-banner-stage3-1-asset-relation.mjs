import fs from 'node:fs';

const CONTRACT_PATH = 'data/contracts/banner-stage3-1-asset-relation.v1.json';
const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };

const contract = load(CONTRACT_PATH);
const output = load(contract.outputs.relations);
const summary = load(contract.outputs.summary);

check(summary.status === 'PASS_BANNER_STAGE3_1_ASSET_RELATION', `summary status ${summary.status}`);
check(output.status === 'BANNER_STAGE3_1_ASSET_RELATIONS_MATERIALIZED', `output status ${output.status}`);
check(summary.errors.length === 0, `summary errors ${summary.errors.join('; ')}`);
check(output.errors.length === 0, `output errors ${output.errors.join('; ')}`);

const expected = contract.expectedCanonicalPopulation;
check(output.occurrenceRelations.length === expected.occurrences, `occurrence relations ${output.occurrenceRelations.length}`);
check(output.definitionRelations.length === expected.definitions, `definition relations ${output.definitionRelations.length}`);
check(summary.canonicalPopulation.occurrences === expected.occurrences, 'summary occurrence count mismatch');
check(summary.canonicalPopulation.definitions === expected.definitions, 'summary definition count mismatch');
check(summary.referenceResolution.nonNullImageReferences === expected.nonNullImageReferences, 'non-null image reference count mismatch');
check(summary.referenceResolution.nullImageReferences === expected.nullImageReferences, 'null image reference count mismatch');

const status = summary.referenceResolution.statusCounts;
check((status.MISSING_REFERENCED_FILE ?? 0) === 0, `missing referenced file count ${status.MISSING_REFERENCED_FILE}`);
check((status.AMBIGUOUS_REFERENCED_FILE ?? 0) === 0, `ambiguous referenced file count ${status.AMBIGUOUS_REFERENCED_FILE}`);
check((status.UNSUPPORTED_IMAGE_TYPE ?? 0) === 0, `unsupported image type count ${status.UNSUPPORTED_IMAGE_TYPE}`);
check((status.MANUAL_ASSET_REQUIRED ?? 0) === expected.nullImageReferences, `manual asset required count ${status.MANUAL_ASSET_REQUIRED}`);
check(summary.referenceResolution.resolvedOccurrences + (status.MANUAL_ASSET_REQUIRED ?? 0) === expected.occurrences,
  'resolved/manual occurrence disposition is not closed');

const definitionIds = output.definitionRelations.map(row => row.bannerDefinitionId);
const occurrenceIds = output.occurrenceRelations.map(row => row.bannerOccurrenceId);
check(new Set(definitionIds).size === expected.definitions, 'duplicate definition relation ID');
check(new Set(occurrenceIds).size === expected.occurrences, 'duplicate occurrence relation ID');

const assetsById = new Map(output.assets.map(row => [row.assetId, row]));
check(assetsById.size === output.assets.length, 'duplicate assetId records');
for (const asset of output.assets) {
  check(/^basset:v1:[0-9a-f]{24}$/.test(asset.assetId), `invalid assetId ${asset.assetId}`);
  check(/^[0-9a-f]{64}$/.test(asset.contentSha256), `invalid content SHA-256 ${asset.assetId}`);
  check(asset.assetId === `basset:v1:${asset.contentSha256.slice(0, 24)}`, `asset ID/hash mismatch ${asset.assetId}`);
  check(asset.repositoryPaths.length >= 1, `asset without repository path ${asset.assetId}`);
}
for (const relation of output.occurrenceRelations) {
  if (relation.assetId) check(assetsById.has(relation.assetId), `${relation.bannerOccurrenceId}: unknown assetId ${relation.assetId}`);
  if (relation.relationStatus === 'MANUAL_ASSET_REQUIRED') {
    check(relation.sourceImageFile == null, `${relation.bannerOccurrenceId}: manual asset required must keep null source image`);
    check(relation.assetId == null, `${relation.bannerOccurrenceId}: manual asset required must not synthesize asset`);
  }
}

check(summary.semanticFreeze.stage2DefinitionIdsChanged === false, 'Stage 2 definition IDs changed');
check(summary.semanticFreeze.stage2OccurrenceIdsChanged === false, 'Stage 2 occurrence IDs changed');
check(summary.semanticFreeze.assetUsedForDefinitionGrouping === false, 'asset used for definition grouping');
check(summary.semanticFreeze.canonicalAssetOwnerInvented === false, 'canonical asset owner invented');
check(summary.semanticFreeze.perceptualDuplicateInferenceUsed === false, 'perceptual duplicate inference used');
check(summary.semanticFreeze.filenameSimilarityInferenceUsed === false, 'filename similarity inference used');

console.log(JSON.stringify({
  stage: '3-1',
  status: 'PASS_BANNER_STAGE3_1_ASSET_RELATION_VALIDATION',
  definitions: expected.definitions,
  occurrences: expected.occurrences,
  resolvedOccurrences: summary.referenceResolution.resolvedOccurrences,
  manualAssetRequired: status.MANUAL_ASSET_REQUIRED ?? 0,
  uniqueResolvedPaths: summary.referenceResolution.uniqueResolvedPaths,
  uniqueContentAssets: summary.referenceResolution.uniqueContentAssets,
  exactByteDuplicateAssetGroups: summary.duplicateAndSharing.exactByteDuplicateAssetGroups,
  sharedAssetsAcrossDefinitions: summary.duplicateAndSharing.sharedAssetsAcrossDefinitions
}, null, 2));
