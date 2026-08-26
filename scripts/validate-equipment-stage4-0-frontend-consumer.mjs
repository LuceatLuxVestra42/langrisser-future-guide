import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sameSet = (a, b) => a.size === b.size && [...a].every(v => b.has(v));
const idSet = rows => new Set((rows ?? []).map(r => Number(r.equipmentId)));
const countBy = (rows, keyFn) => {
  const out = {};
  for (const row of rows ?? []) {
    const key = String(keyFn(row));
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
};

const contractPath = 'data/contracts/equipment-stage4-0-frontend-consumer-contract.v1.json';
const contract = load(contractPath);
const s3 = load(contract.dependsOn.stage3WholeSummary);
const generalList = load(contract.dependsOn.generalList);
const generalDetail = load(contract.dependsOn.generalDetail);
const exclusive = load(contract.dependsOn.exclusiveConsumer);
const special = load(contract.dependsOn.specialUnresolved);
const bFinal = load(contract.dependsOn.stageBFinal);
const bConsumer = load(contract.dependsOn.stageBConsumerContract);
const byEquipment = load(contract.dependsOn.exclusiveByEquipment);
const heroMaster = load(contract.dependsOn.heroMaster);
const expected = contract.expected;

// Frozen upstream checkpoints only. Stage 4-0 must not recompute Stage 2 semantics or ownership.
assert(s3.status === 'PASS', `Stage 3-7 status ${s3.status}`);
assert(s3.finalStageStatus === 'STAGE3_COMPLETE_WITH_REVIEW_AND_EXPLICIT_HOLD', `Stage 3 final status ${s3.finalStageStatus}`);
assert(s3.canonicalCoverage?.canonical === expected.canonicalEquipment, `canonical ${s3.canonicalCoverage?.canonical}`);
assert(s3.canonicalCoverage?.publicPageReady === expected.publicPageReady, `public ${s3.canonicalCoverage?.publicPageReady}`);
assert(s3.canonicalCoverage?.general === expected.general, `general ${s3.canonicalCoverage?.general}`);
assert(s3.canonicalCoverage?.exclusive === expected.exclusive, `exclusive ${s3.canonicalCoverage?.exclusive}`);
assert(s3.canonicalCoverage?.soulSpecial === expected.hiddenSpecial, `special ${s3.canonicalCoverage?.soulSpecial}`);
assert(s3.canonicalCoverage?.hold === expected.hold, `hold ${s3.canonicalCoverage?.hold}`);
assert(s3.canonicalCoverage?.closed === true && s3.canonicalCoverage?.disjoint === true, 'Stage 3 partition is not closed/disjoint');
assert(s3.hiddenAndHoldIntegrity?.publicLeak === 0, `Stage 3 hidden/HOLD public leak ${s3.hiddenAndHoldIntegrity?.publicLeak}`);
assert(s3.consumerParity?.routeKey === contract.routes.detail.routeKey, `route key ${s3.consumerParity?.routeKey}`);

assert(bFinal.stage === 'B-FINAL' && bFinal.status === 'PASS_ACCEPTED', `Stage B final ${bFinal.stage}/${bFinal.status}`);
assert(bFinal.closureDecision?.stageBClosed === true, 'Stage B is not closed');
assert(bFinal.acceptedCounts?.heroCount === expected.heroPopulation, `B hero count ${bFinal.acceptedCounts?.heroCount}`);
assert(bFinal.acceptedCounts?.exclusiveEquipmentCount === expected.exclusive, `B exclusive count ${bFinal.acceptedCounts?.exclusiveEquipmentCount}`);
assert(bFinal.acceptedCounts?.relationEdges === expected.exclusiveOwnershipRelations, `B relation edges ${bFinal.acceptedCounts?.relationEdges}`);
assert(bFinal.acceptedCounts?.byEquipmentKeys === expected.exclusiveOwnershipKeys, `B byEquipment keys ${bFinal.acceptedCounts?.byEquipmentKeys}`);
assert(bFinal.acceptedCounts?.generalEquipmentAdmitted === 0, `B general ownership admission ${bFinal.acceptedCounts?.generalEquipmentAdmitted}`);

assert(
  bConsumer.equipmentConsumer?.ownershipInput === `${contract.dependsOn.exclusiveByEquipment}#byEquipmentId`,
  `B equipment ownership input ${bConsumer.equipmentConsumer?.ownershipInput}`
);
assert(
  bConsumer.equipmentConsumer?.heroMetadataJoin === 'Join returned heroId to data/hero-name-master.v1.json by exact heroId.',
  'B Hero metadata join policy changed'
);

// Public consumer parity and admission.
const generalListIds = idSet(generalList.records);
const generalDetailIds = idSet(generalDetail.records);
const exclusiveListIds = idSet(exclusive.listRecords);
const exclusiveDetailIds = idSet(exclusive.detailRecords);
const specialIds = idSet(special.specialRecords);
const holdIds = idSet(special.holdRecords);

assert(generalList.status === 'COMPLETE_WITH_REVIEW', `general List status ${generalList.status}`);
assert(generalDetail.status === 'COMPLETE_WITH_REVIEW', `general Detail status ${generalDetail.status}`);
assert(exclusive.status === 'COMPLETE_WITH_REVIEW', `exclusive status ${exclusive.status}`);
assert(special.status === 'COMPLETE_WITH_EXPLICIT_HOLD', `special status ${special.status}`);

assert(generalListIds.size === expected.general && sameSet(generalListIds, generalDetailIds), 'general List/Detail parity failed');
assert(exclusiveListIds.size === expected.exclusive && sameSet(exclusiveListIds, exclusiveDetailIds), 'exclusive List/Detail parity failed');
assert(specialIds.size === expected.hiddenSpecial, `special IDs ${specialIds.size}`);
assert(holdIds.size === expected.hold, `hold IDs ${holdIds.size}`);

const publicIds = new Set([...generalListIds, ...exclusiveListIds]);
assert(publicIds.size === expected.publicPageReady, `public route IDs ${publicIds.size}`);
assert([...specialIds].every(id => !publicIds.has(id)), 'hidden special leaked into public consumer');
assert([...holdIds].every(id => !publicIds.has(id)), 'HOLD leaked into public consumer');
assert(sameSet(holdIds, new Set(expected.holdEquipmentIds.map(Number))), `HOLD IDs ${JSON.stringify([...holdIds])}`);

const tabCounts = countBy(generalList.records, r => r.siteTab);
assert(JSON.stringify(tabCounts) === JSON.stringify(expected.generalSiteTabs), `tab counts ${JSON.stringify(tabCounts)}`);

// Generated filter taxonomy is the only Stage 4 filter taxonomy input.
const actualTaxonomy = (generalList.filters ?? []).map(group => ({
  group: group.group,
  groupKo: group.groupKo,
  subtypes: (group.subtypes ?? []).map(s => s.subtype)
}));
assert(JSON.stringify(actualTaxonomy) === JSON.stringify(expected.filterTaxonomy), `filter taxonomy regression ${JSON.stringify(actualTaxonomy)}`);

// Exclusive owner relation is consumed from Stage B index; do not derive it here.
assert(byEquipment.schemaId === 'hero-exclusive-equipment-by-equipment/v1', `byEquipment schema ${byEquipment.schemaId}`);
assert(byEquipment.summary?.keyCount === expected.exclusiveOwnershipKeys, `byEquipment keyCount ${byEquipment.summary?.keyCount}`);
assert(byEquipment.summary?.relationCount === expected.exclusiveOwnershipRelations, `byEquipment relationCount ${byEquipment.summary?.relationCount}`);
assert(byEquipment.summary?.maxValueCountPerKey === 1, `byEquipment maxValueCountPerKey ${byEquipment.summary?.maxValueCountPerKey}`);

const ownershipIds = new Set(Object.keys(byEquipment.byEquipmentId ?? {}).map(Number));
assert(sameSet(ownershipIds, exclusiveListIds), 'byEquipment ownership keys do not equal exclusive consumer IDs');

assert(heroMaster.recordCount === expected.heroPopulation, `Hero master recordCount ${heroMaster.recordCount}`);
const heroIds = new Set((heroMaster.records ?? []).map(r => Number(r.heroId)));
let ownerHeroMissing = 0;
let ownerRelationCount = 0;
for (const [equipmentId, owners] of Object.entries(byEquipment.byEquipmentId ?? {})) {
  assert(exclusiveListIds.has(Number(equipmentId)), `ownership has non-exclusive equipment ${equipmentId}`);
  assert(Array.isArray(owners) && owners.length === 1, `ownership cardinality ${equipmentId}: ${JSON.stringify(owners)}`);
  ownerRelationCount += owners.length;
  for (const heroId of owners) if (!heroIds.has(Number(heroId))) ownerHeroMissing++;
}
assert(ownerRelationCount === expected.exclusiveOwnershipRelations, `owner relation count ${ownerRelationCount}`);
assert(ownerHeroMissing === 0, `owner Hero missing ${ownerHeroMissing}`);

// REVIEW/HOLD policy remains explicit.
assert(s3.displayIntegrity?.nameKrReview === 187 && s3.displayIntegrity?.reviewNameCandidateLeak === 0, 'Korean-name REVIEW policy regression');
assert(s3.releaseOrderReview?.generalTab3 === 32 && s3.releaseOrderReview?.exclusive === 167, 'release-order REVIEW regression');
assert(
  s3.hiddenAndHoldIntegrity?.unresolved2013Disposition === contract.admissionPolicy.hold.disposition,
  `2013 disposition ${s3.hiddenAndHoldIntegrity?.unresolved2013Disposition}`
);
assert(contract.sourceDiscipline.directConfigDataReadsForPageComposition === false, 'Stage 4 direct ConfigData reads were admitted');
assert(contract.sourceDiscipline.rederiveExclusiveOwnership === false, 'Stage 4 ownership re-derivation was admitted');

const summary = {
  version: 1,
  stage: '4-0',
  status: 'PASS',
  finalStageStatus: contract.completion.passStatus,
  contract: contractPath,
  upstream: {
    equipmentStage3: {
      status: s3.status,
      finalStageStatus: s3.finalStageStatus,
      canonical: s3.canonicalCoverage.canonical,
      publicPageReady: s3.canonicalCoverage.publicPageReady
    },
    exclusiveOwnershipStageB: {
      status: bFinal.status,
      closed: bFinal.closureDecision.stageBClosed,
      relations: bFinal.acceptedCounts.relationEdges,
      byEquipmentKeys: bFinal.acceptedCounts.byEquipmentKeys
    }
  },
  frontendInputs: {
    generalList: contract.dependsOn.generalList,
    generalDetail: contract.dependsOn.generalDetail,
    exclusiveConsumer: contract.dependsOn.exclusiveConsumer,
    exclusiveOwnership: `${contract.dependsOn.exclusiveByEquipment}#byEquipmentId`,
    heroMaster: contract.dependsOn.heroMaster,
    hiddenHoldReference: contract.dependsOn.specialUnresolved
  },
  routes: contract.routes,
  admission: {
    general: generalListIds.size,
    exclusive: exclusiveListIds.size,
    publicTotal: publicIds.size,
    hiddenSpecial: specialIds.size,
    hold: holdIds.size,
    holdEquipmentIds: [...holdIds].sort((a,b) => a-b),
    publicLeak: 0
  },
  filters: {
    tabs: tabCounts,
    taxonomy: actualTaxonomy,
    singleActiveTab: contract.generalListUi.singleActiveTab,
    multiSubtypeSelection: contract.generalListUi.multiSubtypeSelection,
    persistenceRequired: true
  },
  displayPolicy: {
    nameFallback: 'nameKr ?? nameCn',
    nameKrReview: s3.displayIntegrity.nameKrReview,
    reviewNameCandidateLeak: s3.displayIntegrity.reviewNameCandidateLeak,
    releaseOrderReview: s3.releaseOrderReview,
    restrictionRuntimeDirectProofClaimed: s3.policyRegression.restrictionRuntimeDirectProofClaimed
  },
  ownership: {
    scope: contract.exclusiveOwnership.scope,
    byEquipmentKeys: ownershipIds.size,
    relations: ownerRelationCount,
    ownerHeroMissing,
    metadataJoin: contract.exclusiveOwnership.heroMetadataJoin,
    rederivedInStage4: false
  },
  sourceDiscipline: contract.sourceDiscipline,
  completionMeaning: contract.completion.meaning,
  nextStage: contract.completion.nextStage
};

fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync('data/validation/equipment-stage4-0-frontend-consumer-summary.v1.json', `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
