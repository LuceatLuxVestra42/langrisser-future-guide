import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const c0Path = 'tools/evidence-lifecycle/contracts/c0-scope-admission.v1.json';
const c1Path = 'tools/evidence-lifecycle/generated/c1-inventory.v1.json';
const c2ContractPath = 'tools/evidence-lifecycle/contracts/c2-reference-graph.v1.json';
const c2GraphPath = 'tools/evidence-lifecycle/generated/c2-reference-graph.v1.json';
const c3ContractPath = 'tools/evidence-lifecycle/contracts/c3-lifecycle-classification.v1.json';
const c3ClassificationPath = 'tools/evidence-lifecycle/generated/c3-lifecycle-classification.v1.json';
const before = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' });
const c0 = JSON.parse(fs.readFileSync(c0Path, 'utf8'));
const c1Committed = JSON.parse(fs.readFileSync(c1Path, 'utf8'));
const c2Contract = JSON.parse(fs.readFileSync(c2ContractPath, 'utf8'));
const c2Committed = JSON.parse(fs.readFileSync(c2GraphPath, 'utf8'));
const c3Contract = JSON.parse(fs.readFileSync(c3ContractPath, 'utf8'));
const c3Committed = JSON.parse(fs.readFileSync(c3ClassificationPath, 'utf8'));

assert.equal(c0.schemaId, 'evidence-lifecycle-c0-scope-admission/v1');
assert.equal(c0.status, 'DESIGN_FROZEN');
assert.equal(c0.completion, 'COMPLETE');
assert.equal(c0.freezeState, 'C0_SCOPE_ADMISSION_FROZEN');
assert.equal(c0.semanticReopen, false);
assert.equal(c0.ownerResolution.unmatchedPath, 'MANUAL_REVIEW');
assert.equal(c0.outputOwnership.ownerId, 'evidence-lifecycle');
assert.equal(c0.outputOwnership.validatorId, 'evidence-lifecycle-readonly');

