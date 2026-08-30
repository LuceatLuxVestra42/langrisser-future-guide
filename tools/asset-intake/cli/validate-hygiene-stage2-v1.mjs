import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildStage2ReferenceMap, PATHS } from '../core/hygiene-stage2-reference-map-v1.mjs';

const REPO_ROOT = process.cwd();

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readText(repositoryPath) {
  return readFile(path.join(REPO_ROOT, repositoryPath), 'utf8');
}

async function main() {
  const expected = await buildStage2ReferenceMap({ write: false });
  const actualReferenceMap = await readText(PATHS.referenceMap);
  const actualUnresolved = await readText(PATHS.unresolved);
  const actualSummary = await readText(PATHS.summary);
  const actualCheckpoint = await readText(PATHS.checkpoint);

  const mismatches = [];
  if (actualReferenceMap !== stable(expected.referenceMap)) mismatches.push(PATHS.referenceMap);
  if (actualUnresolved !== stable(expected.unresolvedArtifact)) mismatches.push(PATHS.unresolved);
  if (actualSummary !== stable(expected.summary)) mismatches.push(PATHS.summary);
  if (actualCheckpoint !== expected.checkpoint) mismatches.push(PATHS.checkpoint);

  const { summary, referenceMap, unresolvedArtifact } = expected;
  if (summary.coverage.inventoryRecordCount !== 2188) throw new Error(`expected frozen inventory coverage 2188, got ${summary.coverage.inventoryRecordCount}`);
  if (summary.coverage.referenceMapRecordCount !== 2188) throw new Error(`reference-map coverage mismatch: ${summary.coverage.referenceMapRecordCount}`);
  if (referenceMap.records.length !== 2188) throw new Error(`reference-map record array mismatch: ${referenceMap.records.length}`);
  if (new Set(referenceMap.records.map((record) => record.repositoryPath)).size !== 2188) throw new Error('reference-map repositoryPath uniqueness failed');
  if (unresolvedArtifact.count !== 0 || summary.hardErrorCount !== 0) {
    throw new Error(`unresolved structural references remain: ${unresolvedArtifact.count}`);
  }
  if (summary.domainChecks.soldierSourceCount !== 224 || summary.domainChecks.soldierDeliveryCount !== 224) throw new Error('Soldier fixture parity failed');
  if (summary.domainChecks.bannerResolvedUniquePathCount !== 70) throw new Error('Banner resolved-path fixture parity failed');
  if (summary.domainChecks.heroArtworkResolvedCount !== 267) throw new Error('Hero artwork fixture parity failed');
  if (summary.domainChecks.heroCardIconSourceCount !== 267 || summary.domainChecks.heroCardIconDeliveryCount !== 267) throw new Error('Hero card-icon fixture parity failed');
  if (summary.domainChecks.equipmentPublicTargetCount !== 373) throw new Error('Equipment fixture parity failed');
  if (summary.domainChecks.factionAssetCount !== 12 || summary.domainChecks.armyAssetCount !== 10) throw new Error('Faction/Army fixture parity failed');
  if (summary.domainChecks.skinStatePreserved !== true) throw new Error('Skin upstream readiness boundary was not preserved');
  if (summary.forbiddenOperationCounts.classification !== 0 || summary.forbiddenOperationCounts.semanticRecomputation !== 0 || summary.forbiddenOperationCounts.assetMutation !== 0) {
    throw new Error('AH-2 forbidden-operation boundary failed');
  }

  for (const record of referenceMap.records) {
    if ('primaryClass' in record || 'classification' in record || 'provenanceClass' in record) {
      throw new Error(`AH-3 classification field leaked into AH-2 record: ${record.repositoryPath}`);
    }
  }

  if (mismatches.length) throw new Error(`frozen AH-2 artifacts are stale: ${mismatches.join(', ')}`);

  console.log(JSON.stringify({
    status: summary.status,
    completion: summary.completion,
    freezeState: summary.freezeState,
    coverage: summary.coverage,
    referenceKinds: summary.referenceKinds,
    reviews: summary.reviews,
    hardErrorCount: summary.hardErrorCount,
    nextStartPoint: summary.nextStartPoint,
  }, null, 2));
}

await main();
