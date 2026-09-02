import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectCheckContracts, routeProjectCheckPaths } from '../tools/project-check/lib/project-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOUNDARY_PATH = 'data/contracts/configdata-source-pack-routing-boundary.v1.json';
const OWNER_ID = 'configdata-source-pack';
const VALIDATOR_ID = 'configdata-source-pack-boundary';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function validatorIds(route) {
  return route.validators.map(item => item.id);
}

function expectRoute(contracts, filePath, owners, validators) {
  const route = routeProjectCheckPaths([filePath], contracts);
  assert.equal(route.status, 'PLAN_READY', `${filePath} must be PLAN_READY`);
  assert.deepEqual(route.files[0].owners, [...owners].sort(), `${filePath} owner drift`);
  assert.deepEqual(validatorIds(route), validators, `${filePath} validator drift`);
  assert.equal(route.manualReviews.length, 0, `${filePath} must not require MANUAL_REVIEW`);
  assert.equal(route.boundaries.ownerPropagationCount, 0);
  assert.equal(route.boundaries.changeClassFanOutCount, 0);
}

function main() {
  const boundary = readJson(BOUNDARY_PATH);
  assert.equal(boundary.version, 1);
  assert.equal(boundary.contract, 'configdata-source-pack-routing-boundary');
  assert.equal(boundary.stage, 'repository-size-reduction-B0.5-B');
  assert.equal(boundary.status, 'PASS');
  assert.equal(boundary.owner, OWNER_ID);
  assert.equal(boundary.authority.currentTrackedRawRoot, 'data/configdata');
  assert.equal(boundary.authority.semanticAuthorityChanged, false);
  assert.equal(boundary.authority.frozenSemanticDomainsReopened, false);
  assert.equal(boundary.authority.sourcePackCreatedInThisStage, false);
  assert.equal(boundary.authority.configDataBytesChangedInThisStage, false);

  assert.equal(boundary.routing.ruleMatch, 'UNION_ALL_MATCHING_RULES');
  assert.equal(boundary.routing.rawStoragePattern, 'data/configdata/*.json');
  assert.deepEqual(boundary.routing.rawStorageOwners, ['configdata', OWNER_ID]);
  assert.equal(boundary.routing.existingDomainRulesRemainAdditive, true);
  assert.equal(boundary.routing.sourcePackToolingOwner, OWNER_ID);
  assert.equal(boundary.routing.ownerPropagation, false);
  assert.equal(boundary.routing.changeClassFanOut, false);
  assert.equal(boundary.routing.filenameSimilarityInference, false);
  assert.equal(boundary.routing.nameJoinInference, false);
  assert.equal(boundary.routing.idArithmeticInference, false);
  assert.equal(boundary.routing.semanticRecomputation, false);

  assert.equal(boundary.deletionBoundary.rawJsonDeletionUsesSamePathRouting, true);
  assert.equal(boundary.deletionBoundary.trackedJsonDeletionHasExplicitStorageOwner, true);
  assert.equal(boundary.deletionBoundary.domainSpecificExistingRulesRemainActiveUnderUnion, true);
  assert.equal(boundary.deletionBoundary.semanticReopenOnStorageDeletion, false);
  assert.equal(boundary.deletionBoundary.sourceRootCutoverRequiredBeforeTrackedRawDeletion, true);
  assert.equal(boundary.deletionBoundary.deletionAdmissionStage, 'B5');
  assert.equal(boundary.deletionBoundary.trackedRawDeletionStage, 'B6');

  assert.equal(boundary.futureSnapshotPromotion.opaquePackPointerMayInferDomainOwners, false);
  assert.equal(boundary.futureSnapshotPromotion.packHashMayInferSemanticImpact, false);
  assert.equal(boundary.futureSnapshotPromotion.filenameSimilarityMayInferSemanticImpact, false);
  assert.equal(boundary.futureSnapshotPromotion.nameJoinMayInferSemanticImpact, false);
  assert.equal(boundary.futureSnapshotPromotion.idArithmeticMayInferSemanticImpact, false);
  assert.equal(boundary.futureSnapshotPromotion.changedLogicalPathsRequiredBeforeDomainRouting, true);
  assert.equal(boundary.futureSnapshotPromotion.explicitPromotionContractRequiredBeforeExternalOnlyCutover, true);
  assert.equal(boundary.futureSnapshotPromotion.promotionMechanismImplementedInThisStage, false);

  assert.equal(boundary.productionBoundary.productionRuntimeReadsRawConfigData, false);
  assert.equal(boundary.productionBoundary.productionRuntimeFetchesSourcePack, false);
  assert.equal(boundary.productionBoundary.rawConfigDataRuntimeFallbackAllowed, false);
  assert.equal(boundary.productionBoundary.frontendSemanticJoinIntroduced, false);
  assert.equal(boundary.handoff.completion, 'B0_5_B_ROUTING_BOUNDARY_FROZEN');
  assert.equal(boundary.handoff.nextOwner, OWNER_ID);
  assert.equal(boundary.handoff.nextStage, 'B1a-minimal-pack-format-freeze');

  const contracts = loadProjectCheckContracts({ repoRoot: ROOT });
  const ownerMap = contracts.ownerMap;
  const catalog = contracts.validatorCatalog;

  assert.equal(ownerMap.policy.ruleMatch, 'UNION_ALL_MATCHING_RULES');
  assert.equal(ownerMap.policy.ownerPropagation, false);
  assert.equal(ownerMap.policy.changeClassFanOut, false);
  assert.equal(ownerMap.policy.noFilenameSimilarityInference, true);
  assert.equal(ownerMap.policy.noNameJoinInference, true);
  assert.equal(ownerMap.policy.noIdArithmeticInference, true);

  const owner = ownerMap.owners.find(item => item.id === OWNER_ID);
  assert.ok(owner, `${OWNER_ID} owner missing`);
  assert.deepEqual(owner.validators, [VALIDATOR_ID]);

  const validator = catalog.validators.find(item => item.id === VALIDATOR_ID);
  assert.ok(validator, `${VALIDATOR_ID} validator missing`);
  assert.equal(validator.phase, 7);
  assert.equal(validator.executable, 'node');
  assert.deepEqual(validator.args, ['scripts/validate-configdata-source-pack-boundary-v1.mjs']);
  assert.equal(validator.owner, OWNER_ID);

  const toolingRule = ownerMap.pathRules.find(item => item.id === 'configdata-source-pack-tooling');
  assert.ok(toolingRule, 'configdata-source-pack-tooling rule missing');
  assert.deepEqual(toolingRule.patterns, boundary.routing.sourcePackToolingPatterns);
  assert.deepEqual(toolingRule.owners, [OWNER_ID]);

  const rawRule = ownerMap.pathRules.find(item => item.id === 'configdata-source-storage');
  assert.ok(rawRule, 'configdata-source-storage rule missing');
  assert.deepEqual(rawRule.patterns, [boundary.routing.rawStoragePattern]);
  assert.deepEqual(rawRule.owners, boundary.routing.rawStorageOwners);

  expectRoute(
    contracts,
    BOUNDARY_PATH,
    [OWNER_ID],
    [VALIDATOR_ID],
  );
  expectRoute(
    contracts,
    'scripts/hydrate-configdata-source-pack-v1.mjs',
    [OWNER_ID],
    [VALIDATOR_ID],
  );
  expectRoute(
    contracts,
    '.github/workflows/configdata-source-pack-hydration-v1.yml',
    [OWNER_ID],
    [VALIDATOR_ID],
  );
  expectRoute(
    contracts,
    'data/configdata/ConfigDataUnknownFutureTable.json',
    ['configdata', OWNER_ID],
    [VALIDATOR_ID, 'configdata-integrity'],
  );
  expectRoute(
    contracts,
    'data/configdata/ConfigDataHeroInfo.json',
    ['configdata', OWNER_ID, 'hero-canonical', 'skin-relation'],
    [VALIDATOR_ID, 'configdata-integrity', 'hero-canonical', 'skin-relation'],
  );

  console.log(JSON.stringify({
    status: 'PASS',
    checkpoint: 'CONFIGDATA_SOURCE_PACK_B0_5_B_ROUTING_BOUNDARY',
    owner: OWNER_ID,
    validator: VALIDATOR_ID,
    rawStoragePattern: boundary.routing.rawStoragePattern,
    sourcePackToolingPatternCount: boundary.routing.sourcePackToolingPatterns.length,
    semanticAuthorityChanged: false,
    frozenSemanticDomainsReopened: false,
    ownerPropagationCount: 0,
    changeClassFanOutCount: 0,
    nextStage: boundary.handoff.nextStage,
  }, null, 2));
}

main();
