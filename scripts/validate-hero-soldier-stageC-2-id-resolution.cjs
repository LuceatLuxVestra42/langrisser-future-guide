const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const P = {
  c0Contract: 'data/contracts/hero-soldier-integration-stageC-0-input.v1.json',
  c0Summary: 'data/validation/hero-soldier-integration-stageC-0-summary.v1.json',
  c1: 'data/validation/hero-soldier-integration-stageC-1-pair-parity.v1.json',
  heroIdentityContract: 'data/contracts/hero-identity-contract.v1.json',
  soldierIdentityContract: 'data/contracts/soldier-identity-contract.v1.json',
  heroMaster: 'data/hero-name-master.v1.json',
  soldierMaster: 'data/generated/soldier-master.v1.json',
  heroManifest: 'data/generated/hero-detail.v1.json',
  heroShared: 'data/generated/hero-detail-shared.v1.json',
  heroFinal: 'data/validation/hero-stage6-4-final.v1.json',
  soldierRecords: 'data/generated/soldier-stage6-1-full-records.v1.json',
  soldierFinal: 'data/validation/soldier-stage6-7-site-admission.v1.json',
  output: 'data/validation/hero-soldier-integration-stageC-2-id-resolution.v1.json',
};

function abs(p) { return path.join(ROOT, p); }
function loadJson(p) { return JSON.parse(fs.readFileSync(abs(p), 'utf8')); }
function writeJson(p, value) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), JSON.stringify(value, null, 2) + '\n');
}
function gitBlobSha(p) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${p}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
function isCanonicalPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}
function isCanonicalObjectKey(key) {
  return /^[1-9]\d*$/.test(key) && String(Number(key)) === key && isCanonicalPositiveInteger(Number(key));
}
function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}
function duplicateValues(values) {
  const seen = new Set();
  const dup = new Set();
  for (const value of values) {
    if (seen.has(value)) dup.add(value);
    seen.add(value);
  }
  return uniqueSorted(dup);
}
function setDiff(left, right) {
  return uniqueSorted([...left].filter(v => !right.has(v)));
}
function setParity(left, right) {
  const leftMinusRight = setDiff(left, right);
  const rightMinusLeft = setDiff(right, left);
  return {
    mismatchCount: leftMinusRight.length + rightMinusLeft.length,
    leftMinusRight,
    rightMinusLeft,
  };
}
function findReviewCount(validation, code) {
  const review = (validation?.reviews || []).find(r => r?.code === code);
  return review?.count ?? null;
}

