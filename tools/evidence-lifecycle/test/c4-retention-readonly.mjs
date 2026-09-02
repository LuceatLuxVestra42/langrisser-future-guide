import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const c0Path = 'tools/evidence-lifecycle/contracts/c0-scope-admission.v1.json';
const c1Path = 'tools/evidence-lifecycle/generated/c1-inventory.v1.json';
const c2Path = 'tools/evidence-lifecycle/generated/c2-reference-graph.v1.json';
const c3Path = 'tools/evidence-lifecycle/generated/c3-lifecycle-classification.v1.json';
const c4ContractPath = 'tools/evidence-lifecycle/contracts/c4-retention-freeze.v1.json';
const c4Path = 'tools/evidence-lifecycle/generated/c4-retention-freeze.v1.json';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const before = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' });
const c0 = readJson(c0Path);
const c1 = readJson(c1Path);
const c2 = readJson(c2Path);
const c3 = readJson(c3Path);
const contract = readJson(c4ContractPath);
const committed = readJson(c4Path);

assert.equal(contract.schemaId, 'evidence-lifecycle-c4-retention-freeze-contract/v1');
assert.equal(contract.status, 'DESIGN_FROZEN');
assert.equal(contract.completion, 'COMPLETE');
assert.equal(contract.freezeState, 'C4_RETENTION_CONTRACT_FROZEN');
assert.equal(contract.baseline.sha, c0.baseline.sha);
assert.equal(contract.input.c1InventoryDigest, c1.inventoryDigest.value);
assert.equal(contract.input.c2GraphDigest, c2.graphDigest.value);
assert.equal(contract.input.c3ClassificationDigest, c3.classificationDigest.value);
assert.equal(contract.input.admittedNodeCount, c1.summary.admittedCount);
assert.equal(contract.completionCriteria.admittedPopulationParity, c1.summary.admittedCount);
assert.equal(contract.completionCriteria.partitionedPopulationParity, c1.summary.admittedCount);
assert.equal(contract.completionCriteria.overlapCount, 0);
assert.equal(contract.completionCriteria.unpartitionedCount, 0);
assert.equal(contract.completionCriteria.hardErrorCount, 0);
assert.equal(contract.completionCriteria.semanticReopen, false);
assert.equal(contract.completionCriteria.destructiveDecisionCount, 0);
assert.equal(contract.completionCriteria.trackedMutationAfterValidationAllowed, false);
assert.equal(contract.foundation.completeWhenC4Passes, true);
assert.equal(contract.foundation.completionState, 'C_FOUNDATION_COMPLETE');

const regenerated = JSON.parse(execFileSync('node', ['tools/evidence-lifecycle/cli/c4-retention-freeze.mjs'], {
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
}));
assert.deepEqual(committed, regenerated);
assert.equal(committed.schemaId, 'evidence-lifecycle-c4-retention-freeze/v1');
assert.ok(['PASS', 'PASS_WITH_REVIEW'].includes(committed.status));
assert.equal(committed.completion, 'COMPLETE');
assert.equal(committed.freezeState, 'C4_RETENTION_FROZEN');
assert.equal(committed.foundationState, 'C_FOUNDATION_COMPLETE');
assert.equal(committed.baseline.sha, c0.baseline.sha);
assert.equal(committed.input.c1InventoryDigest, c1.inventoryDigest.value);
assert.equal(committed.input.c2GraphDigest, c2.graphDigest.value);
assert.equal(committed.input.c3ClassificationDigest, c3.classificationDigest.value);
assert.equal(committed.input.admittedNodeCount, c1.summary.admittedCount);
assert.equal(committed.authorityBoundary.semanticReopen, false);
assert.equal(committed.authorityBoundary.lifecycleReclassificationCount, 0);
assert.equal(committed.authorityBoundary.rawSemanticRecomputationCount, 0);
assert.equal(committed.authorityBoundary.destructiveDecisionCount, 0);
assert.equal(committed.authorityBoundary.deletionApprovalCount, 0);

