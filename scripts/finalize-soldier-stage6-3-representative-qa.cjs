const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const paths = {
  fullRecords: 'data/generated/soldier-stage6-1-full-records.v1.json',
  fullValidation: 'data/validation/soldier-stage6-1-full-records.v1.json',
  classification: 'data/generated/soldier-stage6-2-classification.v1.json',
  classificationValidation: 'data/validation/soldier-stage6-2-classification.v1.json',
  relationSet: 'data/generated/hero-soldier-relations.v1.json',
  relationValidation: 'data/validation/hero-soldier-relation-validation.v1.json',
  fixturePlan: 'data/fixtures/soldier-stage6-3-fixtures.v1.json',
  validation: 'data/validation/soldier-stage6-3-representative-qa.v1.json',
};

function abs(p) { return path.join(rootDir, p); }
function loadJson(p) { return JSON.parse(fs.readFileSync(abs(p), 'utf8')); }
function writeJson(p, value) {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), JSON.stringify(value, null, 2) + '\n');
}
function trackedBlobSha(p) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${p}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
function worktreeBlobSha(p) {
  try {
    return execFileSync('git', ['hash-object', abs(p)], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
function indexByInteger(records, key) {
  const map = new Map();
  const duplicates = [];
  for (const record of records) {
    const id = record?.[key];
    if (!Number.isInteger(id)) continue;
    if (map.has(id)) duplicates.push(id); else map.set(id, record);
  }
  return { map, duplicates: [...new Set(duplicates)].sort((a,b)=>a-b) };
}
function sortedUniqueIntegers(values) {
  return Array.isArray(values)
    && values.every((v, i) => Number.isInteger(v) && (i === 0 || v > values[i - 1]));
}
function allFiniteNumbers(obj, keys) {
  return !!obj && keys.every(key => typeof obj[key] === 'number' && Number.isFinite(obj[key]));
}
function missionTypes(stage) {
  return (Array.isArray(stage?.missions) ? stage.missions : [])
    .map(m => m?.missionType)
    .filter(Number.isInteger)
    .sort((a,b)=>a-b);
}
function edgeHasSource(edge, sourceKind) {
  return Array.isArray(edge?.provenance) && edge.provenance.some(p => p?.sourceKind === sourceKind);
}
function edgeKey(edge) { return `${edge.heroId}:${edge.soldierId}`; }
function label(record) {
  return record?.identity?.nameKr ?? record?.identity?.nameCn ?? `soldier-${record?.soldierId ?? 'unknown'}`;
}

function chooseFixturePlan(fullRecords, classifications, relationSet, generatedAt) {
  const records = [...fullRecords].sort((a,b)=>a.soldierId-b.soldierId);
  const classificationIndex = indexByInteger(classifications, 'soldierId').map;
  const relationEdges = [...relationSet].sort((a,b)=>a.soldierId-b.soldierId || a.heroId-b.heroId);

  const normalTier3 = records.find(r =>
    r?.identity?.isSp === false
    && r?.identity?.tier === 3
    && Array.isArray(r?.ability?.levels) && r.ability.levels.length === 10
    && Array.isArray(r?.training?.perLevelCost) && r.training.perLevelCost.length === 10
    && classificationIndex.get(r.soldierId)?.classification === 'PASS'
  ) ?? records.find(r => r?.identity?.isSp === false && r?.identity?.tier === 3);

  const spFirstStageOnly = records.find(r => r?.identity?.isSp === true && r?.sp?.secondStageUnlock === false);
  const spTwoStage = records.find(r => r?.identity?.isSp === true && r?.sp?.secondStageUnlock === true);
  const spHeroRewardEdge = relationEdges.find(edge => edgeHasSource(edge, 'SP_HERO_REWARD'));
  const spExpandEdge = relationEdges.find(edge => edgeHasSource(edge, 'SP_SOLDIER_EXPAND'));

  const byUiGroup = new Map();
  for (const record of records) {
    const uiGroup = record?.identity?.uiGroup;
    const armyType = record?.identity?.armyType;
    if (typeof uiGroup !== 'string' || typeof armyType !== 'string') continue;
    const bucket = byUiGroup.get(uiGroup) ?? new Map();
    const arr = bucket.get(armyType) ?? [];
    arr.push(record);
    bucket.set(armyType, arr);
    byUiGroup.set(uiGroup, bucket);
  }
  const combinedGroups = [...byUiGroup.entries()]
    .filter(([, types]) => types.size >= 2)
    .sort(([a],[b]) => a.localeCompare(b));
  let classUiBoundary = null;
  if (combinedGroups.length) {
    const [uiGroup, typeMap] = combinedGroups[0];
    const armyTypes = [...typeMap.keys()].sort();
    const pickForType = (type) => {
      const candidates = [...typeMap.get(type)].sort((a,b)=>a.soldierId-b.soldierId);
      return candidates.find(r => r?.identity?.tier === 3 && r?.identity?.isSp === false) ?? candidates[0];
    };
    const left = pickForType(armyTypes[0]);
    const right = pickForType(armyTypes[1]);
    classUiBoundary = {
      uiGroup,
      left: { soldierId: left?.soldierId ?? null, armyType: left?.identity?.armyType ?? null },
      right: { soldierId: right?.soldierId ?? null, armyType: right?.identity?.armyType ?? null },
    };
  }

  return {
    version: 1,
    schemaId: 'soldier-stage6-3-fixtures/v1',
    stage: '6-3',
    status: 'FROZEN',
    generatedAt,
    purpose: 'Frozen representative QA fixtures covering structurally distinct Soldier page-data cases before filter/site integration QA.',
    selectionPolicy: 'On first creation, select deterministic representatives from frozen Stage 6-1 records and the shared Hero-Soldier relation set; subsequent runs validate these exact frozen fixtures instead of silently replacing them.',
    sources: {
      fullRecords: { path: paths.fullRecords, gitBlobSha: trackedBlobSha(paths.fullRecords) },
      classification: { path: paths.classification, gitBlobSha: trackedBlobSha(paths.classification) },
      relationSet: { path: paths.relationSet, gitBlobSha: trackedBlobSha(paths.relationSet) },
    },
    fixtures: {
      normalTier3: { soldierId: normalTier3?.soldierId ?? null },
      spFirstStageOnly: { soldierId: spFirstStageOnly?.soldierId ?? null },
      spTwoStage: { soldierId: spTwoStage?.soldierId ?? null },
      spHeroAddedRelation: {
        soldierId: spHeroRewardEdge?.soldierId ?? null,
        heroId: spHeroRewardEdge?.heroId ?? null,
        sourceKind: 'SP_HERO_REWARD',
      },
      secondStageExpandHero: {
        soldierId: spExpandEdge?.soldierId ?? null,
        heroId: spExpandEdge?.heroId ?? null,
        sourceKind: 'SP_SOLDIER_EXPAND',
      },
      classUiGroupBoundary: classUiBoundary,
    },
  };
}

function main() {
  const full = loadJson(paths.fullRecords);
  const fullValidation = loadJson(paths.fullValidation);
  const classification = loadJson(paths.classification);
  const classificationValidation = loadJson(paths.classificationValidation);
  const relationSet = loadJson(paths.relationSet);
  const relationValidation = loadJson(paths.relationValidation);

  const records = Array.isArray(full.records) ? full.records : [];
  const classifications = Array.isArray(classification.records) ? classification.records : [];
  const edges = Array.isArray(relationSet.edges) ? relationSet.edges : [];
  const recordIndex = indexByInteger(records, 'soldierId');
  const classificationIndex = indexByInteger(classifications, 'soldierId');
  const relationIndex = new Map(edges.map(edge => [edgeKey(edge), edge]));
  const errors = [];
  const reviews = [];

  if (full.status !== 'PASS') errors.push(`Stage 6-1 full records must be PASS, got ${full.status}`);
  if (fullValidation.status !== 'PASS') errors.push(`Stage 6-1 validation must be PASS, got ${fullValidation.status}`);
  if (classification.status !== 'PASS') errors.push(`Stage 6-2 classification artifact must be PASS, got ${classification.status}`);
  if (classificationValidation.status !== 'PASS') errors.push(`Stage 6-2 validation must be PASS, got ${classificationValidation.status}`);
  if (relationValidation.status !== 'PASS') errors.push(`Hero-Soldier relation validation must be PASS, got ${relationValidation.status}`);
  if (recordIndex.duplicates.length) errors.push(`Duplicate Stage 6-1 Soldier IDs: ${recordIndex.duplicates.join(', ')}`);
  if (classificationIndex.duplicates.length) errors.push(`Duplicate Stage 6-2 classification IDs: ${classificationIndex.duplicates.join(', ')}`);

  let fixturePlan;
  if (fs.existsSync(abs(paths.fixturePlan))) {
    fixturePlan = loadJson(paths.fixturePlan);
  } else {
    fixturePlan = chooseFixturePlan(records, classifications, edges, full.generatedAt ?? null);
    writeJson(paths.fixturePlan, fixturePlan);
  }

  if (fixturePlan.status !== 'FROZEN') errors.push(`Stage 6-3 fixture plan must be FROZEN, got ${fixturePlan.status}`);
  if (fixturePlan.schemaId !== 'soldier-stage6-3-fixtures/v1') errors.push(`Unexpected Stage 6-3 fixture schemaId: ${fixturePlan.schemaId}`);

  const fixtureResults = [];
  function addFixtureResult(kind, pass, details, fixtureErrors = []) {
    if (!pass) errors.push(`${kind} fixture failed: ${fixtureErrors.join('; ')}`);
    fixtureResults.push({ kind, status: pass ? 'PASS' : 'FAIL', ...details, errors: fixtureErrors });
  }
  function classificationFor(id) {
    return classificationIndex.map.get(id) ?? null;
  }
  function reviewFixtureIfNeeded(kind, id) {
    const c = classificationFor(id);
    if (c?.classification === 'REVIEW') {
      reviews.push({ kind, soldierId: id, classification: 'REVIEW', reasons: Array.isArray(c.reasons) ? c.reasons : [] });
    }
    return c;
  }

  // 1) Normal tier-3 complete detail path.
  {
    const id = fixturePlan?.fixtures?.normalTier3?.soldierId;
    const r = recordIndex.map.get(id);
    const c = reviewFixtureIfNeeded('NORMAL_TIER3', id);
    const e = [];
    if (!r) e.push('record missing');
    if (r && r.identity?.isSp !== false) e.push('isSp must be false');
    if (r && r.identity?.tier !== 3) e.push('tier must be 3');
    if (r && !allFiniteNumbers(r.combat, ['hp','atk','def','mdef','move','range'])) e.push('combat block incomplete');
    if (r && !(Array.isArray(r.ability?.levels) && r.ability.levels.length === 10 && r.ability.levels.every((x,i)=>x?.level===i+1))) e.push('ability levels must be 1..10');
    if (r && !(Array.isArray(r.training?.perLevelCost) && r.training.perLevelCost.length === 10 && r.training.perLevelCost.every((x,i)=>x?.level===i+1))) e.push('training levels must be 1..10');
    if (r && r.ability?.techId !== r.training?.techId) e.push('ability/training techId mismatch');
    if (r && !sortedUniqueIntegers(r.heroes?.finalHeroIds)) e.push('finalHeroIds not sorted unique integers');
    if (r && r.sp !== null) e.push('normal Soldier must have sp=null');
    if (c?.classification === 'FAIL') e.push('Stage 6-2 classified fixture as FAIL');
    addFixtureResult('NORMAL_TIER3', e.length === 0, {
      soldierId: id ?? null,
      label: r ? label(r) : null,
      classification: c?.classification ?? null,
      techId: r?.ability?.techId ?? null,
      heroCount: Array.isArray(r?.heroes?.finalHeroIds) ? r.heroes.finalHeroIds.length : null,
    }, e);
  }

  // 2) SP first-stage-only branch.
  {
    const id = fixturePlan?.fixtures?.spFirstStageOnly?.soldierId;
    const r = recordIndex.map.get(id);
    const c = reviewFixtureIfNeeded('SP_FIRST_STAGE_ONLY', id);
    const e = [];
    if (!r) e.push('record missing');
    if (r && r.identity?.isSp !== true) e.push('isSp must be true');
    if (r && r.sp?.spSoldierId !== id) e.push('spSoldierId mismatch');
    if (r && !Number.isInteger(r.sp?.normalSoldierId)) e.push('normalSoldierId missing');
    if (r && r.sp?.secondStageUnlock !== false) e.push('secondStageUnlock must be false');
    if (r && JSON.stringify(missionTypes(r.sp?.stage1)) !== JSON.stringify([73,123])) e.push('stage1 mission types must be 73+123');
    if (r && r.sp?.stage2 !== null) e.push('one-stage SP must have stage2=null');
    if (r && !(Array.isArray(r.sp?.expandedHeroIds) && r.sp.expandedHeroIds.length === 0)) e.push('one-stage SP must not expose expandedHeroIds');
    if (r && !(Array.isArray(r.sp?.descriptionLevels) && r.sp.descriptionLevels.length === 10)) e.push('SP description levels must contain 10 rows');
    if (r && !allFiniteNumbers(r.sp?.statDelta, ['hp','atk','def','mdef','move','range'])) e.push('SP statDelta incomplete');
    if (c?.classification === 'FAIL') e.push('Stage 6-2 classified fixture as FAIL');
    addFixtureResult('SP_FIRST_STAGE_ONLY', e.length === 0, {
      soldierId: id ?? null,
      label: r ? label(r) : null,
      normalSoldierId: r?.sp?.normalSoldierId ?? null,
      classification: c?.classification ?? null,
    }, e);
  }

  // 3) SP two-stage branch.
  {
    const id = fixturePlan?.fixtures?.spTwoStage?.soldierId;
    const r = recordIndex.map.get(id);
    const c = reviewFixtureIfNeeded('SP_TWO_STAGE', id);
    const e = [];
    if (!r) e.push('record missing');
    if (r && r.identity?.isSp !== true) e.push('isSp must be true');
    if (r && r.sp?.secondStageUnlock !== true) e.push('secondStageUnlock must be true');
    if (r && JSON.stringify(missionTypes(r.sp?.stage1)) !== JSON.stringify([73,123])) e.push('stage1 mission types must be 73+123');
    if (r && JSON.stringify(missionTypes(r.sp?.stage2)) !== JSON.stringify([124])) e.push('stage2 mission type must be 124');
    if (r && !sortedUniqueIntegers(r.sp?.expandedHeroIds)) e.push('expandedHeroIds not sorted unique integers');
    if (r && JSON.stringify(r.sp?.expandedHeroIds ?? []) !== JSON.stringify(r.sp?.stage2?.expandHeroIds ?? [])) e.push('expandedHeroIds differs from stage2.expandHeroIds');
    if (c?.classification === 'FAIL') e.push('Stage 6-2 classified fixture as FAIL');
    addFixtureResult('SP_TWO_STAGE', e.length === 0, {
      soldierId: id ?? null,
      label: r ? label(r) : null,
      normalSoldierId: r?.sp?.normalSoldierId ?? null,
      expandedHeroCount: Array.isArray(r?.sp?.expandedHeroIds) ? r.sp.expandedHeroIds.length : null,
      classification: c?.classification ?? null,
    }, e);
  }

  // 4) ConfigDataSPHeroInfo additional Hero->Soldier relation.
  {
    const f = fixturePlan?.fixtures?.spHeroAddedRelation ?? {};
    const r = recordIndex.map.get(f.soldierId);
    const c = reviewFixtureIfNeeded('SP_HERO_ADDED_RELATION', f.soldierId);
    const edge = relationIndex.get(`${f.heroId}:${f.soldierId}`);
    const e = [];
    if (!r) e.push('record missing');
    if (!edge) e.push('shared relation edge missing');
    if (edge && !edgeHasSource(edge, 'SP_HERO_REWARD')) e.push('SP_HERO_REWARD provenance missing');
    if (r && !r.heroes?.finalHeroIds?.includes(f.heroId)) e.push('finalHeroIds missing SP_HERO_REWARD hero');
    if (c?.classification === 'FAIL') e.push('Stage 6-2 classified fixture as FAIL');
    addFixtureResult('SP_HERO_ADDED_RELATION', e.length === 0, {
      soldierId: f.soldierId ?? null,
      heroId: f.heroId ?? null,
      label: r ? label(r) : null,
      classification: c?.classification ?? null,
      provenanceKinds: edge ? [...new Set(edge.provenance.map(p=>p.sourceKind))].sort() : [],
    }, e);
  }

  // 5) SecondStageExpandHeroList relation must appear in SP detail and final Hero membership.
  {
    const f = fixturePlan?.fixtures?.secondStageExpandHero ?? {};
    const r = recordIndex.map.get(f.soldierId);
    const c = reviewFixtureIfNeeded('SECOND_STAGE_EXPAND_HERO', f.soldierId);
    const edge = relationIndex.get(`${f.heroId}:${f.soldierId}`);
    const e = [];
    if (!r) e.push('record missing');
    if (r && r.identity?.isSp !== true) e.push('expanded relation Soldier must be SP');
    if (r && r.sp?.secondStageUnlock !== true) e.push('expanded relation Soldier must have second stage unlocked');
    if (!edge) e.push('shared relation edge missing');
    if (edge && !edgeHasSource(edge, 'SP_SOLDIER_EXPAND')) e.push('SP_SOLDIER_EXPAND provenance missing');
    if (r && !r.sp?.expandedHeroIds?.includes(f.heroId)) e.push('SP expandedHeroIds missing Hero');
    if (r && !r.heroes?.finalHeroIds?.includes(f.heroId)) e.push('finalHeroIds missing expanded Hero');
    if (c?.classification === 'FAIL') e.push('Stage 6-2 classified fixture as FAIL');
    addFixtureResult('SECOND_STAGE_EXPAND_HERO', e.length === 0, {
      soldierId: f.soldierId ?? null,
      heroId: f.heroId ?? null,
      label: r ? label(r) : null,
      classification: c?.classification ?? null,
      provenanceKinds: edge ? [...new Set(edge.provenance.map(p=>p.sourceKind))].sort() : [],
    }, e);
  }

  // 6) Actual armyType and UI grouping must remain distinct concepts at a combined-group boundary.
  {
    const f = fixturePlan?.fixtures?.classUiGroupBoundary;
    const left = recordIndex.map.get(f?.left?.soldierId);
    const right = recordIndex.map.get(f?.right?.soldierId);
    const leftC = reviewFixtureIfNeeded('CLASS_UI_GROUP_BOUNDARY_LEFT', f?.left?.soldierId);
    const rightC = reviewFixtureIfNeeded('CLASS_UI_GROUP_BOUNDARY_RIGHT', f?.right?.soldierId);
    const e = [];
    if (!f) e.push('combined UI-group fixture missing');
    if (!left || !right) e.push('boundary record missing');
    if (left && left.identity?.uiGroup !== f?.uiGroup) e.push('left uiGroup mismatch');
    if (right && right.identity?.uiGroup !== f?.uiGroup) e.push('right uiGroup mismatch');
    if (left && left.identity?.armyType !== f?.left?.armyType) e.push('left armyType mismatch');
    if (right && right.identity?.armyType !== f?.right?.armyType) e.push('right armyType mismatch');
    if (left && right && left.identity?.armyType === right.identity?.armyType) e.push('boundary requires two different actual armyTypes');
    if (leftC?.classification === 'FAIL' || rightC?.classification === 'FAIL') e.push('Stage 6-2 classified a boundary fixture as FAIL');
    addFixtureResult('CLASS_UI_GROUP_BOUNDARY', e.length === 0, {
      uiGroup: f?.uiGroup ?? null,
      left: left ? { soldierId: left.soldierId, label: label(left), armyType: left.identity?.armyType ?? null, classification: leftC?.classification ?? null } : null,
      right: right ? { soldierId: right.soldierId, label: label(right), armyType: right.identity?.armyType ?? null, classification: rightC?.classification ?? null } : null,
    }, e);
  }

  const failedFixtures = fixtureResults.filter(f => f.status === 'FAIL');
  const status = errors.length ? 'FAIL' : 'PASS';
  const sources = {
    fullRecords: { path: paths.fullRecords, gitBlobSha: trackedBlobSha(paths.fullRecords) },
    fullValidation: { path: paths.fullValidation, gitBlobSha: trackedBlobSha(paths.fullValidation) },
    classification: { path: paths.classification, gitBlobSha: trackedBlobSha(paths.classification) },
    classificationValidation: { path: paths.classificationValidation, gitBlobSha: trackedBlobSha(paths.classificationValidation) },
    relationSet: { path: paths.relationSet, gitBlobSha: trackedBlobSha(paths.relationSet) },
    relationValidation: { path: paths.relationValidation, gitBlobSha: trackedBlobSha(paths.relationValidation) },
    fixturePlan: { path: paths.fixturePlan, gitBlobSha: worktreeBlobSha(paths.fixturePlan) },
  };

  const validation = {
    version: 1,
    schemaId: 'soldier-stage6-3-representative-qa/v1',
    stage: '6-3',
    status,
    generatedAt: full.generatedAt ?? null,
    purpose: 'Representative manual-style structural QA encoded as deterministic fixtures across the distinct Soldier page-data branches required before filter QA.',
    sources,
    checks: {
      upstreamNonPass: [full.status, fullValidation.status, classification.status, classificationValidation.status, relationValidation.status].filter(v => v !== 'PASS').length,
      duplicateFullRecordIds: recordIndex.duplicates.length,
      duplicateClassificationIds: classificationIndex.duplicates.length,
      fixtureCountMismatch: fixtureResults.length === 6 ? 0 : 1,
      failedFixtures: failedFixtures.length,
    },
    coverage: {
      fixtureCategories: fixtureResults.length,
      passedFixtures: fixtureResults.length - failedFixtures.length,
      failedFixtures: failedFixtures.length,
      inheritedReviewFixtureMentions: reviews.length,
      categories: fixtureResults.map(f => f.kind),
    },
    fixtures: fixtureResults,
    errors,
    reviews,
  };

  if (validation.checks.fixtureCountMismatch) {
    validation.status = 'FAIL';
    validation.errors.push(`Expected 6 representative fixture categories, got ${fixtureResults.length}`);
  }

  writeJson(paths.validation, validation);
  console.log(`Soldier Stage 6-3: ${validation.status}`);
  console.log(`Representative fixtures: ${validation.coverage.passedFixtures}/${validation.coverage.fixtureCategories} PASS`);
  for (const fixture of fixtureResults) {
    const target = fixture.soldierId ?? fixture.left?.soldierId ?? '-';
    console.log(`${fixture.kind}: ${fixture.status} (${target})`);
  }
  if (validation.errors.length) {
    for (const error of validation.errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  }
}

main();
