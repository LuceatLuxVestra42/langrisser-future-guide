import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CONTRACT_PATH = 'data/contracts/banner-stage3-1-asset-relation.v1.json';
const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha256Bytes = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const uniq = values => [...new Set(values)];
const sorted = values => [...values].sort((a, b) => String(a).localeCompare(String(b)));

const contract = load(CONTRACT_PATH);
const stage30 = load(contract.inputs.stage30Summary);
const definitionsData = load(contract.inputs.definitions);
const occurrencesData = load(contract.inputs.occurrences);
const definitions = definitionsData.records;
const occurrences = occurrencesData.records;
const hardErrors = [];
const reviews = [];

const check = (condition, message) => {
  if (!condition) hardErrors.push(message);
};

function walkFiles(root) {
  const files = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full.split(path.sep).join('/'));
    }
  };
  walk(root);
  return files.sort();
}

check(stage30.status === 'PASS_BANNER_STAGE3_0_INPUT_CONTRACT', `Stage 3-0 status changed: ${stage30.status}`);
check(definitions.length === contract.expectedCanonicalPopulation.definitions, `definition count ${definitions.length}`);
check(occurrences.length === contract.expectedCanonicalPopulation.occurrences, `occurrence count ${occurrences.length}`);

const definitionIds = new Set(definitions.map(row => row.bannerDefinitionId));
const occurrenceIds = new Set(occurrences.map(row => row.bannerOccurrenceId));
check(definitionIds.size === definitions.length, 'duplicate bannerDefinitionId');
check(occurrenceIds.size === occurrences.length, 'duplicate bannerOccurrenceId');

const rootCensus = {};
const basenameIndexByType = {};
for (const [imageType, root] of Object.entries(contract.assetRoots)) {
  check(fs.existsSync(root) && fs.statSync(root).isDirectory(), `asset root missing: ${root}`);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;
  const files = walkFiles(root);
  const basenameMap = new Map();
  for (const file of files) {
    const base = path.basename(file);
    if (!basenameMap.has(base)) basenameMap.set(base, []);
    basenameMap.get(base).push(file);
  }
  const duplicateBasenames = [...basenameMap.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([basename, paths]) => ({ basename, paths: sorted(paths) }));
  rootCensus[imageType] = {
    root,
    fileCount: files.length,
    webpCount: files.filter(file => file.toLowerCase().endsWith('.webp')).length,
    duplicateBasenameCount: duplicateBasenames.length,
    duplicateBasenames
  };
  basenameIndexByType[imageType] = basenameMap;
}

const occurrenceRelations = [];
const resolvedPaths = new Set();
let nonNullImageReferences = 0;
let nullImageReferences = 0;

for (const occurrence of occurrences) {
  const display = occurrence.display;
  check(display && typeof display === 'object', `${occurrence.bannerOccurrenceId}: missing display block`);
  check(definitionIds.has(occurrence.bannerDefinitionId), `${occurrence.bannerOccurrenceId}: unknown definition ${occurrence.bannerDefinitionId}`);

  const baseRelation = {
    bannerOccurrenceId: occurrence.bannerOccurrenceId,
    bannerDefinitionId: occurrence.bannerDefinitionId,
    sourceImageType: display?.imageType ?? null,
    sourceImageFile: display?.imageFile ?? null,
    sourceImageStatus: display?.imageStatus ?? null,
    relationStatus: null,
    resolvedPath: null,
    assetId: null,
    resolutionBasis: null
  };

  if (!display || typeof display !== 'object') {
    baseRelation.relationStatus = 'UNSUPPORTED_IMAGE_TYPE';
    baseRelation.resolutionBasis = 'MISSING_DISPLAY_BLOCK';
    occurrenceRelations.push(baseRelation);
    continue;
  }

  if (!contract.allowedSourceImageStatuses.includes(display.imageStatus)) {
    hardErrors.push(`${occurrence.bannerOccurrenceId}: unsupported source imageStatus ${display.imageStatus}`);
  }

  if (display.imageFile == null) {
    nullImageReferences += 1;
    baseRelation.relationStatus = 'MANUAL_ASSET_REQUIRED';
    baseRelation.resolutionBasis = 'EXPLICIT_NULL_IMAGE_FILE_FROM_STAGE2';
    occurrenceRelations.push(baseRelation);
    continue;
  }

  nonNullImageReferences += 1;
  if (path.basename(display.imageFile) !== display.imageFile) {
    hardErrors.push(`${occurrence.bannerOccurrenceId}: imageFile must be basename only: ${display.imageFile}`);
  }

  const index = basenameIndexByType[display.imageType];
  if (!index) {
    baseRelation.relationStatus = 'UNSUPPORTED_IMAGE_TYPE';
    baseRelation.resolutionBasis = 'NO_APPROVED_ASSET_ROOT_FOR_IMAGE_TYPE';
    occurrenceRelations.push(baseRelation);
    continue;
  }

  const matches = index.get(display.imageFile) ?? [];
  if (matches.length === 0) {
    baseRelation.relationStatus = 'MISSING_REFERENCED_FILE';
    baseRelation.resolutionBasis = 'EXACT_BASENAME_NOT_FOUND_IN_SELECTED_ROOT';
    occurrenceRelations.push(baseRelation);
    continue;
  }
  if (matches.length > 1) {
    baseRelation.relationStatus = 'AMBIGUOUS_REFERENCED_FILE';
    baseRelation.resolutionBasis = 'MULTIPLE_EXACT_BASENAME_MATCHES_IN_SELECTED_ROOT';
    baseRelation.candidatePaths = sorted(matches);
    occurrenceRelations.push(baseRelation);
    continue;
  }

  const resolvedPath = matches[0];
  resolvedPaths.add(resolvedPath);
  baseRelation.resolvedPath = resolvedPath;
  baseRelation.relationStatus = display.imageStatus === 'matched'
    ? 'VERIFIED_MATCHED_FILE'
    : 'VERIFIED_MANUAL_REPLACEMENT_FILE';
  baseRelation.resolutionBasis = 'EXACT_BASENAME_IN_STAGE2_IMAGE_TYPE_ROOT';
  occurrenceRelations.push(baseRelation);
}