function main() {
  const c0Contract = loadJson(P.c0Contract);
  const c0Summary = loadJson(P.c0Summary);
  const c1 = loadJson(P.c1);
  const heroIdentityContract = loadJson(P.heroIdentityContract);
  const soldierIdentityContract = loadJson(P.soldierIdentityContract);
  const heroMaster = loadJson(P.heroMaster);
  const soldierMaster = loadJson(P.soldierMaster);
  const heroManifest = loadJson(P.heroManifest);
  const heroShared = loadJson(P.heroShared);
  const heroFinal = loadJson(P.heroFinal);
  const soldierRecords = loadJson(P.soldierRecords);
  const soldierFinal = loadJson(P.soldierFinal);

  const expected = c0Contract?.expectedPopulation || { heroes: 267, soldiers: 224, canonicalPairs: 5977 };
  const hardErrors = [];
  const diagnostics = {
    heroMasterInvalidIds: [],
    heroMasterDuplicateIds: [],
    soldierMasterInvalidIds: [],
    soldierMasterDuplicateIds: [],
    heroManifestInvalidKeys: [],
    heroManifestPathMismatches: [],
    heroShardIdentityMismatches: [],
    heroMembershipTypeErrors: [],
    heroMembershipDuplicateIds: [],
    heroMembershipUnknownSoldierIds: [],
    soldierRecordInvalidIds: [],
    soldierRecordDuplicateIds: [],
    soldierMembershipTypeErrors: [],
    soldierMembershipDuplicateIds: [],
    soldierMembershipUnknownHeroIds: [],
    sharedMetadataInvalidKeys: [],
    sharedMetadataIdMismatches: [],
    sharedMetadataDuplicateIds: [],
    sharedMetadataSiteIdMismatches: [],
    sharedMetadataMissingForHeroRefs: [],
    missingHeroShards: [],
    malformedMembershipContainers: [],
  };

  const upstreamChecks = {
    c0PassComplete: c0Summary?.status === 'PASS' && c0Summary?.completion === 'COMPLETE',
    c1PassComplete: c1?.status === 'PASS' && c1?.completion === 'COMPLETE',
    heroIdentityFrozen: heroIdentityContract?.status === 'FROZEN' && heroIdentityContract?.canonicalKey?.field === 'heroId',
    soldierIdentityFrozen: soldierIdentityContract?.status === 'FROZEN' && soldierIdentityContract?.canonicalKey?.field === 'soldierId',
    heroFinalFrozen: ['PASS', 'PASS_WITH_REVIEW'].includes(heroFinal?.status) && heroFinal?.completion === 'COMPLETE' && heroFinal?.heroDataPipelineStatus === 'FINAL_FROZEN',
    soldierFinalReady: soldierFinal?.status === 'PASS' && soldierFinal?.admissionStatus === 'READY_WITH_REVIEW',
  };
  for (const [name, pass] of Object.entries(upstreamChecks)) {
    if (!pass) hardErrors.push(`Upstream gate failed: ${name}`);
  }

  const currentBlobs = {
    c0Contract: gitBlobSha(P.c0Contract),
    c0Summary: gitBlobSha(P.c0Summary),
    c1: gitBlobSha(P.c1),
    heroIdentityContract: gitBlobSha(P.heroIdentityContract),
    soldierIdentityContract: gitBlobSha(P.soldierIdentityContract),
    heroMaster: gitBlobSha(P.heroMaster),
    soldierMaster: gitBlobSha(P.soldierMaster),
    heroManifest: gitBlobSha(P.heroManifest),
    heroShared: gitBlobSha(P.heroShared),
    heroFinal: gitBlobSha(P.heroFinal),
    soldierRecords: gitBlobSha(P.soldierRecords),
    soldierFinal: gitBlobSha(P.soldierFinal),
  };
  const frozen = c0Contract?.authoritativeInputs || {};
  const snapshotChecks = {
    heroManifestMatchesC0: currentBlobs.heroManifest === frozen?.heroFinal?.manifest?.gitBlobSha,
    heroFinalMatchesC0: currentBlobs.heroFinal === frozen?.heroFinal?.finalCheckpoint?.gitBlobSha,
    soldierRecordsMatchC0: currentBlobs.soldierRecords === frozen?.soldierFinal?.fullRecords?.gitBlobSha,
    soldierFinalMatchesC0: currentBlobs.soldierFinal === frozen?.soldierFinal?.finalCheckpoint?.gitBlobSha,
    heroSharedMatchesHeroFinal: currentBlobs.heroShared === heroFinal?.sources?.[P.heroShared]?.gitBlobSha,
    heroMasterMatchesIdentityContract: currentBlobs.heroMaster === heroIdentityContract?.sources?.heroMasterBlobSha,
    soldierMasterMatchesIdentityContract: currentBlobs.soldierMaster === soldierIdentityContract?.sources?.soldierMasterBlobSha,
  };
  for (const [name, pass] of Object.entries(snapshotChecks)) {
    if (!pass) hardErrors.push(`Frozen identity/input snapshot drift: ${name}`);
  }

  const heroMasterIdsRaw = [];
  for (const record of Array.isArray(heroMaster?.records) ? heroMaster.records : []) {
    const heroId = record?.heroId;
    if (!isCanonicalPositiveInteger(heroId)) diagnostics.heroMasterInvalidIds.push(heroId ?? null);
    else heroMasterIdsRaw.push(heroId);
  }
  diagnostics.heroMasterDuplicateIds = duplicateValues(heroMasterIdsRaw);
  const heroMasterSet = new Set(heroMasterIdsRaw);

  const soldierMasterIdsRaw = [];
  for (const record of Array.isArray(soldierMaster?.records) ? soldierMaster.records : []) {
    const soldierId = record?.soldierId;
    if (!isCanonicalPositiveInteger(soldierId)) diagnostics.soldierMasterInvalidIds.push(soldierId ?? null);
    else soldierMasterIdsRaw.push(soldierId);
  }
  diagnostics.soldierMasterDuplicateIds = duplicateValues(soldierMasterIdsRaw);
  const soldierMasterSet = new Set(soldierMasterIdsRaw);

  const heroManifestIds = [];
  const heroReferencedSoldierIds = [];
  const byHeroId = heroManifest?.storage?.byHeroId;
  if (!byHeroId || typeof byHeroId !== 'object' || Array.isArray(byHeroId)) {
    diagnostics.malformedMembershipContainers.push({ scope: 'heroManifest.storage.byHeroId', code: 'MISSING_OR_NON_OBJECT' });
  } else {
    for (const [heroKey, locator] of Object.entries(byHeroId)) {
      if (!isCanonicalObjectKey(heroKey)) {
        diagnostics.heroManifestInvalidKeys.push(heroKey);
        continue;
      }
      const heroId = Number(heroKey);
      heroManifestIds.push(heroId);
      const expectedPath = `data/generated/hero-detail/by-id/${heroId}.json`;
      const shardPath = locator?.path;
      if (shardPath !== expectedPath) {
        diagnostics.heroManifestPathMismatches.push({ heroId, expected: expectedPath, actual: shardPath ?? null });
      }
      if (!shardPath || !fs.existsSync(abs(shardPath))) {
        diagnostics.missingHeroShards.push({ heroId, path: shardPath ?? null });
        continue;
      }
      const shard = loadJson(shardPath);
      if (!isCanonicalPositiveInteger(shard?.heroId) || shard.heroId !== heroId) {
        diagnostics.heroShardIdentityMismatches.push({ heroId, actual: shard?.heroId ?? null, path: shardPath });
      }
      const soldierIds = shard?.soldiers?.ids;
      if (!Array.isArray(soldierIds)) {
        diagnostics.malformedMembershipContainers.push({ scope: 'heroShard.soldiers.ids', heroId, code: 'MISSING_OR_NON_ARRAY' });
        continue;
      }
      const localValid = [];
      for (let i = 0; i < soldierIds.length; i += 1) {
        const soldierId = soldierIds[i];
        if (!isCanonicalPositiveInteger(soldierId)) {
          diagnostics.heroMembershipTypeErrors.push({ heroId, index: i, value: soldierId ?? null, type: typeof soldierId });
          continue;
        }
        localValid.push(soldierId);
        heroReferencedSoldierIds.push(soldierId);
      }
      const dup = duplicateValues(localValid);
      for (const soldierId of dup) diagnostics.heroMembershipDuplicateIds.push({ heroId, soldierId });
    }
  }
  const heroManifestSet = new Set(heroManifestIds);

  const sharedSoldierIds = [];
  const sharedById = heroShared?.soldiersById;
  let missingKoreanNameCount = 0;
  if (!sharedById || typeof sharedById !== 'object' || Array.isArray(sharedById)) {
    diagnostics.malformedMembershipContainers.push({ scope: 'heroShared.soldiersById', code: 'MISSING_OR_NON_OBJECT' });
  } else {
    for (const [soldierKey, metadata] of Object.entries(sharedById)) {
      if (!isCanonicalObjectKey(soldierKey)) {
        diagnostics.sharedMetadataInvalidKeys.push(soldierKey);
        continue;
      }
      const soldierId = Number(soldierKey);
      sharedSoldierIds.push(soldierId);
      if (!isCanonicalPositiveInteger(metadata?.soldierId) || metadata.soldierId !== soldierId) {
        diagnostics.sharedMetadataIdMismatches.push({ key: soldierKey, soldierId: metadata?.soldierId ?? null });
      }
      const expectedSiteId = `soldier-${soldierId}`;
      if (metadata?.siteId !== expectedSiteId) {
        diagnostics.sharedMetadataSiteIdMismatches.push({ soldierId, expected: expectedSiteId, actual: metadata?.siteId ?? null });
      }
      if (!metadata?.nameKr) missingKoreanNameCount += 1;
    }
  }
  diagnostics.sharedMetadataDuplicateIds = duplicateValues(sharedSoldierIds);
  const sharedSoldierSet = new Set(sharedSoldierIds);

  const soldierRecordIds = [];
  const soldierReferencedHeroIds = [];
  for (const record of Array.isArray(soldierRecords?.records) ? soldierRecords.records : []) {
    const soldierId = record?.soldierId;
    if (!isCanonicalPositiveInteger(soldierId)) {
      diagnostics.soldierRecordInvalidIds.push(soldierId ?? null);
      continue;
    }
    soldierRecordIds.push(soldierId);
    const heroIds = record?.heroes?.finalHeroIds;
    if (!Array.isArray(heroIds)) {
      diagnostics.malformedMembershipContainers.push({ scope: 'soldierRecord.heroes.finalHeroIds', soldierId, code: 'MISSING_OR_NON_ARRAY' });
      continue;
    }
    const localValid = [];
    for (let i = 0; i < heroIds.length; i += 1) {
      const heroId = heroIds[i];
      if (!isCanonicalPositiveInteger(heroId)) {
        diagnostics.soldierMembershipTypeErrors.push({ soldierId, index: i, value: heroId ?? null, type: typeof heroId });
        continue;
      }
      localValid.push(heroId);
      soldierReferencedHeroIds.push(heroId);
    }
    const dup = duplicateValues(localValid);
    for (const heroId of dup) diagnostics.soldierMembershipDuplicateIds.push({ soldierId, heroId });
  }
  diagnostics.soldierRecordDuplicateIds = duplicateValues(soldierRecordIds);
  const soldierRecordSet = new Set(soldierRecordIds);

  diagnostics.heroMembershipUnknownSoldierIds = uniqueSorted(heroReferencedSoldierIds.filter(id => !soldierRecordSet.has(id) || !soldierMasterSet.has(id)));
  diagnostics.sharedMetadataMissingForHeroRefs = uniqueSorted(heroReferencedSoldierIds.filter(id => !sharedSoldierSet.has(id)));
  diagnostics.soldierMembershipUnknownHeroIds = uniqueSorted(soldierReferencedHeroIds.filter(id => !heroManifestSet.has(id) || !heroMasterSet.has(id)));

  const setParityChecks = {
    heroManifestVsHeroMaster: setParity(heroManifestSet, heroMasterSet),
    soldierRecordsVsSoldierMaster: setParity(soldierRecordSet, soldierMasterSet),
    sharedMetadataVsSoldierMaster: setParity(sharedSoldierSet, soldierMasterSet),
    sharedMetadataVsSoldierRecords: setParity(sharedSoldierSet, soldierRecordSet),
  };

  const countChecks = {
    heroMasterCount: heroMasterSet.size === expected.heroes,
    heroManifestCount: heroManifestSet.size === expected.heroes,
    soldierMasterCount: soldierMasterSet.size === expected.soldiers,
    soldierRecordCount: soldierRecordSet.size === expected.soldiers,
    sharedSoldierMetadataCount: sharedSoldierSet.size === expected.soldiers,
  };

  const structuralCounts = {
    heroMasterInvalidIds: diagnostics.heroMasterInvalidIds.length,
    heroMasterDuplicateIds: diagnostics.heroMasterDuplicateIds.length,
    soldierMasterInvalidIds: diagnostics.soldierMasterInvalidIds.length,
    soldierMasterDuplicateIds: diagnostics.soldierMasterDuplicateIds.length,
    heroManifestInvalidKeys: diagnostics.heroManifestInvalidKeys.length,
    heroManifestPathMismatches: diagnostics.heroManifestPathMismatches.length,
    heroShardIdentityMismatches: diagnostics.heroShardIdentityMismatches.length,
    heroMembershipTypeErrors: diagnostics.heroMembershipTypeErrors.length,
    heroMembershipDuplicateIds: diagnostics.heroMembershipDuplicateIds.length,
    heroMembershipUnknownSoldierIds: diagnostics.heroMembershipUnknownSoldierIds.length,
    soldierRecordInvalidIds: diagnostics.soldierRecordInvalidIds.length,
    soldierRecordDuplicateIds: diagnostics.soldierRecordDuplicateIds.length,
    soldierMembershipTypeErrors: diagnostics.soldierMembershipTypeErrors.length,
    soldierMembershipDuplicateIds: diagnostics.soldierMembershipDuplicateIds.length,
    soldierMembershipUnknownHeroIds: diagnostics.soldierMembershipUnknownHeroIds.length,
    sharedMetadataInvalidKeys: diagnostics.sharedMetadataInvalidKeys.length,
    sharedMetadataIdMismatches: diagnostics.sharedMetadataIdMismatches.length,
    sharedMetadataDuplicateIds: diagnostics.sharedMetadataDuplicateIds.length,
    sharedMetadataSiteIdMismatches: diagnostics.sharedMetadataSiteIdMismatches.length,
    sharedMetadataMissingForHeroRefs: diagnostics.sharedMetadataMissingForHeroRefs.length,
    missingHeroShards: diagnostics.missingHeroShards.length,
    malformedMembershipContainers: diagnostics.malformedMembershipContainers.length,
  };

  for (const [name, pass] of Object.entries(countChecks)) {
    if (!pass) hardErrors.push(`Population count mismatch: ${name}`);
  }
  for (const [name, parity] of Object.entries(setParityChecks)) {
    if (parity.mismatchCount) hardErrors.push(`Identity set mismatch: ${name} (${parity.mismatchCount})`);
  }
  for (const [name, count] of Object.entries(structuralCounts)) {
    if (count) hardErrors.push(`Identity/resolution integrity failure: ${name}=${count}`);
  }

  const inheritedReviews = [
    {
      code: 'SOLDIER_KR_NAME_UNRESOLVED',
      count: missingKoreanNameCount,
      classification: 'REVIEW',
      blocking: false,
      rule: 'Korean display-name absence is presentation-only and must never remove or alter a canonical soldierId reference.'
    },
    {
      code: 'RELEASE_DATE_UNRESOLVED',
      count: findReviewCount(soldierFinal, 'RELEASE_DATE_UNRESOLVED'),
      classification: 'REVIEW',
      blocking: false,
      rule: 'Release metadata is outside C-2 identity/resolution integrity.'
    },
    {
      code: 'ROUTE_IMPLEMENTATION_SEPARATE_FROM_IDENTITY',
      count: null,
      classification: 'REVIEW',
      blocking: false,
      rule: 'C-2 validates stable IDs and Soldier siteId round-trip metadata, not deployed click/route behavior.'
    },
  ];

  const status = hardErrors.length ? 'FAIL' : (inheritedReviews.some(r => r.count !== 0) ? 'PASS_WITH_REVIEW' : 'PASS');
  const completion = hardErrors.length ? 'BLOCKED' : 'COMPLETE';

  const output = {
    version: 1,
    schemaId: 'hero-soldier-integration-stageC-2-id-resolution/v1',
    stage: 'C-2',
    checkpoint: 'consumer-identity-id-resolution',
    status,
    completion,
    purpose: 'Prove that final Hero and Soldier consumers preserve canonical integer identities, resolve every reciprocal membership target, and retain a lossless Soldier routing-ID mapping without using names or ConfigData inference.',
    sourcePolicy: 'C-2 consumes frozen C-0/C-1 outputs, A-stage identity contracts, final Hero manifest/shards/shared metadata, and final Soldier records only. It does not recompute Hero-Soldier membership semantics.',
    sources: Object.fromEntries(Object.entries(P).filter(([name]) => name !== 'output').map(([name, p]) => [name, { path: p, gitBlobSha: currentBlobs[name] ?? gitBlobSha(p) }])),
    upstreamChecks,
    snapshotChecks,
    expected: {
      heroes: expected.heroes,
      soldiers: expected.soldiers,
      c1CanonicalPairs: c1?.summary?.canonicalPairCount ?? null,
    },
    identityRules: {
      heroCanonicalKey: 'heroId',
      soldierCanonicalKey: 'soldierId',
      membershipValueType: 'positive safe integer JSON number',
      objectKeySerialization: 'canonical positive decimal string; String(Number(key)) must equal key',
      heroShardLocator: 'data/generated/hero-detail/by-id/{heroId}.json',
      soldierSiteIdForm: soldierIdentityContract?.auxiliaryIdentifiers?.siteId?.currentForm ?? 'soldier-<soldierId>',
      nameJoinForbidden: true,
      numericOffsetInferenceForbidden: true,
    },
    summary: {
      heroMasterCount: heroMasterSet.size,
      heroManifestCount: heroManifestSet.size,
      soldierMasterCount: soldierMasterSet.size,
      soldierRecordCount: soldierRecordSet.size,
      sharedSoldierMetadataCount: sharedSoldierSet.size,
      heroMembershipReferenceCount: heroReferencedSoldierIds.length,
      soldierMembershipReferenceCount: soldierReferencedHeroIds.length,
      heroManifestVsMasterMismatch: setParityChecks.heroManifestVsHeroMaster.mismatchCount,
      soldierRecordsVsMasterMismatch: setParityChecks.soldierRecordsVsSoldierMaster.mismatchCount,
      sharedMetadataVsMasterMismatch: setParityChecks.sharedMetadataVsSoldierMaster.mismatchCount,
      sharedMetadataVsFinalRecordsMismatch: setParityChecks.sharedMetadataVsSoldierRecords.mismatchCount,
      ...structuralCounts,
      missingKoreanNameCount,
      hardErrorCount: hardErrors.length,
    },
    setParity: setParityChecks,
    diagnostics,
    nonBlockingReviews: inheritedReviews,
    hardErrors,
    passCriteria: {
      heroes: expected.heroes,
      soldiers: expected.soldiers,
      allIdentitySetsEqual: true,
      allMembershipIdsArePositiveIntegers: true,
      allMembershipTargetsResolve: true,
      allHeroShardKeysAndPathsRoundTrip: true,
      allSharedSoldierKeysAndIdsRoundTrip: true,
      allSoldierSiteIdsMapBackToSoldierId: true,
      duplicateMembershipIds: 0,
      malformedMembershipContainers: 0,
      hardErrors: 0,
      presentationReviewsMayRemain: true,
    },
    decision: hardErrors.length
      ? `C-2 FAIL. ${hardErrors.length} blocking identity/resolution errors require correction before C-3.`
      : 'C-2 PASS_WITH_REVIEW. All 267 Hero identities, 224 Soldier identities, final membership ID types, target lookups, Hero shard locators, shared Soldier metadata keys and Soldier siteId mappings resolve exactly with zero structural identity errors. Presentation-only name/release reviews remain non-blocking.',
    nextStartPoint: hardErrors.length ? 'Repair C-2 identity/resolution failures and rerun C-2.' : 'C-3 representative special-relation fixture regression against frozen A-stage membership and final consumers.',
  };

  writeJson(P.output, output);
  console.log(JSON.stringify({ status, completion, summary: output.summary, hardErrors }, null, 2));
  if (hardErrors.length) process.exitCode = 1;
}

main();
