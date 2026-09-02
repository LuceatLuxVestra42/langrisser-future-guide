import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const c0Path = 'tools/evidence-lifecycle/contracts/c0-scope-admission.v1.json';
const c1Path = 'tools/evidence-lifecycle/generated/c1-inventory.v1.json';
const c2ContractPath = 'tools/evidence-lifecycle/contracts/c2-reference-graph.v1.json';
const c2GraphPath = 'tools/evidence-lifecycle/generated/c2-reference-graph.v1.json';
const before = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' });
const c0 = JSON.parse(fs.readFileSync(c0Path, 'utf8'));
const c1Committed = JSON.parse(fs.readFileSync(c1Path, 'utf8'));
const c2Contract = JSON.parse(fs.readFileSync(c2ContractPath, 'utf8'));
const c2Committed = JSON.parse(fs.readFileSync(c2GraphPath, 'utf8'));

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
assert.equal(c2Contract.input.admittedNodeCount, 640);
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
assert.equal(c2Committed.input.admittedNodeCount, 640);
assert.equal(c2Committed.authorityBoundary.semanticReopen, false);
assert.equal(c2Committed.authorityBoundary.rawSemanticRecomputationCount, 0);
assert.equal(c2Committed.authorityBoundary.inferredReferenceCount, 0);
assert.equal(c2Committed.referenceSourceObservation.criticalJsonParseErrorCount, 0);
assert.equal(c2Committed.summary.admittedNodeCount, 640);
assert.equal(c2Committed.summary.edgeCount, c2Committed.edges.length);
assert.equal(c2Committed.summary.protectingEdgeCount + c2Committed.summary.informationalEdgeCount, c2Committed.summary.edgeCount);
assert.equal(c2Committed.summary.referencedNodeCount + c2Committed.summary.zeroReferenceNodeCount, 640);
assert.equal(c2Committed.summary.protectingReferencedNodeCount + c2Committed.summary.zeroProtectingReferenceNodeCount, 640);
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

const after = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' });
assert.equal(after, before, 'evidence-lifecycle validator must not mutate tracked repository state');
console.log(JSON.stringify({
  status: 'PASS',
  completion: 'C2_REFERENCE_GRAPH_COMPLETE',
  c1Summary: c1Committed.summary,
  c2Summary: c2Committed.summary,
  graphDigest: c2Committed.graphDigest,
}, null, 2));