check(nonNullImageReferences === contract.expectedCanonicalPopulation.nonNullImageReferences,
  `non-null image refs ${nonNullImageReferences}`);
check(nullImageReferences === contract.expectedCanonicalPopulation.nullImageReferences,
  `null image refs ${nullImageReferences}`);
check(occurrenceRelations.length === occurrences.length, `occurrence relation count ${occurrenceRelations.length}`);

const pathAssetMeta = new Map();
for (const file of sorted(resolvedPaths)) {
  const bytes = fs.readFileSync(file);
  const digest = sha256Bytes(bytes);
  pathAssetMeta.set(file, {
    contentSha256: digest,
    assetId: `basset:v1:${digest.slice(0, 24)}`,
    sizeBytes: bytes.length
  });
}

for (const relation of occurrenceRelations) {
  if (!relation.resolvedPath) continue;
  relation.assetId = pathAssetMeta.get(relation.resolvedPath).assetId;
}

const assetMap = new Map();
for (const relation of occurrenceRelations) {
  if (!relation.assetId) continue;
  const meta = pathAssetMeta.get(relation.resolvedPath);
  if (!assetMap.has(relation.assetId)) {
    assetMap.set(relation.assetId, {
      assetId: relation.assetId,
      contentSha256: meta.contentSha256,
      sizeBytes: meta.sizeBytes,
      repositoryPaths: [],
      fileNames: [],
      imageTypes: [],
      occurrenceIds: [],
      definitionIds: []
    });
  }
  const asset = assetMap.get(relation.assetId);
  asset.repositoryPaths.push(relation.resolvedPath);
  asset.fileNames.push(path.basename(relation.resolvedPath));
  asset.imageTypes.push(relation.sourceImageType);
  asset.occurrenceIds.push(relation.bannerOccurrenceId);
  asset.definitionIds.push(relation.bannerDefinitionId);
}

const assets = [...assetMap.values()].map(asset => ({
  ...asset,
  repositoryPaths: sorted(uniq(asset.repositoryPaths)),
  fileNames: sorted(uniq(asset.fileNames)),
  imageTypes: sorted(uniq(asset.imageTypes)),
  occurrenceIds: sorted(uniq(asset.occurrenceIds)),
  definitionIds: sorted(uniq(asset.definitionIds))
})).sort((a, b) => a.assetId.localeCompare(b.assetId));

const relationByDefinition = new Map();
for (const definition of definitions) {
  relationByDefinition.set(definition.bannerDefinitionId, []);
}
for (const relation of occurrenceRelations) {
  relationByDefinition.get(relation.bannerDefinitionId)?.push(relation);
}

const definitionRelations = definitions.map(definition => {
  const relations = relationByDefinition.get(definition.bannerDefinitionId) ?? [];
  const assetIds = sorted(uniq(relations.map(row => row.assetId).filter(Boolean)));
  return {
    bannerDefinitionId: definition.bannerDefinitionId,
    occurrenceCount: relations.length,
    occurrenceIds: sorted(relations.map(row => row.bannerOccurrenceId)),
    assetIds,
    assetCount: assetIds.length,
    resolvedOccurrenceCount: relations.filter(row => row.assetId).length,
    manualAssetRequiredCount: relations.filter(row => row.relationStatus === 'MANUAL_ASSET_REQUIRED').length,
    unresolvedOccurrenceCount: relations.filter(row => ['MISSING_REFERENCED_FILE', 'AMBIGUOUS_REFERENCED_FILE', 'UNSUPPORTED_IMAGE_TYPE'].includes(row.relationStatus)).length,
    relationMode: 'REFERENCE_SET_NO_CANONICAL_OWNER'
  };
});

const statusCounts = Object.fromEntries(contract.relationStatuses.map(status => [status, 0]));
for (const relation of occurrenceRelations) {
  statusCounts[relation.relationStatus] = (statusCounts[relation.relationStatus] ?? 0) + 1;
}

