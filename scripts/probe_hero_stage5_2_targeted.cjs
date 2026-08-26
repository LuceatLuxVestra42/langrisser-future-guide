'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const rows = doc => Array.isArray(doc) ? doc : (Array.isArray(doc?.rows) ? doc.rows : Array.isArray(doc?.records) ? doc.records : Array.isArray(doc?.data) ? doc.data : []);

function collectPaths(v, prefix = '', out = new Set(), depth = 0) {
  if (!v || typeof v !== 'object' || depth > 5) return out;
  for (const [k, x] of Object.entries(v)) {
    const p = prefix ? `${prefix}.${k}` : k;
    out.add(p);
    if (x && typeof x === 'object') collectPaths(x, p, out, depth + 1);
  }
  return out;
}

const heroRows = rows(read('data/configdata/ConfigDataHeroInfo.json'));
const heroIds = new Set(heroRows.map(x => Number(x.ID)).filter(Number.isFinite));
const acquisition = read('data/generated/equipment_stage2_7_acquisition.json');
const exclusiveRows = (acquisition.records || []).filter(x => x.acquisitionClass === 'exclusive-equipment');
const exclusiveIds = new Set(exclusiveRows.map(x => Number(x.equipmentId)).filter(Number.isFinite));

const equipmentRows = rows(read('data/configdata/ConfigDataEquipmentInfo.json'));
const equipmentById = new Map(equipmentRows.map(x => [Number(x.ID), x]));
const rawExclusive = exclusiveRows.map(x => equipmentById.get(Number(x.equipmentId))).filter(Boolean);
const keyPaths = new Set();
for (const r of rawExclusive) collectPaths(r, '', keyPaths);
const suspiciousPaths = [...keyPaths].filter(p => /(hero|exclusive|owner|equip)/i.test(p)).sort();

const missionRows = rows(read('data/configdata/ConfigDataMissionInfo.json'));
const m114 = missionRows.filter(x => Number(x.MissionType) === 114);
const paramKeys = ['Param1', 'Param2', 'Param3'];
const paramStats = {};
for (const key of paramKeys) {
  const values = m114.map(x => Number(x[key])).filter(Number.isFinite);
  paramStats[key] = {
    count: values.length,
    nonZeroCount: values.filter(x => x !== 0).length,
    uniqueCount: new Set(values).size,
    heroIdMatchCount: values.filter(x => heroIds.has(x)).length,
    exclusiveEquipmentIdMatchCount: values.filter(x => exclusiveIds.has(x)).length,
    firstValues: values.slice(0, 30)
  };
}

let central = { status: 'ERROR' };
try {
  const skillRows = rows(read('data/configdata/ConfigDataSkillInfo.json'));
  const skillById = new Map(skillRows.map(x => [Number(x.ID), x]));
  const withField = heroRows.filter(x => Object.prototype.hasOwnProperty.call(x, 'CastingLawSkill_ID'));
  const nonzero = withField.map(x => ({ heroId: Number(x.ID), skillId: Number(x.CastingLawSkill_ID), heroName: x.Name ?? null }))
    .filter(x => Number.isFinite(x.skillId) && x.skillId !== 0);
  const missing = nonzero.filter(x => !skillById.has(x.skillId));
  central = {
    status: missing.length ? 'FAIL' : 'PASS',
    heroRecordCount: heroRows.length,
    recordsWithField: withField.length,
    releasedCount: nonzero.length,
    notReleasedCount: withField.length - nonzero.length,
    resolvedSkillCount: nonzero.length - missing.length,
    missingSkillRefs: missing,
    samples: nonzero.slice(0, 15).map(x => ({
      ...x,
      skillName: skillById.get(x.skillId)?.Name ?? null,
      skillDesc: skillById.get(x.skillId)?.Desc ?? null
    }))
  };
} catch (e) {
  central = { status: 'ERROR', error: String(e.message || e) };
}

const out = {
  version: 1,
  stage: 'hero-page-5-2',
  checkpoint: 'targeted-probe',
  exclusivePopulation: { count: exclusiveRows.length, unique: exclusiveIds.size },
  rawExclusiveEquipmentInfo: {
    resolvedRawRecordCount: rawExclusive.length,
    allKeyPaths: [...keyPaths].sort(),
    suspiciousOwnerPaths: suspiciousPaths,
    samples: rawExclusive.slice(0, 12)
  },
  missionType114: {
    enumMeaningFromDump: 'MissionType_OwnHeroExclusiveEquipment',
    recordCount: m114.length,
    paramStats,
    samples: m114.slice(0, 40).map(x => ({ ID: x.ID, Title: x.Title ?? null, Desc: x.Desc ?? null, MissionType: x.MissionType, Param1: x.Param1 ?? null, Param2: x.Param2 ?? null, Param3: x.Param3 ?? null, GroupParam: x.GroupParam ?? null }))
  },
  centralDiscipline: central
};
fs.mkdirSync(path.join(root, 'data', 'validation'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'validation', 'hero-page-stage5-2-targeted-probe.v1.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({
  exclusivePopulation: out.exclusivePopulation,
  rawExclusiveEquipmentInfo: {
    resolvedRawRecordCount: out.rawExclusiveEquipmentInfo.resolvedRawRecordCount,
    suspiciousOwnerPaths: out.rawExclusiveEquipmentInfo.suspiciousOwnerPaths,
    samples: out.rawExclusiveEquipmentInfo.samples.slice(0, 3)
  },
  missionType114: out.missionType114,
  centralDiscipline: out.centralDiscipline
}, null, 2));
