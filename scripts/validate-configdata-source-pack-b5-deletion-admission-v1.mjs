import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executeProjectCheck,
  loadProjectCheckContracts,
  routeProjectCheckPaths,
} from '../tools/project-check/lib/project-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT_PATH = 'data/contracts/configdata-source-pack-deletion-admission.v1.json';
const SOURCE_PACK_PATH = 'data/contracts/configdata-source-pack-contract.v1.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function git(args) {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${String(result.stderr ?? '').trim()}`);
  return String(result.stdout ?? '').trim();
}

function listDeletionPaths(sourceCommitSha) {
  const output = git(['ls-tree', '-r', '--name-only', sourceCommitSha, '--', 'data/configdata']);
  const paths = output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => /^data\/configdata\/[^/]+\.json$/.test(item))
    .sort();
  assert.equal(new Set(paths).size, paths.length, 'B5 deletion path set must be unique');
  return paths;
}

function validateContract(contract, sourcePack) {
  assert.equal(contract.version, 1);
  assert.equal(contract.schemaId, 'configdata-source-pack-deletion-admission/v1');
  assert.equal(contract.stage, 'repository-size-reduction-B5');
  assert.equal(contract.status, 'PASS');
  assert.equal(contract.completion, 'CONFIGDATA_SOURCE_PACK_B5_DELETION_ADMISSION_COMPLETE');
  assert.equal(contract.owner, 'configdata-source-pack');
  assert.deepEqual(contract.supportingOwners, ['configdata', 'project-check']);

  assert.equal(sourcePack.version, 1);
  assert.equal(sourcePack.contract, 'configdata-source-pack');
  assert.equal(sourcePack.stage, 'repository-size-reduction-B2');
  assert.equal(sourcePack.status, 'PASS');
  assert.equal(sourcePack.owner, 'configdata-source-pack');
  assert.equal(sourcePack.coverage.fileCount, 753);
  assert.equal(sourcePack.coverage.missingCount, 0);
  assert.equal(sourcePack.coverage.extraCount, 0);
  assert.equal(sourcePack.coverage.duplicatePathCount, 0);
  assert.equal(sourcePack.authority.logicalRawPathNamespace, 'data/configdata');
  assert.equal(sourcePack.storage.immutabilityPolicy, 'CONTENT_HASH_PINNED_FAIL_CLOSED');

  const admission = contract.deletionAdmission;
  assert.equal(admission.trackedRawPattern, 'data/configdata/*.json');
  assert.equal(admission.preDeletionTrackedRawJsonCount, sourcePack.coverage.fileCount);
  assert.equal(admission.admittedDeletionCount, sourcePack.coverage.fileCount);
  assert.equal(admission.postDeletionTrackedRawJsonCount, 0);
  assert.equal(admission.atomicFullSetDeletionRequired, true);
  assert.equal(admission.partialTrackedDeletionAllowed, false);
  assert.equal(admission.deletionOccursInThisStage, false);
  assert.equal(admission.deletionStage, 'B6');
  assert.equal(admission.allDeletionPathsMustRouteWithoutManualReview, true);
  assert.deepEqual(admission.requiredStorageOwners, ['configdata', 'configdata-source-pack']);
  assert.deepEqual(admission.requiredValidators, ['configdata-source-pack-boundary', 'configdata-integrity']);
  assert.equal(admission.domainSpecificExistingRulesRemainAdditive, true);
  assert.equal(admission.orchestrationSpecialCaseIntroduced, false);
  assert.equal(admission.ownerPropagation, false);
  assert.equal(admission.changeClassFanOut, false);
  assert.equal(admission.semanticReopenOnStorageDeletion, false);

  const readiness = contract.validatorReadiness;
  assert.equal(readiness.configDataIntegrityUsesCompleteTrackedRootWhenPresent, true);
  assert.equal(readiness.configDataIntegrityUsesExplicitConfigDataSourceRootWhenProvided, true);
  assert.equal(readiness.configDataIntegrityHydratesPinnedB2WhenTrackedRootAbsentOrEmpty, true);
  assert.equal(readiness.configDataIntegrityPartialTrackedRootFailsClosed, true);
  assert.equal(readiness.sourcePackBoundaryAllowsTrackedRootAbsenceOnlyAfterB5Admission, true);
  assert.equal(readiness.sourcePackBoundaryPartialTrackedRootFailsClosed, true);
  assert.equal(readiness.externalHydrationMustRemainOutsideRepository, true);
  assert.equal(readiness.externalHydrationMustVerifyPinnedReleaseAndPerFileIdentity, true);
  assert.equal(readiness.trackedMutationAllowed, false);

  assert.equal(contract.migrationState.trackedRepositoryRawSourceStillPresent, true);
  assert.equal(contract.migrationState.trackedRepositoryRawJsonCount, 753);
  assert.equal(contract.migrationState.externalOnlyCleanRoomCompleted, true);
  assert.equal(contract.migrationState.trackedRawDeletionAdmitted, true);
  assert.equal(contract.migrationState.trackedRawDeletionCompleted, false);

  for (const [key, value] of Object.entries(contract.semanticBoundary)) {
    assert.equal(value, false, `semantic boundary must stay false: ${key}`);
  }
  assert.equal(contract.productionBoundary.productionRuntimeReadsRawConfigData, false);
  assert.equal(contract.productionBoundary.productionRuntimeFetchesSourcePack, false);
  assert.equal(contract.productionBoundary.rawConfigDataRuntimeFallbackAllowed, false);
  assert.equal(contract.productionBoundary.frontendRuntimeChanged, false);
  assert.equal(contract.productionBoundary.productionBuildRequiredInB5, false);
  assert.deepEqual(contract.blockers, []);
  assert.deepEqual(contract.reviews, []);
  assert.equal(contract.handoff.nextStage, 'B6-delete-tracked-configdata');
}

