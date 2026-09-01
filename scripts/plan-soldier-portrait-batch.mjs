import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LOCATOR_PATH = 'data/contracts/soldier-portrait-assets-current.v1.json';
const DEFAULT_CANONICAL_PATH = 'data/generated/soldier-master.v1.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function sortedUniqueIntegerIds(records, label) {
  if (!Array.isArray(records)) throw new Error(`${label} records must be an array`);
  const ids = records.map((record) => record?.soldierId);
  if (ids.some((id) => !Number.isInteger(id))) throw new Error(`${label} contains a non-integer soldierId`);
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  if (unique.length !== ids.length) throw new Error(`${label} contains duplicate soldierId values`);
  return unique;
}

export function computeSoldierPortraitBatchPlan(canonicalIds, currentAssetIds) {
  const canonical = [...canonicalIds].sort((a, b) => a - b);
  const assets = [...currentAssetIds].sort((a, b) => a - b);
  const canonicalSet = new Set(canonical);
  const assetSet = new Set(assets);
  const newIds = canonical.filter((id) => !assetSet.has(id));
  const removedIds = assets.filter((id) => !canonicalSet.has(id));

  const status = removedIds.length > 0
    ? 'BLOCKER'
    : newIds.length > 0
      ? 'BATCH_READY'
      : 'NO_UPDATE_REQUIRED';

  return {
    schemaId: 'soldier-portrait-batch-plan/v1',
    status,
    canonicalCount: canonical.length,
    currentAssetCount: assets.length,
    newIds,
    removedIds,
    boundaries: {
      semanticAuthority: false,
      idSetDifferenceOnly: true,
      nameJoin: false,
      idArithmetic: false,
      filenameSimilarity: false,
      semanticRecomputation: false,
      sourceDiscovery: false,
      assetMutation: false,
    },
  };
}

export function buildSoldierPortraitBatchPlan({
  locatorPath = DEFAULT_LOCATOR_PATH,
  canonicalPath = DEFAULT_CANONICAL_PATH,
} = {}) {
  const locator = readJson(locatorPath);
  if (
    locator?.schemaId !== 'soldier-portrait-assets-current/v1' ||
    locator?.status !== 'CURRENT' ||
    locator?.role?.semanticAuthority !== false ||
    locator?.role?.operationalLocatorOnly !== true ||
    locator?.boundaries?.semanticRecomputationCount !== 0 ||
    locator?.boundaries?.canonicalJoinRecomputationCount !== 0 ||
    locator?.boundaries?.nameJoinInference !== false ||
    locator?.boundaries?.idArithmeticInference !== false ||
    locator?.boundaries?.filenameSimilarityInference !== false
  ) {
    throw new Error('current Soldier portrait locator boundary is invalid');
  }

  const sourceManifestPath = locator?.currentSourceManifest;
  if (typeof sourceManifestPath !== 'string' || sourceManifestPath.length === 0) {
    throw new Error('current Soldier portrait source manifest pointer is missing');
  }

  const canonical = readJson(canonicalPath);
  const sourceManifest = readJson(sourceManifestPath);
  if (sourceManifest?.status !== 'PASS' || sourceManifest?.assetsReady !== true) {
    throw new Error('current Soldier portrait source manifest is not admitted');
  }

  const canonicalIds = sortedUniqueIntegerIds(canonical?.records, 'canonical Soldier consumer');
  const currentAssetIds = sortedUniqueIntegerIds(sourceManifest?.records, 'current Soldier portrait source manifest');
  const plan = computeSoldierPortraitBatchPlan(canonicalIds, currentAssetIds);

  return {
    ...plan,
    inputs: {
      canonical: canonicalPath,
      currentAssetLocator: locatorPath,
      currentAssetManifest: sourceManifestPath,
    },
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const plan = buildSoldierPortraitBatchPlan();
    console.log(JSON.stringify(plan, null, 2));
    if (plan.status === 'BLOCKER') process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      schemaId: 'soldier-portrait-batch-plan/v1',
      status: 'BLOCKER',
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  }
}
