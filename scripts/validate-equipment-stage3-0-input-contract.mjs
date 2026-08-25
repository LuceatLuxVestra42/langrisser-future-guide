import fs from 'node:fs';
import crypto from 'node:crypto';

const CONTRACT_PATH = 'data/contracts/equipment-stage3-0-input-contract.v1.json';
const SUMMARY_PATH = 'data/validation/equipment-stage3-0-input-summary.v1.json';

const loadText = path => fs.readFileSync(path, 'utf8');
const load = path => JSON.parse(loadText(path));
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const getPath = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

const contract = load(CONTRACT_PATH);
const expected = contract.canonicalExpectations;
const loaded = {};

for (const [name, spec] of Object.entries(contract.inputs)) {
  const text = loadText(spec.path);
  const data = JSON.parse(text);
  const records = getPath(data, spec.recordPath);
  const declaredCount = Number(getPath(data, spec.countField));

  check(Array.isArray(records), `${name}: ${spec.recordPath} is not an array`);
  check(records.length === expected.equipmentCount, `${name}: record count ${records.length}`);
  check(declaredCount === expected.equipmentCount, `${name}: declared canonical count ${declaredCount}`);

  const ids = records.map(row => Number(row[spec.idField]));
  check(ids.every(Number.isFinite), `${name}: invalid ID`);
  check(new Set(ids).size === ids.length, `${name}: duplicate IDs`);

  for (const row of records) {
    for (const field of spec.requiredFields) {
      check(hasOwn(row, field), `${name}: ID ${row[spec.idField]} missing field ${field}`);
    }
  }

  loaded[name] = {
    spec,
    data,
    records,
    ids,
    idSet: new Set(ids),
    sha256: sha256(text)
  };
}

const canonicalName = 'acquisition';
const canonicalIds = loaded[canonicalName].idSet;
for (const [name, source] of Object.entries(loaded)) {
  check(source.idSet.size === canonicalIds.size, `${name}: canonical set size mismatch`);
  const missing = [...canonicalIds].filter(id => !source.idSet.has(id));
  const extra = [...source.idSet].filter(id => !canonicalIds.has(id));
  check(missing.length === 0 && extra.length === 0,
    `${name}: canonical ID coverage mismatch; missing=${missing.join(',')} extra=${extra.join(',')}`);
}

const stats = loaded.stats.records;
check(stats.every(row => Array.isArray(row.stats) && row.stats.length >= 1), 'stats: empty stats array');

const effects = loaded.effects.records;
check(effects.every(row => Number.isFinite(Number(row.maxEffectSkillId))), 'effects: invalid maxEffectSkillId');
check(effects.every(row => typeof row.effectText === 'string'), 'effects: invalid effectText');
check(effects.every(row => Array.isArray(row.effectSegments)), 'effects: invalid effectSegments');

const restrictions = loaded.restrictions.records;
const allowedModes = new Set(contract.allowedRestrictionModes);
check(restrictions.every(row => allowedModes.has(row.mode)), 'restrictions: unexpected restriction mode');
check(restrictions.every(row => Array.isArray(row.generalArmyIds) && Array.isArray(row.specialJobIds)),
  'restrictions: invalid Army/Job arrays');

const acquisition = loaded.acquisition.records;
const classCounts = {};
for (const row of acquisition) {
  classCounts[row.acquisitionClass] = (classCounts[row.acquisitionClass] ?? 0) + 1;
}

for (const [classification, count] of Object.entries(expected.acquisitionClasses)) {
  check((classCounts[classification] ?? 0) === count,
    `acquisition: ${classification} count ${(classCounts[classification] ?? 0)} expected ${count}`);
}
check(Object.keys(classCounts).length === Object.keys(expected.acquisitionClasses).length,
  `acquisition: unexpected classes ${Object.keys(classCounts).filter(k => !hasOwn(expected.acquisitionClasses, k)).join(',')}`);

const classToTab = {
  launch: 1,
  'legacy-additional': 2,
  'current-additional': 3
};
for (const row of acquisition) {
  if (hasOwn(classToTab, row.acquisitionClass)) {
    check(row.siteTab === classToTab[row.acquisitionClass],
      `acquisition: ID ${row.equipmentId} wrong siteTab ${row.siteTab}`);
  } else {
    check(row.siteTab == null, `acquisition: ID ${row.equipmentId} non-general class leaked into siteTab ${row.siteTab}`);
  }
}

const tabCounts = Object.fromEntries([1, 2, 3].map(tab => [String(tab), acquisition.filter(row => row.siteTab === tab).length]));
for (const [tab, count] of Object.entries(expected.siteTabs)) {
  check(tabCounts[tab] === count, `acquisition: siteTab ${tab} count ${tabCounts[tab]} expected ${count}`);
}

const generalClasses = new Set(contract.pageAdmission.general);
const generalCount = acquisition.filter(row => generalClasses.has(row.acquisitionClass)).length;
const exclusiveCount = acquisition.filter(row => row.acquisitionClass === 'exclusive-equipment').length;
const soulCount = acquisition.filter(row => row.acquisitionClass === 'soul-special').length;
const unresolved = acquisition.filter(row => row.acquisitionClass === 'unresolved-no-path');

check(generalCount === expected.generalPageCount, `general page count ${generalCount}`);
check(exclusiveCount === expected.exclusiveEquipmentCount, `exclusive count ${exclusiveCount}`);
check(soulCount === expected.soulSpecialCount, `soul-special count ${soulCount}`);
check(unresolved.length === expected.unresolvedNoPathCount, `unresolved count ${unresolved.length}`);
check(unresolved.length === 1 && Number(unresolved[0].equipmentId) === 2013, 'unresolved exception must remain Equipment ID 2013');
check(Array.isArray(unresolved[0].raw?.getPathList) && unresolved[0].raw.getPathList.length === 0,
  'Equipment ID 2013 acquisition path is no longer empty');

const summary = {
  stage: '3-0',
  status: 'PASS',
  canonicalEquipmentCount: expected.equipmentCount,
  canonicalIdCoverage: Object.fromEntries(Object.entries(loaded).map(([name, source]) => [name, source.ids.length])),
  sourceSha256: Object.fromEntries(Object.entries(loaded).map(([name, source]) => [name, source.sha256])),
  pageAdmission: {
    general: generalCount,
    exclusive: exclusiveCount,
    soulSpecial: soulCount,
    unresolved: unresolved.length
  },
  acquisitionClasses: Object.fromEntries(Object.keys(expected.acquisitionClasses).map(key => [key, classCounts[key] ?? 0])),
  siteTabs: tabCounts,
  explicitException: {
    equipmentId: 2013,
    classification: 'unresolved-no-path',
    getPathListCount: unresolved[0].raw.getPathList.length
  },
  policy: {
    stage2Reopened: false,
    primaryKey: contract.consumerPolicy.primaryKey,
    nextStage: '3-1 page list/detail schema contract'
  }
};

fs.mkdirSync('data/validation', { recursive: true });
fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
