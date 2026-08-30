import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildStage3Classification, PATHS } from '../core/hygiene-stage3-classification-v1.mjs';

const REPO_ROOT = process.cwd();

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readText(repositoryPath) {
  return readFile(path.join(REPO_ROOT, repositoryPath), 'utf8');
}

async function main() {
  const expected = await buildStage3Classification({ write: false });
  const actualClassification = await readText(PATHS.classification);
  const actualReviewQueue = await readText(PATHS.reviewQueue);
  const actualVerifiedIndex = await readText(PATHS.verifiedEvidenceIndex);
  const actualSummary = await readText(PATHS.summary);
  const actualCheckpoint = await readText(PATHS.checkpoint);

  const mismatches = [];
  if (actualClassification !== stable(expected.classification)) mismatches.push(PATHS.classification);
  if (actualReviewQueue !== stable(expected.reviewQueue)) mismatches.push(PATHS.reviewQueue);
  if (actualVerifiedIndex !== stable(expected.verifiedEvidenceIndex)) mismatches.push(PATHS.verifiedEvidenceIndex);
  if (actualSummary !== stable(expected.summary)) mismatches.push(PATHS.summary);
  if (actualCheckpoint !== expected.checkpoint) mismatches.push(PATHS.checkpoint);

  const { classification, reviewQueue, verifiedEvidenceIndex, summary } = expected;
  if (summary.coverage.inputRecordCount !== 2188 || summary.coverage.classifiedRecordCount !== 2188) {
    throw new Error(`classification coverage mismatch: ${summary.coverage.classifiedRecordCount}/${summary.coverage.inputRecordCount}`);
  }
  if (summary.coverage.unclassifiedRecordCount !== 0 || summary.hardErrorCount !== 0) {
    throw new Error(`unclassified records remain: ${summary.coverage.unclassifiedRecordCount}`);
  }
  if (classification.records.length !== 2188 || new Set(classification.records.map((record) => record.repositoryPath)).size !== 2188) {
    throw new Error('classification repositoryPath coverage/uniqueness failed');
  }
  if ((summary.primaryClassCounts.UNREFERENCED ?? 0) !== 457) {
    throw new Error(`AH-2 zero-reference parity failed: expected UNREFERENCED 457, got ${summary.primaryClassCounts.UNREFERENCED ?? 0}`);
  }
  if ((summary.flagCounts.EXACT_DUPLICATE ?? 0) !== 2) {
    throw new Error(`AH-1 exact duplicate member parity failed: expected 2, got ${summary.flagCounts.EXACT_DUPLICATE ?? 0}`);
  }
  if ((summary.flagCounts.RESOLVER_COLLISION ?? 0) !== 0) {
    throw new Error(`unexpected resolver collision flags: ${summary.flagCounts.RESOLVER_COLLISION}`);
  }
  if ((summary.flagCounts.UNVERIFIED_EXTERNAL ?? 0) !== 0) {
    throw new Error(`unexpected unverified external flags: ${summary.flagCounts.UNVERIFIED_EXTERNAL}`);
  }
  if (!reviewQueue.items.some((item) => item.priority === 'P3' && item.code === 'EXACT_DUPLICATE' && item.assetCount === 2)) {
    throw new Error('expected one exact-duplicate review group containing 2 assets');
  }
  if (!reviewQueue.items.some((item) => item.priority === 'P4' && item.code === 'UNREFERENCED')) {
    throw new Error('expected grouped P4 unreferenced review items');
  }
  if (verifiedEvidenceIndex.productionAdoption !== false || summary.verifiedEvidenceIndex.productionAdoption !== false) {
    throw new Error('AH-3 verified evidence index must remain read-only and not production-adopted');
  }
  if (summary.stopAfterStage3 !== true || summary.nextStartPoint !== 'STOP_AH3_FROZEN__AH4_SEPARATE_WORK') {
    throw new Error('AH-3 stop boundary failed');
  }
  if (summary.forbiddenOperationCounts.assetMutation !== 0 || summary.forbiddenOperationCounts.frontendMutation !== 0 || summary.forbiddenOperationCounts.semanticRecomputation !== 0 || summary.forbiddenOperationCounts.consumerRewrite !== 0) {
    throw new Error('AH-3 forbidden-operation boundary failed');
  }

  for (const record of classification.records) {
    if (record.flags.includes('BASENAME_COLLISION') && record.flags.includes('RESOLVER_COLLISION')) {
      const source = expected.classification.records.find((item) => item.repositoryPath === record.repositoryPath);
      if (!source) throw new Error(`missing classified record ${record.repositoryPath}`);
    }
    if (record.primaryClass === 'UNREFERENCED' && record.referenceCount !== 0) {
      throw new Error(`UNREFERENCED record has references: ${record.repositoryPath}`);
    }
    if (record.primaryClass === 'PROVENANCE_UNKNOWN' && record.traits.verifiedEvidence) {
      throw new Error(`PROVENANCE_UNKNOWN record claims verified evidence: ${record.repositoryPath}`);
    }
  }

  if (mismatches.length) throw new Error(`frozen AH-3 artifacts are stale: ${mismatches.join(', ')}`);

  console.log(JSON.stringify({
    status: summary.status,
    completion: summary.completion,
    freezeState: summary.freezeState,
    coverage: summary.coverage,
    primaryClassCounts: summary.primaryClassCounts,
    flagCounts: summary.flagCounts,
    traitCounts: summary.traitCounts,
    reviewQueueCounts: summary.reviewQueueCounts,
    verifiedEvidenceIndex: summary.verifiedEvidenceIndex,
    reviews: summary.reviews,
    hardErrorCount: summary.hardErrorCount,
    nextStartPoint: summary.nextStartPoint,
  }, null, 2));
}

await main();
