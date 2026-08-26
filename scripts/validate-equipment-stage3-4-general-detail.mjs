import fs from 'node:fs';

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const stable = value => JSON.stringify(value);
const toMap = (rows, idField) => new Map((rows ?? []).map(r => [Number(r[idField]), r]));
const countBy = (rows, keyFn) => {
  const out = {};
  for (const row of rows) {
    const key = String(keyFn(row));
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
};

const contract = load('data/contracts/equipment-stage3-4-general-detail.v1.json');
const detail = load('data/generated/equipment_stage3_4_general_detail.json');
const generalList = load(contract.sources.generalList);
const stats = load(contract.sources.stats);
const effects = load(contract.sources.effects);
const restrictions = load(contract.sources.restrictions);
const acquisition = load(contract.sources.acquisition);

const listRows = generalList.records ?? [];
const detailRows = detail.records ?? [];
const listById = toMap(listRows, 'equipmentId');
const detailById = toMap(detailRows, 'equipmentId');
const statsById = toMap(stats.records, 'id');
const effectsById = toMap(effects.records, 'equipmentId');
const restrictionsById = toMap(restrictions.records, 'equipmentId');
const acquisitionById = toMap(acquisition.records, 'equipmentId');
const allowedClasses = new Set(contract.admission.classes);

check(detail.stage === '3-4', `stage ${detail.stage}`);
check(detailRows.length === contract.admission.expectedTotal, `detail count ${detailRows.length}`);
check(listRows.length === contract.admission.expectedTotal, `list count ${listRows.length}`);
check(detailById.size === detailRows.length, 'duplicate detail equipmentId');
check(listById.size === listRows.length, 'duplicate list equipmentId');

const listIds = [...listById.keys()].sort((a, b) => a - b);
const detailIds = [...detailById.keys()].sort((a, b) => a - b);
check(stable(detailIds) === stable(listIds), 'Stage 3-4 ID set differs from Stage 3-3 general list');

const exactCopies = {
  identityAndListClassification: 0,
  stats: 0,
  effects: 0,
  restrictions: 0,
  acquisition: 0
};

for (const id of detailIds) {
  const row = detailById.get(id);
  const list = listById.get(id);
  const s = statsById.get(id);
  const e = effectsById.get(id);
  const r = restrictionsById.get(id);
  const a = acquisitionById.get(id);

  check(list && s && e && r && a, `missing upstream row ${id}`);
  check(row.equipmentId === id && row.identity?.equipmentId === id, `route/identity key mismatch ${id}`);
  check(allowedClasses.has(row.classification?.acquisitionClass), `excluded class leaked ${id}`);

  const expectedIdentity = {
    equipmentId: id,
    nameCn: list.nameCn,
    nameKr: list.nameKr ?? null,
    icon: list.icon
  };
  const expectedListClassification = {
    group: list.group,
    groupKo: list.groupKo,
    subtype: list.subtype,
    subtypeKo: list.subtypeKo,
    groupOrder: Number(list.groupOrder),
    subtypeOrder: Number(list.subtypeOrder),
    acquisitionClass: list.acquisitionClass,
    siteTab: Number(list.siteTab),
    sortIndex: Number(list.sortIndex)
  };
  check(stable(row.identity) === stable(expectedIdentity), `identity mismatch ${id}`);
  for (const [key, value] of Object.entries(expectedListClassification)) {
    check(stable(row.classification?.[key]) === stable(value), `classification/list mismatch ${id}.${key}`);
  }
  check(Number(row.classification?.equipmentType) === Number(a.equipmentType), `equipmentType mismatch ${id}`);
  check(stable(row.classification?.label) === stable(a.label), `label mismatch ${id}`);
  exactCopies.identityAndListClassification++;

  check(Number(row.stats?.maxLevel) === 50, `detail maxLevel mismatch ${id}`);
  check(Array.isArray(row.stats?.properties) && row.stats.properties.length > 0, `empty detail stats ${id}`);
  check(row.stats.properties.every(p => Number(p.maxLevel) === 50), `property maxLevel mismatch ${id}`);
  check(stable(row.stats.properties) === stable(s.stats), `Stage 2-4 stats mismatch ${id}`);
  exactCopies.stats++;

  const expectedEffect = {
    maxEffectSkillId: Number(e.maxEffectSkillId),
    effectName: e.effectName,
    effectText: e.effectText,
    effectSegments: e.effectSegments
  };
  check(stable(row.effect) === stable(expectedEffect), `Stage 2-5 effect mismatch ${id}`);
  exactCopies.effects++;

  const expectedRestriction = {
    mode: r.mode,
    generalArmyIds: r.generalArmyIds,
    specialJobIds: r.specialJobIds
  };
  check(stable(row.restriction) === stable(expectedRestriction), `Stage 2-6 restriction mismatch ${id}`);
  exactCopies.restrictions++;

  const expectedAcquisition = {
    releaseGroupDate: a.releaseGroupDate ?? null,
    confidencePercent: Number(a.confidencePercent),
    classificationBasis: a.classificationBasis
  };
  check(stable(row.acquisition) === stable(expectedAcquisition), `Stage 2-7 acquisition mismatch ${id}`);
  check(row.classification.acquisitionClass === a.acquisitionClass, `acquisition class mismatch ${id}`);
  check(Number(row.classification.siteTab) === Number(a.siteTab), `siteTab mismatch ${id}`);
  check(Number(row.classification.sortIndex) === Number(a.sortIndex), `sortIndex mismatch ${id}`);
  exactCopies.acquisition++;
}

const tabs = countBy(detailRows, r => r.classification.siteTab);
for (const [tab, expected] of Object.entries(contract.admission.expectedTabs)) {
  check(Number(tabs[tab] ?? 0) === Number(expected), `tab ${tab} count ${tabs[tab] ?? 0}`);
}

const nameKrVerified = detailRows.filter(r => typeof r.identity.nameKr === 'string' && r.identity.nameKr.length > 0).length;
const nameKrReview = detailRows.length - nameKrVerified;
check(nameKrVerified === Number(generalList.counts?.nameKrVerified ?? nameKrVerified), 'nameKr verified count drift from Stage 3-3');
check(nameKrReview === Number(generalList.counts?.nameKrReview ?? nameKrReview), 'nameKr review count drift from Stage 3-3');
check(detailRows.every(r => typeof r.identity.icon === 'string' && r.identity.icon.length > 0), 'missing detail icon');

const tab3Rows = detailRows.filter(r => r.classification.siteTab === 3);
const tab3ReleaseMissing = tab3Rows.filter(r => !r.acquisition.releaseGroupDate).length;
check(tab3ReleaseMissing === Number(generalList.orderingDiagnostics?.tab3?.releaseDateMissing ?? tab3ReleaseMissing), 'tab3 release review drift from Stage 3-3');

check(detail.policy?.stage2SemanticsReopened === false, 'Stage 2 semantics reopened flag');
check(detail.policy?.effectTextRewritten === false, 'effect rewrite flag');
check(detail.policy?.statsRecalculated === false, 'stats recalculation flag');
check(detail.policy?.acquisitionChronologyInvented === false, 'acquisition chronology invention flag');
check(restrictions.semantics?.status === 'structural-inference', 'restriction semantics status unexpectedly changed');
check(Number(restrictions.semantics?.confidence) === 0.99, 'restriction semantics confidence unexpectedly changed');

const summary = {
  stage: '3-4',
  status: 'PASS',
  finalStageStatus: detail.status,
  generalEquipmentCount: detailRows.length,
  uniqueRouteKeys: detailById.size,
  tabs,
  displayCoverage: {
    iconVerified: detailRows.length,
    nameKrVerified,
    nameKrReview
  },
  exactCopies,
  stats: {
    propertyCountDistribution: countBy(detailRows, r => r.stats.properties.length),
    allMaxLevel50: true
  },
  restrictions: {
    modeCounts: countBy(detailRows, r => r.restriction.mode),
    semanticStatus: restrictions.semantics.status,
    semanticConfidence: restrictions.semantics.confidence,
    runtimeDirectProofClaimed: false
  },
  acquisition: {
    releaseDateKnownByTab: Object.fromEntries([1, 2, 3].map(tab => [String(tab), detailRows.filter(r => r.classification.siteTab === tab && r.acquisition.releaseGroupDate).length])),
    tab3ReleaseOrderReview: tab3ReleaseMissing
  },
  integrity: {
    excludedClassLeak: 0,
    stage2SemanticsReopened: false,
    statsRecalculated: false,
    effectTextRewritten: false,
    acquisitionChronologyInvented: false
  },
  review: {
    inheritedNameKr: nameKrReview,
    tab3ExactReleaseOrder: tab3ReleaseMissing,
    restrictionRuntimeDirectProof: 'UNLOCATED_LOW_PRIORITY'
  },
  nextStage: '3-5 exclusive equipment consumer data generation'
};

fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync('data/validation/equipment-stage3-4-general-detail-summary.v1.json', `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