const c1RegeneratedText = execFileSync('node', ['tools/evidence-lifecycle/cli/c1-inventory.mjs', '--stdout'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const c1Regenerated = JSON.parse(c1RegeneratedText);
assert.deepEqual(c1Committed, c1Regenerated);
assert.equal(c1Committed.schemaId, 'evidence-lifecycle-c1-inventory/v1');
assert.equal(c1Committed.completion, 'COMPLETE');
assert.equal(c1Committed.freezeState, 'C1_INVENTORY_COMPLETE');
assert.equal(c1Committed.authorityBoundary.semanticReopen, false);
assert.equal(c1Committed.authorityBoundary.rawSemanticRecomputationCount, 0);
assert.equal(c1Committed.summary.jsonParseErrorCount, 0);
assert.equal(c1Committed.summary.exactPathHistoryMissingCount, 0);
assert.equal(c1Committed.summary.candidateCount, c1Committed.records.length);
assert.equal(c1Committed.summary.admittedCount + c1Committed.summary.manualReviewAdmissionCount, c1Committed.summary.candidateCount);
assert.ok(c1Committed.records.every(record => Array.isArray(record.projectCheckOwners)));
assert.ok(c1Committed.records.every(record => Array.isArray(record.projectCheckOwnerRuleIds)));
assert.ok(c1Committed.records.every(record => record.firstCommit && record.lastCommit));

assert.equal(c2Contract.schemaId, 'evidence-lifecycle-c2-reference-graph-contract/v1');
assert.equal(c2Contract.status, 'DESIGN_FROZEN');
assert.equal(c2Contract.completion, 'COMPLETE');
assert.equal(c2Contract.freezeState, 'C2_REFERENCE_GRAPH_CONTRACT_FROZEN');
assert.equal(c2Contract.baseline.sha, c0.baseline.sha);
assert.equal(c2Contract.input.c1InventoryDigest, c1Committed.inventoryDigest.value);
assert.equal(c2Contract.input.admittedNodeCount, c1Committed.summary.admittedCount);
assert.equal(c2Contract.completionCriteria.inferredReferenceCount, 0);
assert.equal(c2Contract.completionCriteria.semanticReopen, false);
assert.equal(c2Contract.completionCriteria.trackedMutationAfterValidationAllowed, false);

const c2RegeneratedText = execFileSync('node', ['tools/evidence-lifecycle/cli/c2-reference-graph.mjs'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const c2Regenerated = JSON.parse(c2RegeneratedText);
assert.deepEqual(c2Committed, c2Regenerated);
assert.equal(c2Committed.schemaId, 'evidence-lifecycle-c2-reference-graph/v1');
assert.equal(c2Committed.status, 'PASS_WITH_REVIEW');
assert.equal(c2Committed.completion, 'COMPLETE');
assert.equal(c2Committed.freezeState, 'C2_REFERENCE_GRAPH_COMPLETE');
assert.equal(c2Committed.baseline.sha, c0.baseline.sha);
assert.equal(c2Committed.input.admittedNodeCount, c1Committed.summary.admittedCount);
assert.equal(c2Committed.authorityBoundary.semanticReopen, false);
assert.equal(c2Committed.authorityBoundary.rawSemanticRecomputationCount, 0);
assert.equal(c2Committed.authorityBoundary.inferredReferenceCount, 0);
assert.equal(c2Committed.referenceSourceObservation.criticalJsonParseErrorCount, 0);
assert.equal(c2Committed.summary.admittedNodeCount, c1Committed.summary.admittedCount);
assert.equal(c2Committed.summary.edgeCount, c2Committed.edges.length);
assert.equal(c2Committed.summary.protectingEdgeCount + c2Committed.summary.informationalEdgeCount, c2Committed.summary.edgeCount);
assert.equal(c2Committed.summary.referencedNodeCount + c2Committed.summary.zeroReferenceNodeCount, c1Committed.summary.admittedCount);
assert.equal(c2Committed.summary.protectingReferencedNodeCount + c2Committed.summary.zeroProtectingReferenceNodeCount, c1Committed.summary.admittedCount);
assert.ok(c2Committed.edges.every(edge => edge.explicit === true));
assert.ok(c2Committed.edges.every(edge => ['PROTECTING', 'INFORMATIONAL'].includes(edge.retentionClass)));
assert.ok(c2Committed.edges.every(edge => typeof edge.edgeType === 'string' && edge.edgeType.length > 0));
assert.ok(c2Committed.edges.every(edge => typeof edge.sourceFieldOrLocator === 'string' && edge.sourceFieldOrLocator.length > 0));
assert.ok(c2Committed.edges.filter(edge => edge.edgeType === 'VALIDATOR_ROUTING_FIXTURE').every(edge => edge.retentionClass === 'INFORMATIONAL'));
assert.ok(c2Committed.edges.filter(edge => edge.edgeType === 'MANIFEST_REF').every(edge => edge.retentionClass === 'PROTECTING'));
assert.equal(c2Committed.policy.zeroProtectingReferencesDoesNotMeanUnused, true);
assert.equal(c2Committed.policy.zeroProtectingReferencesDoesNotMeanDelete, true);
assert.equal(c2Committed.policy.c2DoesNotClassifyLifecycle, true);
assert.equal(c2Committed.policy.c2DoesNotDecideDeletionEligibility, true);

assert.equal(c3Contract.schemaId, 'evidence-lifecycle-c3-lifecycle-classification-contract/v1');
assert.equal(c3Contract.status, 'DESIGN_FROZEN');
assert.equal(c3Contract.completion, 'COMPLETE');
assert.equal(c3Contract.freezeState, 'C3_LIFECYCLE_CLASSIFICATION_CONTRACT_FROZEN');
assert.equal(c3Contract.baseline.sha, c0.baseline.sha);
assert.equal(c3Contract.input.c1InventoryDigest, c1Committed.inventoryDigest.value);
assert.equal(c3Contract.input.c2GraphDigest, c2Committed.graphDigest.value);
assert.equal(c3Contract.input.admittedNodeCount, c1Committed.summary.admittedCount);
assert.equal(c3Contract.completionCriteria.admittedPopulationParity, c1Committed.summary.admittedCount);
assert.equal(c3Contract.completionCriteria.classifiedPopulationParity, c1Committed.summary.admittedCount);
assert.equal(c3Contract.completionCriteria.unclassifiedCount, 0);
assert.equal(c3Contract.completionCriteria.multiplePrimaryLifecycleCount, 0);
assert.equal(c3Contract.completionCriteria.classificationBasisMissingCount, 0);
assert.equal(c3Contract.completionCriteria.unreferencedReviewWithProtectingReferenceCount, 0);
assert.equal(c3Contract.completionCriteria.semanticReopen, false);
assert.equal(c3Contract.completionCriteria.destructiveDecisionCount, 0);
assert.equal(c3Contract.completionCriteria.trackedMutationAfterValidationAllowed, false);

const c3RegeneratedText = execFileSync('node', ['tools/evidence-lifecycle/cli/c3-lifecycle-classification.mjs'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const c3Regenerated = JSON.parse(c3RegeneratedText);
assert.deepEqual(c3Committed, c3Regenerated);
assert.equal(c3Committed.schemaId, 'evidence-lifecycle-c3-lifecycle-classification/v1');
assert.ok(['PASS', 'PASS_WITH_REVIEW'].includes(c3Committed.status));
assert.equal(c3Committed.completion, 'COMPLETE');
assert.equal(c3Committed.freezeState, 'C3_LIFECYCLE_CLASSIFICATION_COMPLETE');
assert.equal(c3Committed.baseline.sha, c0.baseline.sha);
assert.equal(c3Committed.input.c1InventoryDigest, c1Committed.inventoryDigest.value);
assert.equal(c3Committed.input.c2GraphDigest, c2Committed.graphDigest.value);
assert.equal(c3Committed.input.admittedNodeCount, c1Committed.summary.admittedCount);
assert.equal(c3Committed.authorityBoundary.semanticReopen, false);
assert.equal(c3Committed.authorityBoundary.rawSemanticRecomputationCount, 0);
assert.equal(c3Committed.authorityBoundary.destructiveDecisionCount, 0);
assert.equal(c3Committed.authorityBoundary.filenameSimilarityInferenceCount, 0);
assert.equal(c3Committed.authorityBoundary.stageOrderingInferenceCount, 0);
assert.equal(c3Committed.authorityBoundary.chronologyInferenceCount, 0);
assert.equal(c3Committed.authorityBoundary.nameJoinInferenceCount, 0);
assert.equal(c3Committed.authorityBoundary.idArithmeticInferenceCount, 0);

const admittedC1Paths = c1Committed.records
  .filter(record => record.admissionStatus === 'ADMITTED')
  .map(record => record.path)
  .sort();
const c3Paths = c3Committed.records.map(record => record.path).sort();
assert.equal(admittedC1Paths.length, c1Committed.summary.admittedCount);
assert.equal(c3Committed.records.length, c1Committed.summary.admittedCount);
assert.deepEqual(c3Paths, admittedC1Paths);
assert.equal(new Set(c3Paths).size, c1Committed.summary.admittedCount);

const allowedLifecycle = new Set(c3Contract.primaryLifecycle);
const allowedBasisKind = new Set(c3Contract.classificationBasisSchema.allowedKinds);
assert.equal(allowedLifecycle.size, 7);
assert.deepEqual(c3Contract.precedence, c3Contract.primaryLifecycle);
for (const record of c3Committed.records) {
  assert.ok(allowedLifecycle.has(record.primaryLifecycle), `invalid C3 primary lifecycle for ${record.path}`);
  assert.ok(Number.isInteger(record.protectingReferenceCount) && record.protectingReferenceCount >= 0, `invalid protectingReferenceCount for ${record.path}`);
  assert.ok(Array.isArray(record.classificationBasis) && record.classificationBasis.length > 0, `missing classificationBasis for ${record.path}`);
  for (const basis of record.classificationBasis) {
    assert.ok(allowedBasisKind.has(basis.kind), `invalid C3 basis kind for ${record.path}`);
    assert.ok(typeof basis.source === 'string' && basis.source.length > 0, `invalid C3 basis source for ${record.path}`);
    assert.ok(typeof basis.detail === 'string' && basis.detail.length > 0, `invalid C3 basis detail for ${record.path}`);
  }
  assert.ok(Array.isArray(record.secondaryReasons), `secondaryReasons must be an array for ${record.path}`);
  for (const reason of record.secondaryReasons) {
    assert.ok(allowedLifecycle.has(reason.lifecycle), `invalid secondary lifecycle for ${record.path}`);
    assert.notEqual(reason.lifecycle, record.primaryLifecycle, `secondary lifecycle duplicates primary for ${record.path}`);
    assert.ok(Array.isArray(reason.basis) && reason.basis.length > 0, `missing secondary basis for ${record.path}`);
    for (const basis of reason.basis) {
      assert.ok(allowedBasisKind.has(basis.kind), `invalid secondary basis kind for ${record.path}`);
      assert.ok(typeof basis.source === 'string' && basis.source.length > 0, `invalid secondary basis source for ${record.path}`);
      assert.ok(typeof basis.detail === 'string' && basis.detail.length > 0, `invalid secondary basis detail for ${record.path}`);
    }
  }
  if (record.primaryLifecycle === 'UNREFERENCED_REVIEW') {
    assert.equal(record.protectingReferenceCount, 0, `protecting node cannot fall through to UNREFERENCED_REVIEW: ${record.path}`);
  }
}

const lifecycleCountSum = Object.values(c3Committed.summary.primaryLifecycleCounts).reduce((sum, count) => sum + count, 0);
assert.equal(c3Committed.summary.admittedNodeCount, c1Committed.summary.admittedCount);
assert.equal(c3Committed.summary.classifiedNodeCount, c1Committed.summary.admittedCount);
assert.equal(lifecycleCountSum, c1Committed.summary.admittedCount);
assert.equal(c3Committed.summary.unclassifiedCount, 0);
assert.equal(c3Committed.summary.multiplePrimaryLifecycleCount, 0);
assert.equal(c3Committed.summary.classificationBasisMissingCount, 0);
assert.equal(c3Committed.summary.unreferencedReviewWithProtectingReferenceCount, 0);
assert.equal(c3Committed.summary.hardErrorCount, 0);
assert.equal(c3Committed.summary.unreferencedReviewCount, c3Committed.summary.primaryLifecycleCounts.UNREFERENCED_REVIEW ?? 0);
assert.equal(c3Committed.status, c3Committed.summary.unreferencedReviewCount > 0 ? 'PASS_WITH_REVIEW' : 'PASS');
assert.equal(c3Committed.policy.totalReferenceCountDoesNotDriveLifecycle, true);
assert.equal(c3Committed.policy.informationalReferenceDoesNotProtect, true);
assert.equal(c3Committed.policy.zeroProtectingReferenceDoesNotMeanUnused, true);
assert.equal(c3Committed.policy.zeroProtectingReferenceDoesNotMeanDelete, true);
assert.equal(c3Committed.policy.unreferencedReviewDoesNotMeanDelete, true);
assert.equal(c3Committed.policy.c3DoesNotFreezeRetentionPartition, true);
assert.equal(c3Committed.policy.c3DoesNotDecideDeletionEligibility, true);

const expectedClassificationDigest = crypto.createHash('sha256').update(JSON.stringify(c3Committed.records)).digest('hex');
assert.equal(c3Committed.classificationDigest.algorithm, 'sha256');
assert.equal(c3Committed.classificationDigest.value, expectedClassificationDigest);

const after = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' });
assert.equal(after, before, 'evidence-lifecycle validator must not mutate tracked repository state');
console.log(JSON.stringify({
  status: 'PASS',
  completion: 'C3_LIFECYCLE_CLASSIFICATION_COMPLETE',
  c1Summary: c1Committed.summary,
  c2Summary: c2Committed.summary,
  c3Summary: c3Committed.summary,
  graphDigest: c2Committed.graphDigest,
  classificationDigest: c3Committed.classificationDigest,
}, null, 2));
