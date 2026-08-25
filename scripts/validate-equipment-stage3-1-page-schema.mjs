import fs from 'node:fs';

const load = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };

const schema = load('data/contracts/equipment-stage3-1-page-schema.v1.json');
const inputContract = load(schema.inputContract);
const filterMap = load(inputContract.inputs.filterMap.path);
const stats = load(inputContract.inputs.stats.path);
const effects = load(inputContract.inputs.effects.path);
const restrictions = load(inputContract.inputs.restrictions.path);
const acquisition = load(inputContract.inputs.acquisition.path);

const toMap = (rows, idField) => new Map((rows ?? []).map(row => [Number(row[idField]), row]));
const filterById = toMap(filterMap.records, inputContract.inputs.filterMap.idField);
const statsById = toMap(stats.records, inputContract.inputs.stats.idField);
const effectsById = toMap(effects.records, inputContract.inputs.effects.idField);
const restrictionsById = toMap(restrictions.records, inputContract.inputs.restrictions.idField);
const acquisitionById = toMap(acquisition.records, inputContract.inputs.acquisition.idField);

const canonicalIds = [...acquisitionById.keys()].sort((a, b) => a - b);
check(canonicalIds.length === schema.stage31Completion.expectedCanonical,
  `canonical count ${canonicalIds.length}`);
check(new Set(canonicalIds).size === canonicalIds.length, 'duplicate canonical equipment IDs');

const admission = schema.pageAdmission;
const generalClasses = new Set(admission.general);
const exclusiveClasses = new Set(admission.exclusive);
const hiddenClasses = new Set(admission.hiddenFromGeneral);
const holdClasses = new Set(admission.hold);

const buckets = {
  general: [],
  exclusive: [],
  hidden: [],
  hold: []
};

for (const id of canonicalIds) {
  const row = acquisitionById.get(id);
  const cls = row.acquisitionClass;
  if (generalClasses.has(cls)) buckets.general.push(id);
  else if (exclusiveClasses.has(cls)) buckets.exclusive.push(id);
  else if (hiddenClasses.has(cls)) buckets.hidden.push(id);
  else if (holdClasses.has(cls)) buckets.hold.push(id);
  else fail(`equipment ${id} has class outside Stage 3-1 admission policy: ${cls}`);
}

check(buckets.general.length === schema.stage31Completion.expectedGeneral,
  `general count ${buckets.general.length}`);
check(buckets.exclusive.length === schema.stage31Completion.expectedExclusive,
  `exclusive count ${buckets.exclusive.length}`);
check(buckets.hidden.length === schema.stage31Completion.expectedHidden,
  `hidden count ${buckets.hidden.length}`);
check(buckets.hold.length === schema.stage31Completion.expectedHold,
  `hold count ${buckets.hold.length}`);

const pageReadyIds = [...buckets.general, ...buckets.exclusive];
check(pageReadyIds.length === schema.stage31Completion.expectedStructurallyPageReady,
  `structurally page-ready count ${pageReadyIds.length}`);
check(new Set(pageReadyIds).size === pageReadyIds.length, 'duplicate page-ready equipment IDs');

const missing = {
  filterMap: [],
  stats: [],
  effects: [],
  restrictions: [],
  acquisition: [],
  listStructuralFields: [],
  detailStructuralFields: []
};

const requireField = (obj, field) => obj != null && Object.prototype.hasOwnProperty.call(obj, field) && obj[field] !== undefined;

