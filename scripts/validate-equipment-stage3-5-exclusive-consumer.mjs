import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const toMap = (rows, idField) => new Map((rows ?? []).map(r => [Number(r[idField]), r]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const idSet = rows => new Set((rows ?? []).map(r => Number(r.equipmentId)));
const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
const countBy = (rows, keyFn) => {
  const out = {};
  for (const row of rows) {
    const key = String(keyFn(row));
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
};
const compareList = (a, b) => {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.subtypeOrder !== b.subtypeOrder) return a.subtypeOrder - b.subtypeOrder;
  if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
  return a.equipmentId - b.equipmentId;
};

const contract = load('data/contracts/equipment-stage3-5-exclusive-consumer.v1.json');
const pageSchema = load(contract.sources.pageSchema);
const filterMap = load(contract.sources.filterMap);
const stats = load(contract.sources.stats);
const effects = load(contract.sources.effects);
const restrictions = load(contract.sources.restrictions);
const acquisition = load(contract.sources.acquisition);
const displayMetadata = load(contract.sources.displayMetadata);
const consumer = load('data/generated/equipment_stage3_5_exclusive_consumer.json');

const filterById = toMap(filterMap.records, 'id');
const statsById = toMap(stats.records, 'id');
const effectById = toMap(effects.records, 'equipmentId');
const restrictionById = toMap(restrictions.records, 'equipmentId');
const acquisitionById = toMap(acquisition.records, 'equipmentId');
const displayById = toMap(displayMetadata.records, 'equipmentId');

const exclusiveSource = (acquisition.records ?? []).filter(r => r.acquisitionClass === contract.admission.class);
const sourceIds = idSet(exclusiveSource);
const listIds = idSet(consumer.listRecords);
const detailIds = idSet(consumer.detailRecords);

assert(consumer.stage === '3-5', `stage ${consumer.stage}`);
assert(consumer.status === 'COMPLETE_WITH_REVIEW', `status ${consumer.status}`);
assert(exclusiveSource.length === contract.admission.expectedTotal, `source exclusive count ${exclusiveSource.length}`);
assert(consumer.listRecords.length === contract.admission.expectedTotal, `list count ${consumer.listRecords.length}`);
assert(consumer.detailRecords.length === contract.admission.expectedTotal, `detail count ${consumer.detailRecords.length}`);
assert(listIds.size === contract.admission.expectedTotal, `unique list IDs ${listIds.size}`);
assert(detailIds.size === contract.admission.expectedTotal, `unique detail IDs ${detailIds.size}`);
assert(sameSet(sourceIds, listIds), 'exclusive source/list ID set mismatch');
assert(sameSet(sourceIds, detailIds), 'exclusive source/detail ID set mismatch');

const requiredListFields = Object.keys(pageSchema.listRecord.fields);
let identityAndListClassification = 0;
let exactStats = 0;
let exactEffects = 0;
let exactRestrictions = 0;
let exactAcquisition = 0;
let pathType46Verified = 0;
let iconVerified = 0;
let nameKrVerified = 0;
let nameKrReview = 0;
let reviewNameCandidateLeak = 0;
let excludedClassLeak = 0;
let heroOwnershipLeak = 0;

const listById = toMap(consumer.listRecords, 'equipmentId');
const detailById = toMap(consumer.detailRecords, 'equipmentId');

for (const id of [...sourceIds].sort((a, b) => a - b)) {
  const a = acquisitionById.get(id);
  const f = filterById.get(id);
  const s = statsById.get(id);
  const e = effectById.get(id);
  const r = restrictionById.get(id);
  const d = displayById.get(id);
  const l = listById.get(id);
  const x = detailById.get(id);

  assert(a && f && s && e && r && d && l && x, `missing joined source/consumer record ${id}`);

  if (a.acquisitionClass !== contract.admission.class || a.siteTab != null || l.acquisitionClass !== contract.admission.class || l.siteTab != null || x.classification.acquisitionClass !== contract.admission.class || x.classification.siteTab != null) excludedClassLeak++;

  const paths = Array.isArray(a.raw?.getPathList) ? a.raw.getPathList : [];
  assert(paths.length === contract.admission.requiredAcquisitionEvidence.getPathListCount, `path count ${id}`);
  assert(Number(paths[0]?.PathType) === contract.admission.requiredAcquisitionEvidence.pathType, `PathType ${id}`);
  assert(a.classificationBasis === contract.admission.requiredAcquisitionEvidence.classificationBasis, `classificationBasis ${id}`);
  pathType46Verified++;

  for (const field of requiredListFields) assert(Object.prototype.hasOwnProperty.call(l, field), `list ${id} missing ${field}`);

  const expectedNameKr = d.nameKrStatus === 'VERIFIED_REFERENCE_MATCH' ? d.nameKr : null;
  if (d.iconStatus === 'VERIFIED_DIRECT' && l.icon === d.icon && x.identity.icon === d.icon) iconVerified++;
  if (expectedNameKr) nameKrVerified++; else nameKrReview++;
  if (d.nameKrStatus !== 'VERIFIED_REFERENCE_MATCH' && (l.nameKr != null || x.identity.nameKr != null)) reviewNameCandidateLeak++;

  const expectedList = {
    equipmentId: id,
    nameCn: a.nameCn,
    nameKr: expectedNameKr,
    icon: d.icon,
    group: f.group,
    groupKo: f.groupKo,
    subtype: f.subtype,
    subtypeKo: f.subtypeKo,
    groupOrder: Number(f.groupOrder),
    subtypeOrder: Number(f.subtypeOrder),
    acquisitionClass: a.acquisitionClass,
    siteTab: null,
    releaseGroupDate: a.releaseGroupDate ?? null,
    sortIndex: Number(a.sortIndex),
    effectName: e.effectName,
    effectText: e.effectText
  };
  assert(same(l, expectedList), `list source mismatch ${id}`);

  const expectedIdentity = { equipmentId: id, nameCn: a.nameCn, nameKr: expectedNameKr, icon: d.icon };
  const expectedClassification = {
    group: f.group,
    groupKo: f.groupKo,
    subtype: f.subtype,
    subtypeKo: f.subtypeKo,
    groupOrder: Number(f.groupOrder),
    subtypeOrder: Number(f.subtypeOrder),
    equipmentType: Number(a.equipmentType),
    label: Number(a.label),
    acquisitionClass: a.acquisitionClass,
    siteTab: null,
    sortIndex: Number(a.sortIndex)
  };
  assert(same(x.identity, expectedIdentity), `identity mismatch ${id}`);
  assert(same(x.classification, expectedClassification), `classification mismatch ${id}`);
  identityAndListClassification++;

  const expectedStats = { maxLevel: 50, properties: s.stats };
  assert((s.stats ?? []).length > 0 && s.stats.every(p => Number(p.maxLevel) === 50), `source maxLevel mismatch ${id}`);
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

  const expectedAcquisition = {
    releaseGroupDate: a.releaseGroupDate ?? null,
    confidencePercent: Number(a.confidencePercent),
    classificationBasis: a.classificationBasis
  };
  assert(same(x.acquisition, expectedAcquisition), `acquisition mismatch ${id}`);
  exactAcquisition++;

  for (const obj of [l, x]) {
    if ('heroId' in obj || 'heroIds' in obj || 'ownerHeroId' in obj || 'ownerHeroIds' in obj) heroOwnershipLeak++;
  }
}

assert(excludedClassLeak === 0, `excluded/general class leak ${excludedClassLeak}`);
assert(pathType46Verified === contract.admission.expectedTotal, `PathType46 coverage ${pathType46Verified}`);
assert(iconVerified === contract.admission.expectedTotal, `icon coverage ${iconVerified}`);
assert(reviewNameCandidateLeak === 0, `review Korean-name leak ${reviewNameCandidateLeak}`);
assert(heroOwnershipLeak === 0, `hero ownership leak ${heroOwnershipLeak}`);
assert(consumer.policy?.heroOwnershipGenerated === false, 'hero ownership must remain outside Stage 3-5');

for (let i = 1; i < consumer.listRecords.length; i++) {
  assert(compareList(consumer.listRecords[i - 1], consumer.listRecords[i]) <= 0, `list ordering mismatch at ${i}`);
}

const releaseDateKnown = consumer.listRecords.filter(r => r.releaseGroupDate).length;
const propertyCounts = countBy(consumer.detailRecords, r => r.stats.properties.length);
const restrictionModes = countBy(consumer.detailRecords, r => r.restriction.mode);

const summary = {
  stage: '3-5',
  status: 'PASS',
  finalStageStatus: 'COMPLETE_WITH_REVIEW',
  exclusiveEquipmentCount: contract.admission.expectedTotal,
  uniqueRouteKeys: detailIds.size,
  displayCoverage: {
    iconVerified,
    nameKrVerified,
    nameKrReview
  },
  acquisitionEvidence: {
    pathType46Verified,
    siteTabNull: consumer.listRecords.filter(r => r.siteTab == null).length,
    classificationBasisVerified: pathType46Verified,
    releaseDateKnown,
    releaseDateReview: contract.admission.expectedTotal - releaseDateKnown
  },
  exactCopies: {
    identityAndListClassification,
    stats: exactStats,
    effects: exactEffects,
    restrictions: exactRestrictions,
    acquisition: exactAcquisition
  },
  stats: {
    propertyCountDistribution: propertyCounts,
    allMaxLevel50: consumer.detailRecords.every(r => r.stats.maxLevel === 50 && r.stats.properties.every(p => Number(p.maxLevel) === 50))
  },
  restrictions: {
    modeCounts: restrictionModes,
    semanticStatus: restrictions.semantics.status,
    semanticConfidence: restrictions.semantics.confidence,
    runtimeDirectProofClaimed: false
  },
  integrity: {
    excludedClassLeak,
    reviewNameCandidateLeak,
    heroOwnershipLeak,
    stage2SemanticsReopened: false,
    statsRecalculated: false,
    effectTextRewritten: false,
    acquisitionChronologyInvented: false
  },
  review: {
    inheritedNameKr: nameKrReview,
    exactExclusiveReleaseOrder: contract.admission.expectedTotal - releaseDateKnown,
    heroOwnership: 'OUT_OF_SCOPE_SEPARATE_HERO_CONSUMER',
    restrictionRuntimeDirectProof: 'UNLOCATED_LOW_PRIORITY'
  },
  nextStage: '3-6 special/unresolved equipment handling'
};

fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync('data/validation/equipment-stage3-5-exclusive-consumer-summary.v1.json', `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