function validateRoute(paths, contract) {
  const contracts = loadProjectCheckContracts({ repoRoot: ROOT });
  const route = routeProjectCheckPaths(paths, contracts);
  assert.equal(route.status, contract.b6RequiredGate.projectCheckStatus);
  assert.equal(route.changedFileCount, contract.b6RequiredGate.changedPathCount);
  assert.equal(route.manualReviews.length, contract.b6RequiredGate.manualReviewCount);
  assert.equal(route.boundaries.ownerPropagationCount, 0);
  assert.equal(route.boundaries.changeClassFanOutCount, 0);

  for (const file of route.files) {
    for (const owner of contract.deletionAdmission.requiredStorageOwners) {
      assert.equal(file.owners.includes(owner), true, `${file.path}: required deletion owner missing: ${owner}`);
    }
    for (const validator of contract.deletionAdmission.requiredValidators) {
      assert.equal(file.validators.includes(validator), true, `${file.path}: required deletion validator missing: ${validator}`);
    }
  }

  return { contracts, route };
}

function main() {
  const execute = process.argv.includes('--execute');
  const contract = readJson(CONTRACT_PATH);
  const sourcePack = readJson(SOURCE_PACK_PATH);
  validateContract(contract, sourcePack);

  const paths = listDeletionPaths(sourcePack.authoritativePredecessor.sourceCommitSha);
  assert.equal(paths.length, contract.deletionAdmission.admittedDeletionCount);
  const { contracts, route } = validateRoute(paths, contract);

  let execution = null;
  if (execute) {
    execution = executeProjectCheck(paths, { repoRoot: ROOT, contracts });
    assert.equal(execution.status, 'PASS', JSON.stringify(execution, null, 2));
    assert.equal(execution.completion, 'COMPLETE');
    assert.equal(execution.exitCode, 0);
  }

  console.log(JSON.stringify({
    status: 'PASS',
    completion: 'CONFIGDATA_SOURCE_PACK_B5_DELETION_ADMISSION_VALIDATED',
    deletionPathCount: paths.length,
    projectCheckStatus: route.status,
    manualReviewCount: route.manualReviews.length,
    ownerCount: route.ownerCount,
    validatorCount: route.validatorCount,
    requiredStorageOwners: contract.deletionAdmission.requiredStorageOwners,
    requiredValidators: contract.deletionAdmission.requiredValidators,
    owningValidatorsExecuted: execute,
    executionStatus: execution?.status ?? null,
    semanticAuthorityChanged: false,
    frozenSemanticDomainsReopened: false,
    nextStage: contract.handoff.nextStage,
  }, null, 2));
}

main();