const missingCount = statusCounts.MISSING_REFERENCED_FILE ?? 0;
const ambiguousCount = statusCounts.AMBIGUOUS_REFERENCED_FILE ?? 0;
const unsupportedCount = statusCounts.UNSUPPORTED_IMAGE_TYPE ?? 0;
if (!contract.completionPolicy.missingReferencedFilesAllowed) check(missingCount === 0, `missing referenced files ${missingCount}`);
if (!contract.completionPolicy.ambiguousReferencedFilesAllowed) check(ambiguousCount === 0, `ambiguous referenced files ${ambiguousCount}`);
if (!contract.completionPolicy.unsupportedImageTypesAllowed) check(unsupportedCount === 0, `unsupported image types ${unsupportedCount}`);

const resolvedCount = occurrenceRelations.filter(row => row.assetId).length;
const manualRequiredCount = statusCounts.MANUAL_ASSET_REQUIRED ?? 0;
check(resolvedCount + manualRequiredCount + missingCount + ambiguousCount + unsupportedCount === occurrences.length,
  'occurrence asset disposition is not closed');
check(definitionRelations.length === definitions.length, `definition relation count ${definitionRelations.length}`);

const totalRepositoryAssetFiles = Object.values(rootCensus).reduce((sum, root) => sum + root.fileCount, 0);
const exactByteDuplicateAssetGroups = assets.filter(asset => asset.repositoryPaths.length > 1).length;
const sharedAssetsAcrossDefinitions = assets.filter(asset => asset.definitionIds.length > 1).length;
const definitionsWithMultipleAssets = definitionRelations.filter(row => row.assetCount > 1).length;
const definitionsWithNoResolvedAsset = definitionRelations.filter(row => row.assetCount === 0).length;

const output = {
  version: 1,
  stage: 'Banner Stage 3-1',
  status: hardErrors.length === 0 ? 'BANNER_STAGE3_1_ASSET_RELATIONS_MATERIALIZED' : 'BANNER_STAGE3_1_ASSET_RELATIONS_WITH_ERRORS',
  policy: {
    lookup: contract.resolutionPolicy.lookup,
    assetId: contract.resolutionPolicy.assetId,
    crossRootFallbackAllowed: false,
    filenameSimilarityAllowed: false,
    perceptualImageEquivalence: false,
    canonicalAssetOwner: false,
    assetMayMergeBannerDefinitions: false
  },
  repositoryCensus: {
    roots: rootCensus,
    totalFileCount: totalRepositoryAssetFiles
  },
  referenceCensus: {
    occurrenceCount: occurrences.length,
    nonNullImageReferenceCount: nonNullImageReferences,
    nullImageReferenceCount: nullImageReferences,
    resolvedOccurrenceCount: resolvedCount,
    uniqueResolvedPathCount: resolvedPaths.size,
    uniqueContentAssetCount: assets.length,
    exactByteDuplicateAssetGroupCount: exactByteDuplicateAssetGroups,
    sharedAssetAcrossDefinitionCount: sharedAssetsAcrossDefinitions
  },
  assets,
  occurrenceRelations,
  definitionRelations,
  reviews,
  errors: hardErrors
};

const summary = {
  stage: '3-1',
  status: hardErrors.length === 0 ? 'PASS_BANNER_STAGE3_1_ASSET_RELATION' : 'FAIL_BANNER_STAGE3_1_ASSET_RELATION',
  canonicalPopulation: {
    definitions: definitions.length,
    occurrences: occurrences.length
  },
  repositoryAssetCensus: {
    roots: Object.fromEntries(Object.entries(rootCensus).map(([key, value]) => [key, {
      root: value.root,
      files: value.fileCount,
      webp: value.webpCount,
      duplicateBasenames: value.duplicateBasenameCount
    }])),
    totalFiles: totalRepositoryAssetFiles
  },
  referenceResolution: {
    nonNullImageReferences,
    nullImageReferences,
    resolvedOccurrences: resolvedCount,
    uniqueResolvedPaths: resolvedPaths.size,
    uniqueContentAssets: assets.length,
    statusCounts
  },
  duplicateAndSharing: {
    exactByteDuplicateAssetGroups,
    sharedAssetsAcrossDefinitions,
    definitionsWithMultipleAssets,
    definitionsWithNoResolvedAsset
  },
  semanticFreeze: {
    stage2DefinitionIdsChanged: false,
    stage2OccurrenceIdsChanged: false,
    assetUsedForDefinitionGrouping: false,
    canonicalAssetOwnerInvented: false,
    perceptualDuplicateInferenceUsed: false,
    filenameSimilarityInferenceUsed: false
  },
  errors: hardErrors,
  reviews,
  nextStage: contract.nextStage
};

fs.mkdirSync(path.dirname(contract.outputs.relations), { recursive: true });
fs.mkdirSync(path.dirname(contract.outputs.summary), { recursive: true });
fs.writeFileSync(contract.outputs.relations, `${JSON.stringify(output, null, 2)}\n`);
fs.writeFileSync(contract.outputs.summary, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (hardErrors.length > 0) process.exitCode = 1;
