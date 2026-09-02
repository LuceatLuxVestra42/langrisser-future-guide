import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectCheckContracts, routeProjectCheckPaths } from '../tools/project-check/lib/project-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOUNDARY_PATH = 'data/contracts/configdata-source-pack-routing-boundary.v1.json';
const FORMAT_PATH = 'data/contracts/configdata-source-pack-format.v1.json';
const SOURCE_PACK_PATH = 'data/contracts/configdata-source-pack-contract.v1.json';
const B4_PATH = 'data/contracts/project-tooling-configdata-lookup-b4-external-clean-room.v1.json';
const B5_PATH = 'data/contracts/configdata-source-pack-deletion-admission.v1.json';
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

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${String(result.stderr ?? '').trim()}`);
  return String(result.stdout ?? '').trim();
}

function listDeletionPaths(sourceCommitSha) {
  const output = git(['ls-tree', '-r', '--name-only', sourceCommitSha, '--', 'data/configdata']);
  return output
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => /^data\/configdata\/[^/]+\.json$/.test(item))
    .sort();
}

function validateFormat(format, boundary, admission) {
  assert.equal(format.version, 1);
  assert.equal(format.contract, 'configdata-source-pack-format');
  assert.equal(format.stage, 'repository-size-reduction-B1a');
  assert.equal(format.status, 'PASS');
  assert.equal(format.owner, OWNER_ID);
  assert.equal(format.authoritativePredecessor.routingBoundary, BOUNDARY_PATH);
  assert.equal(format.authoritativePredecessor.repository, 'LuceatLuxVestra42/langrisser-future-guide');
  assert.match(format.authoritativePredecessor.rawSourceCommitSha, /^[a-f0-9]{40}$/);
  assert.equal(format.authoritativePredecessor.logicalSourceRoot, boundary.authority.currentTrackedRawRoot);
  assert.equal(format.authoritativePredecessor.currentTrackedJsonCount, 753);

  assert.equal(format.contentSelection.scope, 'DIRECT_CHILD_REGULAR_JSON_FILES_ONLY');
  assert.equal(format.contentSelection.includePattern, boundary.routing.rawStoragePattern);
  assert.equal(format.contentSelection.recursive, false);
  assert.equal(format.contentSelection.directoriesIncludedAsMembers, false);
  assert.equal(format.contentSelection.symlinksAllowed, false);
  assert.equal(format.contentSelection.nonJsonFilesAllowed, false);
  assert.equal(format.contentSelection.memberPathPrefix, 'data/configdata/');
  assert.equal(format.contentSelection.sourceBytesMustRemainExact, true);
  assert.equal(format.contentSelection.jsonReserializationAllowed, false);
  assert.equal(format.contentSelection.textTranscodingAllowed, false);
  assert.equal(format.contentSelection.newlineNormalizationAllowed, false);

  assert.equal(format.ordering.key, 'FULL_ARCHIVE_MEMBER_PATH_UTF8_BYTES');
  assert.equal(format.ordering.direction, 'ASCENDING');
  assert.equal(format.ordering.localeAware, false);
  assert.equal(format.ordering.numericAware, false);
  assert.equal(format.ordering.caseFolding, false);

  assert.equal(format.archive.fileName, 'langrisser-configdata-source-pack-v1.tar');
  assert.equal(format.archive.mediaType, 'application/x-tar');
  assert.equal(format.archive.format, 'POSIX_USTAR');
  assert.equal(format.archive.compression, 'NONE');
  assert.equal(format.archive.blockSize, 512);
  assert.equal(format.archive.endOfArchiveZeroBlockCount, 2);
  assert.equal(format.archive.extensionsAllowed, false);
  assert.equal(format.archive.paxHeadersAllowed, false);
  assert.equal(format.archive.gnuExtensionsAllowed, false);
  assert.equal(format.archive.memberPathUtf8ByteLengthMax, 100);

  assert.equal(format.regularFileHeader.modeOctal, '0644');
  assert.equal(format.regularFileHeader.uid, 0);
  assert.equal(format.regularFileHeader.gid, 0);
  assert.equal(format.regularFileHeader.mtimeUnixSeconds, 0);
  assert.equal(format.regularFileHeader.typeFlag, '0');
  assert.equal(format.regularFileHeader.linkName, '');
  assert.equal(format.regularFileHeader.ustarMagic, 'ustar\\0');
  assert.equal(format.regularFileHeader.ustarVersion, '00');
  assert.equal(format.regularFileHeader.userName, '');
  assert.equal(format.regularFileHeader.groupName, '');
  assert.equal(format.regularFileHeader.deviceMajor, 0);
  assert.equal(format.regularFileHeader.deviceMinor, 0);
  assert.equal(format.regularFileHeader.dataPaddingByte, 0);

  assert.equal(format.identityPolicy.contentIdentityAuthorityStage, 'B1b');
  assert.equal(format.identityPolicy.contentIdentityRequiresExactFileSet, true);
  assert.equal(format.identityPolicy.contentIdentityRequiresPerFileSha256, true);
  assert.equal(format.identityPolicy.contentIdentityRequiresPerFileByteLength, true);
  assert.equal(format.identityPolicy.archiveSha256Role, 'TRANSPORT_CONTAINER_INTEGRITY_ONLY');
  assert.equal(format.identityPolicy.archiveSha256CreatesSemanticAuthority, false);
  assert.equal(format.identityPolicy.archiveMemberOrderCreatesSemanticMeaning, false);

  assert.equal(format.determinism.sameExactInputSetMustProduceSameArchiveBytes, true);
  assert.equal(format.determinism.filesystemMtimeMayAffectOutput, false);
  assert.equal(format.determinism.filesystemOwnershipMayAffectOutput, false);
  assert.equal(format.determinism.hostLocaleMayAffectOutput, false);
  assert.equal(format.determinism.hostPathSeparatorMayAffectOutput, false);
  assert.equal(format.determinism.sourceTraversalOrderMayAffectOutput, false);
  assert.equal(format.determinism.failClosedOnUnrepresentableUstarMemberPath, true);

  assert.equal(format.productionBoundary.productionRuntimeFetchesThisArchive, false);
  assert.equal(format.productionBoundary.productionRuntimeReadsRawConfigData, false);
  assert.equal(format.productionBoundary.rawConfigDataRuntimeFallbackAllowed, false);
  assert.equal(format.semanticBoundary.semanticAuthorityChanged, false);
  assert.equal(format.semanticBoundary.frozenSemanticDomainsReopened, false);
  assert.equal(format.semanticBoundary.canonicalIdentityChanges, false);
  assert.equal(format.semanticBoundary.relationChanges, false);
  assert.equal(format.semanticBoundary.nameJoinIntroduced, false);
  assert.equal(format.semanticBoundary.idArithmeticIntroduced, false);
  assert.equal(format.semanticBoundary.filenameSimilarityIntroduced, false);
  assert.equal(format.semanticBoundary.sourceMeaningReinterpreted, false);
  assert.equal(format.handoff.completion, 'B1A_DETERMINISTIC_PACK_FORMAT_FROZEN');
  assert.equal(format.handoff.nextOwner, OWNER_ID);
  assert.equal(format.handoff.nextStage, 'B1b-exact-byte-snapshot');

  const sourceRoot = path.join(ROOT, format.authoritativePredecessor.logicalSourceRoot);
  const entries = fs.existsSync(sourceRoot) ? fs.readdirSync(sourceRoot, { withFileTypes: true }) : [];
  if (entries.length === 0) {
    assert.equal(admission.b5.migrationState.trackedRawDeletionAdmitted, true, 'tracked ConfigData root may be absent only after B5 admission');
    return {
      sourceMode: 'ADMITTED_EXTERNAL_ONLY_POST_B5',
      fileCount: admission.sourcePack.coverage.fileCount,
      totalSourceBytes: admission.sourcePack.coverage.totalSourceBytes,
      firstMember: null,
      lastMember: null,
    };
  }

  assert.equal(
    entries.length,
    format.authoritativePredecessor.currentTrackedJsonCount,
    'partial tracked ConfigData root must fail closed',
  );
  const members = [];
  let totalSourceBytes = 0;
  for (const entry of entries) {
    assert.equal(entry.isFile(), true, `non-regular ConfigData entry: ${entry.name}`);
    assert.equal(entry.name.endsWith('.json'), true, `non-JSON ConfigData entry: ${entry.name}`);
    assert.equal(entry.name.includes('/'), false);
    assert.equal(entry.name.includes('\\'), false);
    const memberPath = `${format.contentSelection.memberPathPrefix}${entry.name}`;
    const memberPathBytes = Buffer.from(memberPath, 'utf8');
    assert.ok(
      memberPathBytes.length <= format.archive.memberPathUtf8ByteLengthMax,
      `USTAR member path exceeds ${format.archive.memberPathUtf8ByteLengthMax} UTF-8 bytes: ${memberPath}`,
    );
    members.push(memberPath);
    totalSourceBytes += fs.statSync(path.join(sourceRoot, entry.name)).size;
  }
  const ordered = [...members].sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
  assert.equal(new Set(ordered).size, ordered.length, 'archive member paths must be unique');
  assert.equal(totalSourceBytes, admission.sourcePack.coverage.totalSourceBytes, 'tracked ConfigData total bytes drifted from B2 exact source');
  return {
    sourceMode: 'TRACKED_PRE_B6',
    fileCount: ordered.length,
    totalSourceBytes,
    firstMember: ordered[0],
    lastMember: ordered.at(-1),
  };
}

function validateAdmission(contracts) {
  const sourcePack = readJson(SOURCE_PACK_PATH);
  assert.equal(sourcePack.version, 1);
  assert.equal(sourcePack.contract, 'configdata-source-pack');
  assert.equal(sourcePack.stage, 'repository-size-reduction-B2');
  assert.equal(sourcePack.status, 'PASS');
  assert.equal(sourcePack.owner, OWNER_ID);
  assert.equal(sourcePack.authority.logicalRawPathNamespace, 'data/configdata');
  assert.equal(sourcePack.authority.rawConfigDataQueryFallback, false);
  assert.equal(sourcePack.storage.immutabilityPolicy, 'CONTENT_HASH_PINNED_FAIL_CLOSED');
  assert.equal(sourcePack.coverage.fileCount, 753);
  assert.equal(sourcePack.coverage.totalSourceBytes, 308284658);
  assert.equal(sourcePack.coverage.missingCount, 0);
  assert.equal(sourcePack.coverage.extraCount, 0);
  assert.equal(sourcePack.coverage.duplicatePathCount, 0);

  const b4 = readJson(B4_PATH);
  assert.equal(b4.version, 1);
  assert.equal(b4.schemaId, 'configdata-lookup-b4-external-clean-room/v1');
  assert.equal(b4.stage, 'repository-size-reduction-B4');
  assert.equal(b4.status, 'PASS');
  assert.equal(b4.completion, 'CONFIGDATA_LOOKUP_B4_EXTERNAL_ONLY_CLEAN_ROOM_COMPLETE');
  assert.equal(b4.cleanRoomBoundary.externalHydrationExactFileCount, sourcePack.coverage.fileCount);
  assert.equal(b4.cleanRoomBoundary.trackedRepositoryRawRootUnavailableDuringProof, true);
  assert.equal(b4.cleanRoomBoundary.repositoryRootFallbackMaySatisfyProof, false);
  assert.equal(b4.cleanRoomBoundary.explicitWriterChangedFileCount, 0);
  assert.equal(b4.cleanRoomBoundary.trackedMutationCountAfterRestore, 0);
  assert.equal(b4.cleanRoomBoundary.semanticMutationCount, 0);
  assert.equal(b4.migrationState.externalOnlyCleanRoomCompleted, true);
  assert.deepEqual(b4.blockers, []);
  assert.deepEqual(b4.reviews, []);

  const b5 = readJson(B5_PATH);
  assert.equal(b5.version, 1);
  assert.equal(b5.schemaId, 'configdata-source-pack-deletion-admission/v1');
  assert.equal(b5.stage, 'repository-size-reduction-B5');
  assert.equal(b5.status, 'PASS');
  assert.equal(b5.completion, 'CONFIGDATA_SOURCE_PACK_B5_DELETION_ADMISSION_COMPLETE');
  assert.equal(b5.owner, OWNER_ID);
  assert.deepEqual(b5.supportingOwners, ['configdata', 'project-check']);
  assert.equal(b5.deletionAdmission.trackedRawPattern, 'data/configdata/*.json');
  assert.equal(b5.deletionAdmission.preDeletionTrackedRawJsonCount, sourcePack.coverage.fileCount);
  assert.equal(b5.deletionAdmission.admittedDeletionCount, sourcePack.coverage.fileCount);
  assert.equal(b5.deletionAdmission.postDeletionTrackedRawJsonCount, 0);
  assert.equal(b5.deletionAdmission.atomicFullSetDeletionRequired, true);
  assert.equal(b5.deletionAdmission.partialTrackedDeletionAllowed, false);
  assert.equal(b5.deletionAdmission.deletionOccursInThisStage, false);
  assert.equal(b5.deletionAdmission.deletionStage, 'B6');
  assert.deepEqual(b5.deletionAdmission.requiredStorageOwners, ['configdata', OWNER_ID]);
  assert.deepEqual(b5.deletionAdmission.requiredValidators, [VALIDATOR_ID, 'configdata-integrity']);
  assert.equal(b5.deletionAdmission.orchestrationSpecialCaseIntroduced, false);
  assert.equal(b5.deletionAdmission.ownerPropagation, false);
  assert.equal(b5.deletionAdmission.changeClassFanOut, false);
  assert.equal(b5.deletionAdmission.semanticReopenOnStorageDeletion, false);
  assert.equal(b5.validatorReadiness.configDataIntegrityHydratesPinnedB2WhenTrackedRootAbsentOrEmpty, true);
  assert.equal(b5.validatorReadiness.configDataIntegrityPartialTrackedRootFailsClosed, true);
  assert.equal(b5.validatorReadiness.sourcePackBoundaryAllowsTrackedRootAbsenceOnlyAfterB5Admission, true);
  assert.equal(b5.validatorReadiness.sourcePackBoundaryPartialTrackedRootFailsClosed, true);
  assert.equal(b5.migrationState.trackedRawDeletionAdmitted, true);
  assert.equal(b5.migrationState.trackedRawDeletionCompleted, false);
  assert.deepEqual(b5.blockers, []);
  assert.deepEqual(b5.reviews, []);
  assert.equal(b5.handoff.nextStage, 'B6-delete-tracked-configdata');

  for (const [key, value] of Object.entries(b5.semanticBoundary)) {
    assert.equal(value, false, `B5 semantic boundary drift: ${key}`);
  }

  const deletionPaths = listDeletionPaths(sourcePack.authoritativePredecessor.sourceCommitSha);
  assert.equal(deletionPaths.length, b5.deletionAdmission.admittedDeletionCount);
  assert.equal(new Set(deletionPaths).size, deletionPaths.length);
  const route = routeProjectCheckPaths(deletionPaths, contracts);
  assert.equal(route.status, 'PLAN_READY');
  assert.equal(route.changedFileCount, deletionPaths.length);
  assert.equal(route.manualReviews.length, 0);
  assert.equal(route.boundaries.ownerPropagationCount, 0);
  assert.equal(route.boundaries.changeClassFanOutCount, 0);
  for (const file of route.files) {
    for (const owner of b5.deletionAdmission.requiredStorageOwners) {
      assert.equal(file.owners.includes(owner), true, `${file.path}: missing B5 deletion owner ${owner}`);
    }
    for (const validator of b5.deletionAdmission.requiredValidators) {
      assert.equal(file.validators.includes(validator), true, `${file.path}: missing B5 deletion validator ${validator}`);
    }
  }

  return { sourcePack, b4, b5, deletionPaths, route };
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

  expectRoute(contracts, BOUNDARY_PATH, [OWNER_ID], [VALIDATOR_ID]);
  expectRoute(contracts, FORMAT_PATH, [OWNER_ID], [VALIDATOR_ID]);
  expectRoute(contracts, SOURCE_PACK_PATH, [OWNER_ID], [VALIDATOR_ID]);
  expectRoute(contracts, B5_PATH, [OWNER_ID], [VALIDATOR_ID]);
  expectRoute(contracts, 'scripts/hydrate-configdata-source-pack-v1.mjs', [OWNER_ID], [VALIDATOR_ID]);
  expectRoute(contracts, 'scripts/validate-configdata-source-pack-b5-deletion-admission-v1.mjs', [OWNER_ID], [VALIDATOR_ID]);
  expectRoute(contracts, '.github/workflows/configdata-source-pack-b5-deletion-admission.yml', [OWNER_ID], [VALIDATOR_ID]);
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

  const admission = validateAdmission(contracts);
  const format = readJson(FORMAT_PATH);
  const topology = validateFormat(format, boundary, admission);

  console.log(JSON.stringify({
    status: 'PASS',
    checkpoint: 'CONFIGDATA_SOURCE_PACK_B5_DELETION_ADMISSION_BOUNDARY',
    owner: OWNER_ID,
    validator: VALIDATOR_ID,
    rawStoragePattern: boundary.routing.rawStoragePattern,
    sourceMode: topology.sourceMode,
    format: {
      archive: format.archive.fileName,
      archiveFormat: format.archive.format,
      compression: format.archive.compression,
      fileCount: topology.fileCount,
      totalSourceBytesObservedOrPinned: topology.totalSourceBytes,
      firstMember: topology.firstMember,
      lastMember: topology.lastMember,
    },
    deletionAdmission: {
      admittedDeletionCount: admission.deletionPaths.length,
      projectCheckStatus: admission.route.status,
      manualReviewCount: admission.route.manualReviews.length,
      ownerCount: admission.route.ownerCount,
      validatorCount: admission.route.validatorCount,
    },
    semanticAuthorityChanged: false,
    frozenSemanticDomainsReopened: false,
    ownerPropagationCount: 0,
    changeClassFanOutCount: 0,
    nextStage: admission.b5.handoff.nextStage,
  }, null, 2));
}

main();
