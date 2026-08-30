import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  PATHS,
  buildStage4ProductionAdmission,
  resolveProjectEvidence,
} from '../core/hygiene-stage4-production-admission-v1.mjs';
import { routeAssetRequest } from '../core/route-v1.mjs';

const REPO_ROOT = process.cwd();
const readJson = async repositoryPath => JSON.parse(await readFile(path.join(REPO_ROOT, repositoryPath), 'utf8'));
const readText = async repositoryPath => readFile(path.join(REPO_ROOT, repositoryPath), 'utf8');

try {
  const contract = await readJson(PATHS.contract);
  const stage3Summary = await readJson(PATHS.stage3Summary);
  const evidenceIndex = await readJson(PATHS.verifiedEvidenceIndex);
  const committedAdmission = await readJson(PATHS.admissionIndex);
  const committedQuarantine = await readJson(PATHS.quarantineIndex);
  const committedSummary = await readJson(PATHS.summary);
  const committedCheckpoint = await readText(PATHS.checkpoint);
  const fresh = await buildStage4ProductionAdmission({ write: false });

  assert.deepEqual(committedAdmission, fresh.admissionIndex, 'committed admission index must be deterministic');
  assert.deepEqual(committedQuarantine, fresh.quarantineIndex, 'committed quarantine index must be deterministic');
  assert.deepEqual(committedSummary, fresh.summary, 'committed Stage 4 summary must be deterministic');
  assert.equal(committedCheckpoint, fresh.checkpoint, 'committed Stage 4 checkpoint must be deterministic');

  assert.equal(stage3Summary.status, 'PASS_WITH_REVIEW');
  assert.equal(stage3Summary.completion, 'COMPLETE');
  assert.equal(stage3Summary.freezeState, 'ASSET_HYGIENE_BASELINE_FROZEN');
  assert.equal(stage3Summary.hardErrorCount, 0);
  assert.equal(evidenceIndex.productionAdoption, false, 'AH-3 index must remain read-only predecessor');

  assert.equal(committedSummary.status, contract.finalState.status);
  assert.equal(committedSummary.completion, contract.finalState.completion);
  assert.equal(committedSummary.freezeState, contract.finalState.freezeState);
  assert.equal(committedSummary.hardErrorCount, 0);
  assert.equal(committedSummary.blockers.length, 0);
  assert.equal(committedSummary.coverage.classificationRecordCount, contract.population.expectedClassificationRecordCount);
  assert.equal(committedSummary.coverage.assignedAssetCount, contract.population.expectedClassificationRecordCount);
  assert.equal(committedSummary.coverage.unassignedAssetCount, 0);

  assert.equal(
    committedAdmission.canonicalEntryCount + committedQuarantine.canonicalEntryCount,
    evidenceIndex.canonicalEntryCount,
    'every AH-3 canonical entry must be admitted or canonical-quarantined',
  );
  assert.equal(
    committedAdmission.canonicalEntryCount,
    contract.population.expectedCanonicalEntryCount,
    'current frozen canonical population must have one admitted active asset per key',
  );
  assert.equal(committedQuarantine.canonicalEntryCount, 0, 'current frozen canonical population must not require canonical quarantine');

  for (const entry of committedAdmission.entries) {
    assert.equal(entry.admissionState, 'PRODUCTION_ADMITTED');
    assert.equal(entry.selectedAsset.primaryClass, 'ACTIVE_VERIFIED');
    assert.equal(entry.selectedAsset.activeProduction, true);
    assert.equal(typeof entry.selectedAsset.sha256, 'string');
    assert.ok(entry.selectedAsset.sha256.length > 0);
    assert.ok(!entry.selectedAsset.candidateFlags.includes('RESOLVER_COLLISION'));
    assert.ok(!entry.selectedAsset.candidateFlags.includes('UNVERIFIED_EXTERNAL'));

    const projectLookup = resolveProjectEvidence(entry.canonicalKey, committedAdmission, committedQuarantine);
    assert.equal(projectLookup.status, 'RESOLVED');
    assert.equal(projectLookup.provenanceVerified, true);
    assert.equal(projectLookup.canonicalIdEvidenceVerified, true);
    const routed = routeAssetRequest({
      requestId: `validate-ah4:${entry.lookupKey}`,
      canonicalKey: entry.canonicalKey,
      projectLookup,
      assetIntake: { status: 'NOT_RUN' },
      externalAttempts: [],
    });
    assert.equal(routed.status, 'ROUTE_READY');
    assert.equal(routed.decision.action, 'USE_PROJECT_VERIFIED_ASSET');
    assert.equal(routed.decision.terminal, true);
  }

  for (const record of committedQuarantine.records) {
    assert.equal(record.directProductionLookupAllowed, false);
    assert.ok(['CURRENT_PRODUCTION_PATH_ONLY_REVIEW', 'QUARANTINED'].includes(record.state));
  }

  assert.equal(committedSummary.routerChecks.admittedRouteCheckCount, committedAdmission.canonicalEntryCount);
  assert.equal(committedSummary.routerChecks.admittedRoutePassCount, committedAdmission.canonicalEntryCount);
  assert.equal(committedSummary.routerChecks.nonAdmittedRoutePassCount, committedSummary.routerChecks.nonAdmittedRouteCheckCount);
  assert.equal(committedSummary.routerChecks.existingStage5ContractMutationCount, 0);
  assert.equal(committedSummary.productionAdoption.assetIntakeProjectEvidenceLookup, true);
  assert.equal(committedSummary.productionAdoption.frontendConsumers, false);
  assert.equal(committedSummary.productionAdoption.existingProductionConsumerRevocation, false);

  for (const count of Object.values(committedSummary.forbiddenOperationCounts)) assert.equal(count, 0);

  process.stdout.write(`${JSON.stringify({
    status: 'PASS_ASSET_HYGIENE_STAGE4_PRODUCTION_ADMISSION',
    completion: committedSummary.completion,
    freezeState: committedSummary.freezeState,
    coverage: committedSummary.coverage,
    routerChecks: committedSummary.routerChecks,
    reviews: committedSummary.reviews,
    blockerCount: committedSummary.blockers.length,
  }, null, 2)}\n`);
} catch (error) {
  console.error(`[asset-hygiene-stage4-validate] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 2;
}
