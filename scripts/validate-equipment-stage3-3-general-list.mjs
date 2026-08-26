import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const toMap = (rows, idField) => new Map((rows ?? []).map(r => [Number(r[idField]), r]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const contract = load('data/contracts/equipment-stage3-3-general-list.v1.json');
const output = load('data/generated/equipment_stage3_3_general_list.json');
const pageSchema = load(contract.sources.pageSchema);
const filterMap = load(contract.sources.filterMap);
const effects = load(contract.sources.effects);
const acquisition = load(contract.sources.acquisition);
const displayMetadata = load(contract.sources.displayMetadata);

const filterById = toMap(filterMap.records, 'id');
const effectById = toMap(effects.records, 'equipmentId');
const acquisitionById = toMap(acquisition.records, 'equipmentId');
const displayById = toMap(displayMetadata.records, 'equipmentId');
const admitted = new Set(contract.admission.classes);
const expectedRows = (acquisition.records ?? []).filter(r => admitted.has(r.acquisitionClass));
const expectedIds = expectedRows.map(r => Number(r.equipmentId)).sort((a, b) => a - b);
const rows = output.records ?? [];
const ids = rows.map(r => Number(r.equipmentId));

check(output.stage === '3-3', `stage ${output.stage}`);
check(output.status === 'COMPLETE_WITH_REVIEW', `status ${output.status}`);
check(rows.length === contract.admission.expectedTotal, `record count ${rows.length}`);
check(new Set(ids).size === rows.length, 'duplicate equipment IDs');
check(same([...ids].sort((a, b) => a - b), expectedIds), 'general equipment ID population mismatch');

const allowedFields = contract.recordPolicy.requiredFields;
const allowedSet = new Set(allowedFields);
const listSchemaFields = Object.keys(pageSchema.listRecord.fields);
check(same(allowedFields, listSchemaFields), 'Stage 3-3 required fields drifted from Stage 3-1 list schema');

const errors = {
  missingJoin: [],
  fieldMismatch: [],
  icon: [],
  reviewNameLeak: [],
  classLeak: [],
  tab: [],
  fieldShape: []
};

for (const row of rows) {
  const id = Number(row.equipmentId);
  const a = acquisitionById.get(id);
  const f = filterById.get(id);
  const e = effectById.get(id);
  const d = displayById.get(id);
  if (!a || !f || !e || !d) {
    errors.missingJoin.push(id);
    continue;
  }

  if (!admitted.has(a.acquisitionClass)) errors.classLeak.push(id);
  if (![1, 2, 3].includes(Number(a.siteTab))) errors.tab.push(id);

  const keys = Object.keys(row);
  if (keys.length !== allowedFields.length || keys.some(k => !allowedSet.has(k)) || allowedFields.some(k => !Object.prototype.hasOwnProperty.call(row, k))) {
    errors.fieldShape.push(id);
  }

  const expectedNameKr = d.nameKrStatus === 'VERIFIED_REFERENCE_MATCH' ? d.nameKr : null;
  if (d.nameKrStatus !== 'VERIFIED_REFERENCE_MATCH' && row.nameKr !== null) errors.reviewNameLeak.push(id);
  if (d.iconStatus !== 'VERIFIED_DIRECT' || typeof row.icon !== 'string' || row.icon.length === 0 || row.icon !== d.icon) errors.icon.push(id);

  const expected = {
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
    siteTab: Number(a.siteTab),
    releaseGroupDate: a.releaseGroupDate ?? null,
    sortIndex: Number(a.sortIndex),
    effectName: e.effectName,
    effectText: e.effectText
  };
  if (!same(row, expected)) errors.fieldMismatch.push(id);
}

for (const [key, values] of Object.entries(errors)) {
  check(values.length === 0, `${key}: ${values.length} (${values.slice(0, 12).join(',')})`);
}

const tabCounts = Object.fromEntries([1, 2, 3].map(tab => [String(tab), rows.filter(r => r.siteTab === tab).length]));
for (const [tab, expected] of Object.entries(contract.admission.expectedTabs)) {
  check(tabCounts[tab] === expected, `tab ${tab} count ${tabCounts[tab]} expected ${expected}`);
}

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
for (let i = 1; i < rows.length; i++) {
  check(compareRecords(rows[i - 1], rows[i]) <= 0, `sort order regression at ${rows[i - 1].equipmentId} -> ${rows[i].equipmentId}`);
}

const tab2 = rows.filter(r => r.siteTab === 2);
const tab3 = rows.filter(r => r.siteTab === 3);
check(tab2.every(r => typeof r.releaseGroupDate === 'string' && /^20\d\d-\d\d-\d\d$/.test(r.releaseGroupDate)), 'tab2 must retain all 80 verified legacy release-group dates');
check(tab3.every(r => r.releaseGroupDate === null), 'tab3 frozen Stage 2 currently has no explicit releaseGroupDate; unexpected dates require contract review');
check(output.orderingDiagnostics?.tab2?.releaseOrderStatus === 'VERIFIED_RELEASE_GROUP_DATE', 'tab2 release order status');
check(output.orderingDiagnostics?.tab3?.releaseOrderStatus === 'REVIEW_RELEASE_ORDER', 'tab3 must remain REVIEW_RELEASE_ORDER');

const expectedFilterGroups = contract.filterPolicy.groups;
check((output.filters ?? []).length === expectedFilterGroups.length, `filter group count ${(output.filters ?? []).length}`);
for (let i = 0; i < expectedFilterGroups.length; i++) {
  const expected = expectedFilterGroups[i];
  const actual = output.filters[i];
  check(actual.group === expected.group, `filter group ${i} ${actual.group}`);
  check(actual.groupKo === expected.groupKo, `filter groupKo ${i} ${actual.groupKo}`);
  check(Number(actual.groupOrder) === expected.groupOrder, `filter groupOrder ${i}`);
  check(same(actual.subtypes.map(x => x.subtypeKo), expected.subtypes), `filter subtype order mismatch ${expected.groupKo}`);
}

const nameKrVerified = rows.filter(r => typeof r.nameKr === 'string' && r.nameKr.length > 0).length;
const summary = {
  stage: '3-3',
  status: 'PASS',
  finalStageStatus: 'COMPLETE_WITH_REVIEW',
  generalEquipmentCount: rows.length,
  tabs: tabCounts,
  displayCoverage: {
    iconVerified: rows.filter(r => typeof r.icon === 'string' && r.icon.length > 0).length,
    nameKrVerified,
    nameKrReview: rows.length - nameKrVerified
  },
  contentIntegrity: {
    exactStage2EffectCopy: rows.length,
    exactStage2ClassificationCopy: rows.length,
    reviewNameCandidateLeak: 0,
    excludedClassLeak: 0
  },
  ordering: {
    classificationOrder: 'PASS',
    tab2ReleaseDateKnown: tab2.filter(r => r.releaseGroupDate).length,
    tab2ReleaseOrderStatus: output.orderingDiagnostics.tab2.releaseOrderStatus,
    tab3ReleaseDateKnown: tab3.filter(r => r.releaseGroupDate).length,
    tab3ReleaseOrderStatus: output.orderingDiagnostics.tab3.releaseOrderStatus,
    fallbackReinterpretedAsReleaseChronology: false
  },
  filters: output.filters,
  review: {
    nameKrInheritedFromStage32: rows.length - nameKrVerified,
    tab3ExactReleaseOrder: tab3.length
  },
  policy: {
    stage2SemanticsReopened: false,
    inventedKoreanNames: 0,
    inventedReleaseDates: 0,
    effectTextRewritten: false,
    nextStage: '3-4 general equipment detail data generation'
  }
};

fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync('data/validation/equipment-stage3-3-general-list-summary.v1.json', `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