const partitionNames = new Set(['PROTECTED_CURRENT', 'PROTECTED_RETENTION', 'RETIREMENT_REVIEW']);
const lifecycleToPartition = new Map();
for (const [partition, lifecycles] of Object.entries(contract.partitions)) {
  assert.ok(partitionNames.has(partition));
  for (const lifecycle of lifecycles) {
    assert.equal(lifecycleToPartition.has(lifecycle), false, `duplicate C4 lifecycle partition mapping: ${lifecycle}`);
    lifecycleToPartition.set(lifecycle, partition);
  }
}
assert.equal(lifecycleToPartition.size, 7);

const c3ByPath = new Map(c3.records.map((record) => [record.path, record]));
assert.equal(committed.records.length, c1.summary.admittedCount);
assert.equal(new Set(committed.records.map((record) => record.path)).size, c1.summary.admittedCount);
for (const record of committed.records) {
  assert.ok(partitionNames.has(record.partition), `invalid C4 partition for ${record.path}`);
  const c3Record = c3ByPath.get(record.path);
  assert.ok(c3Record, `C4 path missing from C3: ${record.path}`);
  assert.equal(record.primaryLifecycle, c3Record.primaryLifecycle);
  assert.equal(record.partition, lifecycleToPartition.get(c3Record.primaryLifecycle));
  assert.equal(record.scopeAdmissionRole, c3Record.scopeAdmissionRole);
  assert.equal(record.protectingReferenceCount, c3Record.protectingReferenceCount);
}

const expectedCounts = { PROTECTED_CURRENT: 0, PROTECTED_RETENTION: 0, RETIREMENT_REVIEW: 0 };
for (const c3Record of c3.records) expectedCounts[lifecycleToPartition.get(c3Record.primaryLifecycle)] += 1;
assert.deepEqual(committed.summary.partitionCounts, expectedCounts);
assert.equal(committed.summary.admittedNodeCount, c1.summary.admittedCount);
assert.equal(committed.summary.partitionedNodeCount, c1.summary.admittedCount);
assert.equal(committed.summary.protectedCurrentCount, expectedCounts.PROTECTED_CURRENT);
assert.equal(committed.summary.protectedRetentionCount, expectedCounts.PROTECTED_RETENTION);
assert.equal(committed.summary.retirementReviewCount, expectedCounts.RETIREMENT_REVIEW);
assert.equal(committed.summary.overlapCount, 0);
assert.equal(committed.summary.unpartitionedCount, 0);
assert.equal(committed.summary.hardErrorCount, 0);
assert.equal(committed.status, expectedCounts.RETIREMENT_REVIEW > 0 ? 'PASS_WITH_REVIEW' : 'PASS');

assert.equal(committed.policy.partitionSource, 'C3_PRIMARY_LIFECYCLE_ONLY');
assert.equal(committed.policy.secondaryReasonsDoNotChangePartition, true);
assert.equal(committed.policy.retirementReviewDoesNotMeanUnused, true);
assert.equal(committed.policy.retirementReviewDoesNotMeanDelete, true);
assert.equal(committed.policy.unreferencedReviewDoesNotMeanDelete, true);
assert.equal(committed.policy.c4DoesNotReclassifyLifecycle, true);
assert.equal(committed.policy.c4DoesNotDecideDeletionEligibility, true);

assert.equal(committed.freezeBundle.baselineSha, c0.baseline.sha);
assert.equal(committed.freezeBundle.inventoryDigest, c1.inventoryDigest.value);
assert.equal(committed.freezeBundle.referenceGraphDigest, c2.graphDigest.value);
assert.equal(committed.freezeBundle.classificationDigest, c3.classificationDigest.value);
assert.equal(committed.freezeBundle.retentionPolicyVersion, contract.input.retentionPolicyVersion);
const expectedPartitionDigest = crypto.createHash('sha256').update(JSON.stringify(committed.records)).digest('hex');
assert.equal(committed.retentionPartitionDigest.algorithm, 'sha256');
assert.equal(committed.retentionPartitionDigest.value, expectedPartitionDigest);
assert.equal(committed.freezeBundle.retentionPartitionDigest, expectedPartitionDigest);

const after = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' });
assert.equal(after, before, 'C4 validator must not mutate tracked repository state');

console.log(JSON.stringify({
  status: 'PASS',
  completion: 'C4_RETENTION_FROZEN',
  foundation: 'C_FOUNDATION_COMPLETE',
  summary: committed.summary,
  freezeBundle: committed.freezeBundle,
}, null, 2));
