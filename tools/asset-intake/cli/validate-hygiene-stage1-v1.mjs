import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const CONTRACT_PATH = 'tools/asset-intake/contract/hygiene-stage1-inventory.v1.json';

function fail(message) {
  throw new Error(message);
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

async function readJson(repositoryPath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, repositoryPath), 'utf8'));
}

function assertNoClassification(record) {
  const forbidden = [
    'primaryClass',
    'classification',
    'activeVerified',
    'evidenceOnly',
    'generatedDerivative',
    'superseded',
    'unreferenced',
    'provenanceUnknown',
    'deleteCandidate',
  ];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(record, key)) fail(`AH-1 inventory contains forbidden classification field ${key}: ${record.repositoryPath}`);
  }
}

async function main() {
  const contract = await readJson(CONTRACT_PATH);
  const producer = spawnSync(process.execPath, ['tools/asset-intake/cli/run-hygiene-stage1-v1.mjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (producer.status !== 0) {
    process.stdout.write(producer.stdout ?? '');
    process.stderr.write(producer.stderr ?? '');
    fail(`Stage 1 producer failed with exit ${producer.status}`);
  }

  const outputPaths = Object.values(contract.outputs);
  const diff = spawnSync('git', ['diff', '--exit-code', '--', ...outputPaths], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (diff.status !== 0) {
    process.stdout.write(diff.stdout ?? '');
    process.stderr.write(diff.stderr ?? '');
    fail('Committed AH-1 outputs are not deterministic against the frozen baseline');
  }

  const inventory = await readJson(contract.outputs.inventory);
  const duplicates = await readJson(contract.outputs.exactDuplicateGroups);
  const basenames = await readJson(contract.outputs.basenameGroups);
  const summary = await readJson(contract.outputs.summary);

  if (summary.status !== 'PASS_ASSET_HYGIENE_STAGE1_REPOSITORY_INVENTORY') fail(`unexpected summary status: ${summary.status}`);
  if (summary.completion !== 'COMPLETE') fail(`unexpected completion: ${summary.completion}`);
  if (summary.freezeState !== 'ASSET_HYGIENE_STAGE1_INVENTORY_FROZEN') fail(`unexpected freeze state: ${summary.freezeState}`);
  if (summary.hardErrorCount !== 0) fail(`hardErrorCount must be zero: ${summary.hardErrorCount}`);
  if (summary.blockers.length !== 0) fail(`blockers must be zero: ${summary.blockers.length}`);
  if (summary.rawConfigDataReadCount !== 0 || summary.semanticRecomputationCount !== 0 || summary.assetMutationCount !== 0 || summary.classificationCount !== 0) {
    fail('AH-1 boundary counters must remain zero');
  }
  if (inventory.baseline.commit !== contract.baseline.commit || inventory.baseline.tree !== contract.baseline.tree) fail('inventory baseline mismatch');
  if (summary.baseline.commit !== contract.baseline.commit || summary.baseline.tree !== contract.baseline.tree) fail('summary baseline mismatch');

  const regularCoverage = summary.coverage.inventoryRecordCount;
  if (regularCoverage !== summary.coverage.scopedRegularCandidateCount) {
    fail(`regular coverage mismatch: ${regularCoverage} != ${summary.coverage.scopedRegularCandidateCount}`);
  }
  if (inventory.recordCount !== inventory.records.length || inventory.recordCount !== regularCoverage) fail('inventory record count mismatch');
  if (summary.coverage.unreadableBlobCount !== 0 || summary.coverage.byteSizeMismatchCount !== 0) fail('baseline blob diagnostics must be zero');

  const pathSet = new Set();
  const duplicateMembers = new Map();
  const basenameMembers = new Map();
  for (const record of inventory.records) {
    assertNoClassification(record);
    if (pathSet.has(record.repositoryPath)) fail(`duplicate inventory path: ${record.repositoryPath}`);
    pathSet.add(record.repositoryPath);
    if (record.recordStatus === 'SCANNED') {
      if (!/^[0-9a-f]{64}$/.test(record.sha256 ?? '')) fail(`invalid SHA-256: ${record.repositoryPath}`);
    } else if (record.recordStatus === 'LFS_POINTER_UNRESOLVED') {
      if (record.sha256 !== null) fail(`LFS pointer must not use pointer-byte SHA-256 as asset identity: ${record.repositoryPath}`);
    } else {
      fail(`unexpected recordStatus: ${record.recordStatus}`);
    }
    if (record.exactDuplicateGroup) {
      if (!duplicateMembers.has(record.exactDuplicateGroup)) duplicateMembers.set(record.exactDuplicateGroup, []);
      duplicateMembers.get(record.exactDuplicateGroup).push(record.repositoryPath);
    }
    if (record.basenameCollisionGroup) {
      if (!basenameMembers.has(record.basenameCollisionGroup)) basenameMembers.set(record.basenameCollisionGroup, []);
      basenameMembers.get(record.basenameCollisionGroup).push(record.repositoryPath);
    }
  }
  for (const review of inventory.symlinkReviews) {
    assertNoClassification(review);
    if (review.recordStatus !== 'SYMLINK_NOT_FOLLOWED') fail(`unexpected symlink status: ${review.repositoryPath}`);
    if (review.basenameCollisionGroup) {
      if (!basenameMembers.has(review.basenameCollisionGroup)) basenameMembers.set(review.basenameCollisionGroup, []);
      basenameMembers.get(review.basenameCollisionGroup).push(review.repositoryPath);
    }
  }

  if (duplicates.groupCount !== duplicates.groups.length) fail('duplicate group count mismatch');
  if (duplicates.groupCount !== summary.groups.exactDuplicateGroupCount) fail('duplicate summary parity mismatch');
  for (const group of duplicates.groups) {
    if (group.count < 2 || group.count !== group.paths.length) fail(`invalid duplicate group size: ${group.groupId}`);
    const expected = [...(duplicateMembers.get(group.groupId) ?? [])].sort((a, b) => a.localeCompare(b, 'en'));
    const actual = [...group.paths].sort((a, b) => a.localeCompare(b, 'en'));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`duplicate group membership mismatch: ${group.groupId}`);
  }

  if (basenames.groupCount !== basenames.groups.length) fail('basename group count mismatch');
  if (basenames.groupCount !== summary.groups.basenameCollisionGroupCount) fail('basename summary parity mismatch');
  if (basenames.resolverErrorImplied !== false || basenames.candidateOnly !== true) fail('basename groups must remain candidate-only');
  for (const group of basenames.groups) {
    if (group.count < 2 || group.count !== group.members.length) fail(`invalid basename group size: ${group.groupId}`);
    const expected = [...(basenameMembers.get(group.groupId) ?? [])].sort((a, b) => a.localeCompare(b, 'en'));
    const actual = group.members.map((member) => member.repositoryPath).sort((a, b) => a.localeCompare(b, 'en'));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`basename group membership mismatch: ${group.groupId}`);
  }

  const baselineTree = git(['rev-parse', `${contract.baseline.commit}^{tree}`]).trim();
  if (baselineTree !== contract.baseline.tree) fail(`baseline tree changed: ${baselineTree}`);

  console.log(JSON.stringify({
    status: 'PASS_ASSET_HYGIENE_STAGE1_VALIDATOR',
    baseline: contract.baseline,
    recordCount: inventory.recordCount,
    symlinkReviewCount: inventory.symlinkReviews.length,
    exactDuplicateGroupCount: duplicates.groupCount,
    basenameCollisionGroupCount: basenames.groupCount,
    hardErrorCount: 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
