'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const P = {
  contract: 'data/contracts/hero-stage6-2-representative-fixture-qa.v1.json',
  stage61: 'data/generated/hero-detail-stage6-1.v1.json',
  stage61Validation: 'data/validation/hero-stage6-1-final.v1.json',
  stage4: 'data/generated/hero-basic-combat.v1.json',
  stage51: 'data/generated/hero-page-stage5-1-bonds-final.v1.json',
  stage52: 'data/generated/hero-page-stage5-2-exclusive-central.v1.json',
  stage53: 'data/generated/hero-page-soldiers-stage5-3.v1.json',
  stage54: 'data/generated/hero-page-stage5-4-sp.v1.json',
  stage55: 'data/hero-page-stage5-5-3.v1.json',
  fixtures: 'data/generated/hero-stage6-2-representative-fixtures.v1.json',
  validation: 'data/validation/hero-stage6-2-final.v1.json',
};

const abs = rel => path.join(ROOT, rel);
const read = rel => JSON.parse(fs.readFileSync(abs(rel), 'utf8'));
const write = (rel, value) => {
  fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
  fs.writeFileSync(abs(rel), JSON.stringify(value, null, 2) + '\n');
};
const blobSha = rel => {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${rel}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

const contract = read(P.contract);
const stage61 = read(P.stage61);
const stage61Validation = read(P.stage61Validation);
const stage4 = read(P.stage4);
const stage51 = read(P.stage51);
const stage52 = read(P.stage52);
const stage53 = read(P.stage53);
const stage54 = read(P.stage54);
const stage55 = read(P.stage55);

const hardErrors = [];
const allChecks = [];

function rows(doc, label) {
  const value = doc?.records;
  if (!Array.isArray(value)) {
    hardErrors.push(`${label}: records array missing`);
    return [];
  }
  return value;
}

function index(rowsValue, label) {
  const map = new Map();
  rowsValue.forEach((row, i) => {
    const id = Number(row?.heroId);
    if (!Number.isInteger(id)) {
      hardErrors.push(`${label}: invalid heroId at index ${i}`);
      return;
    }
    if (map.has(id)) hardErrors.push(`${label}: duplicate heroId ${id}`);
    else map.set(id, { row, index: i });
  });
  return map;
}

const r61 = rows(stage61, 'Stage 6-1');
const r4 = rows(stage4, 'Stage 4');
const r51 = rows(stage51, 'Stage 5-1');
const r52 = rows(stage52, 'Stage 5-2');
const r54 = rows(stage54, 'Stage 5-4');
const r55 = rows(stage55, 'Stage 5-5');
const i61 = index(r61, 'Stage 6-1');
const i4 = index(r4, 'Stage 4');
const i51 = index(r51, 'Stage 5-1');
const i52 = index(r52, 'Stage 5-2');
const i54 = index(r54, 'Stage 5-4');
const i55 = index(r55, 'Stage 5-5');

if (contract?.version !== 1 || contract?.stage !== 'hero-page-6-2' || contract?.status !== 'FROZEN') {
  hardErrors.push(`Stage 6-2 contract is not FROZEN v1 (${contract?.version}/${contract?.stage}/${contract?.status})`);
}
if (stage61?.status !== 'PASS' || stage61?.completion !== 'COMPLETE') {
  hardErrors.push(`Stage 6-1 is not PASS/COMPLETE (${stage61?.status}/${stage61?.completion})`);
}
if (stage61Validation?.status !== 'PASS' || stage61Validation?.completion !== 'COMPLETE') {
  hardErrors.push(`Stage 6-1 validation is not PASS/COMPLETE (${stage61Validation?.status}/${stage61Validation?.completion})`);
}
if ((stage61Validation?.summary?.hardErrorCount ?? 1) !== 0) {
  hardErrors.push(`Stage 6-1 validation hardErrorCount=${stage61Validation?.summary?.hardErrorCount}`);
}
if (r61.length !== 267 || r4.length !== 267 || r51.length !== 267 || r52.length !== 267 || r54.length !== 267 || r55.length !== 267) {
  hardErrors.push(`Expected 267 Hero records in all indexed sources; got 6-1=${r61.length}, 4=${r4.length}, 5-1=${r51.length}, 5-2=${r52.length}, 5-4=${r54.length}, 5-5=${r55.length}`);
}

const byHeroId = stage53?.byHeroId;
const soldiersById = stage53?.soldiersById;
if (!byHeroId || typeof byHeroId !== 'object' || Array.isArray(byHeroId)) hardErrors.push('Stage 5-3 byHeroId map missing.');
if (!soldiersById || typeof soldiersById !== 'object' || Array.isArray(soldiersById)) hardErrors.push('Stage 5-3 soldiersById map missing.');

const canonicalIds = [...i61.keys()].sort((a, b) => a - b);
const acceptedRarity = new Set(['N', 'R', 'SR', 'SSR', 'LLR']);
const acceptedOrigin = new Set(['ORIGINAL', 'MOBILE_ORIGINAL', 'COLLAB']);
const acceptedFeatureStatus = new Set(['RELEASED', 'NOT_RELEASED']);

function addCheck(family, heroId, name, pass, detail = null, type = 'common') {
  const item = { family, heroId, type, name, pass: Boolean(pass) };
  if (detail !== null) item.detail = detail;
  allChecks.push(item);
  if (!item.pass) hardErrors.push(`${family}/${heroId}/${name}${detail ? `: ${detail}` : ''}`);
  return item;
}

function unique(values) {
  return [...new Set(values)];
}

function branchCount(heroId) {
  const value = i4.get(heroId)?.row?.jobTree?.branches;
  return Array.isArray(value) ? value.length : 0;
}

function jobNames(heroId) {
  const connections = i4.get(heroId)?.row?.jobTree?.connections;
  if (!Array.isArray(connections)) return [];
  return unique(connections.map(x => x?.job?.nameCn).filter(x => typeof x === 'string' && x.length));
}

const jobNameHeroFrequency = new Map();
for (const heroId of canonicalIds) {
  for (const name of jobNames(heroId)) jobNameHeroFrequency.set(name, (jobNameHeroFrequency.get(name) || 0) + 1);
}

function sharedJobEvidence(heroId) {
  const shared = jobNames(heroId)
    .map(name => ({ nameCn: name, heroFrequency: jobNameHeroFrequency.get(name) || 0 }))
    .filter(x => x.heroFrequency > 1)
    .sort((a, b) => b.heroFrequency - a.heroFrequency || a.nameCn.localeCompare(b.nameCn));
  return {
    sharedJobNames: shared,
    sharedJobNameCount: shared.length,
    sharedJobFrequencyScore: shared.reduce((sum, x) => sum + x.heroFrequency, 0),
  };
}

function spStatus(heroId) {
  return i54.get(heroId)?.row?.sp?.status ?? null;
}
function header(heroId) {
  return i55.get(heroId)?.row;
}
function rarity(heroId) {
  return header(heroId)?.rarity?.baseLabel ?? null;
}
function origin(heroId) {
  return header(heroId)?.origin?.category ?? null;
}

function median(nums) {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function chooseLowest(candidates) {
  return [...candidates].sort((a, b) => a - b)[0] ?? null;
}

const used = new Set();
const selected = new Map();
const selectionEvidence = new Map();

function selectFamily(family, heroId, evidence = {}) {
  if (!Number.isInteger(heroId)) {
    hardErrors.push(`${family}: no eligible Hero fixture found`);
    return;
  }
  if (used.has(heroId)) {
    hardErrors.push(`${family}: selected duplicate Hero ${heroId}`);
    return;
  }
  selected.set(family, heroId);
  selectionEvidence.set(family, evidence);
  used.add(heroId);
}

// Explicit structural exception required by the project QA plan.
selectFamily('matthew-structural-exception', i61.has(1) ? 1 : null, {
  selector: 'canonical heroId 1',
  releaseChronologyAsserted: false,
});

const llrCandidates = canonicalIds.filter(id => !used.has(id) && rarity(id) === 'LLR');
selectFamily('llr', chooseLowest(llrCandidates), {
  selector: 'lowest canonical heroId with baseLabel LLR',
  eligibleCount: llrCandidates.length,
});

const collabCandidates = canonicalIds.filter(id => !used.has(id) && origin(id) === 'COLLAB');
selectFamily('collab', chooseLowest(collabCandidates), {
  selector: 'lowest canonical heroId with origin.category COLLAB',
  eligibleCount: collabCandidates.length,
});

const spCandidates = canonicalIds.filter(id => !used.has(id) && spStatus(id) === 'RELEASED');
selectFamily('sp', chooseLowest(spCandidates), {
  selector: 'lowest unused canonical heroId with Stage 5-4 SP RELEASED',
  eligibleCount: spCandidates.length,
});

const rsrCandidates = canonicalIds
  .filter(id => !used.has(id) && ['R', 'SR'].includes(rarity(id)))
  .map(id => ({ id, ...sharedJobEvidence(id) }))
  .sort((a, b) => b.sharedJobNameCount - a.sharedJobNameCount || b.sharedJobFrequencyScore - a.sharedJobFrequencyScore || a.id - b.id);
const rsrPick = rsrCandidates[0] || null;
selectFamily('shared-job-rsr', rsrPick?.id ?? null, {
  selector: 'maximize shared job-name count, then aggregate cross-Hero frequency, then lowest heroId',
  eligibleCount: rsrCandidates.length,
  selectedSharedJobNameCount: rsrPick?.sharedJobNameCount ?? null,
  selectedSharedJobFrequencyScore: rsrPick?.sharedJobFrequencyScore ?? null,
});

const regularSsrPopulation = canonicalIds.filter(id => rarity(id) === 'SSR' && origin(id) !== 'COLLAB' && spStatus(id) !== 'RELEASED');
const regularSsrMedianBranchCount = median(regularSsrPopulation.map(branchCount));
const regularSsrCandidates = regularSsrPopulation
  .filter(id => !used.has(id))
  .map(id => ({ id, distance: Math.abs(branchCount(id) - regularSsrMedianBranchCount) }))
  .sort((a, b) => a.distance - b.distance || a.id - b.id);
selectFamily('regular-ssr', regularSsrCandidates[0]?.id ?? null, {
  selector: 'closest to eligible-population median branch count, then lowest heroId',
  eligiblePopulationCount: regularSsrPopulation.length,
  medianBranchCount: regularSsrMedianBranchCount,
});

const multiCandidates = canonicalIds
  .filter(id => !used.has(id) && origin(id) !== 'COLLAB')
  .map(id => ({ id, branchCount: branchCount(id) }))
  .sort((a, b) => b.branchCount - a.branchCount || a.id - b.id);
const multiPick = multiCandidates[0] || null;
selectFamily('multi-branch-structural', multiPick?.id ?? null, {
  selector: 'maximum unused non-COLLAB Stage-4 branch count, then lowest heroId',
  eligibleCount: multiCandidates.length,
  maxEligibleBranchCount: multiPick?.branchCount ?? null,
  releaseChronologyAsserted: false,
});

const familyOrder = [
  'regular-ssr',
  'multi-branch-structural',
  'shared-job-rsr',
  'sp',
  'llr',
  'collab',
  'matthew-structural-exception',
];

function nameValues(heroId, field) {
  const values = [
    i4.get(heroId)?.row?.[field],
    i51.get(heroId)?.row?.[field],
    i52.get(heroId)?.row?.[field],
    i54.get(heroId)?.row?.[field],
    i55.get(heroId)?.row?.identity?.[field],
  ].filter(v => typeof v === 'string' && v.length);
  return values;
}

function buildFixture(family, heroId) {
  const s61 = i61.get(heroId)?.row;
  const normal = i4.get(heroId)?.row;
  const bonds = i51.get(heroId)?.row;
  const exCentral = i52.get(heroId)?.row;
  const sp = i54.get(heroId)?.row;
  const hdr = i55.get(heroId)?.row;
  const soldierIds = Array.isArray(byHeroId?.[String(heroId)]) ? byHeroId[String(heroId)].map(Number) : [];
  const fixtureChecks = [];
  const check = (name, pass, detail = null, type = 'common') => {
    const item = addCheck(family, heroId, name, pass, detail, type);
    fixtureChecks.push(item);
  };

  check('stage61-record-present', Boolean(s61));
  const locatorMap = [
    ['normal', r4],
    ['bonds', r51],
    ['exclusiveCentral', r52],
    ['sp', r54],
    ['header', r55],
  ];
  for (const [key, sourceRows] of locatorMap) {
    const sourceIndex = s61?.sourceIndexes?.[key];
    check(`source-locator-${key}`, Number.isInteger(sourceIndex) && Number(sourceRows[sourceIndex]?.heroId) === heroId,
      `index=${sourceIndex}, resolvedHeroId=${sourceRows[sourceIndex]?.heroId ?? null}`, 'locator');
  }
  check('soldiers-key', s61?.soldiersKey === String(heroId) && Object.prototype.hasOwnProperty.call(byHeroId || {}, String(heroId)),
    `soldiersKey=${s61?.soldiersKey}`, 'locator');

  const expectedEquipmentId = Number.isInteger(Number(exCentral?.exclusiveEquipment?.equipmentId))
    ? Number(exCentral.exclusiveEquipment.equipmentId) : null;
  check('snapshot-exclusive-status', s61?.snapshot?.exclusiveEquipmentStatus === exCentral?.exclusiveEquipment?.status,
    `${s61?.snapshot?.exclusiveEquipmentStatus} vs ${exCentral?.exclusiveEquipment?.status}`, 'snapshot');
  check('snapshot-equipment-id', s61?.snapshot?.equipmentId === expectedEquipmentId,
    `${s61?.snapshot?.equipmentId} vs ${expectedEquipmentId}`, 'snapshot');
  check('snapshot-central-status', s61?.snapshot?.centralDisciplineStatus === exCentral?.centralDiscipline?.status,
    `${s61?.snapshot?.centralDisciplineStatus} vs ${exCentral?.centralDiscipline?.status}`, 'snapshot');
  check('snapshot-soldier-count', s61?.snapshot?.soldierCount === soldierIds.length,
    `${s61?.snapshot?.soldierCount} vs ${soldierIds.length}`, 'snapshot');
  check('snapshot-sp-status', s61?.snapshot?.spStatus === sp?.sp?.status,
    `${s61?.snapshot?.spStatus} vs ${sp?.sp?.status}`, 'snapshot');

  for (const field of ['nameKr', 'nameCn', 'nameEn']) {
    const values = nameValues(heroId, field);
    check(`identity-${field}`, unique(values).length <= 1, JSON.stringify(values));
  }

  const tree = normal?.jobTree;
  const connections = Array.isArray(tree?.connections) ? tree.connections : [];
  const connectionIds = connections.map(x => Number(x?.jobConnectionId)).filter(Number.isInteger);
  const connectionSet = new Set(connectionIds);
  const branches = Array.isArray(tree?.branches) ? tree.branches : [];
  check('job-connections-present', connections.length > 0, `count=${connections.length}`);
  check('job-connection-ids-unique', connectionIds.length === connectionSet.size,
    `ids=${connectionIds.length}, unique=${connectionSet.size}`);
  check('job-primary-resolves', Number.isInteger(Number(tree?.primaryJobConnectionId)) && connectionSet.has(Number(tree.primaryJobConnectionId)),
    `primary=${tree?.primaryJobConnectionId}`);
  const unresolvedBranchIds = unique(branches.flat().map(Number).filter(Number.isInteger).filter(id => !connectionSet.has(id)));
  check('job-branch-ids-resolve', unresolvedBranchIds.length === 0, `unresolved=${unresolvedBranchIds.join(',')}`);

  const bondRows = Array.isArray(bonds?.bonds) ? bonds.bonds : null;
  check('bonds-array', Array.isArray(bondRows));
  check('bonds-source-resolved', Array.isArray(bondRows) && bondRows.every(x => x?.sourceResolved === true),
    `unresolved=${Array.isArray(bondRows) ? bondRows.filter(x => x?.sourceResolved !== true).length : 'n/a'}`);

  const ex = exCentral?.exclusiveEquipment;
  const central = exCentral?.centralDiscipline;
  check('exclusive-status-valid', acceptedFeatureStatus.has(ex?.status), `status=${ex?.status}`);
  check('central-status-valid', acceptedFeatureStatus.has(central?.status), `status=${central?.status}`);
  if (ex?.status === 'RELEASED') {
    check('exclusive-released-equipment-id', Number.isInteger(Number(ex?.equipmentId)), `equipmentId=${ex?.equipmentId}`);
    check('exclusive-owner-parity', ex?.ownerHeroId == null || Number(ex.ownerHeroId) === heroId,
      `ownerHeroId=${ex?.ownerHeroId}`);
  }

  check('soldiers-array', Array.isArray(byHeroId?.[String(heroId)]));
  check('soldier-ids-unique', soldierIds.length === new Set(soldierIds).size,
    `count=${soldierIds.length}, unique=${new Set(soldierIds).size}`);
  const missingSoldiers = unique(soldierIds.filter(id => !Object.prototype.hasOwnProperty.call(soldiersById || {}, String(id))));
  check('soldier-ids-resolve', missingSoldiers.length === 0, `missing=${missingSoldiers.join(',')}`);

  check('sp-status-valid', acceptedFeatureStatus.has(sp?.sp?.status), `status=${sp?.sp?.status}`);
  check('header-rarity-valid', acceptedRarity.has(hdr?.rarity?.baseLabel), `baseLabel=${hdr?.rarity?.baseLabel}`);
  check('header-origin-valid', acceptedOrigin.has(hdr?.origin?.category), `category=${hdr?.origin?.category}`);
  check('header-factions-array', Array.isArray(hdr?.factions));
  check('header-skins-array', Array.isArray(hdr?.skins));
  check('header-artwork-path', typeof hdr?.artwork?.sourceAssetPath === 'string' && hdr.artwork.sourceAssetPath.length > 0,
    `path=${hdr?.artwork?.sourceAssetPath ?? null}`);

  const familyEvidence = selectionEvidence.get(family) || {};
  if (family === 'regular-ssr') {
    check('family-regular-ssr-rarity', rarity(heroId) === 'SSR', `rarity=${rarity(heroId)}`, 'family');
    check('family-regular-ssr-origin', origin(heroId) !== 'COLLAB', `origin=${origin(heroId)}`, 'family');
    check('family-regular-ssr-no-sp', spStatus(heroId) !== 'RELEASED', `sp=${spStatus(heroId)}`, 'family');
  } else if (family === 'multi-branch-structural') {
    check('family-multi-branch-max', branchCount(heroId) === familyEvidence.maxEligibleBranchCount,
      `branchCount=${branchCount(heroId)}, expectedMax=${familyEvidence.maxEligibleBranchCount}`, 'family');
    check('family-release-chronology-not-asserted', familyEvidence.releaseChronologyAsserted === false, null, 'family');
  } else if (family === 'shared-job-rsr') {
    const shared = sharedJobEvidence(heroId);
    check('family-rsr-rarity', ['R', 'SR'].includes(rarity(heroId)), `rarity=${rarity(heroId)}`, 'family');
    check('family-rsr-shared-job', shared.sharedJobNameCount > 0, `sharedJobNameCount=${shared.sharedJobNameCount}`, 'family');
  } else if (family === 'sp') {
    check('family-sp-released', spStatus(heroId) === 'RELEASED', `sp=${spStatus(heroId)}`, 'family');
  } else if (family === 'llr') {
    check('family-llr-rarity', rarity(heroId) === 'LLR', `rarity=${rarity(heroId)}`, 'family');
  } else if (family === 'collab') {
    check('family-collab-origin', origin(heroId) === 'COLLAB', `origin=${origin(heroId)}`, 'family');
  } else if (family === 'matthew-structural-exception') {
    check('family-matthew-id', heroId === 1, `heroId=${heroId}`, 'family');
    check('family-matthew-branch-count', branchCount(heroId) >= 5, `branchCount=${branchCount(heroId)}`, 'family');
  }

  const sharedJobs = sharedJobEvidence(heroId);
  return {
    family,
    heroId,
    identity: hdr?.identity ?? {
      nameKr: normal?.nameKr ?? null,
      nameCn: normal?.nameCn ?? null,
      nameEn: normal?.nameEn ?? null,
    },
    selection: familyEvidence,
    traits: {
      rarity: rarity(heroId),
      originCategory: origin(heroId),
      spStatus: spStatus(heroId),
      branchCount: branchCount(heroId),
      jobConnectionCount: connections.length,
      sharedJobNameCount: sharedJobs.sharedJobNameCount,
      sharedJobFrequencyScore: sharedJobs.sharedJobFrequencyScore,
      sharedJobNames: sharedJobs.sharedJobNames,
      soldierCount: soldierIds.length,
      bondCount: Array.isArray(bondRows) ? bondRows.length : null,
      exclusiveEquipmentStatus: ex?.status ?? null,
      equipmentId: expectedEquipmentId,
      centralDisciplineStatus: central?.status ?? null,
      factionCount: Array.isArray(hdr?.factions) ? hdr.factions.length : null,
      skinCount: Array.isArray(hdr?.skins) ? hdr.skins.length : null,
    },
    qa: {
      checkCount: fixtureChecks.length,
      failedCheckCount: fixtureChecks.filter(x => !x.pass).length,
      checks: fixtureChecks,
    },
  };
}

if (selected.size !== 7) hardErrors.push(`Selected fixture family count ${selected.size}, expected 7.`);
if (used.size !== 7) hardErrors.push(`Distinct fixture Hero count ${used.size}, expected 7.`);

const fixtures = familyOrder
  .filter(family => selected.has(family))
  .map(family => buildFixture(family, selected.get(family)));

const failedChecks = allChecks.filter(x => !x.pass);
const locatorFailures = failedChecks.filter(x => x.type === 'locator');
const snapshotFailures = failedChecks.filter(x => x.type === 'snapshot');
const familyFailures = failedChecks.filter(x => x.type === 'family');
const stageBState = stage61?.parallelDependencies?.heroExclusiveEquipmentRelation?.state ?? null;

const sourceTrace = Object.fromEntries([
  P.contract,
  P.stage61,
  P.stage61Validation,
  P.stage4,
  P.stage51,
  P.stage52,
  P.stage53,
  P.stage54,
  P.stage55,
].map(rel => [rel, { gitBlobSha: blobSha(rel) }]));

const fixtureOutput = {
  version: 1,
  stage: 'hero-page-6-2',
  artifact: 'representative-fixtures',
  status: hardErrors.length ? 'FAIL' : 'PASS',
  completion: hardErrors.length ? 'BLOCKED' : 'COMPLETE',
  sourcePolicy: 'QA-only representative fixtures resolved from frozen Stage 4/5 and Stage 6-1 outputs. No semantic relation is re-derived here.',
  sources: sourceTrace,
  selectionSummary: {
    requiredFamilyCount: 7,
    selectedFamilyCount: selected.size,
    distinctHeroCount: used.size,
    releaseChronologyAsserted: false,
  },
  fixtures,
};

const validation = {
  version: 1,
  stage: 'hero-page-6-2',
  checkpoint: 'representative-fixture-qa',
  status: hardErrors.length ? 'FAIL' : 'PASS',
  completion: hardErrors.length ? 'BLOCKED' : 'COMPLETE',
  contract: P.contract,
  sources: sourceTrace,
  summary: {
    requiredFixtureFamilyCount: 7,
    selectedFixtureFamilyCount: selected.size,
    distinctFixtureHeroCount: used.size,
    totalCheckCount: allChecks.length,
    failedCheckCount: failedChecks.length,
    sourceLocatorMismatchCount: locatorFailures.length,
    snapshotMismatchCount: snapshotFailures.length,
    familyRuleFailureCount: familyFailures.length,
    hardErrorCount: hardErrors.length,
    stageBState,
    releaseChronologyAsserted: false,
  },
  selectedFixtures: fixtures.map(x => ({
    family: x.family,
    heroId: x.heroId,
    nameKr: x.identity?.nameKr ?? null,
    nameEn: x.identity?.nameEn ?? null,
    rarity: x.traits.rarity,
    originCategory: x.traits.originCategory,
    spStatus: x.traits.spStatus,
    branchCount: x.traits.branchCount,
    sharedJobNameCount: x.traits.sharedJobNameCount,
    soldierCount: x.traits.soldierCount,
    failedCheckCount: x.qa.failedCheckCount,
  })),
  failedChecks,
  hardErrors,
  nonBlockingNotes: [
    'The project QA target describes a multi-branch old-character case, but Stage 6-2 has no release chronology source. This checkpoint validates the multi-branch structure and explicitly does not assert release age.',
    `Hero-exclusive Equipment shared-relation adoption remains owned by Stage B; current Stage 6-1 dependency state is ${stageBState}.`,
    'Existing presentation-only localization gaps inherited from Stage 5 remain outside the structural fixture gate.',
  ],
  decision: hardErrors.length
    ? `Hero Stage 6-2 is BLOCKED with ${hardErrors.length} hard error(s).`
    : 'Hero Stage 6-2 is COMPLETE. Seven distinct representative Hero fixtures cover regular SSR, multi-branch structure, shared-job R/SR, SP, LLR, collaboration, and Matthew structural-exception cases with zero locator, snapshot, family-rule, or hard errors.',
};

write(P.fixtures, fixtureOutput);
write(P.validation, validation);

console.log(JSON.stringify({
  status: validation.status,
  completion: validation.completion,
  summary: validation.summary,
  selectedFixtures: validation.selectedFixtures,
  hardErrors: validation.hardErrors,
}, null, 2));

if (hardErrors.length) process.exitCode = 1;
