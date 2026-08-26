import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const toMap = (rows, idField) => new Map((rows ?? []).map(r => [Number(r[idField]), r]));
const idSet = rows => new Set((rows ?? []).map(r => Number(r.equipmentId)));
const countBy = (rows, keyFn) => {
  const out = {};
  for (const row of rows) {
    const key = String(keyFn(row));
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
};
const intersects = (a, b) => [...a].some(x => b.has(x));

const contract = load('data/contracts/equipment-stage3-6-special-unresolved.v1.json');
const filterMap = load(contract.sources.filterMap);
const stats = load(contract.sources.stats);
const effects = load(contract.sources.effects);
const restrictions = load(contract.sources.restrictions);
const acquisition = load(contract.sources.acquisition);
const displayMetadata = load(contract.sources.displayMetadata);
const generalConsumer = load(contract.sources.generalConsumer);
const exclusiveConsumer = load(contract.sources.exclusiveConsumer);

const filterById = toMap(filterMap.records, 'id');
const statsById = toMap(stats.records, 'id');
const effectById = toMap(effects.records, 'equipmentId');
const restrictionById = toMap(restrictions.records, 'equipmentId');
const displayById = toMap(displayMetadata.records, 'equipmentId');

const specialSource = (acquisition.records ?? []).filter(r => r.acquisitionClass === contract.buckets.special.acquisitionClass);
const holdSource = (acquisition.records ?? []).filter(r => r.acquisitionClass === contract.buckets.hold.acquisitionClass);
assert(specialSource.length === contract.buckets.special.expectedCount, `special count ${specialSource.length}`);
assert(holdSource.length === contract.buckets.hold.expectedCount, `hold count ${holdSource.length}`);

function buildPreservedRecord(a, disposition) {
  const id = Number(a.equipmentId);
  const f = filterById.get(id);
  const s = statsById.get(id);
  const e = effectById.get(id);
  const r = restrictionById.get(id);
  const d = displayById.get(id);
  assert(f && s && e && r && d, `missing frozen source for ${id}`);
  assert(d.iconStatus === 'VERIFIED_DIRECT' && typeof d.icon === 'string' && d.icon.length > 0, `unverified icon ${id}`);
  const nameKr = d.nameKrStatus === 'VERIFIED_REFERENCE_MATCH' ? d.nameKr : null;
  if (d.nameKrStatus !== 'VERIFIED_REFERENCE_MATCH') assert(nameKr === null, `review name leaked ${id}`);
  const statRows = Array.isArray(s.stats) ? s.stats : [];
  assert(statRows.length > 0 && statRows.every(x => Number(x.maxLevel) === 50), `invalid stats ${id}`);
  const paths = Array.isArray(a.raw?.getPathList) ? a.raw.getPathList : [];

  return {
    equipmentId: id,
    disposition,
    pageAdmission: false,
    identity: {
      equipmentId: id,
      nameCn: a.nameCn,
      nameKr,
      icon: d.icon,
      nameKrStatus: d.nameKrStatus,
      iconStatus: d.iconStatus
    },
    classification: {
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
    },
    stats: {
      maxLevel: 50,
      properties: statRows
    },
    effect: {
      maxEffectSkillId: Number(e.maxEffectSkillId),
      effectName: e.effectName,
      effectText: e.effectText,
      effectSegments: e.effectSegments
    },
    restriction: {
      mode: r.mode,
      generalArmyIds: r.generalArmyIds,
      specialJobIds: r.specialJobIds
    },
    acquisition: {
      releaseGroupDate: a.releaseGroupDate ?? null,
      confidencePercent: Number(a.confidencePercent),
      classificationBasis: a.classificationBasis,
      getPathListCount: paths.length,
      getPathList: paths
    }
  };
}

const specialRecords = specialSource.map(a => {
  const paths = Array.isArray(a.raw?.getPathList) ? a.raw.getPathList : [];
  assert(a.siteTab == null, `soul-special ${a.equipmentId} has siteTab ${a.siteTab}`);
  assert(paths.length === contract.buckets.special.evidence.getPathListCount, `soul-special ${a.equipmentId} path count ${paths.length}`);
  assert(String(a.nameCn ?? '').startsWith(contract.buckets.special.evidence.namePrefix), `soul-special ${a.equipmentId} missing name prefix`);
  assert(a.classificationBasis === contract.buckets.special.evidence.classificationBasis, `soul-special ${a.equipmentId} classificationBasis`);
  return buildPreservedRecord(a, contract.buckets.special.disposition);
});

const holdRecords = holdSource.map(a => {
  const paths = Array.isArray(a.raw?.getPathList) ? a.raw.getPathList : [];
  assert(contract.buckets.hold.expectedEquipmentIds.includes(Number(a.equipmentId)), `unexpected hold ID ${a.equipmentId}`);
  assert(a.siteTab == null, `hold ${a.equipmentId} has siteTab ${a.siteTab}`);
  assert(paths.length === contract.buckets.hold.evidence.getPathListCount, `hold ${a.equipmentId} path count ${paths.length}`);
  assert(a.classificationBasis === contract.buckets.hold.evidence.classificationBasis, `hold ${a.equipmentId} classificationBasis`);
  return buildPreservedRecord(a, contract.buckets.hold.disposition);
});

const comparePreserved = (a, b) => {
  if (a.classification.groupOrder !== b.classification.groupOrder) return a.classification.groupOrder - b.classification.groupOrder;
  if (a.classification.subtypeOrder !== b.classification.subtypeOrder) return a.classification.subtypeOrder - b.classification.subtypeOrder;
  if (a.classification.sortIndex !== b.classification.sortIndex) return a.classification.sortIndex - b.classification.sortIndex;
  return a.equipmentId - b.equipmentId;
};
specialRecords.sort(comparePreserved);
holdRecords.sort((a, b) => a.equipmentId - b.equipmentId);

const generalIds = idSet(generalConsumer.records);
const exclusiveIds = idSet(exclusiveConsumer.listRecords);
const specialIds = idSet(specialRecords);
const holdIds = idSet(holdRecords);
assert(generalIds.size === contract.partitionPolicy.expectedGeneral, `general partition ${generalIds.size}`);
assert(exclusiveIds.size === contract.partitionPolicy.expectedExclusive, `exclusive partition ${exclusiveIds.size}`);
assert(specialIds.size === contract.partitionPolicy.expectedSpecial, `special partition ${specialIds.size}`);
assert(holdIds.size === contract.partitionPolicy.expectedHold, `hold partition ${holdIds.size}`);
assert(!intersects(generalIds, exclusiveIds), 'general/exclusive overlap');
assert(!intersects(generalIds, specialIds), 'general/special overlap');
assert(!intersects(generalIds, holdIds), 'general/hold overlap');
assert(!intersects(exclusiveIds, specialIds), 'exclusive/special overlap');
assert(!intersects(exclusiveIds, holdIds), 'exclusive/hold overlap');
assert(!intersects(specialIds, holdIds), 'special/hold overlap');

const canonicalIds = new Set((acquisition.records ?? []).map(r => Number(r.equipmentId)));
const unionIds = new Set([...generalIds, ...exclusiveIds, ...specialIds, ...holdIds]);
assert(canonicalIds.size === contract.partitionPolicy.expectedCanonical, `canonical size ${canonicalIds.size}`);
assert(unionIds.size === canonicalIds.size && [...canonicalIds].every(id => unionIds.has(id)), `Stage 3 partition does not close canonical IDs`);

const allPreserved = [...specialRecords, ...holdRecords];
const nameKrVerified = allPreserved.filter(r => typeof r.identity.nameKr === 'string' && r.identity.nameKr.length > 0).length;
const result = {
  stage: '3-6',
  status: 'COMPLETE_WITH_EXPLICIT_HOLD',
  sources: contract.sources,
  policy: {
    specialDisposition: contract.buckets.special.disposition,
    holdDisposition: contract.buckets.hold.disposition,
    publicConsumerAdmission: false,
    emptyGetPathListMeaningInvented: false,
    publicSiteTabInvented: false,
    acquisitionChronologyInvented: false,
    stage2SemanticsReopened: false,
    statsRecalculated: false,
    effectTextRewritten: false,
    restrictionSemantics: restrictions.semantics
  },
  counts: {
    special: specialRecords.length,
    hold: holdRecords.length,
    totalHandled: allPreserved.length,
    iconVerified: allPreserved.filter(r => r.identity.iconStatus === 'VERIFIED_DIRECT').length,
    nameKrVerified,
    nameKrReview: allPreserved.length - nameKrVerified,
    propertyCounts: countBy(allPreserved, r => r.stats.properties.length),
    restrictionModes: countBy(allPreserved, r => r.restriction.mode)
  },
  partition: {
    general: generalIds.size,
    exclusive: exclusiveIds.size,
    special: specialIds.size,
    hold: holdIds.size,
    canonical: canonicalIds.size,
    union: unionIds.size,
    disjoint: true,
    closed: true
  },
  specialRecords,
  holdRecords
};

fs.mkdirSync('data/generated', { recursive: true });
fs.writeFileSync('data/generated/equipment_stage3_6_special_unresolved.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ stage: result.stage, status: result.status, counts: result.counts, partition: result.partition }, null, 2));
