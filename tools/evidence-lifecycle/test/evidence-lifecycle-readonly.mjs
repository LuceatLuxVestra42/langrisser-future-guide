import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const c0Path = 'tools/evidence-lifecycle/contracts/c0-scope-admission.v1.json';
const c1Path = 'tools/evidence-lifecycle/generated/c1-inventory.v1.json';
const before = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' });
const c0 = JSON.parse(fs.readFileSync(c0Path, 'utf8'));
const committed = JSON.parse(fs.readFileSync(c1Path, 'utf8'));

assert.equal(c0.schemaId, 'evidence-lifecycle-c0-scope-admission/v1');
assert.equal(c0.status, 'DESIGN_FROZEN');
assert.equal(c0.completion, 'COMPLETE');
assert.equal(c0.freezeState, 'C0_SCOPE_ADMISSION_FROZEN');
assert.equal(c0.semanticReopen, false);
assert.equal(c0.ownerResolution.unmatchedPath, 'MANUAL_REVIEW');
assert.equal(c0.outputOwnership.ownerId, 'evidence-lifecycle');
assert.equal(c0.outputOwnership.validatorId, 'evidence-lifecycle-readonly');

const regeneratedText = execFileSync('node', ['tools/evidence-lifecycle/cli/c1-inventory.mjs', '--stdout'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const regenerated = JSON.parse(regeneratedText);
assert.deepEqual(committed, regenerated);
assert.equal(committed.schemaId, 'evidence-lifecycle-c1-inventory/v1');
assert.equal(committed.completion, 'COMPLETE');
assert.equal(committed.freezeState, 'C1_INVENTORY_COMPLETE');
assert.equal(committed.authorityBoundary.semanticReopen, false);
assert.equal(committed.authorityBoundary.rawSemanticRecomputationCount, 0);
assert.equal(committed.summary.jsonParseErrorCount, 0);
assert.equal(committed.summary.exactPathHistoryMissingCount, 0);
assert.equal(committed.summary.candidateCount, committed.records.length);
assert.equal(committed.summary.admittedCount + committed.summary.manualReviewAdmissionCount, committed.summary.candidateCount);
assert.ok(committed.records.every(record => Array.isArray(record.projectCheckOwners)));
assert.ok(committed.records.every(record => Array.isArray(record.projectCheckOwnerRuleIds)));
assert.ok(committed.records.every(record => record.firstCommit && record.lastCommit));

const after = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' });
assert.equal(after, before, 'evidence-lifecycle validator must not mutate tracked repository state');
console.log(JSON.stringify({ status: 'PASS', completion: 'C1_INVENTORY_COMPLETE', summary: committed.summary }, null, 2));
