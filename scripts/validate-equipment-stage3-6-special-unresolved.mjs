import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const toMap = (rows, idField) => new Map((rows ?? []).map(r => [Number(r[idField]), r]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const idSet = rows => new Set((rows ?? []).map(r => Number(r.equipmentId)));
const intersects = (a, b) => [...a].some(x => b.has(x));
const countBy = (rows, keyFn) => {
  const out = {};
  for (const row of rows) {
    const key = String(keyFn(row));
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
};

const contract = load('data/contracts/equipment-stage3-6-special-unresolved.v1.json');
const filterMap = load(contract.sources.filterMap);
const stats = load(contract.sources.stats);
const effects = load(contract.sources.effects);
const restrictions = load(contract.sources.restrictions);
const acquisition = load(contract.sources.acquisition);
const displayMetadata = load(contract.sources.displayMetadata);
const generalConsumer = load(contract.sources.generalConsumer);
const exclusiveConsumer = load(contract.sources.exclusiveConsumer);
const output = load('data/generated/equipment_stage3_6_special_unresolved.json');

const filterById = toMap(filterMap.records, 'id');
const statsById = toMap(stats.records, 'id');
const effectById = toMap(effects.records, 'equipmentId');
const restrictionById = toMap(restrictions.records, 'equipmentId');
const acquisitionById = toMap(acquisition.records, 'equipmentId');
const displayById = toMap(displayMetadata.records, 'equipmentId');

assert(output.stage === '3-6', `stage ${output.stage}`);
assert(output.status === 'COMPLETE_WITH_EXPLICIT_HOLD', `status ${output.status}`);
assert(output.specialRecords.length === contract.buckets.special.expectedCount, `special output count ${output.specialRecords.length}`);
assert(output.holdRecords.length === contract.buckets.hold.expectedCount, `hold output count ${output.holdRecords.length}`);

const specialSource = (acquisition.records ?? []).filter(r => r.acquisitionClass === contract.buckets.special.acquisitionClass);
const holdSource = (acquisition.records ?? []).filter(r => r.acquisitionClass === contract.buckets.hold.acquisitionClass);
const specialSourceIds = idSet(specialSource);
const holdSourceIds = idSet(holdSource);
const specialIds = idSet(output.specialRecords);
const holdIds = idSet(output.holdRecords);
assert(specialSourceIds.size === contract.buckets.special.expectedCount, `special source IDs ${specialSourceIds.size}`);
assert(holdSourceIds.size === contract.buckets.hold.expectedCount, `hold source IDs ${holdSourceIds.size}`);
assert(specialIds.size === specialSourceIds.size && [...specialSourceIds].every(id => specialIds.has(id)), 'special ID set mismatch');
assert(holdIds.size === holdSourceIds.size && [...holdSourceIds].every(id => holdIds.has(id)), 'hold ID set mismatch');
assert([...holdIds].every(id => contract.buckets.hold.expectedEquipmentIds.includes(id)), `unexpected hold ID set ${[...holdIds].join(',')}`);

const outputById = toMap([...output.specialRecords, ...output.holdRecords], 'equipmentId');
let exactClassification = 0;
let exactStats = 0;
let exactEffects = 0;
let exactRestrictions = 0;
let exactAcquisition = 0;
let iconVerified = 0;
let nameKrVerified = 0;
let nameKrReview = 0;
let reviewNameCandidateLeak = 0;
let specialEmptyPath = 0;
let specialPrefix = 0;
let specialBasis = 0;
let specialSiteTabNull = 0;
let holdEmptyPath = 0;
let holdBasis = 0;
let holdSiteTabNull = 0;
let publicAdmissionLeak = 0;

for (const id of [...specialIds, ...holdIds].sort((a, b) => a - b)) {
  const a = acquisitionById.get(id);
  const f = filterById.get(id);
  const s = statsById.get(id);
  const e = effectById.get(id);
  const r = restrictionById.get(id);
  const d = displayById.get(id);
  const x = outputById.get(id);
  assert(a && f && s && e && r && d && x, `missing source/output ${id}`);

  const expectedDisposition = specialIds.has(id) ? contract.buckets.special.disposition : contract.buckets.hold.disposition;
  assert(x.disposition === expectedDisposition, `disposition mismatch ${id}`);
  if (x.pageAdmission !== false) publicAdmissionLeak++;

  const expectedNameKr = d.nameKrStatus === 'VERIFIED_REFERENCE_MATCH' ? d.nameKr : null;
  const expectedIdentity = {
    equipmentId: id,
    nameCn: a.nameCn,
    nameKr: expectedNameKr,
    icon: d.icon,
    nameKrStatus: d.nameKrStatus,
    iconStatus: d.iconStatus
  };
  assert(same(x.identity, expectedIdentity), `identity mismatch ${id}`);
  if (d.iconStatus === 'VERIFIED_DIRECT' && x.identity.icon === d.icon) iconVerified++;
  if (expectedNameKr) nameKrVerified++; else nameKrReview++;
  if (d.nameKrStatus !== 'VERIFIED_REFERENCE_MATCH' && x.identity.nameKr != null) reviewNameCandidateLeak++;

  const expectedClassification = {
    group: f.group,
    groupKo: f.groupKo,
    subtype: f.subtype,
    subtypeKo: f.subtypeKo,
    groupOrder: Number(f.groupOrder),
    subtypeOrder: Number(f.subtypeOrder),
    equipmentType: Number(a.equipmentType),
    label: Number(a.label),
    sortIndex: Number(a.sortIndex),
    acquisitionClass: a.acquisitionClass,
    siteTab: a.siteTab ?? null
  };
  assert(same(x.classification, expectedClassification), `classification mismatch ${id}`);
  exactClassification++;

  const expectedStats = { maxLevel: 50, properties: s.stats };
  assert((s.stats ?? []).length > 0 && s.stats.every(p => Number(p.maxLevel) === 50), `invalid source stats ${id}`);
  assert(same(x.stats, expectedStats), `stats mismatch ${id}`);
  exactStats++;

  const expectedEffect = {
    maxEffectSkillId: Number(e.maxEffectSkillId),
    effectName: e.effectName,
    effectText: e.effectText,
    effectSegments: e.effectSegments
  };
  assert(same(x.effect, expectedEffect), `effect mismatch ${id}`);
  exactEffects++;

  const expectedRestriction = { mode: r.mode, generalArmyIds: r.generalArmyIds, specialJobIds: r.specialJobIds };
  assert(same(x.restriction, expectedRestriction), `restriction mismatch ${id}`);
  exactRestrictions++;

  const paths = Array.isArray(a.raw?.getPathList) ? a.raw.getPathList : [];
  const expectedAcquisition = {
    releaseGroupDate: a.releaseGroupDate ?? null,
    confidencePercent: Number(a.confidencePercent),
    classificationBasis: a.classificationBasis,
    getPathListCount: paths.length,
    getPathList: paths
  };
  assert(same(x.acquisition, expectedAcquisition), `acquisition mismatch ${id}`);
  exactAcquisition++;

  if (specialIds.has(id)) {
    if (paths.length === 0) specialEmptyPath++;
    if (String(a.nameCn ?? '').startsWith(contract.buckets.special.evidence.namePrefix)) specialPrefix++;
    if (a.classificationBasis === contract.buckets.special.evidence.classificationBasis) specialBasis++;
    if (a.siteTab == null) specialSiteTabNull++;
  } else {
    if (paths.length === 0) holdEmptyPath++;
    if (a.classificationBasis === contract.buckets.hold.evidence.classificationBasis) holdBasis++;
    if (a.siteTab == null) holdSiteTabNull++;
  }
}

assert(iconVerified === contract.partitionPolicy.expectedSpecial + contract.partitionPolicy.expectedHold, `icon coverage ${iconVerified}`);
assert(reviewNameCandidateLeak === 0, `review name leak ${reviewNameCandidateLeak}`);
assert(publicAdmissionLeak === 0, `public admission leak ${publicAdmissionLeak}`);
assert(specialEmptyPath === contract.buckets.special.expectedCount, `special empty path ${specialEmptyPath}`);
assert(specialPrefix === contract.buckets.special.expectedCount, `special prefix ${specialPrefix}`);
assert(specialBasis === contract.buckets.special.expectedCount, `special basis ${specialBasis}`);
assert(specialSiteTabNull === contract.buckets.special.expectedCount, `special siteTab null ${specialSiteTabNull}`);
assert(holdEmptyPath === contract.buckets.hold.expectedCount, `hold empty path ${holdEmptyPath}`);
assert(holdBasis === contract.buckets.hold.expectedCount, `hold basis ${holdBasis}`);
assert(holdSiteTabNull === contract.buckets.hold.expectedCount, `hold siteTab null ${holdSiteTabNull}`);

const generalIds = idSet(generalConsumer.records);
const exclusiveIds = idSet(exclusiveConsumer.listRecords);
assert(generalIds.size === contract.partitionPolicy.expectedGeneral, `general count ${generalIds.size}`);
assert(exclusiveIds.size === contract.partitionPolicy.expectedExclusive, `exclusive count ${exclusiveIds.size}`);
assert(!intersects(generalIds, exclusiveIds), 'general/exclusive overlap');
assert(!intersects(generalIds, specialIds), 'general/special overlap');
assert(!intersects(generalIds, holdIds), 'general/hold overlap');
assert(!intersects(exclusiveIds, specialIds), 'exclusive/special overlap');
assert(!intersects(exclusiveIds, holdIds), 'exclusive/hold overlap');
assert(!intersects(specialIds, holdIds), 'special/hold overlap');

const canonicalIds = new Set((acquisition.records ?? []).map(r => Number(r.equipmentId)));
const unionIds = new Set([...generalIds, ...exclusiveIds, ...specialIds, ...holdIds]);
assert(canonicalIds.size === contract.partitionPolicy.expectedCanonical, `canonical ${canonicalIds.size}`);
assert(unionIds.size === canonicalIds.size && [...canonicalIds].every(id => unionIds.has(id)), 'canonical partition closure failure');

assert(output.policy.emptyGetPathListMeaningInvented === false, 'empty path meaning was invented');
assert(output.policy.publicSiteTabInvented === false, 'siteTab was invented');
assert(output.policy.acquisitionChronologyInvented === false, 'chronology was invented');
assert(output.policy.stage2SemanticsReopened === false, 'Stage 2 semantics reopened');
assert(output.policy.statsRecalculated === false, 'stats recalculated');
assert(output.policy.effectTextRewritten === false, 'effect rewritten');

const allRecords = [...output.specialRecords, ...output.holdRecords];
const holdSnapshot = output.holdRecords.map(r => ({ equipmentId: r.equipmentId, nameCn: r.identity.nameCn, disposition: r.disposition, getPathListCount: r.acquisition.getPathListCount }));
const summary = {
  stage: '3-6',
  status: 'PASS',
  finalStageStatus: 'COMPLETE_WITH_EXPLICIT_HOLD',
  handled: {
    soulSpecial: output.specialRecords.length,
    unresolvedNoPath: output.holdRecords.length,
    total: allRecords.length
  },
  evidence: {
    soulSpecial: {
      emptyGetPathList: specialEmptyPath,
      soulNamePrefix: specialPrefix,
      classificationBasis: specialBasis,
      siteTabNull: specialSiteTabNull
    },
    unresolvedNoPath: {
      expectedIds: contract.buckets.hold.expectedEquipmentIds,
      emptyGetPathList: holdEmptyPath,
      classificationBasis: holdBasis,
      siteTabNull: holdSiteTabNull,
      records: holdSnapshot
    }
  },
  displayCoverage: {
    iconVerified,
    nameKrVerified,
    nameKrReview
  },
  exactCopies: {
    classification: exactClassification,
    stats: exactStats,
    effects: exactEffects,
    restrictions: exactRestrictions,
    acquisition: exactAcquisition
  },
  stats: {
    propertyCountDistribution: countBy(allRecords, r => r.stats.properties.length),
    allMaxLevel50: allRecords.every(r => r.stats.maxLevel === 50 && r.stats.properties.every(p => Number(p.maxLevel) === 50))
  },
  restrictions: {
    modeCounts: countBy(allRecords, r => r.restriction.mode),
    semanticStatus: restrictions.semantics.status,
    semanticConfidence: restrictions.semantics.confidence,
    runtimeDirectProofClaimed: false
  },
  partition: {
    general: generalIds.size,
    exclusive: exclusiveIds.size,
    soulSpecial: specialIds.size,
    unresolvedNoPath: holdIds.size,
    canonical: canonicalIds.size,
    union: unionIds.size,
    disjoint: true,
    closed: true
  },
  integrity: {
    publicAdmissionLeak,
    reviewNameCandidateLeak,
    emptyGetPathListMeaningInvented: false,
    publicSiteTabInvented: false,
    acquisitionChronologyInvented: false,
    stage2SemanticsReopened: false,
    statsRecalculated: false,
    effectTextRewritten: false
  },
  review: {
    inheritedNameKr: nameKrReview,
    soulSpecialAcquisitionMeaning: 'PRESERVED_CLASSIFICATION_ONLY_NO_FURTHER_INFERENCE',
    unresolvedEquipment2013: 'HOLD_UNRESOLVED_ACQUISITION',
    restrictionRuntimeDirectProof: 'UNLOCATED_LOW_PRIORITY'
  },
  nextStage: '3-7 whole Stage 3 validation'
};

fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync('data/validation/equipment-stage3-6-special-unresolved-summary.v1.json', `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
