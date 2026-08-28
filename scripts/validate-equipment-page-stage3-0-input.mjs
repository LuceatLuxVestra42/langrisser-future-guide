import fs from 'node:fs';
import crypto from 'node:crypto';

const CONTRACT_PATH = 'data/contracts/equipment-page-stage3-0-input-contract.v1.json';
const SUMMARY_PATH = 'data/validation/equipment-page-stage3-0-input-summary.v1.json';
const CHECKPOINT_PATH = 'data/checkpoints/equipment-page-stage3-0-input-freeze.v1.json';

const loadBuffer = path => fs.readFileSync(path);
const load = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };

const uniqueIdSet = (records, key, label) => {
  check(Array.isArray(records), `${label}: records missing`);
  const ids = records.map(row => Number(row[key]));
  check(ids.every(Number.isInteger), `${label}: invalid ${key}`);
  const set = new Set(ids);
  check(set.size === ids.length, `${label}: duplicate ${key}`);
  return set;
};

const sameSet = (actual, expected, label) => {
  check(actual.size === expected.size, `${label}: size ${actual.size} expected ${expected.size}`);
  const missing = [...expected].filter(id => !actual.has(id));
  const extra = [...actual].filter(id => !expected.has(id));
  check(missing.length === 0 && extra.length === 0,
    `${label}: missing=${missing.join(',')} extra=${extra.join(',')}`);
};

const gitBlobSha = buffer => {
  const hash = crypto.createHash('sha1');
  hash.update(Buffer.from(`blob ${buffer.length}\0`, 'utf8'));
  hash.update(buffer);
  return hash.digest('hex');
};

const contract = load(CONTRACT_PATH);
const expected = contract.expected;

check(contract.schemaId === 'equipment-page-stage3-0-input-contract/v1', 'unexpected contract schema');
check(contract.stage === 'EQUIPMENT_PAGE_STAGE3_0', 'unexpected stage');
check(contract.policy?.semanticReanalysisAllowed === false, 'semantic reanalysis must remain forbidden');
check(contract.policy?.configDataReparseRequired === false, 'Stage 3-0 must not require ConfigData reparse');
check(contract.policy?.productionPublicEligibilityFrozenHere === false,
  '390 -> public population boundary must remain outside Stage 3-0');
check(contract.policy?.equipmentImageStage2PublicPopulation === 373,
  'Equipment Image Stage 2 population reference changed');
check(contract.policy?.publicPopulationBoundaryStage === 'EQUIPMENT_PAGE_STAGE3_2',
  'public population boundary stage changed');

check(Array.isArray(contract.inputs) && contract.inputs.length === 7, 'expected exactly seven Stage 2 inputs');

const fingerprint = crypto.createHash('sha256');
fingerprint.update(`${contract.inputFingerprint.namespace}\0`, 'utf8');
const actualBlobShas = {};
for (const spec of contract.inputs) {
  const buffer = loadBuffer(spec.path);
  const sha = gitBlobSha(buffer);
  actualBlobShas[spec.path] = sha;
  check(sha === spec.gitBlobSha, `${spec.path}: git blob SHA ${sha} expected ${spec.gitBlobSha}`);
  fingerprint.update(`${spec.path}\0${sha}\0`, 'utf8');
}
const actualFingerprint = fingerprint.digest('hex');
check(contract.inputFingerprint.version === 1, 'fingerprint version changed');
check(contract.inputFingerprint.algorithm === 'sha256', 'fingerprint algorithm changed');
check(contract.inputFingerprint.fileCount === 7, 'fingerprint file count changed');
check(actualFingerprint === contract.inputFingerprint.sha256,
  `input fingerprint ${actualFingerprint} expected ${contract.inputFingerprint.sha256}`);

const census = load(contract.inputs[0].path);
const basic = load(contract.inputs[1].path);
const filters = load(contract.inputs[2].path);
const stats = load(contract.inputs[3].path);
const effects = load(contract.inputs[4].path);
const restrictions = load(contract.inputs[5].path);
const acquisition = load(contract.inputs[6].path);

check(Number(census.counts?.allEquipmentRecords) === expected.rawEquipmentRecords,
  `census raw equipment ${census.counts?.allEquipmentRecords}`);
check(Number(census.counts?.rankCounts?.['4']) === expected.rawRank4SsrRecords,
  `census Rank 4 ${census.counts?.rankCounts?.['4']}`);
check(Number(census.counts?.ssrRecords) === expected.rawRank4SsrRecords,
  `census SSR ${census.counts?.ssrRecords}`);

