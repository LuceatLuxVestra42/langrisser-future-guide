import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const c0Path = 'tools/evidence-lifecycle/contracts/c0-scope-admission.v1.json';
const c1Path = 'tools/evidence-lifecycle/generated/c1-inventory.v1.json';
const c2Path = 'tools/evidence-lifecycle/generated/c2-reference-graph.v1.json';
const c3Path = 'tools/evidence-lifecycle/generated/c3-lifecycle-classification.v1.json';
const contractPath = 'tools/evidence-lifecycle/contracts/c4-retention-freeze.v1.json';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const c0 = readJson(c0Path);
const c1 = readJson(c1Path);
const c2 = readJson(c2Path);
const c3 = readJson(c3Path);
const contract = readJson(contractPath);

assert.equal(contract.schemaId, 'evidence-lifecycle-c4-retention-freeze-contract/v1');
assert.equal(contract.status, 'DESIGN_FROZEN');
assert.equal(contract.completion, 'COMPLETE');
assert.equal(contract.baseline.sha, c0.baseline.sha);
assert.equal(contract.input.c1InventoryDigest, c1.inventoryDigest.value);
assert.equal(contract.input.c2GraphDigest, c2.graphDigest.value);
assert.equal(contract.input.c3ClassificationDigest, c3.classificationDigest.value);
assert.equal(contract.input.admittedNodeCount, c1.summary.admittedCount);
assert.equal(c3.summary.classifiedNodeCount, c1.summary.admittedCount);
assert.equal(c3.records.length, c1.summary.admittedCount);

const lifecycleToPartition = new Map();
for (const [partition, lifecycles] of Object.entries(contract.partitions)) {
  for (const lifecycle of lifecycles) {
    assert.equal(lifecycleToPartition.has(lifecycle), false, `lifecycle appears in more than one C4 partition: ${lifecycle}`);
    lifecycleToPartition.set(lifecycle, partition);
  }
}

const expectedLifecycle = new Set([
  'ACTIVE_AUTHORITY',
  'ACTIVE_OPERATIONAL',
  'RETENTION_PREDECESSOR',
  'RETENTION_PROVENANCE',
  'RETENTION_HISTORICAL',
  'EXPLICITLY_SUPERSEDED',
  'UNREFERENCED_REVIEW',
]);
assert.deepEqual(new Set(lifecycleToPartition.keys()), expectedLifecycle);

const records = c3.records
  .map((record) => {
    const partition = lifecycleToPartition.get(record.primaryLifecycle);
    assert.ok(partition, `unpartitioned C3 lifecycle: ${record.path} ${record.primaryLifecycle}`);
    return {
      path: record.path,
      scopeAdmissionRole: record.scopeAdmissionRole,
      primaryLifecycle: record.primaryLifecycle,
      partition,
      protectingReferenceCount: record.protectingReferenceCount,
      informationalReferenceCount: record.informationalReferenceCount,
      totalReferenceCount: record.totalReferenceCount,
      classificationBasisCount: record.classificationBasis.length,
      secondaryReasonCount: record.secondaryReasons.length,
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const partitionCounts = {
  PROTECTED_CURRENT: 0,
  PROTECTED_RETENTION: 0,
  RETIREMENT_REVIEW: 0,
};
for (const record of records) partitionCounts[record.partition] += 1;

const uniquePaths = new Set(records.map((record) => record.path));
const unpartitionedCount = records.filter((record) => !record.partition).length;
const overlapCount = records.length - uniquePaths.size;
const hardErrorCount = unpartitionedCount + overlapCount;

assert.equal(records.length, c1.summary.admittedCount);
assert.equal(uniquePaths.size, c1.summary.admittedCount);
assert.equal(unpartitionedCount, 0);
assert.equal(overlapCount, 0);
assert.equal(hardErrorCount, 0);

const partitionDigestValue = sha256(JSON.stringify(records));
const output = {
  version: 1,
  schemaId: 'evidence-lifecycle-c4-retention-freeze/v1',
  stage: 'C4 - Retention / Current Admission Freeze',
  status: partitionCounts.RETIREMENT_REVIEW > 0 ? 'PASS_WITH_REVIEW' : 'PASS',
  completion: 'COMPLETE',
  freezeState: 'C4_RETENTION_FROZEN',
  foundationState: 'C_FOUNDATION_COMPLETE',
  baseline: {
    branch: c0.baseline.branch,
    sha: c0.baseline.sha,
  },
  input: {
    c0Contract: c0Path,
    c1Inventory: c1Path,
    c1InventoryDigest: c1.inventoryDigest.value,
    c2ReferenceGraph: c2Path,
    c2GraphDigest: c2.graphDigest.value,
    c3Classification: c3Path,
    c3ClassificationDigest: c3.classificationDigest.value,
    c4Contract: contractPath,
    admittedNodeCount: c1.summary.admittedCount,
    retentionPolicyVersion: contract.input.retentionPolicyVersion,
  },
  authorityBoundary: {
    semanticReopen: false,
    lifecycleReclassificationCount: 0,
    rawSemanticRecomputationCount: 0,
    destructiveDecisionCount: 0,
    deletionApprovalCount: 0,
  },
  summary: {
    admittedNodeCount: c1.summary.admittedCount,
    partitionedNodeCount: records.length,
    partitionCounts,
    protectedCurrentCount: partitionCounts.PROTECTED_CURRENT,
    protectedRetentionCount: partitionCounts.PROTECTED_RETENTION,
    retirementReviewCount: partitionCounts.RETIREMENT_REVIEW,
    overlapCount,
    unpartitionedCount,
    hardErrorCount,
  },
  policy: {
    partitionSource: 'C3_PRIMARY_LIFECYCLE_ONLY',
    secondaryReasonsDoNotChangePartition: true,
    protectingReferenceCountDoesNotDirectlyChoosePartition: true,
    retirementReviewDoesNotMeanUnused: true,
    retirementReviewDoesNotMeanDelete: true,
    unreferencedReviewDoesNotMeanDelete: true,
    c4DoesNotReclassifyLifecycle: true,
    c4DoesNotDecideDeletionEligibility: true,
  },
  freezeBundle: {
    baselineSha: c0.baseline.sha,
    inventoryDigest: c1.inventoryDigest.value,
    referenceGraphDigest: c2.graphDigest.value,
    classificationDigest: c3.classificationDigest.value,
    retentionPolicyVersion: contract.input.retentionPolicyVersion,
    retentionPartitionDigest: partitionDigestValue,
  },
  retentionPartitionDigest: {
    algorithm: 'sha256',
    value: partitionDigestValue,
    canonicalization: 'JSON.stringify(sorted-retention-partition-record-array)',
  },
  records,
  handoff: {
    currentOwnerComplete: true,
    blockerCount: 0,
    nextOwner: contract.nextOwner,
    nextStartPoint: contract.nextStartPoint,
  },
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
