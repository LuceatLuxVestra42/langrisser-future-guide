import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const idSet = rows => new Set((rows ?? []).map(r => Number(r.equipmentId)));
const sameSet = (a, b) => a.size === b.size && [...a].every(id => b.has(id));
const intersects = (a, b) => [...a].some(id => b.has(id));
const toMap = rows => new Map((rows ?? []).map(r => [Number(r.equipmentId), r]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const countBy = (rows, keyFn) => {
  const out = {};
  for (const row of rows ?? []) {
    const key = String(keyFn(row));
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
};

const contract = load('data/contracts/equipment-stage3-7-whole-stage-validation.v1.json');
const s30 = load(contract.sources.stage30Summary);
const s31 = load(contract.sources.stage31Summary);
const s32 = load(contract.sources.stage32Summary);
const s33 = load(contract.sources.stage33Summary);
const s34 = load(contract.sources.stage34Summary);
const s35 = load(contract.sources.stage35Summary);
const s36 = load(contract.sources.stage36Summary);
const acquisition = load(contract.sources.acquisition);
const display = load(contract.sources.displayMetadata);
const generalList = load(contract.sources.generalList);
const generalDetail = load(contract.sources.generalDetail);
const exclusive = load(contract.sources.exclusiveConsumer);
const special = load(contract.sources.specialUnresolved);

const expected = contract.expected;

// Checkpoint continuity: prior stage validators must still be green.
for (const [label, summary] of Object.entries({s30, s31, s32, s33, s34, s35, s36})) {
  assert(summary.status === 'PASS', `${label} status ${summary.status}`);
}
assert(s30.canonicalEquipmentCount === expected.canonical, `3-0 canonical ${s30.canonicalEquipmentCount}`);
assert(s31.schemaReadiness?.structurallyPageReady === expected.publicPageReady, `3-1 pageReady ${s31.schemaReadiness?.structurallyPageReady}`);
assert(s32.iconCoverage?.pageReadyVerified === expected.display.iconVerifiedPublic && s32.iconCoverage?.missing === 0, '3-2 icon coverage regression');
assert(s33.generalEquipmentCount === expected.general, `3-3 count ${s33.generalEquipmentCount}`);
assert(s34.generalEquipmentCount === expected.general && s34.uniqueRouteKeys === expected.general, '3-4 count/route regression');
assert(s35.exclusiveEquipmentCount === expected.exclusive && s35.uniqueRouteKeys === expected.exclusive, '3-5 count/route regression');
assert(s36.partition?.closed === true && s36.partition?.disjoint === true, '3-6 partition checkpoint regression');

// Actual consumer ID sets.
const canonicalIds = idSet(acquisition.records);
const generalListIds = idSet(generalList.records);
const generalDetailIds = idSet(generalDetail.records);
const exclusiveListIds = idSet(exclusive.listRecords);
const exclusiveDetailIds = idSet(exclusive.detailRecords);
const specialIds = idSet(special.specialRecords);
const holdIds = idSet(special.holdRecords);

assert(canonicalIds.size === expected.canonical, `canonical IDs ${canonicalIds.size}`);
assert(generalListIds.size === expected.general, `general List IDs ${generalListIds.size}`);
assert(generalDetailIds.size === expected.general, `general Detail IDs ${generalDetailIds.size}`);
assert(exclusiveListIds.size === expected.exclusive, `exclusive List IDs ${exclusiveListIds.size}`);
assert(exclusiveDetailIds.size === expected.exclusive, `exclusive Detail IDs ${exclusiveDetailIds.size}`);
assert(specialIds.size === expected.soulSpecial, `special IDs ${specialIds.size}`);
assert(holdIds.size === expected.hold, `hold IDs ${holdIds.size}`);
assert(sameSet(generalListIds, generalDetailIds), 'general List/Detail ID mismatch');
assert(sameSet(exclusiveListIds, exclusiveDetailIds), 'exclusive List/Detail ID mismatch');

const publicIds = new Set([...generalListIds, ...exclusiveListIds]);
assert(publicIds.size === expected.publicPageReady, `public route keys ${publicIds.size}`);
assert(!intersects(generalListIds, exclusiveListIds), 'general/exclusive overlap');
assert(!intersects(publicIds, specialIds), 'special leaked into public consumers');
assert(!intersects(publicIds, holdIds), 'hold leaked into public consumers');
assert(!intersects(specialIds, holdIds), 'special/hold overlap');

const union = new Set([...publicIds, ...specialIds, ...holdIds]);
assert(union.size === expected.canonical && sameSet(union, canonicalIds), `canonical partition closure failed: union ${union.size}`);

// Acquisition-class partition must match consumer admission exactly.
const acqById = toMap(acquisition.records);
for (const id of generalListIds) {
  const cls = acqById.get(id)?.acquisitionClass;
  assert(['launch', 'legacy-additional', 'current-additional'].includes(cls), `general ${id} acquisitionClass ${cls}`);
}
for (const id of exclusiveListIds) assert(acqById.get(id)?.acquisitionClass === 'exclusive-equipment', `exclusive ${id} class regression`);
for (const id of specialIds) assert(acqById.get(id)?.acquisitionClass === 'soul-special', `special ${id} class regression`);
for (const id of holdIds) assert(acqById.get(id)?.acquisitionClass === 'unresolved-no-path', `hold ${id} class regression`);

assert(same(countBy(generalList.records, r => r.siteTab), expected.siteTabs), `general tab counts ${JSON.stringify(countBy(generalList.records, r => r.siteTab))}`);

// Consumer parity and routing consistency.
const generalDetailById = toMap(generalDetail.records);
let generalParity = 0;
for (const list of generalList.records) {
  const detail = generalDetailById.get(Number(list.equipmentId));
  assert(detail, `missing general Detail ${list.equipmentId}`);
  assert(detail.equipmentId === list.equipmentId, `general route mismatch ${list.equipmentId}`);
  assert(same(detail.identity, {
    equipmentId: list.equipmentId,
    nameCn: list.nameCn,
    nameKr: list.nameKr,
    icon: list.icon
  }), `general identity mismatch ${list.equipmentId}`);
  for (const field of ['group','groupKo','subtype','subtypeKo','groupOrder','subtypeOrder','acquisitionClass','siteTab','sortIndex']) {
    assert(detail.classification?.[field] === list[field], `general classification ${field} mismatch ${list.equipmentId}`);
  }
  assert(detail.effect?.effectName === list.effectName && detail.effect?.effectText === list.effectText, `general effect preview mismatch ${list.equipmentId}`);
  generalParity++;
}

const exclusiveDetailById = toMap(exclusive.detailRecords);
let exclusiveParity = 0;
for (const list of exclusive.listRecords) {
  const detail = exclusiveDetailById.get(Number(list.equipmentId));
  assert(detail, `missing exclusive Detail ${list.equipmentId}`);
  assert(detail.equipmentId === list.equipmentId, `exclusive route mismatch ${list.equipmentId}`);
  assert(same(detail.identity, {
    equipmentId: list.equipmentId,
    nameCn: list.nameCn,
    nameKr: list.nameKr,
    icon: list.icon
  }), `exclusive identity mismatch ${list.equipmentId}`);
  for (const field of ['group','groupKo','subtype','subtypeKo','groupOrder','subtypeOrder','acquisitionClass','siteTab','sortIndex']) {
    assert(detail.classification?.[field] === list[field], `exclusive classification ${field} mismatch ${list.equipmentId}`);
  }
  assert(detail.effect?.effectName === list.effectName && detail.effect?.effectText === list.effectText, `exclusive effect preview mismatch ${list.equipmentId}`);
  exclusiveParity++;
}

// Display metadata integrity. No REVIEW candidate may leak into public nameKr.
const displayById = toMap(display.records);
let iconVerified = 0;
let nameKrVerified = 0;
let nameKrReview = 0;
let reviewNameCandidateLeak = 0;
for (const id of publicIds) {
  const d = displayById.get(id);
  assert(d, `missing display metadata ${id}`);
  const consumerList = generalListIds.has(id)
    ? generalList.records.find(r => Number(r.equipmentId) === id)
    : exclusive.listRecords.find(r => Number(r.equipmentId) === id);
  assert(d.iconStatus === 'VERIFIED_DIRECT' && consumerList.icon === d.icon, `icon mismatch ${id}`);
  iconVerified++;
  if (d.nameKrStatus === 'VERIFIED_REFERENCE_MATCH') {
    assert(consumerList.nameKr === d.nameKr && typeof d.nameKr === 'string' && d.nameKr.length > 0, `verified nameKr mismatch ${id}`);
    nameKrVerified++;
  } else {
    if (consumerList.nameKr != null) reviewNameCandidateLeak++;
    nameKrReview++;
  }
}
assert(iconVerified === expected.display.iconVerifiedPublic, `verified public icons ${iconVerified}`);
assert(nameKrVerified === expected.display.nameKrVerifiedPublic, `verified public Korean names ${nameKrVerified}`);
assert(nameKrReview === expected.display.nameKrReviewPublic, `review public Korean names ${nameKrReview}`);
assert(reviewNameCandidateLeak === 0, `review Korean-name candidate leak ${reviewNameCandidateLeak}`);

// Hidden/HOLD records must stay non-public and preserve explicit dispositions.
for (const r of special.specialRecords) {
  assert(r.disposition === 'HIDDEN_SPECIAL' && r.pageAdmission === false, `special disposition ${r.equipmentId}`);
  assert(r.classification?.siteTab == null, `special public siteTab ${r.equipmentId}`);
}
assert(special.holdRecords.length === expected.explicitHoldIds.length, `hold record count ${special.holdRecords.length}`);
for (const id of expected.explicitHoldIds) {
  const r = special.holdRecords.find(x => Number(x.equipmentId) === Number(id));
  assert(r, `missing explicit HOLD ${id}`);
  assert(r.disposition === contract.explicitHold.status && r.pageAdmission === false, `HOLD disposition ${id}`);
  assert(r.classification?.siteTab == null, `HOLD public siteTab ${id}`);
  assert(r.acquisition?.getPathListCount === 0 && Array.isArray(r.acquisition?.getPathList) && r.acquisition.getPathList.length === 0, `HOLD GetPathList ${id}`);
}

// Review preservation: known unknowns must still be explicit, not fabricated.
const tab3 = generalList.records.filter(r => Number(r.siteTab) === 3);
const tab3ReleaseReview = tab3.filter(r => r.releaseGroupDate == null).length;
const exclusiveReleaseReview = exclusive.listRecords.filter(r => r.releaseGroupDate == null).length;
assert(tab3ReleaseReview === expected.releaseOrderReview.generalTab3, `tab3 release review ${tab3ReleaseReview}`);
assert(exclusiveReleaseReview === expected.releaseOrderReview.exclusive, `exclusive release review ${exclusiveReleaseReview}`);
assert(tab3ReleaseReview + exclusiveReleaseReview === expected.releaseOrderReview.total, 'release-order review total regression');
assert(s33.policy?.inventedKoreanNames === 0 && s33.policy?.inventedReleaseDates === 0, '3-3 invented display/release data regression');
assert(s34.integrity?.stage2SemanticsReopened === false && s34.integrity?.statsRecalculated === false && s34.integrity?.effectTextRewritten === false && s34.integrity?.acquisitionChronologyInvented === false, '3-4 semantic policy regression');
assert(s35.integrity?.stage2SemanticsReopened === false && s35.integrity?.heroOwnershipLeak === 0 && s35.integrity?.acquisitionChronologyInvented === false, '3-5 semantic/ownership policy regression');
assert(s36.integrity?.stage2SemanticsReopened === false && s36.integrity?.emptyGetPathListMeaningInvented === false && s36.integrity?.publicAdmissionLeak === 0, '3-6 hidden/HOLD policy regression');
assert(s34.restrictions?.runtimeDirectProofClaimed === false && s35.restrictions?.runtimeDirectProofClaimed === false && s36.restrictions?.runtimeDirectProofClaimed === false, 'restriction runtime proof was silently upgraded');

const summary = {
  stage: '3-7',
  status: 'PASS',
  finalStageStatus: contract.completion.passStatus,
  checkpointContinuity: {
    stage30: s30.status,
    stage31: s31.status,
    stage32: s32.status,
    stage33: s33.status,
    stage34: s34.status,
    stage35: s35.status,
    stage36: s36.status
  },
  canonicalCoverage: {
    canonical: canonicalIds.size,
    general: generalListIds.size,
    exclusive: exclusiveListIds.size,
    soulSpecial: specialIds.size,
    hold: holdIds.size,
    publicPageReady: publicIds.size,
    union: union.size,
    disjoint: true,
    closed: true
  },
  consumerParity: {
    generalListDetail: generalParity,
    exclusiveListDetail: exclusiveParity,
    uniquePublicRouteKeys: publicIds.size,
    routeKey: 'equipmentId'
  },
  displayIntegrity: {
    iconVerified,
    nameKrVerified,
    nameKrReview,
    reviewNameCandidateLeak
  },
  releaseOrderReview: {
    generalTab3: tab3ReleaseReview,
    exclusive: exclusiveReleaseReview,
    total: tab3ReleaseReview + exclusiveReleaseReview
  },
  hiddenAndHoldIntegrity: {
    hiddenSpecial: special.specialRecords.length,
    explicitHold: special.holdRecords.length,
    publicLeak: 0,
    holdIds: expected.explicitHoldIds,
    unresolved2013Disposition: contract.explicitHold.status
  },
  policyRegression: {
    stage2SemanticsReopened: false,
    inventedKoreanNames: false,
    inventedReleaseDates: false,
    effectTextRewritten: false,
    statsRecalculated: false,
    acquisitionChronologyInvented: false,
    heroOwnershipInvented: false,
    emptyGetPathListMeaningInvented: false,
    restrictionRuntimeDirectProofClaimed: false
  },
  nonBlockingReview: contract.nonBlockingReview,
  explicitHold: contract.explicitHold,
  completionMeaning: contract.completion.meaning,
  nextStage: contract.completion.nextStage
};

fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync('data/validation/equipment-stage3-7-whole-stage-summary.v1.json', `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