check(basic.decision?.basicMetadataMaster === 'ConfigDataEquipmentInfo.ID',
  `basic metadata master ${basic.decision?.basicMetadataMaster}`);
check(basic.decision?.basicMetadataRequiresItemInfoJoin === false,
  'basic metadata unexpectedly requires ItemInfo join');
check(Number(basic.counts?.canonicalSsrEquipment) === expected.canonicalPopulation,
  `basic canonical ${basic.counts?.canonicalSsrEquipment}`);
check(Number(basic.counts?.directBasicComplete) === expected.basicMetadataComplete,
  `basic complete ${basic.counts?.directBasicComplete}`);
for (const field of ['ID', 'Name', 'Icon', 'Rank', 'Label']) {
  check(Number(basic.directEquipmentFields?.[field]) === expected.canonicalPopulation,
    `basic field ${field} coverage ${basic.directEquipmentFields?.[field]}`);
}

check(Number(filters.canonicalCount) === expected.canonicalPopulation,
  `filter canonical ${filters.canonicalCount}`);
check(Array.isArray(filters.unclassified) && filters.unclassified.length === expected.filterUnclassified,
  `filter unclassified ${filters.unclassified?.length}`);
const filterIds = uniqueIdSet(filters.records, 'id', 'filter map');
check(filterIds.size === expected.canonicalPopulation, `filter IDs ${filterIds.size}`);

check(Number(stats.canonicalCount) === expected.canonicalPopulation,
  `stats canonical ${stats.canonicalCount}`);
check(Array.isArray(stats.validationFixtures?.fixtureMismatches) &&
  stats.validationFixtures.fixtureMismatches.length === 0, 'stats fixture mismatches present');
const statIds = uniqueIdSet(stats.records, 'id', 'stats');
sameSet(statIds, filterIds, 'stats vs filter IDs');

check(Number(effects.canonicalCount) === expected.canonicalPopulation,
  `effects canonical ${effects.canonicalCount}`);
check(Number(effects.validation?.anomalyCount) === 0, `effects anomalyCount ${effects.validation?.anomalyCount}`);
check(Array.isArray(effects.anomalies) && effects.anomalies.length === 0, 'effects anomalies present');
const effectIds = uniqueIdSet(effects.records, 'equipmentId', 'effects');
sameSet(effectIds, filterIds, 'effects vs filter IDs');

check(Number(restrictions.canonicalCount) === expected.canonicalPopulation,
  `restrictions canonical ${restrictions.canonicalCount}`);
check(restrictions.semantics?.status === expected.restrictionSemantics.status,
  `restriction status ${restrictions.semantics?.status}`);
check(Number(restrictions.semantics?.confidence) === expected.restrictionSemantics.confidence,
  `restriction confidence ${restrictions.semantics?.confidence}`);
check(Number(restrictions.counts?.missingArmyRefs) === expected.restrictionSemantics.missingArmyRefs,
  `restriction missingArmyRefs ${restrictions.counts?.missingArmyRefs}`);
check(Number(restrictions.counts?.missingJobRefs) === expected.restrictionSemantics.missingJobRefs,
  `restriction missingJobRefs ${restrictions.counts?.missingJobRefs}`);
const restrictionIds = uniqueIdSet(restrictions.records, 'equipmentId', 'restrictions');
sameSet(restrictionIds, filterIds, 'restrictions vs filter IDs');

check(acquisition.status === 'complete-with-explicit-no-path-exception',
  `acquisition status ${acquisition.status}`);
check(Number(acquisition.counts?.canonical) === expected.canonicalPopulation,
  `acquisition canonical ${acquisition.counts?.canonical}`);
const acquisitionIds = uniqueIdSet(acquisition.records, 'equipmentId', 'acquisition');
sameSet(acquisitionIds, filterIds, 'acquisition vs filter IDs');

const classCounts = {
  launch: Number(acquisition.counts?.launch),
  legacyAdditional: Number(acquisition.counts?.['legacy-additional']),
  currentAdditional: Number(acquisition.counts?.['current-additional']),
  exclusiveEquipment: Number(acquisition.counts?.['exclusive-equipment']),
  soulSpecial: Number(acquisition.counts?.['soul-special']),
  unresolvedNoPath: Number(acquisition.counts?.['unresolved-no-path'])
};
const generalCount = classCounts.launch + classCounts.legacyAdditional + classCounts.currentAdditional;
check(generalCount === expected.generalEquipment, `general equipment ${generalCount}`);
check(classCounts.exclusiveEquipment === expected.exclusiveEquipment,
  `exclusive equipment ${classCounts.exclusiveEquipment}`);
