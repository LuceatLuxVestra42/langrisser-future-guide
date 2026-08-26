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

const contract = load('data/contracts/equipment-stage3-3-general-list.v1.json');
const pageSchema = load(contract.sources.pageSchema);
const filterMap = load(contract.sources.filterMap);
const effects = load(contract.sources.effects);
const acquisition = load(contract.sources.acquisition);
const displayMetadata = load(contract.sources.displayMetadata);

const filterById = toMap(filterMap.records, 'id');
const effectById = toMap(effects.records, 'equipmentId');
const displayById = toMap(displayMetadata.records, 'equipmentId');
const admitted = new Set(contract.admission.classes);
const acquisitionRows = (acquisition.records ?? []).filter(r => admitted.has(r.acquisitionClass));

assert(acquisitionRows.length === contract.admission.expectedTotal, `general equipment count ${acquisitionRows.length}`);

function compareRecords(a, b) {
  if (a.siteTab !== b.siteTab) return a.siteTab - b.siteTab;
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.subtypeOrder !== b.subtypeOrder) return a.subtypeOrder - b.subtypeOrder;

  if (a.siteTab === 2) {
    const da = a.releaseGroupDate ?? '';
    const db = b.releaseGroupDate ?? '';
    if (da !== db) {
      if (!da) return 1;
      if (!db) return -1;
      return db.localeCompare(da);
    }
  }

  if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
  return a.equipmentId - b.equipmentId;
}

const records = acquisitionRows.map(a => {
  const id = Number(a.equipmentId);
  const f = filterById.get(id);
  const e = effectById.get(id);
  const d = displayById.get(id);
  assert(f, `missing filter map ${id}`);
  assert(e, `missing effect ${id}`);
  assert(d, `missing Stage 3-2 display metadata ${id}`);

  const nameKr = d.nameKrStatus === 'VERIFIED_REFERENCE_MATCH' ? d.nameKr : null;
  assert(d.iconStatus === 'VERIFIED_DIRECT' && typeof d.icon === 'string' && d.icon.length > 0, `unverified/missing icon ${id}`);
  if (d.nameKrStatus !== 'VERIFIED_REFERENCE_MATCH') {
    assert(nameKr === null, `review name leaked ${id}`);
  }

  return {
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
    siteTab: Number(a.siteTab),
    releaseGroupDate: a.releaseGroupDate ?? null,
    sortIndex: Number(a.sortIndex),
    effectName: e.effectName,
    effectText: e.effectText
  };
}).sort(compareRecords);

const filterGroups = [...new Map(records.map(r => [r.group, {
  group: r.group,
  groupKo: r.groupKo,
  groupOrder: r.groupOrder
}])).values()].sort((a, b) => a.groupOrder - b.groupOrder).map(g => {
  const subtypes = [...new Map(records.filter(r => r.group === g.group).map(r => [r.subtype, {
    subtype: r.subtype,
    subtypeKo: r.subtypeKo,
    subtypeOrder: r.subtypeOrder
  }])).values()].sort((a, b) => a.subtypeOrder - b.subtypeOrder);
  return { ...g, subtypes };
});

const nameKrVerified = records.filter(r => typeof r.nameKr === 'string' && r.nameKr.length > 0).length;
const tab2 = records.filter(r => r.siteTab === 2);
const tab3 = records.filter(r => r.siteTab === 3);
const tab2KnownDates = tab2.filter(r => r.releaseGroupDate).length;
const tab3KnownDates = tab3.filter(r => r.releaseGroupDate).length;

const result = {
  stage: '3-3',
  status: 'COMPLETE_WITH_REVIEW',
  sources: contract.sources,
  policy: {
    routeKey: pageSchema.routingPolicy.detailRouteKey,
    effectText: pageSchema.textPolicy.effect,
    classificationOrder: pageSchema.sortingPolicy.classificationOrder,
    nameKr: contract.recordPolicy.nameKr,
    releaseOrder: contract.sortingPolicy
  },
  counts: {
    total: records.length,
    tabs: countBy(records, r => r.siteTab),
    nameKrVerified,
    nameKrReview: records.length - nameKrVerified,
    iconVerified: records.filter(r => r.icon).length
  },
  orderingDiagnostics: {
    tab1: {
      count: records.filter(r => r.siteTab === 1).length,
      releaseDateKnown: records.filter(r => r.siteTab === 1 && r.releaseGroupDate).length,
      releaseOrderStatus: 'NOT_ASSERTED_LAUNCH_GROUP_CLASSIFICATION_ORDER_WITH_DETERMINISTIC_FALLBACK'
    },
    tab2: {
      count: tab2.length,
      releaseDateKnown: tab2KnownDates,
      releaseDateMissing: tab2.length - tab2KnownDates,
      releaseOrderStatus: tab2KnownDates === tab2.length ? 'VERIFIED_RELEASE_GROUP_DATE' : 'REVIEW_RELEASE_ORDER'
    },
    tab3: {
      count: tab3.length,
      releaseDateKnown: tab3KnownDates,
      releaseDateMissing: tab3.length - tab3KnownDates,
      releaseOrderStatus: tab3KnownDates === tab3.length ? 'VERIFIED_RELEASE_GROUP_DATE' : 'REVIEW_RELEASE_ORDER'
    }
  },
  filters: filterGroups,
  records
};

fs.mkdirSync('data/generated', { recursive: true });
fs.writeFileSync('data/generated/equipment_stage3_3_general_list.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  stage: result.stage,
  status: result.status,
  counts: result.counts,
  orderingDiagnostics: result.orderingDiagnostics,
  filters: result.filters
}, null, 2));