for (const id of pageReadyIds) {
  const f = filterById.get(id);
  const s = statsById.get(id);
  const e = effectsById.get(id);
  const r = restrictionsById.get(id);
  const a = acquisitionById.get(id);

  if (!f) missing.filterMap.push(id);
  if (!s) missing.stats.push(id);
  if (!e) missing.effects.push(id);
  if (!r) missing.restrictions.push(id);
  if (!a) missing.acquisition.push(id);
  if (!f || !s || !e || !r || !a) continue;

  const listChecks = [
    Number.isInteger(id),
    typeof a.nameCn === 'string' && a.nameCn.length > 0,
    typeof f.group === 'string' && f.group.length > 0,
    typeof f.groupKo === 'string' && f.groupKo.length > 0,
    typeof f.subtype === 'string' && f.subtype.length > 0,
    typeof f.subtypeKo === 'string' && f.subtypeKo.length > 0,
    Number.isInteger(f.groupOrder),
    Number.isInteger(f.subtypeOrder),
    typeof a.acquisitionClass === 'string' && a.acquisitionClass.length > 0,
    requireField(a, 'siteTab'),
    requireField(a, 'releaseGroupDate'),
    Number.isInteger(a.sortIndex),
    typeof e.effectName === 'string',
    typeof e.effectText === 'string'
  ];
  if (listChecks.some(v => !v)) missing.listStructuralFields.push(id);

  const statRows = Array.isArray(s.stats) ? s.stats : [];
  const detailChecks = [
    Number.isInteger(a.equipmentType),
    Number.isInteger(a.label),
    statRows.length > 0,
    statRows.every(x => Number(x.maxLevel) === 50 && Number.isFinite(Number(x.maxValue))),
    Number.isInteger(e.maxEffectSkillId),
    Array.isArray(e.effectSegments),
    typeof r.mode === 'string' && inputContract.allowedRestrictionModes.includes(r.mode),
    Array.isArray(r.generalArmyIds),
    Array.isArray(r.specialJobIds),
    Number.isFinite(Number(a.confidencePercent)),
    typeof a.classificationBasis === 'string' && a.classificationBasis.length > 0
  ];
  if (detailChecks.some(v => !v)) missing.detailStructuralFields.push(id);

  if (generalClasses.has(a.acquisitionClass)) {
    check([1, 2, 3].includes(a.siteTab), `general equipment ${id} has invalid siteTab ${a.siteTab}`);
  }
  if (exclusiveClasses.has(a.acquisitionClass)) {
    check(a.siteTab == null, `exclusive equipment ${id} leaked into general siteTab ${a.siteTab}`);
  }
}

for (const [key, ids] of Object.entries(missing)) {
  check(ids.length === 0, `${key} missing/invalid for ${ids.length} equipment: ${ids.slice(0, 10).join(',')}`);
}

const classCounts = {};
for (const row of acquisition.records ?? []) {
  classCounts[row.acquisitionClass] = (classCounts[row.acquisitionClass] ?? 0) + 1;
}

const summary = {
  stage: '3-1',
  status: 'PASS',
  schemaContract: 'data/contracts/equipment-stage3-1-page-schema.v1.json',
  inputContract: schema.inputContract,
  canonicalEquipmentCount: canonicalIds.length,
  schemaReadiness: {
    structurallyPageReady: pageReadyIds.length,
    general: buckets.general.length,
    exclusive: buckets.exclusive.length,
    hiddenFromGeneral: buckets.hidden.length,
    hold: buckets.hold.length,
    displayMetadataPending: pageReadyIds.length,
    pendingFields: schema.displayMetadataBoundary.fields
  },
  structuralCoverage: {
    list: { ready: pageReadyIds.length, missing: 0 },
    detail: { ready: pageReadyIds.length, missing: 0 }
  },
  acquisitionClasses: classCounts,
  routing: {
    primaryKey: schema.primaryKey,
    uniquePageReadyRouteKeys: new Set(pageReadyIds).size
  },
  policies: {
    stage2SemanticsReopened: false,
    rawLabelUsedAsDisplayOrder: false,
    exactReleaseOrderInvented: false,
    effectTextRewritten: false,
    nextStage: '3-2 display metadata layer (nameKr/icon)'
  }
};

fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync('data/validation/equipment-stage3-1-schema-summary.v1.json', `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
