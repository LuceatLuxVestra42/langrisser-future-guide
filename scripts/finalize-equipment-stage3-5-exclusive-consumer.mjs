import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const toMap = (rows, idField) => new Map((rows ?? []).map(r => [Number(r[idField]), r]));
const countBy = (rows, keyFn) => {
  const out = {};
  for (const row of rows) {
    const key = String(keyFn(row));
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
};

const contract = load('data/contracts/equipment-stage3-5-exclusive-consumer.v1.json');
const pageSchema = load(contract.sources.pageSchema);
const filterMap = load(contract.sources.filterMap);
const stats = load(contract.sources.stats);
const effects = load(contract.sources.effects);
const restrictions = load(contract.sources.restrictions);
const acquisition = load(contract.sources.acquisition);
const displayMetadata = load(contract.sources.displayMetadata);

const filterById = toMap(filterMap.records, 'id');
const statsById = toMap(stats.records, 'id');
const effectById = toMap(effects.records, 'equipmentId');
const restrictionById = toMap(restrictions.records, 'equipmentId');
const displayById = toMap(displayMetadata.records, 'equipmentId');
const exclusiveRows = (acquisition.records ?? []).filter(r => r.acquisitionClass === contract.admission.class);

assert(exclusiveRows.length === contract.admission.expectedTotal, `exclusive equipment count ${exclusiveRows.length}`);

const compareList = (a, b) => {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.subtypeOrder !== b.subtypeOrder) return a.subtypeOrder - b.subtypeOrder;
  if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
  return a.equipmentId - b.equipmentId;
};

const listRecords = [];
const detailRecords = [];

for (const a of exclusiveRows) {
  const id = Number(a.equipmentId);
  const f = filterById.get(id);
  const s = statsById.get(id);
  const e = effectById.get(id);
  const r = restrictionById.get(id);
  const d = displayById.get(id);

  assert(f, `missing filter map ${id}`);
  assert(s, `missing stats ${id}`);
  assert(e, `missing effect ${id}`);
  assert(r, `missing restriction ${id}`);
  assert(d, `missing Stage 3-2 display metadata ${id}`);
  assert(a.siteTab == null, `exclusive equipment ${id} has siteTab ${a.siteTab}`);

  const paths = Array.isArray(a.raw?.getPathList) ? a.raw.getPathList : [];
  assert(paths.length === contract.admission.requiredAcquisitionEvidence.getPathListCount,
    `exclusive equipment ${id} path count ${paths.length}`);
  assert(Number(paths[0]?.PathType) === contract.admission.requiredAcquisitionEvidence.pathType,
    `exclusive equipment ${id} PathType ${paths[0]?.PathType}`);
  assert(a.classificationBasis === contract.admission.requiredAcquisitionEvidence.classificationBasis,
    `exclusive equipment ${id} classificationBasis ${a.classificationBasis}`);

  assert(d.iconStatus === 'VERIFIED_DIRECT' && typeof d.icon === 'string' && d.icon.length > 0,
    `unverified/missing icon ${id}`);
  const nameKr = d.nameKrStatus === 'VERIFIED_REFERENCE_MATCH' ? d.nameKr : null;
  if (d.nameKrStatus !== 'VERIFIED_REFERENCE_MATCH') assert(nameKr === null, `review name leaked ${id}`);

  const list = {
    equipmentId: id,
    nameCn: a.nameCn,
    nameKr,
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

  const statRows = Array.isArray(s.stats) ? s.stats : [];
  assert(statRows.length > 0, `empty stats ${id}`);
  assert(statRows.every(x => Number(x.maxLevel) === 50), `non-50 maxLevel ${id}`);

  const detail = {
    equipmentId: id,
    identity: {
      equipmentId: id,
      nameCn: a.nameCn,
      nameKr,
      icon: d.icon
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
      acquisitionClass: a.acquisitionClass,
      siteTab: null,
      sortIndex: Number(a.sortIndex)
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
      classificationBasis: a.classificationBasis
    }
  };

  listRecords.push(list);
  detailRecords.push(detail);
}

listRecords.sort(compareList);
const order = new Map(listRecords.map((r, i) => [r.equipmentId, i]));
detailRecords.sort((a, b) => order.get(a.equipmentId) - order.get(b.equipmentId));

const filterGroups = [...new Map(listRecords.map(r => [r.group, {
  group: r.group,
  groupKo: r.groupKo,
  groupOrder: r.groupOrder
}])).values()].sort((a, b) => a.groupOrder - b.groupOrder).map(g => ({
  ...g,
  subtypes: [...new Map(listRecords.filter(r => r.group === g.group).map(r => [r.subtype, {
    subtype: r.subtype,
    subtypeKo: r.subtypeKo,
    subtypeOrder: r.subtypeOrder
  }])).values()].sort((a, b) => a.subtypeOrder - b.subtypeOrder)
}));

const nameKrVerified = listRecords.filter(r => typeof r.nameKr === 'string' && r.nameKr.length > 0).length;
const releaseDateKnown = listRecords.filter(r => r.releaseGroupDate).length;
const propertyCounts = countBy(detailRecords, r => r.stats.properties.length);
const restrictionModes = countBy(detailRecords, r => r.restriction.mode);

const result = {
  stage: '3-5',
  status: 'COMPLETE_WITH_REVIEW',
  sources: contract.sources,
  schema: {
    primaryKey: pageSchema.primaryKey,
    routeKey: pageSchema.routingPolicy.detailRouteKey,
    listFields: Object.keys(pageSchema.listRecord.fields),
    detailBlocks: Object.fromEntries(Object.entries(pageSchema.detailRecord.blocks).map(([k, v]) => [k, v.fields]))
  },
  policy: {
    admissionClass: contract.admission.class,
    siteTab: null,
    acquisitionEvidence: contract.admission.requiredAcquisitionEvidence,
    listSorting: contract.listPolicy.sorting,
    heroOwnershipGenerated: false,
    heroOwnershipBoundary: contract.heroOwnershipBoundary.policy,
    stage2SemanticsReopened: false,
    effectTextRewritten: false,
    statsRecalculated: false,
    acquisitionChronologyInvented: false,
    restrictionSemantics: restrictions.semantics
  },
  counts: {
    total: listRecords.length,
    list: listRecords.length,
    detail: detailRecords.length,
    iconVerified: listRecords.filter(r => r.icon).length,
    nameKrVerified,
    nameKrReview: listRecords.length - nameKrVerified,
    releaseDateKnown,
    releaseDateReview: listRecords.length - releaseDateKnown,
    propertyCounts,
    restrictionModes
  },
  filters: filterGroups,
  listRecords,
  detailRecords
};

fs.mkdirSync('data/generated', { recursive: true });
fs.writeFileSync('data/generated/equipment_stage3_5_exclusive_consumer.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  stage: result.stage,
  status: result.status,
  counts: result.counts,
  filters: result.filters,
  heroOwnershipGenerated: result.policy.heroOwnershipGenerated
}, null, 2));