check(classCounts.soulSpecial === expected.soulSpecialEquipment,
  `soul-special equipment ${classCounts.soulSpecial}`);
check(classCounts.unresolvedNoPath === expected.unresolvedNoPathEquipment,
  `unresolved-no-path ${classCounts.unresolvedNoPath}`);
check(generalCount + classCounts.exclusiveEquipment + classCounts.soulSpecial + classCounts.unresolvedNoPath
  === expected.canonicalPopulation, 'acquisition class total does not equal canonical population');

const unresolvedRows = acquisition.records.filter(row => row.acquisitionClass === 'unresolved-no-path');
const unresolvedIds = unresolvedRows.map(row => Number(row.equipmentId)).sort((a, b) => a - b);
check(JSON.stringify(unresolvedIds) === JSON.stringify(expected.unresolvedNoPathEquipmentIds),
  `unresolved IDs ${unresolvedIds.join(',')}`);
check(unresolvedRows.every(row => Array.isArray(row.raw?.getPathList) && row.raw.getPathList.length === 0),
  'unresolved-no-path exception unexpectedly has acquisition paths');

const summary = {
  schemaId: 'equipment-page-stage3-0-input-summary/v1',
  version: 1,
  stage: 'EQUIPMENT_PAGE_STAGE3_0',
  status: 'PASS_EQUIPMENT_PAGE_STAGE3_0_INPUT_FREEZE',
  completion: 'COMPLETE',
  canonicalPopulation: expected.canonicalPopulation,
  productionJoinKey: contract.canonicalIdentity.joinKey,
  identitySource: contract.canonicalIdentity.sourceField,
  inputArtifactCount: contract.inputs.length,
  inputFingerprint: contract.inputFingerprint,
  inputBlobShas: actualBlobShas,
  idSetCoverage: {
    filterMap: filterIds.size,
    stats: statIds.size,
    effects: effectIds.size,
    restrictions: restrictionIds.size,
    acquisition: acquisitionIds.size,
    allEqual: true
  },
  acquisitionClassCounts: {
    general: generalCount,
    exclusiveEquipment: classCounts.exclusiveEquipment,
    soulSpecial: classCounts.soulSpecial,
    unresolvedNoPath: classCounts.unresolvedNoPath
  },
  knownExceptions: [{
    equipmentId: 2013,
    status: 'unresolved-no-path',
    policy: 'preserve-explicitly-no-guessing'
  }],
  restrictionSemantics: expected.restrictionSemantics,
  publicPopulationBoundaryFrozenHere: false,
  equipmentImageStage2PublicPopulationReference: 373,
  errors: 0,
  semanticStageReopened: false,
  nextStage: contract.nextStage
};

const checkpoint = {
  schemaId: 'equipment-page-stage3-0-input-freeze/v1',
  version: 1,
  stage: 'EQUIPMENT_PAGE_STAGE3_0',
  status: 'PASS_EQUIPMENT_PAGE_STAGE3_0_INPUT_FREEZE',
  completion: 'COMPLETE',
  freezeState: 'EQUIPMENT_PAGE_STAGE3_0_INPUT_FROZEN',
  canonicalPopulation: expected.canonicalPopulation,
  productionJoinKey: contract.canonicalIdentity.joinKey,
  inputFingerprint: contract.inputFingerprint,
  inputArtifactCount: contract.inputs.length,
  idSetCoverage: summary.idSetCoverage,
  knownExceptions: summary.knownExceptions,
  restrictionSemantics: expected.restrictionSemantics,
  publicPopulationBoundaryStage: contract.policy.publicPopulationBoundaryStage,
  equipmentImageStage2PublicPopulationReference: 373,
  semanticStageReopened: false,
  nextStage: contract.nextStage
};

fs.mkdirSync('data/validation', { recursive: true });
fs.mkdirSync('data/checkpoints', { recursive: true });
fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(CHECKPOINT_PATH, `${JSON.stringify(checkpoint, null, 2)}\n`);

console.log(JSON.stringify({
  status: summary.status,
  canonicalPopulation: summary.canonicalPopulation,
  inputFingerprint: summary.inputFingerprint.sha256,
  idSetCoverage: summary.idSetCoverage,
  acquisitionClassCounts: summary.acquisitionClassCounts,
  unresolvedIds,
  restrictionSemantics: summary.restrictionSemantics,
  nextStage: summary.nextStage
}, null, 2));
