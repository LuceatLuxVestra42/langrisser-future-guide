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

const contract = load('data/contracts/equipment-stage3-4-general-detail.v1.json');
const pageSchema = load(contract.sources.pageSchema);
const generalList = load(contract.sources.generalList);
const stats = load(contract.sources.stats);
const effects = load(contract.sources.effects);
const restrictions = load(contract.sources.restrictions);
const acquisition = load(contract.sources.acquisition);

const statsById = toMap(stats.records, 'id');
const effectsById = toMap(effects.records, 'equipmentId');
const restrictionsById = toMap(restrictions.records, 'equipmentId');
const acquisitionById = toMap(acquisition.records, 'equipmentId');
const allowedClasses = new Set(contract.admission.classes);
const listRows = generalList.records ?? [];

assert(listRows.length === contract.admission.expectedTotal, `general-list count ${listRows.length}`);
assert(new Set(listRows.map(r => Number(r.equipmentId))).size === listRows.length, 'duplicate Stage 3-3 equipmentId');

const records = listRows.map(list => {
  const id = Number(list.equipmentId);
  const s = statsById.get(id);
  const e = effectsById.get(id);
  const r = restrictionsById.get(id);
  const a = acquisitionById.get(id);

  assert(allowedClasses.has(list.acquisitionClass), `non-general class in Stage 3-3 list ${id}: ${list.acquisitionClass}`);
  assert(s, `missing Stage 2-4 stats ${id}`);
  assert(e, `missing Stage 2-5 effect ${id}`);
  assert(r, `missing Stage 2-6 restriction ${id}`);
  assert(a, `missing Stage 2-7 acquisition ${id}`);

  const properties = Array.isArray(s.stats) ? s.stats : [];
  assert(properties.length > 0, `empty stats ${id}`);
  assert(properties.every(p => Number(p.maxLevel) === 50), `non-50 maxLevel stats ${id}`);

  return {
    equipmentId: id,
    identity: {
      equipmentId: id,
      nameCn: list.nameCn,
      nameKr: list.nameKr ?? null,
      icon: list.icon
    },
    classification: {
      group: list.group,
      groupKo: list.groupKo,
      subtype: list.subtype,
      subtypeKo: list.subtypeKo,
      groupOrder: Number(list.groupOrder),
      subtypeOrder: Number(list.subtypeOrder),
      equipmentType: Number(a.equipmentType),
      label: a.label,
      acquisitionClass: list.acquisitionClass,
      siteTab: Number(list.siteTab),
      sortIndex: Number(list.sortIndex)
    },
    stats: {
      maxLevel: 50,
      properties
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
});

const nameKrVerified = records.filter(r => typeof r.identity.nameKr === 'string' && r.identity.nameKr.length > 0).length;
const propertyCounts = countBy(records, r => r.stats.properties.length);
const restrictionModes = countBy(records, r => r.restriction.mode);
const releaseDateKnownByTab = Object.fromEntries([1, 2, 3].map(tab => [String(tab), records.filter(r => r.classification.siteTab === tab && r.acquisition.releaseGroupDate).length]));

const result = {
  stage: '3-4',
  status: 'COMPLETE_WITH_REVIEW',
  sources: contract.sources,
  schema: {
    primaryKey: pageSchema.primaryKey,
    routeKey: pageSchema.routingPolicy.detailRouteKey,
    blocks: contract.recordSchema.blocks
  },
  policy: {
    stage2SemanticsReopened: false,
    effectTextRewritten: false,
    statsRecalculated: false,
    acquisitionChronologyInvented: false,
    restrictionSemantics: restrictions.semantics,
    inheritedReviewOnly: true
  },
  counts: {
    total: records.length,
    tabs: countBy(records, r => r.classification.siteTab),
    nameKrVerified,
    nameKrReview: records.length - nameKrVerified,
    propertyCounts,
    restrictionModes,
    releaseDateKnownByTab
  },
  records
};

fs.mkdirSync('data/generated', { recursive: true });
fs.writeFileSync('data/generated/equipment_stage3_4_general_detail.json', `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  stage: result.stage,
  status: result.status,
  counts: result.counts,
  restrictionSemanticStatus: result.policy.restrictionSemantics.status,
  restrictionSemanticConfidence: result.policy.restrictionSemantics.confidence
}, null, 2));
